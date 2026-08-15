import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { QueryReceiptDto } from "./dto/query-receipt.dto";
import { SaveReceiptDto } from "./dto/save-receipt.dto";
import { UpdateReceiptDto } from "./dto/update-receipt.dto";
import { CashBankService } from "../cash-bank/cash-bank.service";

const includeRelations = {
  work: { select: { id: true, workName: true, organizationMaster: { select: { shortName: true } } } },
  receivedInAccount: { select: { id: true, accountName: true, accountNumber: true } },
} satisfies Prisma.ReceiptInclude;
type ReceiptRow = Prisma.ReceiptGetPayload<{ include: typeof includeRelations }>;

function toDto(row: ReceiptRow) {
  return { ...row, receiptNo: row.receiptNo ?? row.referenceNo ?? row.id, amount: row.amount.toFixed(2) };
}

@Injectable()
export class ReceiptsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService, private readonly cashBank: CashBankService) {}

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
    const [work, account] = await Promise.all([
      dto.workId ? this.prisma.cmsWork.findFirst({ where: { id: dto.workId, organizationId } }) : null,
      this.prisma.bankAccount.findFirst({ where: { id: dto.receivedInAccountId, organizationId } }),
    ]);
    if (dto.receiptCategory === "PROJECT" && !work) throw new NotFoundException("Project not found");
    if (!account) throw new NotFoundException("Receiving account not found");
  }

  async create(organizationId: string, userId: string, dto: SaveReceiptDto) {
    await this.refs(organizationId, dto);
    const year = new Date(dto.receiptDate).getUTCFullYear();
    const row = await this.prisma.$transaction(async (tx) => {
      const sequence = await tx.receiptSequence.upsert({ where: { organizationId_year: { organizationId, year } }, update: { value: { increment: 1 } }, create: { organizationId, year, value: 1 } });
      const receipt = await tx.receipt.create({ data: { organizationId, receiptNo: `RC-${year}-${String(sequence.value).padStart(5, "0")}`, receiptDate: new Date(dto.receiptDate), receiptCategory: dto.receiptCategory, receiptType: dto.receiptType, workId: dto.receiptCategory === "PROJECT" ? dto.workId : null, receivedFrom: dto.receivedFrom.trim(), amount: dto.amount, receivedInAccountId: dto.receivedInAccountId, paymentMethod: dto.paymentMethod, referenceNo: dto.referenceNo?.trim() || null, description: dto.description?.trim() || null, status: dto.status ?? "RECEIVED", createdById: userId }, include: includeRelations });
      if (receipt.status === "RECEIVED") await this.cashBank.post(tx, { organizationId, accountId: dto.receivedInAccountId, direction: "IN", amount: dto.amount, sourceModule: "RECEIPT", sourceType: dto.receiptType, sourceId: receipt.id, referenceNo: receipt.receiptNo, description: dto.description?.trim() || `Receipt from ${dto.receivedFrom.trim()}`, transactionDate: receipt.receiptDate, createdById: userId });
      return receipt;
    });
    await this.audit.record({ organizationId, userId, action: "create", entityType: "Receipt", entityId: row.id, newValue: toDto(row) });
    return toDto(row);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateReceiptDto) {
    const existing = await this.findOne(organizationId, id);
    if (existing.status === "CANCELLED") throw new BadRequestException("Cancelled receipt cannot be edited");
    const merged: SaveReceiptDto = { receiptDate: dto.receiptDate ?? new Date(existing.receiptDate).toISOString().slice(0, 10), receiptCategory: dto.receiptCategory ?? (existing.receiptCategory === "PROJECT" ? "PROJECT" : "GENERAL"), receiptType: dto.receiptType ?? existing.receiptType, workId: dto.workId ?? existing.work?.id, receivedFrom: dto.receivedFrom ?? existing.receivedFrom, amount: dto.amount ?? Number(existing.amount), receivedInAccountId: dto.receivedInAccountId ?? existing.receivedInAccount?.id ?? "", paymentMethod: dto.paymentMethod ?? existing.paymentMethod, referenceNo: dto.referenceNo ?? existing.referenceNo ?? undefined, description: dto.description ?? existing.description ?? undefined, status: dto.status ?? (existing.status === "PENDING" ? "PENDING" : "RECEIVED") };
    await this.refs(organizationId, merged);
    const row = await this.prisma.receipt.update({ where: { id }, data: { ...merged, receiptDate: new Date(merged.receiptDate), workId: merged.receiptCategory === "PROJECT" ? merged.workId : null }, include: includeRelations });
    await this.audit.record({ organizationId, userId, action: "update", entityType: "Receipt", entityId: id, oldValue: existing, newValue: toDto(row) });
    return toDto(row);
  }

  async cancel(organizationId: string, userId: string, id: string) {
    const existing = await this.findOne(organizationId, id);
    const row = await this.prisma.receipt.update({ where: { id }, data: { status: "CANCELLED" }, include: includeRelations });
    await this.audit.record({ organizationId, userId, action: "delete", entityType: "Receipt", entityId: id, oldValue: existing, newValue: toDto(row) });
    return toDto(row);
  }
}
