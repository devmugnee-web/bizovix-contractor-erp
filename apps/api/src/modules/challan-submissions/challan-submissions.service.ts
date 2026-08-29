import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ChallanSubmissionStatus, Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import {
  calculateChallanItems,
  normalizeChallanSchedule,
  resolveApprovedAmount,
} from "./challan-calculations";
import { ApproveChallanSubmissionDto } from "./dto/challan-action.dto";
import { QueryChallanSubmissionDto } from "./dto/query-challan-submission.dto";
import {
  SaveChallanSubmissionDto,
  UpdateChallanSubmissionDto,
} from "./dto/save-challan-submission.dto";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

export const REQUIRED_CHALLAN_DOCUMENT_TYPES = [
  "DELIVERY_CHALLAN",
  "SUPPLIER_INVOICE",
  "WORK_ORDER_BOQ",
  "SITE_RECEIVING_NOTE",
] as const;

const includeRelations = {
  cmsWork: {
    select: {
      id: true,
      workName: true,
      workCategory: true,
      contractValue: true,
      organizationMaster: { select: { id: true, shortName: true, fullName: true } },
    },
  },
  contract: {
    select: {
      id: true,
      contractNo: true,
      currentContractValue: true,
      currency: true,
      scopeOfWork: true,
      tender: { select: { id: true, egpTenderId: true, workName: true } },
    },
  },
  items: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
  statusHistory: { orderBy: { createdAt: "asc" as const } },
  documents: {
    where: { status: { not: "ARCHIVED" } },
    select: {
      id: true,
      name: true,
      documentType: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      currentVersion: true,
    },
  },
} satisfies Prisma.ChallanSubmissionInclude;

type ChallanRecord = Prisma.ChallanSubmissionGetPayload<{ include: typeof includeRelations }>;

function toDto(record: ChallanRecord) {
  return {
    ...record,
    totalAmount: record.totalAmount.toFixed(2),
    approvedAmount: record.approvedAmount?.toFixed(2) ?? null,
    cmsWork: { ...record.cmsWork, contractValue: record.cmsWork.contractValue.toFixed(2) },
    contract: record.contract
      ? {
          ...record.contract,
          currentContractValue: record.contract.currentContractValue.toFixed(2),
        }
      : null,
    items: record.items.map((item) => ({
      ...item,
      quantity: item.quantity.toFixed(3),
      rate: item.rate.toFixed(2),
      amount: item.amount.toFixed(2),
    })),
  };
}

function cleanRequired(value: string, field: string) {
  const cleaned = value.trim();
  if (!cleaned) throw new BadRequestException(`${field} cannot be blank`);
  return cleaned;
}

function inclusiveDateTo(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59.999Z`) : new Date(value);
}

@Injectable()
export class ChallanSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly lifecycle: ProjectLifecycleGuardService,
  ) {}

  private where(
    organizationId: string,
    query: QueryChallanSubmissionDto,
  ): Prisma.ChallanSubmissionWhereInput {
    return {
      organizationId,
      ...(query.cmsWorkId ? { cmsWorkId: query.cmsWorkId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            challanDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: inclusiveDateTo(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { challanNo: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
              { cmsWork: { workName: { contains: query.search, mode: "insensitive" } } },
              { contract: { contractNo: { contains: query.search, mode: "insensitive" } } },
              {
                contract: {
                  tender: { egpTenderId: { contains: query.search, mode: "insensitive" } },
                },
              },
            ],
          }
        : {}),
    };
  }

  private async assertChallanProjectMutable(
    tx: Prisma.TransactionClient,
    organizationId: string,
    cmsWorkId: string,
    operation: string,
  ) {
    const work = await this.lifecycle.assertOperationalMutationAllowed(
      organizationId,
      cmsWorkId,
      operation,
      tx,
    );
    if (work.status === "CANCELLED") {
      throw new BadRequestException(
        `This project is cancelled. It cannot be used for ${operation}.`,
      );
    }
    return work;
  }

  private async assertRelations(
    tx: Prisma.TransactionClient,
    organizationId: string,
    cmsWorkId: string,
    contractId?: string | null,
  ) {
    await this.assertChallanProjectMutable(
      tx,
      organizationId,
      cmsWorkId,
      "changing challan submissions",
    );
    if (!contractId) return;
    const contract = await tx.projectContract.findFirst({
      where: { id: contractId, organizationId, cmsWorkId, status: { not: "CANCELLED" } },
      select: { id: true },
    });
    if (!contract) throw new NotFoundException("Contract was not found on the selected project");
  }

  async findAll(
    organizationId: string,
    query: QueryChallanSubmissionDto,
  ): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const where = this.where(organizationId, query);
    const [items, total] = await Promise.all([
      this.prisma.challanSubmission.findMany({
        where,
        include: includeRelations,
        orderBy: [{ challanDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.challanSubmission.count({ where }),
    ]);
    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string, cmsWorkId?: string) {
    const where: Prisma.ChallanSubmissionWhereInput = {
      organizationId,
      ...(cmsWorkId ? { cmsWorkId } : {}),
    };
    const [groups, totals, released] = await Promise.all([
      this.prisma.challanSubmission.groupBy({ by: ["status"], where, _count: { _all: true } }),
      this.prisma.challanSubmission.aggregate({
        where,
        _sum: { totalAmount: true, approvedAmount: true },
      }),
      this.prisma.challanSubmission.aggregate({
        where: { ...where, status: "PAYMENT_RELEASED" },
        _sum: { approvedAmount: true },
      }),
    ]);
    const counts = new Map(groups.map((row) => [row.status, row._count._all]));
    return {
      total: groups.reduce((sum, row) => sum + row._count._all, 0),
      draft: counts.get("DRAFT") ?? 0,
      submitted: counts.get("SUBMITTED") ?? 0,
      underReview: counts.get("UNDER_REVIEW") ?? 0,
      approved: counts.get("APPROVED") ?? 0,
      paymentReleased: counts.get("PAYMENT_RELEASED") ?? 0,
      rejected: counts.get("REJECTED") ?? 0,
      cancelled: counts.get("CANCELLED") ?? 0,
      totalAmount: (totals._sum.totalAmount ?? D(0)).toFixed(2),
      approvedAmount: (totals._sum.approvedAmount ?? D(0)).toFixed(2),
      releasedAmount: (released._sum.approvedAmount ?? D(0)).toFixed(2),
    };
  }

  async numberPreview(organizationId: string) {
    return { challanNo: await this.numbering.preview(organizationId, "CHALLAN_SUBMISSION") };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.challanSubmission.findFirst({
      where: { id, organizationId },
      include: includeRelations,
    });
    if (!record) throw new NotFoundException("Challan Submission not found");
    return toDto(record);
  }

  async createDraft(organizationId: string, userId: string, dto: SaveChallanSubmissionDto) {
    const { challanMonth, periodFrom, periodTo } = normalizeChallanSchedule(
      dto.challanMonth,
      dto.periodFrom,
      dto.periodTo,
    );
    const calculated = calculateChallanItems(dto.items ?? []);

    const record = await this.prisma.$transaction(async (tx) => {
      const contractId = dto.contractId?.trim() || null;
      await this.assertRelations(tx, organizationId, dto.cmsWorkId, contractId);
      const challanNo = await this.numbering.next(organizationId, "CHALLAN_SUBMISSION", tx);
      return tx.challanSubmission.create({
        data: {
          organizationId,
          cmsWorkId: dto.cmsWorkId,
          contractId,
          challanNo,
          challanDate: new Date(dto.challanDate),
          description: cleanRequired(dto.description, "Description"),
          challanType: cleanRequired(dto.challanType, "Challan Type"),
          challanMonth,
          periodFrom,
          periodTo,
          receivedBy: cleanRequired(dto.receivedBy, "Received By"),
          receivedAt: cleanRequired(dto.receivedAt, "Received At"),
          submittedTo: cleanRequired(dto.submittedTo, "Submitted To"),
          paymentFrom: cleanRequired(dto.paymentFrom, "Payment From"),
          remarks: dto.remarks?.trim() || null,
          totalAmount: calculated.totalAmount,
          status: "DRAFT",
          createdById: userId,
          items: {
            create: calculated.items.map((item) => ({ organizationId, ...item })),
          },
          statusHistory: {
            create: {
              organizationId,
              fromStatus: null,
              toStatus: "DRAFT",
              action: "CREATED",
              note: "Draft saved",
              actedById: userId,
            },
          },
        },
        include: includeRelations,
      });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "CHALLAN_SUBMISSION_CREATED",
      entityType: "ChallanSubmission",
      entityId: record.id,
      referenceNo: record.challanNo,
      newValue: toDto(record),
    });
    return toDto(record);
  }

  async updateDraft(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateChallanSubmissionDto,
  ) {
    const record = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.challanSubmission.findFirst({ where: { id, organizationId } });
      if (!existing) throw new NotFoundException("Challan Submission not found");
      if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
        throw new BadRequestException("Only a Draft or Rejected challan can be edited");
      }

      const cmsWorkId = dto.cmsWorkId ?? existing.cmsWorkId;
      const contractId =
        dto.contractId === undefined ? existing.contractId : dto.contractId?.trim() || null;
      const { challanMonth, periodFrom, periodTo } = normalizeChallanSchedule(
        dto.challanMonth ?? existing.challanMonth,
        dto.periodFrom ?? existing.periodFrom,
        dto.periodTo ?? existing.periodTo,
      );
      await this.assertRelations(tx, organizationId, cmsWorkId, contractId);

      if (cmsWorkId !== existing.cmsWorkId || contractId !== existing.contractId) {
        const activeDocuments = await tx.document.count({
          where: { organizationId, challanSubmissionId: id, status: { not: "ARCHIVED" } },
        });
        if (activeDocuments) {
          throw new BadRequestException(
            "Archive linked documents before changing the selected project or contract",
          );
        }
      }

      const calculated = dto.items === undefined ? null : calculateChallanItems(dto.items);
      const updated = await tx.challanSubmission.updateMany({
        where: { id, organizationId, status: existing.status },
        data: {
          status: "DRAFT",
          ...(dto.cmsWorkId !== undefined ? { cmsWorkId } : {}),
          ...(dto.contractId !== undefined ? { contractId } : {}),
          ...(dto.challanDate !== undefined ? { challanDate: new Date(dto.challanDate) } : {}),
          ...(dto.description !== undefined
            ? { description: cleanRequired(dto.description, "Description") }
            : {}),
          ...(dto.challanType !== undefined
            ? { challanType: cleanRequired(dto.challanType, "Challan Type") }
            : {}),
          challanMonth,
          ...(dto.periodFrom !== undefined ? { periodFrom } : {}),
          ...(dto.periodTo !== undefined ? { periodTo } : {}),
          ...(dto.receivedBy !== undefined
            ? { receivedBy: cleanRequired(dto.receivedBy, "Received By") }
            : {}),
          ...(dto.receivedAt !== undefined
            ? { receivedAt: cleanRequired(dto.receivedAt, "Received At") }
            : {}),
          ...(dto.submittedTo !== undefined
            ? { submittedTo: cleanRequired(dto.submittedTo, "Submitted To") }
            : {}),
          ...(dto.paymentFrom !== undefined
            ? { paymentFrom: cleanRequired(dto.paymentFrom, "Payment From") }
            : {}),
          ...(dto.remarks !== undefined ? { remarks: dto.remarks.trim() || null } : {}),
          ...(calculated ? { totalAmount: calculated.totalAmount } : {}),
          ...(existing.status === "REJECTED"
            ? { rejectedAt: null, rejectedById: null, rejectionReason: null }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "The challan status changed at the same moment; refresh and retry",
        );
      }

      if (calculated) {
        await tx.challanSubmissionItem.deleteMany({
          where: { challanSubmissionId: id, organizationId },
        });
        if (calculated.items.length) {
          await tx.challanSubmissionItem.createMany({
            data: calculated.items.map((item) => ({
              organizationId,
              challanSubmissionId: id,
              ...item,
            })),
          });
        }
      }

      if (existing.status === "REJECTED") {
        await tx.challanSubmissionStatusHistory.create({
          data: {
            organizationId,
            challanSubmissionId: id,
            fromStatus: "REJECTED",
            toStatus: "DRAFT",
            action: "REWORKED",
            note: "Rejected challan returned to draft for rework",
            actedById: userId,
          },
        });
      }
      return tx.challanSubmission.findFirstOrThrow({
        where: { id, organizationId },
        include: includeRelations,
      });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "CHALLAN_SUBMISSION_UPDATED",
      entityType: "ChallanSubmission",
      entityId: id,
      referenceNo: record.challanNo,
      newValue: toDto(record),
    });
    return toDto(record);
  }

  async submit(organizationId: string, userId: string, id: string) {
    const record = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.challanSubmission.findFirst({ where: { id, organizationId } });
      if (!existing) throw new NotFoundException("Challan Submission not found");
      if (existing.status !== "DRAFT")
        throw new BadRequestException("Only a Draft challan can be submitted");

      // Claim the draft before validating dependent rows. A concurrent draft edit either
      // finishes first (and these reads see its committed items/total) or loses this status guard.
      const updated = await tx.challanSubmission.updateMany({
        where: { id, organizationId, status: "DRAFT" },
        data: { status: "SUBMITTED", submittedAt: new Date(), submittedById: userId },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "The challan status changed at the same moment; refresh and retry",
        );
      }
      const claimed = await tx.challanSubmission.findFirstOrThrow({
        where: { id, organizationId },
        select: { cmsWorkId: true, totalAmount: true },
      });
      await this.assertChallanProjectMutable(
        tx,
        organizationId,
        claimed.cmsWorkId,
        "submitting challans",
      );

      const itemCount = await tx.challanSubmissionItem.count({
        where: { organizationId, challanSubmissionId: id },
      });
      if (!itemCount || claimed.totalAmount.lte(0)) {
        throw new BadRequestException("Add at least one valid challan item before submitting");
      }
      const documents = await tx.document.findMany({
        where: {
          organizationId,
          challanSubmissionId: id,
          status: { not: "ARCHIVED" },
          storageKey: { not: null },
          documentType: { in: [...REQUIRED_CHALLAN_DOCUMENT_TYPES] },
        },
        select: { documentType: true },
      });
      const present = new Set(documents.map((document) => document.documentType).filter(Boolean));
      const missing = REQUIRED_CHALLAN_DOCUMENT_TYPES.filter((type) => !present.has(type));
      if (missing.length) {
        throw new BadRequestException(
          `Upload required challan documents before submitting: ${missing.join(", ")}`,
        );
      }

      await tx.challanSubmissionStatusHistory.create({
        data: {
          organizationId,
          challanSubmissionId: id,
          fromStatus: "DRAFT",
          toStatus: "SUBMITTED",
          action: "SUBMITTED",
          note: "Submitted for review",
          actedById: userId,
        },
      });
      return tx.challanSubmission.findFirstOrThrow({
        where: { id, organizationId },
        include: includeRelations,
      });
    });
    return this.auditTransition(organizationId, userId, record, "CHALLAN_SUBMISSION_SUBMITTED");
  }

  private async transition(
    organizationId: string,
    userId: string,
    id: string,
    allowedFrom: ChallanSubmissionStatus[],
    toStatus: ChallanSubmissionStatus,
    action: string,
    auditAction: string,
    operation: string,
    data: Prisma.ChallanSubmissionUncheckedUpdateInput = {},
    note?: string,
  ) {
    const record = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.challanSubmission.findFirst({ where: { id, organizationId } });
      if (!existing) throw new NotFoundException("Challan Submission not found");
      await this.assertChallanProjectMutable(tx, organizationId, existing.cmsWorkId, operation);
      if (!allowedFrom.includes(existing.status)) {
        throw new BadRequestException(
          `A ${existing.status.replaceAll("_", " ").toLowerCase()} challan cannot move to ${toStatus.replaceAll("_", " ").toLowerCase()}`,
        );
      }
      const updated = await tx.challanSubmission.updateMany({
        where: { id, organizationId, status: existing.status },
        data: { ...data, status: toStatus },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          "The challan status changed at the same moment; refresh and retry",
        );
      await tx.challanSubmissionStatusHistory.create({
        data: {
          organizationId,
          challanSubmissionId: id,
          fromStatus: existing.status,
          toStatus,
          action,
          note,
          actedById: userId,
        },
      });
      return tx.challanSubmission.findFirstOrThrow({
        where: { id, organizationId },
        include: includeRelations,
      });
    });
    return this.auditTransition(organizationId, userId, record, auditAction);
  }

  async startReview(organizationId: string, userId: string, id: string) {
    return this.transition(
      organizationId,
      userId,
      id,
      ["SUBMITTED"],
      "UNDER_REVIEW",
      "REVIEW_STARTED",
      "CHALLAN_SUBMISSION_REVIEW_STARTED",
      "reviewing challans",
      { reviewStartedAt: new Date(), reviewStartedById: userId },
      "Review started",
    );
  }

  async approve(
    organizationId: string,
    userId: string,
    id: string,
    dto: ApproveChallanSubmissionDto,
  ) {
    const record = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.challanSubmission.findFirst({ where: { id, organizationId } });
      if (!existing) throw new NotFoundException("Challan Submission not found");
      if (existing.status !== "UNDER_REVIEW") {
        throw new BadRequestException("Only an Under Review challan can be approved");
      }
      await this.assertChallanProjectMutable(
        tx,
        organizationId,
        existing.cmsWorkId,
        "approving challans",
      );
      // Omission is intentional: full approval is the default; partial approval must be explicit.
      const approvedAmount = resolveApprovedAmount(existing.totalAmount, dto.approvedAmount);
      const updated = await tx.challanSubmission.updateMany({
        where: { id, organizationId, status: "UNDER_REVIEW" },
        data: { status: "APPROVED", approvedAmount, approvedAt: new Date(), approvedById: userId },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          "The challan status changed at the same moment; refresh and retry",
        );
      await tx.challanSubmissionStatusHistory.create({
        data: {
          organizationId,
          challanSubmissionId: id,
          fromStatus: "UNDER_REVIEW",
          toStatus: "APPROVED",
          action: "APPROVED",
          note: `Approved amount: ${approvedAmount.toFixed(2)}`,
          actedById: userId,
        },
      });
      return tx.challanSubmission.findFirstOrThrow({
        where: { id, organizationId },
        include: includeRelations,
      });
    });
    return this.auditTransition(organizationId, userId, record, "CHALLAN_SUBMISSION_APPROVED");
  }

  async reject(organizationId: string, userId: string, id: string, reason?: string) {
    const cleanReason = reason?.trim() || null;
    return this.transition(
      organizationId,
      userId,
      id,
      ["SUBMITTED", "UNDER_REVIEW"],
      "REJECTED",
      "REJECTED",
      "CHALLAN_SUBMISSION_REJECTED",
      "rejecting challans",
      { rejectedAt: new Date(), rejectedById: userId, rejectionReason: cleanReason },
      cleanReason ?? undefined,
    );
  }

  async releasePayment(organizationId: string, userId: string, id: string) {
    return this.transition(
      organizationId,
      userId,
      id,
      ["APPROVED"],
      "PAYMENT_RELEASED",
      "PAYMENT_RELEASED",
      "CHALLAN_SUBMISSION_PAYMENT_RELEASED",
      "releasing challan payment",
      { paymentReleasedAt: new Date(), paymentReleasedById: userId },
      "Payment released",
    );
  }

  async cancel(organizationId: string, userId: string, id: string, reason?: string) {
    const cleanReason = reason?.trim() || null;
    return this.transition(
      organizationId,
      userId,
      id,
      ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "REJECTED"],
      "CANCELLED",
      "CANCELLED",
      "CHALLAN_SUBMISSION_CANCELLED",
      "cancelling challans",
      { cancelledAt: new Date(), cancelledById: userId, cancellationReason: cleanReason },
      cleanReason ?? undefined,
    );
  }

  private async auditTransition(
    organizationId: string,
    userId: string,
    record: ChallanRecord,
    action: string,
  ) {
    await this.auditLogService.record({
      organizationId,
      userId,
      action,
      entityType: "ChallanSubmission",
      entityId: record.id,
      referenceNo: record.challanNo,
      newValue: toDto(record),
    });
    return toDto(record);
  }
}
