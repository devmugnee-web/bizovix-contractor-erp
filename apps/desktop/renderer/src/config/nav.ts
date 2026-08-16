import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Banknote,
  Building2,
  CreditCard,
  Database,
  FileText,
  FolderOpen,
  History,
  LayoutDashboard,
  Receipt,
  Landmark,
  Settings,
  Wallet,
} from "lucide-react";

export interface NavLeaf {
  label: string;
  href: string;
}

export interface NavItem {
  label: string;
  href?: string;
  subtitle?: string;
  icon: LucideIcon;
  badgeKey?: "reminders";
  children?: NavLeaf[];
}

export function isNavRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "CMS",
    subtitle: "Contract Management System",
    icon: FileText,
    children: [
      { label: "Ongoing Works", href: "/cms/ongoing-works" },
      { label: "Archived Works", href: "/cms/archived-works" },
    ],
  },
  {
    label: "Bank Instruments",
    icon: Landmark,
    children: [
      { label: "Document Purchase", href: "/bank-instruments/document-purchase" },
      { label: "Tender Security", href: "/bank-instruments/tender-security" },
      { label: "Credit Commitment", href: "/bank-instruments/credit-commitment" },
      { label: "PG / BG", href: "/bank-instruments/pg-bg" },
    ],
  },
  {
    label: "Purchases & Expense",
    icon: Wallet,
    children: [
      { label: "Project Expense", href: "/expenses/project-expense" },
      { label: "General Expense", href: "/expenses/general-expense" },
    ],
  },
  { label: "Receipts", href: "/receipts", icon: Receipt },
  {
    label: "Accounts",
    href: "/accounts",
    icon: Building2,
    children: [
      { label: "Overview", href: "/accounts" },
      { label: "Chart of Accounts", href: "/accounts/chart-of-accounts" },
      { label: "Journal Entries", href: "/accounts/journals" },
      { label: "General Ledger", href: "/accounts/general-ledger" },
      { label: "Receivables", href: "/accounts/receivables" },
      { label: "Payables", href: "/accounts/payables" },
      { label: "Project Accounts", href: "/accounts/project-accounts" },
      { label: "Party Ledger", href: "/accounts/party-ledger" },
      { label: "Opening Balances", href: "/accounts/opening-balances" },
    ],
  },
  {
    label: "Cash & Bank",
    href: "/cash-bank",
    icon: Banknote,
    children: [
      { label: "Main Cash", href: "/cash-bank/main-cash" },
      { label: "Petty Cash", href: "/cash-bank/petty-cash" },
      { label: "Bank Accounts", href: "/cash-bank/bank-accounts" },
      { label: "Bank Transfer", href: "/cash-bank/transfers" },
      { label: "Transactions", href: "/cash-bank/transactions" },
      { label: "Bank Reconciliation", href: "/cash-bank/reconciliation" },
      { label: "Cheque Management", href: "/cash-bank/cheques" },
    ],
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
    children: [
      { label: "Tender Reports", href: "/reports/tenders" },
      { label: "Project Reports", href: "/reports/projects" },
      { label: "Expense Reports", href: "/reports/expenses" },
      { label: "Receipt Reports", href: "/reports/receipts" },
      { label: "Cash & Bank Reports", href: "/reports/cash-bank" },
      { label: "Financial Reports", href: "/reports/financial" },
      { label: "Expiry & Due Reports", href: "/reports/expiry-due" },
      { label: "Inventory Reports", href: "/reports/inventory" },
      { label: "Asset Reports", href: "/reports/assets" },
      { label: "Inter-Company Reports", href: "/reports/inter-company" },
    ],
  },
];

export const NAV_ITEMS_LOWER: NavItem[] = [
  {
    label: "Business Tools",
    href: "/business-tools",
    icon: Database,
    children: [
      { label: "Financial Calculator", href: "/business-tools/financial-calculator" },
      { label: "Date & Maturity Calculator", href: "/business-tools/date-maturity-calculator" },
      { label: "Amount in Words", href: "/business-tools/amount-in-words" },
      { label: "Document Generator", href: "/business-tools/document-generator" },
      { label: "Tender Checklist", href: "/business-tools/tender-checklist" },
      { label: "QR / Reference Tools", href: "/business-tools/qr-reference-tools" },
      { label: "Import / Export Tools", href: "/business-tools/import-export" },
    ],
  },
  { label: "Reminders", href: "/reminders", icon: Bell, badgeKey: "reminders" },
  {
    label: "Documents",
    href: "/documents",
    icon: FolderOpen,
    children: [
      { label: "Document Center", href: "/documents" },
      { label: "Tender Documents", href: "/documents/tenders" },
      { label: "Project Documents", href: "/documents/projects" },
      { label: "Company Documents", href: "/documents/company" },
      { label: "Financial Documents", href: "/documents/financial" },
      { label: "Expiring Documents", href: "/documents/expiring" },
      { label: "Archived Documents", href: "/documents/archived" },
    ],
  },
  { label: "Activity Log", href: "/activity-log", icon: History },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Plan & Billing", href: "/plan-billing", icon: CreditCard },
];
