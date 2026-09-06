import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@bizovix/database";
import type { TenderTaxEntry, TenderTaxTotals } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { DocumentsService, hasValidChallanFileSignature, type UploadedDocumentFile } from "../documents/documents.service";
import { CreateTenderTaxDto, TenderTaxQueryDto, UpdateTenderTaxDto, VoidTenderTaxDto } from "./dto/tender-vat-tax.dto";

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const tenderSelect = { id: true, egpTenderId: true, workName: true } as const;
type Entry = Prisma.TenderVatTaxEntryGetPayload<object>;
type Group = { taxType: "VAT" | "TAX"; entryKind: "SELF_DEPOSIT" | "BILL_DEDUCTION"; _sum: { amount: Prisma.Decimal | null }; _count: { _all: number } };
const tenderDto = (row: { id: string; egpTenderId: string | null; workName: string }) => ({ id: row.id, tenderNumber: row.egpTenderId, workName: row.workName });
export function taxTotals(groups: Group[]): TenderTaxTotals {
  const amount = (type: "VAT" | "TAX", kind: "SELF_DEPOSIT" | "BILL_DEDUCTION") => groups.filter((g) => g.taxType === type && g.entryKind === kind).reduce((sum, g) => sum.add(g._sum.amount ?? 0), D(0));
  const depositedVat = amount("VAT", "SELF_DEPOSIT"), depositedTax = amount("TAX", "SELF_DEPOSIT");
  const deductedVat = amount("VAT", "BILL_DEDUCTION"), deductedTax = amount("TAX", "BILL_DEDUCTION");
  const vat = depositedVat.add(deductedVat), tax = depositedTax.add(deductedTax);
  return { vat: vat.toFixed(2), tax: tax.toFixed(2), total: vat.add(tax).toFixed(2), depositedVat: depositedVat.toFixed(2), depositedTax: depositedTax.toFixed(2), deductedVat: deductedVat.toFixed(2), deductedTax: deductedTax.toFixed(2), entryCount: groups.reduce((n, g) => n + g._count._all, 0) };
}
const entryDto = (row: Entry): TenderTaxEntry => ({ id: row.id, tenderId: row.tenderId, taxType: row.taxType, entryKind: row.entryKind, entryDate: row.entryDate.toISOString().slice(0, 10), amount: row.amount.toFixed(2), referenceNo: row.referenceNo, notes: row.notes, version: row.version, voidedAt: row.voidedAt?.toISOString() ?? null, voidReason: row.voidReason, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), documents: [] });

@Injectable()
export class TenderVatTaxService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService, private readonly documents: DocumentsService) {}

  private tenderWhere(org: string, query: TenderTaxQueryDto, tenderId?: string): Prisma.TenderWhereInput {
    const search = query.search?.trim();
    return { organizationId: org, ...(tenderId ? { id: tenderId } : {}), ...(search ? { OR: [{ egpTenderId: { contains: search, mode: "insensitive" } }, { workName: { contains: search, mode: "insensitive" } }] } : {}) };
  }
  private where(org: string, query: TenderTaxQueryDto, tenderId?: string, includeVoided = false): Prisma.TenderVatTaxEntryWhereInput {
    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) throw new BadRequestException("From date cannot be after To date");
    return { organizationId: org, ...(includeVoided ? {} : { voidedAt: null }), tender: this.tenderWhere(org, query, tenderId),
      ...(query.entryKind ? { entryKind: query.entryKind } : {}), ...(query.taxType ? { taxType: query.taxType } : {}),
      ...(query.dateFrom || query.dateTo ? { entryDate: { ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}), ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}) } } : {}) };
  }
  private groups(tx: Prisma.TransactionClient, where: Prisma.TenderVatTaxEntryWhereInput) {
    return tx.tenderVatTaxEntry.groupBy({ by: ["tenderId", "taxType", "entryKind"], where, _sum: { amount: true }, _count: { _all: true } });
  }
  async list(org: string, query: TenderTaxQueryDto) {
    const page = query.page ?? 1, limit = Math.min(query.limit ?? 12, 100);
    const where = this.where(org, query);
    return this.prisma.$transaction(async (tx) => {
      const [tenders, total, groups] = await Promise.all([
        tx.tender.findMany({ where: this.tenderWhere(org, query), select: tenderSelect, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
        tx.tender.count({ where: this.tenderWhere(org, query) }), this.groups(tx, where),
      ]);
      return { rows: tenders.map((t) => ({ ...tenderDto(t), ...taxTotals(groups.filter((g) => g.tenderId === t.id)) })), meta: buildPaginationMeta(total, page, limit), totals: taxTotals(groups) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async detail(org: string, tenderId: string, query: TenderTaxQueryDto) {
    const page = query.page ?? 1, limit = Math.min(query.limit ?? 12, 100);
    const where = this.where(org, query, tenderId, true);
    return this.prisma.$transaction(async (tx) => {
      const tender = await tx.tender.findFirst({ where: { organizationId: org, id: tenderId }, select: tenderSelect });
      if (!tender) throw new NotFoundException("Tender not found");
      const [entries, total, groups] = await Promise.all([
        tx.tenderVatTaxEntry.findMany({ where, orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
        tx.tenderVatTaxEntry.count({ where }), this.groups(tx, this.where(org, query, tenderId)),
      ]);
      const docs = await tx.document.findMany({ where: { organizationId: org, tenderId, relatedModule: "TENDER_VAT_TAX", relatedEntityId: { in: entries.map((e) => e.id) }, status: { not: "ARCHIVED" } }, select: { id: true, name: true, fileName: true, fileType: true, relatedEntityId: true } });
      return { tender: tenderDto(tender), rows: entries.map((e) => ({ ...entryDto(e), documents: docs.filter((d) => d.relatedEntityId === e.id).map(({ relatedEntityId: _link, ...d }) => d) })), meta: buildPaginationMeta(total, page, limit), totals: taxTotals(groups) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  private values(dto: CreateTenderTaxDto | UpdateTenderTaxDto) {
    if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/.test(dto.amount) || D(dto.amount).lte(0)) throw new BadRequestException("Enter a positive amount with at most two decimal places");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const date = new Date(dto.entryDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.entryDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dto.entryDate) throw new BadRequestException("Enter a valid deposit or deduction date");
    if (dto.entryDate > today) throw new BadRequestException("An actual deposit or deduction cannot have a future date");
    const referenceNo = dto.referenceNo.trim();
    if (!referenceNo) throw new BadRequestException("Payment / bill reference is required");
    return { taxType: dto.taxType, entryKind: dto.entryKind, entryDate: new Date(dto.entryDate), amount: D(dto.amount), referenceNo, referenceKey: referenceNo.replace(/\s+/g, " ").toUpperCase(), notes: dto.notes?.trim() || null };
  }
  private async entry(tx: Prisma.TransactionClient, org: string, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "tender_vat_tax_entries" WHERE "id" = ${id} AND "organizationId" = ${org} FOR UPDATE`;
    const row = await tx.tenderVatTaxEntry.findFirst({ where: { organizationId: org, id } });
    if (!row) throw new NotFoundException("VAT / Tax entry not found");
    return row;
  }
  private duplicate(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("This tender already has an entry for the same tax type and reference. Edit that entry or attach its certificate instead.");
    throw error;
  }
  async create(org: string, userId: string, tenderId: string, dto: CreateTenderTaxDto) {
    const values = this.values(dto);
    const requestHash = createHash("sha256").update(JSON.stringify({ tenderId, ...values, amount: values.amount.toFixed(2) })).digest("hex");
    const retry = async () => {
      const prior = await this.prisma.tenderVatTaxEntry.findUnique({ where: { organizationId_requestId: { organizationId: org, requestId: dto.requestId } } });
      if (prior && prior.requestHash !== requestHash) throw new ConflictException("This save request was already used for different data. Reload before creating a new entry.");
      return prior;
    };
    const prior = await retry(); if (prior) return entryDto(prior);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!await tx.tender.findFirst({ where: { organizationId: org, id: tenderId }, select: { id: true } })) throw new NotFoundException("Tender not found");
        const row = await tx.tenderVatTaxEntry.create({ data: { ...values, organizationId: org, tenderId, requestId: dto.requestId, requestHash, createdById: userId, updatedById: userId } });
        await this.audit.record({ organizationId: org, userId, action: "TENDER_VAT_TAX_RECORDED", entityType: "TenderVatTaxEntry", entityId: row.id, referenceNo: row.referenceNo, newValue: entryDto(row) }, tx);
        return entryDto(row);
      });
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { const saved = await retry(); if (saved) return entryDto(saved); } return this.duplicate(error); }
  }
  async update(org: string, userId: string, id: string, dto: UpdateTenderTaxDto) {
    const values = this.values(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const old = await this.entry(tx, org, id);
        if (old.voidedAt) throw new ConflictException("Voided entries cannot be edited");
        if (old.version !== dto.version) throw new ConflictException("This entry changed. Refresh and review the latest values before saving.");
        const row = await tx.tenderVatTaxEntry.update({ where: { id, organizationId: org }, data: { ...values, version: { increment: 1 }, updatedById: userId } });
        await this.audit.record({ organizationId: org, userId, action: "TENDER_VAT_TAX_UPDATED", entityType: "TenderVatTaxEntry", entityId: id, oldValue: entryDto(old), newValue: entryDto(row) }, tx);
        return entryDto(row);
      });
    } catch (error) { return this.duplicate(error); }
  }
  async void(org: string, userId: string, id: string, dto: VoidTenderTaxDto) {
    return this.prisma.$transaction(async (tx) => {
      const old = await this.entry(tx, org, id);
      if (old.voidedAt) return entryDto(old);
      if (old.version !== dto.version) throw new ConflictException("This entry changed. Refresh before voiding it.");
      if (!dto.reason.trim()) throw new BadRequestException("A reason is required");
      const row = await tx.tenderVatTaxEntry.update({ where: { id, organizationId: org }, data: { voidedAt: new Date(), voidReason: dto.reason.trim(), updatedById: userId, version: { increment: 1 } } });
      await this.audit.record({ organizationId: org, userId, action: "TENDER_VAT_TAX_VOIDED", entityType: "TenderVatTaxEntry", entityId: id, oldValue: entryDto(old), newValue: entryDto(row) }, tx);
      return entryDto(row);
    });
  }
  async upload(org: string, userId: string, userName: string, id: string, file?: UploadedDocumentFile) {
    const entry = await this.prisma.tenderVatTaxEntry.findFirst({ where: { organizationId: org, id } });
    if (!entry) throw new NotFoundException("VAT / Tax entry not found");
    if (entry.voidedAt) throw new ConflictException("Cannot attach files to a voided entry");
    if (!file || file.size > 10 * 1024 * 1024 || !hasValidChallanFileSignature(file.mimetype, file.buffer)) throw new BadRequestException("Choose a PDF, JPG or PNG up to 10 MB");
    return this.documents.create(org, userId, userName, { name: file.originalname.slice(0, 180), tenderId: entry.tenderId, relatedModule: "TENDER_VAT_TAX", relatedEntityId: id, relatedEntityName: entry.referenceNo, category: "VAT & Tax", documentType: "VAT_TAX_PAYMENT_PROOF", referenceNumber: entry.referenceNo }, file);
  }
  async exportData(org: string, query: TenderTaxQueryDto, tenderId?: string) {
    const where = this.where(org, query, tenderId);
    return this.prisma.$transaction(async (tx) => {
      const [tenders, entries, groups] = await Promise.all([
        tx.tender.findMany({ where: this.tenderWhere(org, query, tenderId), select: tenderSelect, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 10001 }),
        tx.tenderVatTaxEntry.findMany({ where, include: { tender: { select: tenderSelect } }, orderBy: [{ entryDate: "asc" }, { id: "asc" }], take: 10001 }), this.groups(tx, where),
      ]);
      if (tenderId && !tenders.length) throw new NotFoundException("Tender not found");
      if (tenders.length > 10000 || entries.length > 10000) throw new BadRequestException("Export limit is 10,000 rows. Narrow the dates or tender filter.");
      return { tenders: tenders.map((t) => ({ ...tenderDto(t), ...taxTotals(groups.filter((g) => g.tenderId === t.id)) })), entries: entries.map((e) => ({ ...entryDto(e), tender: tenderDto(e.tender) })), totals: taxTotals(groups), dateFrom: query.dateFrom ?? null, dateTo: query.dateTo ?? null, entryKind: query.entryKind ?? null, taxType: query.taxType ?? null, detail: !!tenderId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
