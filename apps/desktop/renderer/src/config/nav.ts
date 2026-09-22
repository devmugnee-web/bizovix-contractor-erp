import type { LucideIcon } from "lucide-react";
import type { Permission } from "@bizovix/types";
import {
  Activity,
  AlarmClock,
  Archive,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRightLeft,
  ArrowUpFromLine,
  Award,
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  BookText,
  Boxes,
  Briefcase,
  Building2,
  Calculator,
  CalendarClock,
  CheckCheck,
  ClipboardList,
  Coins,
  FileBadge2,
  FileCheck2,
  FileSignature,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  FolderOpen,
  FunctionSquare,
  Gavel,
  HandCoins,
  Handshake,
  HardHat,
  History,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  ListChecks,
  ListOrdered,
  ListTree,
  Package,
  Package2,
  PackageCheck,
  PieChart,
  Receipt,
  ReceiptText,
  Ruler,
  Scale,
  Settings,
  ShieldCheck,
  Tags,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

export interface NavLeaf {
  label: string;
  /** Omit for a non-navigable row (e.g. a disabled placeholder or group header). */
  href?: string;
  icon: LucideIcon;
  /** Renders as a non-clickable, muted row instead of a link. */
  disabled?: boolean;
  /** Renders this row one level deeper, for grouping under a preceding header row. */
  indent?: boolean;
  /** Nested submenu items owned by this row. */
  children?: NavLeaf[];
  permissions?: Permission[];
}

export interface NavItem {
  label: string;
  href?: string;
  subtitle?: string;
  icon: LucideIcon;
  badgeKey?: "reminders";
  children?: NavLeaf[];
  permissions?: Permission[];
}

export function isNavRouteActive(pathname: string, href: string) {
  const route = href.split("?", 1)[0] ?? href;
  return pathname === route || pathname.startsWith(`${route}/`);
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
const PRIMARY_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Tender Management",
    href: "/tender-management",
    icon: Gavel,
    children: [
      { label: "Tender List", href: "/tenders", icon: ClipboardList },
      { label: "Tender Costing", href: "/tender-management/tender-costing", icon: Calculator },
      {
        label: "SLT Calculation",
        href: "/tender-management/slt-calculation",
        icon: FunctionSquare,
      },
      { label: "Item Price History", href: "/tender-management/item-price-history", icon: History },
    ],
  },
  {
    label: "Quotation / Sales",
    href: "/quotation-sales",
    icon: Handshake,
    children: [
      { label: "Quotation", href: "/quotation-sales/quotation", icon: FileText },
      { label: "Quotation Costing", href: "/quotation-sales/quotation-costing", icon: Calculator },
      {
        label: "Accepted / Rejected",
        href: "/quotation-sales/accepted-rejected",
        icon: ListChecks,
      },
    ],
  },
  {
    label: "Bank Instruments",
    icon: Landmark,
    children: [
      { label: "Document Purchase", href: "/bank-instruments/document-purchase", icon: FileText },
      { label: "Tender Security", href: "/bank-instruments/tender-security", icon: ShieldCheck },
      { label: "Credit Commitment", href: "/bank-instruments/credit-commitment", icon: HandCoins },
      { label: "PG / BG", href: "/bank-instruments/pg-bg", icon: FileBadge2 },
    ],
  },
  {
    label: "LC Management",
    href: "/lc-management",
    icon: Landmark,
    permissions: ["lc.view", "lc.create", "lc.configure"],
    children: [
      {
        label: "LC Register",
        href: "/lc-management",
        icon: ClipboardList,
        permissions: ["lc.view"],
      },
      {
        label: "Open New LC",
        href: "/lc-management/create",
        icon: FileText,
        permissions: ["lc.create"],
      },
      {
        label: "Cost Heads",
        href: "/lc-management/cost-heads",
        icon: Tags,
        permissions: ["lc.configure"],
      },
    ],
  },
  {
    label: "Projects",
    subtitle: "Contract Management System",
    icon: FileText,
    children: [
      { label: "Ongoing Works", href: "/cms/ongoing-works", icon: HardHat },
      { label: "Archived Works", href: "/cms/archived-works", icon: Archive },
      {
        label: "Project Documentation",
        href: "/cms/documentation",
        icon: FolderKanban,
        children: [
          {
            label: "Bill Submission",
            href: "/cms/documentation/bill-submission",
            icon: FileCheck2,
          },
          {
            label: "Challan Submission",
            href: "/cms/documentation/challan-submission",
            icon: PackageCheck,
          },
          {
            label: "VAT-Tax Certificate",
            href: "/cms/documentation/vat-tax-certificate",
            icon: FileBadge2,
          },
          {
            label: "Completion Certificate",
            href: "/cms/documentation/work-completion-certificate",
            icon: Award,
          },
        ],
      },
    ],
  },
  {
    label: "Purchases & Expenses",
    icon: Wallet,
    children: [
      { label: "Project Expense", href: "/expenses/project-expense", icon: Briefcase },
      {
        label: "General Expense",
        href: "/expenses/general-expense",
        icon: ReceiptText,
        permissions: ["general_expense.read", "general_expense.create"],
      },
      {
        label: "IOU",
        href: "/expenses/iou",
        icon: HandCoins,
        children: [
          { label: "Work IOU", href: "/expenses/iou/work", icon: ClipboardList },
          { label: "Personal IOU", icon: Users, disabled: true },
        ],
      },
    ],
  },
  {
    label: "Assets Management",
    href: "/assets-management",
    icon: PackageCheck,
    permissions: ["asset.read", "asset.create", "asset.depreciation.post"],
    children: [
      {
        label: "Asset Register",
        href: "/assets-management",
        icon: ClipboardList,
        permissions: ["asset.read"],
      },
      {
        label: "Acquire Asset",
        href: "/assets-management?action=new",
        icon: Package2,
        permissions: ["asset.create"],
      },
      {
        label: "Depreciation",
        href: "/assets-management?view=depreciation",
        icon: Calculator,
        permissions: ["asset.depreciation.post"],
      },
    ],
  },
  {
    label: "HR & Payroll",
    href: "/hr-payroll",
    icon: Users,
    permissions: [
      "hr.employee.view",
      "hr.payroll.manage",
      "hr.leave.view",
      "hr.expense.view",
      "hr.loan.view",
      "hr.recruitment.view",
    ],
    children: [
      { label: "Employees", href: "/hr-payroll", icon: Users, permissions: ["hr.employee.view"] },
      {
        label: "Organization Structure",
        href: "/hr-payroll/organization-structure",
        icon: ListTree,
        permissions: ["hr.employee.view"],
      },
      {
        label: "Employee Lifecycle",
        href: "/hr-payroll/employee-lifecycle",
        icon: History,
        permissions: ["hr.employee.view"],
      },
      {
        label: "Attendance",
        href: "/hr-payroll/attendance",
        icon: CalendarClock,
        permissions: ["hr.employee.view"],
      },
      {
        label: "Payroll",
        href: "/hr-payroll/run-payroll",
        icon: Banknote,
        permissions: ["hr.payroll.manage"],
      },
      {
        label: "Leave & Claims",
        href: "/hr-payroll/leave",
        icon: ClipboardList,
        permissions: ["hr.leave.view"],
      },
      {
        label: "Recruitment",
        href: "/hr-payroll/recruitment",
        icon: Briefcase,
        permissions: ["hr.recruitment.view"],
      },
      {
        label: "Shifts & Holidays",
        href: "/hr-payroll/shifts-holidays",
        icon: AlarmClock,
        permissions: ["hr.employee.view"],
      },
      {
        label: "HR Reports",
        href: "/hr-payroll/reports",
        icon: BarChart3,
        permissions: ["hr.employee.view"],
      },
    ],
  },
  {
    label: "Receipts",
    icon: Receipt,
    children: [
      { label: "Project Receipt", href: "/receipts/add", icon: FileCheck2 },
      { label: "General Receipt", href: "/receipts/general/add", icon: ReceiptText },
    ],
  },
  {
    label: "Reports",
    icon: BarChart3,
    children: [
      {
        label: "Document Purchases",
        href: "/reports/tenders/document-purchase",
        icon: FileText,
      },
      { label: "Tender Security", href: "/reports/tenders/tender-security", icon: ShieldCheck },
      { label: "PG / BG", href: "/reports/tenders/pg-bg", icon: FileBadge2 },
      { label: "SD", href: "/reports/tenders/security-deposit", icon: Landmark },
      {
        label: "Project Profit/Loss",
        href: "/reports/projects/profit-loss",
        icon: TrendingUp,
      },
      {
        label: "General Profit/Loss",
        href: "/reports/financial/profit-loss",
        icon: LineChart,
      },
      { label: "Cash Flow", href: "/reports/cash-bank/cash-flow", icon: Activity },
      { label: "Bank Charges", href: "/reports/cash-bank/bank-charges", icon: Landmark, permissions: ["report.view"] },
      { label: "Trial Balance", href: "/reports/financial/trial-balance", icon: Scale },
      { label: "Ledger Breakdown", href: "/reports/financial/ledger", icon: BookOpen },
      { label: "Bill Maturity", href: "/reports/expiry-due/bill-maturity", icon: CalendarClock },
      { label: "Expenses by Category", href: "/reports/expenses/category", icon: PieChart },
      { label: "Inventory Report", href: "/reports/inventory/summary", icon: Package },
      { label: "Asset Schedule", href: "/reports/assets/schedule", icon: ClipboardList },
      {
        label: "Internal Transactions",
        href: "/reports/inter-company/transactions",
        icon: ArrowLeftRight,
      },
      { label: "Balance Sheet", href: "/reports/financial/balance-sheet", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Masters",
    icon: Boxes,
    children: [
      { label: "Organizations / Clients", href: "/masters/organizations", icon: Building2 },
      { label: "Vendors & Suppliers", href: "/masters/vendors", icon: Truck },
      { label: "Subcontractors", href: "/masters/subcontractors", icon: Users },
      { label: "Materials / Items", href: "/masters/items", icon: Package2 },
      { label: "Units of Measurement", href: "/masters/units", icon: Ruler },
      { label: "Categories", href: "/masters/categories", icon: Tags },
      { label: "Payment Terms", href: "/masters/payment-terms", icon: FileSignature },
    ],
  },
];

const UTILITY_NAV_ITEMS: NavItem[] = [
  { label: "Reminders", href: "/reminders", icon: Bell, badgeKey: "reminders" },
  {
    label: "Documents",
    icon: FolderOpen,
    children: [
      { label: "Document Center", href: "/documents", icon: LayoutGrid },
      { label: "Tender Documents", href: "/documents/tenders", icon: FileText },
      { label: "Project Documents", href: "/documents/projects", icon: FolderKanban },
      { label: "Company Documents", href: "/documents/company", icon: Building2 },
      { label: "Financial Documents", href: "/documents/financial", icon: FileSpreadsheet },
      { label: "Expiring Documents", href: "/documents/expiring", icon: AlarmClock },
      { label: "Archived Documents", href: "/documents/archived", icon: Archive },
    ],
  },
  {
    label: "Bank & Accounts",
    icon: Building2,
    children: [
      { label: "Main Cash", href: "/cash-bank/main-cash", icon: Wallet },
      { label: "Petty Cash", href: "/cash-bank/petty-cash", icon: Coins },
      { label: "Bank Accounts", href: "/cash-bank/bank-accounts", icon: Landmark },
      { label: "Bank Transfer", href: "/cash-bank/transfers", icon: ArrowRightLeft },
      { label: "Transactions", href: "/cash-bank/transactions", icon: ListOrdered },
      { label: "Bank Reconciliation", href: "/cash-bank/reconciliation", icon: CheckCheck },
      { label: "Cheque Management", href: "/cash-bank/cheques", icon: Banknote },
      { label: "Chart of Accounts", href: "/accounts/chart-of-accounts", icon: ListTree },
      { label: "Journal Entries", href: "/accounts/journals", icon: BookText },
      { label: "General Ledger", href: "/accounts/general-ledger", icon: BookOpen },
      { label: "Receivables", href: "/accounts/receivables", icon: ArrowDownToLine },
      { label: "Payables", href: "/accounts/payables", icon: ArrowUpFromLine },
      { label: "Project Accounts", href: "/accounts/project-accounts", icon: Briefcase },
      { label: "Party Ledger", href: "/accounts/party-ledger", icon: Users },
      { label: "Opening Balances", href: "/accounts/opening-balances", icon: Scale },
    ],
  },
  { label: "Settings", href: "/settings", icon: Settings },
  // Settings has its own internal left-nav (see SettingsNav) so its 12 sections
  // (11 settings areas + Plan & Billing) are not also duplicated as a sidebar
  // submenu — keeps the sidebar uncluttered.
];

const ALL_NAV_ITEMS = [...PRIMARY_NAV_ITEMS, ...UTILITY_NAV_ITEMS];

function navItem(label: string): NavItem {
  const item = ALL_NAV_ITEMS.find((candidate) => candidate.label === label);
  if (!item) throw new Error(`Missing sidebar item: ${label}`);
  return item;
}

export const NAV_ITEMS: NavItem[] = [
  navItem("Dashboard"),
  navItem("Reminders"),
  navItem("Tender Management"),
  navItem("Bank Instruments"),
  navItem("Quotation / Sales"),
  navItem("Projects"),
  navItem("Purchases & Expenses"),
  navItem("LC Management"),
  navItem("Receipts"),
  navItem("Bank & Accounts"),
  navItem("Assets Management"),
  navItem("HR & Payroll"),
  navItem("Documents"),
  navItem("Reports"),
  navItem("Masters"),
];

export const NAV_ITEMS_LOWER: NavItem[] = [navItem("Settings")];
