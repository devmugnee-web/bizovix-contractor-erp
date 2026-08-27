import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { AccountingService } from "../accounting/accounting.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import {
  addCalendarDays,
  assertRetentionRelease,
  profitMetrics,
  retentionBalance,
} from "./closing-calculations";
import type {
  CertificateStatusDto,
  CloseProjectDto,
  CreateDefectDto,
  CreateDlpDto,
  CreateHandoverDto,
  CreateRetentionReleaseDto,
  DefectStatusDto,
  ExtendDlpDto,
  ReopenProjectDto,
  SaveCompletionCertificateDto,
  UpdateCompletionCertificateDto,
  ArchiveProjectDto,
} from "./dto/project-closing.dto";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);
const money = (value: Prisma.Decimal | number | string) => D(value).toFixed(2);

@Injectable()
export class ProjectClosingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly accounting: AccountingService,
    private readonly numbering: NumberingService,
    private readonly lifecycle: ProjectLifecycleGuardService,
  ) {}

  private async work(org: string, workId: string) {
    const work = await this.prisma.cmsWork.findFirst({
      where: { id: workId, organizationId: org },
    });
    if (!work) throw new NotFoundException("Project not found");
    return work;
  }

  private async contract(org: string, workId: string, contractId: string) {
    const row = await this.prisma.projectContract.findFirst({
      where: { id: contractId, cmsWorkId: workId, organizationId: org },
    });
    if (!row) throw new NotFoundException("Contract not found on this project");
    return row;
  }

  async overview(org: string, workId: string) {
    await this.work(org, workId);
    const [contracts, certificates, dlps, defects, releases, handovers, guarantees] =
      await Promise.all([
        this.prisma.projectContract.findMany({
          where: { organizationId: org, cmsWorkId: workId, status: { not: "CANCELLED" } },
          orderBy: { createdAt: "asc" },
        }),
        this.prisma.completionCertificate.findMany({
          where: { organizationId: org, workId },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.defectLiabilityPeriod.findMany({
          where: { organizationId: org, workId },
          include: { extensions: true },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.dlpDefect.findMany({
          where: { organizationId: org, workId },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.retentionRelease.findMany({
          where: { organizationId: org, workId },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.projectHandover.findMany({
          where: { organizationId: org, workId },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.performanceGuarantee.findMany({
          where: { organizationId: org, pgBgWorkflow: { cmsWork: { id: workId } } },
          orderBy: { createdAt: "desc" },
        }),
      ]);
    return {
      contracts,
      certificates,
      dlps,
      defects,
      retention: await this.retentionSummary(org, workId),
      releases,
      handovers,
      guarantees,
      readiness: await this.readiness(org, workId),
    };
  }

  async latestReadinessSnapshot(org: string, workId: string) {
    await this.work(org, workId);
    const event = await this.prisma.projectClosureEvent.findFirst({
      where: {
        organizationId: org,
        workId,
        action: "CLOSE",
        readinessSnapshot: { not: Prisma.JsonNull },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, readinessSnapshot: true, performedById: true, createdAt: true },
    });
    if (!event) throw new NotFoundException("Close-time readiness snapshot not found");
    return event;
  }

  async saveCertificate(
    org: string,
    userId: string,
    workId: string,
    dto: SaveCompletionCertificateDto,
  ) {
    await this.lifecycle.assertOperationalMutationAllowed(
      org,
      workId,
      "changing completion records",
    );
    await this.work(org, workId);
    await this.contract(org, workId, dto.contractId);
    const certificateNo = await this.numbering.next(org, "COMPLETION_CERTIFICATE");
    const row = await this.prisma.completionCertificate.create({
      data: {
        organizationId: org,
        workId,
        contractId: dto.contractId,
        certificateNo,
        completionType: dto.completionType ?? "FINAL",
        applicationDate: new Date(dto.applicationDate),
        actualCompletionDate: new Date(dto.actualCompletionDate),
        certifiedCompletionDate: dto.certifiedCompletionDate
          ? new Date(dto.certifiedCompletionDate)
          : null,
        certificateDate: dto.certificateDate ? new Date(dto.certificateDate) : null,
        issuingAuthority: dto.issuingAuthority,
        remarks: dto.remarks,
        createdById: userId,
      },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "COMPLETION_CERTIFICATE_CREATED",
      entityType: "CompletionCertificate",
      entityId: row.id,
      referenceNo: row.certificateNo,
    });
    return row;
  }

  async updateCertificate(
    org: string,
    userId: string,
    id: string,
    dto: UpdateCompletionCertificateDto,
  ) {
    const old = await this.prisma.completionCertificate.findFirst({
      where: { id, organizationId: org },
    });
    if (!old) throw new NotFoundException("Completion Certificate not found");
    await this.lifecycle.assertOperationalMutationAllowed(
      org,
      old.workId,
      "changing completion records",
    );
    if (old.status !== "DRAFT" && old.status !== "REJECTED")
      throw new BadRequestException("Only a draft or rejected certificate can be edited");
    const row = await this.prisma.completionCertificate.update({
      where: { id, organizationId: org },
      data: {
        ...(dto.applicationDate ? { applicationDate: new Date(dto.applicationDate) } : {}),
        ...(dto.actualCompletionDate
          ? { actualCompletionDate: new Date(dto.actualCompletionDate) }
          : {}),
        ...(dto.certifiedCompletionDate
          ? { certifiedCompletionDate: new Date(dto.certifiedCompletionDate) }
          : {}),
        ...(dto.certificateDate ? { certificateDate: new Date(dto.certificateDate) } : {}),
        ...(dto.issuingAuthority !== undefined ? { issuingAuthority: dto.issuingAuthority } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
        ...(old.status === "REJECTED" ? { status: "DRAFT" } : {}),
      },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "COMPLETION_CERTIFICATE_UPDATED",
      entityType: "CompletionCertificate",
      entityId: id,
      oldValue: old,
      newValue: row,
    });
    return row;
  }

  async certificateStatus(org: string, userId: string, id: string, dto: CertificateStatusDto) {
    const old = await this.prisma.completionCertificate.findFirst({
      where: { id, organizationId: org },
    });
    if (!old) throw new NotFoundException("Completion Certificate not found");
    await this.lifecycle.assertOperationalMutationAllowed(
      org,
      old.workId,
      "changing completion records",
    );
    if (["APPROVED", "CANCELLED"].includes(old.status))
      throw new BadRequestException("Approved or cancelled certificate history is immutable");
    const allowed: Record<string, string[]> = {
      DRAFT: ["SUBMITTED", "CANCELLED"],
      SUBMITTED: ["APPROVED", "REJECTED", "CANCELLED"],
      REJECTED: ["SUBMITTED", "CANCELLED"],
    };
    if (!allowed[old.status]?.includes(dto.status))
      throw new BadRequestException(
        `Invalid certificate transition ${old.status} -> ${dto.status}`,
      );
    if (
      dto.status === "APPROVED" &&
      (!old.certifiedCompletionDate || !old.certificateDate || !old.issuingAuthority)
    )
      throw new BadRequestException(
        "Certificate date, certified completion date and issuing authority are required for approval",
      );
    const row = await this.prisma.completionCertificate.update({
      where: { id, organizationId: org },
      data: {
        status: dto.status,
        remarks: dto.remarks ?? old.remarks,
        ...(dto.status === "APPROVED" ? { approvedById: userId, approvedAt: new Date() } : {}),
      },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: `COMPLETION_CERTIFICATE_${dto.status}`,
      entityType: "CompletionCertificate",
      entityId: id,
      referenceNo: row.certificateNo,
      oldValue: { status: old.status },
      newValue: { status: row.status },
    });
    return row;
  }

  async createDlp(org: string, userId: string, workId: string, dto: CreateDlpDto) {
    await this.lifecycle.assertOperationalMutationAllowed(org, workId, "starting DLP");
    const certificate = await this.prisma.completionCertificate.findFirst({
      where: { id: dto.completionCertificateId, organizationId: org, workId, status: "APPROVED" },
    });
    if (!certificate)
      throw new BadRequestException("An approved Completion Certificate is required");
    const contract = await this.contract(org, workId, certificate.contractId);
    const durationDays = dto.durationDays ?? contract.dlpDays;
    if (!durationDays || durationDays < 1)
      throw new BadRequestException("DLP duration is not configured on the contract");
    const startDate = new Date(
      dto.startDate ?? certificate.certifiedCompletionDate ?? certificate.actualCompletionDate,
    );
    const endDate = addCalendarDays(startDate, durationDays);
    const row = await this.prisma.defectLiabilityPeriod.create({
      data: {
        organizationId: org,
        workId,
        contractId: certificate.contractId,
        completionCertificateId: certificate.id,
        startDate,
        endDate,
        originalStartDate: startDate,
        originalEndDate: endDate,
        durationDays,
        status: "ACTIVE",
        remarks: dto.remarks,
        createdById: userId,
      },
    });
    await this.prisma.cmsWork.update({
      where: { id: workId, organizationId: org },
      data: { status: "DLP" },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "DLP_STARTED",
      entityType: "DefectLiabilityPeriod",
      entityId: row.id,
    });
    return row;
  }

  async extendDlp(org: string, userId: string, id: string, dto: ExtendDlpDto) {
    const old = await this.prisma.defectLiabilityPeriod.findFirst({
      where: { id, organizationId: org },
    });
    if (!old) throw new NotFoundException("DLP not found");
    await this.lifecycle.assertOperationalMutationAllowed(org, old.workId, "extending DLP");
    if (old.status === "COMPLETED")
      throw new BadRequestException("A completed DLP cannot be extended");
    const revisedEndDate = addCalendarDays(old.endDate, dto.extensionDays);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.dlpExtension.create({
        data: {
          dlpId: id,
          previousEndDate: old.endDate,
          revisedEndDate,
          extensionDays: dto.extensionDays,
          reason: dto.reason,
          approvedById: userId,
        },
      });
      return tx.defectLiabilityPeriod.update({
        where: { id, organizationId: org },
        data: {
          endDate: revisedEndDate,
          durationDays: { increment: dto.extensionDays },
          status: "EXTENDED",
        },
      });
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "DLP_EXTENDED",
      entityType: "DefectLiabilityPeriod",
      entityId: id,
      oldValue: { endDate: old.endDate },
      newValue: { endDate: revisedEndDate, reason: dto.reason },
    });
    return row;
  }

  async completeDlp(org: string, userId: string, id: string) {
    const dlp = await this.prisma.defectLiabilityPeriod.findFirst({
      where: { id, organizationId: org },
    });
    if (!dlp) throw new NotFoundException("DLP not found");
    await this.lifecycle.assertOperationalMutationAllowed(org, dlp.workId, "completing DLP");
    const open = await this.prisma.dlpDefect.count({
      where: {
        organizationId: org,
        dlpId: id,
        mandatory: true,
        status: { notIn: ["VERIFIED", "CLOSED"] },
      },
    });
    if (open) throw new BadRequestException(`${open} mandatory defect(s) remain unresolved`);
    const row = await this.prisma.defectLiabilityPeriod.update({
      where: { id, organizationId: org },
      data: { status: "COMPLETED", completedById: userId, completedAt: new Date() },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "DLP_COMPLETED",
      entityType: "DefectLiabilityPeriod",
      entityId: id,
    });
    return row;
  }

  async createDefect(org: string, userId: string, workId: string, dto: CreateDefectDto) {
    await this.lifecycle.assertOperationalMutationAllowed(org, workId, "recording defects");
    const dlp = await this.prisma.defectLiabilityPeriod.findFirst({
      where: { id: dto.dlpId, organizationId: org, workId },
    });
    if (!dlp) throw new NotFoundException("DLP not found on this project");
    const defectNo = await this.numbering.next(org, "DLP_DEFECT");
    const row = await this.prisma.dlpDefect.create({
      data: {
        organizationId: org,
        workId,
        dlpId: dlp.id,
        defectNo,
        description: dto.description,
        reportedDate: new Date(dto.reportedDate),
        reportedBy: dto.reportedBy,
        responsiblePerson: dto.responsiblePerson,
        targetRectificationDate: dto.targetRectificationDate
          ? new Date(dto.targetRectificationDate)
          : null,
        mandatory: dto.mandatory ?? true,
        priority: dto.priority ?? "MEDIUM",
        remarks: dto.remarks,
        createdById: userId,
      },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "DEFECT_CREATED",
      entityType: "DlpDefect",
      entityId: row.id,
      referenceNo: row.defectNo,
    });
    return row;
  }

  async defectStatus(org: string, userId: string, id: string, dto: DefectStatusDto) {
    const old = await this.prisma.dlpDefect.findFirst({ where: { id, organizationId: org } });
    if (!old) throw new NotFoundException("Defect not found");
    await this.lifecycle.assertOperationalMutationAllowed(org, old.workId, "changing defects");
    const allowed: Record<string, string[]> = {
      OPEN: ["IN_PROGRESS", "RECTIFIED"],
      IN_PROGRESS: ["RECTIFIED"],
      RECTIFIED: ["VERIFIED"],
      VERIFIED: ["CLOSED"],
      CLOSED: [],
    };
    if (!allowed[old.status]?.includes(dto.status))
      throw new BadRequestException(`Invalid defect transition ${old.status} -> ${dto.status}`);
    const row = await this.prisma.dlpDefect.update({
      where: { id, organizationId: org },
      data: {
        status: dto.status,
        remarks: dto.remarks ?? old.remarks,
        rectifiedDate: dto.rectifiedDate ? new Date(dto.rectifiedDate) : old.rectifiedDate,
        ...(dto.status === "RECTIFIED" && !dto.rectifiedDate ? { rectifiedDate: new Date() } : {}),
        ...(dto.status === "VERIFIED" ? { verifiedDate: new Date() } : {}),
        ...(dto.status === "CLOSED" ? { closedDate: new Date() } : {}),
        ...(["VERIFIED", "CLOSED"].includes(dto.status) ? { verifiedById: userId } : {}),
      },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: `DEFECT_${dto.status}`,
      entityType: "DlpDefect",
      entityId: id,
      referenceNo: row.defectNo,
    });
    return row;
  }

  async retentionSummary(org: string, workId: string) {
    const [held, released] = await Promise.all([
      this.prisma.projectBill.aggregate({
        where: {
          organizationId: org,
          cmsWorkId: workId,
          status: { in: ["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"] },
        },
        _sum: { retentionAmount: true },
      }),
      this.prisma.retentionRelease.aggregate({
        where: { organizationId: org, workId, status: "RELEASED" },
        _sum: { amount: true },
      }),
    ]);
    const totalHeld = D(held._sum.retentionAmount ?? 0);
    const totalReleased = D(released._sum.amount ?? 0);
    return {
      totalRetentionDeducted: money(totalHeld),
      previouslyReleased: money(totalReleased),
      outstandingRetention: money(retentionBalance(totalHeld, totalReleased)),
    };
  }

  async createRetentionRelease(
    org: string,
    userId: string,
    workId: string,
    dto: CreateRetentionReleaseDto,
  ) {
    await this.contract(org, workId, dto.contractId);
    const summary = await this.retentionSummary(org, workId);
    assertRetentionRelease(dto.amount, summary.outstandingRetention);
    const releaseNo = await this.numbering.next(org, "RETENTION_RELEASE");
    const row = await this.prisma.retentionRelease.create({
      data: {
        organizationId: org,
        workId,
        contractId: dto.contractId,
        releaseNo,
        amount: D(dto.amount),
        releaseDueDate: dto.releaseDueDate ? new Date(dto.releaseDueDate) : null,
        reference: dto.reference,
        remarks: dto.remarks,
        createdById: userId,
      },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "RETENTION_RELEASE_CREATED",
      entityType: "RetentionRelease",
      entityId: row.id,
      referenceNo: row.releaseNo,
    });
    return row;
  }

  async releaseRetention(org: string, userId: string, id: string) {
    const existing = await this.prisma.retentionRelease.findFirst({
      where: { id, organizationId: org },
      include: { work: { include: { organizationMaster: true } } },
    });
    if (!existing) throw new NotFoundException("Retention Release not found");
    if (existing.status === "RELEASED") return existing;
    const row = await this.prisma.$transaction(
      async (tx) => {
        const [bills, released] = await Promise.all([
          tx.projectBill.findMany({
            where: {
              organizationId: org,
              cmsWorkId: existing.workId,
              status: { in: ["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"] },
            },
            orderBy: { billDate: "asc" },
          }),
          tx.retentionRelease.aggregate({
            where: { organizationId: org, workId: existing.workId, status: "RELEASED" },
            _sum: { amount: true },
          }),
        ]);
        const held = bills.reduce((sum, bill) => sum.add(bill.retentionAmount), D(0));
        assertRetentionRelease(existing.amount, held.sub(released._sum.amount ?? 0));
        const journal = await this.accounting.post(tx, {
          organizationId: org,
          userId,
          journalDate: new Date(),
          referenceNo: existing.releaseNo,
          description: `Retention released ${existing.releaseNo}`,
          sourceModule: "RETENTION_RELEASE",
          sourceType: "RELEASE",
          sourceId: id,
          lines: [
            {
              systemKey: "ACCOUNTS_RECEIVABLE",
              projectId: existing.workId,
              partyName: existing.work.organizationMaster.shortName,
              partyType: "CUSTOMER",
              debit: existing.amount,
              credit: 0,
            },
            {
              systemKey: "RETENTION_RECEIVABLE",
              projectId: existing.workId,
              partyName: existing.work.organizationMaster.shortName,
              partyType: "CUSTOMER",
              debit: 0,
              credit: existing.amount,
            },
          ],
        });
        await tx.receivable.create({
          data: {
            organizationId: org,
            projectId: existing.workId,
            contractId: existing.contractId,
            partyName: existing.work.organizationMaster.shortName,
            billNo: existing.releaseNo,
            billDate: new Date(),
            amount: existing.amount,
            description: "Retention release receivable",
          },
        });
        let remaining = D(existing.amount);
        for (const bill of bills) {
          if (remaining.lte(0)) break;
          const available = bill.retentionAmount.sub(bill.retentionReleasedAmount);
          if (available.lte(0)) continue;
          const applied = Prisma.Decimal.min(available, remaining);
          await tx.projectBill.update({
            where: { id: bill.id, organizationId: org },
            data: { retentionReleasedAmount: { increment: applied } },
          });
          remaining = remaining.sub(applied);
        }
        return tx.retentionRelease.update({
          where: { id, organizationId: org },
          data: {
            status: "RELEASED",
            releaseDate: new Date(),
            releasedById: userId,
            approvedById: userId,
            journalEntryId: journal.id,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.audit.record({
      organizationId: org,
      userId,
      action: "RETENTION_RELEASED",
      entityType: "RetentionRelease",
      entityId: id,
      referenceNo: row.releaseNo,
    });
    return row;
  }

  async createHandover(org: string, userId: string, workId: string, dto: CreateHandoverDto) {
    await this.lifecycle.assertOperationalMutationAllowed(org, workId, "creating handover records");
    await this.contract(org, workId, dto.contractId);
    if (dto.completionCertificateId) {
      const cert = await this.prisma.completionCertificate.findFirst({
        where: { id: dto.completionCertificateId, organizationId: org, workId },
      });
      if (!cert) throw new NotFoundException("Completion Certificate not found on this project");
    }
    const handoverNo = await this.numbering.next(org, "HANDOVER");
    const row = await this.prisma.projectHandover.create({
      data: {
        organizationId: org,
        workId,
        contractId: dto.contractId,
        completionCertificateId: dto.completionCertificateId,
        handoverNo,
        handoverType: dto.handoverType ?? "FINAL",
        handoverDate: new Date(dto.handoverDate),
        handedOverBy: dto.handedOverBy,
        receivedBy: dto.receivedBy,
        authority: dto.authority,
        remarks: dto.remarks,
        createdById: userId,
      },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "HANDOVER_CREATED",
      entityType: "ProjectHandover",
      entityId: row.id,
      referenceNo: row.handoverNo,
    });
    return row;
  }

  async completeHandover(org: string, userId: string, id: string) {
    const row = await this.prisma.projectHandover.findFirst({ where: { id, organizationId: org } });
    if (!row) throw new NotFoundException("Handover not found");
    await this.lifecycle.assertOperationalMutationAllowed(
      org,
      row.workId,
      "completing handover records",
    );
    const updated = await this.prisma.projectHandover.update({
      where: { id, organizationId: org },
      data: { status: "COMPLETED", completedById: userId, completedAt: new Date() },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "HANDOVER_COMPLETED",
      entityType: "ProjectHandover",
      entityId: id,
      referenceNo: row.handoverNo,
    });
    return updated;
  }

  async readiness(org: string, workId: string) {
    const work = await this.work(org, workId);
    const contract = await this.prisma.projectContract.findFirst({
      where: { organizationId: org, cmsWorkId: workId, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "asc" },
    });
    const [
      certificate,
      finalBill,
      receivables,
      retention,
      dlpTotal,
      dlpCompleted,
      openDefects,
      handover,
      guarantees,
      workflow,
      payables,
      integrity,
    ] = await Promise.all([
      this.prisma.completionCertificate.count({
        where: { organizationId: org, workId, status: "APPROVED" },
      }),
      this.prisma.projectBill.findFirst({
        where: {
          organizationId: org,
          cmsWorkId: workId,
          billType: "FINAL",
          status: { in: ["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"] },
        },
        orderBy: { billDate: "desc" },
      }),
      this.prisma.receivable.aggregate({
        where: { organizationId: org, projectId: workId },
        _sum: { amount: true, receivedAmount: true },
      }),
      this.retentionSummary(org, workId),
      this.prisma.defectLiabilityPeriod.count({
        where: { organizationId: org, workId },
      }),
      this.prisma.defectLiabilityPeriod.count({
        where: { organizationId: org, workId, status: "COMPLETED" },
      }),
      this.prisma.dlpDefect.count({
        where: {
          organizationId: org,
          workId,
          mandatory: true,
          status: { notIn: ["VERIFIED", "CLOSED"] },
        },
      }),
      this.prisma.projectHandover.count({
        where: { organizationId: org, workId, status: "COMPLETED", handoverType: "FINAL" },
      }),
      this.prisma.performanceGuarantee.findMany({
        where: { organizationId: org, pgBgWorkflow: { cmsWork: { id: workId } } },
        select: { id: true, status: true },
      }),
      contract?.pgBgWorkflowId
        ? this.prisma.pgBgWorkflow.findFirst({
            where: { id: contract.pgBgWorkflowId, organizationId: org },
            select: { pgBgRequired: true },
          })
        : Promise.resolve(null),
      this.prisma.payable.aggregate({
        where: { organizationId: org, projectId: workId, status: { not: "PAID" } },
        _sum: { amount: true, paidAmount: true },
      }),
      this.accounting.integrity(org),
    ]);
    const outstanding = D(receivables._sum.amount ?? 0).sub(receivables._sum.receivedAmount ?? 0);
    const retentionApplicable =
      Boolean(contract?.retentionPct?.gt(0)) || D(retention.totalRetentionDeducted).gt(0);
    const dlpApplicable = Boolean(contract?.dlpDays && contract.dlpDays > 0) || dlpTotal > 0;
    const guaranteeApplicable = workflow?.pgBgRequired === true || guarantees.length > 0;
    const securityDepositApplicable = Boolean(contract?.securityDepositPct?.gt(0));
    const securityDepositReleased = contract?.securityDepositStatus === "RELEASED";
    const activeGuarantees = guarantees.filter((g) =>
      ["ACTIVE", "RELEASE_REQUESTED", "EXPIRED"].includes(g.status),
    ).length;
    const guaranteesSatisfied = guarantees.length > 0 && activeGuarantees === 0;
    const payableOutstanding = D(payables._sum.amount ?? 0).sub(payables._sum.paidAmount ?? 0);
    const financialBalanced =
      integrity.ar.status === "BALANCED" &&
      integrity.ap.status === "BALANCED" &&
      integrity.retention.status === "BALANCED" &&
      integrity.banks.every((bank) => bank.status === "BALANCED") &&
      integrity.unbalancedJournalCount === 0;
    const item = (
      key: string,
      label: string,
      passed: boolean,
      blocking: boolean,
      options: {
        applicable?: boolean;
        value?: string | number;
        message?: string;
        route?: string;
      } = {},
    ) => {
      const applicable = options.applicable ?? true;
      return {
        key,
        label,
        blocking: applicable ? blocking : false,
        passed: applicable ? passed : true,
        status: applicable
          ? passed
            ? "PASSED"
            : blocking
              ? "FAILED"
              : "WARNING"
          : "NOT_APPLICABLE",
        value: options.value,
        message: options.message,
        route: options.route,
      };
    };
    const items = [
      item("completion_certificate", "Completion Certificate approved", certificate > 0, true, {
        route: `/cms/ongoing-works/${workId}?tab=Completion%20%26%20Closeout`,
      }),
      item("final_bill", "Final Bill certified", Boolean(finalBill), true, {
        route: `/cms/ongoing-works/${workId}?tab=Running%20Bills`,
      }),
      item("receivable", "No outstanding client receivable", outstanding.lte(0), true, {
        value: money(outstanding),
      }),
      item(
        "retention",
        "No outstanding retention",
        D(retention.outstandingRetention).lte(0),
        true,
        { applicable: retentionApplicable, value: retention.outstandingRetention },
      ),
      item("dlp", "DLP completed", dlpCompleted > 0, true, { applicable: dlpApplicable }),
      item("defects", "No unresolved mandatory defects", openDefects === 0, true, {
        applicable: dlpApplicable,
        value: openDefects,
      }),
      item("guarantee", "Required PG/BG released or returned", guaranteesSatisfied, true, {
        applicable: guaranteeApplicable,
        value: activeGuarantees || (guaranteeApplicable && guarantees.length === 0 ? 1 : 0),
        message:
          guaranteeApplicable && guarantees.length === 0
            ? "Required guarantee has not been issued"
            : undefined,
      }),
      item("handover", "Final handover completed", handover > 0, true),
      item(
        "project_payables",
        "No project-specific outstanding payable",
        payableOutstanding.lte(0),
        true,
        { value: money(payableOutstanding) },
      ),
      item("financial_integrity", "Financial integrity reconciled", financialBalanced, true, {
        message: financialBalanced
          ? "AR, AP, bank, retention and journals are balanced"
          : "Organization financial integrity is out of balance",
      }),
      item("security_deposit", "Security Deposit released", securityDepositReleased, true, {
        applicable: securityDepositApplicable,
        message:
          securityDepositApplicable && !contract?.securityDepositReleaseDueDate
            ? "SD Release Due Date is not configured"
            : undefined,
      }),
    ];
    const hasBlocking = items.some((i) => i.blocking && !i.passed);
    const hasWarning = items.some(
      (i) =>
        i.status === "WARNING" ||
        (i.status === "NOT_APPLICABLE" && i.message?.startsWith("NOT CONFIGURED")),
    );
    return {
      status: hasBlocking ? "NOT_READY" : hasWarning ? "READY_WITH_WARNINGS" : "READY_TO_CLOSE",
      items,
      project: {
        id: work.id,
        status: work.status,
        closedAt: work.closedAt,
        archivedAt: work.archivedAt,
      },
      finalBill: finalBill
        ? {
            id: finalBill.id,
            billNo: finalBill.billNo,
            status: finalBill.status,
            grossBillAmount: money(finalBill.grossBillAmount),
            netCertifiedAmount: money(finalBill.netCertifiedAmount),
            retentionAmount: money(finalBill.retentionAmount),
            totalReceived: money(finalBill.receivedAmount),
          }
        : null,
    };
  }

  async close(
    org: string,
    userId: string,
    workId: string,
    dto: CloseProjectDto,
    canOverride: boolean,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "cms_works" WHERE id = ${workId} AND "organizationId" = ${org} FOR UPDATE`;
        const old = await tx.cmsWork.findFirst({ where: { id: workId, organizationId: org } });
        if (!old) throw new NotFoundException("Project not found");
        if (["COMPLETED", "ARCHIVED"].includes(old.status))
          throw new BadRequestException("Project is already closed or archived");
        const readiness = await this.readiness(org, workId);
        const financialIntegrity = readiness.items.find(
          (item) => item.key === "financial_integrity",
        );
        if (financialIntegrity && !financialIntegrity.passed)
          throw new BadRequestException(
            "Project cannot close while financial integrity is out of balance",
          );
        if (
          readiness.status === "NOT_READY" &&
          !(dto.override && canOverride && dto.reason?.trim())
        )
          throw new BadRequestException(
            "Project has blocking closeout items; authorized override requires a reason",
          );
        const closedAt = new Date();
        const changed = await tx.cmsWork.updateMany({
          where: { id: workId, organizationId: org, status: old.status },
          data: {
            status: "COMPLETED",
            completionDate: old.completionDate ?? closedAt,
            closedAt,
            closedById: userId,
          },
        });
        if (changed.count !== 1)
          throw new BadRequestException(
            "Project close state changed concurrently; refresh and retry",
          );
        await tx.projectClosureEvent.create({
          data: {
            organizationId: org,
            workId,
            action: "CLOSE",
            overrideReason: readiness.status === "NOT_READY" ? dto.reason : null,
            previousStatus: old.status,
            newStatus: "COMPLETED",
            performedById: userId,
            readinessSnapshot: {
              ...readiness,
              closedBy: userId,
              closedAt: closedAt.toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
        await this.audit.record(
          {
            organizationId: org,
            userId,
            action: "PROJECT_CLOSED",
            entityType: "CmsWork",
            entityId: workId,
            oldValue: { status: old.status },
            newValue: { status: "COMPLETED", overrideReason: dto.reason, readiness },
          },
          tx,
        );
        return tx.cmsWork.findUniqueOrThrow({ where: { id: workId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async reopen(org: string, userId: string, workId: string, dto: ReopenProjectDto) {
    const old = await this.work(org, workId);
    if (!["COMPLETED", "ARCHIVED"].includes(old.status))
      throw new BadRequestException("Only a completed or archived project can be reopened");
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.projectClosureEvent.create({
        data: {
          organizationId: org,
          workId,
          action: "REOPEN",
          reason: dto.reason,
          previousStatus: old.status,
          newStatus: "CLOSEOUT_PENDING",
          performedById: userId,
        },
      });
      return tx.cmsWork.update({
        where: { id: workId, organizationId: org },
        data: {
          status: "CLOSEOUT_PENDING",
          closedAt: null,
          closedById: null,
          archivedAt: null,
          archivedById: null,
        },
      });
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "PROJECT_REOPENED",
      entityType: "CmsWork",
      entityId: workId,
      description: dto.reason,
    });
    return row;
  }

  async archive(org: string, userId: string, workId: string, dto: ArchiveProjectDto) {
    const old = await this.work(org, workId);
    if (old.status !== "COMPLETED")
      throw new BadRequestException("Only a closed project can be archived");
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.projectClosureEvent.create({
        data: {
          organizationId: org,
          workId,
          action: "ARCHIVE",
          reason: dto.reason,
          previousStatus: old.status,
          newStatus: "ARCHIVED",
          performedById: userId,
        },
      });
      return tx.cmsWork.update({
        where: { id: workId, organizationId: org },
        data: { status: "ARCHIVED", archivedAt: new Date(), archivedById: userId },
      });
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "PROJECT_ARCHIVED",
      entityType: "CmsWork",
      entityId: workId,
      description: dto.reason,
    });
    return row;
  }

  async profitability(org: string, workId: string) {
    const work = await this.work(org, workId);
    const [contract, variations, budget, expenses, bills, receipts, retention] = await Promise.all([
      this.prisma.projectContract.findFirst({
        where: { organizationId: org, cmsWorkId: workId, status: { not: "CANCELLED" } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.variationOrder.aggregate({
        where: { organizationId: org, cmsWorkId: workId, status: "APPROVED" },
        _sum: { approvedAmount: true },
      }),
      this.prisma.projectBudget.findFirst({
        where: { organizationId: org, cmsWorkId: workId, status: "APPROVED" },
        orderBy: { version: "desc" },
      }),
      this.prisma.expense.aggregate({
        where: { organizationId: org, workId, status: "APPROVED" },
        _sum: { amount: true },
      }),
      this.prisma.projectBill.aggregate({
        where: {
          organizationId: org,
          cmsWorkId: workId,
          status: { in: ["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"] },
        },
        _sum: { grossBillAmount: true, netCertifiedAmount: true },
      }),
      this.prisma.receipt.aggregate({
        where: { organizationId: org, workId, status: "RECEIVED" },
        _sum: { amount: true },
      }),
      this.retentionSummary(org, workId),
    ]);
    const original = contract?.originalContractValue ?? work.contractValue;
    const current = contract?.currentContractValue ?? work.contractValue;
    const certified = D(bills._sum.grossBillAmount ?? 0);
    const finalCost = D(expenses._sum.amount ?? 0);
    const profit = profitMetrics(current, certified, finalCost);
    return {
      originalContractValue: money(original),
      approvedVariations: money(variations._sum.approvedAmount ?? 0),
      currentContractValue: money(current),
      approvedProjectBudget: budget ? money(budget.totalBudget) : null,
      actualProjectExpenses: money(finalCost),
      totalCertified: money(certified),
      netCertifiedReceivable: money(bills._sum.netCertifiedAmount ?? 0),
      totalReceived: money(receipts._sum.amount ?? 0),
      outstandingReceivable: money(
        D(bills._sum.netCertifiedAmount ?? 0).sub(receipts._sum.amount ?? 0),
      ),
      retentionHeld: retention.totalRetentionDeducted,
      retentionReleased: retention.previouslyReleased,
      retentionOutstanding: retention.outstandingRetention,
      bankGuaranteeCharges: null,
      finalProjectCost: money(finalCost),
      grossProfitLoss: money(profit.grossProfit),
      profitMarginPct: profit.profitMarginPct?.toFixed(2) ?? null,
    };
  }
}
