import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { AccountingService } from "../accounting/accounting.service";
import { CashBankService } from "../cash-bank/cash-bank.service";
import { SaveSupplierPaymentDto } from "./dto/save-supplier-payment.dto";
import { QuerySupplierPaymentDto } from "./dto/query-supplier-payment.dto";
import { CancelSupplierPaymentDto } from "./dto/cancel-supplier-payment.dto";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

const SOURCE_MODULE = "SUPPLIER_PAYMENT";
const REVERSAL_MODULE = "SUPPLIER_PAYMENT_REVERSAL";

const includeRelations = {
  supplier: { select: { id: true, code: true, name: true } },
  bankAccount: { select: { id: true, accountName: true, accountType: true, bankName: true } },
  payable: {
    select: {
      id: true,
      billNo: true,
      amount: true,
      paidAmount: true,
      status: true,
      supplierBill: { select: { id: true, billNo: true, supplierInvoiceNo: true, status: true } },
    },
  },
} satisfies Prisma.SupplierPaymentInclude;

type SupplierPaymentRecord = Prisma.SupplierPaymentGetPayload<{ include: typeof includeRelations }>;

function toDto(record: SupplierPaymentRecord) {
  return {
    ...record,
    amount: record.amount.toFixed(2),
    payable: {
      ...record.payable,
      amount: record.payable.amount.toFixed(2),
      paidAmount: record.payable.paidAmount.toFixed(2),
      outstanding: record.payable.amount.sub(record.payable.paidAmount).toFixed(2),
    },
  };
}

/** A bill is only ever PAID/PARTIALLY_PAID relative to its own Payable, so both the payment and
 * the cancellation path derive the status from the same figures rather than incrementing state. */
function billStatusFor(netPayable: Prisma.Decimal, paidAmount: Prisma.Decimal): "APPROVED" | "PARTIALLY_PAID" | "PAID" {
  if (paidAmount.lte(0)) return "APPROVED";
  return paidAmount.gte(netPayable) ? "PAID" : "PARTIALLY_PAID";
}

@Injectable()
export class SupplierPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly lifecycle: ProjectLifecycleGuardService,
    private readonly accounting: AccountingService,
    private readonly cashBank: CashBankService,
  ) {}

  private where(organizationId: string, query: QuerySupplierPaymentDto): Prisma.SupplierPaymentWhereInput {
    return {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.payableId ? { payableId: query.payableId } : {}),
      ...(query.supplierBillId ? { payable: { supplierBill: { id: query.supplierBillId } } } : {}),
      ...(query.search ? { referenceNo: { contains: query.search, mode: "insensitive" } } : {}),
    };
  }

  async findAll(organizationId: string, query: QuerySupplierPaymentDto): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = this.where(organizationId, query);

    const [items, total] = await Promise.all([
      this.prisma.supplierPayment.findMany({ where, include: includeRelations, orderBy: { paymentDate: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.supplierPayment.count({ where }),
    ]);

    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.supplierPayment.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("Supplier Payment not found");
    return toDto(record);
  }

  async stats(organizationId: string) {
    const [paidAgg, activeCount] = await Promise.all([
      this.prisma.supplierPayment.aggregate({ where: { organizationId, status: "ACTIVE" }, _sum: { amount: true } }),
      this.prisma.supplierPayment.count({ where: { organizationId, status: "ACTIVE" } }),
    ]);
    const outstandingRows = await this.prisma.payable.findMany({
      where: { organizationId, supplierBill: { isNot: null } },
      select: { amount: true, paidAmount: true },
    });
    const outstanding = outstandingRows.reduce((sum, row) => sum.add(row.amount).sub(row.paidAmount), D(0));
    return {
      payments: activeCount,
      totalPaid: D(paidAgg._sum.amount ?? 0).toFixed(2),
      outstanding: outstanding.toFixed(2),
    };
  }

  /** Resolves the bill and asserts every id the caller supplied is both same-tenant AND
   * semantically related — a same-tenant bank account is fine, but a bill that is not approved,
   * or has no Payable, can never be paid. */
  private async assertPayableBill(organizationId: string, supplierBillId: string, bankAccountId: string) {
    const bill = await this.prisma.supplierBill.findFirst({
      where: { id: supplierBillId, organizationId },
      include: { supplier: { select: { id: true, name: true } }, payable: true },
    });
    if (!bill) throw new NotFoundException("Supplier Bill not found");
    if (!["APPROVED", "PARTIALLY_PAID"].includes(bill.status)) {
      throw new BadRequestException(`A ${bill.status.toLowerCase().replace(/_/g, " ")} bill cannot be paid — only an approved bill has a Payable`);
    }
    if (!bill.payableId || !bill.payable) throw new BadRequestException("This bill has no linked Payable");

    const bankAccount = await this.prisma.bankAccount.findFirst({ where: { id: bankAccountId, organizationId } });
    if (!bankAccount) throw new NotFoundException("Cash/Bank account not found in this organization");

    return { bill, payable: bill.payable, bankAccount };
  }

  async create(organizationId: string, userId: string, dto: SaveSupplierPaymentDto) {
    const { bill, payable } = await this.assertPayableBill(organizationId, dto.supplierBillId, dto.bankAccountId);
    if (bill.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, bill.cmsWorkId, "recording a supplier payment");

    const amount = D(dto.amount);
    const outstandingBefore = payable.amount.sub(payable.paidAmount);
    if (amount.gt(outstandingBefore)) {
      throw new BadRequestException(`Payment of ${amount.toFixed(2)} exceeds the outstanding payable of ${outstandingBefore.toFixed(2)}`);
    }

    const referenceNo = dto.referenceNo?.trim() || (await this.numbering.next(organizationId, "SUPPLIER_PAYMENT"));

    const record = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock on the running total: the conditional WHERE is re-evaluated after any
      // competing transaction commits, so two concurrent payments can never both consume the
      // same outstanding balance — the loser matches zero rows and is rejected.
      const expectedPaid = payable.paidAmount;
      const newPaid = expectedPaid.add(amount);
      const claimed = await tx.payable.updateMany({
        where: { id: payable.id, organizationId, paidAmount: expectedPaid },
        data: { paidAmount: newPaid, status: newPaid.gte(payable.amount) ? "PAID" : "PARTIALLY_PAID" },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("Another payment against this bill was recorded a moment ago — reload the bill and retry with the current outstanding amount.");
      }

      const payment = await tx.supplierPayment.create({
        data: {
          organizationId,
          payableId: payable.id,
          supplierId: bill.supplierId,
          bankAccountId: dto.bankAccountId,
          amount,
          paymentDate: new Date(dto.paymentDate),
          paymentMethod: dto.paymentMethod,
          referenceNo,
          remarks: dto.remarks,
          status: "ACTIVE",
          createdById: userId,
        },
      });

      await this.cashBank.post(tx, {
        organizationId,
        accountId: dto.bankAccountId,
        direction: "OUT",
        amount,
        sourceModule: SOURCE_MODULE,
        sourceType: "PAYMENT",
        sourceId: payment.id,
        referenceNo,
        description: `Payment to ${bill.supplier.name} against ${bill.billNo}`,
        transactionDate: new Date(dto.paymentDate),
        createdById: userId,
      });

      await this.accounting.post(tx, {
        organizationId,
        userId,
        journalDate: new Date(dto.paymentDate),
        referenceNo,
        description: `Supplier payment to ${bill.supplier.name} against ${bill.billNo}`,
        sourceModule: SOURCE_MODULE,
        sourceType: "PAYMENT",
        sourceId: payment.id,
        lines: [
          { systemKey: "ACCOUNTS_PAYABLE", projectId: bill.cmsWorkId, partyName: bill.supplier.name, partyType: "VENDOR", debit: amount, credit: 0 },
          { bankAccountId: dto.bankAccountId, projectId: bill.cmsWorkId, partyName: bill.supplier.name, partyType: "VENDOR", debit: 0, credit: amount },
        ],
      });

      await tx.supplierBill.update({ where: { id: bill.id, organizationId }, data: { status: billStatusFor(bill.netPayable, newPaid) } });

      return tx.supplierPayment.findFirstOrThrow({ where: { id: payment.id }, include: includeRelations });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "SUPPLIER_PAYMENT_CREATED",
      entityType: "SupplierPayment",
      entityId: record.id,
      referenceNo: record.referenceNo,
      newValue: { amount: record.amount.toFixed(2), supplierBillId: bill.id, bankAccountId: dto.bankAccountId },
    });
    return toDto(record);
  }

  /** Never edits a posted payment in place: the GL entry is reversed, the cash movement is
   * posted back IN, and the Payable/Bill running totals are restored — mirroring the Receipt and
   * Expense correction policy. Idempotent: cancelling an already-cancelled payment is a no-op. */
  async cancel(organizationId: string, userId: string, id: string, dto: CancelSupplierPaymentDto) {
    const existing = await this.prisma.supplierPayment.findFirst({
      where: { id, organizationId },
      include: { payable: { include: { supplierBill: true } }, supplier: { select: { name: true } } },
    });
    if (!existing) throw new NotFoundException("Supplier Payment not found");
    if (existing.status === "CANCELLED") return this.findOne(organizationId, id);

    const bill = existing.payable.supplierBill;
    if (bill?.cmsWorkId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, bill.cmsWorkId, "cancelling a supplier payment");

    const record = await this.prisma.$transaction(async (tx) => {
      const expectedPaid = existing.payable.paidAmount;
      const restoredPaid = expectedPaid.sub(existing.amount);
      if (restoredPaid.lt(0)) throw new BadRequestException("Cancelling this payment would drive the Payable's paid amount negative");

      const released = await tx.payable.updateMany({
        where: { id: existing.payableId, organizationId, paidAmount: expectedPaid },
        data: { paidAmount: restoredPaid, status: restoredPaid.lte(0) ? "UNPAID" : restoredPaid.gte(existing.payable.amount) ? "PAID" : "PARTIALLY_PAID" },
      });
      if (released.count !== 1) {
        throw new ConflictException("The Payable changed while this cancellation was being prepared — reload and retry.");
      }

      await this.accounting.reverseSource(tx, organizationId, userId, SOURCE_MODULE, existing.id);

      await this.cashBank.post(tx, {
        organizationId,
        accountId: existing.bankAccountId,
        direction: "IN",
        amount: existing.amount,
        sourceModule: REVERSAL_MODULE,
        sourceType: "REVERSAL",
        sourceId: existing.id,
        referenceNo: existing.referenceNo,
        description: `Reversal of supplier payment ${existing.referenceNo ?? existing.id}`,
        transactionDate: new Date(),
        createdById: userId,
      });

      if (bill) {
        await tx.supplierBill.update({ where: { id: bill.id, organizationId }, data: { status: billStatusFor(bill.netPayable, restoredPaid) } });
      }

      await tx.supplierPayment.update({
        where: { id, organizationId },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: userId, cancellationReason: dto.reason },
      });

      return tx.supplierPayment.findFirstOrThrow({ where: { id }, include: includeRelations });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "SUPPLIER_PAYMENT_CANCELLED",
      entityType: "SupplierPayment",
      entityId: id,
      referenceNo: record.referenceNo,
      description: dto.reason,
      newValue: { status: record.status },
    });
    return toDto(record);
  }
}
