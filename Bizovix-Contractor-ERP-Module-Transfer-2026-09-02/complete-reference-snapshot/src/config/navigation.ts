import {
  BadgePercent,
  CircleDollarSign,
  BarChart3,
  BookOpenText,
  Boxes,
  BriefcaseBusiness,
  ClipboardCheck,
  ChartNoAxesColumn,
  ClipboardList,
  CreditCard,
  FileBarChart2,
  FileClock,
  FileSpreadsheet,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
} from "lucide-react";

import type { VoucherType } from "@/types/domain";

export const voucherShortcutOrder: Array<{ label: string; key: string; type: VoucherType }> = [
  { key: "P", label: "Payment", type: "payment" },
  { key: "R", label: "Receipt", type: "receipt" },
  { key: "J", label: "Journal", type: "journal" },
  { key: "S", label: "Sales", type: "sales" },
  { key: "U", label: "Purchase", type: "purchase" },
  { key: "E", label: "Expense", type: "expense" },
  { key: "V", label: "Revenue", type: "revenue" },
];

export interface CreateMenuItem {
  label: string;
  description: string;
  path: string;
}

export interface CreateMenuSection {
  key: string;
  label: string;
  description: string;
  icon: typeof CircleDollarSign;
  items: CreateMenuItem[];
}

export const createMenuSections: CreateMenuSection[] = [
  {
    key: "accounting-master",
    label: "Accounting Master",
    description: "Group, ledger, budget, voucher type, and other accounting setup.",
    icon: CircleDollarSign,
    items: [
      { label: "Group", description: "Create and organize account groups.", path: "/masters/accounts?create=group" },
      { label: "Ledger", description: "Open a ledger creation workspace.", path: "/masters/accounts?create=ledger" },
      { label: "Cost Category", description: "Define cost category structures.", path: "/masters/accounts?create=cost-category" },
      { label: "Cost Center", description: "Set up departmental or project cost centers.", path: "/masters/accounts?create=cost-center" },
      { label: "Cost Center Class", description: "Configure cost center classification.", path: "/masters/accounts?create=cost-center-class" },
      { label: "Currency", description: "Maintain base and foreign currencies.", path: "/masters/accounts?create=currency" },
      { label: "Rate of Exchange", description: "Track exchange rates for transactions.", path: "/masters/accounts?create=rate-of-exchange" },
      { label: "Budget", description: "Set budget definitions and limits.", path: "/masters/accounts?create=budget" },
      { label: "Scenario", description: "Maintain planning scenarios.", path: "/masters/accounts?create=scenario" },
      { label: "Voucher Type", description: "Define accounting voucher types.", path: "/masters/accounts?create=voucher-type" },
      { label: "Credit Limit", description: "Manage customer or supplier credit ceilings.", path: "/masters/accounts?create=credit-limit" },
    ],
  },
  {
    key: "inventory-master",
    label: "Inventory Master",
    description: "Stock setup, categorization, measurement, and location controls.",
    icon: Boxes,
    items: [
      { label: "Stock Group", description: "Organize inventory into stock groups.", path: "/masters/inventory?create=stock-group" },
      { label: "Stock Category", description: "Maintain stock categories for reporting.", path: "/masters/inventory?create=stock-category" },
      { label: "Stock Item", description: "Create a new stock item card.", path: "/masters/inventory?create=stock-item" },
      { label: "Unit", description: "Define inventory units of measure.", path: "/masters/inventory?create=unit" },
      { label: "Godown/Location", description: "Set up warehouses and storage points.", path: "/masters/inventory?create=godown-location" },
    ],
  },
  {
    key: "payroll-master",
    label: "Payroll Master",
    description: "Employee, attendance, pay head, and payroll voucher setup.",
    icon: BriefcaseBusiness,
    items: [
      { label: "Employee Group", description: "Organize employees into payroll groups.", path: "/masters/settings?create=employee-group" },
      { label: "Employee", description: "Create a new employee profile.", path: "/masters/settings?create=employee" },
      { label: "Units (Work)", description: "Set work-based payroll units.", path: "/masters/settings?create=units-work" },
      { label: "Attendance / Production Type", description: "Configure attendance and production types.", path: "/masters/settings?create=attendance-production-type" },
      { label: "Pay Head", description: "Maintain earnings and deduction heads.", path: "/masters/settings?create=pay-head" },
      { label: "Payroll Voucher Type", description: "Set up payroll voucher formats.", path: "/masters/settings?create=payroll-voucher-type" },
    ],
  },
  {
    key: "statutory-master",
    label: "Statutory Master",
    description: "Maintain compliance-related classifications.",
    icon: ShieldCheck,
    items: [{ label: "VAT Classification", description: "Create VAT classification rules.", path: "/masters/settings?create=vat-classification" }],
  },
  {
    key: "statutory-details",
    label: "Statutory Details",
    description: "Store registration and filing details for compliance.",
    icon: FileSpreadsheet,
    items: [
      {
        label: "VAT Registration details",
        description: "Maintain VAT registration information and identifiers.",
        path: "/masters/settings?create=vat-registration-details",
      },
    ],
  },
];

export const transactionWorkbenchSections = [
  {
    title: "Voucher Posting",
    groups: [
      {
        title: "Accounting Voucher",
        items: [
          { label: "Credit Note", route: "/vouchers/credit-note/new" },
          { label: "Purchase Return", route: "/vouchers/debit-note/new" },
          { label: "Expenses", route: "/vouchers/expense/new", shortcut: "E" },
          { label: "Journal", route: "/vouchers/journal/new", shortcut: "J" },
          { label: "Memorandum" },
          { label: "Payment", route: "/vouchers/payment/new", shortcut: "P" },
          { label: "Purchase", route: "/vouchers/purchase/new", shortcut: "U" },
          { label: "Receipt", route: "/vouchers/receipt/new", shortcut: "R" },
          { label: "Reversing Journal" },
          { label: "Sales", route: "/vouchers/sales/new", shortcut: "S" },
        ],
      },
      {
        title: "Inventory Voucher",
        items: [
          { label: "Delivery Note" },
          { label: "Material In" },
          { label: "Material Out" },
          { label: "Physical Stock" },
          { label: "Receipt Note" },
          { label: "Rejection In" },
          { label: "Rejection Out" },
          { label: "Stock Journal" },
        ],
      },
      {
        title: "Order Voucher",
        items: [
          { label: "Job Work In Order" },
          { label: "Job Work Out in Order" },
          { label: "Purchase Order" },
          { label: "Sales Order" },
        ],
      },
      {
        title: "Payroll Voucher",
        items: [
          { label: "Attendance" },
          { label: "Payroll" },
        ],
      },
    ],
  },
  {
    title: "Day Books",
    groups: [
      {
        title: "Open Registers",
        items: [{ label: "Day Book", route: "/day-book" }],
      },
    ],
  },
] as const;

export const navigationGroups = [
  {
    label: "Main",
    items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" }],
  },
  {
    label: "Transactions",
    items: [
      { label: "Day Book", icon: BookOpenText, path: "/day-book" },
      { label: "Sales", icon: ShoppingCart, path: "/vouchers/sales/new", shortcut: "S" },
      { label: "Purchase", icon: Package, path: "/vouchers/purchase/new", shortcut: "U" },
      { label: "Expense", icon: HandCoins, path: "/vouchers/expense/new", shortcut: "E" },
      { label: "Revenue", icon: CircleDollarSign, path: "/vouchers/revenue/new", shortcut: "V" },
      { label: "Payment", icon: CreditCard, path: "/vouchers/payment/new", shortcut: "P" },
      { label: "Receipt", icon: ReceiptText, path: "/vouchers/receipt/new", shortcut: "R" },
      { label: "Journal", icon: FileClock, path: "/vouchers/journal/new", shortcut: "J" },
    ],
  },
  {
    label: "Masters",
    items: [
      { label: "Accounts", icon: CircleDollarSign, path: "/masters/accounts" },
      { label: "Inventory", icon: Boxes, path: "/masters/inventory" },
      { label: "Customers", icon: Users, path: "/masters/customers" },
      { label: "Suppliers", icon: BriefcaseBusiness, path: "/masters/suppliers" },
      { label: "Loyalty Points", icon: BadgePercent, path: "/masters/loyalty-points" },
      { label: "Settings", icon: Settings, path: "/masters/settings" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Balance Sheet", icon: FileBarChart2, path: "/reports/balance-sheet" },
      { label: "Profit & Loss", icon: ChartNoAxesColumn, path: "/reports/profit-loss" },
      { label: "Cashflow Statement", icon: FileSpreadsheet, path: "/reports/cashflow-statement" },
      { label: "Trial Balance", icon: BarChart3, path: "/reports/trial-balance" },
      { label: "Account Receivable", icon: CircleDollarSign, path: "/reports/account-receivable" },
      { label: "Account Payable", icon: HandCoins, path: "/reports/account-payable" },
      { label: "Closing Stock", icon: ClipboardCheck, path: "/reports/closing-stock" },
      { label: "Ledger", icon: ClipboardList, path: "/reports/ledger" },
    ],
  },
  {
    label: "Utilities",
    items: [
      { label: "Journal (Adjustment Posting)", icon: FileClock, path: "/vouchers/journal/new?adjustment=1&returnTo=/app/reports/balance-sheet" },
      { label: "Import Items", icon: Package, path: "/utilities/import-items" },
      { label: "Update Items In Bulk", icon: ClipboardCheck, path: "/utilities/update-items-bulk" },
      { label: "Import Parties", icon: Users, path: "/utilities/import-parties" },
      { label: "Tally Import & Export", icon: BriefcaseBusiness, path: "/utilities/export-to-tally" },
      { label: "Export Items", icon: FileSpreadsheet, path: "/utilities/export-items" },
      { label: "Verify My Data", icon: ShieldCheck, path: "/utilities/verify-my-data" },
      { label: "Recycle Bin", icon: BookOpenText, path: "/utilities/recycle-bin" },
      { label: "Close Financial Year", icon: Landmark, path: "/utilities/close-financial-year" },
    ],
  },
] as const;
