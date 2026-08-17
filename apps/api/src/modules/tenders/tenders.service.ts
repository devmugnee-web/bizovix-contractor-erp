import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CreateTenderDto } from "./dto/create-tender.dto";
import { UpdateTenderDto } from "./dto/update-tender.dto";
import { QueryTenderDto } from "./dto/query-tender.dto";
import { SubmitTenderDto } from "./dto/submit-tender.dto";
import { RecordTenderOpeningDto } from "./dto/record-tender-opening.dto";

const includeRelations = {
  organizationMaster: { select: { id: true, shortName: true, fullName: true } },
} satisfies Prisma.TenderInclude;

type TenderRecord = Prisma.TenderGetPayload<{ include: typeof includeRelations }>;

function toDto(record: TenderRecord) {
  return {
    ...record,
    contractValue: record.contractValue.toFixed(2),
    estimatedTenderSecurityAmount: record.estimatedTenderSecurityAmount?.toFixed(2) ?? null,
    quotedAmount: record.quotedAmount?.toFixed(2) ?? null,
    lowestBidAmount: record.lowestBidAmount?.toFixed(2) ?? null,
  };
}

const UNSUCCESSFUL_LABEL = "REJECTED";
const UNDER_EVALUATION_LABEL = "UNDER_PROCESS";

@Injectable()
export class TendersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(
    organizationId: string,
    query: QueryTenderDto,
  ): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 8;
    const where: Prisma.TenderWhereInput = {
      organizationId,
      ...(query.organizationMasterId ? { organizationMasterId: query.organizationMasterId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
      ...(query.assignedToName
        ? { assignedToName: { contains: query.assignedToName, mode: "insensitive" } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { workName: { contains: query.search, mode: "insensitive" } },
              { egpTenderId: { contains: query.search, mode: "insensitive" } },
              { organizationMaster: { shortName: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(query.fromDate || query.toDate
        ? {
            submissionDeadline: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.tender.findMany({
        where,
        include: includeRelations,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.tender.count({ where }),
    ]);

    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string) {
    const [total, preparing, submitted, underEvaluation, awarded, unsuccessful] = await Promise.all([
      this.prisma.tender.count({ where: { organizationId } }),
      this.prisma.tender.count({
        where: { organizationId, status: { in: ["DRAFT", "PUBLISHED", "DOCUMENT_PURCHASED", "PREPARING"] } },
      }),
      this.prisma.tender.count({ where: { organizationId, status: "SUBMITTED" } }),
      this.prisma.tender.count({ where: { organizationId, status: { in: ["OPENED", UNDER_EVALUATION_LABEL, "NOA"] } } }),
      this.prisma.tender.count({ where: { organizationId, status: { in: ["AWARDED", "ONGOING", "COMPLETED"] } } }),
      this.prisma.tender.count({ where: { organizationId, status: { in: [UNSUCCESSFUL_LABEL, "CANCELLED"] } } }),
    ]);
    return { total, preparing, submitted, underEvaluation, awarded, unsuccessful };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.tender.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("Tender not found");

    const [documentPurchases, tenderSecurities, creditCommitments, performanceGuarantees, cmsWorks, documents] =
      await Promise.all([
        this.prisma.documentPurchase.findMany({
          where: { organizationId, linkedTenderId: id },
          select: { id: true, tenderWorkName: true, purchaseDate: true, documentPrice: true, purchaseType: true },
          orderBy: { purchaseDate: "desc" },
        }),
        this.prisma.tenderSecurity.findMany({
          where: { organizationId, tenderId: id },
          select: { id: true, instrumentNo: true, amount: true, status: true, expiryDate: true },
          orderBy: { issueDate: "desc" },
        }),
        this.prisma.creditCommitment.findMany({
          where: { organizationId, tenderId: id },
          select: { id: true, amount: true, isCharged: true, chargeDate: true },
          orderBy: { chargeDate: "desc" },
        }),
        this.prisma.performanceGuarantee.findMany({
          where: { organizationId, tenderId: id },
          select: { id: true, instrumentNo: true, amount: true, type: true, status: true, expiryDate: true },
          orderBy: { issueDate: "desc" },
        }),
        this.prisma.cmsWork.findMany({
          where: { organizationId, tenderId: id },
          select: { id: true, workName: true, status: true, contractValue: true },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.document.findMany({
          where: { organizationId, tenderId: id },
          select: { id: true, name: true, category: true, expiryDate: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    return {
      ...toDto(record),
      linked: {
        documentPurchases: documentPurchases.map((d) => ({ ...d, documentPrice: d.documentPrice.toFixed(2) })),
        tenderSecurities: tenderSecurities.map((t) => ({ ...t, amount: t.amount.toFixed(2) })),
        creditCommitments: creditCommitments.map((c) => ({ ...c, amount: c.amount.toFixed(2) })),
        performanceGuarantees: performanceGuarantees.map((p) => ({ ...p, amount: p.amount.toFixed(2) })),
        cmsWorks: cmsWorks.map((w) => ({ ...w, contractValue: w.contractValue.toFixed(2) })),
        documents,
      },
    };
  }

  private async assertMasterBelongsToOrg(organizationId: string, organizationMasterId: string) {
    const master = await this.prisma.organizationMaster.findFirst({
      where: { id: organizationMasterId, organizationId },
    });
    if (!master) throw new NotFoundException("Organization not found");
  }

  async create(organizationId: string, userId: string, dto: CreateTenderDto) {
    await this.assertMasterBelongsToOrg(organizationId, dto.organizationMasterId);

    const record = await this.prisma.tender.create({
      data: {
        organizationId,
        organizationMasterId: dto.organizationMasterId,
        egpTenderId: dto.egpTenderId,
        workName: dto.workName,
        category: dto.category,
        tenderType: dto.tenderType,
        procurementMethod: dto.procurementMethod,
        tenderMethod: dto.tenderMethod,
        contractValue: dto.contractValue ?? 0,
        status: dto.status ?? "DRAFT",
        publishedDate: dto.publishedDate ? new Date(dto.publishedDate) : null,
        documentPurchaseDeadline: dto.documentPurchaseDeadline ? new Date(dto.documentPurchaseDeadline) : null,
        preBidDate: dto.preBidDate ? new Date(dto.preBidDate) : null,
        submissionDeadline: dto.submissionDeadline ? new Date(dto.submissionDeadline) : null,
        openingDate: dto.openingDate ? new Date(dto.openingDate) : null,
        tenderSecurityRequired: dto.tenderSecurityRequired ?? false,
        estimatedTenderSecurityAmount: dto.estimatedTenderSecurityAmount,
        assignedToUserId: dto.assignedToUserId,
        assignedToName: dto.assignedToName,
        description: dto.description,
        createdById: userId,
      },
      include: includeRelations,
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "TENDER_CREATED",
      entityType: "Tender",
      entityId: record.id,
      referenceNo: record.egpTenderId,
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateTenderDto) {
    const existing = await this.prisma.tender.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!existing) throw new NotFoundException("Tender not found");

    if (dto.organizationMasterId) {
      await this.assertMasterBelongsToOrg(organizationId, dto.organizationMasterId);
    }

    const record = await this.prisma.tender.update({
      where: { id, organizationId },
      data: {
        ...(dto.organizationMasterId ? { organizationMasterId: dto.organizationMasterId } : {}),
        ...(dto.egpTenderId !== undefined ? { egpTenderId: dto.egpTenderId } : {}),
        ...(dto.workName ? { workName: dto.workName } : {}),
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.tenderType !== undefined ? { tenderType: dto.tenderType } : {}),
        ...(dto.procurementMethod !== undefined ? { procurementMethod: dto.procurementMethod } : {}),
        ...(dto.tenderMethod !== undefined ? { tenderMethod: dto.tenderMethod } : {}),
        ...(dto.contractValue !== undefined ? { contractValue: dto.contractValue } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.publishedDate !== undefined
          ? { publishedDate: dto.publishedDate ? new Date(dto.publishedDate) : null }
          : {}),
        ...(dto.documentPurchaseDeadline !== undefined
          ? { documentPurchaseDeadline: dto.documentPurchaseDeadline ? new Date(dto.documentPurchaseDeadline) : null }
          : {}),
        ...(dto.preBidDate !== undefined ? { preBidDate: dto.preBidDate ? new Date(dto.preBidDate) : null } : {}),
        ...(dto.submissionDeadline !== undefined
          ? { submissionDeadline: dto.submissionDeadline ? new Date(dto.submissionDeadline) : null }
          : {}),
        ...(dto.openingDate !== undefined ? { openingDate: dto.openingDate ? new Date(dto.openingDate) : null } : {}),
        ...(dto.tenderSecurityRequired !== undefined ? { tenderSecurityRequired: dto.tenderSecurityRequired } : {}),
        ...(dto.estimatedTenderSecurityAmount !== undefined
          ? { estimatedTenderSecurityAmount: dto.estimatedTenderSecurityAmount }
          : {}),
        ...(dto.assignedToUserId !== undefined ? { assignedToUserId: dto.assignedToUserId } : {}),
        ...(dto.assignedToName !== undefined ? { assignedToName: dto.assignedToName } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
      include: includeRelations,
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "TENDER_UPDATED",
      entityType: "Tender",
      entityId: id,
      referenceNo: record.egpTenderId,
      oldValue: toDto(existing),
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async submit(organizationId: string, userId: string, id: string, dto: SubmitTenderDto) {
    const existing = await this.prisma.tender.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Tender not found");
    if (existing.status === "AWARDED" || existing.status === "ONGOING" || existing.status === "COMPLETED") {
      throw new BadRequestException("This tender has already progressed past submission");
    }

    const record = await this.prisma.tender.update({
      where: { id, organizationId },
      data: {
        submissionDate: new Date(dto.submissionDate),
        submissionMethod: dto.submissionMethod,
        quotedAmount: dto.quotedAmount,
        submittedById: userId,
        submittedByName: dto.submittedByName,
        submissionReference: dto.submissionReference,
        checklistStatus: dto.checklistStatus,
        submissionRemarks: dto.submissionRemarks,
        submittedAt: new Date(),
        status: "SUBMITTED",
      },
      include: includeRelations,
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "TENDER_SUBMITTED",
      entityType: "Tender",
      entityId: id,
      referenceNo: record.egpTenderId,
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async recordOpening(organizationId: string, userId: string, id: string, dto: RecordTenderOpeningDto) {
    const existing = await this.prisma.tender.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Tender not found");

    const record = await this.prisma.tender.update({
      where: { id, organizationId },
      data: {
        openingDate: new Date(dto.openingDate),
        openingResult: dto.openingResult,
        lowestBidAmount: dto.lowestBidAmount,
        lowestBidder: dto.lowestBidder,
        resultRemarks: dto.resultRemarks,
        status: dto.status,
        ...(dto.status === "AWARDED" ? { awardedAt: new Date() } : {}),
      },
      include: includeRelations,
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "TENDER_STATUS_CHANGED",
      entityType: "Tender",
      entityId: id,
      referenceNo: record.egpTenderId,
      description: `Tender opening recorded — status set to ${dto.status}`,
      oldValue: { status: existing.status },
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async categories(organizationId: string) {
    const rows = await this.prisma.tender.findMany({
      where: { organizationId },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    });
    return rows.map((row) => row.category);
  }
}
