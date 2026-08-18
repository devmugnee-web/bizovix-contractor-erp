import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import type { PaginationMeta } from "@bizovix/types";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { ApproveVariationOrderDto, SaveVariationOrderDto, VariationItemInputDto } from "./dto/save-variation-order.dto";
import { calculateCurrentContractValue, calculateVariationItemAmount, signVariationAmount } from "./variation-calculations";

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);

const includeRelations = {
  cmsWork: { select: { id: true, workName: true } },
  contract: { select: { id: true, contractNo: true, originalContractValue: true, currentContractValue: true } },
  items: { include: { boqItem: { select: { id: true, itemCode: true } } } },
} satisfies Prisma.VariationOrderInclude;

type VariationRecord = Prisma.VariationOrderGetPayload<{ include: typeof includeRelations }>;

function toDto(record: VariationRecord) {
  return {
    ...record,
    requestedAmount: record.requestedAmount.toFixed(2),
    approvedAmount: record.approvedAmount?.toFixed(2) ?? null,
    items: record.items.map((item) => ({
      ...item,
      originalQty: item.originalQty?.toFixed(3) ?? null,
      originalRate: item.originalRate?.toFixed(2) ?? null,
      revisedQty: item.revisedQty?.toFixed(3) ?? null,
      revisedRate: item.revisedRate?.toFixed(2) ?? null,
      amount: item.amount.toFixed(2),
    })),
  };
}

const EDITABLE_STATUSES = new Set(["DRAFT"]);

@Injectable()
export class VariationOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly lifecycle: ProjectLifecycleGuardService,
  ) {}

  private async assertContract(organizationId: string, contractId: string) {
    const contract = await this.prisma.projectContract.findFirst({ where: { id: contractId, organizationId } });
    if (!contract) throw new NotFoundException("Contract not found");
    return contract;
  }

  private async calculateItems(tx: Tx, organizationId: string, cmsWorkId: string, items: VariationItemInputDto[]) {
    const boqItemIds = items.filter((i) => i.boqItemId).map((i) => i.boqItemId!);
    const boqItems = boqItemIds.length
      ? await tx.boqItem.findMany({ where: { id: { in: boqItemIds }, organizationId, cmsWorkId } })
      : [];
    if (boqItems.length !== new Set(boqItemIds).size) throw new NotFoundException("One or more BOQ items were not found on this project");
    const boqById = new Map(boqItems.map((b) => [b.id, b]));

    return items.map((item) => {
      if (item.boqItemId) {
        const boqItem = boqById.get(item.boqItemId)!;
        const originalQty = boqItem.contractQty;
        const originalRate = boqItem.unitRate;
        const revisedQty = item.revisedQty !== undefined ? D(item.revisedQty) : originalQty;
        const revisedRate = item.revisedRate !== undefined ? D(item.revisedRate) : originalRate;
        const amount = calculateVariationItemAmount(originalQty, originalRate, revisedQty, revisedRate);
        return {
          boqItemId: boqItem.id,
          itemCode: boqItem.itemCode,
          description: item.description,
          unit: item.unit ?? boqItem.unit,
          originalQty,
          originalRate,
          revisedQty,
          revisedRate,
          amount,
        };
      }
      if (item.revisedQty === undefined || item.revisedRate === undefined) {
        throw new BadRequestException(`New BOQ item "${item.description}" requires both a quantity and a rate`);
      }
      const revisedQty = D(item.revisedQty);
      const revisedRate = D(item.revisedRate);
      return {
        boqItemId: null,
        itemCode: item.itemCode ?? null,
        description: item.description,
        unit: item.unit ?? "Nos",
        originalQty: null,
        originalRate: null,
        revisedQty,
        revisedRate,
        amount: calculateVariationItemAmount(null, null, revisedQty, revisedRate),
      };
    });
  }

  async findAll(organizationId: string, cmsWorkId?: string): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const where: Prisma.VariationOrderWhereInput = { organizationId, ...(cmsWorkId ? { cmsWorkId } : {}) };
    const rows = await this.prisma.variationOrder.findMany({ where, include: includeRelations, orderBy: { createdAt: "desc" } });
    return { items: rows.map(toDto), meta: buildPaginationMeta(rows.length, 1, Math.max(rows.length, 1)) };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.variationOrder.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("Variation Order not found");
    return toDto(record);
  }

  async saveDraft(organizationId: string, userId: string, id: string | null, dto: SaveVariationOrderDto) {
    const contract = await this.assertContract(organizationId, dto.contractId);
    await this.lifecycle.assertOperationalMutationAllowed(organizationId, contract.cmsWorkId, "changing variation orders");
    const existing = id ? await this.prisma.variationOrder.findFirst({ where: { id, organizationId } }) : null;
    if (id && !existing) throw new NotFoundException("Variation Order not found");
    if (existing && !EDITABLE_STATUSES.has(existing.status)) throw new BadRequestException("Only a Draft variation can be edited");

    const record = await this.prisma.$transaction(async (tx) => {
      const calculatedItems = await this.calculateItems(tx, organizationId, contract.cmsWorkId, dto.items);
      const requestedAmount = calculatedItems.reduce((sum, i) => sum.add(i.amount), D(0));
      const signedRequestedAmount = signVariationAmount(dto.variationType, requestedAmount);

      const baseData = {
        contractId: contract.id,
        variationType: dto.variationType,
        title: dto.title,
        reason: dto.reason,
        description: dto.description,
        requestDate: new Date(dto.requestDate),
        requestedAmount: signedRequestedAmount,
      };

      if (existing) {
        await tx.variationItem.deleteMany({ where: { variationOrderId: existing.id } });
        return tx.variationOrder.update({
          where: { id: existing.id },
          data: { ...baseData, items: { create: calculatedItems } },
          include: includeRelations,
        });
      }

      const variationNo = await this.numbering.next(organizationId, "VARIATION_ORDER", tx);
      return tx.variationOrder.create({
        data: {
          organizationId,
          cmsWorkId: contract.cmsWorkId,
          variationNo,
          status: "DRAFT",
          createdById: userId,
          ...baseData,
          items: { create: calculatedItems },
        },
        include: includeRelations,
      });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: existing ? "VARIATION_UPDATED" : "VARIATION_CREATED",
      entityType: "VariationOrder",
      entityId: record.id,
      referenceNo: record.variationNo,
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async submit(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.variationOrder.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Variation Order not found");
    await this.lifecycle.assertOperationalMutationAllowed(organizationId, existing.cmsWorkId, "submitting variation orders");
    if (existing.status !== "DRAFT") throw new BadRequestException("Only a Draft variation can be submitted");
    const record = await this.prisma.variationOrder.update({ where: { id }, data: { status: "SUBMITTED" }, include: includeRelations });
    await this.auditLogService.record({
      organizationId,
      userId,
      action: "VARIATION_SUBMITTED",
      entityType: "VariationOrder",
      entityId: id,
      referenceNo: record.variationNo,
    });
    return toDto(record);
  }

  async reject(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.variationOrder.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Variation Order not found");
    await this.lifecycle.assertOperationalMutationAllowed(organizationId, existing.cmsWorkId, "rejecting variation orders");
    await this.lifecycle.assertOperationalMutationAllowed(organizationId, existing.cmsWorkId, "approving variation orders");
    if (existing.status !== "SUBMITTED") throw new BadRequestException("Only a Submitted variation can be rejected");
    const record = await this.prisma.variationOrder.update({ where: { id }, data: { status: "REJECTED" }, include: includeRelations });
    await this.auditLogService.record({
      organizationId,
      userId,
      action: "VARIATION_REJECTED",
      entityType: "VariationOrder",
      entityId: id,
      referenceNo: record.variationNo,
    });
    return toDto(record);
  }

  async cancel(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.variationOrder.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Variation Order not found");
    await this.lifecycle.assertOperationalMutationAllowed(organizationId, existing.cmsWorkId, "cancelling variation orders");
    if (existing.status === "APPROVED") throw new BadRequestException("An approved variation cannot be cancelled — its BOQ/contract impact is permanent");
    const record = await this.prisma.variationOrder.update({ where: { id }, data: { status: "CANCELLED" }, include: includeRelations });
    await this.auditLogService.record({
      organizationId,
      userId,
      action: "VARIATION_UPDATED",
      entityType: "VariationOrder",
      entityId: id,
      referenceNo: record.variationNo,
      description: "Variation cancelled",
    });
    return toDto(record);
  }

  /** Atomically applies the approved BOQ qty/rate impact (preserving each item's immutable
   * original snapshot), recalculates the contract's current value from scratch (original +
   * every approved variation, never an incremental drift-prone update), and locks the
   * variation as APPROVED. */
  async approve(organizationId: string, userId: string, id: string, dto: ApproveVariationOrderDto) {
    const existing = await this.prisma.variationOrder.findFirst({
      where: { id, organizationId },
      include: { items: true, contract: true },
    });
    if (!existing) throw new NotFoundException("Variation Order not found");
    if (existing.status !== "SUBMITTED") throw new BadRequestException("Only a Submitted variation can be approved");

    const approvedAmount = existing.items.reduce((sum, item) => sum.add(item.amount), D(0));
    const signedApprovedAmount = signVariationAmount(existing.variationType, approvedAmount);
    if (dto.approvedAmount !== undefined && !D(dto.approvedAmount).eq(signedApprovedAmount)) throw new BadRequestException(`Approved amount must equal the backend-calculated item impact of ${signedApprovedAmount.toFixed(2)}`);

    const record = await this.prisma.$transaction(async (tx) => {
      for (const item of existing.items) {
        if (item.boqItemId) {
          await tx.boqItem.update({
            where: { id: item.boqItemId, organizationId },
            data: { contractQty: item.revisedQty!, unitRate: item.revisedRate!, contractAmount: item.revisedQty!.mul(item.revisedRate!) },
          });
        } else {
          await tx.boqItem.create({
            data: {
              organizationId,
              cmsWorkId: existing.cmsWorkId,
              itemCode: item.itemCode,
              description: item.description,
              unit: item.unit ?? "Nos",
              contractQty: item.revisedQty!,
              unitRate: item.revisedRate!,
              contractAmount: item.revisedQty!.mul(item.revisedRate!),
              originalQty: item.revisedQty!,
              originalRate: item.revisedRate!,
              originalAmount: item.revisedQty!.mul(item.revisedRate!),
              createdById: userId,
            },
          });
        }
      }

      await tx.variationOrder.update({
        where: { id },
        data: { status: "APPROVED", approvalDate: new Date(), approvedById: userId, approvedAmount: signedApprovedAmount },
      });

      const approvedVariations = await tx.variationOrder.findMany({
        where: { organizationId, contractId: existing.contractId, status: "APPROVED" },
        select: { approvedAmount: true },
      });
      const currentContractValue = calculateCurrentContractValue(
        existing.contract.originalContractValue,
        approvedVariations.map((v) => v.approvedAmount),
      );
      await tx.projectContract.update({ where: { id: existing.contractId }, data: { currentContractValue } });

      return tx.variationOrder.findFirst({ where: { id }, include: includeRelations });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "VARIATION_APPROVED",
      entityType: "VariationOrder",
      entityId: id,
      referenceNo: record!.variationNo,
      newValue: toDto(record!),
    });

    return toDto(record!);
  }
}
