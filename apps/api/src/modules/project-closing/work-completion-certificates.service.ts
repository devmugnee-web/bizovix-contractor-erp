import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import type { UpdateCompletionCertificateEgpDto } from "./dto/project-closing.dto";
import type {
  QueryWorkCompletionCertificateDto,
} from "./dto/query-work-completion-certificate.dto";
import {
  deriveWorkCompletionDisplayStatus,
  summarizeWorkCompletionRows,
} from "./work-completion-certificate-status";

const workInclude = {
  tender: { select: { id: true, egpTenderId: true } },
  organizationMaster: { select: { shortName: true } },
  contracts: {
    where: { status: { not: "CANCELLED" as const } },
    orderBy: [{ updatedAt: "desc" as const }, { id: "asc" as const }],
    take: 1,
    select: { id: true, contractNo: true, scopeOfWork: true },
  },
  completionCertificates: {
    where: {
      completionType: { equals: "FINAL", mode: "insensitive" as const },
      status: { not: "CANCELLED" as const },
    },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
    include: {
      contract: { select: { id: true, contractNo: true, scopeOfWork: true } },
      documents: {
        where: { status: { not: "ARCHIVED" } },
        orderBy: [{ updatedAt: "desc" as const }, { id: "asc" as const }],
        select: {
          id: true,
          name: true,
          documentType: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          currentVersion: true,
          status: true,
          updatedAt: true,
        },
      },
    },
  },
} satisfies Prisma.CmsWorkInclude;

type WorkWithCompletion = Prisma.CmsWorkGetPayload<{ include: typeof workInclude }>;

function toRow(work: WorkWithCompletion) {
  const certificate = work.completionCertificates[0] ?? null;
  const contract = certificate?.contract ?? work.contracts[0] ?? null;
  const scopeOfWork = contract?.scopeOfWork?.trim();
  return {
    id: certificate?.id ?? work.id,
    workId: work.id,
    tenderId: work.tenderId,
    tid: work.tender?.egpTenderId ?? null,
    project: work.workName,
    procuringEntity: work.organizationMaster.shortName,
    workDescription: scopeOfWork || work.workCategory,
    workCategory: work.workCategory,
    contractNo: contract?.contractNo ?? null,
    projectStatus: work.status,
    workCompletionDate: work.completionDate,
    displayStatus: deriveWorkCompletionDisplayStatus(certificate),
    source: certificate?.source ?? null,
    egpStatus: certificate?.egpStatus ?? null,
    wccObtainedOn:
      certificate?.status === "APPROVED" ? certificate.certificateDate : null,
    certificateNo: certificate?.certificateNo ?? null,
    certificateDate: certificate?.certificateDate ?? null,
    egpAppliedOn: certificate?.egpAppliedOn ?? null,
    egpObtainedOn: certificate?.egpObtainedOn ?? null,
    lastUpdated: certificate?.updatedAt ?? work.updatedAt,
    certificate: certificate
      ? {
          id: certificate.id,
          certificateNo: certificate.certificateNo,
          completionType: certificate.completionType,
          source: certificate.source,
          egpStatus: certificate.egpStatus,
          status: certificate.status,
          applicationDate: certificate.applicationDate,
          actualCompletionDate: certificate.actualCompletionDate,
          certifiedCompletionDate: certificate.certifiedCompletionDate,
          certificateDate: certificate.certificateDate,
          egpAppliedOn: certificate.egpAppliedOn,
          egpObtainedOn: certificate.egpObtainedOn,
          issuingAuthority: certificate.issuingAuthority,
          remarks: certificate.remarks,
          contract: certificate.contract,
          createdAt: certificate.createdAt,
          updatedAt: certificate.updatedAt,
        }
      : null,
    documents: certificate?.documents ?? [],
  };
}

type WorkCompletionRow = ReturnType<typeof toRow>;

@Injectable()
export class WorkCompletionCertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: ProjectLifecycleGuardService,
    private readonly audit: AuditLogService,
  ) {}

  private async rows(organizationId: string, query: QueryWorkCompletionCertificateDto) {
    const search = query.search?.trim();
    const records = await this.prisma.cmsWork.findMany({
      where: {
        organizationId,
        status: query.completedOnly
          ? { in: ["COMPLETED", "ARCHIVED"] }
          : { not: "CANCELLED" },
        ...(query.cmsWorkId ? { id: query.cmsWorkId } : {}),
        ...(search
          ? {
              OR: [
                { workName: { contains: search, mode: "insensitive" } },
                { workCategory: { contains: search, mode: "insensitive" } },
                { tender: { egpTenderId: { contains: search, mode: "insensitive" } } },
                {
                  contracts: {
                    some: {
                      status: { not: "CANCELLED" },
                      scopeOfWork: { contains: search, mode: "insensitive" },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: workInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });

    return records.map(toRow).filter((row) => this.matches(row, query));
  }

  private matches(row: WorkCompletionRow, query: QueryWorkCompletionCertificateDto) {
    if (query.source && row.source !== query.source) return false;
    if (query.egpStatus && row.egpStatus !== query.egpStatus) return false;
    if (query.certificateStatus && row.certificate?.status !== query.certificateStatus) {
      return false;
    }
    if (query.displayStatus && row.displayStatus !== query.displayStatus) return false;
    return true;
  }

  async findAll(organizationId: string, query: QueryWorkCompletionCertificateDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const rows = await this.rows(organizationId, query);
    return {
      items: rows.slice((page - 1) * limit, page * limit),
      meta: buildPaginationMeta(rows.length, page, limit),
    };
  }

  async stats(organizationId: string, query: QueryWorkCompletionCertificateDto) {
    const rows = await this.rows(organizationId, query);
    return summarizeWorkCompletionRows(rows);
  }

  async findOne(organizationId: string, workId: string) {
    const rows = await this.rows(organizationId, { cmsWorkId: workId });
    const row = rows[0];
    if (!row) throw new NotFoundException("Project / Work not found");
    return row;
  }

  async updateEgpTracking(
    organizationId: string,
    userId: string,
    certificateId: string,
    dto: UpdateCompletionCertificateEgpDto,
  ) {
    const existing = await this.prisma.completionCertificate.findFirst({
      where: { id: certificateId, organizationId },
    });
    if (!existing) throw new NotFoundException("Completion Certificate not found");
    await this.lifecycle.assertOperationalMutationAllowed(
      organizationId,
      existing.workId,
      "changing e-GP completion tracking",
    );
    if (existing.source !== "MANUAL") {
      throw new BadRequestException(
        "e-GP follow-up tracking is only available for a manually obtained WCC",
      );
    }
    if (existing.status !== "APPROVED") {
      throw new BadRequestException(
        "The manual WCC must be approved before applying for an e-GP WCC",
      );
    }
    if (!["PENDING", "UNDER_PROCESS", "OBTAINED"].includes(dto.egpStatus)) {
      throw new BadRequestException("Select Pending, Under Process, or Obtained");
    }

    const allowed: Record<string, string[]> = {
      NOT_APPLIED: ["PENDING"],
      PENDING: ["PENDING", "UNDER_PROCESS", "OBTAINED"],
      UNDER_PROCESS: ["UNDER_PROCESS", "OBTAINED"],
      OBTAINED: ["OBTAINED"],
    };
    if (!allowed[existing.egpStatus]?.includes(dto.egpStatus)) {
      throw new BadRequestException(
        `Invalid e-GP tracking transition ${existing.egpStatus} -> ${dto.egpStatus}`,
      );
    }

    const appliedOn = dto.egpAppliedOn
      ? new Date(dto.egpAppliedOn)
      : existing.egpAppliedOn;
    if (!appliedOn) throw new BadRequestException("e-GP Applied On date is required");
    const obtainedOn =
      dto.egpStatus === "OBTAINED"
        ? dto.egpObtainedOn
          ? new Date(dto.egpObtainedOn)
          : existing.egpObtainedOn
        : null;
    if (dto.egpStatus === "OBTAINED" && !obtainedOn) {
      throw new BadRequestException("e-GP Obtained On date is required");
    }
    if (obtainedOn && obtainedOn < appliedOn) {
      throw new BadRequestException("e-GP Obtained On cannot be before e-GP Applied On");
    }

    const updated = await this.prisma.completionCertificate.update({
      where: { id: certificateId, organizationId },
      data: {
        egpStatus: dto.egpStatus,
        egpAppliedOn: appliedOn,
        egpObtainedOn: obtainedOn,
        ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
      },
    });
    await this.audit.record({
      organizationId,
      userId,
      action: "COMPLETION_CERTIFICATE_EGP_TRACKING_UPDATED",
      entityType: "CompletionCertificate",
      entityId: certificateId,
      referenceNo: updated.certificateNo,
      oldValue: {
        egpStatus: existing.egpStatus,
        egpAppliedOn: existing.egpAppliedOn,
        egpObtainedOn: existing.egpObtainedOn,
      },
      newValue: {
        egpStatus: updated.egpStatus,
        egpAppliedOn: updated.egpAppliedOn,
        egpObtainedOn: updated.egpObtainedOn,
      },
    });
    return this.findOne(organizationId, updated.workId);
  }
}
