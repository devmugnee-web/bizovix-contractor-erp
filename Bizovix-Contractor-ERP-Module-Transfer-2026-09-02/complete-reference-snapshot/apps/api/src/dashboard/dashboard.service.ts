import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { VoucherEntryStatus, VoucherEntryType, type Prisma } from "../generated/prisma/index.js";

import { buildTrialBalance, toDayBookRecord } from "../accounting/accounting.utils.js";

import { roundMoney, sumMoney, toPaisa } from "../accounting/money.util.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PrismaService } from "../prisma/prisma.service.js";

const includedVoucherRelations = {
  warehouse: true,
  lines: true,
  inventoryItems: {
    include: {
      inventoryItem: true,
      warehouse: true,
    },
  },
} satisfies Prisma.VoucherEntryInclude;

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getDashboardMetricBadge(metricId: string) {
  if (metricId === "sales" || metricId === "purchase" || metricId === "receipt" || metricId === "payment") {
    return "Today";
  }

  if (metricId === "receivable" || metricId === "payable" || metricId === "cash" || metricId === "bank" || metricId === "mfs" || metricId === "cashAndBank") {
    return "Current Balance";
  }

  return "Updated Now";
}

const SALES_INVOICE_DOCUMENT_KINDS = new Set(["", "bill", "invoice", "sales-invoice"]);
const PURCHASE_BILL_DOCUMENT_KINDS = new Set(["", "bill", "invoice", "purchase-bill"]);

/** Dashboard turnover and ageing are invoice/bill metrics, not workflow-volume
 * metrics. Older rows used SALES/PURCHASE for every stage, so voucherType alone
 * cannot distinguish an order or fulfilment note from the final document. */
function isFinancialInvoiceOrBill(entry: { voucherType: VoucherEntryType; documentKind: string | null }) {
  const documentKind = entry.documentKind?.trim().toLowerCase() ?? "";
  if (entry.voucherType === VoucherEntryType.SALES) {
    return SALES_INVOICE_DOCUMENT_KINDS.has(documentKind);
  }
  if (entry.voucherType === VoucherEntryType.PURCHASE) {
    return PURCHASE_BILL_DOCUMENT_KINDS.has(documentKind);
  }
  return false;
}

@Injectable()
export class DashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getForCurrentUser(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        userId: currentUser.id,
        workspaceId: targetWorkspaceId,
      },
    });

    if (!membership) {
      throw new ForbiddenException("Workspace access denied");
    }

    const allEntries = await this.prisma.voucherEntry.findMany({
      where: {
        workspaceId: targetWorkspaceId,
      },
      include: includedVoucherRelations,
      // The transaction's own date is what "recent" means to the user — sorting by
      // createdAt first (when the row was entered into the system) could put a
      // just-entered but older-dated backdated voucher above a genuinely more
      // recent transaction. createdAt only breaks ties between entries that share
      // the same voucherDate (voucherDate itself carries no time-of-day signal).
      orderBy: [{ voucherDate: "desc" }, { createdAt: "desc" }],
    });
    // Dashboard balances, totals and charts remain accounting-only: those
    // calculations must continue to use posted vouchers. The recent activity
    // feed below intentionally uses every active saved transaction so workflow
    // documents such as Sale Orders are visible before they affect ledgers.
    // Ledger reports include both the reversed original and its posted mirror;
    // together they net to zero from the reversal date onward. Business-event
    // cards use only currently POSTED roots below.
    const ledgerEntries = allEntries.filter(
      (entry) => entry.status === VoucherEntryStatus.POSTED || entry.status === VoucherEntryStatus.REVERSED,
    );
    const postedEntries = allEntries.filter((entry) => entry.status === VoucherEntryStatus.POSTED);
    const [moneyAccounts, parties] = await Promise.all([
      this.prisma.account.findMany({
        where: { companyId: currentUser.companyId },
        select: {
          id: true,
          code: true,
          name: true,
          nature: true,
          parentId: true,
          bankDetails: true,
          accountGroup: { select: { code: true } },
        },
      }),
      this.prisma.party.findMany({
        where: { workspaceId: targetWorkspaceId },
        select: { id: true, ledgerAccountId: true, name: true, type: true, openingBalance: true, billMaturityDays: true },
      }),
    ]);

    // `ledgerEntries` stays unfiltered for the trial balance /
    // cash-bank-balance math below, which needs a reversal's debit/credit
    // lines present to net its original back out to zero. But a reversal is
    // bookkeeping, not a new business event — surfacing it as "today's sales"
    // or a "recent transaction" double-reports the same amount (the reversed
    // original no longer appears since its own status flipped to REVERSED,
    // but the reversal itself is still POSTED) or, once the original is later
    // deleted outright, reports an amount with nothing real behind it at all.
    //
    // reversalOfId alone isn't enough: deleting that original later sets it
    // SetNull (see schema), leaving an "orphaned" reversal that this check
    // would otherwise start counting as a fresh transaction again. The
    // voucherNumber's "-REV" suffix is assigned once at creation and never
    // changes, so it survives the parent's deletion and catches that case too.
    const isReversalArtifact = (entry: { reversalOfId: string | null; voucherNumber: string }) =>
      Boolean(entry.reversalOfId) || /-REV(-REV)*$/.test(entry.voucherNumber);
    const reportableEntries = postedEntries.filter((entry) => !isReversalArtifact(entry));
    const todayKey = getDateKey(new Date());
    const monthKey = getMonthKey(new Date());
    const todayEntries = reportableEntries.filter((entry) => getDateKey(entry.voucherDate) === todayKey);
    const monthEntries = reportableEntries.filter((entry) => getMonthKey(entry.voucherDate) === monthKey);
    const totals = {
      sales: 0,
      purchase: 0,
      receipt: 0,
      payment: 0,
    };
    const monthTotals = {
      sales: 0,
      purchase: 0,
      receipt: 0,
      payment: 0,
    };

    const pendingApprovals = new Map<string, { count: number; amount: number; label: string }>();
    const recentTransactions = allEntries
      .filter((entry) => !isReversalArtifact(entry))
      .filter(
        (entry) =>
          entry.status !== VoucherEntryStatus.REVERSED &&
          entry.status !== VoucherEntryStatus.SUPERSEDED_BY_ALTERATION,
      )
      .map(toDayBookRecord);
    const trialBalance = buildTrialBalance(ledgerEntries, moneyAccounts);

    todayEntries.forEach((entry) => {
      if (entry.voucherType === VoucherEntryType.SALES && isFinancialInvoiceOrBill(entry)) {
        totals.sales = sumMoney([totals.sales, entry.totalAmount]);
      } else if (entry.voucherType === VoucherEntryType.PURCHASE && isFinancialInvoiceOrBill(entry)) {
        totals.purchase = sumMoney([totals.purchase, entry.totalAmount]);
      } else if (entry.voucherType === VoucherEntryType.RECEIPT) {
        totals.receipt = sumMoney([totals.receipt, entry.totalAmount]);
      } else if (entry.voucherType === VoucherEntryType.PAYMENT) {
        totals.payment = sumMoney([totals.payment, entry.totalAmount]);
      }
    });

    monthEntries.forEach((entry) => {
      if (entry.voucherType === VoucherEntryType.SALES && isFinancialInvoiceOrBill(entry)) {
        monthTotals.sales = sumMoney([monthTotals.sales, entry.totalAmount]);
      } else if (entry.voucherType === VoucherEntryType.PURCHASE && isFinancialInvoiceOrBill(entry)) {
        monthTotals.purchase = sumMoney([monthTotals.purchase, entry.totalAmount]);
      } else if (entry.voucherType === VoucherEntryType.RECEIPT) {
        monthTotals.receipt = sumMoney([monthTotals.receipt, entry.totalAmount]);
      } else if (entry.voucherType === VoucherEntryType.PAYMENT) {
        monthTotals.payment = sumMoney([monthTotals.payment, entry.totalAmount]);
      }
    });

    const pendingEntries = await this.prisma.voucherEntry.findMany({
      where: {
        workspaceId: targetWorkspaceId,
        status: VoucherEntryStatus.PENDING,
      },
      select: {
        voucherType: true,
        totalAmount: true,
      },
    });

    pendingEntries.forEach((entry) => {
      const key = entry.voucherType;
      const label = entry.voucherType.toLowerCase().replaceAll("_", " ");
      const current = pendingApprovals.get(key) ?? { count: 0, amount: 0, label };
      current.count += 1;
      current.amount = sumMoney([current.amount, entry.totalAmount]);
      pendingApprovals.set(key, current);
    });

    const accountById = new Map(moneyAccounts.map((account) => [account.id, account]));
    const moneyType = (accountId: string | null, ledger: string): "CASH" | "BANK" | "MFS" | null => {
      const hasStableId = Boolean(accountId);
      const snapshotMatch = hasStableId
        ? undefined
        : moneyAccounts.find((candidate) => candidate.name.trim().toLowerCase() === ledger.trim().toLowerCase());
      const directAccount = accountId ? accountById.get(accountId) : snapshotMatch;
      let account = directAccount;
      const hierarchyCodes: string[] = [];
      const legacyHierarchyNames: string[] = [];
      while (account) {
        hierarchyCodes.push(account.code);
        if (!hasStableId) legacyHierarchyNames.push(account.name.trim().toLowerCase());
        account = account.parentId ? accountById.get(account.parentId) : undefined;
      }
      const details = directAccount?.bankDetails;
      const accountKind = details && typeof details === "object" && !Array.isArray(details) ? String((details as Record<string, unknown>).accountKind ?? "") : "";
      if (accountKind === "MFS" || hierarchyCodes.includes("1222200")) return "MFS";
      if (accountKind === "BANK" || hierarchyCodes.includes("1222100")) return "BANK";
      if (hierarchyCodes.includes("1221000")) return "CASH";
      // Read-only compatibility for pre-accountId voucher lines. Current lines
      // never receive financial identity from a coincidentally matching name.
      if (!hasStableId) {
        if (legacyHierarchyNames.some((name) => name === "mobile finance service" || name === "mobile financial service" || name === "mfs accounts" || name === "mobile financial service accounts")) return "MFS";
        if (legacyHierarchyNames.some((name) => name === "bank accounts")) return "BANK";
        if (legacyHierarchyNames.some((name) => name === "cash accounts") || ledger.trim().toLowerCase().includes("cash")) return "CASH";
      }
      return null;
    };
    const moneyBalances = ledgerEntries.flatMap((entry) => entry.lines).reduce(
      (balances, line) => {
        const type = moneyType(line.accountId, line.ledger);
        if (type) balances[type] = sumMoney([balances[type], line.debit, -Number(line.credit || 0)]);
        return balances;
      },
      { CASH: 0, BANK: 0, MFS: 0 },
    );
    const cashInHand = moneyBalances.CASH;
    const bankBalance = moneyBalances.BANK;
    const mfsBalance = moneyBalances.MFS;
    const customerLedgerIds = new Set(
      parties.filter((party) => party.type === "CUSTOMER" && party.ledgerAccountId).map((party) => party.ledgerAccountId!),
    );
    const supplierLedgerIds = new Set(
      parties.filter((party) => party.type === "SUPPLIER" && party.ledgerAccountId).map((party) => party.ledgerAccountId!),
    );
    const receivable = trialBalance
      .filter((row) => row.accountId ? customerLedgerIds.has(row.accountId) : row.group === "Sundry Debtors")
      .reduce((total, row) => sumMoney([total, row.debit, -row.credit]), 0);
    const payable = trialBalance
      .filter((row) => row.accountId ? supplierLedgerIds.has(row.accountId) : row.group === "Sundry Creditors")
      .reduce((total, row) => sumMoney([total, row.credit, -row.debit]), 0);

    const today = new Date(`${todayKey}T12:00:00`);
    const dayInMs = 86_400_000;
    const attention = parties.reduce(
      (summary, party) => {
        const isCustomer = party.type === "CUSTOMER";
        const partyKey = party.name.trim().toLowerCase();
        const matchesPartyLine = (
          entry: (typeof reportableEntries)[number],
          line: (typeof reportableEntries)[number]["lines"][number],
        ) => {
          // A known voucher party can never be reassigned by a coincidentally
          // equal display name (for example, a customer and supplier that share
          // one name).
          if (entry.partyId && entry.partyId !== party.id) return false;

          // Once both sides have durable account identities, the id comparison
          // is authoritative. Never fall back to the snapshot name around a
          // conflicting account id.
          if (line.accountId) {
            return Boolean(party.ledgerAccountId && line.accountId === party.ledgerAccountId);
          }

          // Historical voucher lines can predate accountId linkage. Keep name
          // matching only for those explicitly accountless lines; an ID-backed
          // line never receives identity from a coincidentally equal caption.
          return line.ledger.trim().toLowerCase() === partyKey;
        };
        const partyEntries = reportableEntries
          .filter((entry) => entry.lines.some((line) => matchesPartyLine(entry, line)))
          .sort((left, right) => left.voucherDate.getTime() - right.voucherDate.getTime());
        const openDocuments: Array<{ outstanding: number; dueDate: Date }> = [];
        // Party.openingBalance is setup metadata. Its ID-backed opening journal
        // is already present in partyEntries, so adding the scalar here would
        // double count a supplier/customer advance.
        let unappliedSettlement = 0;

        for (const entry of partyEntries) {
          const movement = entry.lines
            .filter((line) => matchesPartyLine(entry, line))
            .reduce((total, line) => {
              const debit = Number(line.debit || 0);
              const credit = Number(line.credit || 0);
              return sumMoney([total, isCustomer ? debit : credit, -(isCustomer ? credit : debit)]);
            }, 0);
          const isBill = isFinancialInvoiceOrBill(entry)
            && (isCustomer ? entry.voucherType === VoucherEntryType.SALES : entry.voucherType === VoucherEntryType.PURCHASE);

          if (isBill && toPaisa(movement) > 0n) {
            const appliedAdvance = Math.min(unappliedSettlement, movement);
            unappliedSettlement = roundMoney(unappliedSettlement - appliedAdvance);
            const dueDate = new Date(entry.voucherDate);
            dueDate.setDate(dueDate.getDate() + party.billMaturityDays);
            openDocuments.push({ outstanding: roundMoney(movement - appliedAdvance), dueDate });
            continue;
          }

          if (toPaisa(movement) >= 0n) continue;
          let settlement = roundMoney(-movement);
          for (const document of openDocuments) {
            if (toPaisa(settlement) <= 0n) break;
            const applied = Math.min(document.outstanding, settlement);
            document.outstanding = roundMoney(document.outstanding - applied);
            settlement = roundMoney(settlement - applied);
          }
          unappliedSettlement = sumMoney([unappliedSettlement, settlement]);
        }

        const relevantDocuments = openDocuments.filter((document) => {
          if (toPaisa(document.outstanding) <= 0n) return false;
          const daysUntilDue = Math.ceil((document.dueDate.getTime() - today.getTime()) / dayInMs);
          return isCustomer ? daysUntilDue < 0 : daysUntilDue >= 0 && daysUntilDue <= 7;
        });
        if (!relevantDocuments.length) return summary;

        const target = isCustomer ? summary.receivable : summary.payable;
        target.value = sumMoney([
          target.value,
          ...relevantDocuments.map((document) => document.outstanding),
        ]);
        target.count += 1;
        const nearestDueDate = relevantDocuments.sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())[0]?.dueDate;
        if (nearestDueDate) {
          const dueDateKey = getDateKey(nearestDueDate);
          target.nextDueDate = !target.nextDueDate || dueDateKey < target.nextDueDate ? dueDateKey : target.nextDueDate;
        }
        return summary;
      },
      { receivable: { value: 0, count: 0, nextDueDate: null as string | null }, payable: { value: 0, count: 0, nextDueDate: null as string | null } },
    );

    return {
      metrics: [
        { id: "receivable", label: "Total Receivable", value: Math.max(receivable, 0), change: getDashboardMetricBadge("receivable"), attention: { label: "Overdue", value: attention.receivable.value, count: attention.receivable.count, entityLabel: "Customers", nextDueDate: attention.receivable.nextDueDate } },
        { id: "payable", label: "Total Payable", value: Math.max(payable, 0), change: getDashboardMetricBadge("payable"), attention: { label: "Due Soon", value: attention.payable.value, count: attention.payable.count, entityLabel: "Suppliers", nextDueDate: attention.payable.nextDueDate } },
        { id: "sales", label: "Total Sales", value: totals.sales, monthValue: monthTotals.sales, change: getDashboardMetricBadge("sales") },
        { id: "purchase", label: "Total Purchase", value: totals.purchase, monthValue: monthTotals.purchase, change: getDashboardMetricBadge("purchase") },
        { id: "receipt", label: "Total Receipt", value: totals.receipt, monthValue: monthTotals.receipt, change: getDashboardMetricBadge("receipt") },
        { id: "payment", label: "Total Payment", value: totals.payment, monthValue: monthTotals.payment, change: getDashboardMetricBadge("payment") },
        { id: "cash", label: "Cash in Hand", value: cashInHand, change: getDashboardMetricBadge("cash") },
        { id: "bank", label: "Bank Balance", value: bankBalance, change: getDashboardMetricBadge("bank") },
        { id: "mfs", label: "MFS Balance", value: mfsBalance, change: getDashboardMetricBadge("mfs") },
        { id: "cashAndBank", label: "Total Cash, Bank & MFS", value: sumMoney([cashInHand, bankBalance, mfsBalance]), change: getDashboardMetricBadge("cashAndBank") },
      ],
      trend: [
        { name: "Jan", sales: 0, purchase: 0 },
        { name: "Feb", sales: 0, purchase: 0 },
        { name: "Mar", sales: 0, purchase: 0 },
        { name: "Apr", sales: 0, purchase: 0 },
        { name: "May", sales: 0, purchase: 0 },
      ],
      recentTransactions,
      quickShortcuts: [
        { combo: "Alt + G", description: "Go To / Search" },
        { combo: "Ctrl + K", description: "Command Palette" },
        { combo: "Alt + C", description: "Create New" },
        { combo: "Alt + D", description: "Toggle Entry Mode" },
        { combo: "Alt + S", description: "Save" },
        { combo: "Alt + P", description: "Print" },
        { combo: "Esc", description: "Back / Close" },
      ],
      summary: [
        { label: "Total Sales", value: totals.sales, icon: "sales" },
        { label: "Total Purchase", value: totals.purchase, icon: "purchase" },
        { label: "Total Receipt", value: totals.receipt, icon: "receipt" },
        { label: "Total Payment", value: totals.payment, icon: "payment" },
        { label: "Cash in Hand", value: cashInHand, icon: "cash" },
        { label: "Bank Balance", value: bankBalance, icon: "bank" },
        { label: "MFS Balance", value: mfsBalance, icon: "mfs" },
        { label: "Total Cash, Bank & MFS", value: sumMoney([cashInHand, bankBalance, mfsBalance]), icon: "cashAndBank" },
      ],
      approvals: Array.from(pendingApprovals.entries()).map(([key, value]) => ({
        id: `approval-${key}`,
        label: value.label.replace(/\b\w/g, (char) => char.toUpperCase()),
        count: value.count,
        amount: value.amount,
      })),
    };
  }
}
