import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CreateContractDto } from "./dto/create-contract.dto";
import { UpdateContractDto } from "./dto/update-contract.dto";
import { QueryContractDto } from "./dto/query-contract.dto";

const includeRelations = {
  cmsWork: {
    select: { id: true, workName: true, workCategory: true, status: true, contractValue: true },
  },
  organizationMaster: { select: { id: true, shortName: true, fullName: true } },
  tender: { select: { id: true, workName: true, egpTenderId: true } },
} satisfies Prisma.ProjectContractInclude;

type ContractRecord = Prisma.ProjectContractGetPayload<{ include: typeof includeRelations }>;

/** Elapsed-time-vs-schedule indicator, derived purely from the contract's own real dates —
 * not a fabricated execution percentage (BOQ execution tracking is a later phase). */
function scheduleProgressPct(record: ContractRecord): number {
  if (record.status === "COMPLETED" || record.status === "CLOSED") return 100;
  if (record.status === "DRAFT" || record.status === "CANCELLED") return 0;
  const start = record.commencementDate.getTime();
  const end = record.currentCompletionDate.getTime();
  if (end <= start) return 0;
  const elapsed = (Date.now() - start) / (end - start);
  return Math.round(Math.min(100, Math.max(0, elapsed * 100)));
}

function toDto(record: ContractRecord) {
  return {
    ...record,
    originalContractValue: record.originalContractValue.toFixed(2),
    currentContractValue: record.currentContractValue.toFixed(2),
    retentionPct: record.retentionPct?.toFixed(2) ?? null,
    securityDepositPct: record.securityDepositPct?.toFixed(2) ?? null,
    vatPct: record.vatPct?.toFixed(2) ?? null,
    taxPct: record.taxPct?.toFixed(2) ?? null,
    securityDepositReleasedAmount: record.securityDepositReleasedAmount?.toFixed(2) ?? null,
    securityDepositReleaseDueDate: record.securityDepositReleaseDueDate?.toISOString() ?? null,
    cmsWork: { ...record.cmsWork, contractValue: record.cmsWork.contractValue.toFixed(2) },
    scheduleProgressPct: scheduleProgressPct(record),
  };
}

const COMPLETING_SOON_DAYS = 30;

function assertReleasedDateNotFuture(value?: string | null) {
  if (value && new Date(value) > new Date()) {
    throw new BadRequestException("SD released date cannot be in the future");
  }
}

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly lifecycle: ProjectLifecycleGuardService,
  ) {}

  private where(organizationId: string, query: QueryContractDto): Prisma.ProjectContractWhereInput {
    return {
      organizationId,
      ...(query.organizationMasterId ? { organizationMasterId: query.organizationMasterId } : {}),
      ...(query.cmsWorkId ? { cmsWorkId: query.cmsWorkId } : {}),
      ...(query.workCategory ? { cmsWork: { workCategory: query.workCategory } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.fromDate || query.toDate
        ? {
            currentCompletionDate: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { contractNo: { contains: query.search, mode: "insensitive" } },
              { cmsWork: { workName: { contains: query.search, mode: "insensitive" } } },
              {
                organizationMaster: { shortName: { contains: query.search, mode: "insensitive" } },
              },
            ],
          }
        : {}),
    };
  }

  async findAll(
    organizationId: string,
    query: QueryContractDto,
  ): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = this.where(organizationId, query);

    const [items, total] = await Promise.all([
      this.prisma.projectContract.findMany({
        where,
        include: includeRelations,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.projectContract.count({ where }),
    ]);

    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string) {
    const soon = new Date(Date.now() + COMPLETING_SOON_DAYS * 24 * 60 * 60 * 1000);
    const [total, active, valueAgg, completingSoon] = await Promise.all([
      this.prisma.projectContract.count({ where: { organizationId } }),
      this.prisma.projectContract.count({ where: { organizationId, status: "ACTIVE" } }),
      this.prisma.projectContract.aggregate({
        where: { organizationId, status: { notIn: ["CANCELLED"] } },
        _sum: { currentContractValue: true },
      }),
      this.prisma.projectContract.count({
        where: {
          organizationId,
          status: "ACTIVE",
          currentCompletionDate: { lte: soon, gte: new Date() },
        },
      }),
    ]);
    return {
      total,
      active,
      contractValue: (valueAgg._sum.currentContractValue ?? 0).toString(),
      completingSoon,
    };
  }

  async categories(organizationId: string) {
    const rows = await this.prisma.cmsWork.findMany({
      where: { organizationId, contracts: { some: {} } },
      distinct: ["workCategory"],
      select: { workCategory: true },
      orderBy: { workCategory: "asc" },
    });
    return rows.map((row) => row.workCategory);
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.projectContract.findFirst({
      where: { id, organizationId },
      include: includeRelations,
    });
    if (!record) throw new NotFoundException("Contract not found");

    const documents = await this.prisma.document.findMany({
      where: { organizationId, contractId: id },
      select: { id: true, name: true, category: true, expiryDate: true },
      orderBy: { createdAt: "desc" },
    });

    return { ...toDto(record), linked: { documents } };
  }

  private async assertRelations(
    organizationId: string,
    dto: { cmsWorkId?: string; tenderId?: string; pgBgWorkflowId?: string },
  ) {
    if (dto.cmsWorkId) {
      const work = await this.prisma.cmsWork.findFirst({
        where: { id: dto.cmsWorkId, organizationId },
      });
      if (!work) throw new NotFoundException("Project / Work not found");
      return work;
    }
    return null;
  }

  async create(organizationId: string, userId: string, dto: CreateContractDto) {
    assertReleasedDateNotFuture(dto.securityDepositReleasedDate);
    const work = await this.assertRelations(organizationId, dto);
    if (!work) throw new BadRequestException("Linked Project / Work is required");
    await this.lifecycle.assertOperationalMutationAllowed(
      organizationId,
      work.id,
      "creating a contract",
    );

    if (dto.tenderId) {
      const tender = await this.prisma.tender.findFirst({
        where: { id: dto.tenderId, organizationId },
      });
      if (!tender) throw new NotFoundException("Linked Tender not found");
    }
    if (dto.pgBgWorkflowId) {
      const workflow = await this.prisma.pgBgWorkflow.findFirst({
        where: { id: dto.pgBgWorkflowId, organizationId },
      });
      if (!workflow) throw new NotFoundException("Linked PG/BG not found");
    }

    const commencementDate = new Date(dto.commencementDate);
    const originalCompletionDate = new Date(dto.originalCompletionDate);
    if (originalCompletionDate < commencementDate) {
      throw new BadRequestException(
        "Original Completion Date must be on or after the Commencement Date",
      );
    }
    const durationDays =
      dto.durationDays ??
      Math.round((originalCompletionDate.getTime() - commencementDate.getTime()) / 86_400_000);

    const record = await this.prisma.projectContract.create({
      data: {
        organizationId,
        cmsWorkId: work.id,
        organizationMasterId: work.organizationMasterId,
        tenderId: dto.tenderId,
        pgBgWorkflowId: dto.pgBgWorkflowId,
        contractType: dto.contractType ?? "WORK_ORDER",
        contractNo: dto.contractNo,
        issueDate: new Date(dto.issueDate),
        contractDate: dto.contractDate ? new Date(dto.contractDate) : null,
        originalContractValue: dto.originalContractValue,
        currentContractValue: dto.currentContractValue ?? dto.originalContractValue,
        currency: dto.currency ?? "BDT",
        commencementDate,
        originalCompletionDate,
        currentCompletionDate: dto.currentCompletionDate
          ? new Date(dto.currentCompletionDate)
          : originalCompletionDate,
        durationDays,
        dlpDays: dto.dlpDays,
        retentionPct: dto.retentionPct,
        securityDepositPct: dto.securityDepositPct,
        vatPct: dto.vatPct,
        taxPct: dto.taxPct,
        securityDepositMethod: dto.securityDepositMethod,
        securityDepositStatus: dto.securityDepositStatus,
        securityDepositReleasedAmount: dto.securityDepositReleasedAmount,
        securityDepositReleaseDueDate: dto.securityDepositReleaseDueDate
          ? new Date(dto.securityDepositReleaseDueDate)
          : null,
        securityDepositReleasedDate: dto.securityDepositReleasedDate
          ? new Date(dto.securityDepositReleasedDate)
          : null,
        clientContactName: dto.clientContactName,
        responsiblePerson: dto.responsiblePerson,
        scopeOfWork: dto.scopeOfWork,
        remarks: dto.remarks,
        status: dto.status ?? "DRAFT",
        createdById: userId,
      },
      include: includeRelations,
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "CONTRACT_CREATED",
      entityType: "ProjectContract",
      entityId: record.id,
      referenceNo: record.contractNo,
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateContractDto) {
    assertReleasedDateNotFuture(dto.securityDepositReleasedDate);
    const existing = await this.prisma.projectContract.findFirst({
      where: { id, organizationId },
      include: includeRelations,
    });
    if (!existing) throw new NotFoundException("Contract not found");
    await this.lifecycle.assertOperationalMutationAllowed(
      organizationId,
      existing.cmsWorkId,
      "updating a contract",
    );

    if (dto.cmsWorkId) await this.assertRelations(organizationId, dto);
    if (dto.tenderId) {
      const tender = await this.prisma.tender.findFirst({
        where: { id: dto.tenderId, organizationId },
      });
      if (!tender) throw new NotFoundException("Linked Tender not found");
    }
    if (dto.pgBgWorkflowId) {
      const workflow = await this.prisma.pgBgWorkflow.findFirst({
        where: { id: dto.pgBgWorkflowId, organizationId },
      });
      if (!workflow) throw new NotFoundException("Linked PG/BG not found");
    }

    const commencementDate = dto.commencementDate
      ? new Date(dto.commencementDate)
      : existing.commencementDate;
    const originalCompletionDate = dto.originalCompletionDate
      ? new Date(dto.originalCompletionDate)
      : existing.originalCompletionDate;
    if (originalCompletionDate < commencementDate) {
      throw new BadRequestException(
        "Original Completion Date must be on or after the Commencement Date",
      );
    }

    const record = await this.prisma.projectContract.update({
      where: { id, organizationId },
      data: {
        ...(dto.cmsWorkId ? { cmsWorkId: dto.cmsWorkId } : {}),
        ...(dto.tenderId !== undefined ? { tenderId: dto.tenderId } : {}),
        ...(dto.pgBgWorkflowId !== undefined ? { pgBgWorkflowId: dto.pgBgWorkflowId } : {}),
        ...(dto.contractType ? { contractType: dto.contractType } : {}),
        ...(dto.contractNo ? { contractNo: dto.contractNo } : {}),
        ...(dto.issueDate ? { issueDate: new Date(dto.issueDate) } : {}),
        ...(dto.contractDate !== undefined
          ? { contractDate: dto.contractDate ? new Date(dto.contractDate) : null }
          : {}),
        ...(dto.originalContractValue !== undefined
          ? { originalContractValue: dto.originalContractValue }
          : {}),
        ...(dto.currentContractValue !== undefined
          ? { currentContractValue: dto.currentContractValue }
          : {}),
        ...(dto.currency ? { currency: dto.currency } : {}),
        ...(dto.commencementDate ? { commencementDate } : {}),
        ...(dto.originalCompletionDate ? { originalCompletionDate } : {}),
        ...(dto.currentCompletionDate
          ? { currentCompletionDate: new Date(dto.currentCompletionDate) }
          : {}),
        ...(dto.durationDays !== undefined ? { durationDays: dto.durationDays } : {}),
        ...(dto.dlpDays !== undefined ? { dlpDays: dto.dlpDays } : {}),
        ...(dto.retentionPct !== undefined ? { retentionPct: dto.retentionPct } : {}),
        ...(dto.securityDepositPct !== undefined
          ? { securityDepositPct: dto.securityDepositPct }
          : {}),
        ...(dto.vatPct !== undefined ? { vatPct: dto.vatPct } : {}),
        ...(dto.taxPct !== undefined ? { taxPct: dto.taxPct } : {}),
        ...(dto.securityDepositMethod !== undefined
          ? { securityDepositMethod: dto.securityDepositMethod || null }
          : {}),
        ...(dto.securityDepositStatus !== undefined
          ? { securityDepositStatus: dto.securityDepositStatus || null }
          : {}),
        ...(dto.securityDepositReleasedAmount !== undefined
          ? { securityDepositReleasedAmount: dto.securityDepositReleasedAmount }
          : {}),
        ...(dto.securityDepositReleaseDueDate !== undefined
          ? {
              securityDepositReleaseDueDate: dto.securityDepositReleaseDueDate
                ? new Date(dto.securityDepositReleaseDueDate)
                : null,
            }
          : {}),
        ...(dto.securityDepositReleasedDate !== undefined
          ? {
              securityDepositReleasedDate: dto.securityDepositReleasedDate
                ? new Date(dto.securityDepositReleasedDate)
                : null,
            }
          : {}),
        ...(dto.clientContactName !== undefined
          ? { clientContactName: dto.clientContactName }
          : {}),
        ...(dto.responsiblePerson !== undefined
          ? { responsiblePerson: dto.responsiblePerson }
          : {}),
        ...(dto.scopeOfWork !== undefined ? { scopeOfWork: dto.scopeOfWork } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      include: includeRelations,
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "CONTRACT_UPDATED",
      entityType: "ProjectContract",
      entityId: id,
      referenceNo: record.contractNo,
      oldValue: toDto(existing),
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async activate(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.projectContract.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Contract not found");
    await this.lifecycle.assertOperationalMutationAllowed(
      organizationId,
      existing.cmsWorkId,
      "activating a contract",
    );
    if (existing.status !== "DRAFT") {
      throw new BadRequestException("Only a Draft contract can be activated");
    }

    const record = await this.prisma.projectContract.update({
      where: { id, organizationId },
      data: { status: "ACTIVE" },
      include: includeRelations,
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "CONTRACT_ACTIVATED",
      entityType: "ProjectContract",
      entityId: id,
      referenceNo: record.contractNo,
      oldValue: { status: existing.status },
      newValue: { status: record.status },
    });

    return toDto(record);
  }
}
