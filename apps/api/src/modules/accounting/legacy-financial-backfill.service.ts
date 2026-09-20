import { Injectable } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { CashBankService } from "../cash-bank/cash-bank.service";
import { AccountingService } from "./accounting.service";

const VERSION = "legacy-financial-v1";
const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);
const key = (module: string, type: string, id: string) => `${module}|${type}|${id}`;

type Action =
  | { kind: "EXPENSE"; id: string; module: "PROJECT_EXPENSE" | "GENERAL_EXPENSE"; needsFinancialTransaction: boolean }
  | { kind: "RECEIPT"; id: string; needsFinancialTransaction: boolean }
  | { kind: "BILL_CERTIFICATION"; id: string }
  | { kind: "TRANSFER"; id: string }
  | { kind: "CASH_OPENING"; financialTransactionId: string };

export type LegacyBackfillPlan = {
  version: string;
  organizationId: string;
  inspected: Record<string, number>;
  classifications: Record<string, Record<string, number>>;
  proposed: { actions: Action[]; journals: number; financialTransactions: number; debit: string; credit: string };
  manualReview: Array<{ module: string; id: string; date?: string; amount: string; reason: string }>;
  duplicateBankGroups: Array<{ identity: string; accountIds: string[]; linkedAccountIds: string[] }>;
  bankDiagnostics: Array<{ accountId: string; accountName: string; operationalBalance: string; glBalance: string; difference: string; rootCause: string; safeToBackfill: boolean; proposedSourceRecords: string[] }>;
};

@Injectable()
export class LegacyFinancialBackfillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashBank: CashBankService,
    private readonly accounting: AccountingService,
  ) {}

  async plan(organizationId: string): Promise<LegacyBackfillPlan> {
    const [expenses, receipts, bills, payables, banks, financialTransactions, transfers, cheques, journals, postedJournalLines] = await Promise.all([
      this.prisma.expense.findMany({ where: { organizationId }, include: { paidFromAccount: true, expenseHead: true } }),
      this.prisma.receipt.findMany({ where: { organizationId }, include: { receivedInAccount: true, receivable: true } }),
      this.prisma.projectBill.findMany({ where: { organizationId }, include: { receivable: true, cmsWork: { include: { organizationMaster: true } }, adjustments: true } }),
      this.prisma.payable.findMany({ where: { organizationId } }),
      this.prisma.bankAccount.findMany({ where: { organizationId } }),
      this.prisma.financialTransaction.findMany({ where: { organizationId } }),
      this.prisma.fundTransfer.findMany({ where: { organizationId } }),
      this.prisma.cheque.findMany({ where: { organizationId } }),
      this.prisma.journalEntry.findMany({ where: { organizationId } }),
      this.prisma.journalLine.findMany({ where: { journalEntry: { organizationId, status: "POSTED" }, account: { linkedBankAccountId: { not: null } } }, include: { account: true } }),
    ]);
    const journalKeys = new Set(journals.map((row) => key(row.sourceModule, row.sourceType, row.sourceId)));
    const ftKeys = new Set(financialTransactions.map((row) => key(row.sourceModule, row.sourceType, row.sourceId)));
    const classifications: Record<string, Record<string, number>> = {};
    const bump = (module: string, category: string) => {
      classifications[module] ??= {};
      classifications[module]![category] = (classifications[module]![category] ?? 0) + 1;
    };
    const manualReview: LegacyBackfillPlan["manualReview"] = [];
    const actions: Action[] = [];
    let debit = D(0);
    const propose = (action: Action, amount: Prisma.Decimal) => { actions.push(action); debit = debit.add(amount); };

    for (const row of expenses) {
      if (row.status !== "APPROVED") { bump("EXPENSE", "NOT_POSTABLE_STATUS"); continue; }
      const module = row.workId ? "PROJECT_EXPENSE" : "GENERAL_EXPENSE";
      const journal = journalKeys.has(key(module, "EXPENSE", row.id));
      const ft = ftKeys.has(key(module, "EXPENSE", row.id));
      if (journal) { bump("EXPENSE", "A_ALREADY_POSTED"); continue; }
      if (!row.paidFromAccountId || !row.paidFromAccount) {
        bump("EXPENSE", "D_AMBIGUOUS");
        manualReview.push({ module: "EXPENSE", id: row.id, date: row.expenseDate.toISOString(), amount: row.amount.toFixed(2), reason: "Approved legacy expense has no authoritative paid-from account" });
        continue;
      }
      bump("EXPENSE", ft ? "B_FINANCIAL_TRANSACTION_ONLY" : "C_NO_POSTING");
      propose({ kind: "EXPENSE", id: row.id, module, needsFinancialTransaction: !ft }, row.amount);
    }

    for (const row of receipts) {
      if (row.status !== "RECEIVED") { bump("RECEIPT", "NOT_POSTABLE_STATUS"); continue; }
      const journal = journalKeys.has(key("RECEIPT", row.receiptType, row.id));
      const ft = ftKeys.has(key("RECEIPT", row.receiptType, row.id));
      if (journal) { bump("RECEIPT", "A_ALREADY_POSTED"); continue; }
      if (!row.receivedInAccountId || !row.receivedInAccount) {
        bump("RECEIPT", "D_AMBIGUOUS");
        manualReview.push({ module: "RECEIPT", id: row.id, date: row.receiptDate.toISOString(), amount: row.amount.toFixed(2), reason: "Received legacy receipt has no authoritative received-in account" });
        continue;
      }
      if (row.receivableId && (!row.receivable || row.receivable.organizationId !== organizationId)) {
        bump("RECEIPT", "D_AMBIGUOUS");
        manualReview.push({ module: "RECEIPT", id: row.id, date: row.receiptDate.toISOString(), amount: row.amount.toFixed(2), reason: "Receipt receivable linkage is missing or cross-tenant" });
        continue;
      }
      bump("RECEIPT", ft ? "B_FINANCIAL_TRANSACTION_ONLY" : "C_NO_POSTING");
      propose({ kind: "RECEIPT", id: row.id, needsFinancialTransaction: !ft }, row.amount);
    }

    for (const row of bills) {
      if (!["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"].includes(row.status)) { bump("PROJECT_BILL", "NOT_CERTIFIED"); continue; }
      if (journalKeys.has(key("PROJECT_BILL", "CERTIFICATION", row.id))) { bump("PROJECT_BILL", "A_ALREADY_POSTED"); continue; }
      const snapshotTotal = row.netCertifiedAmount.add(row.retentionAmount).add(row.vatAmount).add(row.aitAmount).add(row.otherDeductionAmount);
      if (!row.receivable || !snapshotTotal.eq(row.grossBillAmount) || !row.receivable.amount.eq(row.netCertifiedAmount)) {
        bump("PROJECT_BILL", "F_UNSAFE_SNAPSHOT");
        manualReview.push({ module: "PROJECT_BILL", id: row.id, date: row.billDate.toISOString(), amount: row.grossBillAmount.toFixed(2), reason: "Certified snapshot equation or receivable linkage does not reconcile" });
        continue;
      }
      bump("PROJECT_BILL", "C_NO_POSTING");
      propose({ kind: "BILL_CERTIFICATION", id: row.id }, row.grossBillAmount);
    }

    for (const row of transfers) {
      const journal = journalKeys.has(key("BANK_TRANSFER", "TRANSFER", row.id)) || journalKeys.has(key("PETTY_CASH", "TRANSFER", row.id));
      if (journal) { bump("FUND_TRANSFER", "A_ALREADY_POSTED"); continue; }
      const outgoing = financialTransactions.find((x) => x.sourceId === row.id && x.direction === "OUT" && x.accountId === row.fromAccountId && x.amount.eq(row.amount));
      const incoming = financialTransactions.find((x) => x.sourceId === row.id && x.direction === "IN" && x.accountId === row.toAccountId && x.amount.eq(row.amount));
      if (!outgoing || !incoming) {
        bump("FUND_TRANSFER", "F_UNSAFE_OPERATIONAL_LINK");
        manualReview.push({ module: "FUND_TRANSFER", id: row.id, date: row.transferDate.toISOString(), amount: row.amount.toFixed(2), reason: "Transfer does not have exact source-linked IN and OUT operational transactions" });
        continue;
      }
      bump("FUND_TRANSFER", "B_FINANCIAL_TRANSACTION_ONLY");
      propose({ kind: "TRANSFER", id: row.id }, row.amount.add(row.bankCharge));
    }

    for (const tx of financialTransactions.filter((x) => x.sourceModule === "MAIN_CASH" && x.sourceType === "Opening Float")) {
      if (journalKeys.has(key(tx.sourceModule, tx.sourceType, tx.sourceId))) bump("BANK_OPENING", "A_ALREADY_POSTED");
      else { bump("BANK_OPENING", "B_FINANCIAL_TRANSACTION_ONLY"); propose({ kind: "CASH_OPENING", financialTransactionId: tx.id }, tx.amount); }
    }

    for (const cheque of cheques) {
      bump("CHEQUE", cheque.postedAt ? "F_MANUAL_REVIEW" : "NOT_POSTED");
      if (cheque.postedAt) manualReview.push({ module: "CHEQUE", id: cheque.id, date: cheque.chequeDate.toISOString(), amount: cheque.amount.toFixed(2), reason: "Posted legacy cheque requires event-specific counter-account review" });
    }
    for (const payable of payables) bump("PAYABLE", journalKeys.has(key("PAYABLE", "BILL", payable.id)) ? "A_ALREADY_POSTED" : "F_MANUAL_REVIEW");

    const groups = new Map<string, typeof banks>();
    for (const bank of banks) {
      const identity = `${bank.accountType}|${bank.accountName.trim().toLowerCase()}|${bank.accountNumber?.trim().toLowerCase() ?? ""}`;
      groups.set(identity, [...(groups.get(identity) ?? []), bank]);
      if (!bank.openingBalance.isZero() && !journalKeys.has(key("BANK_ACCOUNT", "OPENING_BALANCE", bank.id))) {
        manualReview.push({ module: "BANK_OPENING", id: bank.id, date: bank.openingBalanceDate?.toISOString(), amount: bank.openingBalance.toFixed(2), reason: "Operational opening balance exists without an exact GL source link" });
      } else if (bank.openingBalance.isZero()) {
        const txNet = financialTransactions.filter((x) => x.accountId === bank.id && x.status === "POSTED").reduce((sum, x) => x.direction === "IN" ? sum.add(x.amount) : sum.sub(x.amount), D(0));
        const unexplained = bank.currentBalance.sub(txNet);
        if (!unexplained.isZero()) manualReview.push({ module: "BANK_ACCOUNT", id: bank.id, amount: unexplained.toFixed(2), reason: "Operational balance contains a directly populated base with no opening-balance or transaction provenance" });
      }
    }
    const duplicateBankGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1).map(([identity, rows]) => ({ identity, accountIds: rows.map((x) => x.id), linkedAccountIds: rows.filter((x) => financialTransactions.some((ft) => ft.accountId === x.id)).map((x) => x.id) }));
    const bankDiagnostics = banks.map((bank) => {
      const gl = postedJournalLines.filter((x) => x.account.linkedBankAccountId === bank.id).reduce((sum, x) => sum.add(x.debit).sub(x.credit), D(0));
      const difference = gl.sub(bank.currentBalance);
      const sources = financialTransactions.filter((x) => x.accountId === bank.id).map((x) => `${x.sourceModule}:${x.sourceType}:${x.sourceId}`);
      return { accountId: bank.id, accountName: bank.accountName, operationalBalance: bank.currentBalance.toFixed(2), glBalance: gl.toFixed(2), difference: difference.toFixed(2), rootCause: difference.isZero() ? "BALANCED" : bank.openingBalance.isZero() ? "DIRECT_BALANCE_NO_PROVENANCE" : "OPENING_BALANCE_MISSING_GL", safeToBackfill: false, proposedSourceRecords: sources };
    });

    return {
      version: VERSION,
      organizationId,
      inspected: { expenses: expenses.length, receipts: receipts.length, projectBills: bills.length, receivables: bills.filter((x) => x.receivable).length, payables: payables.length, bankAccounts: banks.length, financialTransactions: financialTransactions.length, fundTransfers: transfers.length, cheques: cheques.length, journalEntries: journals.length },
      classifications,
      proposed: { actions, journals: actions.length, financialTransactions: actions.filter((x) => (x.kind === "EXPENSE" || x.kind === "RECEIPT") && x.needsFinancialTransaction).length, debit: debit.toFixed(2), credit: debit.toFixed(2) },
      manualReview,
      duplicateBankGroups,
      bankDiagnostics,
    };
  }

  async apply(organizationId: string, userId: string) {
    const plan = await this.plan(organizationId);
    const created = { journals: 0, financialTransactions: 0, byModule: {} as Record<string, number> };
    for (const action of plan.proposed.actions) {
      await this.prisma.$transaction(async (tx) => {
        if (action.kind === "EXPENSE") {
          const row = await tx.expense.findFirstOrThrow({ where: { id: action.id, organizationId, status: "APPROVED" }, include: { paidFromAccount: true, expenseHead: true } });
          if (!row.paidFromAccountId || !row.paidFromAccount) throw new Error(`Expense ${row.id} lost its account linkage`);
          const description = `[LEGACY_BACKFILL:${VERSION}] ${row.description?.trim() || row.expenseHead?.name || row.category || "Expense"}`;
          if (action.needsFinancialTransaction) {
            await this.cashBank.post(tx, { organizationId, accountId: row.paidFromAccountId, direction: "OUT", amount: row.amount, sourceModule: action.module, sourceType: "EXPENSE", sourceId: row.id, referenceNo: row.referenceNo, description, transactionDate: row.expenseDate, createdById: userId });
            created.financialTransactions++;
          }
          const expenseLedgerAccountId = row.expenseLedgerAccountId ?? row.expenseHead?.ledgerAccountId;
          if (!expenseLedgerAccountId) throw new Error(`Expense ${row.id} has no Chart of Accounts ID; map its expense head before backfill`);
          await this.accounting.post(tx, { organizationId, userId, journalDate: row.expenseDate, referenceNo: row.referenceNo, description, sourceModule: action.module, sourceType: "EXPENSE", sourceId: row.id, lines: [{ accountId: expenseLedgerAccountId, projectId: row.workId, debit: row.amount, credit: 0 }, { bankAccountId: row.paidFromAccountId, projectId: row.workId, debit: 0, credit: row.amount }] });
        } else if (action.kind === "RECEIPT") {
          const row = await tx.receipt.findFirstOrThrow({ where: { id: action.id, organizationId, status: "RECEIVED" }, include: { receivedInAccount: true, receivable: true } });
          if (!row.receivedInAccountId || !row.receivedInAccount) throw new Error(`Receipt ${row.id} lost its account linkage`);
          const description = `[LEGACY_BACKFILL:${VERSION}] ${row.description?.trim() || `Receipt from ${row.receivedFrom}`}`;
          if (action.needsFinancialTransaction) {
            await this.cashBank.post(tx, { organizationId, accountId: row.receivedInAccountId, direction: "IN", amount: row.amount, sourceModule: "RECEIPT", sourceType: row.receiptType, sourceId: row.id, referenceNo: row.receiptNo, description, transactionDate: row.receiptDate, createdById: userId });
            created.financialTransactions++;
          }
          await this.accounting.post(tx, { organizationId, userId, journalDate: row.receiptDate, referenceNo: row.receiptNo, description, sourceModule: "RECEIPT", sourceType: row.receiptType, sourceId: row.id, lines: [{ bankAccountId: row.receivedInAccountId, projectId: row.workId, partyName: row.receivedFrom, partyType: row.workId ? "CUSTOMER" : "OTHER", debit: row.amount, credit: 0 }, { systemKey: row.receivableId ? "ACCOUNTS_RECEIVABLE" : "OTHER_INCOME", projectId: row.workId, partyName: row.receivedFrom, partyType: row.workId ? "CUSTOMER" : "OTHER", debit: 0, credit: row.amount }] });
        } else if (action.kind === "BILL_CERTIFICATION") {
          const row = await tx.projectBill.findFirstOrThrow({ where: { id: action.id, organizationId }, include: { receivable: true, cmsWork: { include: { organizationMaster: true } }, adjustments: true } });
          if (!row.receivable || !row.receivable.amount.eq(row.netCertifiedAmount)) throw new Error(`Bill ${row.id} snapshot changed`);
          const partyName = row.cmsWork.organizationMaster.shortName;
          const deductions = row.adjustments.filter((x) => x.direction === "DEDUCTION" && x.amount.gt(0));
          await this.accounting.post(tx, { organizationId, userId, journalDate: row.billDate, referenceNo: row.billNo, description: `[LEGACY_BACKFILL:${VERSION}] Certified bill ${row.billNo} from stored snapshot`, sourceModule: "PROJECT_BILL", sourceType: "CERTIFICATION", sourceId: row.id, lines: [
            { systemKey: "ACCOUNTS_RECEIVABLE", projectId: row.cmsWorkId, partyName, partyType: "CUSTOMER", debit: row.netCertifiedAmount, credit: 0 },
            ...(row.retentionAmount.gt(0) ? [{ systemKey: "RETENTION_RECEIVABLE", projectId: row.cmsWorkId, partyName, partyType: "CUSTOMER", debit: row.retentionAmount, credit: 0 }] : []),
            ...(row.vatAmount.gt(0) ? [{ systemKey: "TAX_DEDUCTED_VAT", projectId: row.cmsWorkId, partyName, partyType: "CUSTOMER", debit: row.vatAmount, credit: 0 }] : []),
            ...(row.aitAmount.gt(0) ? [{ systemKey: "TAX_DEDUCTED_AIT", projectId: row.cmsWorkId, partyName, partyType: "CUSTOMER", debit: row.aitAmount, credit: 0 }] : []),
            ...deductions.map((x) => ({ accountId: x.ledgerAccountId ?? undefined, systemKey: x.ledgerAccountId ? undefined : "OTHER_DEDUCTION_RECEIVABLE", projectId: row.cmsWorkId, partyName, partyType: "CUSTOMER", debit: x.amount, credit: 0, description: x.description ?? x.type })),
            { systemKey: "PROJECT_REVENUE", projectId: row.cmsWorkId, partyName, partyType: "CUSTOMER", debit: 0, credit: row.grossBillAmount },
          ] });
        } else if (action.kind === "TRANSFER") {
          const row = await tx.fundTransfer.findFirstOrThrow({ where: { id: action.id, organizationId } });
          await this.accounting.post(tx, { organizationId, userId, journalDate: row.transferDate, referenceNo: row.transferNo, description: `[LEGACY_BACKFILL:${VERSION}] ${row.description || "Fund transfer"}`, sourceModule: "BANK_TRANSFER", sourceType: "TRANSFER", sourceId: row.id, lines: [{ bankAccountId: row.toAccountId, debit: row.amount, credit: 0 }, ...(row.bankCharge.gt(0) ? [{ systemKey: "BANK_CHARGES", debit: row.bankCharge, credit: 0 }] : []), { bankAccountId: row.fromAccountId, debit: 0, credit: row.amount.add(row.bankCharge) }] });
        } else {
          const row = await tx.financialTransaction.findFirstOrThrow({ where: { id: action.financialTransactionId, organizationId, sourceModule: "MAIN_CASH", sourceType: "Opening Float" } });
          await this.accounting.post(tx, { organizationId, userId, journalDate: row.transactionDate, referenceNo: row.referenceNo, description: `[LEGACY_BACKFILL:${VERSION}] ${row.description}`, sourceModule: row.sourceModule, sourceType: row.sourceType, sourceId: row.sourceId, lines: [{ bankAccountId: row.accountId, debit: row.amount, credit: 0 }, { systemKey: "OPENING_BALANCE_EQUITY", debit: 0, credit: row.amount }] });
        }
        created.journals++;
        created.byModule[action.kind] = (created.byModule[action.kind] ?? 0) + 1;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
    }
    return { version: VERSION, created, remaining: await this.plan(organizationId) };
  }
}
