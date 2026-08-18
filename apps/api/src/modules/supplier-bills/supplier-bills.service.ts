import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { DeductionConfigsService } from "../deduction-configs/deduction-configs.service";
import { FinanceSettingsService } from "../settings-finance/finance-settings.service";
import { AccountingService } from "../accounting/accounting.service";
import { calculateBillTotals, isBlockingMatchStatus, matchBillItem, overallMatchStatus } from "./bill-match-calculations";
import { SaveSupplierBillDto } from "./dto/save-supplier-bill.dto";
import { QuerySupplierBillDto } from "./dto/query-supplier-bill.dto";
import { RejectSupplierBillDto } from "./dto/reject-supplier-bill.dto";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

const includeRelations = {
  supplier: { select: { id: true, code: true, name: true } },
  purchaseOrder: { select: { id: true, poNo: true, status: true } },
  cmsWork: { select: { id: true, workName: true } },
  paymentTerm: { select: { id: true, name: true, days: true } },
  payable: { select: { id: true, billNo: true, amount: true, paidAmount: true, status: true } },
  items: { include: { item: { select: { id: true, itemCode: true, itemName: true } } }, orderBy: { itemNameSnapshot: "asc" as const } },
  deductions: true,
} satisfies Prisma.SupplierBillInclude;

type SupplierBillRecord = Prisma.SupplierBillGetPayload<{ include: typeof includeRelations }>;

function toDto(record: SupplierBillRecord) {
  return {
    ...record,
    subtotal: record.subtotal.toFixed(2),
    discountAmount: record.discountAmount.toFixed(2),
    taxableBase: record.taxableBase.toFixed(2),
    vatRate: record.vatRate?.toFixed(4) ?? null,
    vatAmount: record.vatAmount.toFixed(2),
    aitRate: record.aitRate?.toFixed(4) ?? null,
    aitAmount: record.aitAmount.toFixed(2),
    otherDeductionAmount: record.otherDeductionAmount.toFixed(2),
    netPayable: record.netPayable.toFixed(2),
    items: record.items.map((item) => ({
      ...item,
      orderedQty: item.orderedQty.toFixed(3),
      acceptedQty: item.acceptedQty.toFixed(3),
      previouslyBilledQty: item.previouslyBilledQty.toFixed(3),
      currentBilledQty: item.currentBilledQty.toFixed(3),
      remainingBillableQty: item.remainingBillableQty.toFixed(3),
      poRate: item.poRate.toFixed(2),
      invoiceRate: item.invoiceRate.toFixed(2),
      discountAmount: item.discountAmount.toFixed(2),
      lineAmount: item.lineAmount.toFixed(2),
    })),
    deductions: record.deductions.map((deduction) => ({
      ...deduction,
      rate: deduction.rate.toFixed(4),
      base: deduction.base.toFixed(2),
      amount: deduction.amount.toFixed(2),
    })),
  };
}

@Injectable()
export class SupplierBillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly lifecycle: ProjectLifecycleGuardService,
    private readonly deductionConfigs: DeductionConfigsService,
    private readonly financeSettings: FinanceSettingsService,
    private readonly accounting: AccountingService,
  ) {}

  private where(organizationId: string, query: QuerySupplierBillDto): Prisma.SupplierBillWhereInput {
    return {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.matchStatus ? { matchStatus: query.matchStatus } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.purchaseOrderId ? { purchaseOrderId: query.purchaseOrderId } : {}),
      ...(query.cmsWorkId ? { cmsWorkId: query.cmsWorkId } : {}),
      ...(query.search ? { OR: [{ billNo: { contains: query.search, mode: "insensitive" } }, { supplierInvoiceNo: { contains: query.search, mode: "insensitive" } }] } : {}),
    };
  }

  async findAll(organizationId: string, query: QuerySupplierBillDto): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = this.where(organizationId, query);

    const [items, total] = await Promise.all([
      this.prisma.supplierBill.findMany({ where, include: includeRelations, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.supplierBill.count({ where }),
    ]);

    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string) {
    const [total, approvalPending, blocked, outstanding] = await Promise.all([
      this.prisma.supplierBill.count({ where: { organizationId } }),
      this.prisma.supplierBill.count({ where: { organizationId, status: "APPROVAL_PENDING" } }),
      this.prisma.supplierBill.count({ where: { organizationId, matchStatus: { in: ["BLOCKED", "MISSING_RECEIPT"] }, status: { in: ["DRAFT", "APPROVAL_PENDING"] } } }),
      this.prisma.supplierBill.aggregate({ where: { organizationId, status: { in: ["APPROVED", "PARTIALLY_PAID"] } }, _sum: { netPayable: true } }),
    ]);
    const paidAgg = await this.prisma.supplierBill.findMany({ where: { organizationId, status: { in: ["APPROVED", "PARTIALLY_PAID"] } }, include: { payable: { select: { paidAmount: true } } } });
    const totalOutstanding = paidAgg.reduce((sum, bill) => sum.add(bill.netPayable).sub(bill.payable?.paidAmount ?? 0), D(0));
    return { total, approvalPending, blocked, outstanding: totalOutstanding.toFixed(2), grossApproved: D(outstanding._sum.netPayable ?? 0).toFixed(2) };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.supplierBill.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("Supplier Bill not found");
    return toDto(record);
  }

  /** Per-PO-line billable position, computed fresh from the PO, every accepted GRN quantity and
   * the running billedQty. The bill form reads its ceilings from here rather than deriving them
   * client-side, so what the user sees is the same figure approve() will enforce. */
  async billableLines(organizationId: string, purchaseOrderId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, organizationId },
      include: { supplier: { select: { id: true, code: true, name: true } }, cmsWork: { select: { id: true, workName: true } }, items: { orderBy: { itemNameSnapshot: "asc" } } },
    });
    if (!po) throw new NotFoundException("Purchase Order not found");

    const poItemIds = po.items.map((item) => item.id);
    const acceptedRows = poItemIds.length
      ? await this.prisma.grnItem.groupBy({ by: ["purchaseOrderItemId"], where: { organizationId, purchaseOrderItemId: { in: poItemIds } }, _sum: { acceptedQty: true } })
      : [];
    const acceptedByPoItem = new Map(acceptedRows.map((row) => [row.purchaseOrderItemId, row._sum.acceptedQty ?? D(0)]));

    return {
      purchaseOrder: { id: po.id, poNo: po.poNo, status: po.status, currency: po.currency },
      supplier: po.supplier,
      cmsWork: po.cmsWork,
      items: po.items.map((item) => {
        const accepted = acceptedByPoItem.get(item.id) ?? D(0);
        const remainingBillable = Prisma.Decimal.max(0, accepted.sub(item.billedQty));
        return {
          purchaseOrderItemId: item.id,
          itemId: item.itemId,
          itemCodeSnapshot: item.itemCodeSnapshot,
          itemNameSnapshot: item.itemNameSnapshot,
          descriptionSnapshot: item.descriptionSnapshot,
          unitSnapshot: item.unitSnapshot,
          orderedQty: item.orderedQty.toFixed(3),
          receivedQty: item.receivedQty.toFixed(3),
          acceptedQty: accepted.toFixed(3),
          previouslyBilledQty: item.billedQty.toFixed(3),
          remainingBillableQty: remainingBillable.toFixed(3),
          poRate: item.unitRate.toFixed(2),
        };
      }),
    };
  }

  private async assertSupplierAndPo(organizationId: string, supplierId: string, purchaseOrderId: string) {
    const [supplier, po] = await Promise.all([
      this.prisma.party.findFirst({ where: { id: supplierId, organizationId } }),
      this.prisma.purchaseOrder.findFirst({ where: { id: purchaseOrderId, organizationId } }),
    ]);
    if (!supplier) throw new NotFoundException("Supplier not found in this organization");
    if (!po) throw new NotFoundException("Purchase Order not found in this organization");
    // Same-tenant is not enough — the PO must actually belong to this supplier.
    if (po.supplierId !== supplierId) throw new BadRequestException("This Purchase Order does not belong to the selected supplier");
    return { supplier, po };
  }

  private async rateTolerance(organizationId: string): Promise<Prisma.Decimal> {
    const settings = await this.financeSettings.get(organizationId);
    return D(settings.billRateTolerancePct ?? 0);
  }

  /** Builds every SupplierBillItem line + the bill-level totals from scratch — shared by
   * create() and update(). Never trusts a client-supplied lineAmount/total. */
  private async buildMatchedLines(organizationId: string, purchaseOrderId: string, dto: SaveSupplierBillDto) {
    const poItemIds = [...new Set(dto.items.map((item) => item.purchaseOrderItemId))];
    const poItems = await this.prisma.purchaseOrderItem.findMany({ where: { id: { in: poItemIds }, organizationId, purchaseOrderId }, include: { item: true } });
    const poItemsById = new Map(poItems.map((item) => [item.id, item]));
    for (const item of dto.items) if (!poItemsById.has(item.purchaseOrderItemId)) throw new BadRequestException("One or more bill items reference a line that does not belong to the selected Purchase Order");

    const acceptedRows = await this.prisma.grnItem.groupBy({ by: ["purchaseOrderItemId"], where: { organizationId, purchaseOrderItemId: { in: poItemIds } }, _sum: { acceptedQty: true } });
    const acceptedByPoItem = new Map(acceptedRows.map((row) => [row.purchaseOrderItemId, row._sum.acceptedQty ?? D(0)]));

    const tolerance = await this.rateTolerance(organizationId);

    const lines = dto.items.map((input) => {
      const poItem = poItemsById.get(input.purchaseOrderItemId)!;
      const accepted = acceptedByPoItem.get(input.purchaseOrderItemId) ?? D(0);
      const match = matchBillItem({
        itemName: poItem.itemNameSnapshot,
        unit: poItem.unitSnapshot,
        orderedQty: poItem.orderedQty,
        acceptedQty: accepted,
        previouslyBilledQty: poItem.billedQty,
        currentBilledQty: input.currentBilledQty,
        poRate: poItem.unitRate,
        invoiceRate: input.invoiceRate,
        discountAmount: input.discountAmount ?? 0,
        rateTolerancePct: tolerance,
      });
      return { input, poItem, accepted, match };
    });

    const vatConfig = await this.deductionConfigs.effectiveConfig(organizationId, "VAT", new Date(dto.supplierInvoiceDate));
    const aitConfig = await this.deductionConfigs.effectiveConfig(organizationId, "AIT", new Date(dto.supplierInvoiceDate));
    const otherDeductionAmount = (dto.otherDeductions ?? []).reduce((sum, deduction) => sum.add(deduction.amount), D(0));
    const totals = calculateBillTotals(
      lines.map((line) => ({ grossAmount: line.match.grossAmount, discountAmount: line.match.discountAmount })),
      vatConfig?.rate ?? 0,
      aitConfig?.rate ?? 0,
      otherDeductionAmount,
    );
    const overall = overallMatchStatus(lines.map((line) => line.match.matchStatus));

    return { lines, totals, vatConfig, aitConfig, overall, otherDeductionAmount };
  }

  async create(organizationId: string, userId: string, dto: SaveSupplierBillDto) {
    const { po } = await this.assertSupplierAndPo(organizationId, dto.supplierId, dto.purchaseOrderId);
    if (po.status === "DRAFT" || po.status === "CANCELLED") throw new BadRequestException("A Supplier Bill can only be raised against an Issued (or later) Purchase Order");
    if (po.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, po.cmsWorkId, "creating a supplier bill");

    const clash = await this.prisma.supplierBill.findFirst({ where: { organizationId, supplierId: dto.supplierId, supplierInvoiceNo: dto.supplierInvoiceNo } });
    if (clash) throw new BadRequestException(`Invoice "${dto.supplierInvoiceNo}" has already been entered for this supplier (${clash.billNo})`);

    const { lines, totals, vatConfig, aitConfig, overall, otherDeductionAmount } = await this.buildMatchedLines(organizationId, dto.purchaseOrderId, dto);

    let billNo = dto.billNo?.trim();
    if (billNo) {
      const numberClash = await this.prisma.supplierBill.findFirst({ where: { organizationId, billNo } });
      if (numberClash) throw new BadRequestException(`Bill number "${billNo}" is already in use`);
    } else {
      billNo = await this.numbering.next(organizationId, "SUPPLIER_BILL");
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : undefined;

    const record = await this.prisma.$transaction(async (tx) => {
      const bill = await tx.supplierBill.create({
        data: {
          organizationId,
          billNo: billNo!,
          supplierInvoiceNo: dto.supplierInvoiceNo,
          supplierInvoiceDate: new Date(dto.supplierInvoiceDate),
          supplierId: dto.supplierId,
          purchaseOrderId: dto.purchaseOrderId,
          cmsWorkId: po.cmsWorkId,
          paymentTermId: dto.paymentTermId,
          dueDate,
          remarks: dto.remarks,
          status: "DRAFT",
          matchStatus: overall,
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxableBase: totals.taxableBase,
          vatRate: vatConfig?.rate,
          vatAmount: totals.vatAmount,
          aitRate: aitConfig?.rate,
          aitAmount: totals.aitAmount,
          otherDeductionAmount: totals.otherDeductionAmount,
          netPayable: totals.netPayable,
          createdById: userId,
        },
      });
      await tx.supplierBillItem.createMany({
        data: lines.map(({ input, poItem, accepted, match }) => ({
          organizationId,
          supplierBillId: bill.id,
          purchaseOrderItemId: poItem.id,
          itemId: poItem.itemId,
          itemCodeSnapshot: poItem.itemCodeSnapshot,
          itemNameSnapshot: poItem.itemNameSnapshot,
          descriptionSnapshot: poItem.descriptionSnapshot,
          unitSnapshot: poItem.unitSnapshot,
          orderedQty: poItem.orderedQty,
          acceptedQty: accepted,
          previouslyBilledQty: poItem.billedQty,
          currentBilledQty: input.currentBilledQty,
          remainingBillableQty: match.remainingBillableQty,
          poRate: poItem.unitRate,
          invoiceRate: input.invoiceRate,
          discountAmount: match.discountAmount,
          lineAmount: match.lineAmount,
          matchStatus: match.matchStatus,
          remarks: input.remarks,
        })),
      });
      const deductionRows: Prisma.SupplierBillDeductionCreateManyInput[] = [];
      if (vatConfig && totals.vatAmount.gt(0)) deductionRows.push({ organizationId, supplierBillId: bill.id, type: "VAT", code: vatConfig.id, rate: vatConfig.rate, base: totals.taxableBase, amount: totals.vatAmount });
      if (aitConfig && totals.aitAmount.gt(0)) deductionRows.push({ organizationId, supplierBillId: bill.id, type: "AIT", code: aitConfig.id, rate: aitConfig.rate, base: totals.taxableBase, amount: totals.aitAmount });
      for (const other of dto.otherDeductions ?? []) {
        deductionRows.push({ organizationId, supplierBillId: bill.id, type: other.type, code: other.code, rate: 0, base: totals.taxableBase, amount: other.amount, remarks: other.remarks });
      }
      if (deductionRows.length) await tx.supplierBillDeduction.createMany({ data: deductionRows });
      return tx.supplierBill.findFirstOrThrow({ where: { id: bill.id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "SUPPLIER_BILL_CREATED", entityType: "SupplierBill", entityId: record.id, referenceNo: record.billNo, newValue: toDto(record) });
    if (otherDeductionAmount.gt(0) || vatConfig || aitConfig) {
      await this.auditLogService.record({ organizationId, userId, action: "SUPPLIER_BILL_MATCHED", entityType: "SupplierBill", entityId: record.id, referenceNo: record.billNo, description: `Match status: ${overall}` });
    }
    return toDto(record);
  }

  async update(organizationId: string, userId: string, id: string, dto: SaveSupplierBillDto) {
    const existing = await this.prisma.supplierBill.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!existing) throw new NotFoundException("Supplier Bill not found");
    if (existing.status !== "DRAFT") throw new BadRequestException("Only a Draft bill can be edited");

    if (dto.supplierInvoiceNo !== existing.supplierInvoiceNo) {
      const clash = await this.prisma.supplierBill.findFirst({ where: { organizationId, supplierId: existing.supplierId, supplierInvoiceNo: dto.supplierInvoiceNo, id: { not: id } } });
      if (clash) throw new BadRequestException(`Invoice "${dto.supplierInvoiceNo}" has already been entered for this supplier (${clash.billNo})`);
    }

    const { lines, totals, vatConfig, aitConfig, overall } = await this.buildMatchedLines(organizationId, existing.purchaseOrderId, dto);
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : existing.dueDate;

    const record = await this.prisma.$transaction(async (tx) => {
      await tx.supplierBill.update({
        where: { id, organizationId },
        data: {
          supplierInvoiceNo: dto.supplierInvoiceNo,
          supplierInvoiceDate: new Date(dto.supplierInvoiceDate),
          paymentTermId: dto.paymentTermId,
          dueDate,
          remarks: dto.remarks,
          matchStatus: overall,
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxableBase: totals.taxableBase,
          vatRate: vatConfig?.rate,
          vatAmount: totals.vatAmount,
          aitRate: aitConfig?.rate,
          aitAmount: totals.aitAmount,
          otherDeductionAmount: totals.otherDeductionAmount,
          netPayable: totals.netPayable,
        },
      });
      await tx.supplierBillItem.deleteMany({ where: { supplierBillId: id } });
      await tx.supplierBillItem.createMany({
        data: lines.map(({ input, poItem, accepted, match }) => ({
          organizationId,
          supplierBillId: id,
          purchaseOrderItemId: poItem.id,
          itemId: poItem.itemId,
          itemCodeSnapshot: poItem.itemCodeSnapshot,
          itemNameSnapshot: poItem.itemNameSnapshot,
          descriptionSnapshot: poItem.descriptionSnapshot,
          unitSnapshot: poItem.unitSnapshot,
          orderedQty: poItem.orderedQty,
          acceptedQty: accepted,
          previouslyBilledQty: poItem.billedQty,
          currentBilledQty: input.currentBilledQty,
          remainingBillableQty: match.remainingBillableQty,
          poRate: poItem.unitRate,
          invoiceRate: input.invoiceRate,
          discountAmount: match.discountAmount,
          lineAmount: match.lineAmount,
          matchStatus: match.matchStatus,
          remarks: input.remarks,
        })),
      });
      await tx.supplierBillDeduction.deleteMany({ where: { supplierBillId: id } });
      const deductionRows: Prisma.SupplierBillDeductionCreateManyInput[] = [];
      if (vatConfig && totals.vatAmount.gt(0)) deductionRows.push({ organizationId, supplierBillId: id, type: "VAT", code: vatConfig.id, rate: vatConfig.rate, base: totals.taxableBase, amount: totals.vatAmount });
      if (aitConfig && totals.aitAmount.gt(0)) deductionRows.push({ organizationId, supplierBillId: id, type: "AIT", code: aitConfig.id, rate: aitConfig.rate, base: totals.taxableBase, amount: totals.aitAmount });
      for (const other of dto.otherDeductions ?? []) {
        deductionRows.push({ organizationId, supplierBillId: id, type: other.type, code: other.code, rate: 0, base: totals.taxableBase, amount: other.amount, remarks: other.remarks });
      }
      if (deductionRows.length) await tx.supplierBillDeduction.createMany({ data: deductionRows });
      return tx.supplierBill.findFirstOrThrow({ where: { id }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "SUPPLIER_BILL_UPDATED", entityType: "SupplierBill", entityId: id, referenceNo: record.billNo, oldValue: toDto(existing), newValue: toDto(record) });
    await this.auditLogService.record({ organizationId, userId, action: "SUPPLIER_BILL_MATCHED", entityType: "SupplierBill", entityId: id, referenceNo: record.billNo, description: `Match status: ${overall}` });
    return toDto(record);
  }

  async submit(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.supplierBill.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!existing) throw new NotFoundException("Supplier Bill not found");
    if (existing.status !== "DRAFT") throw new BadRequestException("Only a Draft bill can be submitted for approval");
    if (existing.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, existing.cmsWorkId, "submitting a supplier bill");

    // Re-verify the match is still clean immediately before locking the bill for approval —
    // GRNs or other bills may have moved the ceiling since this bill was drafted.
    const poItemIds = existing.items.map((item) => item.purchaseOrderItemId);
    const poItems = await this.prisma.purchaseOrderItem.findMany({ where: { id: { in: poItemIds }, organizationId } });
    const poItemsById = new Map(poItems.map((item) => [item.id, item]));
    const acceptedRows = await this.prisma.grnItem.groupBy({ by: ["purchaseOrderItemId"], where: { organizationId, purchaseOrderItemId: { in: poItemIds } }, _sum: { acceptedQty: true } });
    const acceptedByPoItem = new Map(acceptedRows.map((row) => [row.purchaseOrderItemId, row._sum.acceptedQty ?? D(0)]));

    const rematched = existing.items.map((item) => {
      const poItem = poItemsById.get(item.purchaseOrderItemId)!;
      const accepted = acceptedByPoItem.get(item.purchaseOrderItemId) ?? D(0);
      const match = matchBillItem({
        itemName: item.itemNameSnapshot,
        unit: item.unitSnapshot,
        orderedQty: poItem.orderedQty,
        acceptedQty: accepted,
        previouslyBilledQty: poItem.billedQty,
        currentBilledQty: item.currentBilledQty,
        poRate: poItem.unitRate,
        invoiceRate: item.invoiceRate,
        discountAmount: item.discountAmount,
      });
      return { item, accepted, match };
    });
    const overall = overallMatchStatus(rematched.map((row) => row.match.matchStatus));
    if (isBlockingMatchStatus(overall)) {
      throw new BadRequestException(`This bill cannot be submitted: overall match status is ${overall}. Resolve the receipt/quantity issue before submitting.`);
    }

    const record = await this.prisma.$transaction(async (tx) => {
      for (const { item, accepted, match } of rematched) {
        await tx.supplierBillItem.update({ where: { id: item.id }, data: { acceptedQty: accepted, matchStatus: match.matchStatus, remainingBillableQty: match.remainingBillableQty } });
      }
      return tx.supplierBill.update({ where: { id, organizationId }, data: { status: "APPROVAL_PENDING", matchStatus: overall, submittedAt: new Date() }, include: includeRelations });
    });

    await this.auditLogService.record({ organizationId, userId, action: "SUPPLIER_BILL_SUBMITTED", entityType: "SupplierBill", entityId: id, referenceNo: record.billNo, newValue: { status: record.status, matchStatus: record.matchStatus } });
    return toDto(record);
  }

  /** The only method that produces accounting side effects — everything before APPROVED is
   * pure matching/review state. Idempotent (mirrors ProjectBill.certify()): a repeated approve
   * call on an already-posted bill is a no-op, guarded both by a pre-write JournalEntry lookup
   * and Serializable isolation around the shared PurchaseOrderItem.billedQty ceiling. */
  async approve(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.supplierBill.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!existing) throw new NotFoundException("Supplier Bill not found");
    if (existing.status !== "APPROVAL_PENDING") throw new BadRequestException("Only a bill pending approval can be approved");
    if (existing.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, existing.cmsWorkId, "approving a supplier bill");

    let record;
    try {
      record = await this.prisma.$transaction(
        async (tx) => {
          const alreadyPosted = await tx.journalEntry.findFirst({ where: { organizationId, sourceModule: "SUPPLIER_BILL", sourceType: "APPROVAL", sourceId: id } });
          if (alreadyPosted) return tx.supplierBill.findFirstOrThrow({ where: { id }, include: includeRelations });

          const poItemIds = existing.items.map((item) => item.purchaseOrderItemId);
          const poItems = await tx.purchaseOrderItem.findMany({ where: { id: { in: poItemIds }, organizationId } });
          const poItemsById = new Map(poItems.map((item) => [item.id, item]));
          const acceptedRows = await tx.grnItem.groupBy({ by: ["purchaseOrderItemId"], where: { organizationId, purchaseOrderItemId: { in: poItemIds } }, _sum: { acceptedQty: true } });
          const acceptedByPoItem = new Map(acceptedRows.map((row) => [row.purchaseOrderItemId, row._sum.acceptedQty ?? D(0)]));

          const rematched = existing.items.map((item) => {
            const poItem = poItemsById.get(item.purchaseOrderItemId)!;
            const accepted = acceptedByPoItem.get(item.purchaseOrderItemId) ?? D(0);
            const match = matchBillItem({
              itemName: item.itemNameSnapshot,
              unit: item.unitSnapshot,
              orderedQty: poItem.orderedQty,
              acceptedQty: accepted,
              previouslyBilledQty: poItem.billedQty,
              currentBilledQty: item.currentBilledQty,
              poRate: poItem.unitRate,
              invoiceRate: item.invoiceRate,
              discountAmount: item.discountAmount,
            });
            return { item, poItem, accepted, match };
          });
          const overall = overallMatchStatus(rematched.map((row) => row.match.matchStatus));
          if (isBlockingMatchStatus(overall)) {
            throw new BadRequestException(`This bill can no longer be approved (${overall}) — a concurrent GRN or bill changed the available quantity. Re-match before retrying.`);
          }

          for (const { item, poItem, accepted, match } of rematched) {
            await tx.supplierBillItem.update({ where: { id: item.id }, data: { acceptedQty: accepted, matchStatus: match.matchStatus, remainingBillableQty: match.remainingBillableQty } });
            await tx.purchaseOrderItem.update({ where: { id: poItem.id }, data: { billedQty: { increment: item.currentBilledQty } } });
          }

          const payable = await tx.payable.create({
            data: {
              organizationId,
              partyId: existing.supplierId,
              partyName: existing.supplier.name,
              partyType: "VENDOR",
              projectId: existing.cmsWorkId,
              billNo: existing.billNo,
              billDate: existing.supplierInvoiceDate,
              amount: existing.netPayable,
              dueDate: existing.dueDate,
              description: `Supplier Bill ${existing.billNo} (Invoice ${existing.supplierInvoiceNo})`,
              createdById: userId,
            },
          });

          const lines: Array<{ systemKey: string; projectId?: string | null; partyName: string; partyType: string; debit: Prisma.Decimal | number; credit: Prisma.Decimal | number }> = [
            { systemKey: existing.cmsWorkId ? "PROJECT_EXPENSE" : "GENERAL_EXPENSE", projectId: existing.cmsWorkId, partyName: existing.supplier.name, partyType: "VENDOR", debit: existing.taxableBase.add(existing.vatAmount), credit: 0 },
            { systemKey: "ACCOUNTS_PAYABLE", projectId: existing.cmsWorkId, partyName: existing.supplier.name, partyType: "VENDOR", debit: 0, credit: existing.netPayable },
          ];
          if (existing.aitAmount.gt(0)) lines.push({ systemKey: "AIT_PAYABLE_SUPPLIERS", partyName: existing.supplier.name, partyType: "VENDOR", debit: 0, credit: existing.aitAmount });
          if (existing.otherDeductionAmount.gt(0)) lines.push({ systemKey: "OTHER_PAYABLE_DEDUCTION", partyName: existing.supplier.name, partyType: "VENDOR", debit: 0, credit: existing.otherDeductionAmount });

          await this.accounting.post(tx, {
            organizationId,
            userId,
            journalDate: existing.supplierInvoiceDate,
            referenceNo: existing.billNo,
            description: `Supplier Bill ${existing.billNo} approved — ${existing.supplier.name}`,
            sourceModule: "SUPPLIER_BILL",
            sourceType: "APPROVAL",
            sourceId: existing.id,
            lines,
          });

          await tx.supplierBill.update({ where: { id, organizationId }, data: { status: "APPROVED", matchStatus: overall, payableId: payable.id, approvedById: userId, approvedAt: new Date() } });
          return tx.supplierBill.findFirstOrThrow({ where: { id }, include: includeRelations });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
        throw new ConflictException("Another Supplier Bill approval is competing for the same received quantity — please retry.");
      }
      throw err;
    }

    await this.auditLogService.record({ organizationId, userId, action: "SUPPLIER_BILL_APPROVED", entityType: "SupplierBill", entityId: id, referenceNo: record.billNo, newValue: { status: record.status, netPayable: record.netPayable.toFixed(2), payableId: record.payableId } });
    return toDto(record);
  }

  async reject(organizationId: string, userId: string, id: string, dto: RejectSupplierBillDto) {
    const existing = await this.prisma.supplierBill.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Supplier Bill not found");
    if (existing.status !== "APPROVAL_PENDING") throw new BadRequestException("Only a bill pending approval can be rejected");

    const record = await this.prisma.supplierBill.update({ where: { id, organizationId }, data: { status: "REJECTED", rejectedReason: dto.reason }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "SUPPLIER_BILL_REJECTED", entityType: "SupplierBill", entityId: id, referenceNo: record.billNo, description: dto.reason, newValue: { status: record.status } });
    return toDto(record);
  }

  async cancel(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.supplierBill.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Supplier Bill not found");
    if (!["DRAFT", "APPROVAL_PENDING", "REJECTED"].includes(existing.status)) {
      throw new BadRequestException(`A ${existing.status.toLowerCase()} bill cannot be cancelled — it has already produced a Payable`);
    }

    const record = await this.prisma.supplierBill.update({ where: { id, organizationId }, data: { status: "CANCELLED" }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "SUPPLIER_BILL_CANCELLED", entityType: "SupplierBill", entityId: id, referenceNo: record.billNo, newValue: { status: record.status } });
    return toDto(record);
  }
}
