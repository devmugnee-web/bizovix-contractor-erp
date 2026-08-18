import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { DeductionConfigsService } from "../deduction-configs/deduction-configs.service";
import { calculatePoItemLine, calculatePoTotals } from "./po-calculations";
import { SavePurchaseOrderDto } from "./dto/save-purchase-order.dto";
import { QueryPurchaseOrderDto } from "./dto/query-purchase-order.dto";

const ELIGIBLE_SUPPLIER_ROLES = ["VENDOR", "SUPPLIER", "SERVICE_PROVIDER", "OTHER"] as const;

const includeRelations = {
  supplier: { select: { id: true, code: true, name: true } },
  cmsWork: { select: { id: true, workName: true } },
  purchaseRequisition: { select: { id: true, prNo: true } },
  rfq: { select: { id: true, rfqNo: true } },
  comparativeStatement: { select: { id: true, csNo: true } },
  items: { include: { item: { select: { id: true, itemCode: true, itemName: true } } } },
} satisfies Prisma.PurchaseOrderInclude;

type PoRecord = Prisma.PurchaseOrderGetPayload<{ include: typeof includeRelations }>;

function toDto(record: PoRecord) {
  const items = record.items.map((item) => ({
    ...item,
    orderedQty: item.orderedQty.toFixed(3),
    unitRate: item.unitRate.toFixed(2),
    discountAmount: item.discountAmount.toFixed(2),
    netRate: item.netRate.toFixed(2),
    lineAmount: item.lineAmount.toFixed(2),
    receivedQty: item.receivedQty.toFixed(3),
    remainingQty: item.orderedQty.sub(item.receivedQty).toFixed(3),
  }));
  const totalOrdered = record.items.reduce((sum, item) => sum.add(item.orderedQty), new Prisma.Decimal(0));
  const totalReceived = record.items.reduce((sum, item) => sum.add(item.receivedQty), new Prisma.Decimal(0));
  const receivedPct = totalOrdered.gt(0) ? totalReceived.div(totalOrdered).mul(100).toDecimalPlaces(1).toNumber() : 0;
  return {
    ...record,
    subtotal: record.subtotal.toFixed(2),
    discountAmount: record.discountAmount.toFixed(2),
    taxAmount: record.taxAmount.toFixed(2),
    otherCharges: record.otherCharges.toFixed(2),
    grandTotal: record.grandTotal.toFixed(2),
    items,
    receivedPct,
  };
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly lifecycle: ProjectLifecycleGuardService,
    private readonly deductionConfigs: DeductionConfigsService,
  ) {}

  private where(organizationId: string, query: QueryPurchaseOrderDto): Prisma.PurchaseOrderWhereInput {
    return {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.cmsWorkId ? { cmsWorkId: query.cmsWorkId } : {}),
      ...(query.comparativeStatementId ? { comparativeStatementId: query.comparativeStatementId } : {}),
      ...(query.search ? { poNo: { contains: query.search, mode: "insensitive" } } : {}),
    };
  }

  async findAll(organizationId: string, query: QueryPurchaseOrderDto): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = this.where(organizationId, query);

    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({ where, include: includeRelations, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string) {
    const [total, awaitingDelivery, received, draft] = await Promise.all([
      this.prisma.purchaseOrder.count({ where: { organizationId } }),
      this.prisma.purchaseOrder.count({ where: { organizationId, status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] } } }),
      this.prisma.purchaseOrder.count({ where: { organizationId, status: "RECEIVED" } }),
      this.prisma.purchaseOrder.count({ where: { organizationId, status: "DRAFT" } }),
    ]);
    return { total, awaitingDelivery, received, draft };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.purchaseOrder.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("Purchase Order not found");
    return toDto(record);
  }

  private async assertSupplierEligible(organizationId: string, supplierId: string) {
    const supplier = await this.prisma.party.findFirst({ where: { id: supplierId, organizationId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    if (!supplier.roles.some((role) => ELIGIBLE_SUPPLIER_ROLES.includes(role as (typeof ELIGIBLE_SUPPLIER_ROLES)[number]))) {
      throw new BadRequestException(`"${supplier.name}" does not carry a Vendor/Supplier/Service Provider role`);
    }
    return supplier;
  }

  async create(organizationId: string, userId: string, dto: SavePurchaseOrderDto) {
    if (!dto.comparativeStatementId) {
      throw new BadRequestException("A Purchase Order must be raised from an Approved Comparative Statement with an explicitly selected supplier");
    }

    const csInclude = { suppliers: true, rfq: true } satisfies Prisma.ComparativeStatementInclude;
    let rfqId = dto.rfqId;
    let purchaseRequisitionId = dto.purchaseRequisitionId;
    let cmsWorkId = dto.cmsWorkId;

    const cs = await this.prisma.comparativeStatement.findFirst({ where: { id: dto.comparativeStatementId, organizationId }, include: csInclude });
    if (!cs) throw new NotFoundException("Comparative Statement not found");
    if (cs.status !== "APPROVED") throw new BadRequestException("Purchase Orders can only be raised from an Approved Comparative Statement");
    const selected = cs.suppliers.find((supplier) => supplier.isSelected);
    if (!selected) throw new BadRequestException("This Comparative Statement has no selected supplier");
    if (selected.supplierId !== dto.supplierId) throw new BadRequestException("The Purchase Order supplier must match the Comparative Statement's selected supplier");
    const existingPo = await this.prisma.purchaseOrder.findFirst({ where: { comparativeStatementId: dto.comparativeStatementId, organizationId, status: { not: "CANCELLED" } } });
    if (existingPo) throw new BadRequestException(`A Purchase Order (${existingPo.poNo}) already exists for this Comparative Statement`);
    const comparativeStatement = cs;
    rfqId = cs.rfqId;
    purchaseRequisitionId = purchaseRequisitionId ?? cs.rfq.purchaseRequisitionId ?? undefined;
    cmsWorkId = cmsWorkId ?? cs.cmsWorkId ?? undefined;

    const supplier = await this.assertSupplierEligible(organizationId, dto.supplierId);
    if (supplier.status !== "ACTIVE") throw new BadRequestException(`"${supplier.name}" is ${supplier.status.toLowerCase()} and cannot receive a new Purchase Order`);
    if (cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, cmsWorkId, "creating a purchase order");

    const itemMasters = await this.prisma.item.findMany({ where: { id: { in: [...new Set(dto.items.map((item) => item.itemId))] }, organizationId }, include: { uom: true } });
    const itemsById = new Map(itemMasters.map((item) => [item.id, item]));
    for (const item of dto.items) if (!itemsById.has(item.itemId)) throw new NotFoundException("One or more items were not found in this organization");

    const boqItemIds = [...new Set(dto.items.map((item) => item.boqItemId).filter((id): id is string => !!id))];
    if (boqItemIds.length) {
      const boqItems = await this.prisma.boqItem.findMany({ where: { id: { in: boqItemIds }, organizationId } });
      if (boqItems.length !== boqItemIds.length) throw new NotFoundException("One or more BOQ references were not found in this organization");
      if (cmsWorkId) for (const boqItem of boqItems) if (boqItem.cmsWorkId !== cmsWorkId) throw new BadRequestException("BOQ reference must belong to the selected project");
    }

    const lines = dto.items.map((item) => ({ input: item, line: calculatePoItemLine(item.orderedQty, item.unitRate, item.discountAmount ?? 0) }));
    const vatConfig = await this.deductionConfigs.effectiveConfig(organizationId, "VAT", new Date(dto.poDate));
    const totals = calculatePoTotals(lines.map((row) => row.line), vatConfig?.rate ?? 0, dto.otherCharges ?? 0);

    let poNo = dto.poNo?.trim();
    if (poNo) {
      const clash = await this.prisma.purchaseOrder.findFirst({ where: { organizationId, poNo } });
      if (clash) throw new BadRequestException(`PO number "${poNo}" is already in use`);
    } else {
      poNo = await this.numbering.next(organizationId, "PURCHASE_ORDER");
    }

    const record = await this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          organizationId,
          poNo: poNo!,
          poDate: new Date(dto.poDate),
          supplierId: dto.supplierId,
          cmsWorkId,
          purchaseRequisitionId,
          rfqId,
          comparativeStatementId: dto.comparativeStatementId,
          deliveryAddress: dto.deliveryAddress,
          paymentTerms: dto.paymentTerms ?? comparativeStatement?.suppliers.find((s) => s.supplierId === dto.supplierId)?.paymentTerms,
          deliveryTerms: dto.deliveryTerms,
          currency: dto.currency ?? "BDT",
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          otherCharges: dto.otherCharges ?? 0,
          grandTotal: totals.grandTotal,
          remarks: dto.remarks,
          status: "DRAFT",
          createdById: userId,
        },
      });
      await tx.purchaseOrderItem.createMany({
        data: lines.map(({ input, line }) => {
          const master = itemsById.get(input.itemId)!;
          return {
            organizationId,
            purchaseOrderId: po.id,
            itemId: input.itemId,
            itemCodeSnapshot: master.itemCode,
            itemNameSnapshot: master.itemName,
            descriptionSnapshot: master.description,
            unitSnapshot: master.uom?.code ?? "PCS",
            orderedQty: input.orderedQty,
            unitRate: input.unitRate,
            discountAmount: line.discountAmount,
            netRate: line.netRate,
            lineAmount: line.lineAmount,
            deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
            cmsWorkId: input.cmsWorkId ?? cmsWorkId,
            boqItemId: input.boqItemId,
            sourceQuotationItemId: input.sourceQuotationItemId,
            remarks: input.remarks,
          };
        }),
      });
      return tx.purchaseOrder.findFirstOrThrow({ where: { id: po.id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "PO_CREATED", entityType: "PurchaseOrder", entityId: record.id, referenceNo: record.poNo, newValue: toDto(record) });
    return toDto(record);
  }

  async update(organizationId: string, userId: string, id: string, dto: SavePurchaseOrderDto) {
    const existing = await this.prisma.purchaseOrder.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!existing) throw new NotFoundException("Purchase Order not found");
    if (existing.status !== "DRAFT") throw new BadRequestException("Only a Draft purchase order can be edited — approved/issued orders preserve their commercial terms");

    const itemMasters = await this.prisma.item.findMany({ where: { id: { in: [...new Set(dto.items.map((item) => item.itemId))] }, organizationId }, include: { uom: true } });
    const itemsById = new Map(itemMasters.map((item) => [item.id, item]));
    for (const item of dto.items) if (!itemsById.has(item.itemId)) throw new NotFoundException("One or more items were not found in this organization");

    const lines = dto.items.map((item) => ({ input: item, line: calculatePoItemLine(item.orderedQty, item.unitRate, item.discountAmount ?? 0) }));
    const vatConfig = await this.deductionConfigs.effectiveConfig(organizationId, "VAT", new Date(dto.poDate));
    const totals = calculatePoTotals(lines.map((row) => row.line), vatConfig?.rate ?? 0, dto.otherCharges ?? 0);

    const record = await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({
        where: { id, organizationId },
        data: {
          poDate: new Date(dto.poDate),
          deliveryAddress: dto.deliveryAddress,
          paymentTerms: dto.paymentTerms,
          deliveryTerms: dto.deliveryTerms,
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          otherCharges: dto.otherCharges ?? 0,
          grandTotal: totals.grandTotal,
          remarks: dto.remarks,
        },
      });
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrderItem.createMany({
        data: lines.map(({ input, line }) => {
          const master = itemsById.get(input.itemId)!;
          return {
            organizationId,
            purchaseOrderId: id,
            itemId: input.itemId,
            itemCodeSnapshot: master.itemCode,
            itemNameSnapshot: master.itemName,
            descriptionSnapshot: master.description,
            unitSnapshot: master.uom?.code ?? "PCS",
            orderedQty: input.orderedQty,
            unitRate: input.unitRate,
            discountAmount: line.discountAmount,
            netRate: line.netRate,
            lineAmount: line.lineAmount,
            deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
            cmsWorkId: input.cmsWorkId ?? existing.cmsWorkId,
            boqItemId: input.boqItemId,
            sourceQuotationItemId: input.sourceQuotationItemId,
            remarks: input.remarks,
          };
        }),
      });
      return tx.purchaseOrder.findFirstOrThrow({ where: { id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "PO_UPDATED", entityType: "PurchaseOrder", entityId: id, referenceNo: record.poNo, oldValue: toDto(existing), newValue: toDto(record) });
    return toDto(record);
  }

  async approve(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.purchaseOrder.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Purchase Order not found");
    if (existing.status !== "DRAFT") throw new BadRequestException("Only a Draft purchase order can be approved");

    const record = await this.prisma.purchaseOrder.update({ where: { id, organizationId }, data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "PO_APPROVED", entityType: "PurchaseOrder", entityId: id, referenceNo: record.poNo, newValue: { status: record.status } });
    return toDto(record);
  }

  async issue(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.purchaseOrder.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Purchase Order not found");
    if (existing.status !== "APPROVED") throw new BadRequestException("Only an Approved purchase order can be issued");

    const record = await this.prisma.purchaseOrder.update({ where: { id, organizationId }, data: { status: "ISSUED", issuedAt: new Date() }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "PO_ISSUED", entityType: "PurchaseOrder", entityId: id, referenceNo: record.poNo, newValue: { status: record.status } });
    return toDto(record);
  }

  async cancel(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.purchaseOrder.findFirst({ where: { id, organizationId }, include: { items: true } });
    if (!existing) throw new NotFoundException("Purchase Order not found");
    if (["CANCELLED", "CLOSED"].includes(existing.status)) throw new BadRequestException(`A ${existing.status.toLowerCase()} purchase order cannot be cancelled`);
    if (existing.items.some((item) => item.receivedQty.gt(0))) throw new BadRequestException("A purchase order with goods already received cannot be cancelled");

    const record = await this.prisma.purchaseOrder.update({ where: { id, organizationId }, data: { status: "CANCELLED" }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "PO_CANCELLED", entityType: "PurchaseOrder", entityId: id, referenceNo: record.poNo, newValue: { status: record.status } });
    return toDto(record);
  }

  async close(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.purchaseOrder.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Purchase Order not found");
    if (existing.status !== "RECEIVED") throw new BadRequestException("Only a fully Received purchase order can be closed");

    const record = await this.prisma.purchaseOrder.update({ where: { id, organizationId }, data: { status: "CLOSED" }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "PO_CLOSED", entityType: "PurchaseOrder", entityId: id, referenceNo: record.poNo, newValue: { status: record.status } });
    return toDto(record);
  }
}
