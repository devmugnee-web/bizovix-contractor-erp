import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DocumentPurchaseRequestStatus, Prisma } from "@bizovix/database";
import { normalizeTenderBusinessId, type PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CreateDocumentPurchaseDto } from "./dto/create-document-purchase.dto";
import { UpdateDocumentPurchaseDto } from "./dto/update-document-purchase.dto";
import { QueryDocumentPurchaseDto } from "./dto/query-document-purchase.dto";
import {
  DocumentPurchaseRequestActionDto,
  QueryDocumentPurchaseRequestDto,
  RejectDocumentPurchaseRequestDto,
} from "./dto/document-purchase-request.dto";

const includeRelations = {
  organizationMaster: { select: { id: true, shortName: true, fullName: true } },
  paymentFromAccount: { select: { id: true, accountName: true } },
} satisfies Prisma.DocumentPurchaseInclude;

type DocumentPurchaseWithRelations = Prisma.DocumentPurchaseGetPayload<{
  include: typeof includeRelations;
}>;
type DocumentPurchaseDto = Omit<DocumentPurchaseWithRelations, "egpTenderId"> & {
  tenderId: string | null;
};
type DocumentPurchaseStats = {
  totalPurchases: number;
  egpPurchases: number;
  manualPurchases: number;
  totalAmount: string;
};

const requestInclude = {
  tender: {
    select: {
      id: true,
      egpTenderId: true,
      workName: true,
      category: true,
      documentFee: true,
      contractValue: true,
      documentPurchaseDeadline: true,
      submissionDeadline: true,
      openingDate: true,
      organizationMaster: { select: { id: true, shortName: true, fullName: true } },
    },
  },
  costing: { select: { id: true, status: true } },
  requestedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  rejectedBy: { select: { id: true, name: true } },
} satisfies Prisma.DocumentPurchaseRequestInclude;

type DocumentPurchaseRequestWithRelations = Prisma.DocumentPurchaseRequestGetPayload<{
  include: typeof requestInclude;
}>;

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

function requestToDto(record: DocumentPurchaseRequestWithRelations) {
  return {
    ...record,
    tender: {
      ...record.tender,
      documentFee: record.tender.documentFee?.toFixed(2) ?? null,
      contractValue: record.tender.contractValue.toFixed(2),
    },
  };
}

@Injectable()
export class DocumentPurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async requestStats(organizationId: string) {
    const grouped = await this.prisma.documentPurchaseRequest.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    });
    const counts = new Map(grouped.map((row) => [row.status, row._count._all]));
    const pendingApproval = counts.get(DocumentPurchaseRequestStatus.PENDING_APPROVAL) ?? 0;
    const approved = counts.get(DocumentPurchaseRequestStatus.APPROVED) ?? 0;
    const rejected = counts.get(DocumentPurchaseRequestStatus.REJECTED) ?? 0;
    const purchased = counts.get(DocumentPurchaseRequestStatus.PURCHASED) ?? 0;

    return {
      total: pendingApproval + approved + rejected + purchased,
      pendingApproval,
      approved,
      rejected,
      purchased,
    };
  }

  async findRequests(
    organizationId: string,
    query: QueryDocumentPurchaseRequestDto,
  ): Promise<{ items: ReturnType<typeof requestToDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();
    const where: Prisma.DocumentPurchaseRequestWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            tender: {
              OR: [
                { egpTenderId: { contains: search, mode: "insensitive" } },
                { workName: { contains: search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.documentPurchaseRequest.findMany({
        where,
        include: requestInclude,
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.documentPurchaseRequest.count({ where }),
    ]);

    return { items: items.map(requestToDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async approveRequest(
    organizationId: string,
    userId: string,
    id: string,
    dto: DocumentPurchaseRequestActionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.documentPurchaseRequest.findFirst({
        where: { id, organizationId },
        include: requestInclude,
      });
      if (!existing) throw new NotFoundException("Document purchase request not found");
      if (existing.status === DocumentPurchaseRequestStatus.APPROVED) return requestToDto(existing);
      if (existing.status === DocumentPurchaseRequestStatus.PURCHASED) {
        throw new ConflictException("This document purchase request has already been purchased");
      }

      const changed = await tx.documentPurchaseRequest.updateMany({
        where: {
          id,
          organizationId,
          version: dto.version,
          status: {
            in: [
              DocumentPurchaseRequestStatus.PENDING_APPROVAL,
              DocumentPurchaseRequestStatus.REJECTED,
            ],
          },
        },
        data: {
          status: DocumentPurchaseRequestStatus.APPROVED,
          approvedById: userId,
          approvedAt: new Date(),
          rejectedById: null,
          rejectedAt: null,
          rejectionReason: null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          "Document purchase request changed; reload it before approving",
        );
      }

      const record = await tx.documentPurchaseRequest.findFirst({
        where: { id, organizationId },
        include: requestInclude,
      });
      if (!record) throw new NotFoundException("Document purchase request not found");
      await this.auditLogService.record(
        {
          organizationId,
          userId,
          action: "DOCUMENT_PURCHASE_REQUEST_APPROVED",
          entityType: "DocumentPurchaseRequest",
          entityId: id,
          referenceNo: record.tender.egpTenderId,
          oldValue: { status: existing.status, version: existing.version },
          newValue: { status: record.status, version: record.version },
        },
        tx,
      );
      return requestToDto(record);
    });
  }

  async rejectRequest(
    organizationId: string,
    userId: string,
    id: string,
    dto: RejectDocumentPurchaseRequestDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.documentPurchaseRequest.findFirst({
        where: { id, organizationId },
        include: requestInclude,
      });
      if (!existing) throw new NotFoundException("Document purchase request not found");
      if (existing.status === DocumentPurchaseRequestStatus.REJECTED) return requestToDto(existing);
      if (existing.status !== DocumentPurchaseRequestStatus.PENDING_APPROVAL) {
        throw new BadRequestException("Only a pending document purchase request can be rejected");
      }

      const changed = await tx.documentPurchaseRequest.updateMany({
        where: {
          id,
          organizationId,
          version: dto.version,
          status: DocumentPurchaseRequestStatus.PENDING_APPROVAL,
        },
        data: {
          status: DocumentPurchaseRequestStatus.REJECTED,
          rejectedById: userId,
          rejectedAt: new Date(),
          rejectionReason: dto.reason.trim(),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          "Document purchase request changed; reload it before rejecting",
        );
      }

      const record = await tx.documentPurchaseRequest.findFirst({
        where: { id, organizationId },
        include: requestInclude,
      });
      if (!record) throw new NotFoundException("Document purchase request not found");
      await this.auditLogService.record(
        {
          organizationId,
          userId,
          action: "DOCUMENT_PURCHASE_REQUEST_REJECTED",
          entityType: "DocumentPurchaseRequest",
          entityId: id,
          referenceNo: record.tender.egpTenderId,
          status: "WARNING",
          oldValue: { status: existing.status, version: existing.version },
          newValue: {
            status: record.status,
            version: record.version,
            reason: record.rejectionReason,
          },
        },
        tx,
      );
      return requestToDto(record);
    });
  }

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

  private async assertBelongsToOrg(
    organizationId: string,
    organizationMasterId: string,
    paymentFromAccountId: string,
  ) {
    const [master, account] = await Promise.all([
      this.prisma.organizationMaster.findFirst({
        where: { id: organizationMasterId, organizationId },
      }),
      this.prisma.bankAccount.findFirst({ where: { id: paymentFromAccountId, organizationId } }),
    ]);
    if (!master) throw new NotFoundException("Organization not found");
    if (!account) throw new NotFoundException("Payment account not found");
  }

  private async assertTenderBelongsToOrg(organizationId: string, linkedTenderId?: string | null) {
    if (!linkedTenderId) return;
    const tender = await this.prisma.tender.findFirst({
      where: { id: linkedTenderId, organizationId },
    });
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
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
      return false;
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
    await this.assertBelongsToOrg(
      organizationId,
      dto.organizationMasterId,
      dto.paymentFromAccountId,
    );
    await this.assertTenderBelongsToOrg(organizationId, dto.linkedTenderId);
    if (dto.requestId && !dto.linkedTenderId) {
      throw new BadRequestException("A document purchase request must reference its linked tender");
    }

    const shouldCreateTender = !dto.linkedTenderId;
    const suppliedTenderId = dto.purchaseType === "EGP" ? (dto.tenderId?.trim() ?? "") : "";
    const suppliedTenderIdNormalized = suppliedTenderId
      ? normalizeTenderBusinessId(suppliedTenderId)
      : "";
    if (shouldCreateTender && dto.purchaseType === "EGP" && !suppliedTenderIdNormalized) {
      throw new BadRequestException("Tender ID is required for e-GP purchases");
    }

    if (shouldCreateTender && suppliedTenderIdNormalized) {
      const duplicate = await this.findTenderByBusinessId(
        organizationId,
        suppliedTenderIdNormalized,
      );
      if (duplicate) this.duplicateTenderConflict(duplicate, suppliedTenderIdNormalized);
    }

    let record: DocumentPurchaseWithRelations;
    try {
      record = await this.prisma.$transaction(async (tx) => {
        // Purchases started from an existing Tender retain that authoritative link.
        if (dto.linkedTenderId) {
          const request = await tx.documentPurchaseRequest.findFirst({
            where: {
              organizationId,
              tenderId: dto.linkedTenderId,
              ...(dto.requestId ? { id: dto.requestId } : {}),
            },
            include: { tender: true },
          });
          if (dto.requestId && !request) {
            throw new NotFoundException("Document purchase request not found for this tender");
          }
          if (request?.status === DocumentPurchaseRequestStatus.PURCHASED) {
            throw new ConflictException("This approved request has already been purchased");
          }
          if (request && request.status !== DocumentPurchaseRequestStatus.APPROVED) {
            throw new BadRequestException(
              "Approve the document purchase request before purchasing",
            );
          }

          const requestTenderAmount = request?.tender.contractValue;
          const estimatedTenderAmount =
            requestTenderAmount && Number(requestTenderAmount) > 0
              ? requestTenderAmount
              : (dto.estimatedTenderAmount ?? 0);
          const category = request?.tender.category?.trim() || dto.category;

          const purchase = await tx.documentPurchase.create({
            data: {
              organizationId,
              purchaseType: dto.purchaseType,
              egpTenderId:
                dto.purchaseType === "EGP"
                  ? (request?.tender.egpTenderId ?? suppliedTenderId)
                  : null,
              linkedTenderId: dto.linkedTenderId,
              organizationMasterId:
                request?.tender.organizationMasterId ?? dto.organizationMasterId,
              tenderWorkName: request?.tender.workName ?? dto.tenderWorkName,
              purchaseDate: new Date(dto.purchaseDate),
              documentPrice: dto.documentPrice,
              estimatedTenderAmount,
              category,
              submissionDate:
                request?.tender.submissionDeadline ??
                (dto.submissionDate ? new Date(dto.submissionDate) : null),
              openingDate:
                request?.tender.openingDate ?? (dto.openingDate ? new Date(dto.openingDate) : null),
              remarks: dto.remarks,
              paymentFromAccountId: dto.paymentFromAccountId,
              createdById: userId,
            },
            include: includeRelations,
          });

          await tx.tender.update({
            where: { id: dto.linkedTenderId, organizationId },
            data: {
              category,
              ...(Number(estimatedTenderAmount) > 0
                ? { contractValue: estimatedTenderAmount }
                : {}),
            },
          });

          if (request) {
            const completed = await tx.documentPurchaseRequest.updateMany({
              where: {
                id: request.id,
                organizationId,
                version: request.version,
                status: DocumentPurchaseRequestStatus.APPROVED,
                documentPurchaseId: null,
              },
              data: {
                status: DocumentPurchaseRequestStatus.PURCHASED,
                documentPurchaseId: purchase.id,
                version: { increment: 1 },
              },
            });
            if (completed.count !== 1) {
              throw new ConflictException(
                "Document purchase request changed; reload before purchasing",
              );
            }
          }
          return purchase;
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

        const tenderBusinessId =
          dto.purchaseType === "EGP" ? suppliedTenderId : `MANUAL-DP-${purchase.id}`;
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
      if (
        shouldCreateTender &&
        suppliedTenderIdNormalized &&
        this.isTenderBusinessIdConflict(error)
      ) {
        const existing = await this.findTenderByBusinessId(
          organizationId,
          suppliedTenderIdNormalized,
        );
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
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.documentPurchase.update({
        where: { id, organizationId },
        data: {
          ...(dto.purchaseType ? { purchaseType: dto.purchaseType } : {}),
          egpTenderId: purchaseType === "EGP" ? (dto.tenderId ?? existing.tenderId) : null,
          ...(dto.linkedTenderId !== undefined
            ? { linkedTenderId: dto.linkedTenderId || null }
            : {}),
          ...(dto.organizationMasterId ? { organizationMasterId: dto.organizationMasterId } : {}),
          ...(dto.tenderWorkName ? { tenderWorkName: dto.tenderWorkName } : {}),
          ...(dto.purchaseDate ? { purchaseDate: new Date(dto.purchaseDate) } : {}),
          ...(dto.documentPrice !== undefined ? { documentPrice: dto.documentPrice } : {}),
          ...(dto.paymentFromAccountId ? { paymentFromAccountId: dto.paymentFromAccountId } : {}),
          ...(dto.estimatedTenderAmount !== undefined
            ? { estimatedTenderAmount: dto.estimatedTenderAmount }
            : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.submissionDate !== undefined
            ? { submissionDate: dto.submissionDate ? new Date(dto.submissionDate) : null }
            : {}),
          ...(dto.openingDate !== undefined
            ? { openingDate: dto.openingDate ? new Date(dto.openingDate) : null }
            : {}),
          ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
        },
        include: includeRelations,
      });

      const linkedTenderId =
        dto.linkedTenderId !== undefined ? dto.linkedTenderId || null : existing.linkedTenderId;
      if (
        linkedTenderId &&
        (dto.category !== undefined || dto.estimatedTenderAmount !== undefined)
      ) {
        await tx.tender.update({
          where: { id: linkedTenderId, organizationId },
          data: {
            ...(dto.category !== undefined ? { category: dto.category } : {}),
            ...(dto.estimatedTenderAmount !== undefined
              ? { contractValue: dto.estimatedTenderAmount }
              : {}),
          },
        });
      }

      return updated;
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
