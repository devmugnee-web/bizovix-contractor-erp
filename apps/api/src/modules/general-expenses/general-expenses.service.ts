import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { QueryGeneralExpenseDto } from "./dto/query-general-expense.dto";
import { SaveGeneralExpenseDto } from "./dto/save-general-expense.dto";
import { UpdateGeneralExpenseDto } from "./dto/update-general-expense.dto";
import { CashBankService } from "../cash-bank/cash-bank.service";
import { AccountingService } from "../accounting/accounting.service";

const includeRelations = {
  expenseHead: { select: { id: true, name: true } },
  expenseBy: { select: { id: true, name: true } },
  paidFromAccount: { select: { id: true, accountName: true, accountNumber: true } },
  attachments: { select: { id: true, fileName: true, mimeType: true, fileSize: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRecord = Prisma.ExpenseGetPayload<{ include: typeof includeRelations }>;
type UploadedExpenseFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

function toDto(record: ExpenseRecord) {
  return {
    id: record.id,
    expenseDate: record.expenseDate,
    amount: record.amount.toFixed(2),
    description: record.description,
    status: record.status,
    expenseHead: record.expenseHead!,
    expenseBy: record.expenseBy!,
    paidFromAccount: record.paidFromAccount!,
    attachments: record.attachments,
  };
}

@Injectable()
export class GeneralExpensesService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogService: AuditLogService, private readonly cashBank: CashBankService, private readonly accounting: AccountingService) {}

  private where(organizationId: string, query: QueryGeneralExpenseDto): Prisma.ExpenseWhereInput {
    return {
      organizationId,
      workId: null,
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

  private async assertReferences(organizationId: string, dto: SaveGeneralExpenseDto) {
    const [head, person, account] = await Promise.all([
      this.prisma.expenseHead.findFirst({ where: { id: dto.expenseHeadId, organizationId, isActive: true } }),
      this.prisma.organizationUser.findFirst({ where: { organizationId, userId: dto.expenseById, user: { isActive: true } } }),
      this.prisma.bankAccount.findFirst({ where: { id: dto.paidFromAccountId, organizationId } }),
    ]);
    if (!head) throw new NotFoundException("Expense head not found");
    if (!person) throw new NotFoundException("Expense person not found");
    if (!account) throw new NotFoundException("Payment account not found");
    return { head };
  }

  async findAll(organizationId: string, query: QueryGeneralExpenseDto) {
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
    const record = await this.prisma.expense.findFirst({ where: { id, organizationId, workId: null, expenseHeadId: { not: null } }, include: includeRelations });
    if (!record) throw new NotFoundException("General expense not found");
    return toDto(record);
  }

  async create(organizationId: string, userId: string, dto: SaveGeneralExpenseDto) {
    const { head } = await this.assertReferences(organizationId, dto);
    const record = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({ data: {
        organizationId, workId: null, expenseHeadId: dto.expenseHeadId, expenseById: dto.expenseById,
        paidFromAccountId: dto.paidFromAccountId, category: head.name, description: dto.description?.trim() || null,
        amount: dto.amount, expenseDate: new Date(dto.expenseDate), status: "APPROVED", createdById: userId,
      }, include: includeRelations });
      await this.cashBank.post(tx, { organizationId, accountId: dto.paidFromAccountId, direction: "OUT", amount: dto.amount, sourceModule: "GENERAL_EXPENSE", sourceType: "EXPENSE", sourceId: expense.id, referenceNo: expense.id, description: dto.description?.trim() || head.name, transactionDate: expense.expenseDate, createdById: userId });
      await this.accounting.post(tx, { organizationId, userId, journalDate: expense.expenseDate, referenceNo: expense.id, description: dto.description?.trim() || head.name, sourceModule: "GENERAL_EXPENSE", sourceType: "EXPENSE", sourceId: expense.id, lines: [{ systemKey: "GENERAL_EXPENSE", debit: dto.amount, credit: 0 }, { bankAccountId: dto.paidFromAccountId, debit: 0, credit: dto.amount }] });
      return expense;
    });
    await this.auditLogService.record({ organizationId, userId, action: "create", entityType: "GeneralExpense", entityId: record.id, newValue: toDto(record) });
    return toDto(record);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateGeneralExpenseDto) {
    const existing = await this.findOne(organizationId, id);
    const merged: SaveGeneralExpenseDto = {
      expenseDate: dto.expenseDate ?? new Date(existing.expenseDate).toISOString().slice(0, 10),
      expenseHeadId: dto.expenseHeadId ?? existing.expenseHead.id,
      amount: dto.amount ?? Number(existing.amount), expenseById: dto.expenseById ?? existing.expenseBy.id,
      paidFromAccountId: dto.paidFromAccountId ?? existing.paidFromAccount.id,
      description: dto.description ?? existing.description ?? undefined,
    };
    const { head } = await this.assertReferences(organizationId, merged);
    const record = await this.prisma.expense.update({ where: { id }, data: {
      expenseDate: new Date(merged.expenseDate), expenseHeadId: merged.expenseHeadId, category: head.name,
      amount: merged.amount, expenseById: merged.expenseById, paidFromAccountId: merged.paidFromAccountId,
      description: merged.description?.trim() || null,
    }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "update", entityType: "GeneralExpense", entityId: id, oldValue: existing, newValue: toDto(record) });
    return toDto(record);
  }

  async addAttachments(organizationId: string, userId: string, id: string, files: UploadedExpenseFile[]) {
    await this.findOne(organizationId, id);
    if (!files.length) throw new BadRequestException("Select at least one attachment");
    await this.prisma.expenseAttachment.createMany({ data: files.map((file) => ({
      organizationId, expenseId: id, fileName: file.originalname, mimeType: file.mimetype, fileSize: file.size, data: Uint8Array.from(file.buffer),
    })) });
    await this.auditLogService.record({ organizationId, userId, action: "attach", entityType: "GeneralExpense", entityId: id, newValue: { files: files.map((file) => file.originalname) } });
    return this.findOne(organizationId, id);
  }

  async remove(organizationId: string, userId: string, id: string) {
    const existing = await this.findOne(organizationId, id);
    await this.prisma.expense.delete({ where: { id } });
    await this.auditLogService.record({ organizationId, userId, action: "delete", entityType: "GeneralExpense", entityId: id, oldValue: existing });
    return null;
  }

  async exportCsv(organizationId: string, userId: string, query: QueryGeneralExpenseDto) {
    const rows = await this.prisma.expense.findMany({ where: this.where(organizationId, query), include: includeRelations, orderBy: [{ expenseDate: "desc" }, { id: "asc" }] });
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const lines = [
      ["SL", "Expense Date", "Expense Head / Category", "Amount (BDT)", "Expense By / Through", "Paid From", "Description / Remarks"].map(escape).join(","),
      ...rows.map((row, index) => [String(index + 1), row.expenseDate.toISOString().slice(0, 10), row.expenseHead!.name, row.amount.toFixed(2), row.expenseBy!.name, row.paidFromAccount!.accountName, row.description ?? ""].map(escape).join(",")),
    ];
    await this.auditLogService.record({ organizationId, userId, action: "export", entityType: "GeneralExpense", newValue: { rowCount: rows.length } });
    return { filename: `general-expenses-${new Date().toISOString().slice(0, 10)}.csv`, content: `\uFEFF${lines.join("\r\n")}` };
  }
}
