import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CashBankService } from "../cash-bank/cash-bank.service";
import { AccountingService } from "../accounting/accounting.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { CreateProjectExpensesBatchDto } from "./dto/create-project-expenses-batch.dto";
import { QueryProjectExpenseDto } from "./dto/query-project-expense.dto";
import { SaveProjectExpenseDto } from "./dto/save-project-expense.dto";
import { UpdateProjectExpenseDto } from "./dto/update-project-expense.dto";
import { SaveExpenseHeadDto } from "./dto/save-expense-head.dto";

const includeRelations = {
  expenseHead: { select: { id: true, name: true, nature: true, ledgerAccountId: true, ledgerAccount: { select: { id: true, code: true, name: true } } } },
  expenseBy: { select: { id: true, name: true } },
  paidFromAccount: { select: { id: true, accountName: true, accountNumber: true } },
  expenseLedger: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRecord = Prisma.ExpenseGetPayload<{ include: typeof includeRelations }>;
type DbClient = PrismaService | Prisma.TransactionClient;

function toDto(record: ExpenseRecord) {
  const expenseByValue = record.expenseBy?.name ?? (record.expenseById?.startsWith("CUSTOM:") ? record.expenseById.substring(7) : record.expenseById ?? "Unknown");
  return {
    id: record.id,
    referenceNo: record.referenceNo,
    workId: record.workId!,
    expenseDate: record.expenseDate,
    amount: record.amount.toFixed(2),
    description: record.description,
    status: record.status,
    replacesExpenseId: record.replacesExpenseId,
    cancelledAt: record.cancelledAt,
    cancelledById: record.cancelledById,
    cancellationReason: record.cancellationReason,
    expenseHead: record.expenseHead!,
    expenseLedger: record.expenseLedger,
    expenseBy: { id: record.expenseById ?? "", name: expenseByValue },
    paidFromAccount: record.paidFromAccount!,
  };
}

@Injectable()
export class ProjectExpensesService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogService: AuditLogService, private readonly cashBank: CashBankService, private readonly accounting: AccountingService, private readonly numbering: NumberingService, private readonly lifecycle: ProjectLifecycleGuardService) {}

  private where(organizationId: string, query: QueryProjectExpenseDto): Prisma.ExpenseWhereInput {
    return {
      organizationId,
      workId: query.workId,
      expenseHeadId: { not: null },
      status: { notIn: ["CANCELLED", "AMENDED"] },
      ...(query.expenseHeadId ? { expenseHeadId: query.expenseHeadId } : {}),
      ...(query.expenseById ? { expenseById: query.expenseById } : {}),
      ...(query.paidFromAccountId ? { paidFromAccountId: query.paidFromAccountId } : {}),
      ...(query.search ? { OR: [
        { description: { contains: query.search, mode: "insensitive" } },
        { expenseHead: { name: { contains: query.search, mode: "insensitive" } } },
        { expenseBy: { name: { contains: query.search, mode: "insensitive" } } },
        { paidFromAccount: { accountName: { contains: query.search, mode: "insensitive" } } },
      ] } : {}),
      ...(query.fromDate || query.toDate ? { expenseDate: {
        ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
      } } : {}),
    };
  }

  private async assertWork(organizationId: string, workId: string, client: DbClient = this.prisma) {
    const work = await client.cmsWork.findFirst({ where: { id: workId, organizationId, status: "ONGOING" } });
    if (!work) throw new NotFoundException("Ongoing project not found");
    return work;
  }

  private async assertReferences(organizationId: string, dto: SaveProjectExpenseDto, client: DbClient = this.prisma) {
    const [work, head, account] = await Promise.all([
      this.assertWork(organizationId, dto.workId, client),
      client.expenseHead.findFirst({ where: { id: dto.expenseHeadId, organizationId, isActive: true }, include: { ledgerAccount: true } }),
      client.bankAccount.findFirst({ where: { id: dto.paidFromAccountId, organizationId, isActive: true } }),
    ]);
    if (!head) throw new NotFoundException("Expense head not found");
    if (!head.ledgerAccountId) throw new BadRequestException("Expense head must have a Chart of Accounts ID before posting");
    if (head.ledgerAccountId && (!head.ledgerAccount || !head.ledgerAccount.isActive || head.ledgerAccount.accountType !== "EXPENSE" || head.ledgerAccount.isControlAccount)) throw new BadRequestException("The expense head is mapped to an invalid or inactive posting ledger");
    if (!account) throw new NotFoundException("Payment account not found");
    const person = await client.organizationUser.findFirst({ where: { organizationId, userId: dto.expenseById, user: { isActive: true } } });
    if (!person) throw new NotFoundException("Expense person not found");
    return { work, head, person, account };
  }

  private async createRecord(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    dto: SaveProjectExpenseDto,
    head: { name: string; nature: "DIRECT" | "INDIRECT"; ledgerAccountId: string | null },
  ) {
    const referenceNo = await this.numbering.next(organizationId, "EXPENSE", tx);
    const expense = await tx.expense.create({
      data: {
        organizationId,
        workId: dto.workId,
        expenseHeadId: dto.expenseHeadId,
        expenseById: dto.expenseById,
        paidFromAccountId: dto.paidFromAccountId,
        expenseLedgerAccountId: head.ledgerAccountId,
        expenseNature: head.nature,
        category: head.name,
        description: dto.description?.trim() || null,
        amount: dto.amount,
        expenseDate: new Date(dto.expenseDate),
        status: "APPROVED",
        referenceNo,
        createdById: userId,
      },
      include: includeRelations,
    });
    const description = dto.description?.trim() || head.name;
    await this.cashBank.post(tx, { organizationId, accountId: dto.paidFromAccountId, direction: "OUT", amount: dto.amount, sourceModule: "PROJECT_EXPENSE", sourceType: "EXPENSE", sourceId: expense.id, referenceNo, description, transactionDate: expense.expenseDate, createdById: userId });
    await this.accounting.post(tx, { organizationId, userId, journalDate: expense.expenseDate, referenceNo, description, sourceModule: "PROJECT_EXPENSE", sourceType: "EXPENSE", sourceId: expense.id, lines: [{ accountId: head.ledgerAccountId!, projectId: dto.workId, debit: dto.amount, credit: 0 }, { bankAccountId: dto.paidFromAccountId, projectId: dto.workId, debit: 0, credit: dto.amount }] });
    return expense;
  }

  async findAll(organizationId: string, query: QueryProjectExpenseDto) {
    await this.assertWork(organizationId, query.workId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 5;
    const where = this.where(organizationId, query);
    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({ where, include: includeRelations, orderBy: [{ expenseDate: "desc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
      this.prisma.expense.count({ where }),
    ]);
    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.expense.findFirst({ where: { id, organizationId, workId: { not: null }, expenseHeadId: { not: null } }, include: includeRelations });
    if (!record) throw new NotFoundException("Project expense not found");
    return toDto(record);
  }

  heads(organizationId: string) {
    return this.prisma.expenseHead.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true, nature: true, ledgerAccountId: true, ledgerAccount: { select: { id: true, code: true, name: true } } }, orderBy: { name: "asc" } });
  }

  manageHeads(organizationId: string) {
    return this.prisma.expenseHead.findMany({
      where: { organizationId },
      select: { id: true, name: true, budgetCategory: true, nature: true, ledgerAccountId: true, ledgerAccount: { select: { id: true, code: true, name: true } }, isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async createHead(organizationId: string, userId: string, dto: SaveExpenseHeadDto) {
    const ledgerAccountId = await this.validateExpenseLedger(organizationId, dto.ledgerAccountId);
    const record = await this.prisma.expenseHead.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        budgetCategory: dto.budgetCategory?.trim() || null,
        nature: dto.nature ?? "INDIRECT",
        ledgerAccountId,
        isActive: dto.isActive ?? true,
      },
      select: { id: true, name: true, budgetCategory: true, nature: true, ledgerAccountId: true, ledgerAccount: { select: { id: true, code: true, name: true } }, isActive: true },
    });
    await this.auditLogService.record({ organizationId, userId, action: "create", entityType: "ExpenseHead", entityId: record.id, newValue: record });
    return record;
  }

  async updateHead(organizationId: string, userId: string, id: string, dto: SaveExpenseHeadDto) {
    const existing = await this.prisma.expenseHead.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Expense head not found");
    const ledgerAccountId = await this.validateExpenseLedger(organizationId, dto.ledgerAccountId);
    const record = await this.prisma.expenseHead.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        budgetCategory: dto.budgetCategory?.trim() || null,
        ...(dto.nature === undefined ? {} : { nature: dto.nature }),
        ledgerAccountId,
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      },
      select: { id: true, name: true, budgetCategory: true, nature: true, ledgerAccountId: true, ledgerAccount: { select: { id: true, code: true, name: true } }, isActive: true },
    });
    await this.auditLogService.record({ organizationId, userId, action: "update", entityType: "ExpenseHead", entityId: id, oldValue: existing, newValue: record });
    return record;
  }

  private async validateExpenseLedger(organizationId: string, ledgerAccountId?: string | null) {
    const normalized = ledgerAccountId?.trim();
    if (!normalized) throw new BadRequestException("Chart of Accounts ID is required");
    const ledger = await this.prisma.ledgerAccount.findFirst({ where: { id: normalized, organizationId, isActive: true, accountType: "EXPENSE", isControlAccount: false }, select: { id: true } });
    if (!ledger) throw new NotFoundException("Expense ledger account not found");
    return ledger.id;
  }

  async people(organizationId: string) {
    const rows = await this.prisma.organizationUser.findMany({ where: { organizationId, user: { isActive: true } }, select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } });
    return rows.map((row) => row.user);
  }

  async create(organizationId: string, userId: string, dto: SaveProjectExpenseDto) {
    await this.lifecycle.assertOperationalMutationAllowed(organizationId, dto.workId, "recording a normal project expense");
    const { head } = await this.assertReferences(organizationId, dto);
    const record = await this.prisma.$transaction((tx) => this.createRecord(tx, organizationId, userId, dto, head));
    await this.auditLogService.record({ organizationId, userId, action: "create", entityType: "ProjectExpense", entityId: record.id, newValue: toDto(record) });
    return toDto(record);
  }

  async createBatch(organizationId: string, userId: string, dto: CreateProjectExpensesBatchDto) {
    const records = await this.prisma.$transaction(async (tx) => {
      const heads: Array<{ name: string; nature: "DIRECT" | "INDIRECT"; ledgerAccountId: string | null }> = [];
      for (const expense of dto.expenses) {
        await this.lifecycle.assertOperationalMutationAllowed(organizationId, expense.workId, "recording a normal project expense", tx);
        const { head } = await this.assertReferences(organizationId, expense, tx);
        heads.push(head);
      }

      const created: ExpenseRecord[] = [];
      for (const [index, expense] of dto.expenses.entries()) {
        const record = await this.createRecord(tx, organizationId, userId, expense, heads[index]!);
        await this.auditLogService.record({ organizationId, userId, action: "create", entityType: "ProjectExpense", entityId: record.id, newValue: toDto(record) }, tx);
        created.push(record);
      }
      return created;
    }, { timeout: 30_000 });
    return records.map(toDto);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateProjectExpenseDto) {
    const existing = await this.findOne(organizationId, id);
    if (["CANCELLED", "AMENDED"].includes(existing.status)) throw new BadRequestException("Cancelled or amended expense cannot be edited");
    const financialChange = dto.workId !== undefined || dto.expenseDate !== undefined || dto.expenseHeadId !== undefined || dto.amount !== undefined || dto.expenseById !== undefined || dto.paidFromAccountId !== undefined;
    if (!financialChange) {
      const metadata = await this.prisma.expense.update({ where: { id, organizationId }, data: { description: dto.description?.trim() || null }, include: includeRelations });
      await this.auditLogService.record({ organizationId, userId, action: "EXPENSE_METADATA_UPDATED", entityType: "ProjectExpense", entityId: id, oldValue: existing, newValue: toDto(metadata) });
      return toDto(metadata);
    }
    const merged: SaveProjectExpenseDto = {
      workId: dto.workId ?? existing.workId,
      expenseDate: dto.expenseDate ?? new Date(existing.expenseDate).toISOString().slice(0, 10),
      expenseHeadId: dto.expenseHeadId ?? existing.expenseHead.id,
      amount: dto.amount ?? Number(existing.amount),
      expenseById: dto.expenseById ?? existing.expenseBy.id,
      paidFromAccountId: dto.paidFromAccountId ?? existing.paidFromAccount.id,
      description: dto.description ?? existing.description ?? undefined,
    };
    const { head } = await this.assertReferences(organizationId, merged);
    const record = await this.prisma.$transaction(async (tx) => {
      await this.accounting.reverseSource(tx, organizationId, userId, "PROJECT_EXPENSE", id);
      await this.cashBank.reverseSource(tx, { organizationId, sourceModule: "PROJECT_EXPENSE", sourceId: id, userId, reason: "Expense amendment" });
      await tx.expense.update({ where: { id, organizationId }, data: { status: "AMENDED", cancelledAt: new Date(), cancelledById: userId, cancellationReason: "Replaced by financial amendment" } });
      const referenceNo = await this.numbering.next(organizationId, "EXPENSE", tx);
      const replacement = await tx.expense.create({ data: { organizationId, workId: merged.workId, expenseHeadId: merged.expenseHeadId, expenseById: merged.expenseById, paidFromAccountId: merged.paidFromAccountId, expenseLedgerAccountId: head.ledgerAccountId, expenseNature: head.nature, category: head.name, description: merged.description?.trim() || null, amount: merged.amount, expenseDate: new Date(merged.expenseDate), status: "APPROVED", referenceNo, createdById: userId, replacesExpenseId: id }, include: includeRelations });
      await this.cashBank.post(tx, { organizationId, accountId: merged.paidFromAccountId, direction: "OUT", amount: merged.amount, sourceModule: "PROJECT_EXPENSE", sourceType: "EXPENSE", sourceId: replacement.id, referenceNo, description: merged.description?.trim() || head.name, transactionDate: replacement.expenseDate, createdById: userId });
      await this.accounting.post(tx, { organizationId, userId, journalDate: replacement.expenseDate, referenceNo, description: merged.description?.trim() || head.name, sourceModule: "PROJECT_EXPENSE", sourceType: "EXPENSE", sourceId: replacement.id, lines: [{ accountId: head.ledgerAccountId!, projectId: merged.workId, debit: merged.amount, credit: 0 }, { bankAccountId: merged.paidFromAccountId, projectId: merged.workId, debit: 0, credit: merged.amount }] });
      return replacement;
    });
    await this.auditLogService.record({ organizationId, userId, action: "EXPENSE_AMENDED", entityType: "ProjectExpense", entityId: id, oldValue: existing, newValue: toDto(record) });
    return toDto(record);
  }

  async remove(organizationId: string, userId: string, id: string) {
    const existing = await this.findOne(organizationId, id);
    if (["CANCELLED", "AMENDED"].includes(existing.status)) return existing;
    const row = await this.prisma.$transaction(async (tx) => {
      await this.accounting.reverseSource(tx, organizationId, userId, "PROJECT_EXPENSE", id);
      await this.cashBank.reverseSource(tx, { organizationId, sourceModule: "PROJECT_EXPENSE", sourceId: id, userId, reason: "Expense cancellation" });
      return tx.expense.update({ where: { id, organizationId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: userId, cancellationReason: "Cancelled by user" }, include: includeRelations });
    });
    await this.auditLogService.record({ organizationId, userId, action: "EXPENSE_CANCELLED", entityType: "ProjectExpense", entityId: id, oldValue: existing, newValue: toDto(row) });
    return toDto(row);
  }

  async exportCsv(organizationId: string, userId: string, query: QueryProjectExpenseDto) {
    await this.assertWork(organizationId, query.workId);
    const rows = await this.prisma.expense.findMany({ where: this.where(organizationId, query), include: includeRelations, orderBy: [{ expenseDate: "desc" }, { id: "asc" }] });
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const lines = [
      ["SL", "Expense Date", "Expense For / Head", "Amount (BDT)", "Expense By / Through", "Paid From", "Description"].map(escape).join(","),
      ...rows.map((row, index) => [String(index + 1), row.expenseDate.toISOString().slice(0, 10), row.expenseHead!.name, row.amount.toFixed(2), row.expenseBy!.name, row.paidFromAccount!.accountName, row.description ?? ""].map(escape).join(",")),
    ];
    await this.auditLogService.record({ organizationId, userId, action: "export", entityType: "ProjectExpense", entityId: query.workId, newValue: { rowCount: rows.length } });
    return { filename: `project-expenses-${new Date().toISOString().slice(0, 10)}.csv`, content: `\uFEFF${lines.join("\r\n")}` };
  }
}
