import { randomUUID } from "crypto";
import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { CashBankService } from "../cash-bank/cash-bank.service";
import { FinanceSettingsService } from "../settings-finance/finance-settings.service";
import type {
  CreateAccountDto,
  CreateJournalDto,
  CreatePayableDto,
  OpeningBalanceDto,
  PayPayableDto,
  QueryAccountingDto,
} from "./dto/accounting.dto";
type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
const ROOTS = [
  ["1000", "Assets", "ASSET", "DEBIT", "ASSETS"],
  ["2000", "Liabilities", "LIABILITY", "CREDIT", "LIABILITIES"],
  ["3000", "Equity", "EQUITY", "CREDIT", "EQUITY"],
  ["4000", "Income", "INCOME", "CREDIT", "INCOME"],
  ["5000", "Expenses", "EXPENSE", "DEBIT", "EXPENSES"],
] as const;
const SYSTEM = [
  ["1010", "Cash", "ASSET", "DEBIT", "CASH", "ASSETS"],
  ["1020", "Bank", "ASSET", "DEBIT", "BANK", "ASSETS"],
  ["1100", "Accounts Receivable", "ASSET", "DEBIT", "ACCOUNTS_RECEIVABLE", "ASSETS"],
  ["1110", "Retention Receivable", "ASSET", "DEBIT", "RETENTION_RECEIVABLE", "ASSETS"],
  ["1120", "VAT Deducted at Source", "ASSET", "DEBIT", "TAX_DEDUCTED_VAT", "ASSETS"],
  ["1130", "AIT Deducted at Source", "ASSET", "DEBIT", "TAX_DEDUCTED_AIT", "ASSETS"],
  ["1140", "Other Bill Deductions Receivable", "ASSET", "DEBIT", "OTHER_DEDUCTION_RECEIVABLE", "ASSETS"],
  ["1200", "Security Deposit", "ASSET", "DEBIT", "SECURITY_DEPOSIT", "ASSETS"],
  ["1300", "Advances", "ASSET", "DEBIT", "ADVANCES", "ASSETS"],
  ["2010", "Accounts Payable", "LIABILITY", "CREDIT", "ACCOUNTS_PAYABLE", "LIABILITIES"],
  ["2100", "Loans", "LIABILITY", "CREDIT", "LOANS", "LIABILITIES"],
  ["2200", "Accrued Expenses", "LIABILITY", "CREDIT", "ACCRUED_EXPENSES", "LIABILITIES"],
  ["3010", "Owner's Capital", "EQUITY", "CREDIT", "OWNERS_CAPITAL", "EQUITY"],
  ["3020", "Retained Earnings", "EQUITY", "CREDIT", "RETAINED_EARNINGS", "EQUITY"],
  ["3030", "Opening Balance Equity", "EQUITY", "CREDIT", "OPENING_BALANCE_EQUITY", "EQUITY"],
  ["4010", "Project Revenue", "INCOME", "CREDIT", "PROJECT_REVENUE", "INCOME"],
  ["4020", "Other Business Income", "INCOME", "CREDIT", "OTHER_INCOME", "INCOME"],
  ["5010", "Project Expense", "EXPENSE", "DEBIT", "PROJECT_EXPENSE", "EXPENSES"],
  ["5020", "General Expense", "EXPENSE", "DEBIT", "GENERAL_EXPENSE", "EXPENSES"],
  ["5030", "Bank Charges", "EXPENSE", "DEBIT", "BANK_CHARGES", "EXPENSES"],
  ["5040", "Tender Security Charges", "EXPENSE", "DEBIT", "TENDER_SECURITY_CHARGES", "EXPENSES"],
  [
    "5050",
    "Credit Commitment Charges",
    "EXPENSE",
    "DEBIT",
    "CREDIT_COMMITMENT_CHARGES",
    "EXPENSES",
  ],
  ["5060", "PG/BG Charges", "EXPENSE", "DEBIT", "PG_BG_CHARGES", "EXPENSES"],
] as const;
// Sub-ledger-backed accounts: a manual journal entry must never post to these directly —
// doing so would let Receivable/Payable/Cash/Bank/Opening-balance sub-ledgers diverge from
// the GL. Real business modules (Receipts, Payables, Cash & Bank, Opening Balances) post to
// them through AccountingService.post()/bankLedgerAccount(), which is unaffected by this gate.
const CONTROL_SYSTEM_KEYS = new Set(["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE", "RETENTION_RECEIVABLE", "TAX_DEDUCTED_VAT", "TAX_DEDUCTED_AIT", "OTHER_DEDUCTION_RECEIVABLE", "OPENING_BALANCE_EQUITY", "CASH", "BANK"]);
// The one normal balance each account type is allowed to carry — enforced at account
// create/update so LedgerAccount.normalBalance can never silently drift out of sync with
// accountType (which is what every balance/report calculation actually keys off).
const NORMAL_BALANCE_BY_TYPE: Record<string, "DEBIT" | "CREDIT"> = {
  ASSET: "DEBIT",
  EXPENSE: "DEBIT",
  LIABILITY: "CREDIT",
  EQUITY: "CREDIT",
  INCOME: "CREDIT",
};
@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    @Inject(forwardRef(() => CashBankService)) private readonly cashBank: CashBankService,
    private readonly financeSettings: FinanceSettingsService,
  ) {}
  private no(prefix = "JV") {
    return `${prefix}-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
  async ensureChart(org: string, tx: Tx | PrismaService = this.prisma) {
    const parents = new Map<string, string>();
    for (const [code, name, type, normal, key] of ROOTS) {
      const row = await tx.ledgerAccount.upsert({
        where: { organizationId_systemKey: { organizationId: org, systemKey: key } },
        update: {},
        create: {
          organizationId: org,
          code,
          name,
          accountType: type,
          normalBalance: normal,
          isSystem: true,
          isControlAccount: CONTROL_SYSTEM_KEYS.has(key),
          systemKey: key,
        },
      });
      parents.set(key, row.id);
    }
    for (const [code, name, type, normal, key, parent] of SYSTEM)
      await tx.ledgerAccount.upsert({
        where: { organizationId_systemKey: { organizationId: org, systemKey: key } },
        update: {},
        create: {
          organizationId: org,
          code,
          name,
          accountType: type,
          normalBalance: normal,
          isSystem: true,
          isControlAccount: CONTROL_SYSTEM_KEYS.has(key),
          systemKey: key,
          parentId: parents.get(parent),
        },
      });
  }
  async systemAccount(tx: Tx, org: string, key: string) {
    await this.ensureChart(org, tx);
    const row = await tx.ledgerAccount.findFirst({
      where: { organizationId: org, systemKey: key },
    });
    if (!row) throw new NotFoundException(`System account ${key} not found`);
    return row;
  }
  async bankLedgerAccount(tx: Tx, org: string, bankAccountId: string) {
    const bank = await tx.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId: org },
    });
    if (!bank) throw new NotFoundException("Cash/Bank account not found");
    await this.ensureChart(org, tx);
    const existing = await tx.ledgerAccount.findFirst({
      where: { organizationId: org, linkedBankAccountId: bank.id },
    });
    if (existing) return existing;
    const parent = await this.systemAccount(tx, org, bank.accountType === "CASH" ? "CASH" : "BANK");
    const count = await tx.ledgerAccount.count({
      where: { organizationId: org, parentId: parent.id },
    });
    return tx.ledgerAccount.create({
      data: {
        organizationId: org,
        code: `${parent.code}.${String(count + 1).padStart(2, "0")}`,
        name: bank.accountName,
        parentId: parent.id,
        accountType: "ASSET",
        normalBalance: "DEBIT",
        description: bank.accountNumber ?? undefined,
        isSystem: true,
        isControlAccount: true,
        linkedBankAccountId: bank.id,
      },
    });
  }
  private async assertNoControlAccountLines(
    tx: Tx,
    org: string,
    lines: Array<{ accountId: string }>,
  ) {
    const ids = [...new Set(lines.map((l) => l.accountId))];
    const controlAccounts = await tx.ledgerAccount.findMany({
      where: { id: { in: ids }, organizationId: org, isControlAccount: true },
    });
    if (controlAccounts.length > 0) {
      throw new BadRequestException(
        `Manual journal entries cannot post directly to control accounts: ${controlAccounts
          .map((a) => a.name)
          .join(", ")}. Use the dedicated module (Receipts, Payables, Cash & Bank, Opening Balances) instead.`,
      );
    }
  }
  private validate(
    lines: Array<{ debit: Prisma.Decimal | number; credit: Prisma.Decimal | number }>,
  ) {
    if (lines.length < 2) throw new BadRequestException("A journal requires at least two lines");
    let dr = D(0),
      cr = D(0);
    for (const l of lines) {
      const d = D(l.debit),
        c = D(l.credit);
      if (d.lt(0) || c.lt(0) || (!d.eq(0) && !c.eq(0)) || (d.eq(0) && c.eq(0)))
        throw new BadRequestException("Each line must contain one positive debit or credit");
      dr = dr.add(d);
      cr = cr.add(c);
    }
    if (dr.lte(0) || !dr.eq(cr))
      throw new BadRequestException(
        `Journal is unbalanced. Debit ${dr.toFixed(2)} must equal Credit ${cr.toFixed(2)}`,
      );
    return { debit: dr, credit: cr };
  }
  async post(
    tx: Tx,
    input: {
      organizationId: string;
      userId?: string | null;
      journalDate: Date;
      referenceNo?: string | null;
      description: string;
      sourceModule: string;
      sourceType: string;
      sourceId: string;
      lines: Array<{
        accountId?: string;
        systemKey?: string;
        bankAccountId?: string;
        projectId?: string | null;
        partyName?: string | null;
        partyType?: string | null;
        debit: Prisma.Decimal | number;
        credit: Prisma.Decimal | number;
        description?: string | null;
      }>;
    },
  ) {
    this.validate(input.lines);
    const found = await tx.journalEntry.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceModule: input.sourceModule,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    });
    if (found) return found;
    await this.financeSettings.assertPostable(input.organizationId, input.journalDate);
    const resolved = [];
    for (const l of input.lines) {
      const account = l.accountId
        ? await tx.ledgerAccount.findFirst({
            where: { id: l.accountId, organizationId: input.organizationId },
          })
        : l.bankAccountId
          ? await this.bankLedgerAccount(tx, input.organizationId, l.bankAccountId)
          : l.systemKey
            ? await this.systemAccount(tx, input.organizationId, l.systemKey)
            : null;
      if (!account) throw new NotFoundException("Ledger account not found");
      if (l.projectId) {
        const p = await tx.cmsWork.findFirst({
          where: { id: l.projectId, organizationId: input.organizationId },
        });
        if (!p) throw new NotFoundException("Project not found");
      }
      resolved.push({ ...l, accountId: account.id });
    }
    return tx.journalEntry.create({
      data: {
        organizationId: input.organizationId,
        journalNo: this.no(),
        journalDate: input.journalDate,
        referenceNo: input.referenceNo,
        description: input.description,
        sourceModule: input.sourceModule,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        status: "POSTED",
        createdById: input.userId,
        postedById: input.userId,
        postedAt: new Date(),
        lines: {
          create: resolved.map((l) => ({
            accountId: l.accountId,
            projectId: l.projectId,
            partyName: l.partyName,
            partyType: l.partyType,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
          })),
        },
      },
    });
  }
  async chart(org: string) {
    await this.ensureChart(org);
    const rows = await this.prisma.ledgerAccount.findMany({
      where: { organizationId: org },
      include: { _count: { select: { journalLines: true } } },
      orderBy: { code: "asc" },
    });
    return rows;
  }
  private assertValidNormalBalance(accountType: string, normalBalance: string) {
    const expected = NORMAL_BALANCE_BY_TYPE[accountType];
    if (expected && normalBalance !== expected) {
      throw new BadRequestException(
        `${accountType} accounts must have a ${expected} normal balance, not ${normalBalance}`,
      );
    }
  }
  async createAccount(org: string, userId: string, dto: CreateAccountDto) {
    if (
      dto.parentId &&
      !(await this.prisma.ledgerAccount.findFirst({
        where: { id: dto.parentId, organizationId: org },
      }))
    )
      throw new NotFoundException("Parent account not found");
    this.assertValidNormalBalance(dto.accountType, dto.normalBalance);
    const row = await this.prisma.ledgerAccount.create({
      data: { organizationId: org, ...dto, isSystem: false },
    });
    await this.log(org, userId, "ACCOUNT_CREATED", row.id, row.code);
    return row;
  }
  async updateAccount(org: string, userId: string, id: string, dto: Partial<CreateAccountDto>) {
    const old = await this.prisma.ledgerAccount.findFirst({ where: { id, organizationId: org } });
    if (!old) throw new NotFoundException("Account not found");
    this.assertValidNormalBalance(dto.accountType ?? old.accountType, dto.normalBalance ?? old.normalBalance);
    const row = await this.prisma.ledgerAccount.update({ where: { id, organizationId: org }, data: dto });
    await this.log(org, userId, "ACCOUNT_UPDATED", id, row.code);
    return row;
  }
  private whereJournal(org: string, q: QueryAccountingDto): Prisma.JournalEntryWhereInput {
    return {
      organizationId: org,
      status: q.status,
      sourceModule: q.sourceModule,
      journalDate:
        q.dateFrom || q.dateTo
          ? {
              gte: q.dateFrom ? new Date(q.dateFrom) : undefined,
              lte: q.dateTo ? new Date(`${q.dateTo}T23:59:59.999Z`) : undefined,
            }
          : undefined,
      OR: q.search
        ? [
            { journalNo: { contains: q.search, mode: "insensitive" } },
            { description: { contains: q.search, mode: "insensitive" } },
            { referenceNo: { contains: q.search, mode: "insensitive" } },
          ]
        : undefined,
    };
  }
  async journals(org: string, q: QueryAccountingDto) {
    const page = q.page ?? 1,
      limit = q.limit ?? 10,
      where = this.whereJournal(org, q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        include: { lines: { include: { account: true, project: true } } },
        orderBy: [{ journalDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
  async createJournal(org: string, userId: string, dto: CreateJournalDto) {
    await this.ensureChart(org);
    this.validate(dto.lines);
    await this.financeSettings.assertPostable(org, new Date(dto.journalDate));
    const row = await this.prisma.$transaction(async (tx) => {
      for (const l of dto.lines)
        if (
          !(await tx.ledgerAccount.findFirst({
            where: { id: l.accountId, organizationId: org, isActive: true },
          }))
        )
          throw new NotFoundException("Ledger account not found");
      await this.assertNoControlAccountLines(tx, org, dto.lines);
      return tx.journalEntry.create({
        data: {
          organizationId: org,
          journalNo: this.no(),
          journalDate: new Date(dto.journalDate),
          referenceNo: dto.referenceNo,
          description: dto.description,
          sourceModule: "MANUAL_JOURNAL",
          sourceType: "ADJUSTMENT",
          sourceId: randomUUID(),
          status: dto.post ? "POSTED" : "DRAFT",
          createdById: userId,
          postedById: dto.post ? userId : null,
          postedAt: dto.post ? new Date() : null,
          lines: { create: dto.lines },
        },
        include: { lines: true },
      });
    });
    await this.log(
      org,
      userId,
      dto.post ? "JOURNAL_POSTED" : "JOURNAL_CREATED",
      row.id,
      row.journalNo,
    );
    return row;
  }
  async postDraft(org: string, userId: string, id: string) {
    const row = await this.prisma.journalEntry.findFirst({
      where: { id, organizationId: org },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException("Journal not found");
    if (row.status !== "DRAFT") throw new BadRequestException("Only draft journals can be posted");
    this.validate(row.lines);
    await this.financeSettings.assertPostable(org, row.journalDate);
    const posted = await this.prisma.journalEntry.update({
      where: { id, organizationId: org },
      data: { status: "POSTED", postedById: userId, postedAt: new Date() },
    });
    await this.log(org, userId, "JOURNAL_POSTED", id, row.journalNo);
    return posted;
  }
  async reverse(org: string, userId: string, id: string) {
    const original = await this.prisma.journalEntry.findFirst({
      where: { id, organizationId: org, status: "POSTED" },
      include: { lines: true },
    });
    if (!original) throw new NotFoundException("Posted journal not found");
    const reversal = await this.prisma.$transaction(async (tx) => {
      const r = await this.post(tx, {
        organizationId: org,
        userId,
        journalDate: new Date(),
        referenceNo: original.journalNo,
        description: `Reversal of ${original.journalNo}: ${original.description}`,
        sourceModule: "JOURNAL_REVERSAL",
        sourceType: "REVERSAL",
        sourceId: original.id,
        lines: original.lines.map((l) => ({
          accountId: l.accountId,
          projectId: l.projectId,
          partyName: l.partyName,
          partyType: l.partyType,
          debit: l.credit,
          credit: l.debit,
          description: l.description,
        })),
      });
      await tx.journalEntry.update({ where: { id: original.id }, data: { status: "REVERSED" } });
      return tx.journalEntry.update({ where: { id: r.id }, data: { reversalOfId: original.id } });
    });
    await this.log(org, userId, "JOURNAL_REVERSED", id, original.journalNo);
    return reversal;
  }

  async reverseSource(tx: Prisma.TransactionClient, org: string, userId: string, sourceModule: string, sourceId: string) {
    const original = await tx.journalEntry.findFirst({ where: { organizationId: org, sourceModule, sourceId }, include: { lines: true } });
    if (!original) throw new NotFoundException("Posted journal not found");
    if (original.status === "REVERSED") {
      return tx.journalEntry.findFirst({ where: { organizationId: org, reversalOfId: original.id } });
    }
    if (original.status !== "POSTED") throw new BadRequestException("Only posted journals can be reversed");
    const reversal = await this.post(tx, {
      organizationId: org, userId, journalDate: new Date(), referenceNo: original.journalNo,
      description: `Reversal of ${original.journalNo}: ${original.description}`,
      sourceModule: "JOURNAL_REVERSAL", sourceType: "REVERSAL", sourceId: original.id,
      lines: original.lines.map((line) => ({ accountId: line.accountId, projectId: line.projectId, partyName: line.partyName, partyType: line.partyType, debit: line.credit, credit: line.debit, description: line.description })),
    });
    await tx.journalEntry.update({ where: { id: original.id }, data: { status: "REVERSED" } });
    return tx.journalEntry.update({ where: { id: reversal.id }, data: { reversalOfId: original.id } });
  }
  async ledger(org: string, q: QueryAccountingDto) {
    const page = q.page ?? 1,
      limit = q.limit ?? 10;
    const where: Prisma.JournalLineWhereInput = {
      account: { organizationId: org },
      accountId: q.accountId,
      projectId: q.projectId,
      partyName: q.party,
      journalEntry: {
        status: "POSTED",
        sourceModule: q.sourceModule,
        journalDate:
          q.dateFrom || q.dateTo
            ? {
                gte: q.dateFrom ? new Date(q.dateFrom) : undefined,
                lte: q.dateTo ? new Date(`${q.dateTo}T23:59:59.999Z`) : undefined,
              }
            : undefined,
        OR: q.search
          ? [
              { journalNo: { contains: q.search, mode: "insensitive" } },
              { description: { contains: q.search, mode: "insensitive" } },
              { referenceNo: { contains: q.search, mode: "insensitive" } },
            ]
          : undefined,
      },
    };
    const openingWhere: Prisma.JournalLineWhereInput = q.dateFrom ? {
      account: { organizationId: org }, accountId: q.accountId, projectId: q.projectId, partyName: q.party,
      journalEntry: { status: "POSTED", journalDate: { lt: new Date(q.dateFrom) } },
    } : { id: { in: [] } };
    const [all, total, openingRows] = await Promise.all([
      this.prisma.journalLine.findMany({
        where,
        include: { account: true, journalEntry: true, project: true },
        orderBy: { journalEntry: { journalDate: "asc" } },
      }),
      this.prisma.journalLine.count({ where }),
      this.prisma.journalLine.findMany({ where: openingWhere, select: { debit: true, credit: true } }),
    ]);
    const openingBalance = openingRows.reduce((sum, line) => sum.add(line.debit).sub(line.credit), D(0));
    let balance = openingBalance;
    const mapped = all.map((l) => {
      balance = balance.add(l.debit).sub(l.credit);
      return { ...l, runningBalance: balance.toFixed(2) };
    });
    const debit = all.reduce((n, l) => n.add(l.debit), D(0)),
      credit = all.reduce((n, l) => n.add(l.credit), D(0));
    return {
      items: mapped.slice((page - 1) * limit, page * limit),
      summary: {
        openingBalance: openingBalance.toFixed(2),
        totalDebit: debit.toFixed(2),
        totalCredit: credit.toFixed(2),
        closingBalance: balance.toFixed(2),
      },
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
  async receivables(org: string, q: QueryAccountingDto) {
    const page = q.page ?? 1,
      limit = q.limit ?? 10;
    const rows = await this.prisma.receivable.findMany({
      where: {
        organizationId: org,
        projectId: q.projectId,
        status: { not: "RECEIVED" },
        OR: q.search
          ? [
              { billNo: { contains: q.search, mode: "insensitive" } },
              { partyName: { contains: q.search, mode: "insensitive" } },
              { project: { workName: { contains: q.search, mode: "insensitive" } } },
            ]
          : undefined,
      },
      include: {
        project: { include: { organizationMaster: true } },
      },
      orderBy: { billDate: "desc" },
    });
    const items = rows
      .map((r) => {
        const received = r.receivedAmount,
          outstanding = Prisma.Decimal.max(D(0), r.amount.sub(received)),
          due = r.dueDate,
          days = due ? Math.max(0, Math.floor((Date.now() - due.getTime()) / 864e5)) : 0;
        return {
          id: r.id,
          project: r.project.workName,
          organization: r.project.organizationMaster.shortName,
          contractValue: r.amount,
          totalBilled: r.amount,
          totalReceived: received,
          outstanding,
          dueDate: due,
          overdueDays: days,
          status: outstanding.eq(0)
            ? "CLEARED"
            : received.gt(0)
              ? "PARTIALLY_RECEIVED"
              : days > 0
                ? "OVERDUE"
                : "CURRENT",
        };
      })
      .filter((r) => r.outstanding.gt(0));
    const total = items.length;
    return {
      items: items.slice((page - 1) * limit, page * limit),
      summary: {
        totalReceivable: items.reduce((n, r) => n.add(r.outstanding), D(0)),
        current: items
          .filter((r) => r.overdueDays === 0)
          .reduce((n, r) => n.add(r.outstanding), D(0)),
        overdue: items
          .filter((r) => r.overdueDays > 0)
          .reduce((n, r) => n.add(r.outstanding), D(0)),
        projects: total,
      },
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async integrity(org: string) {
    await this.ensureChart(org);
    const accounts = await this.prisma.ledgerAccount.findMany({ where: { organizationId: org }, select: { id: true, systemKey: true, linkedBankAccountId: true } });
    const ids = new Map(accounts.filter((a) => a.systemKey).map((a) => [a.systemKey!, a.id]));
    const glBalance = async (accountId: string | undefined, creditNormal = false) => {
      if (!accountId) return D(0);
      const rows = await this.prisma.journalLine.findMany({ where: { accountId, journalEntry: { organizationId: org, status: "POSTED" } }, select: { debit: true, credit: true } });
      const debitMinusCredit = rows.reduce((sum, row) => sum.add(row.debit).sub(row.credit), D(0));
      return creditNormal ? debitMinusCredit.negated() : debitMinusCredit;
    };
    const [arGl, apGl, retentionGl, receivables, payables, heldBills, releasedRetention, banks, journals] = await Promise.all([
      glBalance(ids.get("ACCOUNTS_RECEIVABLE")), glBalance(ids.get("ACCOUNTS_PAYABLE"), true), glBalance(ids.get("RETENTION_RECEIVABLE")),
      this.prisma.receivable.findMany({ where: { organizationId: org }, select: { amount: true, receivedAmount: true } }),
      this.prisma.payable.findMany({ where: { organizationId: org }, select: { amount: true, paidAmount: true } }),
      this.prisma.projectBill.aggregate({ where: { organizationId: org, status: { in: ["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"] } }, _sum: { retentionAmount: true } }),
      this.prisma.retentionRelease.aggregate({ where: { organizationId: org, status: "RELEASED" }, _sum: { amount: true } }),
      this.prisma.bankAccount.findMany({ where: { organizationId: org, isActive: true }, select: { id: true, accountName: true, currentBalance: true } }),
      this.prisma.journalEntry.findMany({ where: { organizationId: org, status: "POSTED" }, include: { lines: { select: { debit: true, credit: true } } } }),
    ]);
    const arSubledger = receivables.reduce((sum, row) => sum.add(row.amount).sub(row.receivedAmount), D(0));
    const apSubledger = payables.reduce((sum, row) => sum.add(row.amount).sub(row.paidAmount), D(0));
    const retentionSubledger = D(heldBills._sum.retentionAmount ?? 0).sub(releasedRetention._sum.amount ?? 0);
    const item = (gl: Prisma.Decimal, subledger: Prisma.Decimal) => ({ glBalance: gl.toFixed(2), subledgerBalance: subledger.toFixed(2), difference: gl.sub(subledger).toFixed(2), status: gl.eq(subledger) ? "BALANCED" : "OUT_OF_BALANCE" });
    const bankRows = await Promise.all(banks.map(async (bank) => {
      const account = accounts.find((a) => a.linkedBankAccountId === bank.id);
      const gl = await glBalance(account?.id);
      return { bankAccountId: bank.id, accountName: bank.accountName, operationalBalance: bank.currentBalance.toFixed(2), glBalance: gl.toFixed(2), difference: gl.sub(bank.currentBalance).toFixed(2), status: gl.eq(bank.currentBalance) ? "BALANCED" : "OUT_OF_BALANCE" };
    }));
    const unbalancedJournalCount = journals.filter((journal) => !journal.lines.reduce((sum, line) => sum.add(line.debit).sub(line.credit), D(0)).isZero()).length;
    return { ar: item(arGl, arSubledger), ap: item(apGl, apSubledger), retention: item(retentionGl, retentionSubledger), banks: bankRows, unbalancedJournalCount };
  }
  async payables(org: string, q: QueryAccountingDto) {
    const page = q.page ?? 1,
      limit = q.limit ?? 10;
    const where: Prisma.PayableWhereInput = {
      organizationId: org,
      projectId: q.projectId,
      status: q.status,
      partyName: q.party ? { contains: q.party, mode: "insensitive" } : undefined,
      OR: q.search
        ? [
            { partyName: { contains: q.search, mode: "insensitive" } },
            { billNo: { contains: q.search, mode: "insensitive" } },
          ]
        : undefined,
    };
    const [items, total, agg] = await this.prisma.$transaction([
      this.prisma.payable.findMany({
        where,
        include: { project: true },
        orderBy: { billDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payable.count({ where }),
      this.prisma.payable.aggregate({ where, _sum: { amount: true, paidAmount: true } }),
    ]);
    return {
      items,
      summary: { totalPayable: D(agg._sum.amount ?? 0).sub(agg._sum.paidAmount ?? 0) },
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
  async createPayable(org: string, userId: string, dto: CreatePayableDto) {
    if (dto.partyId) {
      const party = await this.prisma.party.findFirst({ where: { id: dto.partyId, organizationId: org } });
      if (!party) throw new NotFoundException("Party not found");
      if (party.status === "ARCHIVED") throw new BadRequestException("Cannot link an archived vendor/party to a new payable");
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payable.create({
        data: {
          organizationId: org,
          partyId: dto.partyId,
          partyName: dto.partyName,
          partyType: dto.partyType,
          projectId: dto.projectId,
          billNo: dto.billNo,
          billDate: new Date(dto.billDate),
          amount: dto.amount,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          description: dto.description,
          createdById: userId,
        },
      });
      await this.post(tx, {
        organizationId: org,
        userId,
        journalDate: p.billDate,
        referenceNo: p.billNo,
        description: p.description ?? `Payable to ${p.partyName}`,
        sourceModule: "PAYABLE",
        sourceType: "BILL",
        sourceId: p.id,
        lines: [
          {
            systemKey: p.projectId ? "PROJECT_EXPENSE" : "GENERAL_EXPENSE",
            projectId: p.projectId,
            partyName: p.partyName,
            partyType: p.partyType,
            debit: p.amount,
            credit: 0,
          },
          {
            systemKey: "ACCOUNTS_PAYABLE",
            projectId: p.projectId,
            partyName: p.partyName,
            partyType: p.partyType,
            debit: 0,
            credit: p.amount,
          },
        ],
      });
      return p;
    });
    await this.log(org, userId, "PAYABLE_CREATED", row.id, row.billNo);
    return row;
  }
  async payPayable(org: string, userId: string, id: string, dto: PayPayableDto) {
    const row = await this.prisma.payable.findFirst({ where: { id, organizationId: org } });
    if (!row) throw new NotFoundException("Payable not found");
    const remaining = row.amount.sub(row.paidAmount);
    if (D(dto.amount).gt(remaining))
      throw new BadRequestException("Payment exceeds outstanding payable");
    const result = await this.prisma.$transaction(async (tx) => {
      await this.cashBank.post(tx, { organizationId: org, accountId: dto.accountId, direction: "OUT", amount: dto.amount, sourceModule: "PAYABLE", sourceType: "PAYMENT", sourceId: `${row.id}:${randomUUID()}`, referenceNo: dto.referenceNo ?? row.billNo, description: `Payment to ${row.partyName}`, transactionDate: new Date(dto.paymentDate), createdById: userId });
      await this.post(tx, {
        organizationId: org,
        userId,
        journalDate: new Date(dto.paymentDate),
        referenceNo: dto.referenceNo ?? row.billNo,
        description: `Payment to ${row.partyName}`,
        sourceModule: "PAYABLE",
        sourceType: "PAYMENT",
        sourceId: `${row.id}:${randomUUID()}`,
        lines: [
          {
            systemKey: "ACCOUNTS_PAYABLE",
            partyName: row.partyName,
            partyType: row.partyType,
            debit: dto.amount,
            credit: 0,
          },
          {
            bankAccountId: dto.accountId,
            partyName: row.partyName,
            partyType: row.partyType,
            debit: 0,
            credit: dto.amount,
          },
        ],
      });
      const paid = row.paidAmount.add(dto.amount);
      return tx.payable.update({
        where: { id, organizationId: org },
        data: { paidAmount: paid, status: paid.eq(row.amount) ? "PAID" : "PARTIALLY_PAID" },
      });
    });
    await this.log(org, userId, "PAYABLE_PAID", id, row.billNo, dto.amount);
    return result;
  }
  async projectAccounts(org: string, q: QueryAccountingDto) {
    const rows = await this.prisma.cmsWork.findMany({
      where: { organizationId: org, id: q.projectId },
      include: {
        organizationMaster: true,
        projectExpenses: { where: { status: { not: "REJECTED" } } },
        receipts: { where: { status: "RECEIVED" } },
        tender: { include: { tenderSecurities: true, creditCommitments: true } },
        documentPurchase: true,
      },
    });
    return rows.map((r) => {
      const expense = r.projectExpenses.reduce((n, x) => n.add(x.amount), D(0)),
        received = r.receipts.reduce((n, x) => n.add(x.amount), D(0)),
        securityCost = r.tender?.tenderSecurities.reduce((n, x) => n.add(x.marginAmount), D(0)) ?? D(0),
        commitmentCost = r.tender?.creditCommitments.reduce((n, x) => n.add(x.totalAmount), D(0)) ?? D(0),
        otherCost = r.documentPurchase?.documentPrice ?? D(0),
        totalCost = expense.add(securityCost).add(commitmentCost).add(otherCost),
        profit = r.contractValue.sub(totalCost);
      return {
        id: r.id,
        project: r.workName,
        organization: r.organizationMaster.shortName,
        category: r.workCategory,
        contractValue: r.contractValue,
        totalReceived: received,
        outstanding: Prisma.Decimal.max(D(0), r.contractValue.sub(received)),
        projectExpense: expense,
        tenderSecurityCost: securityCost,
        creditCommitmentCost: commitmentCost,
        pgBgCost: D(0),
        bankCharges: D(0),
        otherCosts: otherCost,
        totalCost,
        estimatedProfit: profit,
        profitMargin: r.contractValue.gt(0) ? profit.div(r.contractValue).mul(100) : D(0),
      };
    });
  }
  async partyLedger(org: string, q: QueryAccountingDto) {
    if (!q.party)
      return {
        items: [],
        summary: { totalDebit: 0, totalCredit: 0, closingBalance: 0 },
        meta: { page: 1, limit: 10, total: 0, totalPages: 1 },
      };
    return this.ledger(org, { ...q, party: q.party });
  }
  async openingBalances(org: string, q: QueryAccountingDto) {
    return this.journals(org, { ...q, sourceModule: "OPENING_BALANCE" });
  }
  async createOpening(org: string, userId: string, dto: OpeningBalanceDto) {
    this.validate(dto.lines);
    const row = await this.prisma.$transaction((tx) =>
      this.post(tx, {
        organizationId: org,
        userId,
        journalDate: new Date(dto.openingDate),
        referenceNo: dto.referenceNo,
        description: dto.description,
        sourceModule: "OPENING_BALANCE",
        sourceType: "OPENING",
        sourceId: randomUUID(),
        lines: dto.lines,
      }),
    );
    await this.log(org, userId, "OPENING_BALANCE_POSTED", row.id, row.journalNo);
    return row;
  }
  async summary(org: string) {
    const now = new Date(),
      month = new Date(now.getFullYear(), now.getMonth(), 1);
    const [receivable, payable, income, expense, journals] = await Promise.all([
      this.receivables(org, { limit: 100 }),
      this.prisma.payable.aggregate({
        where: { organizationId: org, status: { not: "PAID" } },
        _sum: { amount: true, paidAmount: true },
      }),
      this.prisma.receipt.aggregate({
        where: { organizationId: org, status: "RECEIVED", receiptDate: { gte: month } },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: { organizationId: org, status: { not: "REJECTED" }, expenseDate: { gte: month } },
        _sum: { amount: true },
      }),
      this.prisma.journalEntry.findMany({
        where: { organizationId: org },
        include: { lines: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);
    const rec = D(receivable.summary.totalReceivable),
      pay = D(payable._sum.amount ?? 0).sub(payable._sum.paidAmount ?? 0),
      inc = D(income._sum.amount ?? 0),
      exp = D(expense._sum.amount ?? 0);
    return {
      totalReceivable: rec,
      totalPayable: pay,
      thisMonthIncome: inc,
      thisMonthExpense: exp,
      netFinancialPosition: rec.sub(pay),
      outstandingProjects: receivable.summary.projects,
      recentJournals: journals,
    };
  }
  private log(
    org: string,
    userId: string,
    action: string,
    id: string,
    ref: string,
    amount?: unknown,
  ) {
    return this.audit.record({
      organizationId: org,
      userId,
      action,
      module: "Accounts",
      description: `${action.replaceAll("_", " ")}${amount == null ? "" : ` - BDT ${amount}`}`,
      referenceNo: ref,
      entityType: "Accounting",
      entityId: id,
      newValue: amount == null ? undefined : { amount: String(amount) },
    });
  }
}
