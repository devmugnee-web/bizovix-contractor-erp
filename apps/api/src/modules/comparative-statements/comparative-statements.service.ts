import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { RfqsService } from "../rfqs/rfqs.service";
import { calculateEvaluatedTotal, isLowestEvaluatedTotal, rankByEvaluatedTotal } from "./cs-calculations";
import { CsSupplierEvaluationInputDto, SaveComparativeStatementDto } from "./dto/save-comparative-statement.dto";
import { SelectSupplierDto } from "./dto/select-supplier.dto";

const includeRelations = {
  rfq: { select: { id: true, rfqNo: true, status: true } },
  cmsWork: { select: { id: true, workName: true } },
  suppliers: {
    include: { supplier: { select: { id: true, code: true, name: true } }, quotation: { select: { id: true, quotationRef: true, revisionNo: true } } },
    orderBy: { rank: "asc" },
  },
} satisfies Prisma.ComparativeStatementInclude;

type CsRecord = Prisma.ComparativeStatementGetPayload<{ include: typeof includeRelations }>;

function toDto(record: CsRecord) {
  return {
    ...record,
    suppliers: record.suppliers.map((supplier) => ({
      ...supplier,
      quotedTotal: supplier.quotedTotal.toFixed(2),
      commercialAdjustment: supplier.commercialAdjustment.toFixed(2),
      evaluatedTotal: supplier.evaluatedTotal.toFixed(2),
    })),
  };
}

@Injectable()
export class ComparativeStatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly rfqs: RfqsService,
  ) {}

  async findAll(organizationId: string) {
    const items = await this.prisma.comparativeStatement.findMany({ where: { organizationId }, include: includeRelations, orderBy: { createdAt: "desc" } });
    return items.map(toDto);
  }

  async stats(organizationId: string) {
    const [total, draft, approved] = await Promise.all([
      this.prisma.comparativeStatement.count({ where: { organizationId } }),
      this.prisma.comparativeStatement.count({ where: { organizationId, status: { in: ["DRAFT", "EVALUATED"] } } }),
      this.prisma.comparativeStatement.count({ where: { organizationId, status: "APPROVED" } }),
    ]);
    return { total, pendingEvaluation: draft, approved };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.comparativeStatement.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("Comparative Statement not found");
    return toDto(record);
  }

  /** Per-RFQ-item supplier comparison, computed at read time from RfqItem + SupplierQuotationItem
   * — never persisted, so it can never drift from the underlying quotations. */
  async itemComparison(organizationId: string, id: string) {
    const cs = await this.prisma.comparativeStatement.findFirst({ where: { id, organizationId }, include: { suppliers: { include: { supplier: true, quotation: true } } } });
    if (!cs) throw new NotFoundException("Comparative Statement not found");

    const rfqItems = await this.prisma.rfqItem.findMany({ where: { rfqId: cs.rfqId, organizationId }, orderBy: { createdAt: "asc" } });
    const quotationIds = cs.suppliers.map((supplier) => supplier.quotationId);
    const quotationItems = await this.prisma.supplierQuotationItem.findMany({ where: { quotationId: { in: quotationIds }, organizationId } });

    return rfqItems.map((rfqItem) => {
      const offers = cs.suppliers
        .map((csSupplier) => {
          const line = quotationItems.find((item) => item.quotationId === csSupplier.quotationId && item.rfqItemId === rfqItem.id);
          if (!line) return null;
          return {
            supplierId: csSupplier.supplierId,
            supplierName: csSupplier.supplier.name,
            offeredQty: line.offeredQty.toFixed(3),
            unitRate: line.unitRate.toFixed(2),
            discountPct: line.discountPct.toFixed(2),
            lineAmount: line.lineAmount.toFixed(2),
            deliveryDays: line.deliveryDays,
          };
        })
        .filter((offer): offer is NonNullable<typeof offer> => offer !== null);
      const lowestAmount = offers.length ? Math.min(...offers.map((offer) => Number(offer.lineAmount))) : null;
      return {
        rfqItemId: rfqItem.id,
        itemName: rfqItem.itemNameSnapshot,
        unit: rfqItem.unitSnapshot,
        requestedQty: rfqItem.requestedQty.toFixed(3),
        offers: offers.map((offer) => ({ ...offer, isLowest: lowestAmount !== null && Number(offer.lineAmount) === lowestAmount })),
      };
    });
  }

  async create(organizationId: string, userId: string, dto: SaveComparativeStatementDto) {
    const rfq = await this.prisma.requestForQuotation.findFirst({ where: { id: dto.rfqId, organizationId } });
    if (!rfq) throw new NotFoundException("RFQ not found");
    if (!["ISSUED", "CLOSED"].includes(rfq.status)) throw new BadRequestException("A Comparative Statement can only be built for an Issued or Closed RFQ");

    const existing = await this.prisma.comparativeStatement.findFirst({ where: { rfqId: dto.rfqId, organizationId } });
    if (existing) throw new BadRequestException(`A Comparative Statement (${existing.csNo}) already exists for this RFQ`);

    const activeQuotations = await this.prisma.supplierQuotation.findMany({ where: { organizationId, rfqId: dto.rfqId, status: "RECEIVED" } });
    if (!activeQuotations.length) throw new BadRequestException("No active supplier quotations exist for this RFQ yet");
    const quotationBySupplier = new Map(activeQuotations.map((quotation) => [quotation.supplierId, quotation]));

    const evaluationInputs: CsSupplierEvaluationInputDto[] = dto.suppliers ?? activeQuotations.map((quotation) => ({ supplierId: quotation.supplierId }));
    for (const input of evaluationInputs) if (!quotationBySupplier.has(input.supplierId)) throw new BadRequestException("One or more suppliers have no active quotation on this RFQ");

    const evaluated = evaluationInputs.map((input) => {
      const quotation = quotationBySupplier.get(input.supplierId)!;
      const evaluatedTotal = calculateEvaluatedTotal(quotation.totalAmount, input.commercialAdjustment ?? 0);
      return { input, quotation, evaluatedTotal };
    });
    const ranks = rankByEvaluatedTotal(evaluated.map((row) => ({ supplierId: row.input.supplierId, evaluatedTotal: row.evaluatedTotal })));

    let csNo = dto.csNo?.trim();
    if (csNo) {
      const clash = await this.prisma.comparativeStatement.findFirst({ where: { organizationId, csNo } });
      if (clash) throw new BadRequestException(`CS number "${csNo}" is already in use`);
    } else {
      csNo = await this.numbering.next(organizationId, "COMPARATIVE_STATEMENT");
    }

    const record = await this.prisma.$transaction(async (tx) => {
      const cs = await tx.comparativeStatement.create({
        data: { organizationId, rfqId: dto.rfqId, cmsWorkId: rfq.cmsWorkId, csNo: csNo!, status: "EVALUATED", preparedById: userId },
      });
      await tx.comparativeStatementSupplier.createMany({
        data: evaluated.map((row) => ({
          organizationId,
          comparativeStatementId: cs.id,
          supplierId: row.input.supplierId,
          quotationId: row.quotation.id,
          quotedTotal: row.quotation.totalAmount,
          commercialAdjustment: row.input.commercialAdjustment ?? 0,
          evaluatedTotal: row.evaluatedTotal,
          deliveryDays: row.quotation.deliveryDays,
          paymentTerms: row.quotation.paymentTerms,
          technicalStatus: row.input.technicalStatus ?? "COMPLIANT",
          recommended: row.input.recommended ?? false,
          rank: ranks.get(row.input.supplierId),
          remarks: row.input.remarks,
        })),
      });
      return tx.comparativeStatement.findFirstOrThrow({ where: { id: cs.id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "CS_CREATED", entityType: "ComparativeStatement", entityId: record.id, referenceNo: record.csNo, newValue: toDto(record) });
    return toDto(record);
  }

  async update(organizationId: string, userId: string, id: string, dto: SaveComparativeStatementDto) {
    const existing = await this.prisma.comparativeStatement.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!existing) throw new NotFoundException("Comparative Statement not found");
    if (existing.status === "APPROVED" || existing.status === "CANCELLED") throw new BadRequestException(`A ${existing.status.toLowerCase()} Comparative Statement cannot be edited`);

    const activeQuotations = await this.prisma.supplierQuotation.findMany({ where: { organizationId, rfqId: existing.rfqId, status: "RECEIVED" } });
    const quotationBySupplier = new Map(activeQuotations.map((quotation) => [quotation.supplierId, quotation]));
    const evaluationInputs: CsSupplierEvaluationInputDto[] = dto.suppliers ?? activeQuotations.map((quotation) => ({ supplierId: quotation.supplierId }));
    for (const input of evaluationInputs) if (!quotationBySupplier.has(input.supplierId)) throw new BadRequestException("One or more suppliers have no active quotation on this RFQ");

    const evaluated = evaluationInputs.map((input) => {
      const quotation = quotationBySupplier.get(input.supplierId)!;
      const evaluatedTotal = calculateEvaluatedTotal(quotation.totalAmount, input.commercialAdjustment ?? 0);
      return { input, quotation, evaluatedTotal };
    });
    const ranks = rankByEvaluatedTotal(evaluated.map((row) => ({ supplierId: row.input.supplierId, evaluatedTotal: row.evaluatedTotal })));

    const record = await this.prisma.$transaction(async (tx) => {
      await tx.comparativeStatementSupplier.deleteMany({ where: { comparativeStatementId: id } });
      await tx.comparativeStatementSupplier.createMany({
        data: evaluated.map((row) => ({
          organizationId,
          comparativeStatementId: id,
          supplierId: row.input.supplierId,
          quotationId: row.quotation.id,
          quotedTotal: row.quotation.totalAmount,
          commercialAdjustment: row.input.commercialAdjustment ?? 0,
          evaluatedTotal: row.evaluatedTotal,
          deliveryDays: row.quotation.deliveryDays,
          paymentTerms: row.quotation.paymentTerms,
          technicalStatus: row.input.technicalStatus ?? "COMPLIANT",
          recommended: row.input.recommended ?? false,
          rank: ranks.get(row.input.supplierId),
          remarks: row.input.remarks,
        })),
      });
      await tx.comparativeStatement.update({ where: { id, organizationId }, data: { status: "EVALUATED" } });
      return tx.comparativeStatement.findFirstOrThrow({ where: { id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "CS_UPDATED", entityType: "ComparativeStatement", entityId: id, referenceNo: record.csNo, oldValue: toDto(existing), newValue: toDto(record) });
    return toDto(record);
  }

  async selectSupplier(organizationId: string, userId: string, id: string, dto: SelectSupplierDto) {
    const existing = await this.prisma.comparativeStatement.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!existing) throw new NotFoundException("Comparative Statement not found");
    if (existing.status !== "EVALUATED") throw new BadRequestException("Only an Evaluated Comparative Statement can select a supplier");
    const target = existing.suppliers.find((supplier) => supplier.supplierId === dto.supplierId);
    if (!target) throw new NotFoundException("Supplier is not part of this Comparative Statement's evaluation");

    const lowest = isLowestEvaluatedTotal(dto.supplierId, existing.suppliers.map((supplier) => ({ supplierId: supplier.supplierId, evaluatedTotal: supplier.evaluatedTotal })));
    if (!lowest && !dto.decisionNotes?.trim()) {
      throw new BadRequestException("Selecting a supplier that is not the lowest evaluated offer requires an explicit decision note");
    }

    const record = await this.prisma.$transaction(async (tx) => {
      await tx.comparativeStatementSupplier.updateMany({ where: { comparativeStatementId: id }, data: { isSelected: false } });
      await tx.comparativeStatementSupplier.update({ where: { id: target.id }, data: { isSelected: true } });
      await tx.comparativeStatement.update({ where: { id, organizationId }, data: { decisionNotes: dto.decisionNotes } });
      return tx.comparativeStatement.findFirstOrThrow({ where: { id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "SUPPLIER_SELECTED", entityType: "ComparativeStatement", entityId: id, referenceNo: record.csNo, description: dto.decisionNotes, newValue: { selectedSupplierId: dto.supplierId, wasLowest: lowest } });
    return toDto(record);
  }

  async approve(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.comparativeStatement.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!existing) throw new NotFoundException("Comparative Statement not found");
    if (existing.status !== "EVALUATED") throw new BadRequestException("Only an Evaluated Comparative Statement can be approved");
    if (!existing.suppliers.some((supplier) => supplier.isSelected)) throw new BadRequestException("Select a supplier before approving the Comparative Statement");

    const record = await this.prisma.$transaction(async (tx) => {
      await tx.comparativeStatement.update({ where: { id, organizationId }, data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() } });
      await this.rfqs.markAwarded(organizationId, existing.rfqId, tx);
      return tx.comparativeStatement.findFirstOrThrow({ where: { id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "CS_APPROVED", entityType: "ComparativeStatement", entityId: id, referenceNo: record.csNo, newValue: { status: record.status } });
    return toDto(record);
  }

  async cancel(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.comparativeStatement.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Comparative Statement not found");
    if (existing.status === "APPROVED" || existing.status === "CANCELLED") throw new BadRequestException(`A ${existing.status.toLowerCase()} Comparative Statement cannot be cancelled`);

    const record = await this.prisma.comparativeStatement.update({ where: { id, organizationId }, data: { status: "CANCELLED" }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "CS_CANCELLED", entityType: "ComparativeStatement", entityId: id, referenceNo: record.csNo, newValue: { status: record.status } });
    return toDto(record);
  }
}
