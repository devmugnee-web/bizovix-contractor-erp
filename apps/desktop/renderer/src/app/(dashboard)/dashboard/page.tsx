"use client";

import { useDashboard } from "@bizovix/api-client";
import { DashboardKpiRow } from "@/components/dashboard/DashboardKpiRow";
import { TargetVsAchievementCard } from "@/components/dashboard/TargetVsAchievementCard";
import { TenderPerformanceCard } from "@/components/dashboard/TenderPerformanceCard";
import { BusinessByCategoryCard } from "@/components/dashboard/BusinessByCategoryCard";
import { UpcomingRemindersCard } from "@/components/dashboard/UpcomingRemindersCard";
import { RecentTransactionsCard } from "@/components/dashboard/RecentTransactionsCard";
import { TopProjectsCard } from "@/components/dashboard/TopProjectsCard";

export default function DashboardPage() {
  const dashboard = useDashboard();

  return (
    <div className="mx-auto grid h-full min-h-0 w-full max-w-[1680px] grid-rows-[auto_minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2 overflow-hidden">
      {dashboard.isLoading && <p className="text-[13px] text-biz-muted">Loading dashboard...</p>}
      {dashboard.isError && <p className="text-[13px] text-biz-danger">Failed to load dashboard data.</p>}

      {dashboard.data && (
        <>
          <DashboardKpiRow kpis={dashboard.data.kpis} />

          <div className="grid min-h-0 grid-cols-3 gap-2 xl:grid-cols-[0.92fr_0.92fr_1.35fr]">
            <TargetVsAchievementCard data={dashboard.data.targetVsAchievement} />
            <TenderPerformanceCard data={dashboard.data.tenderPerformance} />
            <BusinessByCategoryCard data={dashboard.data.businessByCategory} />
          </div>

          <div className="grid min-h-0 grid-cols-3 gap-2">
            <UpcomingRemindersCard items={dashboard.data.upcomingReminders} />
            <RecentTransactionsCard items={dashboard.data.recentTransactions} />
            <TopProjectsCard items={dashboard.data.topProjects} />
          </div>
        </>
      )}
    </div>
  );
}
