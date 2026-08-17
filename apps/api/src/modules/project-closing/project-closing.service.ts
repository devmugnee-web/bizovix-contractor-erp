import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
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
    const [certificates, dlps, defects, releases, handovers] = await Promise.all([
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
    ]);
    return {
      certificates,
      dlps,
      defects,
      retention: await this.retentionSummary(org, workId),
      releases,
      handovers,
      readiness: await this.readiness(org, workId),
    };
  }

  async saveCertificate(
    org: string,
    userId: string,
    workId: string,
    dto: SaveCompletionCertificateDto,
  ) {
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

  async certificateStatus(org: string, userId: string, id: string, dto: CertificateStatusDto) {
    const old = await this.prisma.completionCertificate.findFirst({
      where: { id, organizationId: org },
    });
    if (!old) throw new NotFoundException("Completion Certificate not found");
    if (["APPROVED", "CANCELLED"].includes(old.status))
      throw new BadRequestException("Approved or cancelled certificate history is immutable");
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
      action:
        dto.status === "APPROVED"
          ? "COMPLETION_CERTIFICATE_APPROVED"
          : "COMPLETION_CERTIFICATE_STATUS_CHANGED",
      entityType: "CompletionCertificate",
      entityId: id,
      referenceNo: row.certificateNo,
      oldValue: { status: old.status },
      newValue: { status: row.status },
    });
    return row;
  }

  async createDlp(org: string, userId: string, workId: string, dto: CreateDlpDto) {
    const certificate = await this.prisma.completionCertificate.findFirst({
      where: { id: dto.completionCertificateId, organizationId: org, workId, status: "APPROVED" },
    });
    if (!certificate)
      throw new BadRequestException("An approved Completion Certificate is required");
    const startDate = new Date(dto.startDate);
    const row = await this.prisma.defectLiabilityPeriod.create({
      data: {
        organizationId: org,
        workId,
        contractId: certificate.contractId,
        completionCertificateId: certificate.id,
        startDate,
        endDate: addCalendarDays(startDate, dto.durationDays),
        durationDays: dto.durationDays,
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
        remarks: dto.remarks,
        createdById: userId,
      },
    });
    return row;
  }

  async defectStatus(org: string, userId: string, id: string, dto: DefectStatusDto) {
    const old = await this.prisma.dlpDefect.findFirst({ where: { id, organizationId: org } });
    if (!old) throw new NotFoundException("Defect not found");
    const row = await this.prisma.dlpDefect.update({
      where: { id, organizationId: org },
      data: {
        status: dto.status,
        remarks: dto.remarks ?? old.remarks,
        rectifiedDate: dto.rectifiedDate ? new Date(dto.rectifiedDate) : old.rectifiedDate,
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
    return this.prisma.retentionRelease.create({
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
  }

  async releaseRetention(org: string, userId: string, id: string) {
    const existing = await this.prisma.retentionRelease.findFirst({
      where: { id, organizationId: org },
      include: { work: { include: { organizationMaster: true } } },
    });
    if (!existing) throw new NotFoundException("Retention Release not found");
    if (existing.status === "RELEASED") return existing;
    const summary = await this.retentionSummary(org, existing.workId);
    assertRetentionRelease(existing.amount, summary.outstandingRetention);
    const row = await this.prisma.$transaction(
      async (tx) => {
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
    await this.contract(org, workId, dto.contractId);
    if (dto.completionCertificateId) {
      const cert = await this.prisma.completionCertificate.findFirst({
        where: { id: dto.completionCertificateId, organizationId: org, workId },
      });
      if (!cert) throw new NotFoundException("Completion Certificate not found on this project");
    }
    const handoverNo = await this.numbering.next(org, "HANDOVER");
    return this.prisma.projectHandover.create({
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
  }

  async completeHandover(org: string, userId: string, id: string) {
    const row = await this.prisma.projectHandover.findFirst({ where: { id, organizationId: org } });
    if (!row) throw new NotFoundException("Handover not found");
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
    await this.work(org, workId);
    const [
      certificate,
      finalBill,
      receivables,
      retention,
      dlp,
      openDefects,
      handover,
      activeGuarantees,
    ] = await Promise.all([
      this.prisma.completionCertificate.count({
        where: { organizationId: org, workId, status: "APPROVED" },
      }),
      this.prisma.projectBill.count({
        where: {
          organizationId: org,
          cmsWorkId: workId,
          billType: "FINAL",
          status: { in: ["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"] },
        },
      }),
      this.prisma.receivable.aggregate({
        where: { organizationId: org, projectId: workId },
        _sum: { amount: true, receivedAmount: true },
      }),
      this.retentionSummary(org, workId),
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
      this.prisma.performanceGuarantee.count({
        where: {
          organizationId: org,
          status: { in: ["ACTIVE", "RELEASE_REQUESTED"] },
          pgBgWorkflow: { cmsWork: { id: workId } },
        },
      }),
    ]);
    const outstanding = D(receivables._sum.amount ?? 0).sub(receivables._sum.receivedAmount ?? 0);
    const items = [
      {
        key: "completion_certificate",
        label: "Completion Certificate approved",
        blocking: true,
        passed: certificate > 0,
      },
      { key: "final_bill", label: "Final Bill certified", blocking: true, passed: finalBill === 1 },
      {
        key: "receivable",
        label: "No outstanding client receivable",
        blocking: true,
        passed: outstanding.lte(0),
        value: money(outstanding),
      },
      {
        key: "retention",
        label: "No outstanding retention",
        blocking: true,
        passed: D(retention.outstandingRetention).lte(0),
        value: retention.outstandingRetention,
      },
      { key: "dlp", label: "DLP completed", blocking: true, passed: dlp > 0 },
      {
        key: "defects",
        label: "No unresolved mandatory defects",
        blocking: true,
        passed: openDefects === 0,
        value: openDefects,
      },
      {
        key: "guarantee",
        label: "No active PG/BG",
        blocking: true,
        passed: activeGuarantees === 0,
        value: activeGuarantees,
      },
      { key: "handover", label: "Final handover completed", blocking: true, passed: handover > 0 },
    ];
    return {
      status: items.some((i) => i.blocking && !i.passed) ? "NOT_READY" : "READY_TO_CLOSE",
      items,
    };
  }

  async close(
    org: string,
    userId: string,
    workId: string,
    dto: CloseProjectDto,
    canOverride: boolean,
  ) {
    const old = await this.work(org, workId);
    const readiness = await this.readiness(org, workId);
    if (
      readiness.status !== "READY_TO_CLOSE" &&
      !(dto.override && canOverride && dto.reason?.trim())
    )
      throw new BadRequestException(
        "Project has blocking closeout items; authorized override requires a reason",
      );
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.projectClosureEvent.create({
        data: {
          organizationId: org,
          workId,
          action: "CLOSE",
          overrideReason: readiness.status !== "READY_TO_CLOSE" ? dto.reason : null,
          previousStatus: old.status,
          newStatus: "COMPLETED",
          performedById: userId,
        },
      });
      return tx.cmsWork.update({
        where: { id: workId, organizationId: org },
        data: { status: "COMPLETED", completionDate: old.completionDate ?? new Date() },
      });
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "PROJECT_CLOSED",
      entityType: "CmsWork",
      entityId: workId,
      oldValue: { status: old.status },
      newValue: { status: row.status, overrideReason: dto.reason },
    });
    return row;
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
        data: { status: "CLOSEOUT_PENDING" },
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
