import {
  Archive,
  Banknote,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  FileChartColumn,
  Landmark,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

export interface ReportCardDef {
  slug: string;
  title: string;
  description: string;
}

export interface ReportCategoryDef {
  slug: string;
  title: string;
  shortTitle: string;
  icon: LucideIcon;
  reports: ReportCardDef[];
}

const r = (slug: string, title: string, description: string): ReportCardDef => ({
  slug,
  title,
  description,
});

export const REPORT_CATEGORIES: ReportCategoryDef[] = [
  {
    slug: "tenders",
    title: "Tender Reports",
    shortTitle: "Tender Reports",
    icon: FileChartColumn,
    reports: [
      r("document-purchase", "Document Purchase Report", "Tender document purchases and payments."),
      r("tender-security", "Tender Security", "Security amount, margin and expiry status."),
      r("pg-bg", "PG / BG", "Guarantee exposure, margin and expiry."),
      r("security-deposit", "SD", "Project security deposit and release position."),
    ],
  },
  {
    slug: "projects",
    title: "Project Reports",
    shortTitle: "Project Reports",
    icon: BriefcaseBusiness,
    reports: [
      r("profit-loss", "Project-wise Profit/Loss", "Revenue, cost, profit and margin by project."),
    ],
  },
  {
    slug: "financial",
    title: "Financial Reports",
    shortTitle: "Financial Reports",
    icon: Banknote,
    reports: [
      r(
        "profit-loss",
        "General Profit/Loss Statement",
        "Income and expense from posted accounting data.",
      ),
      r("trial-balance", "Trial Balance", "Posted ledger debit and credit balances."),
      r("ledger", "Ledger Breakdown", "Posted journal detail and running balances."),
      r("balance-sheet", "Balance Sheet", "Assets, liabilities and equity from posted entries."),
    ],
  },
  {
    slug: "cash-bank",
    title: "Cash & Bank Reports",
    shortTitle: "Cash & Bank Reports",
    icon: Landmark,
    reports: [r("cash-flow", "Cash Flow", "Opening, inflow, outflow and closing balance.")],
  },
  {
    slug: "expiry-due",
    title: "Expiry & Due Reports",
    shortTitle: "Expiry & Due Reports",
    icon: CalendarClock,
    reports: [
      r("bill-maturity", "Bill Maturity", "Upcoming and overdue bills by maturity bucket."),
    ],
  },
  {
    slug: "expenses",
    title: "Expense Reports",
    shortTitle: "Expense Reports",
    icon: WalletCards,
    reports: [
      r("category", "Expense Category Report", "Category contribution and transaction volume."),
    ],
  },
  {
    slug: "inventory",
    title: "Inventory Reports",
    shortTitle: "Inventory Reports",
    icon: Boxes,
    reports: [r("summary", "Inventory Report", "Inventory integration and stock overview.")],
  },
  {
    slug: "assets",
    title: "Asset Reports",
    shortTitle: "Asset Reports",
    icon: Archive,
    reports: [r("schedule", "Asset Schedule Management", "Cost, depreciation and net book value.")],
  },
  {
    slug: "inter-company",
    title: "Internal Company Reports",
    shortTitle: "Internal Company Reports",
    icon: Building2,
    reports: [
      r("transactions", "Internal Company Transaction", "Transactions between business entities."),
    ],
  },
];

export const findReport = (category: string, report: string) =>
  REPORT_CATEGORIES.find((c) => c.slug === category)?.reports.find((r) => r.slug === report);
