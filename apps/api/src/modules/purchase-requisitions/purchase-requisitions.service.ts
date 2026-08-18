import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { SavePurchaseRequisitionDto } from "./dto/save-purchase-requisition.dto";
import { QueryPurchaseRequisitionDto } from "./dto/query-purchase-requisition.dto";
import { RejectPurchaseRequisitionDto } from "./dto/reject-purchase-requisition.dto";

const includeRelations = {
  cmsWork: { select: { id: true, workName: true } },
  items: {
    include: {
      item: { select: { id: true, itemCode: true, itemName: true, status: true } },
      uom: { select: { id: true, code: true, name: true } },
      boqItem: { select: { id: true, itemCode: true, description: true } },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.PurchaseRequisitionInclude;

type PrRecord = Prisma.PurchaseRequisitionGetPayload<{ include: typeof includeRelations }>;

function toDto(record: PrRecord) {
  return {
    ...record,
    items: record.items.map((item) => ({
      ...item,
      requestedQty: item.requestedQty.toFixed(3),
      estimatedRate: item.estimatedRate?.toFixed(2) ?? null,
      estimatedAmount: item.estimatedAmount?.toFixed(2) ?? null,
    })),
  };
}

@Injectable()
export class PurchaseRequisitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly lifecycle: ProjectLifecycleGuardService,
  ) {}

  private where(organizationId: string, query: QueryPurchaseRequisitionDto): Prisma.PurchaseRequisitionWhereInput {
    return {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.cmsWorkId ? { cmsWorkId: query.cmsWorkId } : {}),
      ...(query.search ? { prNo: { contains: query.search, mode: "insensitive" } } : {}),
    };
  }

  async findAll(organizationId: string, query: QueryPurchaseRequisitionDto): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = this.where(organizationId, query);

    const [items, total] = await Promise.all([
      this.prisma.purchaseRequisition.findMany({ where, include: includeRelations, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.purchaseRequisition.count({ where }),
    ]);

    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string) {
    const [total, pendingApproval, approved, draft] = await Promise.all([
      this.prisma.purchaseRequisition.count({ where: { organizationId } }),
      this.prisma.purchaseRequisition.count({ where: { organizationId, status: "SUBMITTED" } }),
      this.prisma.purchaseRequisition.count({ where: { organizationId, status: "APPROVED" } }),
      this.prisma.purchaseRequisition.count({ where: { organizationId, status: "DRAFT" } }),
    ]);
    return { total, pendingApproval, approved, draft };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.purchaseRequisition.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("Purchase Requisition not found");
    return toDto(record);
  }

  private async assertReferences(organizationId: string, dto: SavePurchaseRequisitionDto) {
    if (dto.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, dto.cmsWorkId, "creating a purchase requisition");

    const itemIds = [...new Set(dto.items.map((item) => item.itemId))];
    const uomIds = [...new Set(dto.items.map((item) => item.uomId).filter((id): id is string => !!id))];
    const boqItemIds = [...new Set(dto.items.map((item) => item.boqItemId).filter((id): id is string => !!id))];

    const [items, uoms, boqItems] = await Promise.all([
      this.prisma.item.findMany({ where: { id: { in: itemIds }, organizationId } }),
      uomIds.length ? this.prisma.unitOfMeasurement.findMany({ where: { id: { in: uomIds }, organizationId } }) : Promise.resolve([]),
      boqItemIds.length ? this.prisma.boqItem.findMany({ where: { id: { in: boqItemIds }, organizationId } }) : Promise.resolve([]),
    ]);
    const itemsById = new Map(items.map((item) => [item.id, item]));
    for (const itemId of itemIds) if (!itemsById.has(itemId)) throw new NotFoundException("One or more requested items were not found in this organization");
    if (uomIds.length && uoms.length !== uomIds.length) throw new NotFoundException("One or more units of measurement were not found in this organization");
    if (boqItemIds.length && boqItems.length !== boqItemIds.length) throw new NotFoundException("One or more BOQ references were not found in this organization");
    if (dto.cmsWorkId) {
      for (const boqItem of boqItems) if (boqItem.cmsWorkId !== dto.cmsWorkId) throw new BadRequestException("BOQ reference must belong to the selected project");
    }
    return itemsById;
  }

  async create(organizationId: string, userId: string, dto: SavePurchaseRequisitionDto) {
    const itemsById = await this.assertReferences(organizationId, dto);

    let prNo = dto.prNo?.trim();
    if (prNo) {
      const clash = await this.prisma.purchaseRequisition.findFirst({ where: { organizationId, prNo } });
      if (clash) throw new BadRequestException(`PR number "${prNo}" is already in use`);
    } else {
      prNo = await this.numbering.next(organizationId, "PURCHASE_REQUISITION");
    }

    const record = await this.prisma.$transaction(async (tx) => {
      const pr = await tx.purchaseRequisition.create({
        data: {
          organizationId,
          prNo: prNo!,
          requestDate: new Date(dto.requestDate),
          requiredByDate: dto.requiredByDate ? new Date(dto.requiredByDate) : null,
          cmsWorkId: dto.cmsWorkId,
          department: dto.department,
          requestedById: dto.requestedById,
          priority: dto.priority ?? "MEDIUM",
          purpose: dto.purpose,
          remarks: dto.remarks,
          status: "DRAFT",
          createdById: userId,
        },
      });
      await tx.purchaseRequisitionItem.createMany({
        data: dto.items.map((item) => {
          const master = itemsById.get(item.itemId)!;
          return {
            organizationId,
            purchaseRequisitionId: pr.id,
            itemId: item.itemId,
            descriptionSnapshot: master.description ? `${master.itemName} — ${master.description}` : master.itemName,
            uomId: item.uomId ?? master.uomId,
            requestedQty: item.requestedQty,
            estimatedRate: item.estimatedRate,
            estimatedAmount: item.estimatedRate !== undefined ? item.requestedQty * item.estimatedRate : undefined,
            requiredDate: item.requiredDate ? new Date(item.requiredDate) : null,
            boqItemId: item.boqItemId,
            remarks: item.remarks,
          };
        }),
      });
      return tx.purchaseRequisition.findFirstOrThrow({ where: { id: pr.id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "PR_CREATED", entityType: "PurchaseRequisition", entityId: record.id, referenceNo: record.prNo, newValue: toDto(record) });
    return toDto(record);
  }

  async update(organizationId: string, userId: string, id: string, dto: SavePurchaseRequisitionDto) {
    const existing = await this.prisma.purchaseRequisition.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!existing) throw new NotFoundException("Purchase Requisition not found");
    if (existing.status !== "DRAFT") throw new BadRequestException("Only a Draft purchase requisition can be edited");
    const itemsById = await this.assertReferences(organizationId, dto);

    const record = await this.prisma.$transaction(async (tx) => {
      await tx.purchaseRequisition.update({
        where: { id, organizationId },
        data: {
          requestDate: new Date(dto.requestDate),
          requiredByDate: dto.requiredByDate ? new Date(dto.requiredByDate) : null,
          cmsWorkId: dto.cmsWorkId,
          department: dto.department,
          requestedById: dto.requestedById,
          priority: dto.priority ?? existing.priority,
          purpose: dto.purpose,
          remarks: dto.remarks,
        },
      });
      await tx.purchaseRequisitionItem.deleteMany({ where: { purchaseRequisitionId: id } });
      await tx.purchaseRequisitionItem.createMany({
        data: dto.items.map((item) => {
          const master = itemsById.get(item.itemId)!;
          return {
            organizationId,
            purchaseRequisitionId: id,
            itemId: item.itemId,
            descriptionSnapshot: master.description ? `${master.itemName} — ${master.description}` : master.itemName,
            uomId: item.uomId ?? master.uomId,
            requestedQty: item.requestedQty,
            estimatedRate: item.estimatedRate,
            estimatedAmount: item.estimatedRate !== undefined ? item.requestedQty * item.estimatedRate : undefined,
            requiredDate: item.requiredDate ? new Date(item.requiredDate) : null,
            boqItemId: item.boqItemId,
            remarks: item.remarks,
          };
        }),
      });
      return tx.purchaseRequisition.findFirstOrThrow({ where: { id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "PR_UPDATED", entityType: "PurchaseRequisition", entityId: id, referenceNo: record.prNo, oldValue: toDto(existing), newValue: toDto(record) });
    return toDto(record);
  }

  async submit(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.purchaseRequisition.findFirst({ where: { id, organizationId }, include: { items: true } });
    if (!existing) throw new NotFoundException("Purchase Requisition not found");
    if (existing.status !== "DRAFT") throw new BadRequestException("Only a Draft purchase requisition can be submitted");
    if (!existing.items.length) throw new BadRequestException("Add at least one item before submitting");

    const record = await this.prisma.purchaseRequisition.update({ where: { id, organizationId }, data: { status: "SUBMITTED", submittedAt: new Date() }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "PR_SUBMITTED", entityType: "PurchaseRequisition", entityId: id, referenceNo: record.prNo, newValue: { status: record.status } });
    return toDto(record);
  }

  async approve(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.purchaseRequisition.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Purchase Requisition not found");
    if (existing.status !== "SUBMITTED") throw new BadRequestException("Only a Submitted purchase requisition can be approved");

    const record = await this.prisma.purchaseRequisition.update({ where: { id, organizationId }, data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "PR_APPROVED", entityType: "PurchaseRequisition", entityId: id, referenceNo: record.prNo, newValue: { status: record.status } });
    return toDto(record);
  }

  async reject(organizationId: string, userId: string, id: string, dto: RejectPurchaseRequisitionDto) {
    const existing = await this.prisma.purchaseRequisition.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Purchase Requisition not found");
    if (existing.status !== "SUBMITTED") throw new BadRequestException("Only a Submitted purchase requisition can be rejected");

    const record = await this.prisma.purchaseRequisition.update({ where: { id, organizationId }, data: { status: "REJECTED", rejectedReason: dto.reason }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "PR_REJECTED", entityType: "PurchaseRequisition", entityId: id, referenceNo: record.prNo, description: dto.reason, newValue: { status: record.status } });
    return toDto(record);
  }

  async cancel(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.purchaseRequisition.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Purchase Requisition not found");
    if (existing.status === "CONVERTED" || existing.status === "CANCELLED") throw new BadRequestException(`A ${existing.status.toLowerCase()} purchase requisition cannot be cancelled`);

    const record = await this.prisma.purchaseRequisition.update({ where: { id, organizationId }, data: { status: "CANCELLED" }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "PR_CANCELLED", entityType: "PurchaseRequisition", entityId: id, referenceNo: record.prNo, newValue: { status: record.status } });
    return toDto(record);
  }

  /** Called by RFQ creation — marks the source PR CONVERTED the first time an RFQ is raised
   * against it. Internal (not exposed as its own endpoint): conversion is a side effect of
   * raising an RFQ, not a standalone user action. */
  async markConverted(organizationId: string, id: string, tx: Prisma.TransactionClient) {
    await tx.purchaseRequisition.update({ where: { id, organizationId }, data: { status: "CONVERTED" } });
  }
}
