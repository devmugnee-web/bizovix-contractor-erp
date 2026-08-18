import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { calculateQuotationLineAmount, calculateQuotationTotal } from "./quotation-calculations";
import { SaveSupplierQuotationDto } from "./dto/save-supplier-quotation.dto";
import { QuerySupplierQuotationDto } from "./dto/query-supplier-quotation.dto";

const includeRelations = {
  rfq: { select: { id: true, rfqNo: true, status: true } },
  supplier: { select: { id: true, code: true, name: true } },
  items: { include: { rfqItem: { select: { id: true, itemNameSnapshot: true, unitSnapshot: true, requestedQty: true } } } },
} satisfies Prisma.SupplierQuotationInclude;

type QuotationRecord = Prisma.SupplierQuotationGetPayload<{ include: typeof includeRelations }>;

function toDto(record: QuotationRecord) {
  return {
    ...record,
    totalAmount: record.totalAmount.toFixed(2),
    items: record.items.map((item) => ({
      ...item,
      offeredQty: item.offeredQty.toFixed(3),
      unitRate: item.unitRate.toFixed(2),
      discountPct: item.discountPct.toFixed(2),
      taxPct: item.taxPct.toFixed(2),
      lineAmount: item.lineAmount.toFixed(2),
      rfqItem: { ...item.rfqItem, requestedQty: item.rfqItem.requestedQty.toFixed(3) },
    })),
  };
}

@Injectable()
export class SupplierQuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly lifecycle: ProjectLifecycleGuardService,
  ) {}

  async findAll(organizationId: string, query: QuerySupplierQuotationDto) {
    const items = await this.prisma.supplierQuotation.findMany({
      where: { organizationId, ...(query.rfqId ? { rfqId: query.rfqId } : {}), ...(query.supplierId ? { supplierId: query.supplierId } : {}) },
      include: includeRelations,
      orderBy: { createdAt: "desc" },
    });
    return items.map(toDto);
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.supplierQuotation.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("Supplier Quotation not found");
    return toDto(record);
  }

  private async assertRfqAndSupplier(organizationId: string, rfqId: string, supplierId: string) {
    const rfq = await this.prisma.requestForQuotation.findFirst({ where: { id: rfqId, organizationId }, include: { suppliers: true, items: true } });
    if (!rfq) throw new NotFoundException("RFQ not found");
    if (rfq.status !== "ISSUED") throw new BadRequestException("Quotations can only be recorded against an Issued RFQ");
    if (!rfq.suppliers.some((invited) => invited.supplierId === supplierId)) throw new BadRequestException("This supplier was not invited to the selected RFQ");
    return rfq;
  }

  async create(organizationId: string, userId: string, dto: SaveSupplierQuotationDto) {
    const rfq = await this.assertRfqAndSupplier(organizationId, dto.rfqId, dto.supplierId);
    if (rfq.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, rfq.cmsWorkId, "recording a supplier quotation");

    const existingActive = await this.prisma.supplierQuotation.findFirst({ where: { organizationId, rfqId: dto.rfqId, supplierId: dto.supplierId, status: "RECEIVED" } });
    if (existingActive) throw new BadRequestException("An active quotation from this supplier already exists for this RFQ — use Revise instead of recording a new one");

    const rfqItemIds = new Set(rfq.items.map((item) => item.id));
    for (const item of dto.items) if (!rfqItemIds.has(item.rfqItemId)) throw new BadRequestException("One or more quotation items reference an RFQ item that does not belong to this RFQ");

    const lineData = dto.items.map((item) => ({ ...item, lineAmount: calculateQuotationLineAmount(item.offeredQty, item.unitRate, item.discountPct ?? 0, item.taxPct ?? 0) }));
    const totalAmount = calculateQuotationTotal(lineData.map((line) => line.lineAmount));

    const record = await this.prisma.$transaction(async (tx) => {
      const quotation = await tx.supplierQuotation.create({
        data: {
          organizationId,
          rfqId: dto.rfqId,
          supplierId: dto.supplierId,
          quotationRef: dto.quotationRef,
          quotationDate: new Date(dto.quotationDate),
          validityDate: dto.validityDate ? new Date(dto.validityDate) : null,
          currency: dto.currency ?? "BDT",
          deliveryDays: dto.deliveryDays,
          paymentTerms: dto.paymentTerms,
          warranty: dto.warranty,
          remarks: dto.remarks,
          status: "RECEIVED",
          revisionNo: 1,
          totalAmount,
          createdById: userId,
        },
      });
      await tx.supplierQuotationItem.createMany({
        data: lineData.map((line) => ({
          organizationId,
          quotationId: quotation.id,
          rfqItemId: line.rfqItemId,
          offeredQty: line.offeredQty,
          unitRate: line.unitRate,
          discountPct: line.discountPct ?? 0,
          taxPct: line.taxPct ?? 0,
          lineAmount: line.lineAmount,
          deliveryDays: line.deliveryDays,
          brandModel: line.brandModel,
          specification: line.specification,
          remarks: line.remarks,
        })),
      });
      return tx.supplierQuotation.findFirstOrThrow({ where: { id: quotation.id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "QUOTATION_RECORDED", entityType: "SupplierQuotation", entityId: record.id, referenceNo: record.quotationRef, newValue: toDto(record) });
    return toDto(record);
  }

  /** Controlled "update" — a quotation already used for comparison must never silently change,
   * so revising creates a new linked revision and marks the prior one SUPERSEDED rather than
   * mutating recorded figures in place. */
  async revise(organizationId: string, userId: string, id: string, dto: SaveSupplierQuotationDto) {
    const existing = await this.prisma.supplierQuotation.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Supplier Quotation not found");
    if (existing.status !== "RECEIVED") throw new BadRequestException("Only an active quotation can be revised");

    const rfq = await this.assertRfqAndSupplier(organizationId, existing.rfqId, existing.supplierId);
    if (rfq.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, rfq.cmsWorkId, "revising a supplier quotation");
    const rfqItemIds = new Set(rfq.items.map((item) => item.id));
    for (const item of dto.items) if (!rfqItemIds.has(item.rfqItemId)) throw new BadRequestException("One or more quotation items reference an RFQ item that does not belong to this RFQ");

    const lineData = dto.items.map((item) => ({ ...item, lineAmount: calculateQuotationLineAmount(item.offeredQty, item.unitRate, item.discountPct ?? 0, item.taxPct ?? 0) }));
    const totalAmount = calculateQuotationTotal(lineData.map((line) => line.lineAmount));

    const record = await this.prisma.$transaction(async (tx) => {
      await tx.supplierQuotation.update({ where: { id, organizationId }, data: { status: "SUPERSEDED" } });
      const revised = await tx.supplierQuotation.create({
        data: {
          organizationId,
          rfqId: existing.rfqId,
          supplierId: existing.supplierId,
          quotationRef: dto.quotationRef,
          quotationDate: new Date(dto.quotationDate),
          validityDate: dto.validityDate ? new Date(dto.validityDate) : null,
          currency: dto.currency ?? existing.currency,
          deliveryDays: dto.deliveryDays,
          paymentTerms: dto.paymentTerms,
          warranty: dto.warranty,
          remarks: dto.remarks,
          status: "RECEIVED",
          revisionNo: existing.revisionNo + 1,
          previousRevisionId: existing.id,
          totalAmount,
          createdById: userId,
        },
      });
      await tx.supplierQuotationItem.createMany({
        data: lineData.map((line) => ({
          organizationId,
          quotationId: revised.id,
          rfqItemId: line.rfqItemId,
          offeredQty: line.offeredQty,
          unitRate: line.unitRate,
          discountPct: line.discountPct ?? 0,
          taxPct: line.taxPct ?? 0,
          lineAmount: line.lineAmount,
          deliveryDays: line.deliveryDays,
          brandModel: line.brandModel,
          specification: line.specification,
          remarks: line.remarks,
        })),
      });
      return tx.supplierQuotation.findFirstOrThrow({ where: { id: revised.id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "QUOTATION_UPDATED", entityType: "SupplierQuotation", entityId: record.id, referenceNo: record.quotationRef, description: `Revision ${record.revisionNo} of ${existing.id}`, newValue: toDto(record) });
    return toDto(record);
  }

  async withdraw(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.supplierQuotation.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Supplier Quotation not found");
    if (existing.status !== "RECEIVED") throw new BadRequestException("Only an active quotation can be withdrawn");
    const selected = await this.prisma.comparativeStatementSupplier.findFirst({ where: { quotationId: id, isSelected: true } });
    if (selected) throw new BadRequestException("This quotation has been selected on an approved Comparative Statement and cannot be withdrawn");
    const rfq = await this.prisma.requestForQuotation.findFirst({ where: { id: existing.rfqId, organizationId } });
    if (rfq?.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, rfq.cmsWorkId, "withdrawing a supplier quotation");

    const record = await this.prisma.supplierQuotation.update({ where: { id, organizationId }, data: { status: "WITHDRAWN" }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "QUOTATION_UPDATED", entityType: "SupplierQuotation", entityId: id, referenceNo: record.quotationRef, description: "Withdrawn", newValue: { status: record.status } });
    return toDto(record);
  }
}
