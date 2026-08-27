import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReminderRuleService } from "../settings-notifications/reminder-rule.service";
import { ProjectClosingService } from "../project-closing/project-closing.service";
import type {
  QueryReminderDto,
  SaveReminderDto,
  SnoozeReminderDto,
  UpdateReminderDto,
} from "./dto/reminder.dto";

const AUTO_SOURCE_MODULES = [
  "TENDER_SECURITY",
  "PG_BG",
  "SECURITY_DEPOSIT",
  "PAYABLE",
  "CHEQUE",
  "DOCUMENT",
  "RECEIVABLE",
  "TENDER_SUBMISSION",
  "TENDER_OPENING",
  "CONTRACT",
  "PROJECT_BILL",
] as const;
const TENDER_NOT_YET_SUBMITTED = ["DRAFT", "PUBLISHED", "DOCUMENT_PURCHASED", "PREPARING"] as const;

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
    private readonly reminderRules: ReminderRuleService,
    private readonly projectClosing: ProjectClosingService,
  ) {}
  private day(date = new Date()) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
      end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  /** Full per-organization pass: sync from business tables, resolve stale ones,
   * recompute due/overdue status, then generate notifications for what's active.
   * Reused by both the request-triggered path (list/stats/quick) and the scheduler. */
  async syncOrganization(org: string): Promise<void> {
    await this.syncSources(org);
    await this.resolveLegacyAliases(org);
    await this.syncCloseoutReadiness(org);
    await this.autoResolveStaleReminders(org);
    await this.refreshStatuses(org);
    await this.notifications.generateForOrg(org);
  }

  private async resolveLegacyAliases(org: string) {
    const aliases = [
      { sourceModule: "TENDER_SECURITY", oldType: "Tender Security Expiry", newType: "Tender Security" },
      { sourceModule: "PG_BG", oldType: "PG/BG Expiry", newType: "PG/BG" },
      { sourceModule: "PAYABLE", oldType: "Payable Due", newType: "Bill Maturity" },
      { sourceModule: "RECEIVABLE", oldType: "Receivable Due", newType: "Bill Maturity" },
    ];
    for (const alias of aliases) {
      const legacy = await this.prisma.reminder.findMany({
        where: {
          organizationId: org,
          sourceModule: alias.sourceModule,
          type: alias.oldType,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        select: { id: true, sourceId: true, dueDate: true },
      });
      for (const row of legacy) {
        const replacement = await this.prisma.reminder.findFirst({
          where: {
            organizationId: org,
            sourceModule: alias.sourceModule,
            sourceId: row.sourceId,
            dueDate: row.dueDate,
            type: alias.newType,
          },
          select: { id: true },
        });
        if (!replacement) continue;
        await this.prisma.reminder.update({
          where: { id: row.id },
          data: { status: "COMPLETED", isResolved: true, completedAt: new Date() },
        });
        await this.notifications.resolveForReminder(org, row.id);
      }
    }
  }

  private async syncCloseoutReadiness(org: string) {
    const works = await this.prisma.cmsWork.findMany({
      where: { organizationId: org, status: { notIn: ["COMPLETED", "ARCHIVED", "CANCELLED"] } },
      select: { id: true, workName: true },
    });
    const readyIds: string[] = [];
    for (const work of works) {
      const readiness = await this.projectClosing.readiness(org, work.id);
      if (!readiness.status.startsWith("READY_")) continue;
      readyIds.push(work.id);
      const dueDate = new Date();
      dueDate.setUTCHours(0, 0, 0, 0);
      await this.prisma.reminder.upsert({
        where: {
          organizationId_sourceModule_sourceId_type_dueDate: {
            organizationId: org,
            sourceModule: "PROJECT_CLOSEOUT",
            sourceId: work.id,
            type: "Project Ready to Close",
            dueDate,
          },
        },
        update: {
          status: "UPCOMING",
          isResolved: false,
          title: `Project ready to close: ${work.workName}`,
        },
        create: {
          organizationId: org,
          type: "Project Ready to Close",
          title: `Project ready to close: ${work.workName}`,
          description: `/cms/ongoing-works/${work.id}?tab=Completion%20%26%20Closeout`,
          dueDate,
          priority: "HIGH",
          sourceModule: "PROJECT_CLOSEOUT",
          sourceType: "READY_TO_CLOSE",
          sourceId: work.id,
          relatedEntityType: "CmsWork",
          relatedEntityId: work.id,
          relatedEntityName: work.workName,
          notificationBefore: 0,
          assignedToName: "Unassigned",
        },
      });
    }
    const stale = await this.prisma.reminder.findMany({
      where: {
        organizationId: org,
        sourceModule: "PROJECT_CLOSEOUT",
        sourceId: { notIn: readyIds },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      select: { id: true },
    });
    if (stale.length) {
      const ids = stale.map((item) => item.id);
      await this.prisma.reminder.updateMany({
        where: { id: { in: ids }, organizationId: org },
        data: { status: "COMPLETED", isResolved: true, completedAt: new Date() },
      });
      for (const id of ids) await this.notifications.resolveForReminder(org, id);
    }
  }

  private async refreshStatuses(org: string) {
    const { start, end } = this.day();
    const unsnoozing = await this.prisma.reminder.findMany({
      where: { organizationId: org, status: "SNOOZED", snoozedUntil: { lte: new Date() } },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.reminder.updateMany({
        where: {
          organizationId: org,
          status: { in: ["UPCOMING", "DUE_TODAY", "OVERDUE"] },
          dueDate: { lt: start },
        },
        data: { status: "OVERDUE" },
      }),
      this.prisma.reminder.updateMany({
        where: {
          organizationId: org,
          status: { in: ["UPCOMING", "DUE_TODAY", "OVERDUE"] },
          dueDate: { gte: start, lt: end },
        },
        data: { status: "DUE_TODAY" },
      }),
      this.prisma.reminder.updateMany({
        where: {
          organizationId: org,
          status: { in: ["UPCOMING", "DUE_TODAY", "OVERDUE"] },
          dueDate: { gte: end },
        },
        data: { status: "UPCOMING" },
      }),
      this.prisma.reminder.updateMany({
        where: { organizationId: org, status: "SNOOZED", snoozedUntil: { lte: new Date() } },
        data: { status: "UPCOMING", snoozedUntil: null },
      }),
    ]);
    if (unsnoozing.length) {
      await this.notifications.resetForReminders(
        org,
        unsnoozing.map((r) => r.id),
      );
    }
  }
  private source(
    org: string,
    input: {
      type: string;
      title: string;
      dueDate: Date;
      sourceModule: string;
      sourceId: string;
      referenceNo?: string | null;
      relatedEntityName?: string | null;
      organizationName?: string | null;
      priority: string;
      notificationBefore: number;
    },
  ) {
    return this.prisma.reminder.upsert({
      where: {
        organizationId_sourceModule_sourceId_type_dueDate: {
          organizationId: org,
          sourceModule: input.sourceModule,
          sourceId: input.sourceId,
          type: input.type,
          dueDate: input.dueDate,
        },
      },
      update: {
        title: input.title,
        referenceNo: input.referenceNo,
        relatedEntityName: input.relatedEntityName,
        organizationName: input.organizationName,
      },
      create: {
        organizationId: org,
        ...input,
        status: "UPCOMING",
        assignedToName: "Unassigned",
        sourceType: input.type,
        relatedEntityType: input.sourceModule,
        relatedEntityId: input.sourceId,
      },
    });
  }
  async syncSources(org: string) {
    const [
      rules,
      security,
      guarantees,
      securityDeposits,
      payables,
      cheques,
      documents,
      receivables,
      submittingTenders,
      openingTenders,
      activeContracts,
      retentionBills,
      dlps,
      defects,
      pendingCertificates,
      pendingHandovers,
    ] = await Promise.all([
      this.reminderRules.allRules(org),
      this.prisma.tenderSecurity.findMany({
        where: { organizationId: org, status: "ACTIVE" },
        include: { tender: true, organizationMaster: true },
      }),
      this.prisma.performanceGuarantee.findMany({
        where: { organizationId: org, status: "ACTIVE" },
        include: { tender: true, organizationMaster: true },
      }),
      this.prisma.projectContract.findMany({
        where: {
          organizationId: org,
          securityDepositPct: { gt: 0 },
          securityDepositReleaseDueDate: { not: null },
          securityDepositStatus: { in: ["HELD", "PARTIALLY_RELEASED"] },
        },
        include: { cmsWork: true, organizationMaster: true },
      }),
      this.prisma.payable.findMany({
        where: { organizationId: org, status: { not: "PAID" }, dueDate: { not: null } },
      }),
      this.prisma.cheque.findMany({
        where: { organizationId: org, status: { in: ["PENDING", "DEPOSITED"] } },
      }),
      this.prisma.document.findMany({ where: { organizationId: org, expiryDate: { not: null } } }),
      this.prisma.receivable.findMany({
        where: {
          organizationId: org,
          status: { not: "RECEIVED" },
          dueDate: { not: null },
        },
        include: { project: true },
      }),
      this.prisma.tender.findMany({
        where: {
          organizationId: org,
          status: { in: [...TENDER_NOT_YET_SUBMITTED] },
          submissionDeadline: { not: null },
        },
        include: { organizationMaster: true },
      }),
      this.prisma.tender.findMany({
        where: { organizationId: org, status: "SUBMITTED", openingDate: { not: null } },
        include: { organizationMaster: true },
      }),
      this.prisma.projectContract.findMany({
        where: { organizationId: org, status: "ACTIVE" },
        include: { cmsWork: true },
      }),
      this.prisma.projectBill.findMany({
        where: {
          organizationId: org,
          status: { in: ["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"] },
          retentionAmount: { gt: 0 },
          retentionReleaseDueDate: { not: null },
        },
        include: { cmsWork: true },
      }),
      this.prisma.defectLiabilityPeriod.findMany({
        where: { organizationId: org, status: { in: ["ACTIVE", "EXTENDED"] } },
        include: { work: true },
      }),
      this.prisma.dlpDefect.findMany({
        where: {
          organizationId: org,
          status: { notIn: ["VERIFIED", "CLOSED"] },
          targetRectificationDate: { not: null },
        },
        include: { work: true },
      }),
      this.prisma.completionCertificate.findMany({
        where: { organizationId: org, status: { in: ["DRAFT", "SUBMITTED"] } },
        include: { work: true },
      }),
      this.prisma.projectHandover.findMany({
        where: { organizationId: org, status: { in: ["DRAFT", "SUBMITTED"] } },
        include: { work: true },
      }),
    ]);
    /** Settings-driven priority/notification-window per reminder type, falling back to a
     * sane hardcoded default if the rule row is somehow missing (should not normally happen
     * since ReminderRuleService.allRules() ensures every known type has a default row). */
    const effective = (
      reminderType: string,
      fallbackPriority: string,
      fallbackWindow: number,
    ): { enabled: boolean; priority: string; window: number } => {
      const rule = rules.get(reminderType);
      if (!rule) return { enabled: true, priority: fallbackPriority, window: fallbackWindow };
      return {
        enabled: rule.isEnabled,
        priority: rule.defaultPriority,
        window: rule.offsetDays.length ? Math.max(...rule.offsetDays) : fallbackWindow,
      };
    };
    await Promise.all([
      ...security
        .map((x) => ({ x, rule: effective("TENDER_SECURITY_EXPIRY", "HIGH", 30) }))
        .filter(({ rule }) => rule.enabled)
        .map(({ x, rule }) =>
          this.source(org, {
            type: "Tender Security",
            title: "Tender Security expiry approaching",
            dueDate: x.expiryDate,
            sourceModule: "TENDER_SECURITY",
            sourceId: x.id,
            referenceNo: x.instrumentNo,
            relatedEntityName: x.tender?.workName,
            organizationName: x.organizationMaster?.shortName,
            priority: rule.priority,
            notificationBefore: rule.window,
          }),
        ),
      ...guarantees
        .map((x) => ({
          x,
          rule: effective(x.type === "PG" ? "PG_EXPIRY" : "BG_EXPIRY", "CRITICAL", 30),
        }))
        .filter(({ rule }) => rule.enabled)
        .map(({ x, rule }) =>
          this.source(org, {
            type: "PG/BG",
            title: "Performance Guarantee expiry approaching",
            dueDate: x.expiryDate,
            sourceModule: "PG_BG",
            sourceId: x.id,
            referenceNo: x.instrumentNo,
            relatedEntityName: x.tender?.workName,
            organizationName: x.organizationMaster?.shortName,
            priority: rule.priority,
            notificationBefore: rule.window,
          }),
        ),
      ...securityDeposits
        .map((x) => ({ x, rule: effective("SECURITY_DEPOSIT_EXPIRY", "HIGH", 30) }))
        .filter(({ rule }) => rule.enabled)
        .map(({ x, rule }) =>
          this.source(org, {
            type: "SD",
            title: `SD release due: ${x.cmsWork.workName}`,
            dueDate: x.securityDepositReleaseDueDate!,
            sourceModule: "SECURITY_DEPOSIT",
            sourceId: x.id,
            referenceNo: x.contractNo,
            relatedEntityName: x.cmsWork.workName,
            organizationName: x.organizationMaster.shortName,
            priority: rule.priority,
            notificationBefore: rule.window,
          }),
        ),
      ...payables
        .map((x) => ({ x, rule: effective("BILL_MATURITY", "HIGH", 7) }))
        .filter(({ rule }) => rule.enabled)
        .map(({ x, rule }) =>
          this.source(org, {
            type: "Bill Maturity",
            title: `Bill maturity: ${x.partyName}`,
            dueDate: x.dueDate!,
            sourceModule: "PAYABLE",
            sourceId: x.id,
            referenceNo: x.billNo,
            relatedEntityName: x.partyName,
            priority: rule.priority,
            notificationBefore: rule.window,
          }),
        ),
      ...cheques
        .map((x) => ({ x, rule: effective("CHEQUE_MATURITY", "HIGH", 3) }))
        .filter(({ rule }) => rule.enabled)
        .map(({ x, rule }) =>
          this.source(org, {
            type: "Cheque Maturity",
            title: `Cheque maturity: ${x.party}`,
            dueDate: x.chequeDate,
            sourceModule: "CHEQUE",
            sourceId: x.id,
            referenceNo: x.chequeNo,
            relatedEntityName: x.party,
            priority: rule.priority,
            notificationBefore: rule.window,
          }),
        ),
      ...documents
        .map((x) => ({ x, rule: effective("DOCUMENT_EXPIRY", "MEDIUM", 30) }))
        .filter(({ rule }) => rule.enabled)
        .map(({ x, rule }) =>
          this.source(org, {
            type: "Document Expiry",
            title: `${x.name} renewal required`,
            dueDate: x.expiryDate!,
            sourceModule: "DOCUMENT",
            sourceId: x.id,
            relatedEntityName: x.name,
            priority: rule.priority,
            notificationBefore: rule.window,
          }),
        ),
      ...receivables
        .filter((x) => x.amount.gt(x.receivedAmount))
        .map((x) => ({ x, rule: effective("BILL_MATURITY", "HIGH", 7) }))
        .filter(({ rule }) => rule.enabled)
        .map(({ x, rule }) =>
          this.source(org, {
            type: "Bill Maturity",
            title: `Bill maturity: ${x.partyName}`,
            dueDate: x.dueDate!,
            sourceModule: "RECEIVABLE",
            sourceId: x.id,
            referenceNo: x.billNo,
            relatedEntityName: x.project.workName,
            priority: rule.priority,
            notificationBefore: rule.window,
          }),
        ),
      ...submittingTenders
        .map((x) => ({ x, rule: effective("TENDER_SUBMISSION_DUE", "HIGH", 7) }))
        .filter(({ rule }) => rule.enabled)
        .map(({ x, rule }) =>
          this.source(org, {
            type: "Tender Submission Due",
            title: `Tender submission due: ${x.workName}`,
            dueDate: x.submissionDeadline!,
            sourceModule: "TENDER_SUBMISSION",
            sourceId: x.id,
            referenceNo: x.egpTenderId,
            relatedEntityName: x.workName,
            organizationName: x.organizationMaster.shortName,
            priority: rule.priority,
            notificationBefore: rule.window,
          }),
        ),
      ...openingTenders
        .map((x) => ({ x, rule: effective("TENDER_OPENING_DUE", "MEDIUM", 3) }))
        .filter(({ rule }) => rule.enabled)
        .map(({ x, rule }) =>
          this.source(org, {
            type: "Tender Opening Due",
            title: `Tender opening: ${x.workName}`,
            dueDate: x.openingDate!,
            sourceModule: "TENDER_OPENING",
            sourceId: x.id,
            referenceNo: x.egpTenderId,
            relatedEntityName: x.workName,
            organizationName: x.organizationMaster.shortName,
            priority: rule.priority,
            notificationBefore: rule.window,
          }),
        ),
      ...activeContracts
        .map((x) => ({ x, rule: effective("CONTRACT_EXPIRY", "MEDIUM", 30) }))
        .filter(({ rule }) => rule.enabled)
        .flatMap(({ x, rule }) => {
          const reminders = [
            this.source(org, {
              type: "Work Order / Contract Expiry",
              title: `Contract completion approaching: ${x.contractNo}`,
              dueDate: x.currentCompletionDate,
              sourceModule: "CONTRACT",
              sourceId: x.id,
              referenceNo: x.contractNo,
              relatedEntityName: x.cmsWork.workName,
              priority: rule.priority,
              notificationBefore: rule.window,
            }),
          ];
          if (x.dlpDays) {
            const dlpEndDate = new Date(x.currentCompletionDate.getTime() + x.dlpDays * 86_400_000);
            reminders.push(
              this.source(org, {
                type: "DLP End Date",
                title: `Defect Liability Period ending: ${x.contractNo}`,
                dueDate: dlpEndDate,
                sourceModule: "CONTRACT",
                sourceId: x.id,
                referenceNo: x.contractNo,
                relatedEntityName: x.cmsWork.workName,
                priority: rule.priority,
                notificationBefore: rule.window,
              }),
            );
          }
          return reminders;
        }),
      ...retentionBills
        .filter((b) => b.retentionAmount.gt(b.retentionReleasedAmount))
        .map((x) => ({ x, rule: effective("CONTRACT_EXPIRY", "MEDIUM", 30) }))
        .filter(({ rule }) => rule.enabled)
        .map(({ x, rule }) =>
          this.source(org, {
            type: "Retention Release Due",
            title: `Retention release due: ${x.billNo}`,
            dueDate: x.retentionReleaseDueDate!,
            sourceModule: "PROJECT_BILL",
            sourceId: x.id,
            referenceNo: x.billNo,
            relatedEntityName: x.cmsWork.workName,
            priority: rule.priority,
            notificationBefore: rule.window,
          }),
        ),
      ...dlps.map((x) =>
        this.source(org, {
          type: "DLP Expiring",
          title: `DLP expiring: ${x.work.workName}`,
          dueDate: x.endDate,
          sourceModule: "DLP",
          sourceId: x.id,
          relatedEntityName: x.work.workName,
          priority: "HIGH",
          notificationBefore: 30,
        }),
      ),
      ...defects.map((x) =>
        this.source(org, {
          type: "Defect Rectification Due",
          title: `Defect due: ${x.defectNo}`,
          dueDate: x.targetRectificationDate!,
          sourceModule: "DLP_DEFECT",
          sourceId: x.id,
          referenceNo: x.defectNo,
          relatedEntityName: x.work.workName,
          priority: x.priority === "CRITICAL" ? "CRITICAL" : "HIGH",
          notificationBefore: 7,
        }),
      ),
      ...pendingCertificates.map((x) =>
        this.source(org, {
          type: "Completion Certificate Pending",
          title: `Completion Certificate pending: ${x.work.workName}`,
          dueDate: x.actualCompletionDate,
          sourceModule: "COMPLETION_CERTIFICATE",
          sourceId: x.id,
          referenceNo: x.certificateNo,
          relatedEntityName: x.work.workName,
          priority: "HIGH",
          notificationBefore: 0,
        }),
      ),
      ...pendingHandovers.map((x) =>
        this.source(org, {
          type: "Handover Pending",
          title: `Handover pending: ${x.work.workName}`,
          dueDate: x.handoverDate,
          sourceModule: "PROJECT_HANDOVER",
          sourceId: x.id,
          referenceNo: x.handoverNo,
          relatedEntityName: x.work.workName,
          priority: "HIGH",
          notificationBefore: 0,
        }),
      ),
    ]);
  }

  /** Complements syncSources: when a source record is no longer "active" (paid,
   * released, renewed, or its date changed), auto-complete the reminder that was
   * generated for its previous state, instead of leaving it dangling forever. */
  private async autoResolveStaleReminders(org: string) {
    const [
      security,
      guarantees,
      securityDeposits,
      payables,
      cheques,
      documents,
      receivables,
      submittingTenders,
      openingTenders,
      activeContracts,
      retentionBills,
    ] = await Promise.all([
      this.prisma.tenderSecurity.findMany({
        where: { organizationId: org, status: "ACTIVE" },
        select: { id: true, expiryDate: true },
      }),
      this.prisma.performanceGuarantee.findMany({
        where: { organizationId: org, status: "ACTIVE" },
        select: { id: true, expiryDate: true },
      }),
      this.prisma.projectContract.findMany({
        where: {
          organizationId: org,
          securityDepositPct: { gt: 0 },
          securityDepositReleaseDueDate: { not: null },
          securityDepositStatus: { in: ["HELD", "PARTIALLY_RELEASED"] },
        },
        select: { id: true, securityDepositReleaseDueDate: true },
      }),
      this.prisma.payable.findMany({
        where: { organizationId: org, status: { not: "PAID" }, dueDate: { not: null } },
        select: { id: true, dueDate: true },
      }),
      this.prisma.cheque.findMany({
        where: { organizationId: org, status: { in: ["PENDING", "DEPOSITED"] } },
        select: { id: true, chequeDate: true },
      }),
      this.prisma.document.findMany({
        where: { organizationId: org, expiryDate: { not: null } },
        select: { id: true, expiryDate: true },
      }),
      this.prisma.receivable.findMany({
        where: { organizationId: org, status: { not: "RECEIVED" }, dueDate: { not: null } },
        select: { id: true, dueDate: true, amount: true, receivedAmount: true },
      }),
      this.prisma.tender.findMany({
        where: {
          organizationId: org,
          status: { in: [...TENDER_NOT_YET_SUBMITTED] },
          submissionDeadline: { not: null },
        },
        select: { id: true, submissionDeadline: true },
      }),
      this.prisma.tender.findMany({
        where: { organizationId: org, status: "SUBMITTED", openingDate: { not: null } },
        select: { id: true, openingDate: true },
      }),
      this.prisma.projectContract.findMany({
        where: { organizationId: org, status: "ACTIVE" },
        select: { id: true, currentCompletionDate: true, dlpDays: true },
      }),
      this.prisma.projectBill.findMany({
        where: {
          organizationId: org,
          status: { in: ["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"] },
          retentionAmount: { gt: 0 },
          retentionReleaseDueDate: { not: null },
        },
        select: {
          id: true,
          retentionReleaseDueDate: true,
          retentionAmount: true,
          retentionReleasedAmount: true,
        },
      }),
    ]);

    const keyOf = (id: string, date: Date | null | undefined) =>
      `${id}:${date ? date.getTime() : ""}`;
    const activeKeys: Record<(typeof AUTO_SOURCE_MODULES)[number], Set<string>> = {
      TENDER_SECURITY: new Set(security.map((x) => keyOf(x.id, x.expiryDate))),
      PG_BG: new Set(guarantees.map((x) => keyOf(x.id, x.expiryDate))),
      SECURITY_DEPOSIT: new Set(
        securityDeposits.map((x) => keyOf(x.id, x.securityDepositReleaseDueDate)),
      ),
      PAYABLE: new Set(payables.map((x) => keyOf(x.id, x.dueDate))),
      CHEQUE: new Set(cheques.map((x) => keyOf(x.id, x.chequeDate))),
      DOCUMENT: new Set(documents.map((x) => keyOf(x.id, x.expiryDate))),
      RECEIVABLE: new Set(
        receivables.filter((x) => x.amount.gt(x.receivedAmount)).map((x) => keyOf(x.id, x.dueDate)),
      ),
      TENDER_SUBMISSION: new Set(submittingTenders.map((x) => keyOf(x.id, x.submissionDeadline))),
      TENDER_OPENING: new Set(openingTenders.map((x) => keyOf(x.id, x.openingDate))),
      CONTRACT: new Set(
        activeContracts.flatMap((x) => [
          keyOf(x.id, x.currentCompletionDate),
          ...(x.dlpDays
            ? [keyOf(x.id, new Date(x.currentCompletionDate.getTime() + x.dlpDays * 86_400_000))]
            : []),
        ]),
      ),
      PROJECT_BILL: new Set(
        retentionBills
          .filter((b) => b.retentionAmount.gt(b.retentionReleasedAmount))
          .map((b) => keyOf(b.id, b.retentionReleaseDueDate)),
      ),
    };

    for (const sourceModule of AUTO_SOURCE_MODULES) {
      const candidates = await this.prisma.reminder.findMany({
        where: {
          organizationId: org,
          sourceModule,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          sourceId: { not: null },
        },
        select: { id: true, sourceId: true, dueDate: true },
      });
      const staleIds = candidates
        .filter((c) => !activeKeys[sourceModule].has(keyOf(c.sourceId!, c.dueDate)))
        .map((c) => c.id);
      if (!staleIds.length) continue;

      await this.prisma.reminder.updateMany({
        where: { id: { in: staleIds } },
        data: { status: "COMPLETED", isResolved: true, completedAt: new Date() },
      });
      await Promise.all(staleIds.map((id) => this.notifications.resolveForReminder(org, id)));
    }
  }
  private where(org: string, q: QueryReminderDto) {
    return {
      organizationId: org,
      type: q.type,
      status: q.status,
      priority: q.priority,
      assignedToUserId: q.assignedToUserId,
      sourceModule: q.sourceModule,
      dueDate:
        q.dateFrom || q.dateTo
          ? {
              gte: q.dateFrom ? new Date(q.dateFrom) : undefined,
              lte: q.dateTo ? new Date(`${q.dateTo}T23:59:59.999Z`) : undefined,
            }
          : undefined,
      OR: q.search
        ? [
            { title: { contains: q.search, mode: "insensitive" as const } },
            { description: { contains: q.search, mode: "insensitive" as const } },
            { referenceNo: { contains: q.search, mode: "insensitive" as const } },
            { organizationName: { contains: q.search, mode: "insensitive" as const } },
            { relatedEntityName: { contains: q.search, mode: "insensitive" as const } },
          ]
        : undefined,
    };
  }
  async list(org: string, q: QueryReminderDto) {
    await this.syncOrganization(org);
    const page = q.page ?? 1,
      limit = q.limit ?? 10,
      where = this.where(org, q);
    const [items, total] = await Promise.all([
      this.prisma.reminder.findMany({
        where,
        orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.reminder.count({ where }),
    ]);
    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
  async stats(org: string) {
    await this.syncOrganization(org);
    const { end } = this.day(),
      week = new Date(end);
    week.setUTCDate(week.getUTCDate() + 6);
    const [dueToday, upcoming, overdue, completed, upcoming7Days, critical] = await Promise.all(
      ["DUE_TODAY", "UPCOMING", "OVERDUE", "COMPLETED"]
        .map((status) => this.prisma.reminder.count({ where: { organizationId: org, status } }))
        .concat([
          this.prisma.reminder.count({
            where: { organizationId: org, status: "UPCOMING", dueDate: { gte: end, lte: week } },
          }),
          this.prisma.reminder.count({
            where: {
              organizationId: org,
              priority: "CRITICAL",
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
          }),
        ]),
    );
    return { dueToday, upcoming, overdue, completed, upcoming7Days, critical };
  }
  async quick(org: string) {
    await this.syncOrganization(org);
    const { end } = this.day(),
      week = new Date(end);
    week.setUTCDate(week.getUTCDate() + 6);
    const select = {
      id: true,
      type: true,
      title: true,
      dueDate: true,
      priority: true,
      status: true,
      referenceNo: true,
      relatedEntityName: true,
      organizationName: true,
      assignedToName: true,
    };
    const [dueToday, upcoming, overdue] = await Promise.all([
      this.prisma.reminder.findMany({
        where: { organizationId: org, status: "DUE_TODAY" },
        select,
        orderBy: { priority: "desc" },
        take: 4,
      }),
      this.prisma.reminder.findMany({
        where: { organizationId: org, status: "UPCOMING", dueDate: { gte: end, lte: week } },
        select,
        orderBy: { dueDate: "asc" },
        take: 4,
      }),
      this.prisma.reminder.findMany({
        where: { organizationId: org, status: "OVERDUE" },
        select,
        orderBy: { dueDate: "asc" },
        take: 4,
      }),
    ]);
    return { dueToday, upcoming, overdue };
  }
  async one(org: string, id: string) {
    const row = await this.prisma.reminder.findFirst({ where: { id, organizationId: org } });
    if (!row) throw new NotFoundException("Reminder not found");
    return row;
  }
  async users(org: string) {
    const rows = await this.prisma.organizationUser.findMany({
      where: { organizationId: org, user: { isActive: true } },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    });
    return rows.map((x) => x.user);
  }
  async create(org: string, user: { id: string; name: string }, dto: SaveReminderDto) {
    const row = await this.prisma.reminder.create({
      data: {
        organizationId: org,
        ...dto,
        sourceModule: dto.sourceModule ?? "MANUAL",
        status: "UPCOMING",
        createdById: user.id,
        createdByName: user.name,
        dueDate: new Date(dto.dueDate),
      },
    });
    await this.log(org, user.id, "REMINDER_CREATED", row, undefined);
    await this.refreshStatuses(org);
    return this.one(org, row.id);
  }
  async update(org: string, userId: string, id: string, dto: UpdateReminderDto) {
    const old = await this.one(org, id),
      row = await this.prisma.reminder.update({
        where: { id, organizationId: org },
        data: { ...dto, dueDate: new Date(dto.dueDate) },
      });
    await this.log(org, userId, "REMINDER_UPDATED", row, old);
    await this.refreshStatuses(org);
    return this.one(org, id);
  }
  async complete(org: string, user: { id: string; name: string }, id: string) {
    const old = await this.one(org, id),
      row = await this.prisma.reminder.update({
        where: { id, organizationId: org },
        data: {
          status: "COMPLETED",
          isResolved: true,
          completedAt: new Date(),
          completedById: user.id,
          completedByName: user.name,
        },
      });
    await this.notifications.resolveForReminder(org, id);
    await this.log(org, user.id, "REMINDER_COMPLETED", row, old);
    return row;
  }
  async snooze(org: string, userId: string, id: string, dto: SnoozeReminderDto) {
    const old = await this.one(org, id),
      row = await this.prisma.reminder.update({
        where: { id, organizationId: org },
        data: { status: "SNOOZED", snoozedUntil: new Date(dto.until) },
      });
    await this.notifications.resetForReminders(org, [id]);
    await this.log(org, userId, "REMINDER_SNOOZED", row, old);
    return row;
  }
  async cancel(org: string, userId: string, id: string) {
    const old = await this.one(org, id),
      row = await this.prisma.reminder.update({
        where: { id, organizationId: org },
        data: { status: "CANCELLED", cancelledAt: new Date(), isResolved: true },
      });
    await this.notifications.resolveForReminder(org, id);
    await this.log(org, userId, "REMINDER_CANCELLED", row, old);
    return row;
  }
  private log(
    org: string,
    userId: string,
    action: string,
    row: { id: string; referenceNo: string | null },
    old: unknown,
  ) {
    return this.audit.record({
      organizationId: org,
      userId,
      action,
      module: "Reminders",
      entityType: "Reminder",
      entityId: row.id,
      referenceNo: row.referenceNo,
      oldValue: old,
      newValue: row,
    });
  }
}
