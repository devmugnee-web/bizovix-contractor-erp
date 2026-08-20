import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { QueryReceiptDto } from "./dto/query-receipt.dto";
import { SaveReceiptDto } from "./dto/save-receipt.dto";
import { UpdateReceiptDto } from "./dto/update-receipt.dto";
import { CashBankService } from "../cash-bank/cash-bank.service";
import { AccountingService } from "../accounting/accounting.service";
import { NumberingService } from "../settings-numbering/numbering.service";

const includeRelations = {
  work: { select: { id: true, workName: true, organizationMaster: { select: { shortName: true } } } },
  receivedInAccount: { select: { id: true, accountName: true, accountNumber: true } },
} satisfies Prisma.ReceiptInclude;
type ReceiptRow = Prisma.ReceiptGetPayload<{ include: typeof includeRelations }>;
const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

function toDto(row: ReceiptRow) {
  return { ...row, receiptNo: row.receiptNo ?? row.referenceNo ?? row.id, amount: row.amount.toFixed(2) };
}

@Injectable()
export class ReceiptsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService, private readonly cashBank: CashBankService, private readonly accounting: AccountingService, private readonly numbering: NumberingService, private readonly lifecycle: ProjectLifecycleGuardService) {}

  private where(organizationId: string, query: QueryReceiptDto): Prisma.ReceiptWhereInput {
    return { organizationId,
      ...(query.receiptType ? { receiptType: query.receiptType } : {}),
      ...(query.workId ? { workId: query.workId } : {}),
      ...(query.receivedInAccountId ? { receivedInAccountId: query.receivedInAccountId } : {}),
      ...(query.status ? { status: query.status } : { status: { not: "CANCELLED" } }),
      ...(query.dateFrom || query.dateTo ? { receiptDate: { ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}), ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}) } } : {}),
      ...(query.search ? { OR: [
        { receiptNo: { contains: query.search, mode: "insensitive" } }, { referenceNo: { contains: query.search, mode: "insensitive" } },
        { receivedFrom: { contains: query.search, mode: "insensitive" } }, { work: { workName: { contains: query.search, mode: "insensitive" } } },
      ] } : {}),
    };
  }

  async findAll(organizationId: string, query: QueryReceiptDto) {
    const page = query.page ?? 1, limit = query.limit ?? 5, where = this.where(organizationId, query);
    const [items, total] = await Promise.all([
      this.prisma.receipt.findMany({ where, include: includeRelations, orderBy: [{ receiptDate: "desc" }, { receiptNo: "desc" }], skip: (page - 1) * limit, take: limit }),
      this.prisma.receipt.count({ where }),
    ]);
    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async summary(organizationId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const valid = { organizationId, status: "RECEIVED" as const };
    const [total, month, project, general] = await Promise.all([
      this.prisma.receipt.aggregate({ where: valid, _sum: { amount: true } }),
      this.prisma.receipt.aggregate({ where: { ...valid, receiptDate: { gte: monthStart } }, _sum: { amount: true } }),
      this.prisma.receipt.aggregate({ where: { ...valid, receiptCategory: "PROJECT" }, _sum: { amount: true } }),
      this.prisma.receipt.aggregate({ where: { ...valid, receiptCategory: "GENERAL" }, _sum: { amount: true } }),
    ]);
    return { totalReceived: (total._sum.amount ?? 0).toFixed(2), thisMonth: (month._sum.amount ?? 0).toFixed(2), projectReceipt: (project._sum.amount ?? 0).toFixed(2), generalReceipt: (general._sum.amount ?? 0).toFixed(2), monthLabel: now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) };
  }

  async findOne(organizationId: string, id: string) {
    const row = await this.prisma.receipt.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!row) throw new NotFoundException("Receipt not found");
    return toDto(row);
  }

  private async refs(organizationId: string, dto: SaveReceiptDto) {
    const [work, account, receivable, receiptHead] = await Promise.all([
      dto.workId ? this.prisma.cmsWork.findFirst({ where: { id: dto.workId, organizationId } }) : null,
      this.prisma.bankAccount.findFirst({ where: { id: dto.receivedInAccountId, organizationId } }),
      dto.receivableId ? this.prisma.receivable.findFirst({ where: { id: dto.receivableId, organizationId } }) : null,
      dto.receiptHeadAccountId ? this.prisma.ledgerAccount.findFirst({ where: { id: dto.receiptHeadAccountId, organizationId, accountType: "INCOME", isActive: true } }) : null,
    ]);
    if (dto.receiptCategory === "PROJECT" && !work) throw new NotFoundException("Project not found");
    if (!account) throw new NotFoundException("Receiving account not found");
    if (dto.receiptHeadAccountId && !receiptHead) throw new NotFoundException("Active receipt head not found");
    if (dto.receivableId) {
      if (!receivable) throw new NotFoundException("Receivable not found");
      if (dto.receiptCategory !== "PROJECT" || !dto.workId || receivable.projectId !== dto.workId) {
        throw new BadRequestException("Receivable does not belong to the selected project");
      }
      const outstanding = receivable.amount.sub(receivable.receivedAmount);
      if (new Prisma.Decimal(dto.amount).gt(outstanding)) {
        throw new BadRequestException(
          `Receipt amount exceeds the outstanding receivable of ${outstanding.toFixed(2)} for bill ${receivable.billNo}`,
        );
      }
    }
    return { receivable, receiptHead };
  }

  async create(organizationId: string, userId: string, dto: SaveReceiptDto) {
    if (dto.workId) await this.lifecycle.assertOperationalMutationAllowed(organizationId, dto.workId, "allocating a project receipt");
    const { receiptHead } = await this.refs(organizationId, dto);
    const year = new Date(dto.receiptDate).getUTCFullYear();
    const row = await this.prisma.$transaction(async (tx) => {
      const receivable = dto.receivableId
        ? await tx.receivable.findFirst({ where: { id: dto.receivableId, organizationId, ...(dto.workId ? { projectId: dto.workId } : {}) } })
        : null;
      if (dto.receivableId && !receivable) throw new NotFoundException("Receivable not found for the selected project");
      if (receivable && receivable.receivedAmount.add(dto.amount).gt(receivable.amount)) {
        throw new BadRequestException(`Receipt amount exceeds the outstanding receivable of ${receivable.amount.sub(receivable.receivedAmount).toFixed(2)} for bill ${receivable.billNo}`);
      }
      const sequence = await tx.receiptSequence.upsert({ where: { organizationId_year: { organizationId, year } }, update: { value: { increment: 1 } }, create: { organizationId, year, value: 1 } });
      const config = await this.numbering.getConfig(organizationId, "RECEIPT");
      const receiptNo = this.numbering.format(config, year, sequence.value);
      const receipt = await tx.receipt.create({ data: { organizationId, receiptNo, receiptDate: new Date(dto.receiptDate), receiptCategory: dto.receiptCategory, receiptType: dto.receiptType, workId: dto.receiptCategory === "PROJECT" ? dto.workId : null, receivableId: dto.receivableId, receivedFrom: dto.receivedFrom.trim(), amount: dto.amount, receivedInAccountId: dto.receivedInAccountId, paymentMethod: dto.paymentMethod, referenceNo: dto.referenceNo?.trim() || null, description: dto.description?.trim() || null, status: dto.status ?? "RECEIVED", createdById: userId }, include: includeRelations });
      if (receipt.status === "RECEIVED") await this.cashBank.post(tx, { organizationId, accountId: dto.receivedInAccountId, direction: "IN", amount: dto.amount, sourceModule: "RECEIPT", sourceType: dto.receiptType, sourceId: receipt.id, referenceNo: receipt.receiptNo, description: dto.description?.trim() || `Receipt from ${dto.receivedFrom.trim()}`, transactionDate: receipt.receiptDate, createdById: userId });
      if (receipt.status === "RECEIVED") {
        await this.accounting.post(tx, {
          organizationId,
          userId,
          journalDate: receipt.receiptDate,
          referenceNo: receipt.receiptNo,
          description: dto.description?.trim() || `Receipt from ${dto.receivedFrom.trim()}`,
          sourceModule: "RECEIPT",
          sourceType: dto.receiptType,
          sourceId: receipt.id,
          lines: [
            { bankAccountId: dto.receivedInAccountId, projectId: receipt.workId, partyName: dto.receivedFrom.trim(), partyType: receipt.workId ? "CUSTOMER" : "OTHER", debit: dto.amount, credit: 0 },
            receiptHead && dto.receiptCategory === "GENERAL"
              ? { accountId: receiptHead.id, projectId: null, partyName: dto.receivedFrom.trim(), partyType: "OTHER", debit: 0, credit: dto.amount }
              : { systemKey: receivable ? "ACCOUNTS_RECEIVABLE" : "OTHER_INCOME", projectId: receipt.workId, partyName: dto.receivedFrom.trim(), partyType: receivable ? "CUSTOMER" : "OTHER", debit: 0, credit: dto.amount },
          ],
        });
        if (receivable) {
          const receivedAmount = receivable.receivedAmount.add(dto.amount);
          const status = receivedAmount.gte(receivable.amount) ? "RECEIVED" : "PARTIALLY_RECEIVED";
          const changed = await tx.receivable.updateMany({ where: { id: receivable.id, organizationId, receivedAmount: receivable.receivedAmount }, data: { receivedAmount, status } });
          if (changed.count !== 1) throw new BadRequestException("Receivable changed concurrently; retry the receipt");
          if (receivable.projectBillId) {
            await tx.projectBill.update({
              where: { id: receivable.projectBillId },
              data: { receivedAmount, status },
            });
          }
        }
      }
      return receipt;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit.record({ organizationId, userId, action: "create", entityType: "Receipt", entityId: row.id, newValue: toDto(row) });
    if (dto.receivableId) {
      await this.audit.record({ organizationId, userId, action: "RECEIPT_ALLOCATED_TO_BILL", entityType: "Receivable", entityId: dto.receivableId, referenceNo: row.receiptNo, description: `Receipt ${row.receiptNo} allocated` });
    }
    return toDto(row);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateReceiptDto) {
    const existing = await this.findOne(organizationId, id);
    if (existing.status === "CANCELLED") throw new BadRequestException("Cancelled receipt cannot be edited");
    const financialChange = dto.receiptDate !== undefined || dto.receiptCategory !== undefined || dto.receiptType !== undefined || dto.workId !== undefined || dto.receivedFrom !== undefined || dto.amount !== undefined || dto.receivedInAccountId !== undefined || dto.paymentMethod !== undefined || dto.status !== undefined;
    if (existing.status === "RECEIVED" && financialChange) {
      const merged: SaveReceiptDto = { receiptDate: dto.receiptDate ?? new Date(existing.receiptDate).toISOString().slice(0, 10), receiptCategory: dto.receiptCategory ?? existing.receiptCategory as "PROJECT" | "GENERAL", receiptType: dto.receiptType ?? existing.receiptType, workId: dto.workId ?? existing.workId ?? undefined, receivableId: dto.receivableId ?? existing.receivableId ?? undefined, receivedFrom: dto.receivedFrom ?? existing.receivedFrom, amount: dto.amount ?? Number(existing.amount), receivedInAccountId: dto.receivedInAccountId ?? existing.receivedInAccountId ?? "", paymentMethod: dto.paymentMethod ?? existing.paymentMethod, referenceNo: dto.referenceNo ?? existing.referenceNo ?? undefined, description: dto.description ?? existing.description ?? undefined, status: dto.status ?? "RECEIVED" };
      await this.refs(organizationId, { ...merged, receivableId: undefined });
      const replacement = await this.prisma.$transaction(async (tx) => {
        await this.accounting.reverseSource(tx, organizationId, userId, "RECEIPT", id);
        await this.cashBank.reverseSource(tx, { organizationId, sourceModule: "RECEIPT", sourceId: id, userId, reason: "Receipt amendment" });
        if (existing.receivableId) {
          const oldReceivable = await tx.receivable.findFirst({ where: { id: existing.receivableId, organizationId } });
          if (!oldReceivable) throw new NotFoundException("Allocated receivable not found");
          const rolledBack = Prisma.Decimal.max(D(0), oldReceivable.receivedAmount.sub(existing.amount));
          const oldStatus = rolledBack.isZero() ? "OUTSTANDING" : rolledBack.gte(oldReceivable.amount) ? "RECEIVED" : "PARTIALLY_RECEIVED";
          await tx.receivable.update({ where: { id: oldReceivable.id, organizationId }, data: { receivedAmount: rolledBack, status: oldStatus } });
          if (oldReceivable.projectBillId) await tx.projectBill.update({ where: { id: oldReceivable.projectBillId, organizationId }, data: { receivedAmount: rolledBack, status: rolledBack.isZero() ? "CERTIFIED" : rolledBack.gte(oldReceivable.amount) ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
        }
        const target = merged.receivableId ? await tx.receivable.findFirst({ where: { id: merged.receivableId, organizationId, ...(merged.workId ? { projectId: merged.workId } : {}) } }) : null;
        if (merged.receivableId && !target) throw new NotFoundException("Replacement receivable not found for the selected project");
        if (target && target.receivedAmount.add(merged.amount).gt(target.amount)) throw new BadRequestException("Replacement receipt exceeds the receivable outstanding amount");
        const year = new Date(merged.receiptDate).getUTCFullYear();
        const sequence = await tx.receiptSequence.upsert({ where: { organizationId_year: { organizationId, year } }, update: { value: { increment: 1 } }, create: { organizationId, year, value: 1 } });
        const config = await this.numbering.getConfig(organizationId, "RECEIPT");
        const receiptNo = this.numbering.format(config, year, sequence.value);
        const created = await tx.receipt.create({ data: { organizationId, receiptNo, receiptDate: new Date(merged.receiptDate), receiptCategory: merged.receiptCategory, receiptType: merged.receiptType, workId: merged.receiptCategory === "PROJECT" ? merged.workId : null, receivableId: merged.receivableId, receivedFrom: merged.receivedFrom.trim(), amount: merged.amount, receivedInAccountId: merged.receivedInAccountId, paymentMethod: merged.paymentMethod, referenceNo: merged.referenceNo?.trim() || null, description: merged.description?.trim() || null, status: merged.status ?? "RECEIVED", createdById: userId, replacesReceiptId: id }, include: includeRelations });
        if (created.status === "RECEIVED") {
          await this.cashBank.post(tx, { organizationId, accountId: merged.receivedInAccountId, direction: "IN", amount: merged.amount, sourceModule: "RECEIPT", sourceType: merged.receiptType, sourceId: created.id, referenceNo: receiptNo, description: merged.description?.trim() || `Receipt from ${merged.receivedFrom.trim()}`, transactionDate: created.receiptDate, createdById: userId });
          await this.accounting.post(tx, { organizationId, userId, journalDate: created.receiptDate, referenceNo: receiptNo, description: merged.description?.trim() || `Receipt from ${merged.receivedFrom.trim()}`, sourceModule: "RECEIPT", sourceType: merged.receiptType, sourceId: created.id, lines: [{ bankAccountId: merged.receivedInAccountId, projectId: created.workId, partyName: merged.receivedFrom.trim(), partyType: created.workId ? "CUSTOMER" : "OTHER", debit: merged.amount, credit: 0 }, { systemKey: target ? "ACCOUNTS_RECEIVABLE" : "OTHER_INCOME", projectId: created.workId, partyName: merged.receivedFrom.trim(), partyType: created.workId ? "CUSTOMER" : "OTHER", debit: 0, credit: merged.amount }] });
          if (target) {
            const receivedAmount = target.receivedAmount.add(merged.amount); const status = receivedAmount.gte(target.amount) ? "RECEIVED" : "PARTIALLY_RECEIVED";
            await tx.receivable.update({ where: { id: target.id, organizationId }, data: { receivedAmount, status } });
            if (target.projectBillId) await tx.projectBill.update({ where: { id: target.projectBillId, organizationId }, data: { receivedAmount, status } });
          }
        }
        await tx.receipt.update({ where: { id, organizationId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: userId, cancellationReason: `Replaced by ${receiptNo}` } });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      await this.audit.record({ organizationId, userId, action: "RECEIPT_AMENDED", entityType: "Receipt", entityId: id, oldValue: existing, newValue: toDto(replacement) });
      return toDto(replacement);
    }
    const row = await this.prisma.receipt.update({ where: { id, organizationId }, data: { referenceNo: dto.referenceNo, description: dto.description }, include: includeRelations });
    await this.audit.record({ organizationId, userId, action: "RECEIPT_METADATA_UPDATED", entityType: "Receipt", entityId: id, oldValue: existing, newValue: toDto(row) });
    return toDto(row);
  }

  async cancel(organizationId: string, userId: string, id: string) {
    const existing = await this.findOne(organizationId, id);
    if (existing.status === "CANCELLED") return existing;
    const row = await this.prisma.$transaction(async (tx) => {
      if (existing.status === "RECEIVED") {
        await this.accounting.reverseSource(tx, organizationId, userId, "RECEIPT", id);
        await this.cashBank.reverseSource(tx, { organizationId, sourceModule: "RECEIPT", sourceId: id, userId, reason: "Receipt cancellation" });
        if (existing.receivableId) {
          const receivable = await tx.receivable.findFirst({ where: { id: existing.receivableId, organizationId } });
          if (!receivable) throw new NotFoundException("Allocated receivable not found");
          const receivedAmount = Prisma.Decimal.max(new Prisma.Decimal(0), receivable.receivedAmount.sub(existing.amount));
          const status = receivedAmount.isZero() ? "OUTSTANDING" : receivedAmount.gte(receivable.amount) ? "RECEIVED" : "PARTIALLY_RECEIVED";
          await tx.receivable.update({ where: { id: receivable.id, organizationId }, data: { receivedAmount, status } });
          if (receivable.projectBillId) await tx.projectBill.update({ where: { id: receivable.projectBillId, organizationId }, data: { receivedAmount, status: receivedAmount.isZero() ? "CERTIFIED" : receivedAmount.gte(receivable.amount) ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
        }
      }
      return tx.receipt.update({ where: { id, organizationId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: userId, cancellationReason: "Cancelled by user" }, include: includeRelations });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit.record({ organizationId, userId, action: "RECEIPT_CANCELLED", entityType: "Receipt", entityId: id, oldValue: existing, newValue: toDto(row) });
    return toDto(row);
  }

  async getEligibleBills(organizationId: string, workId: string) {
    const bills = await this.prisma.receivable.findMany({
      where: {
        organizationId,
        projectId: workId,
        projectBill: { status: { in: ["CERTIFIED", "PARTIALLY_RECEIVED"] } },
      },
      include: { projectBill: { select: { status: true } } },
      orderBy: { billDate: "desc" },
    });
    return bills
      .filter((b) => b.projectBill && b.amount.gt(b.receivedAmount))
      .map((b) => ({
        id: b.id,
        billNo: b.billNo,
        netCertified: b.amount.toFixed(2),
        alreadyReceived: b.receivedAmount.toFixed(2),
        outstanding: b.amount.sub(b.receivedAmount).toFixed(2),
      }));
  }
}
