import { Injectable } from "@nestjs/common";
import type { DashboardResponse } from "@bizovix/types";
import { Prisma, type TenderStatus } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";

const CATEGORY_COLORS: Record<string, string> = {
  "LED Display": "#0B5CFF",
  "Electrical Works": "#16A34A",
  "IT Solutions": "#7C3AED",
  "Sound System": "#F97316",
  Others: "#EF4444",
};

const WON_STATUSES = ["NOA", "AWARDED", "ONGOING", "COMPLETED"] as unknown as TenderStatus[];

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfYear(): Date {
  return new Date(new Date().getFullYear(), 0, 1);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(organizationId: string): Promise<DashboardResponse> {
    const [kpis, targetVsAchievement, tenderPerformance, businessByCategory, upcomingReminders, remindersCount, recentTransactions, topProjects] =
      await Promise.all([
        this.getKpis(organizationId),
        this.getTargetVsAchievement(organizationId),
        this.getTenderPerformance(organizationId),
        this.getBusinessByCategory(organizationId),
        this.getUpcomingReminders(organizationId),
        this.prisma.reminder.count({ where: { organizationId, isResolved: false } }),
        this.getRecentTransactions(organizationId),
        this.getTopProjects(organizationId),
      ]);

    return { kpis, targetVsAchievement, tenderPerformance, businessByCategory, upcomingReminders, remindersCount, recentTransactions, topProjects };
  }

  private async getKpis(organizationId: string) {
    const now = new Date();
    const dueSoonCutoff = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const [
      ongoingAgg,
      tenderSecurityAgg,
      pgBgAgg,
      receivables,
      outstandingPayables,
      bankAccounts,
      securityDepositContracts,
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
      this.prisma.receivable.findMany({ where: { organizationId, status: { not: "RECEIVED" } }, select: { amount: true, receivedAmount: true, dueDate: true } }),
      // Real accounts-payable sub-ledger — Expense.status is never transitioned to PENDING by
      // any create/update path in this app, so it cannot be used as a live payables signal.
      this.prisma.payable.findMany({
        where: { organizationId, status: { not: "PAID" } },
        select: { amount: true, paidAmount: true, dueDate: true },
      }),
      this.prisma.bankAccount.findMany({ where: { organizationId, isActive: true }, select: { currentBalance: true } }),
      this.prisma.projectContract.findMany({
        where: {
          organizationId,
          status: { not: "CANCELLED" },
          securityDepositPct: { gt: 0 },
        },
        select: {
          cmsWorkId: true,
          currentContractValue: true,
          securityDepositPct: true,
          securityDepositStatus: true,
          securityDepositReleasedAmount: true,
        },
      }),
    ]);

    const bankAndCashTotal = bankAccounts.reduce((sum, acc) => sum + Number(acc.currentBalance), 0);
    const receivableTotal = receivables.reduce((sum, row) => sum + Number(row.amount) - Number(row.receivedAmount), 0);
    const overdueReceivableTotal = receivables.filter((row) => row.dueDate && row.dueDate < now).reduce((sum, row) => sum + Number(row.amount) - Number(row.receivedAmount), 0);
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
    const heldSecurityDeposits = securityDepositContracts.map((contract) => {
      const total = contract.currentContractValue.mul(contract.securityDepositPct!).div(100);
      const released = contract.securityDepositReleasedAmount ?? new Prisma.Decimal(0);
      const outstanding =
        contract.securityDepositStatus === "RELEASED"
          ? new Prisma.Decimal(0)
          : Prisma.Decimal.max(0, total.sub(released));
      return { cmsWorkId: contract.cmsWorkId, outstanding };
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
        amount: receivableTotal.toFixed(2),
        overdue: overdueReceivableTotal.toFixed(2),
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

  private async getTargetVsAchievement(organizationId: string) {
    const now = new Date();
    const [target, achievementAgg] = await Promise.all([
      this.prisma.monthlyTarget.findUnique({
        where: { organizationId_year_month: { organizationId, year: now.getFullYear(), month: now.getMonth() + 1 } },
      }),
      this.prisma.receipt.aggregate({
        where: { organizationId, status: "RECEIVED", receiptDate: { gte: startOfMonth() } },
        _sum: { amount: true },
      }),
    ]);

    const targetAmount = Number(target?.targetAmount ?? 0);
    const achievement = Number(achievementAgg._sum.amount ?? 0);

    return {
      target: targetAmount.toString(),
      achievement: achievement.toString(),
      achievementRate: targetAmount > 0 ? Number(((achievement / targetAmount) * 100).toFixed(2)) : 0,
    };
  }

  private async getTenderPerformance(organizationId: string) {
    const yearStart = startOfYear();
    const [submitted, won, underProcess] = await Promise.all([
      this.prisma.tender.count({ where: { organizationId, submittedAt: { gte: yearStart } } }),
      this.prisma.tender.count({
        where: { organizationId, submittedAt: { gte: yearStart }, status: { in: WON_STATUSES } },
      }),
      this.prisma.tender.count({ where: { organizationId, submittedAt: { gte: yearStart }, status: "UNDER_PROCESS" } }),
    ]);

    return {
      submitted,
      noaAwarded: won,
      successRate: submitted > 0 ? Number(((won / submitted) * 100).toFixed(2)) : 0,
      underProcess,
    };
  }

  private async getBusinessByCategory(organizationId: string) {
    const grouped = await this.prisma.tender.groupBy({
      by: ["category"],
      where: {
        organizationId,
        submittedAt: { gte: startOfYear() },
        status: { in: WON_STATUSES },
      },
      _sum: { contractValue: true },
    });

    const totalBusiness = grouped.reduce((sum, g) => sum + Number(g._sum?.contractValue ?? 0), 0);

    const items = grouped
      .map((g) => {
        const amount = Number(g._sum?.contractValue ?? 0);
        const category = g.category ?? "Uncategorised";
        return {
          category,
          amount: amount.toString(),
          percentage: totalBusiness > 0 ? Number(((amount / totalBusiness) * 100).toFixed(2)) : 0,
          color: CATEGORY_COLORS[category] ?? "#667085",
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
    const [tenderSecurities, expenses, receipts, guarantees, creditCommitments] = await Promise.all([
      this.prisma.tenderSecurity.findMany({ where: { organizationId }, orderBy: { issueDate: "desc" }, take: 5 }),
      this.prisma.expense.findMany({ where: { organizationId }, orderBy: { expenseDate: "desc" }, take: 5 }),
      this.prisma.receipt.findMany({ where: { organizationId }, orderBy: { receiptDate: "desc" }, take: 5 }),
      this.prisma.performanceGuarantee.findMany({ where: { organizationId }, orderBy: { issueDate: "desc" }, take: 5 }),
      this.prisma.creditCommitment.findMany({
        where: { organizationId, isCharged: true },
        orderBy: { chargeDate: "desc" },
        take: 5,
      }),
    ]);

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
      select: { id: true, workName: true, contractValue: true },
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
        progressPercentage: progress?.contract.gt(0)
          ? Number(progress.executed.div(progress.contract).mul(100).toFixed(2))
          : 0,
      };
    });
  }
}
