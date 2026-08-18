import { Injectable } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AccountingService } from "./accounting.service";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);
const DBBL = "1012000045781";
const PRIME = "2091000078452";

@Injectable()
export class DemoBankCleanupService {
  constructor(private readonly prisma: PrismaService, private readonly accounting: AccountingService) {}

  private async referenceCount(id: string) {
    const p = this.prisma;
    const counts = await Promise.all([
      p.financialTransaction.count({ where: { accountId: id } }), p.expense.count({ where: { paidFromAccountId: id } }), p.receipt.count({ where: { receivedInAccountId: id } }),
      p.fundTransfer.count({ where: { OR: [{ fromAccountId: id }, { toAccountId: id }] } }), p.cheque.count({ where: { accountId: id } }),
      p.documentPurchase.count({ where: { paymentFromAccountId: id } }), p.tenderSecurity.count({ where: { OR: [{ bankAccountId: id }, { chargeFromAccountId: id }] } }),
      p.creditCommitment.count({ where: { paymentFromAccountId: id } }), p.creditCommitmentItem.count({ where: { bankAccountId: id } }), p.performanceGuarantee.count({ where: { bankAccountId: id } }),
      p.bankReconciliation.count({ where: { accountId: id } }), p.ledgerAccount.count({ where: { linkedBankAccountId: id } }),
    ]);
    return { financialTransactions: counts[0]!, expenses: counts[1]!, receipts: counts[2]!, fundTransfers: counts[3]!, cheques: counts[4]!, documents: counts[5]!, tenderSecurities: counts[6]!, creditCommitments: counts[7]!, creditItems: counts[8]!, guarantees: counts[9]!, reconciliations: counts[10]!, ledgers: counts[11]!, total: counts.reduce((a, b) => a + b, 0) };
  }

  async plan(organizationId: string) {
    const banks = await this.prisma.bankAccount.findMany({ where: { organizationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const rows = await Promise.all(banks.map(async (bank) => ({ bank, refs: await this.referenceCount(bank.id) })));
    const choose = (items: typeof rows) => [...items].sort((a, b) => Number(b.refs.financialTransactions > 0) - Number(a.refs.financialTransactions > 0) || b.refs.total - a.refs.total || a.bank.createdAt.getTime() - b.bank.createdAt.getTime())[0]!;
    const dbblRows = rows.filter((x) => x.bank.isActive && x.bank.accountNumber === DBBL);
    const primeRows = rows.filter((x) => x.bank.isActive && x.bank.accountNumber === PRIME);
    const cashRows = rows.filter((x) => x.bank.isActive && x.bank.accountType === "CASH" && x.bank.accountName === "Cash");
    const mainCash = rows.find((x) => x.bank.id === `${organizationId}:Main Cash`);
    if (!dbblRows.length || !primeRows.length || !mainCash) throw new Error("Canonical DBBL, Prime Bank, or Main Cash is missing");
    const groups = [
      { identity: `BANK:${DBBL}`, canonical: choose(dbblRows), members: dbblRows },
      { identity: `BANK:${PRIME}`, canonical: choose(primeRows), members: primeRows },
      { identity: "CASH:Cash->Main Cash", canonical: mainCash, members: [mainCash, ...cashRows] },
    ];
    const sourceIds = new Set(groups.flatMap((g) => g.members.filter((x) => x.bank.id !== g.canonical.bank.id).map((x) => x.bank.id)));
    return {
      organizationId,
      before: { total: banks.length, active: banks.filter((x) => x.isActive).length, operationalTotal: banks.reduce((sum, x) => sum.add(x.currentBalance), D(0)).toFixed(2) },
      accounts: rows.map(({ bank, refs }) => ({ id: bank.id, name: bank.accountName, bankName: bank.bankName, accountNumber: bank.accountNumber, branch: bank.branch, openingBalance: bank.openingBalance.toFixed(2), currentBalance: bank.currentBalance.toFixed(2), isActive: bank.isActive, createdAt: bank.createdAt.toISOString(), references: refs, classification: sourceIds.has(bank.id) ? (refs.total ? "DUPLICATE_WITH_HISTORY" : "DUPLICATE_UNUSED") : refs.total ? "AUTHORITATIVE_USED" : bank.currentBalance.isZero() ? "AUTHORITATIVE_UNUSED" : "UNEXPLAINED_SEED_BALANCE" })),
      groups: groups.map((g) => ({ identity: g.identity, canonicalId: g.canonical.bank.id, canonicalReason: g.canonical.refs.financialTransactions ? "real linked financial transactions, then reference count/age" : "highest seeded workflow reference count, then age", sourceIds: g.members.filter((x) => x.bank.id !== g.canonical.bank.id).map((x) => x.bank.id) })),
      toDeactivate: [...sourceIds],
      retained: banks.filter((x) => !sourceIds.has(x.id)).map((x) => x.id),
    };
  }

  private async migrateLedger(tx: Prisma.TransactionClient, organizationId: string, sourceId: string, targetId: string) {
    const sourceLedgers = await tx.ledgerAccount.findMany({ where: { organizationId, linkedBankAccountId: sourceId } });
    if (!sourceLedgers.length) return;
    const target = await this.accounting.bankLedgerAccount(tx, organizationId, targetId);
    for (const source of sourceLedgers) {
      await tx.journalLine.updateMany({ where: { accountId: source.id }, data: { accountId: target.id } });
      await tx.billAdjustment.updateMany({ where: { ledgerAccountId: source.id }, data: { ledgerAccountId: target.id } });
      const setting = await tx.financeSetting.findUnique({ where: { organizationId } });
      if (setting) {
        const keys = ["defaultCashAccountId", "defaultPettyCashAccountId", "defaultBankChargeAccountId", "defaultReceivableAccountId", "defaultPayableAccountId", "defaultProjectRevenueAccountId", "defaultGeneralExpenseAccountId", "defaultTenderDocumentExpenseAccountId", "defaultCreditCommitmentChargeAccountId"] as const;
        const data: Record<string, string> = {};
        for (const key of keys) if (setting[key] === source.id) data[key] = target.id;
        if (Object.keys(data).length) await tx.financeSetting.update({ where: { organizationId }, data });
      }
      if (await tx.ledgerAccount.count({ where: { parentId: source.id } })) throw new Error(`Ledger ${source.id} has child accounts`);
      await tx.ledgerAccount.delete({ where: { id: source.id } });
    }
  }

  private async migrateAccount(tx: Prisma.TransactionClient, organizationId: string, sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const sourceTransactions = await tx.financialTransaction.findMany({ where: { organizationId, accountId: sourceId } });
    for (const row of sourceTransactions) {
      const conflict = await tx.financialTransaction.findFirst({ where: { organizationId, accountId: targetId, sourceModule: row.sourceModule, sourceType: row.sourceType, sourceId: row.sourceId, direction: row.direction } });
      if (conflict) throw new Error(`Financial transaction collision ${row.id} -> ${conflict.id}`);
    }
    await this.migrateLedger(tx, organizationId, sourceId, targetId);
    await tx.financialTransaction.updateMany({ where: { organizationId, accountId: sourceId }, data: { accountId: targetId } });
    await tx.expense.updateMany({ where: { organizationId, paidFromAccountId: sourceId }, data: { paidFromAccountId: targetId } });
    await tx.receipt.updateMany({ where: { organizationId, receivedInAccountId: sourceId }, data: { receivedInAccountId: targetId } });
    await tx.fundTransfer.updateMany({ where: { organizationId, fromAccountId: sourceId }, data: { fromAccountId: targetId } });
    await tx.fundTransfer.updateMany({ where: { organizationId, toAccountId: sourceId }, data: { toAccountId: targetId } });
    await tx.cheque.updateMany({ where: { organizationId, accountId: sourceId }, data: { accountId: targetId } });
    await tx.bankReconciliation.updateMany({ where: { organizationId, accountId: sourceId }, data: { accountId: targetId } });
    await tx.documentPurchase.updateMany({ where: { organizationId, paymentFromAccountId: sourceId }, data: { paymentFromAccountId: targetId } });
    await tx.tenderSecurity.updateMany({ where: { organizationId, bankAccountId: sourceId }, data: { bankAccountId: targetId } });
    await tx.tenderSecurity.updateMany({ where: { organizationId, chargeFromAccountId: sourceId }, data: { chargeFromAccountId: targetId } });
    await tx.creditCommitment.updateMany({ where: { organizationId, paymentFromAccountId: sourceId }, data: { paymentFromAccountId: targetId } });
    await tx.creditCommitmentItem.updateMany({ where: { bankAccountId: sourceId, creditCommitment: { organizationId } }, data: { bankAccountId: targetId } });
    await tx.performanceGuarantee.updateMany({ where: { organizationId, bankAccountId: sourceId }, data: { bankAccountId: targetId } });
    await tx.bankAccount.update({ where: { id: sourceId, organizationId }, data: { isActive: false, openingBalance: 0, openingBalanceDate: null, currentBalance: 0, remarks: `Archived development seed duplicate; references migrated to ${targetId}` } });
  }

  private async normalize(tx: Prisma.TransactionClient, organizationId: string, accountId: string) {
    await this.accounting.bankLedgerAccount(tx, organizationId, accountId);
    const account = await tx.bankAccount.findFirstOrThrow({ where: { id: accountId, organizationId, isActive: true } });
    const rows = await tx.financialTransaction.findMany({ where: { organizationId, accountId, status: "POSTED" }, orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
    let balance = D(account.openingBalance);
    for (const row of rows) {
      balance = row.direction === "IN" ? balance.add(row.amount) : balance.sub(row.amount);
      await tx.financialTransaction.update({ where: { id: row.id }, data: { balanceAfter: balance } });
    }
    await tx.bankAccount.update({ where: { id: account.id }, data: { currentBalance: balance } });
  }

  async apply(organizationId: string) {
    const plan = await this.plan(organizationId);
    await this.prisma.$transaction(async (tx) => {
      for (const group of plan.groups) for (const sourceId of group.sourceIds) await this.migrateAccount(tx, organizationId, sourceId, group.canonicalId);
      const active = await tx.bankAccount.findMany({ where: { organizationId, isActive: true } });
      for (const bank of active) await this.normalize(tx, organizationId, bank.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 });
    const after = await this.prisma.bankAccount.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
    return { plan, after: { total: after.length, active: after.filter((x) => x.isActive).length, operationalTotal: after.filter((x) => x.isActive).reduce((sum, x) => sum.add(x.currentBalance), D(0)).toFixed(2), deactivated: after.filter((x) => !x.isActive).map((x) => x.id) } };
  }
}
