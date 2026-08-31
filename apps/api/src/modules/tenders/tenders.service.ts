import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  type TenderCosting,
  TenderCostingApprovalStatus,
  TenderProcurementMethod,
} from "@bizovix/database";
import { normalizeTenderBusinessId, type PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CreateTenderDto } from "./dto/create-tender.dto";
import { UpdateTenderDto } from "./dto/update-tender.dto";
import { QueryTenderDto } from "./dto/query-tender.dto";
import { SubmitTenderDto } from "./dto/submit-tender.dto";
import { RecordTenderOpeningDto } from "./dto/record-tender-opening.dto";
import { RejectTenderCostingDto, TenderCostingVersionDto } from "./dto/tender-costing-action.dto";

const includeRelations = {
  organizationMaster: { select: { id: true, shortName: true, fullName: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  foundBy: { select: { id: true, name: true, email: true } },
  costingSubmittedBy: { select: { id: true, name: true, email: true } },
  costingApprovedBy: { select: { id: true, name: true, email: true } },
  costingRejectedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TenderInclude;

type TenderRecord = Prisma.TenderGetPayload<{ include: typeof includeRelations }>;

function toDto(record: TenderRecord) {
  return {
    ...record,
    contractValue: record.contractValue.toFixed(2),
    payOrderAmount: record.payOrderAmount?.toFixed(2) ?? null,
    estimatedTenderSecurityAmount: record.estimatedTenderSecurityAmount?.toFixed(2) ?? null,
    quotedAmount: record.quotedAmount?.toFixed(2) ?? null,
    lowestBidAmount: record.lowestBidAmount?.toFixed(2) ?? null,
  };
}

function costingToDto(record: TenderCosting) {
  return {
    ...record,
    exchangeRate: record.exchangeRate.toFixed(6),
    estimatedValue: record.estimatedValue.toFixed(2),
    estimatedCost: record.estimatedCost.toFixed(2),
    ourCost: record.ourCost.toFixed(2),
    marginPercent: record.marginPercent.toFixed(4),
    freightCost: record.freightCost.toFixed(2),
    installationCost: record.installationCost.toFixed(2),
    otherCost: record.otherCost.toFixed(2),
    contingencyPercent: record.contingencyPercent.toFixed(4),
    contingencyAmount: record.contingencyAmount.toFixed(2),
  };
}

const PROCUREMENT_METHODS = Object.values(TenderProcurementMethod);

type DuplicateTender = {
  id: string;
  egpTenderId: string | null;
  tenderIdNormalized: string | null;
  workName: string;
  createdAt: Date;
  createdBy: { id: string; name: string; email: string } | null;
  foundBy: { id: string; name: string; email: string } | null;
  foundByName: string | null;
  organizationMaster: { id: string; shortName: string; fullName: string } | null;
};

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
      ...(query.tenderType ? { tenderType: query.tenderType } : {}),
      ...(query.procurementMethod ? { procurementMethod: query.procurementMethod } : {}),
      ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
      ...(query.assignedToName
        ? { assignedToName: { contains: query.assignedToName, mode: "insensitive" } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { workName: { contains: query.search, mode: "insensitive" } },
              { egpTenderId: { contains: query.search, mode: "insensitive" } },
              {
                organizationMaster: { shortName: { contains: query.search, mode: "insensitive" } },
              },
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
    const [total, preparing, submitted, underEvaluation, awarded, unsuccessful] = await Promise.all(
      [
        this.prisma.tender.count({ where: { organizationId } }),
        this.prisma.tender.count({
          where: {
            organizationId,
            status: { in: ["DRAFT", "PUBLISHED", "DOCUMENT_PURCHASED", "PREPARING"] },
          },
        }),
        this.prisma.tender.count({ where: { organizationId, status: "SUBMITTED" } }),
        this.prisma.tender.count({
          where: { organizationId, status: { in: ["OPENED", UNDER_EVALUATION_LABEL, "NOA"] } },
        }),
        this.prisma.tender.count({
          where: { organizationId, status: { in: ["AWARDED", "ONGOING", "COMPLETED"] } },
        }),
        this.prisma.tender.count({
          where: { organizationId, status: { in: [UNSUCCESSFUL_LABEL, "CANCELLED"] } },
        }),
      ],
    );
    return { total, preparing, submitted, underEvaluation, awarded, unsuccessful };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.tender.findFirst({
      where: { id, organizationId },
      include: includeRelations,
    });
    if (!record) throw new NotFoundException("Tender not found");

    const [
      documentPurchases,
      tenderSecurities,
      creditCommitments,
      performanceGuarantees,
      cmsWorks,
      documents,
    ] = await Promise.all([
      this.prisma.documentPurchase.findMany({
        where: { organizationId, linkedTenderId: id },
        select: {
          id: true,
          tenderWorkName: true,
          purchaseDate: true,
          documentPrice: true,
          purchaseType: true,
        },
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
        select: {
          id: true,
          instrumentNo: true,
          amount: true,
          type: true,
          status: true,
          expiryDate: true,
        },
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
        documentPurchases: documentPurchases.map((d) => ({
          ...d,
          documentPrice: d.documentPrice.toFixed(2),
        })),
        tenderSecurities: tenderSecurities.map((t) => ({ ...t, amount: t.amount.toFixed(2) })),
        creditCommitments: creditCommitments.map((c) => ({ ...c, amount: c.amount.toFixed(2) })),
        performanceGuarantees: performanceGuarantees.map((p) => ({
          ...p,
          amount: p.amount.toFixed(2),
        })),
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

  private async assertUserBelongsToOrg(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationUser.findFirst({
      where: { organizationId, userId, user: { isActive: true } },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException("Search By user not found in this organization");
  }

  private assertPayOrderConfiguration(
    required: boolean,
    amount: Prisma.Decimal | number | null | undefined,
  ) {
    if (
      required &&
      (amount === null || amount === undefined || new Prisma.Decimal(amount).lte(0))
    ) {
      throw new BadRequestException(
        "Pay Order Amount must be greater than zero when Pay Order is required",
      );
    }
    if (!required && amount !== null && amount !== undefined) {
      throw new BadRequestException(
        "Pay Order Amount must be empty when Pay Order is not required",
      );
    }
  }

  private async duplicateTender(
    organizationId: string,
    tenderIdNormalized: string,
    excludeId?: string,
  ): Promise<DuplicateTender | null> {
    return this.prisma.tender.findFirst({
      where: {
        organizationId,
        tenderIdNormalized,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
        egpTenderId: true,
        tenderIdNormalized: true,
        workName: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
        foundBy: { select: { id: true, name: true, email: true } },
        foundByName: true,
        organizationMaster: { select: { id: true, shortName: true, fullName: true } },
      },
    });
  }

  private duplicateConflict(existing: DuplicateTender | null, normalizedTenderId: string): never {
    throw new ConflictException({
      message: "Tender ID already exists",
      errors: {
        duplicateCode: ["DUPLICATE_TENDER_ID"],
        recordId: existing ? [existing.id] : [],
        existingTenderId: [existing?.tenderIdNormalized ?? normalizedTenderId],
        existingWorkName: existing ? [existing.workName] : [],
        existingOrganizationId: existing?.organizationMaster
          ? [existing.organizationMaster.id]
          : [],
        existingOrganizationShortName: existing?.organizationMaster
          ? [existing.organizationMaster.shortName]
          : [],
        existingOrganizationFullName: existing?.organizationMaster
          ? [existing.organizationMaster.fullName]
          : [],
        foundByName: [existing?.foundBy?.name ?? existing?.foundByName ?? "Not specified"],
        createdByName: [existing?.createdBy?.name ?? "Unknown user"],
        createdAt: existing ? [existing.createdAt.toISOString()] : [],
      },
    });
  }

  private async rethrowDuplicateTender(
    error: unknown,
    organizationId: string,
    normalizedTenderId: string,
    excludeId?: string,
  ): Promise<never> {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await this.duplicateTender(organizationId, normalizedTenderId, excludeId);
      return this.duplicateConflict(existing, normalizedTenderId);
    }
    throw error;
  }

  async create(organizationId: string, userId: string, dto: CreateTenderDto) {
    if (dto.status && dto.status !== "DRAFT") {
      throw new BadRequestException("A new tender must be saved as Draft before workflow actions");
    }

    if (!dto.egpTenderId?.trim()) throw new BadRequestException("Tender ID is required");
    const tenderIdNormalized = normalizeTenderBusinessId(dto.egpTenderId);
    if (!tenderIdNormalized) throw new BadRequestException("Tender ID is required");
    this.assertPayOrderConfiguration(dto.payOrderRequired ?? false, dto.payOrderAmount);
    await Promise.all([
      dto.organizationMasterId?.trim()
        ? this.assertMasterBelongsToOrg(organizationId, dto.organizationMasterId.trim())
        : Promise.resolve(),
      dto.foundByUserId?.trim()
        ? this.assertUserBelongsToOrg(organizationId, dto.foundByUserId.trim())
        : Promise.resolve(),
    ]);

    const duplicate = await this.duplicateTender(organizationId, tenderIdNormalized);
    if (duplicate) this.duplicateConflict(duplicate, tenderIdNormalized);

    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const created = await tx.tender.create({
          data: {
            organizationId,
            organizationMasterId: dto.organizationMasterId?.trim() || null,
            egpTenderId: dto.egpTenderId.trim(),
            tenderIdNormalized,
            workName: dto.workName.trim(),
            category: dto.category?.trim() || null,
            tenderType: dto.tenderType?.trim() || null,
            procurementMethod: dto.procurementMethod ?? TenderProcurementMethod.OTM,
            tenderMethod: dto.tenderMethod?.trim() || null,
            contractValue: dto.contractValue ?? 0,
            status: "DRAFT",
            publishedDate: dto.publishedDate ? new Date(dto.publishedDate) : null,
            documentPurchaseDeadline: dto.documentPurchaseDeadline
              ? new Date(dto.documentPurchaseDeadline)
              : null,
            preBidDate: dto.preBidDate ? new Date(dto.preBidDate) : null,
            submissionDeadline: dto.submissionDeadline ? new Date(dto.submissionDeadline) : null,
            openingDate: dto.openingDate ? new Date(dto.openingDate) : null,
            tenderSecurityRequired: dto.tenderSecurityRequired ?? false,
            estimatedTenderSecurityAmount: dto.estimatedTenderSecurityAmount,
            payOrderRequired: dto.payOrderRequired ?? false,
            payOrderAmount: dto.payOrderRequired ? (dto.payOrderAmount ?? null) : null,
            foundByUserId: dto.foundByUserId?.trim() || null,
            foundByName: dto.foundByUserId?.trim() ? null : dto.foundByName?.trim() || null,
            findingDate: dto.findingDate ? new Date(dto.findingDate) : null,
            assignedToUserId: dto.assignedToUserId,
            assignedToName: dto.assignedToName?.trim() || null,
            description: dto.description?.trim() || null,
            remarks: dto.remarks?.trim() || null,
            createdById: userId,
          },
          include: includeRelations,
        });

        await this.auditLogService.record(
          {
            organizationId,
            userId,
            action: "TENDER_CREATED",
            entityType: "Tender",
            entityId: created.id,
            referenceNo: created.egpTenderId,
            newValue: toDto(created),
          },
          tx,
        );
        return created;
      });
      return toDto(record);
    } catch (error) {
      return this.rethrowDuplicateTender(error, organizationId, tenderIdNormalized);
    }
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateTenderDto) {
    const existing = await this.prisma.tender.findFirst({
      where: { id, organizationId },
      include: includeRelations,
    });
    if (!existing) throw new NotFoundException("Tender not found");

    if (dto.organizationMasterId?.trim()) {
      await this.assertMasterBelongsToOrg(organizationId, dto.organizationMasterId.trim());
    }

    if (dto.foundByUserId?.trim()) {
      await this.assertUserBelongsToOrg(organizationId, dto.foundByUserId.trim());
    }

    const tenderIdNormalized =
      dto.egpTenderId !== undefined
        ? normalizeTenderBusinessId(dto.egpTenderId)
        : existing.tenderIdNormalized;
    if (dto.egpTenderId !== undefined && !tenderIdNormalized) {
      throw new BadRequestException("Tender ID is required");
    }
    const nextPayOrderRequired = dto.payOrderRequired ?? existing.payOrderRequired;
    const nextPayOrderAmount =
      dto.payOrderRequired === false
        ? null
        : dto.payOrderAmount !== undefined
          ? dto.payOrderAmount
          : existing.payOrderAmount;
    const foundByChanged = dto.foundByUserId !== undefined || dto.foundByName !== undefined;
    const nextFoundByUserId = dto.foundByUserId?.trim() || null;
    const nextFoundByName = nextFoundByUserId ? null : dto.foundByName?.trim() || null;
    this.assertPayOrderConfiguration(nextPayOrderRequired, nextPayOrderAmount);
    if (dto.egpTenderId && tenderIdNormalized) {
      const duplicate = await this.duplicateTender(organizationId, tenderIdNormalized, id);
      if (duplicate) this.duplicateConflict(duplicate, tenderIdNormalized);
    }

    try {
      const record = await this.prisma.tender.update({
        where: { id, organizationId },
        data: {
          ...(dto.organizationMasterId !== undefined
            ? { organizationMasterId: dto.organizationMasterId.trim() || null }
            : {}),
          ...(dto.egpTenderId !== undefined
            ? { egpTenderId: dto.egpTenderId.trim(), tenderIdNormalized }
            : {}),
          ...(dto.workName ? { workName: dto.workName.trim() } : {}),
          ...(dto.category !== undefined ? { category: dto.category.trim() || null } : {}),
          ...(dto.tenderType !== undefined ? { tenderType: dto.tenderType.trim() || null } : {}),
          ...(dto.procurementMethod !== undefined
            ? { procurementMethod: dto.procurementMethod }
            : {}),
          ...(dto.tenderMethod !== undefined
            ? { tenderMethod: dto.tenderMethod.trim() || null }
            : {}),
          ...(dto.contractValue !== undefined ? { contractValue: dto.contractValue } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.publishedDate !== undefined
            ? { publishedDate: dto.publishedDate ? new Date(dto.publishedDate) : null }
            : {}),
          ...(dto.documentPurchaseDeadline !== undefined
            ? {
                documentPurchaseDeadline: dto.documentPurchaseDeadline
                  ? new Date(dto.documentPurchaseDeadline)
                  : null,
              }
            : {}),
          ...(dto.preBidDate !== undefined
            ? { preBidDate: dto.preBidDate ? new Date(dto.preBidDate) : null }
            : {}),
          ...(dto.submissionDeadline !== undefined
            ? {
                submissionDeadline: dto.submissionDeadline
                  ? new Date(dto.submissionDeadline)
                  : null,
              }
            : {}),
          ...(dto.openingDate !== undefined
            ? { openingDate: dto.openingDate ? new Date(dto.openingDate) : null }
            : {}),
          ...(dto.tenderSecurityRequired !== undefined
            ? { tenderSecurityRequired: dto.tenderSecurityRequired }
            : {}),
          ...(dto.payOrderRequired !== undefined || dto.payOrderAmount !== undefined
            ? {
                payOrderRequired: nextPayOrderRequired,
                payOrderAmount: nextPayOrderAmount,
              }
            : {}),
          ...(dto.estimatedTenderSecurityAmount !== undefined
            ? { estimatedTenderSecurityAmount: dto.estimatedTenderSecurityAmount }
            : {}),
          ...(foundByChanged
            ? { foundByUserId: nextFoundByUserId, foundByName: nextFoundByName }
            : {}),
          ...(dto.findingDate !== undefined
            ? { findingDate: dto.findingDate ? new Date(dto.findingDate) : null }
            : {}),
          ...(dto.assignedToUserId !== undefined ? { assignedToUserId: dto.assignedToUserId } : {}),
          ...(dto.assignedToName !== undefined
            ? { assignedToName: dto.assignedToName.trim() || null }
            : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
          ...(dto.remarks !== undefined ? { remarks: dto.remarks.trim() || null } : {}),
          version: { increment: 1 },
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
    } catch (error) {
      if (tenderIdNormalized) {
        return this.rethrowDuplicateTender(error, organizationId, tenderIdNormalized, id);
      }
      throw error;
    }
  }

  async remove(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.tender.findFirst({
      where: { id, organizationId },
      include: {
        ...includeRelations,
        costing: { select: { id: true } },
        _count: {
          select: {
            documentPurchases: true,
            tenderSecurities: true,
            creditCommitments: true,
            performanceGuarantees: true,
            receipts: true,
            cmsWorks: true,
            documents: true,
            contracts: true,
            workIous: true,
          },
        },
      },
    });
    if (!existing) throw new NotFoundException("Tender not found");
    if (existing.status !== "DRAFT" || existing.costingApprovalStatus !== "DRAFT") {
      throw new BadRequestException("Only an unused draft tender can be deleted");
    }

    const linkedCount = Object.values(existing._count).reduce((sum, count) => sum + count, 0);
    if (existing.costing || linkedCount > 0) {
      throw new BadRequestException(
        "This tender has linked workflow records and cannot be deleted",
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.auditLogService.record(
          {
            organizationId,
            userId,
            action: "TENDER_DELETED",
            entityType: "Tender",
            entityId: existing.id,
            referenceNo: existing.egpTenderId,
            oldValue: {
              tenderId: existing.egpTenderId,
              workName: existing.workName,
              status: existing.status,
              createdById: existing.createdById,
              createdAt: existing.createdAt,
            },
          },
          tx,
        );
        await tx.tender.delete({
          where: { organizationId_id: { organizationId, id } },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new BadRequestException(
          "This tender has linked workflow records and cannot be deleted",
        );
      }
      throw error;
    }

    return { id };
  }

  async submitForCostingApproval(
    organizationId: string,
    userId: string,
    id: string,
    dto: TenderCostingVersionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.tender.findFirst({
        where: { id, organizationId },
        include: includeRelations,
      });
      if (!existing) throw new NotFoundException("Tender not found");

      if (existing.costingApprovalStatus === TenderCostingApprovalStatus.PENDING_APPROVAL) {
        return toDto(existing);
      }
      if (existing.costingApprovalStatus === TenderCostingApprovalStatus.APPROVED) {
        throw new ConflictException("This tender has already been approved for costing");
      }

      const changed = await tx.tender.updateMany({
        where: {
          id,
          organizationId,
          version: dto.version,
          costingApprovalStatus: {
            in: [TenderCostingApprovalStatus.DRAFT, TenderCostingApprovalStatus.REJECTED],
          },
        },
        data: {
          costingApprovalStatus: TenderCostingApprovalStatus.PENDING_APPROVAL,
          costingSubmittedAt: new Date(),
          costingSubmittedById: userId,
          costingRejectedAt: null,
          costingRejectedById: null,
          costingRejectionReason: null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException("Tender changed; reload it before submitting for approval");
      }
      const record = await tx.tender.findFirst({
        where: { id, organizationId },
        include: includeRelations,
      });
      if (!record) throw new NotFoundException("Tender not found");

      await this.auditLogService.record(
        {
          organizationId,
          userId,
          action: "TENDER_SUBMITTED_FOR_COSTING_APPROVAL",
          entityType: "Tender",
          entityId: id,
          referenceNo: record.egpTenderId,
          oldValue: { costingApprovalStatus: existing.costingApprovalStatus },
          newValue: { costingApprovalStatus: record.costingApprovalStatus },
        },
        tx,
      );
      return toDto(record);
    });
  }

  async approveForCosting(
    organizationId: string,
    userId: string,
    id: string,
    dto: TenderCostingVersionDto,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tender.findFirst({
        where: { id, organizationId },
        include: includeRelations,
      });
      if (!existing) throw new NotFoundException("Tender not found");

      const alreadyApproved =
        existing.costingApprovalStatus === TenderCostingApprovalStatus.APPROVED;
      if (
        !alreadyApproved &&
        existing.costingApprovalStatus !== TenderCostingApprovalStatus.PENDING_APPROVAL
      ) {
        throw new BadRequestException("Only a tender pending costing approval can be approved");
      }

      const approvedAt = existing.costingApprovedAt ?? new Date();
      let tender = existing;
      if (!alreadyApproved) {
        const changed = await tx.tender.updateMany({
          where: {
            id,
            organizationId,
            version: dto.version,
            costingApprovalStatus: TenderCostingApprovalStatus.PENDING_APPROVAL,
          },
          data: {
            costingApprovalStatus: TenderCostingApprovalStatus.APPROVED,
            costingApprovedAt: approvedAt,
            costingApprovedById: userId,
            costingRejectedAt: null,
            costingRejectedById: null,
            costingRejectionReason: null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException("Tender changed; reload it before approving");
        }
        const updated = await tx.tender.findFirst({
          where: { id, organizationId },
          include: includeRelations,
        });
        if (!updated) throw new NotFoundException("Tender not found");
        tender = updated;
      }

      const costing = await tx.tenderCosting.upsert({
        where: { organizationId_tenderId: { organizationId, tenderId: id } },
        create: {
          organizationId,
          tenderId: id,
          estimatedValue: existing.contractValue,
          approvedForCostingAt: approvedAt,
          approvedForCostingById: existing.costingApprovedById ?? userId,
        },
        update: {
          approvedForCostingAt: approvedAt,
          approvedForCostingById: existing.costingApprovedById ?? userId,
        },
      });

      if (!alreadyApproved) {
        await this.auditLogService.record(
          {
            organizationId,
            userId,
            action: "TENDER_APPROVED_FOR_COSTING",
            entityType: "Tender",
            entityId: id,
            referenceNo: tender.egpTenderId,
            oldValue: { costingApprovalStatus: existing.costingApprovalStatus },
            newValue: {
              costingApprovalStatus: tender.costingApprovalStatus,
              costingId: costing.id,
            },
          },
          tx,
        );
      }

      return { tender, costing };
    });

    return { tender: toDto(result.tender), costing: costingToDto(result.costing) };
  }

  async rejectForCosting(
    organizationId: string,
    userId: string,
    id: string,
    dto: RejectTenderCostingDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.tender.findFirst({
        where: { id, organizationId },
        include: includeRelations,
      });
      if (!existing) throw new NotFoundException("Tender not found");
      if (existing.costingApprovalStatus === TenderCostingApprovalStatus.REJECTED) {
        return toDto(existing);
      }
      if (existing.costingApprovalStatus !== TenderCostingApprovalStatus.PENDING_APPROVAL) {
        throw new BadRequestException("Only a tender pending costing approval can be rejected");
      }

      const changed = await tx.tender.updateMany({
        where: {
          id,
          organizationId,
          version: dto.version,
          costingApprovalStatus: TenderCostingApprovalStatus.PENDING_APPROVAL,
        },
        data: {
          costingApprovalStatus: TenderCostingApprovalStatus.REJECTED,
          costingRejectedAt: new Date(),
          costingRejectedById: userId,
          costingRejectionReason: dto.reason.trim(),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException("Tender changed; reload it before rejecting");
      }
      const record = await tx.tender.findFirst({
        where: { id, organizationId },
        include: includeRelations,
      });
      if (!record) throw new NotFoundException("Tender not found");
      await this.auditLogService.record(
        {
          organizationId,
          userId,
          action: "TENDER_COSTING_APPROVAL_REJECTED",
          entityType: "Tender",
          entityId: id,
          referenceNo: record.egpTenderId,
          status: "WARNING",
          oldValue: { costingApprovalStatus: existing.costingApprovalStatus },
          newValue: {
            costingApprovalStatus: record.costingApprovalStatus,
            reason: record.costingRejectionReason,
          },
        },
        tx,
      );
      return toDto(record);
    });
  }

  async submit(organizationId: string, userId: string, id: string, dto: SubmitTenderDto) {
    const existing = await this.prisma.tender.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Tender not found");
    if (
      existing.status === "AWARDED" ||
      existing.status === "ONGOING" ||
      existing.status === "COMPLETED"
    ) {
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
        version: { increment: 1 },
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

  async recordOpening(
    organizationId: string,
    userId: string,
    id: string,
    dto: RecordTenderOpeningDto,
  ) {
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
        version: { increment: 1 },
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
      where: { organizationId, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    });
    return rows.flatMap((row) => (row.category ? [row.category] : []));
  }

  async options(organizationId: string, currentUserId: string) {
    const memberships = await this.prisma.organizationUser.findMany({
      where: { organizationId, user: { isActive: true } },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    });
    return {
      users: memberships.map((membership) => membership.user),
      procurementMethods: PROCUREMENT_METHODS,
      currentUserId,
    };
  }
}
