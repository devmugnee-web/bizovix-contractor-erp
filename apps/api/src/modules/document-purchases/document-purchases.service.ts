import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { normalizeTenderBusinessId, type PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CreateDocumentPurchaseDto } from "./dto/create-document-purchase.dto";
import { UpdateDocumentPurchaseDto } from "./dto/update-document-purchase.dto";
import { QueryDocumentPurchaseDto } from "./dto/query-document-purchase.dto";

const includeRelations = {
  organizationMaster: { select: { id: true, shortName: true, fullName: true } },
  paymentFromAccount: { select: { id: true, accountName: true } },
} satisfies Prisma.DocumentPurchaseInclude;

type DocumentPurchaseWithRelations = Prisma.DocumentPurchaseGetPayload<{ include: typeof includeRelations }>;
type DocumentPurchaseDto = Omit<DocumentPurchaseWithRelations, "egpTenderId"> & { tenderId: string | null };
type DocumentPurchaseStats = {
  totalPurchases: number;
  egpPurchases: number;
  manualPurchases: number;
  totalAmount: string;
};

type ExistingTenderBusinessId = {
  id: string;
  egpTenderId: string | null;
  workName: string;
  createdAt: Date;
  createdBy: { name: string } | null;
};

function toDto(record: DocumentPurchaseWithRelations): DocumentPurchaseDto {
  const { egpTenderId, ...rest } = record;
  return { ...rest, tenderId: egpTenderId };
}

@Injectable()
export class DocumentPurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(
    organizationId: string,
    query: QueryDocumentPurchaseDto,
  ): Promise<{ items: DocumentPurchaseDto[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 8;

    const where: Prisma.DocumentPurchaseWhereInput = {
      organizationId,
      ...(query.purchaseType ? { purchaseType: query.purchaseType } : {}),
      ...(query.organizationMasterId ? { organizationMasterId: query.organizationMasterId } : {}),
      ...(query.paymentFromAccountId ? { paymentFromAccountId: query.paymentFromAccountId } : {}),
      ...(query.search
        ? {
            OR: [
              { tenderWorkName: { contains: query.search, mode: "insensitive" } },
              { egpTenderId: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.fromDate || query.toDate
        ? {
            purchaseDate: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.documentPurchase.findMany({
        where,
        include: includeRelations,
        orderBy: { purchaseDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.documentPurchase.count({ where }),
    ]);

    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(organizationId: string, id: string): Promise<DocumentPurchaseDto> {
    const record = await this.prisma.documentPurchase.findFirst({
      where: { id, organizationId },
      include: includeRelations,
    });
    if (!record) {
      throw new NotFoundException("Document purchase not found");
    }
    return toDto(record);
  }

  async stats(organizationId: string): Promise<DocumentPurchaseStats> {
    const [totalPurchases, egpPurchases, manualPurchases, amountAgg] = await Promise.all([
      this.prisma.documentPurchase.count({ where: { organizationId } }),
      this.prisma.documentPurchase.count({ where: { organizationId, purchaseType: "EGP" } }),
      this.prisma.documentPurchase.count({ where: { organizationId, purchaseType: "MANUAL" } }),
      this.prisma.documentPurchase.aggregate({
        where: { organizationId },
        _sum: { documentPrice: true },
      }),
    ]);

    return {
      totalPurchases,
      egpPurchases,
      manualPurchases,
      totalAmount: (amountAgg._sum.documentPrice ?? 0).toString(),
    };
  }

  private async assertBelongsToOrg(organizationId: string, organizationMasterId: string, paymentFromAccountId: string) {
    const [master, account] = await Promise.all([
      this.prisma.organizationMaster.findFirst({ where: { id: organizationMasterId, organizationId } }),
      this.prisma.bankAccount.findFirst({ where: { id: paymentFromAccountId, organizationId } }),
    ]);
    if (!master) throw new NotFoundException("Organization not found");
    if (!account) throw new NotFoundException("Payment account not found");
  }

  private async assertTenderBelongsToOrg(organizationId: string, linkedTenderId?: string | null) {
    if (!linkedTenderId) return;
    const tender = await this.prisma.tender.findFirst({ where: { id: linkedTenderId, organizationId } });
    if (!tender) throw new NotFoundException("Tender not found");
  }

  private async findTenderByBusinessId(
    organizationId: string,
    tenderIdNormalized: string,
  ): Promise<ExistingTenderBusinessId | null> {
    return this.prisma.tender.findFirst({
      where: { organizationId, tenderIdNormalized },
      select: {
        id: true,
        egpTenderId: true,
        workName: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    });
  }

  private duplicateTenderConflict(
    existing: ExistingTenderBusinessId | null,
    tenderIdNormalized: string,
  ): never {
    throw new ConflictException({
      message: "Tender ID already exists. Open the existing tender to add its document purchase.",
      errors: {
        duplicateCode: ["DUPLICATE_TENDER_ID"],
        recordId: existing ? [existing.id] : [],
        existingTenderId: [existing?.egpTenderId ?? tenderIdNormalized],
        existingWorkName: existing ? [existing.workName] : [],
        createdByName: [existing?.createdBy?.name ?? "Unknown user"],
        createdAt: existing ? [existing.createdAt.toISOString()] : [],
      },
    });
  }

  private isTenderBusinessIdConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
    const target = error.meta?.target;
    return Array.isArray(target)
      ? target.includes("tenderIdNormalized")
      : typeof target === "string" && target.includes("tenderIdNormalized");
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateDocumentPurchaseDto,
  ): Promise<DocumentPurchaseDto> {
    await this.assertBelongsToOrg(organizationId, dto.organizationMasterId, dto.paymentFromAccountId);
    await this.assertTenderBelongsToOrg(organizationId, dto.linkedTenderId);

    const shouldCreateTender = !dto.linkedTenderId;
    const suppliedTenderId = dto.purchaseType === "EGP" ? dto.tenderId?.trim() ?? "" : "";
    const suppliedTenderIdNormalized = suppliedTenderId ? normalizeTenderBusinessId(suppliedTenderId) : "";
    if (shouldCreateTender && dto.purchaseType === "EGP" && !suppliedTenderIdNormalized) {
      throw new BadRequestException("Tender ID is required for e-GP purchases");
    }

    if (shouldCreateTender && suppliedTenderIdNormalized) {
      const duplicate = await this.findTenderByBusinessId(organizationId, suppliedTenderIdNormalized);
      if (duplicate) this.duplicateTenderConflict(duplicate, suppliedTenderIdNormalized);
    }

    let record: DocumentPurchaseWithRelations;
    try {
      record = await this.prisma.$transaction(async (tx) => {
        // Purchases started from an existing Tender retain that authoritative link.
        if (dto.linkedTenderId) {
          return tx.documentPurchase.create({
            data: {
              organizationId,
              purchaseType: dto.purchaseType,
              egpTenderId: dto.purchaseType === "EGP" ? suppliedTenderId : null,
              linkedTenderId: dto.linkedTenderId,
              organizationMasterId: dto.organizationMasterId,
              tenderWorkName: dto.tenderWorkName,
              purchaseDate: new Date(dto.purchaseDate),
              documentPrice: dto.documentPrice,
              estimatedTenderAmount: dto.estimatedTenderAmount ?? 0,
              category: dto.category,
              submissionDate: dto.submissionDate ? new Date(dto.submissionDate) : null,
              openingDate: dto.openingDate ? new Date(dto.openingDate) : null,
              remarks: dto.remarks,
              paymentFromAccountId: dto.paymentFromAccountId,
              createdById: userId,
            },
            include: includeRelations,
          });
        }

        // A Manual purchase has no external Tender ID. Create the purchase first and use its
        // primary key as the stable, authoritative source of the internal Tender's business ID.
        // The purchase, Tender, and link remain atomic in this transaction.
        const purchase = await tx.documentPurchase.create({
          data: {
            organizationId,
            purchaseType: dto.purchaseType,
            egpTenderId: dto.purchaseType === "EGP" ? suppliedTenderId : null,
            linkedTenderId: null,
            organizationMasterId: dto.organizationMasterId,
            tenderWorkName: dto.tenderWorkName,
            purchaseDate: new Date(dto.purchaseDate),
            documentPrice: dto.documentPrice,
            estimatedTenderAmount: dto.estimatedTenderAmount ?? 0,
            category: dto.category,
            submissionDate: dto.submissionDate ? new Date(dto.submissionDate) : null,
            openingDate: dto.openingDate ? new Date(dto.openingDate) : null,
            remarks: dto.remarks,
            paymentFromAccountId: dto.paymentFromAccountId,
            createdById: userId,
          },
          include: includeRelations,
        });

        const tenderBusinessId = dto.purchaseType === "EGP"
          ? suppliedTenderId
          : `MANUAL-DP-${purchase.id}`;
        const tender = await tx.tender.create({
          data: {
            organizationId,
            organizationMasterId: dto.organizationMasterId,
            egpTenderId: tenderBusinessId,
            tenderIdNormalized: normalizeTenderBusinessId(tenderBusinessId),
            workName: dto.tenderWorkName,
            category: dto.category ?? "General",
            contractValue: dto.estimatedTenderAmount ?? 0,
            status: "DOCUMENT_PURCHASED",
            submissionDeadline: dto.submissionDate ? new Date(dto.submissionDate) : null,
            openingDate: dto.openingDate ? new Date(dto.openingDate) : null,
            description: dto.remarks,
            createdById: userId,
          },
        });

        return tx.documentPurchase.update({
          where: { id: purchase.id, organizationId },
          data: { linkedTenderId: tender.id },
          include: includeRelations,
        });
      });
    } catch (error) {
      if (shouldCreateTender && suppliedTenderIdNormalized && this.isTenderBusinessIdConflict(error)) {
        const existing = await this.findTenderByBusinessId(organizationId, suppliedTenderIdNormalized);
        this.duplicateTenderConflict(existing, suppliedTenderIdNormalized);
      }
      throw error;
    }

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "create",
      entityType: "DocumentPurchase",
      entityId: record.id,
      newValue: { ...record, documentPrice: record.documentPrice.toString() },
    });

    return toDto(record);
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateDocumentPurchaseDto,
  ): Promise<DocumentPurchaseDto> {
    const existing = await this.findOne(organizationId, id);

    if (dto.organizationMasterId || dto.paymentFromAccountId) {
      await this.assertBelongsToOrg(
        organizationId,
        dto.organizationMasterId ?? existing.organizationMasterId,
        dto.paymentFromAccountId ?? existing.paymentFromAccountId,
      );
    }

    if (dto.linkedTenderId !== undefined) {
      await this.assertTenderBelongsToOrg(organizationId, dto.linkedTenderId);
    }

    const purchaseType = dto.purchaseType ?? existing.purchaseType;
    const record = await this.prisma.documentPurchase.update({
      where: { id, organizationId },
      data: {
        ...(dto.purchaseType ? { purchaseType: dto.purchaseType } : {}),
        egpTenderId: purchaseType === "EGP" ? dto.tenderId ?? existing.tenderId : null,
        ...(dto.linkedTenderId !== undefined ? { linkedTenderId: dto.linkedTenderId || null } : {}),
        ...(dto.organizationMasterId ? { organizationMasterId: dto.organizationMasterId } : {}),
        ...(dto.tenderWorkName ? { tenderWorkName: dto.tenderWorkName } : {}),
        ...(dto.purchaseDate ? { purchaseDate: new Date(dto.purchaseDate) } : {}),
        ...(dto.documentPrice !== undefined ? { documentPrice: dto.documentPrice } : {}),
        ...(dto.paymentFromAccountId ? { paymentFromAccountId: dto.paymentFromAccountId } : {}),
        ...(dto.estimatedTenderAmount !== undefined ? { estimatedTenderAmount: dto.estimatedTenderAmount } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.submissionDate !== undefined
          ? { submissionDate: dto.submissionDate ? new Date(dto.submissionDate) : null }
          : {}),
        ...(dto.openingDate !== undefined ? { openingDate: dto.openingDate ? new Date(dto.openingDate) : null } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
      },
      include: includeRelations,
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "update",
      entityType: "DocumentPurchase",
      entityId: id,
      oldValue: { ...existing, documentPrice: existing.documentPrice.toString() },
      newValue: { ...record, documentPrice: record.documentPrice.toString() },
    });

    return toDto(record);
  }

  async remove(organizationId: string, userId: string, id: string): Promise<null> {
    const existing = await this.findOne(organizationId, id);
    await this.prisma.documentPurchase.delete({ where: { id, organizationId } });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "delete",
      entityType: "DocumentPurchase",
      entityId: id,
      oldValue: { ...existing, documentPrice: existing.documentPrice.toString() },
    });

    return null;
  }
}
