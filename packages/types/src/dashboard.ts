export interface DashboardKpis {
  ongoingWorks: { count: number; contractValue: string };
  tenderSecurity: { amount: string; instruments: number };
  pgBg: { amount: string; instruments: number };
  /** Outstanding held amount derived from configured project contracts. */
  securityDeposit: { amount: string; projects: number; available: boolean };
  receivables: { amount: string; overdue: string };
  /** Derived from the real Payable model (amount - paidAmount), not Expense.status. */
  payables: { amount: string; dueSoon: string; overdue: string };
  bankAndCash: { amount: string };
  /** configured=false: no real Loan/EMI module exists yet — do not present a live balance. */
  loansAndEmi: { amount: string; nextEmiDate: string | null; configured: boolean };
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
