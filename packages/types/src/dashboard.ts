export interface DashboardKpis {
  ongoingWorks: { count: number; contractValue: string };
  tenderSecurity: { amount: string; instruments: number };
  pgBg: { amount: string; instruments: number };
  securityDeposit: { amount: string; projects: number };
  receivables: { amount: string; overdue: string };
  payables: { amount: string; dueSoon: string };
  bankAndCash: { amount: string };
  loansAndEmi: { amount: string; nextEmiDate: string | null };
}

export interface TargetVsAchievement {
  target: string;
  achievement: string;
  achievementRate: number;
}

export interface TenderPerformance {
  submitted: number;
  noaAwarded: number;
  successRate: number;
  underProcess: number;
}

export interface BusinessByCategoryItem {
  category: string;
  amount: string;
  percentage: number;
  color: string;
}

export interface BusinessByCategory {
  items: BusinessByCategoryItem[];
  totalBusiness: string;
}

export interface UpcomingReminder {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  dueDate: string;
}

export interface RecentTransaction {
  id: string;
  type: string;
  title: string;
  reference: string;
  amount: string;
  status: string;
}

export interface TopProject {
  id: string;
  name: string;
  contractValue: string;
  progressPercentage: number;
}

export interface DashboardResponse {
  kpis: DashboardKpis;
  targetVsAchievement: TargetVsAchievement;
  tenderPerformance: TenderPerformance;
  businessByCategory: BusinessByCategory;
  upcomingReminders: UpcomingReminder[];
  remindersCount: number;
  recentTransactions: RecentTransaction[];
  topProjects: TopProject[];
}
