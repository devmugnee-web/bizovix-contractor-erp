import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AccountingService } from "../accounting/accounting.service";
import { QuerySupplierLedgerDto } from "./dto/query-supplier-ledger.dto";
import { QueryApAgingDto } from "./dto/query-ap-aging.dto";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

/** Human labels for the journal sources that can touch AP control. Anything else that legitimately
 * hits the control account still shows up — it is simply labelled by its raw source module rather
 * than being silently dropped, so the ledger can never disagree with the control account. */
const SOURCE_LABEL: Record<string, string> = {
  SUPPLIER_BILL: "Supplier Bill",
  SUPPLIER_PAYMENT: "Supplier Payment",
  SUPPLIER_PAYMENT_REVERSAL: "Payment Reversal",
  JOURNAL_REVERSAL: "Reversal",
  PAYABLE: "Payable",
  PROJECT_EXPENSE: "Project Expense",
  GENERAL_EXPENSE: "General Expense",
};

export interface AgingBuckets {
  current: string;
  days1To30: string;
  days31To60: string;
  days61To90: string;
  days90Plus: string;
  total: string;
}

@Injectable()
export class SupplierLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  private async supplier(organizationId: string, supplierId: string) {
    const party = await this.prisma.party.findFirst({ where: { id: supplierId, organizationId }, select: { id: true, code: true, name: true } });
    if (!party) throw new NotFoundException("Supplier not found in this organization");
    return party;
  }

  /** The ledger IS the Accounts Payable control account's own lines for this supplier — it is not
   * a parallel calculation, so it reconciles to AP control by construction. Each row is then
   * enriched with the Supplier Bill / Payment that produced it for lineage. */
  async ledger(organizationId: string, query: QuerySupplierLedgerDto) {
    const party = await this.supplier(organizationId, query.supplierId);
    const apAccount = await this.prisma.ledgerAccount.findFirst({ where: { organizationId, systemKey: "ACCOUNTS_PAYABLE" }, select: { id: true } });
    if (!apAccount) {
      return {
        supplier: party,
        items: [],
        summary: { openingBalance: "0.00", totalDebit: "0.00", totalCredit: "0.00", closingBalance: "0.00", payableOutstanding: "0.00", reconciled: true },
      };
    }

    const dateFilter =
      query.dateFrom || query.dateTo
        ? { gte: query.dateFrom ? new Date(query.dateFrom) : undefined, lte: query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined }
        : undefined;

    const baseWhere: Prisma.JournalLineWhereInput = {
      accountId: apAccount.id,
      partyName: party.name,
      journalEntry: { organizationId, status: { in: ["POSTED", "REVERSED"] } },
    };

    const [lines, openingRows] = await Promise.all([
      this.prisma.journalLine.findMany({
        where: { ...baseWhere, journalEntry: { ...(baseWhere.journalEntry as Prisma.JournalEntryWhereInput), journalDate: dateFilter } },
        include: { journalEntry: true, project: { select: { id: true, workName: true } } },
        orderBy: [{ journalEntry: { journalDate: "asc" } }, { createdAt: "asc" }],
      }),
      query.dateFrom
        ? this.prisma.journalLine.findMany({
            where: { ...baseWhere, journalEntry: { ...(baseWhere.journalEntry as Prisma.JournalEntryWhereInput), journalDate: { lt: new Date(query.dateFrom) } } },
            select: { debit: true, credit: true },
          })
        : Promise.resolve([]),
    ]);

    // Credit increases what we owe, so an AP balance is presented credit-positive.
    const openingBalance = openingRows.reduce((sum, line) => sum.add(line.credit).sub(line.debit), D(0));

    const billIds = new Set<string>();
    const paymentIds = new Set<string>();
    for (const line of lines) {
      if (line.journalEntry.sourceModule === "SUPPLIER_BILL") billIds.add(line.journalEntry.sourceId);
      if (line.journalEntry.sourceModule === "SUPPLIER_PAYMENT") paymentIds.add(line.journalEntry.sourceId);
    }
    const [bills, payments] = await Promise.all([
      billIds.size
        ? this.prisma.supplierBill.findMany({
            where: { id: { in: [...billIds] }, organizationId },
            select: { id: true, billNo: true, supplierInvoiceNo: true, purchaseOrder: { select: { id: true, poNo: true } } },
          })
        : Promise.resolve([]),
      paymentIds.size
        ? this.prisma.supplierPayment.findMany({
            where: { id: { in: [...paymentIds] }, organizationId },
            select: { id: true, referenceNo: true, payable: { select: { supplierBill: { select: { id: true, billNo: true, purchaseOrder: { select: { id: true, poNo: true } } } } } } },
          })
        : Promise.resolve([]),
    ]);
    const billById = new Map(bills.map((bill) => [bill.id, bill]));
    const paymentById = new Map(payments.map((payment) => [payment.id, payment]));

    let balance = openingBalance;
    let totalDebit = D(0);
    let totalCredit = D(0);
    const items = lines.map((line) => {
      balance = balance.add(line.credit).sub(line.debit);
      totalDebit = totalDebit.add(line.debit);
      totalCredit = totalCredit.add(line.credit);
      const bill = billById.get(line.journalEntry.sourceId);
      const payment = paymentById.get(line.journalEntry.sourceId);
      const linkedBill = bill ?? payment?.payable.supplierBill ?? null;
      return {
        date: line.journalEntry.journalDate,
        journalNo: line.journalEntry.journalNo,
        referenceNo: line.journalEntry.referenceNo,
        type: SOURCE_LABEL[line.journalEntry.sourceModule] ?? line.journalEntry.sourceModule,
        description: line.description ?? line.journalEntry.description,
        debit: line.debit.toFixed(2),
        credit: line.credit.toFixed(2),
        balance: balance.toFixed(2),
        project: line.project,
        purchaseOrder: linkedBill && "purchaseOrder" in linkedBill ? linkedBill.purchaseOrder : null,
        supplierBill: linkedBill ? { id: linkedBill.id, billNo: linkedBill.billNo } : null,
        supplierPayment: payment ? { id: payment.id, referenceNo: payment.referenceNo } : null,
        reversed: line.journalEntry.status === "REVERSED",
      };
    });

    // Independent cross-check against the Payable subledger. Only meaningful for an unbounded
    // date range — a windowed ledger legitimately shows a different closing figure.
    const payableRows = await this.prisma.payable.findMany({ where: { organizationId, partyId: party.id }, select: { amount: true, paidAmount: true } });
    const payableOutstanding = payableRows.reduce((sum, row) => sum.add(row.amount).sub(row.paidAmount), D(0));
    const windowed = Boolean(query.dateFrom || query.dateTo);

    return {
      supplier: party,
      items,
      summary: {
        openingBalance: openingBalance.toFixed(2),
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
        closingBalance: balance.toFixed(2),
        payableOutstanding: payableOutstanding.toFixed(2),
        reconciled: windowed ? null : balance.eq(payableOutstanding),
      },
    };
  }

  /** AP aging straight off the Payable subledger, bucketed by how overdue each outstanding
   * balance is. Payables with no due date count as Current — they are not yet demandable. */
  async aging(organizationId: string, query: QueryApAgingDto) {
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    const payables = await this.prisma.payable.findMany({
      where: {
        organizationId,
        ...(query.supplierId ? { partyId: query.supplierId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        status: { not: "PAID" },
      },
      include: { party: { select: { id: true, code: true, name: true } }, supplierBill: { select: { id: true, billNo: true, supplierInvoiceNo: true } } },
      orderBy: { dueDate: "asc" },
    });

    const bySupplier = new Map<string, { supplierId: string | null; supplierName: string; buckets: Prisma.Decimal[]; total: Prisma.Decimal }>();
    const totals = [D(0), D(0), D(0), D(0), D(0)];

    const rows = payables
      .map((payable) => {
        const outstanding = payable.amount.sub(payable.paidAmount);
        if (outstanding.lte(0)) return null;
        const daysOverdue = payable.dueDate ? Math.floor((asOf.getTime() - payable.dueDate.getTime()) / 86_400_000) : 0;
        const bucketIndex = daysOverdue <= 0 ? 0 : daysOverdue <= 30 ? 1 : daysOverdue <= 60 ? 2 : daysOverdue <= 90 ? 3 : 4;
        totals[bucketIndex] = totals[bucketIndex]!.add(outstanding);

        const key = payable.partyId ?? `name:${payable.partyName}`;
        const entry = bySupplier.get(key) ?? { supplierId: payable.partyId, supplierName: payable.party?.name ?? payable.partyName, buckets: [D(0), D(0), D(0), D(0), D(0)], total: D(0) };
        entry.buckets[bucketIndex] = entry.buckets[bucketIndex]!.add(outstanding);
        entry.total = entry.total.add(outstanding);
        bySupplier.set(key, entry);

        return {
          payableId: payable.id,
          supplierId: payable.partyId,
          supplierName: payable.party?.name ?? payable.partyName,
          billNo: payable.billNo,
          supplierBill: payable.supplierBill,
          billDate: payable.billDate,
          dueDate: payable.dueDate,
          daysOverdue: Math.max(0, daysOverdue),
          amount: payable.amount.toFixed(2),
          paidAmount: payable.paidAmount.toFixed(2),
          outstanding: outstanding.toFixed(2),
          bucket: (["CURRENT", "1-30", "31-60", "61-90", "90+"] as const)[bucketIndex],
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const toBuckets = (buckets: Prisma.Decimal[]): AgingBuckets => ({
      current: buckets[0]!.toFixed(2),
      days1To30: buckets[1]!.toFixed(2),
      days31To60: buckets[2]!.toFixed(2),
      days61To90: buckets[3]!.toFixed(2),
      days90Plus: buckets[4]!.toFixed(2),
      total: buckets.reduce((sum, value) => sum.add(value), D(0)).toFixed(2),
    });

    return {
      asOf,
      items: rows,
      bySupplier: [...bySupplier.values()]
        .sort((a, b) => b.total.cmp(a.total))
        .map((entry) => ({ supplierId: entry.supplierId, supplierName: entry.supplierName, ...toBuckets(entry.buckets) })),
      summary: toBuckets(totals),
    };
  }

  /** AP control (GL) vs the Payable subledger — the reconciliation the finance team signs off on. */
  async reconciliation(organizationId: string) {
    const apAccount = await this.prisma.ledgerAccount.findFirst({ where: { organizationId, systemKey: "ACCOUNTS_PAYABLE" }, select: { id: true } });
    const controlLines = apAccount
      ? await this.prisma.journalLine.findMany({ where: { accountId: apAccount.id, journalEntry: { organizationId, status: "POSTED" } }, select: { debit: true, credit: true } })
      : [];
    const controlBalance = controlLines.reduce((sum, line) => sum.add(line.credit).sub(line.debit), D(0));

    const payables = await this.prisma.payable.findMany({ where: { organizationId }, select: { amount: true, paidAmount: true } });
    const subledgerBalance = payables.reduce((sum, row) => sum.add(row.amount).sub(row.paidAmount), D(0));

    return {
      controlBalance: controlBalance.toFixed(2),
      subledgerBalance: subledgerBalance.toFixed(2),
      difference: controlBalance.sub(subledgerBalance).toFixed(2),
      reconciled: controlBalance.eq(subledgerBalance),
    };
  }
}
