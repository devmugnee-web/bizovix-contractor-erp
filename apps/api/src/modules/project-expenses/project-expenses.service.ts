import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CashBankService } from "../cash-bank/cash-bank.service";
import { AccountingService } from "../accounting/accounting.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { QueryProjectExpenseDto } from "./dto/query-project-expense.dto";
import { SaveProjectExpenseDto } from "./dto/save-project-expense.dto";
import { UpdateProjectExpenseDto } from "./dto/update-project-expense.dto";

const includeRelations = {
  expenseHead: { select: { id: true, name: true } },
  expenseBy: { select: { id: true, name: true } },
  paidFromAccount: { select: { id: true, accountName: true, accountNumber: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRecord = Prisma.ExpenseGetPayload<{ include: typeof includeRelations }>;

function toDto(record: ExpenseRecord) {
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
    expenseBy: record.expenseBy!,
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

  private async assertWork(organizationId: string, workId: string) {
    const work = await this.prisma.cmsWork.findFirst({ where: { id: workId, organizationId, status: "ONGOING" } });
    if (!work) throw new NotFoundException("Ongoing project not found");
    return work;
  }

  private async assertReferences(organizationId: string, dto: SaveProjectExpenseDto) {
    const [work, head, person, account] = await Promise.all([
      this.assertWork(organizationId, dto.workId),
      this.prisma.expenseHead.findFirst({ where: { id: dto.expenseHeadId, organizationId, isActive: true } }),
      this.prisma.organizationUser.findFirst({ where: { organizationId, userId: dto.expenseById, user: { isActive: true } } }),
      this.prisma.bankAccount.findFirst({ where: { id: dto.paidFromAccountId, organizationId } }),
    ]);
    if (!head) throw new NotFoundException("Expense head not found");
    if (!person) throw new NotFoundException("Expense person not found");
    if (!account) throw new NotFoundException("Payment account not found");
    return { work, head, person, account };
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
    return this.prisma.expenseHead.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  }

  async people(organizationId: string) {
    const rows = await this.prisma.organizationUser.findMany({ where: { organizationId, user: { isActive: true } }, select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } });
    return rows.map((row) => row.user);
  }

  async create(organizationId: string, userId: string, dto: SaveProjectExpenseDto) {
    await this.lifecycle.assertOperationalMutationAllowed(organizationId, dto.workId, "recording a normal project expense");
    const { head } = await this.assertReferences(organizationId, dto);
    const record = await this.prisma.$transaction(async (tx) => {
      const referenceNo = await this.numbering.next(organizationId, "EXPENSE", tx);
      const expense = await tx.expense.create({
        data: {
        organizationId,
        workId: dto.workId,
        expenseHeadId: dto.expenseHeadId,
        expenseById: dto.expenseById,
        paidFromAccountId: dto.paidFromAccountId,
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
      await this.cashBank.post(tx, { organizationId, accountId: dto.paidFromAccountId, direction: "OUT", amount: dto.amount, sourceModule: "PROJECT_EXPENSE", sourceType: "EXPENSE", sourceId: expense.id, referenceNo, description: dto.description?.trim() || head.name, transactionDate: expense.expenseDate, createdById: userId });
      await this.accounting.post(tx, { organizationId, userId, journalDate: expense.expenseDate, referenceNo, description: dto.description?.trim() || head.name, sourceModule: "PROJECT_EXPENSE", sourceType: "EXPENSE", sourceId: expense.id, lines: [{ systemKey: "PROJECT_EXPENSE", projectId: dto.workId, debit: dto.amount, credit: 0 }, { bankAccountId: dto.paidFromAccountId, projectId: dto.workId, debit: 0, credit: dto.amount }] });
      return expense;
    });
    await this.auditLogService.record({ organizationId, userId, action: "create", entityType: "ProjectExpense", entityId: record.id, newValue: toDto(record) });
    return toDto(record);
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
      const replacement = await tx.expense.create({ data: { organizationId, workId: merged.workId, expenseHeadId: merged.expenseHeadId, expenseById: merged.expenseById, paidFromAccountId: merged.paidFromAccountId, category: head.name, description: merged.description?.trim() || null, amount: merged.amount, expenseDate: new Date(merged.expenseDate), status: "APPROVED", referenceNo, createdById: userId, replacesExpenseId: id }, include: includeRelations });
      await this.cashBank.post(tx, { organizationId, accountId: merged.paidFromAccountId, direction: "OUT", amount: merged.amount, sourceModule: "PROJECT_EXPENSE", sourceType: "EXPENSE", sourceId: replacement.id, referenceNo, description: merged.description?.trim() || head.name, transactionDate: replacement.expenseDate, createdById: userId });
      await this.accounting.post(tx, { organizationId, userId, journalDate: replacement.expenseDate, referenceNo, description: merged.description?.trim() || head.name, sourceModule: "PROJECT_EXPENSE", sourceType: "EXPENSE", sourceId: replacement.id, lines: [{ systemKey: "PROJECT_EXPENSE", projectId: merged.workId, debit: merged.amount, credit: 0 }, { bankAccountId: merged.paidFromAccountId, projectId: merged.workId, debit: 0, credit: merged.amount }] });
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
