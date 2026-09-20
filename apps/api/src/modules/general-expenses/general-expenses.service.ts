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
import { NumberingService } from "../settings-numbering/numbering.service";
import { buildGeneralExpenseJournalLines } from "./general-expense.calculations";

const includeRelations = {
  expenseHead: { select: { id: true, name: true } },
  expenseBy: { select: { id: true, name: true } },
  paidFromAccount: { select: { id: true, accountName: true, accountNumber: true } },
  expenseLedger: { select: { id: true, code: true, name: true } },
  payableParty: { select: { id: true, code: true, name: true } },
  payable: { select: { id: true, status: true, amount: true, paidAmount: true } },
  attachments: { select: { id: true, fileName: true, mimeType: true, fileSize: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRecord = Prisma.ExpenseGetPayload<{ include: typeof includeRelations }>;
type UploadedExpenseFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

function toDto(record: ExpenseRecord) {
  return {
    id: record.id,
    referenceNo: record.referenceNo,
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
    expenseNature: record.expenseNature,
    paymentMode: record.paymentMode,
    expenseLedger: record.expenseLedger,
    payableParty: record.payableParty,
    payable: record.payable ? { ...record.payable, amount: record.payable.amount.toFixed(2), paidAmount: record.payable.paidAmount.toFixed(2) } : null,
    attachments: record.attachments,
  };
}

@Injectable()
export class GeneralExpensesService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogService: AuditLogService, private readonly cashBank: CashBankService, private readonly accounting: AccountingService, private readonly numbering: NumberingService) {}

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
    const paymentMode = dto.paymentMode ?? "CASH_BANK";
    if (paymentMode === "CASH_BANK" && !dto.paidFromAccountId) throw new BadRequestException("Payment account is required");
    if (paymentMode === "PAYABLE" && !dto.payablePartyId) throw new BadRequestException("Payable party is required");
    const [head, person, account, party] = await Promise.all([
      this.prisma.expenseHead.findFirst({ where: { id: dto.expenseHeadId, organizationId, isActive: true } }),
      this.prisma.organizationUser.findFirst({ where: { organizationId, userId: dto.expenseById, user: { isActive: true } } }),
      dto.paidFromAccountId ? this.prisma.bankAccount.findFirst({ where: { id: dto.paidFromAccountId, organizationId } }) : null,
      dto.payablePartyId ? this.prisma.party.findFirst({ where: { id: dto.payablePartyId, organizationId, status: "ACTIVE" } }) : null,
    ]);
    if (!head) throw new NotFoundException("Expense head not found");
    if (!person) throw new NotFoundException("Expense person not found");
    if (paymentMode === "CASH_BANK" && !account) throw new NotFoundException("Payment account not found");
    if (paymentMode === "PAYABLE" && !party) throw new NotFoundException("Payable party not found");
    const ledgerId = dto.expenseLedgerAccountId?.trim() || head.ledgerAccountId;
    if (!ledgerId) throw new BadRequestException("Expense head must have a Chart of Accounts ID before posting");
    const ledger = ledgerId ? await this.prisma.ledgerAccount.findFirst({ where: { id: ledgerId, organizationId, isActive: true, accountType: "EXPENSE", isControlAccount: false } }) : null;
    if (!ledger) throw new NotFoundException("Expense ledger Account ID not found");
    return { head, account, party, ledger, paymentMode };
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
    const { head, account, party, ledger, paymentMode } = await this.assertReferences(organizationId, dto);
    const record = await this.prisma.$transaction(async (tx) => {
      const referenceNo = await this.numbering.next(organizationId, "EXPENSE", tx);
      const payable = paymentMode === "PAYABLE" ? await tx.payable.create({ data: { organizationId, partyId: party!.id, partyName: party!.name, partyType: "VENDOR", billNo: referenceNo, billDate: new Date(dto.expenseDate), amount: dto.amount, description: dto.description?.trim() || head.name, createdById: userId } }) : null;
      const expense = await tx.expense.create({ data: {
        organizationId, workId: null, expenseHeadId: dto.expenseHeadId, expenseById: dto.expenseById,
        paidFromAccountId: account?.id, expenseLedgerAccountId: ledger?.id, payablePartyId: party?.id, payableId: payable?.id,
        expenseNature: dto.expenseNature ?? head.nature, paymentMode, category: head.name, description: dto.description?.trim() || null,
        amount: dto.amount, expenseDate: new Date(dto.expenseDate), status: "APPROVED", referenceNo, createdById: userId,
      }, include: includeRelations });
      if (paymentMode === "CASH_BANK") await this.cashBank.post(tx, { organizationId, accountId: account!.id, direction: "OUT", amount: dto.amount, sourceModule: "GENERAL_EXPENSE", sourceType: "EXPENSE", sourceId: expense.id, referenceNo, description: dto.description?.trim() || head.name, transactionDate: expense.expenseDate, createdById: userId });
      await this.accounting.post(tx, { organizationId, userId, journalDate: expense.expenseDate, referenceNo, description: dto.description?.trim() || head.name, sourceModule: "GENERAL_EXPENSE", sourceType: "EXPENSE", sourceId: expense.id, lines: buildGeneralExpenseJournalLines({ amount: dto.amount, paymentMode, expenseLedgerAccountId: ledger.id, bankAccountId: account?.id, partyName: party?.name }) });
      return expense;
    });
    await this.auditLogService.record({ organizationId, userId, action: "create", entityType: "GeneralExpense", entityId: record.id, newValue: toDto(record) });
    return toDto(record);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateGeneralExpenseDto) {
    const existing = await this.findOne(organizationId, id);
    if (["CANCELLED", "AMENDED"].includes(existing.status)) throw new BadRequestException("Cancelled or amended expense cannot be edited");
    const financialChange = dto.expenseDate !== undefined || dto.expenseHeadId !== undefined || dto.amount !== undefined || dto.expenseById !== undefined || dto.paidFromAccountId !== undefined || dto.paymentMode !== undefined || dto.expenseNature !== undefined || dto.expenseLedgerAccountId !== undefined || dto.payablePartyId !== undefined;
    if (!financialChange) {
      const metadata = await this.prisma.expense.update({ where: { id, organizationId }, data: { description: dto.description?.trim() || null }, include: includeRelations });
      await this.auditLogService.record({ organizationId, userId, action: "EXPENSE_METADATA_UPDATED", entityType: "GeneralExpense", entityId: id, oldValue: existing, newValue: toDto(metadata) });
      return toDto(metadata);
    }
    const merged: SaveGeneralExpenseDto = {
      expenseDate: dto.expenseDate ?? new Date(existing.expenseDate).toISOString().slice(0, 10),
      expenseHeadId: dto.expenseHeadId ?? existing.expenseHead.id,
      amount: dto.amount ?? Number(existing.amount), expenseById: dto.expenseById ?? existing.expenseBy.id,
      paidFromAccountId: dto.paidFromAccountId ?? existing.paidFromAccount?.id ?? undefined,
      paymentMode: dto.paymentMode ?? existing.paymentMode,
      expenseNature: dto.expenseNature ?? existing.expenseNature,
      expenseLedgerAccountId: dto.expenseLedgerAccountId?.trim() || (dto.expenseHeadId && dto.expenseHeadId !== existing.expenseHead.id ? undefined : existing.expenseLedger?.id) || undefined,
      payablePartyId: dto.payablePartyId ?? existing.payableParty?.id ?? undefined,
      description: dto.description ?? existing.description ?? undefined,
    };
    if (merged.paymentMode === "CASH_BANK") merged.payablePartyId = undefined;
    if (merged.paymentMode === "PAYABLE") merged.paidFromAccountId = undefined;
    const { head, account, party, ledger, paymentMode } = await this.assertReferences(organizationId, merged);
    const record = await this.prisma.$transaction(async (tx) => {
      if (existing.payable) {
        const supplierPayments = await tx.supplierPayment.count({ where: { organizationId, payableId: existing.payable.id } });
        if (supplierPayments || Number(existing.payable.paidAmount) > 0) throw new BadRequestException("A paid payable expense cannot be amended");
      }
      await this.accounting.reverseSource(tx, organizationId, userId, "GENERAL_EXPENSE", id);
      if (existing.paymentMode === "CASH_BANK") await this.cashBank.reverseSource(tx, { organizationId, sourceModule: "GENERAL_EXPENSE", sourceId: id, userId, reason: "Expense amendment" });
      if (existing.payable) {
        await tx.expense.update({ where: { id, organizationId }, data: { payableId: null } });
        await tx.payable.delete({ where: { id: existing.payable.id } });
      }
      await tx.expense.update({ where: { id, organizationId }, data: { status: "AMENDED", cancelledAt: new Date(), cancelledById: userId, cancellationReason: "Replaced by financial amendment" } });
      const referenceNo = await this.numbering.next(organizationId, "EXPENSE", tx);
      const payable = paymentMode === "PAYABLE" ? await tx.payable.create({ data: { organizationId, partyId: party!.id, partyName: party!.name, partyType: "VENDOR", billNo: referenceNo, billDate: new Date(merged.expenseDate), amount: merged.amount, description: merged.description?.trim() || head.name, createdById: userId } }) : null;
      const replacement = await tx.expense.create({ data: { organizationId, workId: null, expenseHeadId: merged.expenseHeadId, expenseById: merged.expenseById, paidFromAccountId: account?.id, expenseLedgerAccountId: ledger?.id, payablePartyId: party?.id, payableId: payable?.id, expenseNature: merged.expenseNature ?? head.nature, paymentMode, category: head.name, description: merged.description?.trim() || null, amount: merged.amount, expenseDate: new Date(merged.expenseDate), status: "APPROVED", referenceNo, createdById: userId, replacesExpenseId: id }, include: includeRelations });
      if (paymentMode === "CASH_BANK") await this.cashBank.post(tx, { organizationId, accountId: account!.id, direction: "OUT", amount: merged.amount, sourceModule: "GENERAL_EXPENSE", sourceType: "EXPENSE", sourceId: replacement.id, referenceNo, description: merged.description?.trim() || head.name, transactionDate: replacement.expenseDate, createdById: userId });
      await this.accounting.post(tx, { organizationId, userId, journalDate: replacement.expenseDate, referenceNo, description: merged.description?.trim() || head.name, sourceModule: "GENERAL_EXPENSE", sourceType: "EXPENSE", sourceId: replacement.id, lines: buildGeneralExpenseJournalLines({ amount: merged.amount, paymentMode, expenseLedgerAccountId: ledger.id, bankAccountId: account?.id, partyName: party?.name }) });
      return replacement;
    });
    await this.auditLogService.record({ organizationId, userId, action: "EXPENSE_AMENDED", entityType: "GeneralExpense", entityId: id, oldValue: existing, newValue: toDto(record) });
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
    if (["CANCELLED", "AMENDED"].includes(existing.status)) return existing;
    const row = await this.prisma.$transaction(async (tx) => {
      if (existing.payable) {
        const supplierPayments = await tx.supplierPayment.count({ where: { organizationId, payableId: existing.payable.id } });
        if (supplierPayments || Number(existing.payable.paidAmount) > 0) throw new BadRequestException("A paid payable expense cannot be cancelled");
      }
      await this.accounting.reverseSource(tx, organizationId, userId, "GENERAL_EXPENSE", id);
      if (existing.paymentMode === "CASH_BANK") await this.cashBank.reverseSource(tx, { organizationId, sourceModule: "GENERAL_EXPENSE", sourceId: id, userId, reason: "Expense cancellation" });
      if (existing.payable) {
        await tx.expense.update({ where: { id, organizationId }, data: { payableId: null } });
        await tx.payable.delete({ where: { id: existing.payable.id } });
      }
      return tx.expense.update({ where: { id, organizationId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: userId, cancellationReason: "Cancelled by user" }, include: includeRelations });
    });
    await this.auditLogService.record({ organizationId, userId, action: "EXPENSE_CANCELLED", entityType: "GeneralExpense", entityId: id, oldValue: existing, newValue: toDto(row) });
    return toDto(row);
  }

  async exportCsv(organizationId: string, userId: string, query: QueryGeneralExpenseDto) {
    const rows = await this.prisma.expense.findMany({ where: this.where(organizationId, query), include: includeRelations, orderBy: [{ expenseDate: "desc" }, { id: "asc" }] });
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const lines = [
      ["SL", "Expense Date", "Expense Head / Category", "Amount (BDT)", "Expense By / Through", "Paid From", "Description / Remarks"].map(escape).join(","),
      ...rows.map((row, index) => [String(index + 1), row.expenseDate.toISOString().slice(0, 10), row.expenseHead!.name, row.amount.toFixed(2), row.expenseBy!.name, row.paidFromAccount?.accountName ?? row.payableParty?.name ?? "Payable", row.description ?? ""].map(escape).join(",")),
    ];
    await this.auditLogService.record({ organizationId, userId, action: "export", entityType: "GeneralExpense", newValue: { rowCount: rows.length } });
    return { filename: `general-expenses-${new Date().toISOString().slice(0, 10)}.csv`, content: `\uFEFF${lines.join("\r\n")}` };
  }
}
