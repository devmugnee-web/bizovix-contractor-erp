import { randomUUID } from "crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { CreateBankAccountDto, CreateCashTransactionDto, CreateChequeDto, CreatePettyExpenseDto, CreateReconciliationDto, CreateTransferDto, QueryLedgerDto, UpdateChequeStatusDto } from "./dto/cash-bank.dto";

type Tx = Prisma.TransactionClient;

@Injectable()
export class CashBankService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  private no(prefix: string) { return `${prefix}-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`; }
  private async account(tx: Tx | PrismaService, organizationId: string, id: string) {
    const row = await tx.bankAccount.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException("Financial account not found");
    return row;
  }
  private async namedCash(tx: Tx | PrismaService, organizationId: string, name: "Main Cash" | "Petty Cash") {
    const row = await tx.bankAccount.findFirst({ where: { organizationId, accountType: "CASH", accountName: name } });
    if (!row) throw new NotFoundException(`${name} account is not configured`);
    return row;
  }

  async post(tx: Tx, input: { organizationId: string; accountId: string; direction: "IN" | "OUT"; amount: Prisma.Decimal | number; sourceModule: string; sourceType: string; sourceId: string; referenceNo?: string | null; description: string; transactionDate: Date; createdById?: string | null }) {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) throw new BadRequestException("Amount must be greater than zero");
    await this.account(tx, input.organizationId, input.accountId);
    const updated = await tx.bankAccount.update({ where: { id: input.accountId }, data: { currentBalance: input.direction === "IN" ? { increment: amount } : { decrement: amount } } });
    return tx.financialTransaction.create({ data: { ...input, amount, transactionNo: this.no("FT"), balanceAfter: updated.currentBalance, status: "POSTED" } });
  }

  async ensureCashAccounts(organizationId: string) {
    for (const name of ["Main Cash", "Petty Cash"] as const) {
      await this.prisma.bankAccount.upsert({ where: { id: `${organizationId}:${name}` }, update: {}, create: { id: `${organizationId}:${name}`, organizationId, accountName: name, accountType: "CASH", openingBalance: 0, currentBalance: 0, openingBalanceDate: new Date(), currency: "BDT" } });
    }
  }

  async accounts(organizationId: string) { await this.ensureCashAccounts(organizationId); return this.prisma.bankAccount.findMany({ where: { organizationId }, orderBy: [{ accountType: "asc" }, { accountName: "asc" }] }); }

  async summary(organizationId: string) {
    await this.ensureCashAccounts(organizationId);
    const [accounts, today] = await Promise.all([
      this.prisma.bankAccount.findMany({ where: { organizationId, isActive: true } }),
      this.prisma.financialTransaction.groupBy({ by: ["direction"], where: { organizationId, transactionDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }, _sum: { amount: true } }),
    ]);
    const balance = (name: string) => accounts.find((a) => a.accountName === name)?.currentBalance ?? new Prisma.Decimal(0);
    return { mainCashBalance: balance("Main Cash"), pettyCashBalance: balance("Petty Cash"), totalBankBalance: accounts.filter((a) => a.accountType === "BANK").reduce((n, a) => n.add(a.currentBalance), new Prisma.Decimal(0)), todayCashIn: today.find((v) => v.direction === "IN")?._sum.amount ?? 0, todayCashOut: today.find((v) => v.direction === "OUT")?._sum.amount ?? 0 };
  }

  async createBankAccount(organizationId: string, userId: string, dto: CreateBankAccountDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const account = await tx.bankAccount.create({ data: { organizationId, accountType: "BANK", bankName: dto.bankName.trim(), accountName: dto.accountName.trim(), accountNumber: dto.accountNumber.trim(), branch: dto.branch.trim(), routingNumber: dto.routingNumber?.trim() || null, bankAccountType: dto.bankAccountType, openingBalance: dto.openingBalance, openingBalanceDate: new Date(dto.openingBalanceDate), currentBalance: 0, currency: dto.currency || "BDT", remarks: dto.remarks?.trim() || null, isActive: dto.status !== "Inactive" } });
      if (dto.openingBalance > 0) await this.post(tx, { organizationId, accountId: account.id, direction: "IN", amount: dto.openingBalance, sourceModule: "BANK_ACCOUNT", sourceType: "OPENING_BALANCE", sourceId: account.id, description: "Opening balance", transactionDate: new Date(dto.openingBalanceDate), createdById: userId });
      return tx.bankAccount.findUniqueOrThrow({ where: { id: account.id } });
    });
    await this.log(organizationId, userId, "BANK_ACCOUNT_CREATED", "BankAccount", row.id, row.accountName, row.currentBalance);
    return row;
  }

  async updateBankAccount(organizationId: string, userId: string, id: string, dto: Partial<CreateBankAccountDto>) {
    await this.account(this.prisma, organizationId, id);
    const row = await this.prisma.bankAccount.update({ where: { id }, data: { bankName: dto.bankName, accountName: dto.accountName, accountNumber: dto.accountNumber, branch: dto.branch, routingNumber: dto.routingNumber, bankAccountType: dto.bankAccountType, currency: dto.currency, remarks: dto.remarks, isActive: dto.status ? dto.status === "Active" : undefined } });
    await this.log(organizationId, userId, "BANK_ACCOUNT_UPDATED", "BankAccount", id, row.accountName);
    return row;
  }

  async cashTransactions(organizationId: string, kind: "Main Cash" | "Petty Cash", query: QueryLedgerDto) { const a = await this.namedCash(this.prisma, organizationId, kind); return this.ledger(organizationId, { ...query, accountId: a.id }); }
  async createMainCash(organizationId: string, userId: string, dto: CreateCashTransactionDto) {
    const account = await this.namedCash(this.prisma, organizationId, "Main Cash");
    const sourceId = randomUUID();
    const row = await this.prisma.$transaction((tx) => this.post(tx, { organizationId, accountId: account.id, direction: dto.direction, amount: dto.amount, sourceModule: "MAIN_CASH", sourceType: dto.category, sourceId, referenceNo: dto.referenceNo, description: `${dto.party}: ${dto.description || dto.category}`, transactionDate: new Date(dto.transactionDate), createdById: userId }));
    await this.log(organizationId, userId, dto.direction === "IN" ? "CASH_IN_CREATED" : "CASH_OUT_CREATED", "FinancialTransaction", row.id, row.transactionNo, row.amount);
    return row;
  }
  async createPettyExpense(organizationId: string, userId: string, dto: CreatePettyExpenseDto) {
    const account = await this.namedCash(this.prisma, organizationId, "Petty Cash"); const sourceId = randomUUID();
    const row = await this.prisma.$transaction((tx) => this.post(tx, { organizationId, accountId: account.id, direction: "OUT", amount: dto.amount, sourceModule: "PETTY_CASH", sourceType: dto.category, sourceId, referenceNo: dto.referenceNo, description: `${dto.party}: ${dto.description}`, transactionDate: new Date(dto.transactionDate), createdById: userId }));
    await this.log(organizationId, userId, "PETTY_CASH_EXPENSE_CREATED", "FinancialTransaction", row.id, row.transactionNo, row.amount); return row;
  }

  async transfer(organizationId: string, userId: string, dto: CreateTransferDto, replenishment = false) {
    if (dto.fromAccountId === dto.toAccountId) throw new BadRequestException("Source and destination must be different");
    const charge = new Prisma.Decimal(dto.bankCharge ?? 0); if (charge.lt(0)) throw new BadRequestException("Bank charge cannot be negative");
    const row = await this.prisma.$transaction(async (tx) => {
      await Promise.all([this.account(tx, organizationId, dto.fromAccountId), this.account(tx, organizationId, dto.toAccountId)]);
      const transfer = await tx.fundTransfer.create({ data: { organizationId, transferNo: this.no("TRF"), fromAccountId: dto.fromAccountId, toAccountId: dto.toAccountId, amount: dto.amount, bankCharge: charge, referenceNo: dto.referenceNo, description: dto.description, transferDate: new Date(dto.transferDate), createdById: userId } });
      await this.post(tx, { organizationId, accountId: dto.fromAccountId, direction: "OUT", amount: dto.amount, sourceModule: replenishment ? "PETTY_CASH" : "BANK_TRANSFER", sourceType: "TRANSFER_OUT", sourceId: transfer.id, referenceNo: transfer.transferNo, description: dto.description || "Fund transfer", transactionDate: transfer.transferDate, createdById: userId });
      await this.post(tx, { organizationId, accountId: dto.toAccountId, direction: "IN", amount: dto.amount, sourceModule: replenishment ? "PETTY_CASH" : "BANK_TRANSFER", sourceType: "TRANSFER_IN", sourceId: transfer.id, referenceNo: transfer.transferNo, description: dto.description || "Fund transfer", transactionDate: transfer.transferDate, createdById: userId });
      if (charge.gt(0)) await this.post(tx, { organizationId, accountId: dto.fromAccountId, direction: "OUT", amount: charge, sourceModule: "BANK_TRANSFER", sourceType: "BANK_CHARGE", sourceId: transfer.id, referenceNo: transfer.transferNo, description: "Bank transfer charge", transactionDate: transfer.transferDate, createdById: userId });
      return transfer;
    });
    await this.log(organizationId, userId, replenishment ? "PETTY_CASH_REPLENISHED" : "BANK_TRANSFER_CREATED", "FundTransfer", row.id, row.transferNo, row.amount); return row;
  }
  async replenish(organizationId: string, userId: string, dto: Omit<CreateTransferDto, "toAccountId">) { const petty = await this.namedCash(this.prisma, organizationId, "Petty Cash"); return this.transfer(organizationId, userId, { ...dto, toAccountId: petty.id }, true); }

  async transfers(organizationId: string, query: QueryLedgerDto) { const page = Math.max(1, query.page ?? 1), limit = Math.min(100, query.limit ?? 10); const where: Prisma.FundTransferWhereInput = { organizationId, ...(query.dateFrom || query.dateTo ? { transferDate: { gte: query.dateFrom ? new Date(query.dateFrom) : undefined, lte: query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined } } : {}) }; const [items, total] = await this.prisma.$transaction([this.prisma.fundTransfer.findMany({ where, include: { fromAccount: true, toAccount: true }, orderBy: { transferDate: "desc" }, skip: (page - 1) * limit, take: limit }), this.prisma.fundTransfer.count({ where })]); return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } }; }

  async ledger(organizationId: string, query: QueryLedgerDto) { const page = Math.max(1, query.page ?? 1), limit = Math.min(100, query.limit ?? 10); const where: Prisma.FinancialTransactionWhereInput = { organizationId, accountId: query.accountId, direction: query.direction, sourceModule: query.sourceModule, transactionDate: query.dateFrom || query.dateTo ? { gte: query.dateFrom ? new Date(query.dateFrom) : undefined, lte: query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined } : undefined, OR: query.search ? [{ transactionNo: { contains: query.search, mode: "insensitive" } }, { referenceNo: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] : undefined }; const [items, total, sums] = await this.prisma.$transaction([this.prisma.financialTransaction.findMany({ where, include: { account: true }, orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * limit, take: limit }), this.prisma.financialTransaction.count({ where }), this.prisma.financialTransaction.groupBy({ by: ["direction"], where, orderBy: { direction: "asc" }, _sum: { amount: true } })]); return { items, summary: Object.fromEntries(sums.map((s) => [s.direction, s._sum?.amount ?? 0])), meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } }; }

  async reconciliations(organizationId: string) { return this.prisma.bankReconciliation.findMany({ where: { organizationId }, include: { account: true }, orderBy: { createdAt: "desc" } }); }
  async reconcile(organizationId: string, userId: string, dto: CreateReconciliationDto) { const account = await this.account(this.prisma, organizationId, dto.accountId); const statement = new Prisma.Decimal(dto.statementBalance); const row = await this.prisma.bankReconciliation.create({ data: { organizationId, accountId: account.id, statementFrom: new Date(dto.statementFrom), statementTo: new Date(dto.statementTo), erpBalance: account.currentBalance, statementBalance: statement, difference: statement.minus(account.currentBalance), status: statement.equals(account.currentBalance) ? "RECONCILED" : "NEEDS_REVIEW", reconciledById: userId, reconciledAt: statement.equals(account.currentBalance) ? new Date() : null } }); await this.log(organizationId, userId, "RECONCILIATION_COMPLETED", "BankReconciliation", row.id, account.accountName); return row; }

  async cheques(organizationId: string) { return this.prisma.cheque.findMany({ where: { organizationId }, include: { account: true }, orderBy: { chequeDate: "desc" } }); }
  async createCheque(organizationId: string, userId: string, dto: CreateChequeDto) { if (dto.accountId) await this.account(this.prisma, organizationId, dto.accountId); const row = await this.prisma.cheque.create({ data: { ...dto, organizationId, amount: dto.amount, chequeDate: new Date(dto.chequeDate), actionDate: dto.actionDate ? new Date(dto.actionDate) : null, createdById: userId } }); await this.log(organizationId, userId, "CHEQUE_CREATED", "Cheque", row.id, row.chequeNo, row.amount); return row; }
  async chequeStatus(organizationId: string, userId: string, id: string, dto: UpdateChequeStatusDto) { const cheque = await this.prisma.cheque.findFirst({ where: { id, organizationId } }); if (!cheque) throw new NotFoundException("Cheque not found"); const row = await this.prisma.$transaction(async (tx) => { const updated = await tx.cheque.update({ where: { id }, data: { status: dto.status, actionDate: dto.actionDate ? new Date(dto.actionDate) : undefined } }); if (dto.status === "CLEARED" && !cheque.postedAt) { if (!cheque.accountId) throw new BadRequestException("A bank account is required before clearing this cheque"); await this.post(tx, { organizationId, accountId: cheque.accountId, direction: cheque.type === "RECEIVED" ? "IN" : "OUT", amount: cheque.amount, sourceModule: "CHEQUE", sourceType: cheque.type, sourceId: cheque.id, referenceNo: cheque.chequeNo, description: `${cheque.type === "RECEIVED" ? "Received from" : "Issued to"} ${cheque.party}`, transactionDate: dto.actionDate ? new Date(dto.actionDate) : new Date(), createdById: userId }); return tx.cheque.update({ where: { id }, data: { postedAt: new Date() } }); } return updated; }); await this.log(organizationId, userId, `CHEQUE_${dto.status}`, "Cheque", id, cheque.chequeNo, cheque.amount); return row; }

  private log(organizationId: string, userId: string, action: string, entityType: string, entityId: string, referenceNo: string, amount?: unknown) { return this.audit.record({ organizationId, userId, action, module: "Cash & Bank", description: `${action.replaceAll("_", " ")}${amount == null ? "" : ` - BDT ${amount}`}`, referenceNo, entityType, entityId, newValue: amount == null ? undefined : { amount: String(amount) } }); }
}
