import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Boxes,
  Building2,
  FileText,
  FolderOpen,
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

// Sidebar structure follows the Sir-approved primary navigation exactly:
// Dashboard, Bank Instruments, CMS, Expenses, Receipts, Reports, Masters,
// Reminders, Documents, Bank & Accounts, Settings.
//
// Modules that still exist and work (Tenders, Procurement, Supplier Bills,
// Business Tools, Activity Log, Plan & Billing as a top-level item) are
// intentionally NOT listed here — see nav-hidden.ts for the full list of
// routes kept but hidden from the primary sidebar per the simplification
// phase. Nothing was deleted; only sidebar exposure changed.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Bank Instruments",
    href: "/bank-instruments/document-purchase",
    icon: Landmark,
    children: [
      { label: "Document Purchase", href: "/bank-instruments/document-purchase" },
      { label: "Tender Security", href: "/bank-instruments/tender-security" },
      { label: "Credit Commitment", href: "/bank-instruments/credit-commitment" },
      { label: "PG / BG", href: "/bank-instruments/pg-bg" },
    ],
  },
  {
    label: "CMS",
    subtitle: "Contract Management System",
    href: "/cms/ongoing-works",
    icon: FileText,
    children: [
      { label: "Ongoing Works", href: "/cms/ongoing-works" },
      { label: "Archived Works", href: "/cms/archived-works" },
    ],
  },
  {
    label: "Expenses",
    href: "/expenses",
    icon: Wallet,
    children: [
      { label: "Project Expense", href: "/expenses/project-expense" },
      { label: "General Expense", href: "/expenses/general-expense" },
    ],
  },
  { label: "Receipts", href: "/receipts", icon: Receipt },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
    children: [
      { label: "Bank Instrument Reports", href: "/reports/tenders" },
      { label: "Project Reports", href: "/reports/projects" },
      { label: "Expense Reports", href: "/reports/expenses" },
      { label: "Receipt Reports", href: "/reports/receipts" },
      { label: "Cash & Bank Reports", href: "/reports/cash-bank" },
      { label: "Financial Reports", href: "/reports/financial" },
      { label: "Expiry & Due Reports", href: "/reports/expiry-due" },
    ],
  },
  {
    label: "Masters",
    href: "/masters",
    icon: Boxes,
    children: [
      { label: "Organizations / Clients", href: "/masters/organizations" },
      { label: "Vendors & Suppliers", href: "/masters/vendors" },
      { label: "Subcontractors", href: "/masters/subcontractors" },
      { label: "Materials / Items", href: "/masters/items" },
      { label: "Units of Measurement", href: "/masters/units" },
      { label: "Categories", href: "/masters/categories" },
      { label: "Payment Terms", href: "/masters/payment-terms" },
    ],
  },
];

export const NAV_ITEMS_LOWER: NavItem[] = [
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
  {
    label: "Bank & Accounts",
    href: "/cash-bank",
    icon: Building2,
    children: [
      { label: "Main Cash", href: "/cash-bank/main-cash" },
      { label: "Petty Cash", href: "/cash-bank/petty-cash" },
      { label: "Bank Accounts", href: "/cash-bank/bank-accounts" },
      { label: "Bank Transfer", href: "/cash-bank/transfers" },
      { label: "Transactions", href: "/cash-bank/transactions" },
      { label: "Bank Reconciliation", href: "/cash-bank/reconciliation" },
      { label: "Cheque Management", href: "/cash-bank/cheques" },
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
  { label: "Settings", href: "/settings", icon: Settings },
  // Settings has its own internal left-nav (see SettingsNav) so its 12 sections
  // (11 settings areas + Plan & Billing) are not also duplicated as a sidebar
  // submenu — keeps the sidebar uncluttered.
];
