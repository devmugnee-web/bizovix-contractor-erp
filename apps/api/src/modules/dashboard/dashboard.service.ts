import { BadRequestException, Injectable } from "@nestjs/common";
import type { DashboardQuery, DashboardResponse } from "@bizovix/types";
import { Prisma, type TenderStatus } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { calculateCompletedProjectReceivable } from "../accounting/completed-project-receivable";
import {
  calculateAchievementRate,
  distributeTargetAmount,
  normalizeProgress,
  outstandingRetention,
} from "./dashboard.calculations";
import type { SetMonthlyTargetDto } from "./dto/set-monthly-target.dto";

const CATEGORY_COLORS: Record<string, string> = {
  "LED Display": "#0B5CFF",
  "Led Display": "#0B5CFF",
  "Electrical Works": "#16A34A",
  Electrical: "#16A34A",
  "IT Solutions": "#7C3AED",
  IT: "#7C3AED",
  "Sound System": "#F97316",
  CVL: "#F97316",
  FOOD: "#EF4444",
  Others: "#EF4444",
};

const CATEGORY_PALETTE = ["#0B5CFF", "#16A34A", "#7C3AED", "#F97316", "#EF4444"];

function categoryColor(category: string): string {
  const fallbackIndex = [...category].reduce(
    (hash, character) => hash + character.charCodeAt(0),
    0,
  );
  return CATEGORY_COLORS[category] ?? CATEGORY_PALETTE[fallbackIndex % CATEGORY_PALETTE.length]!;
}

const WON_STATUSES = ["NOA", "AWARDED", "ONGOING", "COMPLETED"] as unknown as TenderStatus[];

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfYear(): Date {
  return new Date(new Date().getFullYear(), 0, 1);
}

type DateRange = { from: Date; to: Date };

function selectedDateRange(dateFrom?: string, dateTo?: string): DateRange | undefined {
  if (!dateFrom && !dateTo) return undefined;
  if (!dateFrom || !dateTo) {
    throw new BadRequestException("Both From date and To date are required");
  }
  const from = new Date(`${dateFrom}T00:00:00.000Z`);
  const to = new Date(`${dateTo}T23:59:59.999Z`);
  if (from > to) throw new BadRequestException("From date cannot be after To date");
  return { from, to };
}

function dateFilter(range: DateRange | undefined, fallbackFrom: Date) {
  return range ? { gte: range.from, lte: range.to } : { gte: fallbackFrom };
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async setMonthlyTarget(organizationId: string, userId: string, dto: SetMonthlyTargetDto) {
    const range = selectedDateRange(dto.dateFrom, dto.dateTo)!;
    const months: Array<{ year: number; month: number }> = [];
    const cursor = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1));
    const finalMonth = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), 1));
    while (cursor <= finalMonth) {
      months.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    const monthlyAmounts = distributeTargetAmount(dto.targetAmount, months.length);

    return this.prisma.$transaction(async (tx) => {
      const targets = await Promise.all(
        months.map(({ year, month }, index) => {
          const targetAmount = new Prisma.Decimal(monthlyAmounts[index]!);
          return tx.monthlyTarget.upsert({
            where: { organizationId_year_month: { organizationId, year, month } },
            create: { organizationId, year, month, targetAmount },
            update: { targetAmount },
          });
        }),
      );

      await this.auditLog.record(
        {
          organizationId,
          userId,
          action: "TARGET_PERIOD_UPDATED",
          module: "Dashboard",
          description: `Updated target for ${dto.dateFrom} to ${dto.dateTo}`,
          referenceNo: `${dto.dateFrom} / ${dto.dateTo}`,
          entityType: "MonthlyTarget",
          entityId: targets[0]?.id,
          newValue: {
            dateFrom: dto.dateFrom,
            dateTo: dto.dateTo,
            targetAmount: dto.targetAmount.toFixed(2),
            monthsUpdated: targets.length,
          },
        },
        tx,
      );

      return {
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
        targetAmount: dto.targetAmount.toFixed(2),
        monthsUpdated: targets.length,
      };
    });
  }

  async getDashboard(organizationId: string, query?: DashboardQuery): Promise<DashboardResponse> {
    const commonRange = selectedDateRange(query?.dateFrom, query?.dateTo);
    const targetRange =
      selectedDateRange(query?.targetDateFrom, query?.targetDateTo) ?? commonRange;
    const tenderRange =
      selectedDateRange(query?.tenderDateFrom, query?.tenderDateTo) ?? commonRange;
    const businessRange =
      selectedDateRange(query?.businessDateFrom, query?.businessDateTo) ?? commonRange;
    const [
      kpis,
      targetVsAchievement,
      tenderPerformance,
      businessByCategory,
      upcomingReminders,
      remindersCount,
      recentTransactions,
      topProjects,
    ] = await Promise.all([
      this.getKpis(organizationId),
      this.getTargetVsAchievement(organizationId, targetRange),
      this.getTenderPerformance(organizationId, tenderRange),
      this.getBusinessByCategory(organizationId, businessRange),
      this.getUpcomingReminders(organizationId),
      this.prisma.reminder.count({ where: { organizationId, isResolved: false } }),
      this.getRecentTransactions(organizationId),
      this.getTopProjects(organizationId),
    ]);

    return {
      kpis,
      targetVsAchievement,
      tenderPerformance,
      businessByCategory,
      upcomingReminders,
      remindersCount,
      recentTransactions,
      topProjects,
    };
  }

  private async getKpis(organizationId: string) {
    const now = new Date();
    const dueSoonCutoff = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const [
      ongoingAgg,
      tenderSecurityAgg,
      pgBgAgg,
      receivables,
      receivableProjects,
      outstandingPayables,
      bankAccounts,
      heldRetentionBills,
    ] = await Promise.all([
      this.prisma.cmsWork.aggregate({
        where: { organizationId, status: "ONGOING" },
        _count: true,
        _sum: { contractValue: true },
      }),
      this.prisma.tenderSecurity.aggregate({
        where: { organizationId, status: "ACTIVE" },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.performanceGuarantee.aggregate({
        where: { organizationId, status: "ACTIVE" },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.receivable.findMany({
        where: {
          organizationId,
          status: { not: "RECEIVED" },
          project: { status: { not: "COMPLETED" } },
        },
        select: { amount: true, receivedAmount: true, dueDate: true },
      }),
      this.prisma.cmsWork.findMany({
        where: {
          organizationId,
          status: {
            in: ["ONGOING", "COMPLETION_PENDING", "DLP", "CLOSEOUT_PENDING", "COMPLETED"],
          },
        },
        select: {
          id: true,
          contractValue: true,
          receipts: {
            where: { status: "RECEIVED" },
            select: {
              amount: true,
              vatDeductedAmount: true,
              taxDeductedAmount: true,
              otherDeductionAmount: true,
              securityDepositDeductedAmount: true,
            },
          },
          contracts: {
            where: { status: { not: "CANCELLED" } },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { securityDepositReleasedAmount: true },
          },
        },
      }),
      // Real accounts-payable sub-ledger — Expense.status is never transitioned to PENDING by
      // any create/update path in this app, so it cannot be used as a live payables signal.
      this.prisma.payable.findMany({
        where: { organizationId, status: { not: "PAID" } },
        select: { amount: true, paidAmount: true, dueDate: true },
      }),
      this.prisma.bankAccount.findMany({
        where: { organizationId, isActive: true },
        select: { currentBalance: true },
      }),
      this.prisma.projectBill.findMany({
        where: {
          organizationId,
          status: { in: ["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"] },
          retentionAmount: { gt: 0 },
        },
        select: {
          cmsWorkId: true,
          retentionAmount: true,
          retentionReleasedAmount: true,
        },
      }),
    ]);

    const bankAndCashTotal = bankAccounts.reduce((sum, acc) => sum + Number(acc.currentBalance), 0);
    const outstandingReceivables = receivables.filter(
      (row) => Number(row.amount) - Number(row.receivedAmount) > 0,
    );
    const overdueReceivableTotal = outstandingReceivables
      .filter((row) => row.dueDate && row.dueDate < now)
      .reduce((sum, row) => sum + Number(row.amount) - Number(row.receivedAmount), 0);
    const projectReceivables = receivableProjects.map((project) => ({
      projectId: project.id,
      ...calculateCompletedProjectReceivable({
        contractValue: project.contractValue,
        receipts: project.receipts,
        securityDepositReleasedAmount: project.contracts[0]?.securityDepositReleasedAmount,
      }),
    }));
    const projectReceivableTotal = projectReceivables.reduce(
      (sum, row) => sum.add(row.outstanding),
      new Prisma.Decimal(0),
    );
    const projectReceivableSd = projectReceivables.reduce(
      (sum, row) => sum.add(row.sdReceivable),
      new Prisma.Decimal(0),
    );
    const outstandingPayableTotal = outstandingPayables.reduce(
      (sum, p) => sum + (Number(p.amount) - Number(p.paidAmount)),
      0,
    );
    const dueSoonPayableTotal = outstandingPayables
      .filter((p) => p.dueDate && p.dueDate >= now && p.dueDate <= dueSoonCutoff)
      .reduce((sum, p) => sum + (Number(p.amount) - Number(p.paidAmount)), 0);
    const overduePayableTotal = outstandingPayables
      .filter((p) => p.dueDate && p.dueDate < now)
      .reduce((sum, p) => sum + (Number(p.amount) - Number(p.paidAmount)), 0);
    const heldSecurityDeposits = heldRetentionBills.map((bill) => {
      const outstanding = outstandingRetention(bill.retentionAmount, bill.retentionReleasedAmount);
      return { cmsWorkId: bill.cmsWorkId, outstanding };
    });
    const activeSecurityDeposits = heldSecurityDeposits.filter((row) => row.outstanding.gt(0));
    const securityDepositTotal = activeSecurityDeposits.reduce(
      (sum, row) => sum.add(row.outstanding),
      new Prisma.Decimal(0),
    );

    return {
      ongoingWorks: {
        count: ongoingAgg._count,
        contractValue: (ongoingAgg._sum.contractValue ?? 0).toString(),
      },
      tenderSecurity: {
        amount: (tenderSecurityAgg._sum.amount ?? 0).toString(),
        instruments: tenderSecurityAgg._count,
      },
      pgBg: {
        amount: (pgBgAgg._sum.amount ?? 0).toString(),
        instruments: pgBgAgg._count,
      },
      securityDeposit: {
        amount: securityDepositTotal.toFixed(2),
        projects: new Set(activeSecurityDeposits.map((row) => row.cmsWorkId)).size,
        available: true,
      },
      receivables: {
        amount: projectReceivableTotal.toFixed(2),
        overdue: overdueReceivableTotal.toFixed(2),
        bills: projectReceivables.filter((row) => row.outstanding.gt(0)).length,
        securityDeposit: projectReceivableSd.toFixed(2),
      },
      payables: {
        amount: outstandingPayableTotal.toFixed(2),
        dueSoon: dueSoonPayableTotal.toFixed(2),
        overdue: overduePayableTotal.toFixed(2),
      },
      bankAndCash: { amount: bankAndCashTotal.toString() },
      // No Loan/EMI module exists yet — do not present the one-time seeded AppSetting value
      // as though it were a live, computed balance.
      loansAndEmi: {
        amount: "0.00",
        nextEmiDate: null,
        configured: false,
      },
    };
  }

  private async getTargetVsAchievement(organizationId: string, range?: DateRange) {
    const now = new Date();
    const targetFrom = range?.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const targetTo = range?.to ?? now;
    const fromYear = targetFrom.getUTCFullYear();
    const fromMonth = targetFrom.getUTCMonth() + 1;
    const toYear = targetTo.getUTCFullYear();
    const toMonth = targetTo.getUTCMonth() + 1;

    const [targetAgg, achievementAgg] = await Promise.all([
      this.prisma.monthlyTarget.aggregate({
        where: {
          organizationId,
          AND: [
            { OR: [{ year: { gt: fromYear } }, { year: fromYear, month: { gte: fromMonth } }] },
            { OR: [{ year: { lt: toYear } }, { year: toYear, month: { lte: toMonth } }] },
          ],
        },
        _sum: { targetAmount: true },
      }),
      this.prisma.receipt.aggregate({
        where: {
          organizationId,
          status: "RECEIVED",
          receiptDate: dateFilter(range, startOfMonth()),
        },
        _sum: { amount: true },
      }),
    ]);

    const targetAmount = Number(targetAgg._sum.targetAmount ?? 0);
    const achievement = Number(achievementAgg._sum.amount ?? 0);

    return {
      target: targetAmount.toString(),
      achievement: achievement.toString(),
      achievementRate: calculateAchievementRate(targetAmount, achievement),
    };
  }

  private async getTenderPerformance(organizationId: string, range?: DateRange) {
    const yearStart = startOfYear();
    const submittedAt = dateFilter(range, yearStart);
    const awardedAt = dateFilter(range, yearStart);
    const [submitted, won, underProcess] = await Promise.all([
      this.prisma.tender.count({
        where: {
          organizationId,
          OR: [{ submittedAt }, { submittedAt: null, awardedAt, status: { in: WON_STATUSES } }],
        },
      }),
      this.prisma.tender.count({
        where: { organizationId, awardedAt, status: { in: WON_STATUSES } },
      }),
      this.prisma.tender.count({
        where: {
          organizationId,
          status: "UNDER_PROCESS",
          OR: [{ submittedAt }, { submittedAt: null, updatedAt: submittedAt }],
        },
      }),
    ]);

    return {
      submitted,
      noaAwarded: won,
      successRate: submitted > 0 ? Number(((won / submitted) * 100).toFixed(2)) : 0,
      underProcess,
    };
  }

  private async getBusinessByCategory(organizationId: string, range?: DateRange) {
    const businessDate = dateFilter(range, startOfYear());
    const grouped = await this.prisma.cmsWork.groupBy({
      by: ["workCategory"],
      where: {
        organizationId,
        status: { not: "CANCELLED" },
        OR: [{ startDate: businessDate }, { startDate: null, createdAt: businessDate }],
      },
      _sum: { contractValue: true },
    });

    const totalBusiness = grouped.reduce((sum, g) => sum + Number(g._sum?.contractValue ?? 0), 0);

    const items = grouped
      .map((g) => {
        const amount = Number(g._sum?.contractValue ?? 0);
        const category = g.workCategory;
        return {
          category,
          amount: amount.toString(),
          percentage: totalBusiness > 0 ? Number(((amount / totalBusiness) * 100).toFixed(2)) : 0,
          color: categoryColor(category),
        };
      })
      .sort((a, b) => Number(b.amount) - Number(a.amount));

    return { items, totalBusiness: totalBusiness.toString() };
  }

  private async getUpcomingReminders(organizationId: string) {
    const now = new Date();
    const reminders = await this.prisma.reminder.findMany({
      where: { organizationId, isResolved: false, dueDate: { gte: now } },
      orderBy: { dueDate: "asc" },
      take: 5,
    });

    return reminders.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      subtitle: r.subtitle ?? "",
      dueDate: r.dueDate.toISOString(),
    }));
  }

  private async getRecentTransactions(organizationId: string) {
    const [tenderSecurities, expenses, receipts, guarantees, creditCommitments, cashActivity] =
      await Promise.all([
        this.prisma.tenderSecurity.findMany({
          where: { organizationId },
          orderBy: { issueDate: "desc" },
          take: 5,
        }),
        this.prisma.expense.findMany({
          where: { organizationId },
          orderBy: { expenseDate: "desc" },
          take: 5,
        }),
        this.prisma.receipt.findMany({
          where: { organizationId },
          orderBy: { receiptDate: "desc" },
          take: 5,
        }),
        this.prisma.performanceGuarantee.findMany({
          where: { organizationId },
          orderBy: { issueDate: "desc" },
          take: 5,
        }),
        this.prisma.creditCommitment.findMany({
          where: { organizationId, isCharged: true },
          orderBy: { chargeDate: "desc" },
          take: 5,
        }),
        this.prisma.financialTransaction.findMany({
          where: {
            organizationId,
            status: "POSTED",
            sourceModule: {
              in: [
                "MAIN_CASH",
                "PETTY_CASH",
                "BANK_TRANSFER",
                "SUPPLIER_PAYMENT",
                "GENERAL_EXPENSE",
              ],
            },
          },
          orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
          take: 20,
        }),
      ]);

    const activityBySource = new Map<string, (typeof cashActivity)[number]>();
    for (const activity of cashActivity) {
      const key = `${activity.sourceModule}:${activity.sourceId}`;
      const current = activityBySource.get(key);
      if (!current || activity.amount.gt(current.amount)) activityBySource.set(key, activity);
    }
    const activityTitles: Record<string, string> = {
      MAIN_CASH: "Main Cash Adjusted",
      PETTY_CASH: "Petty Cash Updated",
      BANK_TRANSFER: "Bank Transfer Completed",
      SUPPLIER_PAYMENT: "Supplier Payment Made",
      GENERAL_EXPENSE: "General Expense Added",
    };

    const combined = [
      ...tenderSecurities.map((t) => ({
        id: t.id,
        type: "TENDER_SECURITY",
        title: "Tender Security Issued",
        reference: t.instrumentNo || `TS-${t.id.slice(-6).toUpperCase()}`,
        amount: t.amount.toString(),
        status: "Issued",
        occurredAt: t.issueDate,
      })),
      ...expenses.map((e) => ({
        id: e.id,
        type: "EXPENSE",
        title: "Expense Added",
        reference: e.referenceNo || `EXP-${e.id.slice(-6).toUpperCase()}`,
        amount: e.amount.toString(),
        status: e.status.charAt(0) + e.status.slice(1).toLowerCase(),
        occurredAt: e.expenseDate,
      })),
      ...receipts.map((r) => ({
        id: r.id,
        type: "RECEIPT",
        title: "Receipt Received",
        reference: r.referenceNo || `REC-${r.id.slice(-6).toUpperCase()}`,
        amount: r.amount.toString(),
        status: r.status.charAt(0) + r.status.slice(1).toLowerCase(),
        occurredAt: r.receiptDate,
      })),
      ...guarantees.map((g) => ({
        id: g.id,
        type: "PG_BG",
        title: `${g.type} Issued`,
        reference: g.instrumentNo || `${g.type}-${g.id.slice(-6).toUpperCase()}`,
        amount: g.amount.toString(),
        status: "Issued",
        occurredAt: g.issueDate,
      })),
      ...creditCommitments.map((c) => ({
        id: c.id,
        type: "CREDIT_COMMITMENT",
        title: "Credit Commitment Charge",
        reference: `CC-${c.id.slice(-6).toUpperCase()}`,
        amount: c.amount.toString(),
        status: "Charged",
        occurredAt: c.chargeDate,
      })),
      ...Array.from(activityBySource.values()).map((activity) => ({
        id: activity.sourceId,
        type: activity.sourceModule,
        title: activityTitles[activity.sourceModule] ?? "Financial Activity",
        reference: activity.referenceNo || activity.transactionNo,
        amount: activity.amount.toString(),
        status: "Posted",
        occurredAt: activity.transactionDate,
      })),
    ];

    return combined
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 5)
      .map(({ occurredAt: _occurredAt, ...rest }) => rest);
  }

  private async getTopProjects(organizationId: string) {
    const projects = await this.prisma.cmsWork.findMany({
      where: { organizationId, status: "ONGOING" },
      orderBy: { contractValue: "desc" },
      take: 5,
      select: {
        id: true,
        workName: true,
        contractValue: true,
        tender: { select: { progressPercentage: true } },
      },
    });

    const boqItems = projects.length
      ? await this.prisma.boqItem.findMany({
          where: { organizationId, cmsWorkId: { in: projects.map((project) => project.id) } },
          select: { cmsWorkId: true, contractAmount: true, executedValue: true },
        })
      : [];
    const progressByProject = new Map<
      string,
      { contract: Prisma.Decimal; executed: Prisma.Decimal }
    >();
    for (const item of boqItems) {
      const current = progressByProject.get(item.cmsWorkId) ?? {
        contract: new Prisma.Decimal(0),
        executed: new Prisma.Decimal(0),
      };
      current.contract = current.contract.add(item.contractAmount);
      current.executed = current.executed.add(item.executedValue);
      progressByProject.set(item.cmsWorkId, current);
    }

    return projects.map((project) => {
      const progress = progressByProject.get(project.id);
      return {
        id: project.id,
        name: project.workName,
        contractValue: project.contractValue.toString(),
        progressPercentage: normalizeProgress(
          progress?.contract.gt(0)
            ? Number(progress.executed.div(progress.contract).mul(100).toFixed(2))
            : (project.tender?.progressPercentage ?? 0),
        ),
      };
    });
  }
}
