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
    <div className="flex flex-col gap-4">
      {dashboard.isLoading && <p className="text-[13px] text-biz-muted">Loading dashboard...</p>}
      {dashboard.isError && <p className="text-[13px] text-biz-danger">Failed to load dashboard data.</p>}

      {dashboard.data && (
        <>
          <DashboardKpiRow kpis={dashboard.data.kpis} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <TargetVsAchievementCard data={dashboard.data.targetVsAchievement} />
            <TenderPerformanceCard data={dashboard.data.tenderPerformance} />
            <BusinessByCategoryCard data={dashboard.data.businessByCategory} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <UpcomingRemindersCard items={dashboard.data.upcomingReminders} />
            <RecentTransactionsCard items={dashboard.data.recentTransactions} />
            <TopProjectsCard items={dashboard.data.topProjects} />
          </div>
        </>
      )}
    </div>
  );
}
