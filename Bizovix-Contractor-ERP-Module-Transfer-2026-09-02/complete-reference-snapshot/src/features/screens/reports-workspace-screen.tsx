"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Boxes,
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BadgePercent,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  CheckCircle2,
  ChevronDown,
  FolderTree,
  Columns2,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Gauge,
  Landmark,
  PackageCheck,
  PackageSearch,
  PackageX,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  ClipboardList,
  Rows3,
  Search,
  SearchX,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Tags,
  Trash2,
  TrendingUp,
  UsersRound,
  Warehouse,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { AppDateInput } from "@/components/shared/app-date-input";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buildVoucherRoute, buildWorkspaceRoute } from "@/config/routes";
import { ChartOfAccountsPanel } from "@/features/screens/chart-of-accounts-panel";
import { useWorkflowSettingsQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { useAccountTreeQuery, useMoneyAccountsQuery, usePostableLedgersQuery } from "@/hooks/use-accounts-query";
import { downloadCsv, printInvoice } from "@/lib/download";
import { getInventoryOptionsAsOf, getInventoryOptionsBefore, getItemWiseMovementRows, getTrialBalanceRows } from "@/lib/erp-data";
import { buildInvoiceExportPayloadFromVoucher } from "@/lib/invoice";
import { getLatestPostingMonthRange } from "@/lib/posting-date-range";
import { getPartyLedgerMovement, voucherBelongsToParty } from "@/lib/party-ledger";
import { formatDate, formatNumber } from "@/lib/format";
import { calculateProfitAndLoss, getFinancialYearStart } from "@/lib/financial-statements";
import { moneyAmountsEqual, moneyToMinorUnits, roundMoney, sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { loadWorkspaceReportDataset } from "@/services/report-dataset";
import { getWorkspaceDeadStockMonths } from "@/services/auto-backup-settings.service";
import { listAuditReport, type AuditReportRow } from "@/services/audit-reports";
import { listWarehouseStock, type WarehouseStockRow } from "@/services/inventory-reports";
import { listWarehouses } from "@/services/warehouse.service";
import { deleteVoucher } from "@/services/voucher.service";
import { defaultWorkflowSettings } from "@/services/workflow-settings.service";
import type { AppDataset, DataMode, InventoryVoucherItem, VoucherRecord, VoucherType } from "@/types/domain";
import type { AccountNode } from "@/types/accounts";

const emptyReportDataset: AppDataset = {
  workspaces: [],
  users: [],
  parties: [],
  stockItems: [],
  vouchers: [],
  dashboardMetrics: [],
  trialBalance: [],
  summary: [],
  approvals: [],
  quickShortcuts: [],
  subscription: {
    currentPlan: { code: "local", name: "Local Workspace", description: "", priceLabel: "-", billingLabel: "-" },
    status: "paid-active",
    renewalDate: "",
    daysRemaining: 0,
    usages: [],
    plans: [],
    upgradeRequest: null,
  },
  workspaceSubscriptions: {},
};

type ReportKind = "profit-loss" | "balance-sheet" | "trial-balance" | "table" | "chart-of-accounts";
type CashFlowChannel = "all" | "cash" | "bank" | "mfs";

function getCashFlowLineChannel(
  line: VoucherRecord["lines"][number],
  bankAccountNames: string[],
  mfsAccountNames: string[],
  resolveAccount?: (line: VoucherRecord["lines"][number]) => ReportAccountMetadata | undefined,
): Exclude<CashFlowChannel, "all"> | null {
  if (resolveAccount) {
    const type = reportMoneyAccountType(resolveAccount(line));
    if (type) return type === "CASH" ? "cash" : type === "BANK" ? "bank" : "mfs";
    // An ID-bearing line is authoritative even when that ID does not resolve to
    // a money account. Caption heuristics are reserved for genuinely legacy
    // lines that have no accountId at all.
    if (line.accountId) return null;
  }
  if (line.moneyAccountType === "CASH") return "cash";
  if (line.moneyAccountType === "BANK") return "bank";
  if (line.moneyAccountType === "MFS") return "mfs";

  const ledgerKey = normalizeReportKey(line.ledger);
  if (mfsAccountNames.some((name) => normalizeReportKey(name) === ledgerKey)) return "mfs";
  if (bankAccountNames.some((name) => normalizeReportKey(name) === ledgerKey)) return "bank";
  if (/\b(cash|petty cash|cash in hand)\b/.test(ledgerKey)) return "cash";
  return null;
}

function voucherUsesCashFlowChannel(
  voucher: VoucherRecord,
  channel: CashFlowChannel,
  bankAccountNames: string[],
  mfsAccountNames: string[],
) {
  return channel === "all" || voucher.lines.some((line) => getCashFlowLineChannel(line, bankAccountNames, mfsAccountNames) === channel);
}

type ReportCatalogItem = {
  slug: string;
  label: string;
  group: string;
  kind: ReportKind;
};

type ReportSummaryChip = {
  label: string;
  value: string;
  tone?: "blue" | "green" | "orange" | "red";
};

type TableReportView = {
  kind: "table";
  title: string;
  description: string;
  columns: string[];
  rows: Array<Record<string, string>>;
  summary: ReportSummaryChip[];
  emptyMessage: string;
  rowDetails?: PartyStatementDetail[];
  billDetails?: BillReportDetail[];
  cashEquivalentRows?: Array<{
    ledgerId: string;
    ledger: string;
    channel: Exclude<CashFlowChannel, "all">;
    opening: number;
    moneyIn: number;
    moneyOut: number;
    closing: number;
  }>;
};
type CashEquivalentLedgerRow = NonNullable<TableReportView["cashEquivalentRows"]>[number];

type BillReportDetail = {
  voucherNumber: string;
  date: string;
  type: string;
  party: string;
  billAmount: number;
  paidAmount: number;
  returnedAmount: number;
  advanceAmount: number;
  balance: number;
  status: string;
  settlementMode: string;
  reference: string;
  // One row of the bill's life story. `method` names the real money ledger(s) the
  // cash moved through (split payments join several), `runningBalance` is what
  // was still owed straight after the event, and `voucherId`/`voucherType` let a
  // row open the underlying voucher for the full document.
  events: Array<{
    date: string;
    type: string;
    voucherNumber: string;
    amount: number;
    reference: string;
    voucherId: string;
    voucherType: VoucherType;
    method: string;
    // The real money ledgers a settlement moved through, with how much went
    // through each — a split collection genuinely has several. Empty for the bill
    // itself, whose settlement is a mode (Cash / Credit), not a set of ledgers.
    moneyLines: Array<{ ledger: string; amount: number }>;
    narration: string;
    // Read from the party's side of the books, so the column a figure lands in
    // matches the real posting: a Sales Invoice debits the receivable and a
    // collection credits it back, while a Purchase Bill credits the payable and
    // a payment debits it away. One of the two is always zero except on a
    // cash/bank bill, which is raised and settled on the same row.
    debit: number;
    credit: number;
    runningBalance: number;
    items: BillReportItem[];
  }>;
};

// The stock lines behind one event — what was actually sold on the bill, or what
// physically came back on a return. `itemId` is null for a free-text line that
// was never linked to a real inventory item, so such a row cannot be opened.
type BillReportItem = {
  itemId: string | null;
  name: string;
  warehouse: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

type PartyStatementDetail = {
  partyId: string;
  name: string;
  type: "customer" | "supplier";
  contact: string;
  openingBalance: number;
  movement: number;
  closingBalance: number;
  maturityDays: number;
  outstandingDocuments?: Array<{
    id: string;
    date: string;
    voucherNumber: string;
    voucherType: "sales" | "purchase";
    amount: number;
    outstanding: number;
    ageDays: number;
    overdue: boolean;
  }>;
  transactions: Array<{
    id: string;
    date: string;
    voucherNumber: string;
    voucherType: string;
    ageDays: number | null;
    debit: number;
    credit: number;
    runningBalance: number;
  }>;
};

type InventoryReportRowDetail = {
  itemId?: string;
  title: string;
  reportTitle: string;
  fields: Array<{ label: string; value: string }>;
};

type ExpenseReportRowDetail = {
  title: string;
  reportTitle: string;
  voucherId?: string;
  fields: Array<{ label: string; value: string }>;
};

type OperationalReportRowDetail = {
  title: string;
  reportTitle: string;
  group: string;
  voucherId?: string;
  fields: Array<{ label: string; value: string }>;
};

type ProfitLossRow = {
  label: string;
  amount: number;
  tone: "positive" | "negative" | "neutral";
  indent?: boolean;
  total?: boolean;
};

type ProfitLossView = {
  kind: "profit-loss";
  title: string;
  description: string;
  rows: ProfitLossRow[];
  summary: ReportSummaryChip[];
  otherIncomeBreakdown: Array<{ label: string; amount: number }>;
  operatingExpenseBreakdown: Array<{ label: string; amount: number }>;
  cogsFormula: FormulaLine[];
};

// One line of a printed accounting formula (Opening Stock + Purchases − Closing
// Stock …). `amount` already carries its own sign, so a "Less:" line is stored
// negative and simply adds up; `total` marks the closing figure the lines prove.
type FormulaLine = { label: string; amount: number; total?: boolean };

type ProfitLossDetail = {
  label: string;
  amount: number;
  calculation: string;
  vouchers: VoucherRecord[];
  ledgerBreakdown?: Array<{ label: string; amount: number }>;
  formula?: FormulaLine[];
};

type BalanceSheetLine = {
  label: string;
  amount: number;
  indent?: boolean;
  strong?: boolean;
  depth?: number;
  kind?: "group" | "account";
};

type BalanceSheetSection = {
  title: string;
  lines: BalanceSheetLine[];
  total: number;
};

type BalanceSheetView = {
  kind: "balance-sheet";
  title: string;
  description: string;
  liabilities: BalanceSheetSection[];
  assets: BalanceSheetSection[];
  totalLiabilities: number;
  totalAssets: number;
};

type TrialBalanceView = {
  kind: "trial-balance";
  title: string;
  description: string;
  rows: Array<{
    id: string;
    accountId?: string;
    ledger: string;
    group: string;
    openingBalance: number;
    debit: number;
    credit: number;
    closingBalance: number;
  }>;
  totalDebit: number;
  totalCredit: number;
  totalClosingBalance: number;
};

type LoanStatementView = {
  kind: "loan-statement";
  title: string;
  description: string;
  accountOptions: string[];
  selectedAccount: string;
  rows: Array<{
    date: string;
    type: string;
    amount: number;
    endingBalance: number;
  }>;
  openingBalance: number;
  balanceDue: number;
  totalPrincipalPaid: number;
  totalInterestPaid: number;
};

type SaleOrdersView = {
  kind: "sale-orders";
  title: string;
  description: string;
  rows: Array<{
    date: string;
    orderNo: string;
    name: string;
    dueDate: string;
    status: string;
    type: string;
    total: number;
    advance: number;
    balance: number;
  }>;
  totalAmount: number;
};

type ExpenseCategoryView = {
  kind: "expense-category";
  title: string;
  description: string;
  rows: Array<{
    category: string;
    categoryType: string;
    amount: number;
  }>;
  totalExpense: number;
};

type ExpenseItemView = {
  kind: "expense-item";
  title: string;
  description: string;
  rows: Array<{
    item: string;
    unitPrice: number;
    quantity: number;
    amount: number;
    voucherId?: string;
  }>;
  totalQuantity: number;
  totalAmount: number;
};

type ReportView =
  | TableReportView
  | ProfitLossView
  | BalanceSheetView
  | TrialBalanceView
  | LoanStatementView
  | SaleOrdersView
  | ExpenseCategoryView
  | ExpenseItemView;

type LoanStatementRow = {
  accountName: string;
  lender: string;
  type: string;
  date: string;
  principal: number;
  charges: number;
  total: number;
};

type ChequeReportRow = {
  chequeNo: string;
  bankAccount: string;
  payee: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  status: string;
  direction: string;
};

const currencySymbol = "\u09F3";

// The Chart of Accounts categories that hold real money, used to tell a genuine
// Cash / Bank / MFS ledger apart from any other ledger that happens to sit on the
// same voucher (another customer's receivable, a discount, a charge).
const MONEY_ACCOUNT_GROUPS = new Set([
  normalizeReportKey("Cash-in-Hand"),
  normalizeReportKey("Cash in Hand"),
  normalizeReportKey("Bank Accounts"),
  normalizeReportKey("Mobile Financial Service Accounts"),
]);

function formatReportGroupHeading(group: string) {
  return group.replace(/^(\d+)\./, (_, index: string) => `${Number(index) + 1}.`);
}

const reportCatalog: ReportCatalogItem[] = [
  { slug: "chart-of-accounts", label: "Chart of Accounts", group: "0. Chart of Accounts", kind: "chart-of-accounts" },

  { slug: "sales-register", label: "Sales Register", group: "1. Transaction Reports", kind: "table" },
  { slug: "purchase-register", label: "Purchase Register", group: "1. Transaction Reports", kind: "table" },
  { slug: "receipt-register", label: "Receipt Register", group: "1. Transaction Reports", kind: "table" },
  { slug: "payment-register", label: "Payment Register", group: "1. Transaction Reports", kind: "table" },
  { slug: "sales-return-register", label: "Sales Return Register", group: "1. Transaction Reports", kind: "table" },
  { slug: "purchase-return-register", label: "Purchase Return Register", group: "1. Transaction Reports", kind: "table" },
  { slug: "day-book", label: "Day Book", group: "1. Transaction Reports", kind: "table" },
  { slug: "all-transactions", label: "All Transactions", group: "1. Transaction Reports", kind: "table" },
  { slug: "customer-supplier-comparison", label: "Customer & Supplier Comparison Report", group: "1. Transaction Reports", kind: "table" },

  { slug: "cash-book", label: "Cash Book", group: "2. Financial Reports", kind: "table" },
  { slug: "bank-book", label: "Bank Book", group: "2. Financial Reports", kind: "table" },
  { slug: "mfs-report", label: "MFS Report", group: "2. Financial Reports", kind: "table" },
  { slug: "general-ledger", label: "General Ledger", group: "2. Financial Reports", kind: "table" },
  { slug: "trial-balance", label: "Trial Balance", group: "2. Financial Reports", kind: "trial-balance" },
  { slug: "profit-loss", label: "Profit & Loss Statement", group: "2. Financial Reports", kind: "profit-loss" },
  { slug: "balance-sheet", label: "Balance Sheet", group: "2. Financial Reports", kind: "balance-sheet" },
  { slug: "cashflow-statement", label: "Cash Flow Statement", group: "2. Financial Reports", kind: "table" },
  { slug: "bill-wise-profit", label: "Bill Wise Profit", group: "2. Financial Reports", kind: "table" },

  { slug: "customer-statement", label: "Customer Statement", group: "3. Customer & Supplier Reports", kind: "table" },
  { slug: "supplier-statement", label: "Supplier Statement", group: "3. Customer & Supplier Reports", kind: "table" },
  { slug: "outstanding-receivables", label: "Outstanding Receivables", group: "3. Customer & Supplier Reports", kind: "table" },
  { slug: "outstanding-payables", label: "Outstanding Payables", group: "3. Customer & Supplier Reports", kind: "table" },
  { slug: "customer-list", label: "Customer List", group: "3. Customer & Supplier Reports", kind: "table" },
  { slug: "supplier-list", label: "Supplier List", group: "3. Customer & Supplier Reports", kind: "table" },
  { slug: "customer-wise-profit-loss", label: "Customer Wise Profit & Loss", group: "3. Customer & Supplier Reports", kind: "table" },
  { slug: "supplier-wise-profit-loss", label: "Supplier Wise Profit & Loss", group: "3. Customer & Supplier Reports", kind: "table" },
  { slug: "sales-by-customer", label: "Sales by Customer", group: "3. Customer & Supplier Reports", kind: "table" },
  { slug: "purchase-by-supplier", label: "Purchase by Supplier", group: "3. Customer & Supplier Reports", kind: "table" },
  { slug: "customer-aging-report", label: "Customer Aging Report", group: "3. Customer & Supplier Reports", kind: "table" },
  { slug: "supplier-aging-report", label: "Supplier Aging Report", group: "3. Customer & Supplier Reports", kind: "table" },

  { slug: "stock-summary", label: "Stock Summary", group: "4. Inventory Reports", kind: "table" },
  { slug: "stock-details", label: "Stock Details", group: "4. Inventory Reports", kind: "table" },
  { slug: "item-details", label: "Item Details", group: "4. Inventory Reports", kind: "table" },
  { slug: "item-wise-movement", label: "Item Wise Movement", group: "4. Inventory Reports", kind: "table" },
  { slug: "inventory-valuation", label: "Inventory Valuation", group: "4. Inventory Reports", kind: "table" },
  { slug: "closing-stock", label: "Closing Stock", group: "4. Inventory Reports", kind: "table" },
  { slug: "low-stock-report", label: "Low Stock Report", group: "4. Inventory Reports", kind: "table" },
  { slug: "negative-stock-report", label: "Negative Stock Report", group: "4. Inventory Reports", kind: "table" },
  { slug: "dead-stock-report", label: "Dead Stock Report", group: "4. Inventory Reports", kind: "table" },
  { slug: "reorder-report", label: "Reorder Report", group: "4. Inventory Reports", kind: "table" },
  { slug: "item-wise-profit-loss", label: "Item Wise Profit & Loss", group: "4. Inventory Reports", kind: "table" },
  { slug: "category-wise-profit-loss", label: "Category Wise Profit & Loss", group: "4. Inventory Reports", kind: "table" },
  { slug: "sales-by-category", label: "Sales by Category", group: "4. Inventory Reports", kind: "table" },
  { slug: "purchase-by-category", label: "Purchase by Category", group: "4. Inventory Reports", kind: "table" },
  { slug: "stock-by-category", label: "Stock by Category", group: "4. Inventory Reports", kind: "table" },
  { slug: "warehouse-wise-report", label: "Warehouse Wise Report", group: "4. Inventory Reports", kind: "table" },
  { slug: "slow-moving-items", label: "Slow Moving Items", group: "4. Inventory Reports", kind: "table" },
  { slug: "fast-moving-items", label: "Fast Moving Items", group: "4. Inventory Reports", kind: "table" },
  { slug: "item-wise-discount", label: "Item Wise Discount", group: "4. Inventory Reports", kind: "table" },
  { slug: "bill-wise-report", label: "Bill Wise Report", group: "4. Inventory Reports", kind: "table" },

  { slug: "expense-register", label: "Expense Register", group: "5. Expense Reports", kind: "table" },
  { slug: "expense-category-report", label: "Expense Category Report", group: "5. Expense Reports", kind: "table" },
  { slug: "expense-item-report", label: "Expense Item Report", group: "5. Expense Reports", kind: "table" },
  { slug: "monthly-expense-summary", label: "Monthly Expense Summary", group: "5. Expense Reports", kind: "table" },
  { slug: "expense-analysis", label: "Expense Analysis", group: "5. Expense Reports", kind: "table" },

  { slug: "bank-statement", label: "Bank Statement", group: "6. Banking Reports", kind: "table" },
  { slug: "cheque-register", label: "Cheque Register", group: "6. Banking Reports", kind: "table" },
  { slug: "post-dated-cheques", label: "Post-Dated Cheques", group: "6. Banking Reports", kind: "table" },
  { slug: "loan-statement", label: "Loan Statement", group: "6. Banking Reports", kind: "table" },

  { slug: "tax-report", label: "Tax Report", group: "7. Tax Reports", kind: "table" },
  { slug: "tax-rate-report", label: "Tax Rate Report", group: "7. Tax Reports", kind: "table" },
  { slug: "vat-summary", label: "VAT Summary", group: "7. Tax Reports", kind: "table" },
  { slug: "vat-register", label: "VAT Register", group: "7. Tax Reports", kind: "table" },

  { slug: "sales-orders", label: "Sales Orders", group: "8. Order Reports", kind: "table" },
  { slug: "purchase-orders", label: "Purchase Orders", group: "8. Order Reports", kind: "table" },
  { slug: "pending-sales-orders", label: "Pending Sales Orders", group: "8. Order Reports", kind: "table" },
  { slug: "pending-purchase-orders", label: "Pending Purchase Orders", group: "8. Order Reports", kind: "table" },
  { slug: "pending-deliveries", label: "Pending Deliveries", group: "8. Order Reports", kind: "table" },
  { slug: "pending-invoices", label: "Pending Invoices", group: "8. Order Reports", kind: "table" },

  { slug: "current-ratio", label: "Current Ratio", group: "9. Ratio Analysis", kind: "table" },
  { slug: "quick-ratio", label: "Quick Ratio", group: "9. Ratio Analysis", kind: "table" },
  { slug: "cash-ratio", label: "Cash Ratio", group: "9. Ratio Analysis", kind: "table" },
  { slug: "gross-profit-margin", label: "Gross Profit Margin", group: "9. Ratio Analysis", kind: "table" },
  { slug: "net-profit-margin", label: "Net Profit Margin", group: "9. Ratio Analysis", kind: "table" },
  { slug: "operating-profit-margin", label: "Operating Profit Margin", group: "9. Ratio Analysis", kind: "table" },
  { slug: "return-on-assets", label: "Return on Assets (ROA)", group: "9. Ratio Analysis", kind: "table" },
  { slug: "return-on-equity", label: "Return on Equity (ROE)", group: "9. Ratio Analysis", kind: "table" },
  { slug: "inventory-turnover-ratio", label: "Inventory Turnover Ratio", group: "9. Ratio Analysis", kind: "table" },
  { slug: "receivable-turnover-ratio", label: "Receivable Turnover Ratio", group: "9. Ratio Analysis", kind: "table" },
  { slug: "payable-turnover-ratio", label: "Payable Turnover Ratio", group: "9. Ratio Analysis", kind: "table" },
  { slug: "debt-to-equity-ratio", label: "Debt-to-Equity Ratio", group: "9. Ratio Analysis", kind: "table" },
  { slug: "debt-ratio", label: "Debt Ratio", group: "9. Ratio Analysis", kind: "table" },
  { slug: "working-capital-analysis", label: "Working Capital Analysis", group: "9. Ratio Analysis", kind: "table" },

  { slug: "sales-dashboard", label: "Sales Dashboard", group: "10. Business Analytics", kind: "table" },
  { slug: "purchase-dashboard", label: "Purchase Dashboard", group: "10. Business Analytics", kind: "table" },
  { slug: "top-selling-products", label: "Top Selling Products", group: "10. Business Analytics", kind: "table" },
  { slug: "top-customers", label: "Top Customers", group: "10. Business Analytics", kind: "table" },
  { slug: "top-suppliers", label: "Top Suppliers", group: "10. Business Analytics", kind: "table" },
  { slug: "top-salespersons", label: "Top Salespersons", group: "10. Business Analytics", kind: "table" },
  { slug: "monthly-sales-trend", label: "Monthly Sales Trend", group: "10. Business Analytics", kind: "table" },
  { slug: "monthly-purchase-trend", label: "Monthly Purchase Trend", group: "10. Business Analytics", kind: "table" },
  { slug: "monthly-expense-trend", label: "Monthly Expense Trend", group: "10. Business Analytics", kind: "table" },
  { slug: "gross-profit-analysis", label: "Gross Profit Analysis", group: "10. Business Analytics", kind: "table" },
  { slug: "net-profit-analysis", label: "Net Profit Analysis", group: "10. Business Analytics", kind: "table" },
  { slug: "sales-growth-analysis", label: "Sales Growth Analysis", group: "10. Business Analytics", kind: "table" },
  { slug: "purchase-trend-analysis", label: "Purchase Trend Analysis", group: "10. Business Analytics", kind: "table" },

  { slug: "user-activity-log", label: "User Activity", group: "11. Audit & Activity Reports", kind: "table" },
  { slug: "login-history", label: "Login History", group: "11. Audit & Activity Reports", kind: "table" },
  { slug: "edited-transactions", label: "Data Changes", group: "11. Audit & Activity Reports", kind: "table" },
  { slug: "deleted-transactions", label: "Deleted Records", group: "11. Audit & Activity Reports", kind: "table" },
  { slug: "approval-history", label: "Posting / Approval History", group: "11. Audit & Activity Reports", kind: "table" },
];

const AUDIT_REPORT_SLUGS = new Set([
  "user-activity-log",
  "login-history",
  "deleted-transactions",
  "edited-transactions",
  "approval-history",
]);

const toneClassMap: Record<NonNullable<ReportSummaryChip["tone"]>, string> = {
  blue: "bg-[#e8f2ff] text-[#0f5fc4]",
  green: "bg-[#ecfff6] text-[#0f9f63]",
  orange: "bg-[#fff5ea] text-primary",
  red: "bg-[#fff1f2] text-[#e11d48]",
};

function formatReportAmount(value: number) {
  return `${new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(value))} ${currencySymbol}`;
}

function isLiveVoucher(voucher: VoucherRecord) {
  return voucher.status === "posted";
}

// Financial statements are transaction-date reports, so a reversed source row
// must remain visible until the dated mirror entry offsets it. Looking only at
// the source row's current status erases valid history before the reversal date.
function isAccountingVoucher(voucher: VoucherRecord) {
  const carriesAccountingStatus = voucher.status === "posted" || voucher.status === "reversed";
  const isOrphanedReversal = /-REV(?:-REV)*$/i.test(voucher.voucherNumber.trim()) && !voucher.reversalOfId;
  return carriesAccountingStatus && !isOrphanedReversal;
}

// Reversal vouchers preserve the accounting audit trail, but their positive
// document total is not fresh turnover/expense. GL reports consume their
// reversed debit/credit lines; operational reports that sum `amount` must omit
// them or a reversal is presented as a new sale with no inventory cost.
function isReversalArtifact(voucher: VoucherRecord) {
  return Boolean(voucher.reversalOfId) || /-REV(?:-REV)*$/i.test(voucher.voucherNumber.trim());
}

function parseDateValue(value: string) {
  return new Date(`${value}T00:00:00`);
}

function daysBetween(left: string, right: string) {
  return Math.floor((parseDateValue(left).getTime() - parseDateValue(right).getTime()) / (1000 * 60 * 60 * 24));
}

function sumVoucherAmount(vouchers: VoucherRecord[], types: VoucherType[]) {
  return sumMoney(vouchers
    .filter((voucher) => types.includes(voucher.voucherType))
    .filter((voucher) => !isReversalArtifact(voucher))
    .filter((voucher) => voucher.voucherType !== "purchase" || voucher.documentKind == null || voucher.documentKind === "bill")
    .map((voucher) => Number(voucher.amount || 0)));
}

// Quotation, Proforma, Sale Order, and Delivery Note all share voucherType
// "sales" with a real Sales Invoice — only the Invoice itself (documentKind
// null/undefined) is an actual sale. Every report below that counts "sales"
// must use this instead of a bare voucherType check, or the same sale gets
// counted up to 4x as it moves through the chain, inflating Sales/Gross Profit.
const NON_INVOICE_SALES_DOCUMENT_KINDS = new Set(["quotation", "proforma", "sale-order", "delivery-note"]);

function isRealSalesInvoice(voucher: VoucherRecord) {
  return voucher.voucherType === "sales"
    && !isReversalArtifact(voucher)
    && !NON_INVOICE_SALES_DOCUMENT_KINDS.has(voucher.documentKind ?? "");
}

function isRealPurchaseBill(voucher: VoucherRecord) {
  return voucher.voucherType === "purchase"
    && !isReversalArtifact(voucher)
    && (voucher.documentKind == null || voucher.documentKind === "bill");
}

function hasCashBookMovement(voucher: VoucherRecord) {
  return voucher.lines.some((line) => line.costCenter === "Cash-in-Hand" || line.ledger.toLowerCase().includes("cash"));
}

function sumRealSalesInvoiceAmount(vouchers: VoucherRecord[]) {
  return sumMoney(vouchers.filter(isRealSalesInvoice).map((voucher) => Number(voucher.amount || 0)));
}

function createEmptyTableView(title: string, description: string, columns: string[], emptyMessage: string): TableReportView {
  return {
    kind: "table",
    title,
    description,
    columns,
    rows: [],
    summary: [],
    emptyMessage,
  };
}

function getStockCategory(stockItems: ReturnType<typeof getInventoryOptionsAsOf>, itemName: string) {
  return stockItems.find((item) => item.itemName.trim().toLowerCase() === itemName.trim().toLowerCase())?.category ?? "General Items";
}

function normalizeReportKey(value: string) {
  return value.trim().toLowerCase();
}

type ReportAccountMetadata = {
  id: string;
  name: string;
  nature: AccountNode["nature"];
  accountKind?: string;
  parentName: string;
  pathNames: string[];
  pathCodes: string[];
};

function buildReportAccountIndex(accountTree?: AccountNode[]) {
  const byId = new Map<string, ReportAccountMetadata>();
  const byLegacyName = new Map<string, ReportAccountMetadata[]>();

  const visit = (node: AccountNode, ancestors: AccountNode[]) => {
    const path = [...ancestors, node];
    if (node.level === "LEDGER") {
      const metadata: ReportAccountMetadata = {
        id: node.id,
        name: node.name,
        nature: node.nature,
        accountKind: node.bankDetails?.accountKind,
        parentName: ancestors.at(-1)?.name ?? "",
        pathNames: path.map((entry) => entry.name),
        pathCodes: path.map((entry) => entry.code),
      };
      byId.set(node.id, metadata);
      const nameKey = normalizeReportKey(node.name);
      byLegacyName.set(nameKey, [...(byLegacyName.get(nameKey) ?? []), metadata]);
    }
    node.children.forEach((child) => visit(child, path));
  };
  accountTree?.forEach((node) => visit(node, []));

  const resolve = (line: VoucherRecord["lines"][number]) => {
    // Once a posting carries accountId, its caption is only a historical label.
    // Never reinterpret an unknown/wrong id by matching that mutable caption.
    if (line.accountId) return byId.get(line.accountId);
    const candidates = byLegacyName.get(normalizeReportKey(line.ledger)) ?? [];
    return candidates.length === 1 ? candidates[0] : undefined;
  };

  return { byId, resolve };
}

function reportMoneyAccountType(account: ReportAccountMetadata | undefined): "CASH" | "BANK" | "MFS" | null {
  if (!account) return null;
  if (account.accountKind === "MFS" || account.pathCodes.includes("1222200")) return "MFS";
  if (account.accountKind === "BANK" || account.pathCodes.includes("1222100")) return "BANK";
  if (account.pathCodes.includes("1221000")) return "CASH";
  return null;
}

function isSalesReturnAccount(account: ReportAccountMetadata, allowLegacyCaption = false) {
  return account.pathCodes.includes("4120000")
    || account.pathCodes.includes("4120001")
    || (allowLegacyCaption && account.pathNames.some((name) => normalizeReportKey(name) === "sales return"));
}

function isSalesRevenueAccount(account: ReportAccountMetadata, allowLegacyCaption = false) {
  return !isSalesReturnAccount(account, allowLegacyCaption)
    && (account.pathCodes.includes("4110000")
      || account.pathCodes.includes("4110001")
      || (allowLegacyCaption && account.pathNames.some((name) => normalizeReportKey(name) === "sales accounts")));
}

function buildAccountBasedProfitAndLoss(
  vouchers: VoucherRecord[],
  accountIndex: ReturnType<typeof buildReportAccountIndex>,
) {
  let salesRevenue = 0;
  let salesReturns = 0;
  let inventoryCostOfGoodsSold = 0;
  let directExpenses = 0;
  let costOfGoodsSold = 0;
  let otherIncome = 0;
  let operatingExpenses = 0;
  const otherIncomeByAccount = new Map<string, { label: string; amount: number }>();
  const operatingExpenseByAccount = new Map<string, { label: string; amount: number }>();

  const addBreakdown = (
    totals: Map<string, { label: string; amount: number }>,
    account: ReportAccountMetadata,
    amount: number,
  ) => {
    const current = totals.get(account.id);
    totals.set(account.id, {
      label: account.name,
      amount: sumMoney([current?.amount ?? 0, amount]),
    });
  };

  vouchers.flatMap((voucher) => voucher.lines).forEach((line) => {
    const account = accountIndex.resolve(line);
    if (!account) return;
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    if (account.nature === "INCOME") {
      const allowLegacyCaption = !line.accountId;
      if (isSalesReturnAccount(account, allowLegacyCaption)) {
        salesReturns = sumMoney([salesReturns, debit - credit]);
      } else if (isSalesRevenueAccount(account, allowLegacyCaption)) {
        salesRevenue = sumMoney([salesRevenue, credit - debit]);
      } else {
        const amount = roundMoney(credit - debit);
        otherIncome = sumMoney([otherIncome, amount]);
        addBreakdown(otherIncomeByAccount, account, amount);
      }
      return;
    }

    if (account.nature === "DIRECT_EXPENSE") {
      const amount = roundMoney(debit - credit);
      costOfGoodsSold = sumMoney([costOfGoodsSold, amount]);
      if (account.pathCodes.includes("5110000") || account.pathCodes.includes("5110001")) {
        inventoryCostOfGoodsSold = sumMoney([inventoryCostOfGoodsSold, amount]);
      } else {
        directExpenses = sumMoney([directExpenses, amount]);
      }
      return;
    }

    if (account.nature === "INDIRECT_EXPENSE") {
      const amount = roundMoney(debit - credit);
      operatingExpenses = sumMoney([operatingExpenses, amount]);
      addBreakdown(operatingExpenseByAccount, account, amount);
    }
  });

  const toBreakdown = (totals: Map<string, { label: string; amount: number }>) => Array.from(totals.values())
    .filter((entry) => moneyToMinorUnits(entry.amount) !== 0)
    .sort((left, right) => right.amount - left.amount || left.label.localeCompare(right.label));

  return {
    salesRevenue,
    salesReturns,
    inventoryCostOfGoodsSold,
    directExpenses,
    costOfGoodsSold,
    purchaseReturnVariance: 0,
    otherIncome,
    operatingExpenses,
    otherIncomeBreakdown: toBreakdown(otherIncomeByAccount),
    operatingExpenseBreakdown: toBreakdown(operatingExpenseByAccount),
  };
}

function getVoucherLineValueFactor(voucher: VoucherRecord) {
  const grossLineValue = (voucher.inventoryItems ?? []).reduce(
    (total, item) => total + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );
  return grossLineValue > 0 ? Number(voucher.amount || 0) / grossLineValue : 1;
}

type VoucherInventoryCost = {
  total: number;
  byItemId: Map<string, number>;
  byItemName: Map<string, number>;
};

const SALES_ISSUE_MOVEMENT_TYPES = new Set(["SALES", "DELIVERY_NOTE"]);

type InventoryCostLookup = {
  voucherById: Map<string, VoucherRecord>;
  inventoryLineById: Map<string, InventoryVoucherItem>;
  movementByTransaction: Map<string, NonNullable<AppDataset["inventoryMovements"]>>;
  movementByTransactionLine: Map<string, NonNullable<AppDataset["inventoryMovements"]>>;
};

const inventoryCostLookupCache = new WeakMap<AppDataset, InventoryCostLookup>();

function getInventoryCostLookup(dataset: AppDataset) {
  const cached = inventoryCostLookupCache.get(dataset);
  if (cached) return cached;
  const lookup: InventoryCostLookup = {
    voucherById: new Map(dataset.vouchers.map((entry) => [entry.id, entry])),
    inventoryLineById: new Map(
      dataset.vouchers.flatMap((entry) => entry.inventoryItems ?? []).map((line) => [line.id, line]),
    ),
    movementByTransaction: new Map(),
    movementByTransactionLine: new Map(),
  };
  (dataset.inventoryMovements ?? []).forEach((movement) => {
    const current = lookup.movementByTransaction.get(movement.transactionId) ?? [];
    current.push(movement);
    lookup.movementByTransaction.set(movement.transactionId, current);
    const byLine = lookup.movementByTransactionLine.get(movement.transactionLineId) ?? [];
    byLine.push(movement);
    lookup.movementByTransactionLine.set(movement.transactionLineId, byLine);
  });
  inventoryCostLookupCache.set(dataset, lookup);
  return lookup;
}

function addInventoryCost(
  breakdown: VoucherInventoryCost,
  item: { inventoryItemId?: string | null; itemName: string },
  value: number,
) {
  breakdown.total = sumMoney([breakdown.total, value]);
  if (item.inventoryItemId) {
    breakdown.byItemId.set(item.inventoryItemId, sumMoney([breakdown.byItemId.get(item.inventoryItemId) ?? 0, value]));
  }
  const nameKey = normalizeReportKey(item.itemName);
  breakdown.byItemName.set(nameKey, sumMoney([breakdown.byItemName.get(nameKey) ?? 0, value]));
}

function getInventoryItemCost(breakdown: VoucherInventoryCost, item: { inventoryItemId?: string | null; itemName: string }) {
  if (item.inventoryItemId && breakdown.byItemId.has(item.inventoryItemId)) {
    return breakdown.byItemId.get(item.inventoryItemId) ?? 0;
  }
  return breakdown.byItemName.get(normalizeReportKey(item.itemName)) ?? 0;
}

function consumeInventoryItemCost(breakdown: VoucherInventoryCost, item: { inventoryItemId?: string | null; itemName: string }) {
  const value = getInventoryItemCost(breakdown, item);
  if (item.inventoryItemId) breakdown.byItemId.delete(item.inventoryItemId);
  breakdown.byItemName.delete(normalizeReportKey(item.itemName));
  return value;
}

function getVoucherSourceChain(dataset: AppDataset, voucher: VoucherRecord) {
  const { voucherById } = getInventoryCostLookup(dataset);
  const chain: VoucherRecord[] = [voucher];
  const visited = new Set([voucher.id]);
  let sourceId = voucher.sourceVoucherId;
  while (sourceId && !visited.has(sourceId)) {
    visited.add(sourceId);
    const source = voucherById.get(sourceId);
    if (!source) break;
    chain.push(source);
    sourceId = source.sourceVoucherId;
  }
  return chain;
}

function getInventoryLineSourceIds(dataset: AppDataset, item: InventoryVoucherItem) {
  const { inventoryLineById } = getInventoryCostLookup(dataset);
  const ids = new Set<string>();
  let lineId: string | null | undefined = item.id;
  while (lineId && !ids.has(lineId)) {
    ids.add(lineId);
    const sourceLine: InventoryVoucherItem | undefined = lineId === item.id ? item : inventoryLineById.get(lineId);
    lineId = sourceLine?.sourceInventoryLineId;
  }
  return ids;
}

/**
 * Returns the inventory cost attached to a sale or sales return. API datasets
 * use the persisted MWA movement feed. A sales invoice can either own its OUT
 * movement or point at the delivery note that moved stock, so the full source
 * chain is checked and the first physical movement is used. Demo data has no
 * costed movement feed and therefore falls back to the historical stock rate
 * immediately before the physical document date (never the final/current rate).
 */
export function getVoucherInventoryCost(dataset: AppDataset, voucher: VoucherRecord): VoucherInventoryCost {
  const breakdown: VoucherInventoryCost = { total: 0, byItemId: new Map(), byItemName: new Map() };
  const sourceChain = getVoucherSourceChain(dataset, voucher);
  const isSalesReturn = voucher.voucherType === "credit-note";
  const isPurchaseReturn = voucher.voucherType === "debit-note";

  if (dataset.inventoryMovements !== undefined) {
    const movementType = isSalesReturn ? "IN" : "OUT";
    const allowedTypes = isSalesReturn
      ? new Set(["CREDIT_NOTE"])
      : isPurchaseReturn
        ? new Set(["DEBIT_NOTE"])
        : SALES_ISSUE_MOVEMENT_TYPES;
    const { movementByTransaction, movementByTransactionLine } = getInventoryCostLookup(dataset);
    const unmatchedItems: InventoryVoucherItem[] = [];

    // Resolve every invoice/return row independently through its own immutable
    // source-line chain. Header sourceVoucherId only represents the first note
    // when one invoice combines several Delivery Notes, so it cannot be the
    // costing authority. The same physical source movement may legitimately
    // price several partial invoice rows; quantity is applied per target row.
    (voucher.inventoryItems ?? []).forEach((item) => {
      const sourceLineIds = [...getInventoryLineSourceIds(dataset, item)];
      const movement = sourceLineIds
        .flatMap((lineId) => movementByTransactionLine.get(lineId) ?? [])
        .find((entry) => entry.movementType === movementType && allowedTypes.has(entry.transactionType));
      if (!movement) {
        unmatchedItems.push(item);
        return;
      }
      addInventoryCost(breakdown, item, Number(item.quantity || 0) * Number(movement.unitCost || 0));
    });
    if (unmatchedItems.length === 0) return breakdown;

    // Compatibility for legacy rows created before sourceInventoryLineId was
    // stored. Limit fallback matching to the header chain and consume each
    // movement once; modern exact-line matches above never guess by caption.
    const fallbackMovements = sourceChain.flatMap((candidate) =>
      (movementByTransaction.get(candidate.id) ?? [])
        .filter((movement) => movement.movementType === movementType && allowedTypes.has(movement.transactionType)),
    );
    const usedFallbackMovementIds = new Set<string>();
    let fallbackMatches = 0;
    unmatchedItems.forEach((item) => {
      const movement = fallbackMovements.find((entry) =>
        !usedFallbackMovementIds.has(entry.id) &&
        (Boolean(item.inventoryItemId) && entry.inventoryItemId === item.inventoryItemId ||
          normalizeReportKey(entry.itemName) === normalizeReportKey(item.itemName)),
      );
      if (!movement) return;
      usedFallbackMovementIds.add(movement.id);
      fallbackMatches += 1;
      addInventoryCost(breakdown, item, Number(item.quantity || 0) * Number(movement.unitCost || 0));
    });

    // Old aggregate-only feeds can have neither target nor source line ids. If
    // no row could be matched at all, preserve their authoritative total rather
    // than manufacturing a current-price estimate.
    if (breakdown.total === 0 && fallbackMatches === 0 && fallbackMovements.length > 0) {
      fallbackMovements.forEach((movement) => addInventoryCost(breakdown, movement, Number(movement.movementValue || 0)));
    }
    return breakdown;
  }

  const physicalVoucher = sourceChain.find((entry) => entry.documentKind === "delivery-note")
    ?? (isSalesReturn ? sourceChain.find(isRealSalesInvoice) : undefined)
    ?? voucher;
  const historicalStock = getInventoryOptionsBefore(dataset, voucher.workspaceId, physicalVoucher.voucherDate);
  (voucher.inventoryItems ?? []).forEach((item) => {
    const rate = historicalStock.find((stockItem) => normalizeReportKey(stockItem.itemName) === normalizeReportKey(item.itemName))?.rate ?? 0;
    addInventoryCost(breakdown, item, Number(item.quantity || 0) * rate);
  });
  return breakdown;
}

function getLoanRows(mode: DataMode, workspaceId: string): LoanStatementRow[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(`bizovix:loan-accounts:${mode}:${workspaceId}`);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<{
      accountName: string;
      lenderBank: string;
      transactions?: Array<{
        type: string;
        date: string;
        principal: number;
        interestAndCharges: number;
        totalAmount: number;
      }>;
    }>;

    return parsed.flatMap((account) =>
      (account.transactions ?? []).map((transaction) => ({
        accountName: account.accountName,
        lender: account.lenderBank,
        type: transaction.type,
        date: transaction.date,
        principal: Number(transaction.principal || 0),
        charges: Number(transaction.interestAndCharges || 0),
        total: Number(transaction.totalAmount || 0),
      })),
    );
  } catch {
    return [];
  }
}

function getChequeRows(mode: DataMode, workspaceId: string): ChequeReportRow[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(`bizovix:cheques:${mode}:${workspaceId}`);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<{
      chequeNo?: string;
      bankAccount?: string;
      payee?: string;
      amount?: number;
      issueDate?: string;
      dueDate?: string;
      status?: string;
      direction?: string;
    }>;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((cheque) => ({
      chequeNo: String(cheque.chequeNo ?? ""),
      bankAccount: String(cheque.bankAccount ?? ""),
      payee: String(cheque.payee ?? ""),
      amount: Number(cheque.amount || 0),
      issueDate: String(cheque.issueDate ?? ""),
      dueDate: String(cheque.dueDate ?? ""),
      status: String(cheque.status ?? ""),
      direction: String(cheque.direction ?? ""),
    }));
  } catch {
    return [];
  }
}

export function buildReportView({
  slug,
  dataset,
  workspaceId,
  fromDate,
  toDate,
  loanRows,
  chequeRows,
  auditRows,
  warehouseStockRows,
  warehouseTotalCount = 0,
  selectedLoanAccount,
  accountTree,
  selectedGeneralLedger,
  selectedGeneralLedgerName,
  bankAccountNames = [],
  mfsAccountNames = [],
  selectedBankAccount = "",
  selectedMfsAccount = "",
  registerPartyFilter = "all",
  selectedComparisonCustomerId = "",
  selectedComparisonSupplierId = "",
  billTypeFilter = "all",
  billStatusFilter = "all",
  cashFlowChannel = "all",
  deadStockMonths = 12,
}: {
  slug: string;
  dataset: AppDataset;
  workspaceId: string;
  fromDate: string;
  toDate: string;
  loanRows: LoanStatementRow[];
  chequeRows: ChequeReportRow[];
  auditRows: AuditReportRow[];
  warehouseStockRows: WarehouseStockRow[];
  /** Every warehouse in the workspace, including the ones holding no stock. */
  warehouseTotalCount?: number;
  selectedLoanAccount: string;
  accountTree?: AccountNode[];
  selectedGeneralLedger?: string;
  selectedGeneralLedgerName?: string;
  bankAccountNames?: string[];
  mfsAccountNames?: string[];
  selectedBankAccount?: string;
  selectedMfsAccount?: string;
  registerPartyFilter?: string;
  selectedComparisonCustomerId?: string;
  selectedComparisonSupplierId?: string;
  billTypeFilter?: "all" | "purchase" | "sales";
  billStatusFilter?: "all" | "live" | "closed";
  cashFlowChannel?: CashFlowChannel;
  deadStockMonths?: number;
}): ReportView {
  if (slug === "chart-of-accounts") {
    // Chart of Accounts is a management interface, not a printable report — it
    // renders its own dedicated panel (see the ChartOfAccountsPanel branch in the
    // main render) and reads live from the real accounts API, not this dataset.
    return { kind: "table", title: "Chart of Accounts", description: "", columns: [], rows: [], summary: [], emptyMessage: "" };
  }

  const allWorkspaceVouchers = dataset.vouchers
    .filter((voucher) => voucher.workspaceId === workspaceId && isLiveVoucher(voucher));
  const vouchers = allWorkspaceVouchers
    .filter((voucher) => voucher.voucherDate >= fromDate && voucher.voucherDate <= toDate)
    .sort((left, right) => {
      if (left.voucherDate === right.voucherDate) {
        return left.voucherNumber.localeCompare(right.voucherNumber);
      }

      return left.voucherDate.localeCompare(right.voucherDate);
    });
  const allWorkspaceAccountingVouchers = dataset.vouchers
    .filter((voucher) => voucher.workspaceId === workspaceId && isAccountingVoucher(voucher));
  const accountingVouchers = allWorkspaceAccountingVouchers
    .filter((voucher) => voucher.voucherDate >= fromDate && voucher.voucherDate <= toDate)
    .sort((left, right) => {
      if (left.voucherDate === right.voucherDate) {
        return left.voucherNumber.localeCompare(right.voucherNumber);
      }
      return left.voucherDate.localeCompare(right.voucherDate);
    });
  const parties = dataset.parties.filter((party) => party.workspaceId === workspaceId && party.status === "active");
  const stockItems = getInventoryOptionsAsOf(dataset, workspaceId, toDate);
  const findInventoryItemId = (itemCode?: string, itemName?: string) => dataset.stockItems.find((item) =>
    item.workspaceId === workspaceId
    && ((itemCode && item.itemCode === itemCode) || (itemName && normalizeReportKey(item.itemName) === normalizeReportKey(itemName))),
  )?.id ?? "";
  const trialBalanceRows = getTrialBalanceRows(
    dataset,
    workspaceId,
    slug === "trial-balance" ? fromDate : undefined,
    slug === "trial-balance" || slug === "balance-sheet" ? toDate : undefined,
  );
  const openingStock = sumMoney(getInventoryOptionsBefore(dataset, workspaceId, fromDate)
    .map((item) => item.qty * item.rate));
  const closingStock = sumMoney(getInventoryOptionsAsOf(dataset, workspaceId, toDate)
    .map((item) => item.qty * item.rate));

  const salesAmount = sumRealSalesInvoiceAmount(vouchers);
  const purchaseAmount = sumVoucherAmount(vouchers, ["purchase"]);
  const expenseAmount = sumVoucherAmount(vouchers, ["expense"]);
  const creditNoteAmount = sumVoucherAmount(vouchers, ["credit-note"]);
  const debitNoteAmount = sumVoucherAmount(vouchers, ["debit-note"]);
  const indirectIncome = sumVoucherAmount(vouchers, ["revenue"]);
  const receipts = sumVoucherAmount(vouchers, ["receipt"]);
  const payments = sumVoucherAmount(vouchers, ["payment"]);
  const accountIndex = buildReportAccountIndex(accountTree);
  const useAccountBasedProfitAndLoss = Boolean(accountTree?.length);
  const accountBasedPeriodProfit = buildAccountBasedProfitAndLoss(accountingVouchers, accountIndex);
  const directExpenses = useAccountBasedProfitAndLoss ? accountBasedPeriodProfit.directExpenses : 0;
  const legacyInventoryCostOfGoodsSold = sumMoney(vouchers.map((voucher) => {
    if (isRealSalesInvoice(voucher)) return getVoucherInventoryCost(dataset, voucher).total;
    if (voucher.voucherType === "credit-note" && !isReversalArtifact(voucher)) return -getVoucherInventoryCost(dataset, voucher).total;
    return 0;
  }));
  const costOfGoodsSold = useAccountBasedProfitAndLoss
    ? accountBasedPeriodProfit.costOfGoodsSold
    : legacyInventoryCostOfGoodsSold;
  const operatingExpenses = useAccountBasedProfitAndLoss
    ? accountBasedPeriodProfit.operatingExpenses
    : expenseAmount;

  // Mock/offline data can pre-date the COA endpoint. Its caption fallback is
  // deliberately isolated here and never runs when authoritative IDs exist.
  const buildLegacyLedgerBreakdown = (
    voucherType: VoucherType,
    signedAmount: (line: { debit: number; credit: number }) => number,
  ) => {
    const totals = new Map<string, number>();
    vouchers
      .filter((voucher) => voucher.voucherType === voucherType && !isReversalArtifact(voucher))
      .flatMap((voucher) => voucher.lines)
      .filter((line) => !line.accountId)
      .forEach((line) => {
        const net = roundMoney(signedAmount({ debit: Number(line.debit || 0), credit: Number(line.credit || 0) }));
        totals.set(line.ledger, sumMoney([totals.get(line.ledger) ?? 0, net]));
      });
    return Array.from(totals.entries())
      .filter(([, amount]) => moneyToMinorUnits(amount) !== 0)
      .map(([label, amount]) => ({ label, amount }))
      .sort((left, right) => right.amount - left.amount);
  };
  const reconcileBreakdown = (rows: Array<{ label: string; amount: number }>, headlineTotal: number) => {
    const remainder = roundMoney(headlineTotal - sumMoney(rows.map((row) => row.amount)));
    return moneyToMinorUnits(remainder) !== 0 ? [...rows, { label: "Other / Unclassified", amount: remainder }] : rows;
  };
  const otherIncomeTotal = useAccountBasedProfitAndLoss ? accountBasedPeriodProfit.otherIncome : indirectIncome;
  const otherIncomeBreakdown = useAccountBasedProfitAndLoss
    ? accountBasedPeriodProfit.otherIncomeBreakdown
    : reconcileBreakdown(buildLegacyLedgerBreakdown("revenue", ({ debit, credit }) => credit - debit), otherIncomeTotal);
  const operatingExpenseBreakdown = useAccountBasedProfitAndLoss
    ? accountBasedPeriodProfit.operatingExpenseBreakdown
    : reconcileBreakdown(buildLegacyLedgerBreakdown("expense", ({ debit, credit }) => debit - credit), operatingExpenses);
  // The COGS drill-down proves the headline figure the way a ledger does — with
  // the trading formula (Opening Stock + Purchases − Purchase Returns + Direct
  // Expenses − Closing Stock) rather than an item list. This app values stock
  // perpetually at Moving Weighted Average, so the periodic formula will not
  // land exactly on the MWA figure whenever stock was written off, revalued or
  // adjusted outside a sale. The gap is shown as its own explicit line instead
  // of being hidden, so the column always foots to the real COGS above.
  const cogsFormula: FormulaLine[] = (() => {
    // Opening and Closing Stock always print — they are the two anchors of the
    // formula, so a zero there is itself the answer ("no stock was carried"),
    // not an empty row worth hiding. The middle lines only print when non-zero.
    const lines: FormulaLine[] = [
      { label: `Opening Stock (as on ${formatDate(fromDate)})`, amount: openingStock },
      ...[
        { label: "Add: Purchases", amount: purchaseAmount },
        { label: "Less: Purchase Returns", amount: -debitNoteAmount },
        { label: "Add: Direct Expenses", amount: directExpenses },
      ].filter((line) => moneyToMinorUnits(line.amount) !== 0),
      { label: `Less: Closing Stock (as on ${formatDate(toDate)})`, amount: -closingStock },
    ];
    const variance = roundMoney(costOfGoodsSold - sumMoney(lines.map((line) => line.amount)));
    if (moneyToMinorUnits(variance) !== 0) {
      lines.push({ label: "Inventory Adjustments / MWA Valuation Difference", amount: variance });
    }
    return [...lines, { label: "Cost of Goods Sold", amount: costOfGoodsSold, total: true }];
  })();
  const legacyPurchaseReturnInventoryRelief = sumMoney(vouchers
    .filter((voucher) => voucher.voucherType === "debit-note" && !isReversalArtifact(voucher))
    .map((voucher) => getVoucherInventoryCost(dataset, voucher).total));
  const purchaseReturnVariance = useAccountBasedProfitAndLoss
    ? accountBasedPeriodProfit.purchaseReturnVariance
    : roundMoney(debitNoteAmount - legacyPurchaseReturnInventoryRelief);
  const profitAndLoss = calculateProfitAndLoss({
    salesRevenue: useAccountBasedProfitAndLoss ? accountBasedPeriodProfit.salesRevenue : salesAmount,
    salesReturns: useAccountBasedProfitAndLoss ? accountBasedPeriodProfit.salesReturns : creditNoteAmount,
    costOfGoodsSold,
    purchaseReturnVariance,
    otherIncome: otherIncomeTotal,
    operatingExpenses,
  });
  const { grossProfit, netProfit } = profitAndLoss;
  const financialYearStart = getFinancialYearStart(toDate);
  const currentYearVouchers = allWorkspaceVouchers.filter(
    (voucher) => voucher.voucherDate >= financialYearStart && voucher.voucherDate <= toDate,
  );
  const currentYearAccountingVouchers = allWorkspaceAccountingVouchers.filter(
    (voucher) => voucher.voucherDate >= financialYearStart && voucher.voucherDate <= toDate,
  );
  const currentYearAccountBasedProfit = buildAccountBasedProfitAndLoss(currentYearAccountingVouchers, accountIndex);
  const currentYearSales = sumRealSalesInvoiceAmount(currentYearVouchers);
  const currentYearSalesReturns = sumVoucherAmount(currentYearVouchers, ["credit-note"]);
  const currentYearCostOfGoodsSold = sumMoney(currentYearVouchers.map((voucher) => {
    if (isRealSalesInvoice(voucher)) return getVoucherInventoryCost(dataset, voucher).total;
    if (voucher.voucherType === "credit-note" && !isReversalArtifact(voucher)) return -getVoucherInventoryCost(dataset, voucher).total;
    return 0;
  }));
  const currentYearPurchaseReturnAmount = sumVoucherAmount(currentYearVouchers, ["debit-note"]);
  const currentYearPurchaseReturnInventoryRelief = sumMoney(currentYearVouchers
    .filter((voucher) => voucher.voucherType === "debit-note" && !isReversalArtifact(voucher))
    .map((voucher) => getVoucherInventoryCost(dataset, voucher).total));
  const currentYearPurchaseReturnVariance = roundMoney(currentYearPurchaseReturnAmount - currentYearPurchaseReturnInventoryRelief);
  const currentYearProfit = calculateProfitAndLoss({
    salesRevenue: useAccountBasedProfitAndLoss ? currentYearAccountBasedProfit.salesRevenue : currentYearSales,
    salesReturns: useAccountBasedProfitAndLoss ? currentYearAccountBasedProfit.salesReturns : currentYearSalesReturns,
    costOfGoodsSold: useAccountBasedProfitAndLoss ? currentYearAccountBasedProfit.costOfGoodsSold : currentYearCostOfGoodsSold,
    purchaseReturnVariance: useAccountBasedProfitAndLoss ? 0 : currentYearPurchaseReturnVariance,
    otherIncome: useAccountBasedProfitAndLoss ? currentYearAccountBasedProfit.otherIncome : sumVoucherAmount(currentYearVouchers, ["revenue"]),
    operatingExpenses: useAccountBasedProfitAndLoss
      ? currentYearAccountBasedProfit.operatingExpenses
      : sumVoucherAmount(currentYearVouchers, ["expense"]),
  }).netProfit;
  const netSalesAmount = profitAndLoss.netSales;
  const reportLabel = reportCatalog.find((item) => item.slug === slug)?.label ?? "Report";
  const receivablesOutstanding = Math.max(
    0,
    sumMoney(trialBalanceRows
      .filter((row) => row.group === "Sundry Debtors")
      .map((row) => roundMoney(row.debit - row.credit))),
  );
  const payablesOutstanding = Math.max(
    0,
    sumMoney(trialBalanceRows
      .filter((row) => row.group === "Sundry Creditors")
      .map((row) => roundMoney(row.credit - row.debit))),
  );
  const cashOnHand = Math.max(
    0,
    sumMoney(trialBalanceRows
      .filter((row) => row.group === "Cash-in-Hand")
      .map((row) => roundMoney(row.debit - row.credit))),
  );
  const bankBalance = Math.max(
    0,
    sumMoney(trialBalanceRows
      .filter((row) => row.group === "Bank Accounts")
      .map((row) => roundMoney(row.debit - row.credit))),
  );
  const totalDebt = sumMoney([payablesOutstanding, ...loanRows.map((row) => row.total)]);
  const currentAssets = sumMoney([receivablesOutstanding, cashOnHand, bankBalance, closingStock]);
  const currentLiabilities = Math.max(payablesOutstanding, 1);
  const totalAssetsBase = Math.max(currentAssets, 1);
  const ownerEquityBase = Math.max(totalAssetsBase - totalDebt, 1);
  const averageInventory = Math.max((openingStock + closingStock) / 2, 1);

  if (slug === "customer-supplier-comparison") {
    const columns = [
      "Date",
      "Voucher",
      "Transaction",
      "Party",
      "Sales",
      "Sales Return",
      "Collection",
      "Purchase",
      "Purchase Return",
      "Payment",
      "Customer Due",
      "Supplier Due",
      "Net Position",
    ];
    const customer = dataset.parties.find(
      (party) => party.workspaceId === workspaceId && party.type === "customer" && party.id === selectedComparisonCustomerId,
    );
    const supplier = dataset.parties.find(
      (party) => party.workspaceId === workspaceId && party.type === "supplier" && party.id === selectedComparisonSupplierId,
    );

    if (!customer || !supplier) {
      const missingSelection = !customer && !supplier
        ? "Select one customer and one supplier to build the comparison."
        : !customer
          ? "Select a customer to complete the comparison."
          : "Select a supplier to complete the comparison.";
      return {
        kind: "table",
        title: reportLabel,
        description: "Compare a customer account and a supplier account by their stable party IDs, without merging same-named ledgers.",
        columns,
        rows: [],
        summary: [],
        emptyMessage: missingSelection,
      };
    }

    type ComparisonEvent = {
      voucher: VoucherRecord;
      role: "customer" | "supplier";
      transaction: string;
      sales: number;
      salesReturn: number;
      collection: number;
      purchase: number;
      purchaseReturn: number;
      payment: number;
      customerDelta: number;
      supplierDelta: number;
    };

    const isComparisonSalesInvoice = (voucher: VoucherRecord) => voucher.voucherType === "sales"
      && !NON_INVOICE_SALES_DOCUMENT_KINDS.has(voucher.documentKind ?? "");
    const isComparisonPurchaseBill = (voucher: VoucherRecord) => voucher.voucherType === "purchase"
      && (voucher.documentKind == null || voucher.documentKind === "bill");
    const signedDocumentAmount = (voucher: VoucherRecord) => roundMoney(
      (isReversalArtifact(voucher) ? -1 : 1) * Number(voucher.amount || 0),
    );
    const moneyMovement = (voucher: VoucherRecord, direction: "in" | "out") => sumMoney(
      voucher.lines
        .filter((line) => Boolean(getCashFlowLineChannel(
          line,
          bankAccountNames,
          mfsAccountNames,
          accountIndex.resolve,
        )))
        .map((line) => direction === "in"
          ? roundMoney(Number(line.debit || 0) - Number(line.credit || 0))
          : roundMoney(Number(line.credit || 0) - Number(line.debit || 0))),
    );
    const partyDelta = (voucher: VoucherRecord, role: "customer" | "supplier") => {
      const movement = getPartyLedgerMovement(voucher, role === "customer" ? customer : supplier);
      return {
        hasPosting: movement.hasPosting,
        delta: roundMoney(role === "customer"
          ? movement.debit - movement.credit
          : movement.credit - movement.debit),
      };
    };
    const openingCustomerBalance = sumMoney(
      allWorkspaceAccountingVouchers
        .filter((voucher) => voucher.voucherDate < fromDate && voucherBelongsToParty(voucher, customer))
        .map((voucher) => partyDelta(voucher, "customer").delta),
    );
    const openingSupplierBalance = sumMoney(
      allWorkspaceAccountingVouchers
        .filter((voucher) => voucher.voucherDate < fromDate && voucherBelongsToParty(voucher, supplier))
        .map((voucher) => partyDelta(voucher, "supplier").delta),
    );
    const buildComparisonEvent = (
      voucher: VoucherRecord,
      role: "customer" | "supplier",
    ): ComparisonEvent | null => {
      const party = role === "customer" ? customer : supplier;
      if (!voucherBelongsToParty(voucher, party)) return null;

      const documentAmount = signedDocumentAmount(voucher);
      const isSales = role === "customer" && isComparisonSalesInvoice(voucher);
      const isSalesReturn = role === "customer" && voucher.voucherType === "credit-note";
      const isPurchase = role === "supplier" && isComparisonPurchaseBill(voucher);
      const isPurchaseReturn = role === "supplier" && voucher.voucherType === "debit-note";
      const canCollect = role === "customer"
        && (isSales || isSalesReturn || voucher.voucherType === "receipt");
      const canPay = role === "supplier"
        && (isPurchase || isPurchaseReturn || voucher.voucherType === "payment");
      const collection = canCollect ? moneyMovement(voucher, "in") : 0;
      const payment = canPay ? moneyMovement(voucher, "out") : 0;
      const movement = partyDelta(voucher, role);
      const values = {
        sales: isSales ? documentAmount : 0,
        salesReturn: isSalesReturn ? documentAmount : 0,
        collection,
        purchase: isPurchase ? documentAmount : 0,
        purchaseReturn: isPurchaseReturn ? documentAmount : 0,
        payment,
      };
      const hasMetric = Object.values(values).some((value) => moneyToMinorUnits(value) !== 0);
      if (!hasMetric && (!movement.hasPosting || moneyToMinorUnits(movement.delta) === 0)) return null;

      const labels: string[] = [];
      if (isSales) labels.push("Sales");
      if (isSalesReturn) labels.push("Sales Return");
      if (isPurchase) labels.push("Purchase");
      if (isPurchaseReturn) labels.push("Purchase Return");
      if (voucher.voucherType === "receipt") labels.push("Customer Collection");
      else if (moneyToMinorUnits(collection) > 0) labels.push("Customer Collection");
      else if (moneyToMinorUnits(collection) < 0) labels.push("Customer Refund");
      if (voucher.voucherType === "payment") labels.push("Supplier Payment");
      else if (moneyToMinorUnits(payment) > 0) labels.push("Supplier Payment");
      else if (moneyToMinorUnits(payment) < 0) labels.push("Supplier Refund");
      if (!labels.length) labels.push(`${role === "customer" ? "Customer" : "Supplier"} Adjustment`);
      const label = [...new Set(labels)].join(" + ");

      return {
        voucher,
        role,
        transaction: isReversalArtifact(voucher) ? `Reversal · ${label}` : label,
        ...values,
        customerDelta: role === "customer" ? movement.delta : 0,
        supplierDelta: role === "supplier" ? movement.delta : 0,
      };
    };
    const comparisonEvents = accountingVouchers
      .flatMap((voucher) => [
        buildComparisonEvent(voucher, "customer"),
        buildComparisonEvent(voucher, "supplier"),
      ])
      .filter((event): event is ComparisonEvent => Boolean(event))
      .sort((left, right) =>
        left.voucher.voucherDate.localeCompare(right.voucher.voucherDate)
        || left.voucher.createdAt.localeCompare(right.voucher.createdAt)
        || left.voucher.voucherNumber.localeCompare(right.voucher.voucherNumber, undefined, { numeric: true })
        || left.role.localeCompare(right.role)
        || left.voucher.id.localeCompare(right.voucher.id));
    const totals = comparisonEvents.reduce(
      (result, event) => ({
        sales: sumMoney([result.sales, event.sales]),
        salesReturn: sumMoney([result.salesReturn, event.salesReturn]),
        collection: sumMoney([result.collection, event.collection]),
        purchase: sumMoney([result.purchase, event.purchase]),
        purchaseReturn: sumMoney([result.purchaseReturn, event.purchaseReturn]),
        payment: sumMoney([result.payment, event.payment]),
      }),
      { sales: 0, salesReturn: 0, collection: 0, purchase: 0, purchaseReturn: 0, payment: 0 },
    );
    let customerBalance = openingCustomerBalance;
    let supplierBalance = openingSupplierBalance;
    const amountCell = (value: number) => moneyToMinorUnits(value) === 0 ? "-" : formatReportAmount(value);
    const openingRow: Record<string, string> = {
      Date: formatDate(fromDate),
      Voucher: "B/F",
      Transaction: "Opening Balance",
      Party: `${customer.name} ↔ ${supplier.name}`,
      Sales: "-",
      "Sales Return": "-",
      Collection: "-",
      Purchase: "-",
      "Purchase Return": "-",
      Payment: "-",
      "Customer Due": formatReportAmount(customerBalance),
      "Supplier Due": formatReportAmount(supplierBalance),
      "Net Position": formatReportAmount(roundMoney(customerBalance - supplierBalance)),
    };
    const transactionRows = comparisonEvents.map((event) => {
      customerBalance = sumMoney([customerBalance, event.customerDelta]);
      supplierBalance = sumMoney([supplierBalance, event.supplierDelta]);
      const party = event.role === "customer" ? customer : supplier;
      return {
        Date: formatDate(event.voucher.voucherDate),
        Voucher: event.voucher.voucherNumber,
        Transaction: event.transaction,
        Party: `${event.role === "customer" ? "Customer" : "Supplier"} · ${party.name}`,
        Sales: amountCell(event.sales),
        "Sales Return": amountCell(event.salesReturn),
        Collection: amountCell(event.collection),
        Purchase: amountCell(event.purchase),
        "Purchase Return": amountCell(event.purchaseReturn),
        Payment: amountCell(event.payment),
        "Customer Due": formatReportAmount(customerBalance),
        "Supplier Due": formatReportAmount(supplierBalance),
        "Net Position": formatReportAmount(roundMoney(customerBalance - supplierBalance)),
        _voucherId: event.voucher.id,
      };
    });
    const closingRow: Record<string, string> = {
      Date: formatDate(toDate),
      Voucher: "C/F",
      Transaction: "Closing Balance",
      Party: `${customer.name} ↔ ${supplier.name}`,
      Sales: "-",
      "Sales Return": "-",
      Collection: "-",
      Purchase: "-",
      "Purchase Return": "-",
      Payment: "-",
      "Customer Due": formatReportAmount(customerBalance),
      "Supplier Due": formatReportAmount(supplierBalance),
      "Net Position": formatReportAmount(roundMoney(customerBalance - supplierBalance)),
    };
    const hasOpeningBalance = moneyToMinorUnits(openingCustomerBalance) !== 0 || moneyToMinorUnits(openingSupplierBalance) !== 0;

    return {
      kind: "table",
      title: reportLabel,
      description: `${customer.name} (Customer) and ${supplier.name} (Supplier), combined by transaction date. Net Position = Customer Due − Supplier Due; it is informational and does not post a set-off entry. Select a voucher row for its items, references and ledger split.`,
      columns,
      rows: comparisonEvents.length || hasOpeningBalance ? [openingRow, ...transactionRows, closingRow] : [],
      summary: [
        { label: "Sales", value: formatReportAmount(totals.sales), tone: "green" },
        { label: "Purchase", value: formatReportAmount(totals.purchase), tone: "orange" },
        { label: "Sales Return", value: formatReportAmount(totals.salesReturn), tone: "red" },
        { label: "Purchase Return", value: formatReportAmount(totals.purchaseReturn), tone: "blue" },
        { label: "Net Collection", value: formatReportAmount(totals.collection), tone: "green" },
        { label: "Net Payment", value: formatReportAmount(totals.payment), tone: "orange" },
      ],
      emptyMessage: `No posted customer/supplier activity found between ${formatDate(fromDate)} and ${formatDate(toDate)}.`,
    };
  }

  const transactionRegisterMeta: Partial<
    Record<
      string,
      {
        voucherTypes: VoucherType[];
        partyLabel: string;
        totalLabel: string;
        tone: NonNullable<ReportSummaryChip["tone"]>;
      }
    >
  > = {
    "sales-register": { voucherTypes: ["sales"], partyLabel: "Customer", totalLabel: "Total Sales", tone: "green" },
    "purchase-register": { voucherTypes: ["purchase"], partyLabel: "Supplier", totalLabel: "Total Purchase", tone: "orange" },
    "receipt-register": { voucherTypes: ["receipt"], partyLabel: "From", totalLabel: "Total Receipts", tone: "green" },
    "payment-register": { voucherTypes: ["payment"], partyLabel: "To", totalLabel: "Total Payments", tone: "orange" },
    "sales-return-register": { voucherTypes: ["credit-note"], partyLabel: "Customer", totalLabel: "Total Returns", tone: "red" },
    "purchase-return-register": { voucherTypes: ["debit-note"], partyLabel: "Supplier", totalLabel: "Total Returns", tone: "blue" },
  };

  const transactionMeta = transactionRegisterMeta[slug];
  if (transactionMeta) {
    // Purchase/Purchase Return are ledgers (running balance), not just flat
    // registers — everything else in this shared block stays a plain list.
    const isLedgerStyleRegister = slug === "purchase-register" || slug === "purchase-return-register";
    const matchesRegister = (voucher: VoucherRecord) =>
      transactionMeta.voucherTypes.includes(voucher.voucherType)
      // The Sales Register is a financial register — a Quotation/Sale Order/
      // Delivery Note has no accounting effect yet, so it must not appear here
      // even though it shares voucherType "sales" with a real Invoice.
      && (slug === "sales-register" ? isRealSalesInvoice(voucher) : true)
      // Purchase Orders and Receipt Notes are workflow documents, not purchases.
      // Only a direct/legacy bill or a bill raised from a Receipt Note belongs in
      // the Purchase Register.
      && (slug === "purchase-register" ? (voucher.documentKind == null || voucher.documentKind === "bill") : true)
      && voucher.status !== "cancelled"
      && (registerPartyFilter === "all" || voucher.partyName === registerPartyFilter);

    const registerVouchers = vouchers.filter(matchesRegister);
    const registerTotal = sumMoney(registerVouchers.map((voucher) => Number(voucher.amount || 0)));

    const openingRegisterBalance = isLedgerStyleRegister
      ? sumMoney(allWorkspaceVouchers.filter((voucher) => voucher.voucherDate < fromDate).filter(matchesRegister)
          .map((voucher) => Number(voucher.amount || 0)))
      : 0;
    let runningRegisterBalance = openingRegisterBalance;

    const filteredRows: Array<Record<string, string>> = [];
    if (isLedgerStyleRegister && moneyToMinorUnits(openingRegisterBalance) !== 0) {
      filteredRows.push({
        Date: formatDate(fromDate),
        Voucher: "B/F",
        [transactionMeta.partyLabel]: "-",
        ...(slug === "purchase-register" ? { Type: "-" } : {}),
        Amount: "-",
        Balance: formatReportAmount(openingRegisterBalance),
        Status: "-",
      });
    }
    registerVouchers.forEach((voucher) => {
      if (isLedgerStyleRegister) runningRegisterBalance = sumMoney([runningRegisterBalance, Number(voucher.amount || 0)]);
      const inventoryItems = voucher.inventoryItems ?? [];
      const itemsSummary = inventoryItems
        .map((item) => `${item.itemName} x${formatNumber(Number(item.quantity || 0))}`)
        .join(", ");
      filteredRows.push({
        Date: formatDate(voucher.voucherDate),
        Voucher: voucher.voucherNumber,
        [transactionMeta.partyLabel]: voucher.partyName || "-",
        ...(slug === "purchase-register" ? { Type: "Purchase" } : {}),
        ...((slug === "sales-register" || slug === "purchase-register" || slug === "sales-return-register" || slug === "purchase-return-register") ? {
          Items: inventoryItems.length ? `${inventoryItems.length} item${inventoryItems.length === 1 ? "" : "s"} · ${itemsSummary}` : "-",
        } : {}),
        Amount: formatReportAmount(voucher.amount),
        ...(isLedgerStyleRegister ? { Balance: formatReportAmount(runningRegisterBalance) } : {}),
        Status: voucher.status,
      });
    });

    if (slug === "purchase-register") {
      const purchaseBills = registerVouchers;
      const receiptNotes = vouchers.filter(
        (voucher) => voucher.voucherType === "purchase" && voucher.documentKind === "receipt-note" && voucher.status !== "cancelled",
      );

      const purchaseBillPending = sumMoney(receiptNotes.map((receiptNote) => {
        const receiptReferences = new Set(
          [receiptNote.reference, receiptNote.voucherNumber]
            .map((value) => value?.trim().toLowerCase())
            .filter((value): value is string => Boolean(value)),
        );
        const billedAmount = sumMoney(purchaseBills
          .filter((bill) => {
            if (bill.sourceVoucherId === receiptNote.id) return true;
            const billReferences = [bill.reference, bill.voucherNumber, ...bill.lines.map((line) => line.billReference)]
              .flatMap((value) => (value ?? "").split("+"))
              .map((value) => value.trim().toLowerCase())
              .filter(Boolean);
            return bill.partyName.trim().toLowerCase() === receiptNote.partyName.trim().toLowerCase() && billReferences.some((reference) => receiptReferences.has(reference));
          })
          .map((bill) => Number(bill.amount || 0)));
        const calculatedReceiptAmount = sumMoney(
          (receiptNote.inventoryItems ?? []).map((item) => Number(item.quantity || 0) * Number(item.unitPrice || 0)),
        );
        const receiptAmount = moneyToMinorUnits(calculatedReceiptAmount) !== 0
          ? calculatedReceiptAmount
          : roundMoney(Number(receiptNote.amount || 0));
        return Math.max(0, roundMoney(receiptAmount - billedAmount));
      }));

      if (moneyToMinorUnits(purchaseBillPending) > 0) {
        filteredRows.push({
          Date: "",
          Voucher: "",
          Supplier: "Purchase Bill Pending (Unbilled Receipt Notes)",
          Type: "Pending Balance",
          Amount: formatReportAmount(purchaseBillPending),
          Balance: "-",
          Status: "pending",
        });
      }
    }

    return {
      kind: "table",
      title: reportLabel,
      description: `${reportLabel} for the selected reporting period.`,
      columns: [
        "Date",
        "Voucher",
        transactionMeta.partyLabel,
        ...(slug === "purchase-register" ? ["Type"] : []),
        ...((slug === "sales-register" || slug === "purchase-register" || slug === "sales-return-register" || slug === "purchase-return-register") ? ["Items"] : []),
        "Amount",
        ...(isLedgerStyleRegister ? ["Balance"] : []),
        "Status",
      ],
      rows: filteredRows,
      summary: [
        { label: "Entries", value: String(registerVouchers.length), tone: "blue" },
        {
          label: transactionMeta.totalLabel,
          value: formatReportAmount(registerTotal),
          tone: transactionMeta.tone,
        },
        ...(isLedgerStyleRegister
          ? [{ label: "Closing Balance", value: formatReportAmount(runningRegisterBalance), tone: "blue" as const }]
          : []),
      ],
      emptyMessage: `No data found for ${reportLabel.toLowerCase()}.`,
    };
  }

  if (slug === "cash-book") {
    const cashAmounts = (voucher: VoucherRecord) => voucher.lines.reduce(
      (amounts, line) => {
        const accountType = reportMoneyAccountType(accountIndex.resolve(line));
        const isCash = accountType === "CASH"
          || (!line.accountId && !accountType
            && (line.costCenter === "Cash-in-Hand" || line.ledger.toLowerCase().includes("cash")));
        if (isCash) {
          amounts.debit = sumMoney([amounts.debit, Number(line.debit || 0)]);
          amounts.credit = sumMoney([amounts.credit, Number(line.credit || 0)]);
        }
        return amounts;
      },
      { debit: 0, credit: 0 },
    );
    const openingCashBalance = sumMoney(allWorkspaceAccountingVouchers
      .filter((voucher) => voucher.voucherDate < fromDate)
      .map((voucher) => {
        const movement = cashAmounts(voucher);
        return roundMoney(movement.debit - movement.credit);
      }));
    let runningCashBalance = openingCashBalance;
    const rows: Array<Record<string, string>> = [];
    if (moneyToMinorUnits(openingCashBalance) !== 0) {
      rows.push({
        Date: formatDate(fromDate),
        Voucher: "B/F",
        Particulars: "Opening / Previous Cash Balance",
        Debit: moneyToMinorUnits(openingCashBalance) >= 0 ? formatReportAmount(openingCashBalance) : "-",
        Credit: moneyToMinorUnits(openingCashBalance) < 0 ? formatReportAmount(Math.abs(openingCashBalance)) : "-",
        Balance: formatReportAmount(openingCashBalance),
      });
    }
    [...accountingVouchers].sort((left, right) => {
      if (left.voucherDate !== right.voucherDate) return left.voucherDate.localeCompare(right.voucherDate);
      if (left.documentKind === "opening-balance" && right.documentKind !== "opening-balance") return -1;
      if (right.documentKind === "opening-balance" && left.documentKind !== "opening-balance") return 1;
      return left.voucherNumber.localeCompare(right.voucherNumber);
    }).forEach((voucher) => {
      const movement = cashAmounts(voucher);
      if (moneyToMinorUnits(movement.debit) === 0 && moneyToMinorUnits(movement.credit) === 0) return;
      runningCashBalance = sumMoney([runningCashBalance, movement.debit, -movement.credit]);
      rows.push({
        Date: formatDate(voucher.voucherDate),
        Voucher: voucher.voucherNumber,
        Particulars: voucher.partyName || voucher.particulars || "-",
        Debit: moneyToMinorUnits(movement.debit) !== 0 ? formatReportAmount(movement.debit) : "-",
        Credit: moneyToMinorUnits(movement.credit) !== 0 ? formatReportAmount(movement.credit) : "-",
        Balance: formatReportAmount(runningCashBalance),
      });
    });

    return {
      kind: "table",
      title: reportLabel,
      description: "Cash related voucher movement for the selected period.",
      columns: ["Date", "Voucher", "Particulars", "Debit", "Credit", "Balance"],
      rows,
      summary: [
        { label: "Cash Balance", value: formatReportAmount(runningCashBalance), tone: "green" },
        { label: "Entries", value: String(rows.filter((row) => row.Voucher !== "B/F").length), tone: "blue" },
      ],
      emptyMessage: "No cash book entries found.",
    };
  }

  if (slug === "bank-book") {
    const moneyKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
    const bankKeys = new Set(bankAccountNames.map(moneyKey));
    const isBankLine = (line: VoucherRecord["lines"][number]) => {
      const account = accountIndex.resolve(line);
      const accountType = reportMoneyAccountType(account);
      const isBank = accountType === "BANK"
        || (!line.accountId && !accountType && bankKeys.has(moneyKey(line.ledger)));
      const currentName = account?.name ?? line.ledger;
      return isBank && (!selectedBankAccount || moneyKey(currentName) === moneyKey(selectedBankAccount));
    };
    const openingBankBalance = sumMoney(allWorkspaceAccountingVouchers
      .filter((voucher) => voucher.voucherDate < fromDate)
      .flatMap((voucher) => voucher.lines.filter(isBankLine))
      .map((line) => roundMoney(Number(line.debit || 0) - Number(line.credit || 0))));
    let runningBankBalance = openingBankBalance;
    const rows: Array<Record<string, string>> = [];
    if (moneyToMinorUnits(openingBankBalance) !== 0) {
      rows.push({
        Date: formatDate(fromDate),
        Voucher: "B/F",
        "Bank Account": selectedBankAccount || "All Banks",
        Particulars: "Opening / Previous Bank Balance",
        Debit: moneyToMinorUnits(openingBankBalance) >= 0 ? formatReportAmount(openingBankBalance) : "-",
        Credit: moneyToMinorUnits(openingBankBalance) < 0 ? formatReportAmount(Math.abs(openingBankBalance)) : "-",
        Balance: formatReportAmount(openingBankBalance),
      });
    }
    [...accountingVouchers].sort((left, right) => {
      if (left.voucherDate !== right.voucherDate) return left.voucherDate.localeCompare(right.voucherDate);
      if (left.documentKind === "opening-balance" && right.documentKind !== "opening-balance") return -1;
      if (right.documentKind === "opening-balance" && left.documentKind !== "opening-balance") return 1;
      return left.voucherNumber.localeCompare(right.voucherNumber);
    }).forEach((voucher) => {
      voucher.lines.filter(isBankLine).forEach((line) => {
        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);
        runningBankBalance = sumMoney([runningBankBalance, debit, -credit]);
        rows.push({
          Date: formatDate(voucher.voucherDate),
          Voucher: voucher.voucherNumber,
          "Bank Account": line.ledger,
          Particulars: voucher.partyName || line.description || voucher.particulars || "-",
          Debit: moneyToMinorUnits(debit) !== 0 ? formatReportAmount(debit) : "-",
          Credit: moneyToMinorUnits(credit) !== 0 ? formatReportAmount(credit) : "-",
          Balance: formatReportAmount(runningBankBalance),
        });
      });
    });

    return {
      kind: "table",
      title: reportLabel,
      description: "Bank related voucher movement for the selected period.",
      columns: ["Date", "Voucher", "Bank Account", "Particulars", "Debit", "Credit", "Balance"],
      rows,
      summary: [
        { label: "Bank Balance", value: formatReportAmount(runningBankBalance), tone: "blue" },
        { label: "Entries", value: String(rows.filter((row) => row.Voucher !== "B/F").length), tone: "green" },
      ],
      emptyMessage: "No bank book entries found.",
    };
  }

  if (slug === "mfs-report") {
    const isMfsLine = (line: VoucherRecord["lines"][number]) => {
      const ledger = line.ledger.toLowerCase();
      const moneyKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
      const account = accountIndex.resolve(line);
      const accountType = reportMoneyAccountType(account);
      const isMfs = accountType === "MFS"
        || (!line.accountId && !accountType && (
          mfsAccountNames.some((name) => moneyKey(name) === moneyKey(ledger))
          || line.moneyAccountType === "MFS"
          || ledger.includes("mobile financial service")
          || ledger.includes("mobile banking")
          || ledger.includes("bkash")
          || ledger.includes("nagad")
          || ledger.includes("rocket")
        ));
      const currentName = account?.name ?? line.ledger;
      return isMfs && (!selectedMfsAccount || moneyKey(currentName) === moneyKey(selectedMfsAccount));
    };
    const openingBalance = sumMoney(allWorkspaceAccountingVouchers
      .filter((voucher) => voucher.voucherDate < fromDate)
      .flatMap((voucher) => voucher.lines.filter(isMfsLine))
      .map((line) => roundMoney(Number(line.debit || 0) - Number(line.credit || 0))));
    let runningBalance = openingBalance;
    const rows: Array<Record<string, string>> = [];

    if (moneyToMinorUnits(openingBalance) !== 0) {
      rows.push({
        Date: formatDate(fromDate),
        Voucher: "B/F",
        "MFS Account": selectedMfsAccount || "All MFS Accounts",
        Particulars: "Opening / Previous MFS Balance",
        Debit: moneyToMinorUnits(openingBalance) >= 0 ? formatReportAmount(openingBalance) : "-",
        Credit: moneyToMinorUnits(openingBalance) < 0 ? formatReportAmount(Math.abs(openingBalance)) : "-",
        Balance: formatReportAmount(openingBalance),
      });
    }

    [...accountingVouchers]
      .sort((left, right) => left.voucherDate.localeCompare(right.voucherDate) || left.voucherNumber.localeCompare(right.voucherNumber))
      .forEach((voucher) => {
        voucher.lines.filter(isMfsLine).forEach((line) => {
          const debit = Number(line.debit || 0);
          const credit = Number(line.credit || 0);
          runningBalance = sumMoney([runningBalance, debit, -credit]);
          rows.push({
            Date: formatDate(voucher.voucherDate),
            Voucher: voucher.voucherNumber,
            "MFS Account": line.ledger,
            Particulars: voucher.partyName || line.description || voucher.particulars || "-",
            Debit: moneyToMinorUnits(debit) !== 0 ? formatReportAmount(debit) : "-",
            Credit: moneyToMinorUnits(credit) !== 0 ? formatReportAmount(credit) : "-",
            Balance: formatReportAmount(runningBalance),
            _voucherId: voucher.id,
            _voucherType: voucher.voucherType,
          });
        });
      });

    return {
      kind: "table",
      title: reportLabel,
      description: "Mobile Financial Service account movement for the selected period.",
      columns: ["Date", "Voucher", "MFS Account", "Particulars", "Debit", "Credit", "Balance"],
      rows,
      summary: [
        { label: "MFS Balance", value: formatReportAmount(runningBalance), tone: "blue" },
        { label: "Entries", value: String(rows.filter((row) => row.Voucher !== "B/F").length), tone: "green" },
      ],
      emptyMessage: "No MFS transactions found for the selected period.",
    };
  }

  if (slug === "general-ledger") {
    const rows = accountingVouchers.flatMap((voucher) =>
      voucher.lines.filter((line) => {
        if (!selectedGeneralLedger) return true;
        if (line.accountId) return line.accountId === selectedGeneralLedger;
        return Boolean(selectedGeneralLedgerName)
          && normalizeReportKey(line.ledger) === normalizeReportKey(selectedGeneralLedgerName ?? "");
      }).map((line) => ({
        Date: formatDate(voucher.voucherDate),
        Voucher: voucher.voucherNumber,
        Ledger: line.ledger,
        Description: line.description || voucher.particulars || "-",
        Debit: formatReportAmount(Number(line.debit || 0)),
        Credit: formatReportAmount(Number(line.credit || 0)),
        Action: "",
        _voucherId: voucher.id,
        _voucherType: voucher.voucherType,
      })),
    );

    return {
      kind: "table",
      title: reportLabel,
      description: "Ledger-wise line items posted across the selected period.",
      columns: ["Date", "Voucher", "Ledger", "Description", "Debit", "Credit", "Action"],
      rows,
      summary: [{ label: "Ledger Lines", value: String(rows.length), tone: "blue" }],
      emptyMessage: "No ledger lines found.",
    };
  }

  if (
    slug === "customer-statement" ||
    slug === "supplier-statement" ||
    slug === "customer-list" ||
    slug === "supplier-list" ||
    slug === "customer-wise-profit-loss" ||
    slug === "supplier-wise-profit-loss" ||
    slug === "sales-by-customer" ||
    slug === "purchase-by-supplier" ||
    slug === "customer-aging-report" ||
    slug === "supplier-aging-report" ||
    slug === "outstanding-receivables" ||
    slug === "outstanding-payables"
  ) {
    const targetType = slug.startsWith("customer") || slug === "outstanding-receivables" || slug === "sales-by-customer" ? "customer" : "supplier";
    const filteredParties = parties.filter((party) => party.type === targetType);
    const movementRows = filteredParties.map((party) => {
      const partyVouchers = allWorkspaceAccountingVouchers
        .filter((voucher) => getPartyLedgerMovement(voucher, party).hasPosting)
        .filter((voucher) => voucher.voucherDate <= toDate)
        .sort((left, right) => {
          const dateOrder = left.voucherDate.localeCompare(right.voucherDate);
          if (dateOrder !== 0) return dateOrder;

          const timeOrder = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
          if (Number.isFinite(timeOrder) && timeOrder !== 0) return timeOrder;

          return left.voucherNumber.localeCompare(right.voucherNumber, undefined, { numeric: true });
        });
      const voucherMovements = partyVouchers.flatMap((voucher) => {
        const { hasPosting, debit, credit } = getPartyLedgerMovement(voucher, party);
        if (!hasPosting || (!debit && !credit)) return [];
        return [{
          voucher,
          debit,
          credit,
          delta: roundMoney(targetType === "customer" ? debit - credit : credit - debit),
        }];
      });
      // Party.openingBalance is setup metadata. The real opening balance is the
      // dated, posted journal on the party's stable COA sub-ledger; summing the
      // scalar again would double-count it. Pre-period ledger movement becomes
      // B/F, while this period's rows start from that derived balance.
      const openingBalance = sumMoney(voucherMovements
        .filter(({ voucher }) => voucher.voucherDate < fromDate)
        .map(({ delta }) => delta));
      let runningBalance = openingBalance;
      const transactions = voucherMovements
        .filter(({ voucher }) => voucher.voucherDate >= fromDate)
        .map(({ voucher, debit, credit, delta }) => {
          runningBalance = sumMoney([runningBalance, delta]);

          return {
            id: voucher.id,
            date: voucher.voucherDate,
            voucherNumber: voucher.voucherNumber,
            voucherType: voucher.voucherType,
            ageDays: (targetType === "customer" && voucher.voucherType === "sales") || (targetType === "supplier" && voucher.voucherType === "purchase")
              ? Math.max(0, daysBetween(toDate, voucher.voucherDate))
              : null,
            debit,
            credit,
            runningBalance,
          };
        });
      const movement = sumMoney(transactions.flatMap((transaction) => [transaction.debit, transaction.credit]));
      const netBalance = runningBalance;
      const maturityDays = Number.isInteger(Number(party.billMaturityDays)) ? Number(party.billMaturityDays) : 30;
      const openDocuments: Array<{ id: string; date: string; voucherNumber: string; voucherType: "sales" | "purchase"; amount: number; outstanding: number }> = [];
      let unappliedSettlement = 0;
      for (const { voucher, delta: movementAmount } of voucherMovements) {
        const isBill = targetType === "customer"
          ? voucher.voucherType === "sales"
          : voucher.voucherType === "purchase";
        if (isBill && moneyToMinorUnits(movementAmount) > 0) {
          const appliedAdvance = Math.min(unappliedSettlement, movementAmount);
          unappliedSettlement = roundMoney(unappliedSettlement - appliedAdvance);
          openDocuments.push({
            id: voucher.id,
            date: voucher.voucherDate,
            voucherNumber: voucher.voucherNumber,
            voucherType: targetType === "customer" ? "sales" : "purchase",
            amount: movementAmount,
            outstanding: roundMoney(movementAmount - appliedAdvance),
          });
          continue;
        }
        if (moneyToMinorUnits(movementAmount) >= 0) continue;
        let settlement = roundMoney(-movementAmount);
        for (const document of openDocuments) {
          if (moneyToMinorUnits(settlement) <= 0) break;
          const applied = Math.min(document.outstanding, settlement);
          document.outstanding = roundMoney(document.outstanding - applied);
          settlement = roundMoney(settlement - applied);
        }
        unappliedSettlement = sumMoney([unappliedSettlement, settlement]);
      }
      const outstandingDocuments = openDocuments
        .filter((document) => moneyToMinorUnits(document.outstanding) > 0)
        .map((document) => {
          const ageDays = Math.max(0, daysBetween(toDate, document.date));
          return { ...document, ageDays, overdue: ageDays > maturityDays };
        });
      const lastVoucherDate = partyVouchers.at(-1)?.voucherDate ?? toDate;
      const ageDays = Math.max(0, daysBetween(toDate, lastVoucherDate));
      const periodPartyVouchers = vouchers.filter((voucher) => voucherBelongsToParty(voucher, party));
      const periodSalesInvoices = periodPartyVouchers.filter(isRealSalesInvoice);
      const periodSalesReturns = periodPartyVouchers.filter((voucher) => voucher.voucherType === "credit-note");
      const sales = sumRealSalesInvoiceAmount(periodSalesInvoices) - sumVoucherAmount(periodSalesReturns, ["credit-note"]);
      const salesCost = sumMoney([
        ...periodSalesInvoices.map((voucher) => getVoucherInventoryCost(dataset, voucher).total),
        ...periodSalesReturns.map((voucher) => -getVoucherInventoryCost(dataset, voucher).total),
      ]);

      return {
        party,
        sales,
        salesCost,
        purchase: sumVoucherAmount(periodPartyVouchers, ["purchase"]) - sumVoucherAmount(periodPartyVouchers, ["debit-note"]),
        openingBalance,
        movement,
        netBalance,
        maturityDays,
        outstandingDocuments,
        ageDays,
        transactions,
      };
    });
    const toPartyStatementDetail = (entry: (typeof movementRows)[number], outstandingOnly = false): PartyStatementDetail => ({
      partyId: entry.party.id,
      name: entry.party.name,
      type: targetType,
      contact: entry.party.contact,
      openingBalance: entry.openingBalance,
      movement: entry.movement,
      closingBalance: entry.netBalance,
      maturityDays: entry.maturityDays,
      ...(outstandingOnly ? { outstandingDocuments: entry.outstandingDocuments } : {}),
      transactions: entry.transactions,
    });

    if (slug === "customer-statement" || slug === "supplier-statement") {
      const rows = movementRows.map((entry) => ({
        [targetType === "customer" ? "Customer" : "Supplier"]: entry.party.name,
        Contact: entry.party.contact,
        ...(targetType === "customer"
          ? {
              "Credit Sales": formatReportAmount(sumMoney(entry.transactions.map(
                (transaction) => transaction.voucherType === "sales" ? transaction.debit : 0,
              ))),
              "Sales Return": formatReportAmount(sumMoney(
                allWorkspaceAccountingVouchers
                  .filter((voucher) => voucherBelongsToParty(voucher, entry.party))
                  .filter((voucher) => voucher.voucherDate >= fromDate && voucher.voucherDate <= toDate)
                  .filter((voucher) => voucher.voucherType === "credit-note")
                  .map((voucher) => (isReversalArtifact(voucher) ? -1 : 1) * Number(voucher.amount || 0))),
              ),
              Collection: formatReportAmount(sumMoney(entry.transactions.map(
                (transaction) => transaction.voucherType === "receipt" ? transaction.credit : 0,
              ))),
              Due: formatReportAmount(entry.netBalance),
            }
          : {
              Debit: formatReportAmount(sumMoney(entry.transactions.map((transaction) => transaction.debit))),
              Credit: formatReportAmount(sumMoney(entry.transactions.map((transaction) => transaction.credit))),
              Balance: formatReportAmount(entry.netBalance),
            }),
        Status: entry.party.status,
        _partyId: entry.party.id,
      }));

      const columns = targetType === "customer"
        ? ["Customer", "Contact", "Credit Sales", "Sales Return", "Collection", "Due", "Status"]
        : ["Supplier", "Contact", "Debit", "Credit", "Balance", "Status"];

      return {
        kind: "table",
        title: reportLabel,
        description: `${reportLabel} for the active workspace.`,
        columns,
        rows,
        summary: [{ label: "Rows", value: String(rows.length), tone: "blue" }],
        emptyMessage: `No ${targetType} statements found.`,
        rowDetails: movementRows.map((entry) => toPartyStatementDetail(entry)),
      };
    }

    if (slug === "customer-list" || slug === "supplier-list") {
      const rows = filteredParties.map((party) => ({
        Name: party.name,
        Contact: party.contact,
        Address: party.address,
        "Credit Limit": formatReportAmount(party.creditLimit),
        Status: party.status,
        _partyId: party.id,
      }));

      return {
        kind: "table",
        title: reportLabel,
        description: `${reportLabel} from your party master data.`,
        columns: ["Name", "Contact", "Address", "Credit Limit", "Status"],
        rows,
        summary: [{ label: "Parties", value: String(rows.length), tone: "blue" }],
        emptyMessage: `No ${targetType} list found.`,
        rowDetails: movementRows.map((entry) => toPartyStatementDetail(entry)),
      };
    }

    if (slug === "customer-wise-profit-loss" || slug === "supplier-wise-profit-loss") {
      const costColumn = targetType === "customer" ? "MWA Cost" : "Net Purchase";
      const rows = movementRows.map((entry) => ({
        Name: entry.party.name,
        Sales: formatReportAmount(entry.sales),
        [costColumn]: formatReportAmount(targetType === "customer" ? entry.salesCost : entry.purchase),
        Profit: formatReportAmount(targetType === "customer" ? entry.sales - entry.salesCost : -entry.purchase),
        _partyId: entry.party.id,
      }));

      return {
        kind: "table",
        title: reportLabel,
        description: `${reportLabel} based on current sales and purchase movement.`,
        columns: ["Name", "Sales", costColumn, "Profit"],
        rows,
        summary: [{ label: "Rows", value: String(rows.length), tone: "blue" }],
        emptyMessage: `No ${targetType} profit data found.`,
        rowDetails: movementRows.map((entry) => toPartyStatementDetail(entry)),
      };
    }

    if (slug === "sales-by-customer" || slug === "purchase-by-supplier") {
      const rows = movementRows.map((entry) => ({
        Name: entry.party.name,
        Amount: formatReportAmount(targetType === "customer" ? entry.sales : entry.purchase),
        Contact: entry.party.contact,
        _partyId: entry.party.id,
      }));

      return {
        kind: "table",
        title: reportLabel,
        description: `${reportLabel} ranked from live transactions.`,
        columns: ["Name", "Amount", "Contact"],
        rows,
        summary: [{ label: "Rows", value: String(rows.length), tone: "blue" }],
        emptyMessage: `No ${targetType} movement found.`,
        rowDetails: movementRows.map((entry) => toPartyStatementDetail(entry)),
      };
    }

    if (slug === "customer-aging-report" || slug === "supplier-aging-report") {
      const rows = movementRows.map((entry) => ({
        Name: entry.party.name,
        Outstanding: formatReportAmount(entry.netBalance),
        "Age (Days)": String(entry.ageDays),
        Bucket: entry.ageDays <= 30 ? "0-30" : entry.ageDays <= 60 ? "31-60" : entry.ageDays <= 90 ? "61-90" : "90+",
        _partyId: entry.party.id,
      }));

      return {
        kind: "table",
        title: reportLabel,
        description: `${reportLabel} based on the latest transaction date.`,
        columns: ["Name", "Outstanding", "Age (Days)", "Bucket"],
        rows,
        summary: [{ label: "Rows", value: String(rows.length), tone: "orange" }],
        emptyMessage: `No ${targetType} aging data found.`,
        rowDetails: movementRows.map((entry) => toPartyStatementDetail(entry)),
      };
    }

    const rows = movementRows
      .filter((entry) => moneyToMinorUnits(entry.netBalance) > 0)
      .map((entry) => ({
        Name: entry.party.name,
        Outstanding: formatReportAmount(entry.netBalance),
        Contact: entry.party.contact,
        _partyId: entry.party.id,
      }));

    return {
      kind: "table",
      title: reportLabel,
      description: `${reportLabel} from active live balances.`,
      columns: ["Name", "Outstanding", "Contact"],
      rows,
      summary: [{ label: "Outstanding", value: formatReportAmount(sumMoney(rows.map((row) => Number(row.Outstanding.replace(/[^\d.-]/g, "") || 0)))), tone: "red" }],
      emptyMessage: `No ${targetType} outstanding balance found.`,
      rowDetails: movementRows.filter((entry) => moneyToMinorUnits(entry.netBalance) > 0).map((entry) => toPartyStatementDetail(entry, true)),
    };
  }

  if (slug === "item-wise-movement") {
    const movementRows = getItemWiseMovementRows(dataset, workspaceId, fromDate, toDate);
    const rows = movementRows.map((row) => ({
      "Item Name": row.itemName,
      Date: formatDate(row.date),
      Voucher: row.voucherNumber,
      Type: row.voucherType,
      "In Qty": row.inQty ? formatNumber(row.inQty) : "-",
      "Out Qty": row.outQty ? formatNumber(row.outQty) : "-",
      Rate: formatReportAmount(row.rate),
      "Balance Qty": formatNumber(row.balanceQty),
      "Balance Value": formatReportAmount(row.balanceValue),
      _itemId: findInventoryItemId(row.itemCode, row.itemName),
    }));

    return {
      kind: "table",
      title: reportLabel,
      description: `Item-wise stock movement (in/out) with running balance between ${formatDate(fromDate)} and ${formatDate(toDate)}.`,
      columns: ["Item Name", "Date", "Voucher", "Type", "In Qty", "Out Qty", "Rate", "Balance Qty", "Balance Value"],
      rows,
      summary: [
        { label: "Items Moved", value: String(new Set(movementRows.map((row) => row.itemCode)).size), tone: "blue" },
        { label: "Movements", value: String(rows.length), tone: "green" },
      ],
      emptyMessage: "No item movement found for the selected period.",
    };
  }

  if (slug === "warehouse-wise-report") {
    const rows = warehouseStockRows
      .slice()
      .sort((left, right) => (left.warehouseName ?? "").localeCompare(right.warehouseName ?? "") || (left.itemName ?? "").localeCompare(right.itemName ?? ""))
      .map((row) => ({
        Warehouse: row.warehouseName ? `${row.warehouseName} (${row.warehouseCode ?? "-"})` : "-",
        "Item Code": row.itemCode ?? "-",
        "Item Name": row.itemName ?? "-",
        Category: row.category ?? "-",
        Quantity: `${formatNumber(row.quantity)} ${row.unit ?? ""}`.trim(),
        "MWA Rate": formatReportAmount(row.averageCost),
        "Stock Value": formatReportAmount(row.stockValue),
        _itemId: findInventoryItemId(row.itemCode ?? undefined, row.itemName ?? undefined),
      }));

    return {
      kind: "table",
      title: reportLabel,
      description: `Moving weighted average stock quantity and value by warehouse as at ${formatDate(toDate)}.`,
      columns: ["Warehouse", "Item Code", "Item Name", "Category", "Quantity", "MWA Rate", "Stock Value"],
      rows,
      summary: [
        {
          label: "Warehouses with stock",
          // Counting only the warehouses in the rows and labelling it
          // "Warehouses" read as a total, hiding every empty one.
          value: warehouseTotalCount
            ? `${new Set(warehouseStockRows.map((row) => row.warehouseId)).size} of ${warehouseTotalCount}`
            : String(new Set(warehouseStockRows.map((row) => row.warehouseId)).size),
          tone: "blue",
        },
        { label: "Total Stock Value", value: formatReportAmount(sumMoney(warehouseStockRows.map((row) => row.stockValue))), tone: "green" },
      ],
      emptyMessage: `No stock in this warehouse as at ${formatDate(toDate)}.`,
    };
  }

  if (
    slug === "stock-details" ||
    slug === "item-details" ||
    slug === "inventory-valuation" ||
    slug === "closing-stock" ||
    slug === "low-stock-report" ||
    slug === "negative-stock-report" ||
    slug === "reorder-report" ||
    slug === "category-wise-profit-loss" ||
    slug === "sales-by-category" ||
    slug === "purchase-by-category" ||
    slug === "stock-by-category" ||
    slug === "slow-moving-items" ||
    slug === "fast-moving-items" ||
    slug === "dead-stock-report"
  ) {
    if (slug === "stock-details" || slug === "item-details" || slug === "inventory-valuation" || slug === "closing-stock") {
      const rows = stockItems.map((item) => ({
        "Item Code": item.itemCode,
        "Item Name": item.itemName,
        Category: item.category,
        Quantity: formatNumber(item.qty),
        Rate: formatReportAmount(item.rate),
        Value: formatReportAmount(item.qty * item.rate),
        _itemId: findInventoryItemId(item.itemCode, item.itemName),
      }));

      return {
        kind: "table",
        title: reportLabel,
        description: `${reportLabel} generated from current stock balances.`,
        columns: ["Item Code", "Item Name", "Category", "Quantity", "Rate", "Value"],
        rows,
        summary: [{ label: "Items", value: String(rows.length), tone: "blue" }],
        emptyMessage: "No inventory data found.",
      };
    }

    if (slug === "low-stock-report" || slug === "reorder-report") {
      const rows = stockItems
        .filter((item) => item.reorderLevel > 0 && item.qty <= item.reorderLevel)
        .map((item) => ({
          "Item Code": item.itemCode,
          "Item Name": item.itemName,
          Quantity: formatNumber(item.qty),
          "Reorder Level": formatNumber(item.reorderLevel),
          Gap: formatNumber(item.reorderLevel - item.qty),
          _itemId: findInventoryItemId(item.itemCode, item.itemName),
        }));

      return {
        kind: "table",
        title: reportLabel,
        description: `${reportLabel} based on reorder threshold tracking.`,
        columns: ["Item Code", "Item Name", "Quantity", "Reorder Level", "Gap"],
        rows,
        summary: [{ label: "Alerts", value: String(rows.length), tone: rows.length ? "red" : "green" }],
        emptyMessage: "No low stock items found.",
      };
    }

    if (slug === "negative-stock-report") {
      const rows = stockItems
        .filter((item) => item.qty < 0)
        .map((item) => ({
          "Item Code": item.itemCode,
          "Item Name": item.itemName,
          Quantity: formatNumber(item.qty),
          Category: item.category,
          _itemId: findInventoryItemId(item.itemCode, item.itemName),
        }));

      return {
        kind: "table",
        title: reportLabel,
        description: "Items that have gone below zero quantity.",
        columns: ["Item Code", "Item Name", "Quantity", "Category"],
        rows,
        summary: [{ label: "Negative Items", value: String(rows.length), tone: rows.length ? "red" : "green" }],
        emptyMessage: "No negative stock items found.",
      };
    }

    const categoryMap = new Map<string, { sales: number; purchase: number; stock: number; cost: number }>();
    stockItems.forEach((item) => {
      const current = categoryMap.get(item.category) ?? { sales: 0, purchase: 0, stock: 0, cost: 0 };
      current.stock = sumMoney([current.stock, item.qty * item.rate]);
      categoryMap.set(item.category, current);
    });
    vouchers.forEach((voucher) => {
      const salesSign = isRealSalesInvoice(voucher) ? 1 : voucher.voucherType === "credit-note" ? -1 : 0;
      const saleCost = salesSign ? getVoucherInventoryCost(dataset, voucher) : null;
      const lineValueFactor = getVoucherLineValueFactor(voucher);
      (voucher.inventoryItems ?? []).forEach((item) => {
        const category = getStockCategory(stockItems, item.itemName);
        const current = categoryMap.get(category) ?? { sales: 0, purchase: 0, stock: 0, cost: 0 };
        const value = Number(item.quantity || 0) * Number(item.unitPrice || 0) * lineValueFactor;
        current.sales = sumMoney([current.sales, salesSign * value]);
        if (voucher.voucherType === "purchase") {
          current.purchase = sumMoney([current.purchase, value]);
        } else if (voucher.voucherType === "debit-note") {
          current.purchase = sumMoney([current.purchase, -value]);
        }
        if (saleCost) current.cost = sumMoney([current.cost, salesSign * consumeInventoryItemCost(saleCost, item)]);
        categoryMap.set(category, current);
      });
    });

    if (slug === "category-wise-profit-loss" || slug === "sales-by-category" || slug === "purchase-by-category" || slug === "stock-by-category") {
      const rows = Array.from(categoryMap.entries()).map(([category, row]) => ({
        Category: category,
        Sales: formatReportAmount(row.sales),
        Purchase: formatReportAmount(row.purchase),
        "Stock Value": formatReportAmount(row.stock),
        Profit: formatReportAmount(roundMoney(row.sales - row.cost)),
      }));

      return {
        kind: "table",
        title: reportLabel,
        description: `${reportLabel} from category-level movement and stock value.`,
        columns: ["Category", "Sales", "Purchase", "Stock Value", "Profit"],
        rows,
        summary: [{ label: "Categories", value: String(rows.length), tone: "blue" }],
        emptyMessage: "No category-level data found.",
      };
    }

    if (slug === "dead-stock-report") {
      const lastSaleByItem = new Map<string, string>();
      const firstStockDateByItem = new Map<string, string>();
      const rememberFirstStockDate = (itemName: string, date: string) => {
        if (!date || date > toDate) return;
        const key = normalizeReportKey(itemName);
        const current = firstStockDateByItem.get(key);
        if (!current || date < current) firstStockDateByItem.set(key, date);
      };

      dataset.stockItems
        .filter((item) => item.workspaceId === workspaceId && Number(item.openingQty || 0) > 0)
        .forEach((item) => rememberFirstStockDate(item.itemName, String(item.createdAt ?? "").slice(0, 10)));
      (dataset.inventoryMovements ?? [])
        .filter((movement) => movement.workspaceId === workspaceId && movement.movementType === "IN")
        .forEach((movement) => rememberFirstStockDate(movement.itemName, movement.transactionDate.slice(0, 10)));

      allWorkspaceVouchers
        .filter((voucher) => voucher.voucherDate <= toDate && !isReversalArtifact(voucher))
        .forEach((voucher) => {
          const isSale = isRealSalesInvoice(voucher);
          const isStockIn = voucher.voucherType === "purchase" || voucher.voucherType === "credit-note";
          (voucher.inventoryItems ?? []).forEach((item) => {
            const key = normalizeReportKey(item.itemName);
            if (isSale && voucher.voucherDate > (lastSaleByItem.get(key) ?? "")) {
              lastSaleByItem.set(key, voucher.voucherDate);
            }
            if (isStockIn) rememberFirstStockDate(item.itemName, voucher.voucherDate);
          });
        });

      const fullMonthsBetween = (later: string, earlier: string) => {
        const end = new Date(`${later}T00:00:00.000Z`);
        const start = new Date(`${earlier}T00:00:00.000Z`);
        let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
        if (end.getUTCDate() < start.getUTCDate()) months -= 1;
        return Math.max(0, months);
      };

      const rows = stockItems
        .filter((item) => item.qty > 0.000001)
        .flatMap((item) => {
          const key = normalizeReportKey(item.itemName);
          const lastSale = lastSaleByItem.get(key) ?? null;
          const stockSince = firstStockDateByItem.get(key) ?? null;
          const inactivityStart = lastSale ?? stockSince;
          if (!inactivityStart) return [];
          const inactiveMonths = fullMonthsBetween(toDate, inactivityStart);
          if (inactiveMonths < deadStockMonths) return [];
          return [{
            "Item Code": item.itemCode,
            "Item Name": item.itemName,
            Category: item.category,
            Quantity: `${formatNumber(item.qty)} ${item.unit}`.trim(),
            "Stock Value": formatReportAmount(item.qty * item.rate),
            "Last Sale": lastSale ? formatDate(lastSale) : "Never sold",
            "Stock Since": stockSince ? formatDate(stockSince) : "-",
            "Inactive Months": String(inactiveMonths),
            _inactiveMonths: inactiveMonths,
            _itemId: findInventoryItemId(item.itemCode, item.itemName),
          }];
        })
        .sort((left, right) => right._inactiveMonths - left._inactiveMonths || left["Item Name"].localeCompare(right["Item Name"]))
        .map(({ _inactiveMonths, ...row }) => {
          void _inactiveMonths;
          return row;
        });

      return {
        kind: "table",
        title: reportLabel,
        description: `Positive stock with no sales for ${deadStockMonths} or more full months as at ${formatDate(toDate)}. Never-sold items are measured from their first stock-in date.`,
        columns: ["Item Code", "Item Name", "Category", "Quantity", "Stock Value", "Last Sale", "Stock Since", "Inactive Months"],
        rows,
        summary: [
          { label: "Dead Stock Period", value: `${deadStockMonths} months`, tone: "blue" },
          { label: "Dead Items", value: String(rows.length), tone: rows.length ? "orange" : "green" },
          { label: "Stock Value", value: formatReportAmount(sumMoney(rows.map((row) => Number(String(row["Stock Value"]).replace(/[^0-9.-]/g, "")) || 0))), tone: "orange" },
        ],
        emptyMessage: `No positive stock has been inactive for ${deadStockMonths} months.`,
      };
    }

    const itemMovement = new Map<string, { qty: number; lastDate: string; category: string }>();
    vouchers.forEach((voucher) => {
      (voucher.inventoryItems ?? []).forEach((item) => {
        const current = itemMovement.get(item.itemName) ?? { qty: 0, lastDate: voucher.voucherDate, category: getStockCategory(stockItems, item.itemName) };
        current.qty += Number(item.quantity || 0);
        if (voucher.voucherDate > current.lastDate) {
          current.lastDate = voucher.voucherDate;
        }
        itemMovement.set(item.itemName, current);
      });
    });

    const rows = Array.from(itemMovement.entries())
      .map(([itemName, row]) => ({
        Item: itemName,
        Category: row.category,
        Quantity: formatNumber(row.qty),
        "Last Movement": formatDate(row.lastDate),
        "Age (Days)": String(Math.max(0, daysBetween(toDate, row.lastDate))),
        _itemId: findInventoryItemId(undefined, itemName),
      }))
      .filter((row) =>
        slug === "slow-moving-items"
          ? Number(row["Age (Days)"]) >= 30
          : slug === "fast-moving-items"
            ? Number(row["Age (Days)"]) <= 15
            : Number(row["Age (Days)"]) >= 90,
      );

    return {
      kind: "table",
      title: reportLabel,
      description: `${reportLabel} based on item movement recency.`,
      columns: ["Item", "Category", "Quantity", "Last Movement", "Age (Days)"],
      rows,
      summary: [{ label: "Items", value: String(rows.length), tone: "orange" }],
      emptyMessage: `No items found for ${reportLabel.toLowerCase()}.`,
    };
  }

  if (slug === "expense-register" || slug === "monthly-expense-summary" || slug === "expense-analysis") {
    const expenseVouchers = vouchers.filter((voucher) => voucher.voucherType === "expense");
    if (slug === "expense-register") {
      const rows = expenseVouchers.map((voucher) => ({
        Date: formatDate(voucher.voucherDate),
        Voucher: voucher.voucherNumber,
        Particulars: voucher.particulars || "Expense",
        Party: voucher.partyName || "-",
        Amount: formatReportAmount(voucher.amount),
        _voucherId: voucher.id,
      }));

      return {
        kind: "table",
        title: reportLabel,
        description: "Expense vouchers recorded during the selected period.",
        columns: ["Date", "Voucher", "Particulars", "Party", "Amount"],
        rows,
        summary: [{ label: "Total Expense", value: formatReportAmount(expenseAmount), tone: "orange" }],
        emptyMessage: "No expense vouchers found.",
      };
    }

    const monthlyExpense = Array.from(
      expenseVouchers.reduce((map, voucher) => {
        const key = voucher.voucherDate.slice(0, 7);
        map.set(key, sumMoney([map.get(key) ?? 0, Number(voucher.amount || 0)]));
        return map;
      }, new Map<string, number>()),
    ).map(([month, amount]) => ({
      Month: month,
      Amount: formatReportAmount(amount),
    }));

    return {
      kind: "table",
      title: reportLabel,
      description: slug === "monthly-expense-summary" ? "Month-wise expense totals." : "Expense trend and concentration snapshot.",
      columns: ["Month", "Amount"],
      rows: monthlyExpense,
      summary: [{ label: "Months", value: String(monthlyExpense.length), tone: "blue" }],
      emptyMessage: "No monthly expense data found.",
    };
  }

  if (slug === "cheque-register" || slug === "post-dated-cheques") {
    const todayKey = new Date().toISOString().slice(0, 10);
    const scopedCheques = chequeRows
      .filter((cheque) => {
        if (slug === "post-dated-cheques") {
          // Post-dated means the cheque cannot be banked yet: a future due date
          // that has not already been cleared or cancelled.
          return cheque.dueDate > todayKey && !["cleared", "cancelled", "bounced"].includes(cheque.status.toLowerCase());
        }

        const issueDate = cheque.issueDate || cheque.dueDate;
        return (!fromDate || issueDate >= fromDate) && (!toDate || issueDate <= toDate);
      })
      .sort((left, right) => (left.dueDate || left.issueDate).localeCompare(right.dueDate || right.issueDate));

    const chequeTotal = sumMoney(scopedCheques.map((cheque) => cheque.amount));

    return {
      kind: "table",
      title: reportLabel,
      description:
        slug === "post-dated-cheques"
          ? "Cheques with a future due date that are still outstanding."
          : `Cheque movement recorded between ${formatDate(fromDate)} and ${formatDate(toDate)}.`,
      columns: ["Date", "Cheque No", "Bank Account", "Payee", "Direction", "Due Date", "Amount", "Status"],
      rows: scopedCheques.map((cheque) => ({
        Date: cheque.issueDate ? formatDate(cheque.issueDate) : "-",
        "Cheque No": cheque.chequeNo || "-",
        "Bank Account": cheque.bankAccount || "-",
        Payee: cheque.payee || "-",
        Direction: cheque.direction || "-",
        "Due Date": cheque.dueDate ? formatDate(cheque.dueDate) : "-",
        Amount: formatReportAmount(cheque.amount),
        Status: cheque.status || "-",
      })),
      summary: [
        { label: "Cheques", value: String(scopedCheques.length), tone: "blue" },
        { label: "Total Value", value: formatReportAmount(chequeTotal), tone: "orange" },
      ],
      emptyMessage: `No ${reportLabel.toLowerCase()} found.`,
    };
  }

  if (slug === "vat-summary" || slug === "vat-register") {
    const vatDetailRows = vouchers
      .flatMap((voucher) =>
        voucher.lines
          .filter((line) => line.ledger.toLowerCase().includes("vat") || line.description.toLowerCase().includes("vat"))
          .map((line) => ({
            VAT: line.ledger,
            Date: formatDate(voucher.voucherDate),
            Voucher: voucher.voucherNumber,
            Debit: formatReportAmount(Number(line.debit || 0)),
            Credit: formatReportAmount(Number(line.credit || 0)),
          })),
      );
    const vatRows = slug === "vat-summary"
      ? Array.from(vatDetailRows.reduce((totals, row) => {
          const current = totals.get(row.VAT) ?? { debit: 0, credit: 0 };
          totals.set(row.VAT, {
            debit: sumMoney([current.debit, Number(row.Debit.replace(/[^0-9.-]/g, ""))]),
            credit: sumMoney([current.credit, Number(row.Credit.replace(/[^0-9.-]/g, ""))]),
          });
          return totals;
        }, new Map<string, { debit: number; credit: number }>()).entries()).map(([vat, totals]) => ({
          VAT: vat,
          Date: `${formatDate(fromDate)} - ${formatDate(toDate)}`,
          Voucher: "Summary",
          Debit: formatReportAmount(totals.debit),
          Credit: formatReportAmount(totals.credit),
        }))
      : vatDetailRows;

    return {
      kind: "table",
      title: reportLabel,
      description: `${reportLabel} from voucher lines tagged with VAT.`,
      columns: ["VAT", "Date", "Voucher", "Debit", "Credit"],
      rows: vatRows,
      summary: [{ label: "VAT Rows", value: String(vatRows.length), tone: vatRows.length ? "orange" : "blue" }],
      emptyMessage: `No ${reportLabel.toLowerCase()} found.`,
    };
  }

  if (
    slug === "sales-orders" ||
    slug === "purchase-orders" ||
    slug === "pending-sales-orders" ||
    slug === "pending-purchase-orders" ||
    slug === "pending-deliveries" ||
    slug === "pending-invoices"
  ) {
    const isPurchaseOrderView = slug === "purchase-orders" || slug === "pending-purchase-orders";
    // "Pending Purchase Orders" is a current-status/outstanding view (like the Trial
    // Balance closing-balance report), not a period register: a PO raised before the
    // selected window that is still unreceived should stay visible. So it drops the
    // shared fromDate floor and looks at every workspace voucher up to toDate instead
    // of only the fromDate..toDate window used by the plain purchase-orders register.
    const pendingPurchaseOrderScopeVouchers =
      slug === "pending-purchase-orders" ? allWorkspaceVouchers.filter((voucher) => !toDate || voucher.voucherDate <= toDate) : vouchers;
    const receiptAmountsByOrder = pendingPurchaseOrderScopeVouchers
      .filter((voucher) => voucher.voucherType === "purchase" && voucher.documentKind === "receipt-note" && voucher.status !== "cancelled")
      .reduce((map, voucher) => {
        const references = new Set([voucher.reference?.trim() || voucher.voucherNumber, voucher.voucherNumber].filter(Boolean));
        voucher.lines.forEach((line) => {
          if (line.billReference?.trim()) {
            references.add(line.billReference.trim());
          }
        });
        const calculatedReceivedAmount = sumMoney(
          (voucher.inventoryItems ?? []).map((item) => Number(item.quantity || 0) * Number(item.unitPrice || 0)),
        );
        const receivedAmount = moneyToMinorUnits(calculatedReceivedAmount) !== 0
          ? calculatedReceivedAmount
          : roundMoney(Number(voucher.amount || 0));
        references.forEach((reference) => {
          const key = `${voucher.partyName.trim().toLowerCase()}::${reference.trim().toLowerCase()}`;
          map.set(key, sumMoney([map.get(key) ?? 0, receivedAmount]));
        });
        return map;
      }, new Map<string, number>());
    const baseRows = pendingPurchaseOrderScopeVouchers
      .filter((voucher) => voucher.voucherType === (isPurchaseOrderView ? "purchase" : "sales"))
      .filter((voucher) => voucher.documentKind === (isPurchaseOrderView ? "purchase-order" : "sale-order"))
      .filter((voucher) =>
        slug === "pending-sales-orders" || slug === "pending-purchase-orders" || slug === "pending-deliveries" || slug === "pending-invoices"
          ? isPurchaseOrderView
            ? moneyToMinorUnits(Number(voucher.amount || 0)) >
              moneyToMinorUnits(receiptAmountsByOrder.get(`${voucher.partyName.trim().toLowerCase()}::${(voucher.reference?.trim() || voucher.voucherNumber).trim().toLowerCase()}`) ?? 0)
            : voucher.status !== "posted"
          : true,
      )
      .sort((left, right) => left.voucherDate.localeCompare(right.voucherDate) || left.voucherNumber.localeCompare(right.voucherNumber, undefined, { numeric: true }))
      .map((voucher) => ({
        Date: formatDate(voucher.voucherDate),
        Order: voucher.voucherNumber,
        Party: voucher.partyName || "-",
        Type: voucher.settlementMode === "cash" ? "Cash" : voucher.settlementMode === "bank" ? "Bank" : "Credit",
        Amount: formatReportAmount(voucher.amount),
        ...(isPurchaseOrderView
          ? {
              Received: formatReportAmount(
                receiptAmountsByOrder.get(`${voucher.partyName.trim().toLowerCase()}::${(voucher.reference?.trim() || voucher.voucherNumber).trim().toLowerCase()}`) ?? 0,
              ),
              Pending: formatReportAmount(
                Math.max(
                  0,
                  Number(voucher.amount || 0) -
                    (receiptAmountsByOrder.get(`${voucher.partyName.trim().toLowerCase()}::${(voucher.reference?.trim() || voucher.voucherNumber).trim().toLowerCase()}`) ?? 0),
                ),
              ),
            }
          : {}),
        Status: voucher.status,
      }));

    return {
      kind: "table",
      title: reportLabel,
      description: `${reportLabel} based on current voucher workflow status.`,
      columns: isPurchaseOrderView ? ["Date", "Order", "Party", "Type", "Amount", "Received", "Pending", "Status"] : ["Date", "Order", "Party", "Type", "Amount", "Status"],
      rows: baseRows,
      summary: [{ label: "Rows", value: String(baseRows.length), tone: "blue" }],
      emptyMessage: `No ${reportLabel.toLowerCase()} found.`,
    };
  }

  const ratioRows = [
    { slug: "current-ratio", metric: "Current Ratio", value: currentAssets / currentLiabilities, note: "Current assets vs current liabilities" },
    { slug: "quick-ratio", metric: "Quick Ratio", value: (receivablesOutstanding + cashOnHand + bankBalance) / currentLiabilities, note: "Liquid assets vs current liabilities" },
    { slug: "cash-ratio", metric: "Cash Ratio", value: (cashOnHand + bankBalance) / currentLiabilities, note: "Cash and bank vs current liabilities" },
    { slug: "gross-profit-margin", metric: "Gross Profit Margin", value: netSalesAmount ? (grossProfit / netSalesAmount) * 100 : 0, note: "Gross profit as percent of net sales" },
    { slug: "net-profit-margin", metric: "Net Profit Margin", value: netSalesAmount ? (netProfit / netSalesAmount) * 100 : 0, note: "Net profit as percent of net sales" },
    { slug: "operating-profit-margin", metric: "Operating Profit Margin", value: netSalesAmount ? ((grossProfit - operatingExpenses) / netSalesAmount) * 100 : 0, note: "Operating profit as percent of net sales" },
    { slug: "return-on-assets", metric: "ROA", value: (netProfit / totalAssetsBase) * 100, note: "Net profit on total assets" },
    { slug: "return-on-equity", metric: "ROE", value: (netProfit / ownerEquityBase) * 100, note: "Net profit on owner equity" },
    { slug: "inventory-turnover-ratio", metric: "Inventory Turnover", value: costOfGoodsSold / Math.max(averageInventory, 1), note: "MWA cost of goods sold over average inventory" },
    { slug: "receivable-turnover-ratio", metric: "Receivable Turnover", value: salesAmount / Math.max(receivablesOutstanding, 1), note: "Sales over receivables" },
    { slug: "payable-turnover-ratio", metric: "Payable Turnover", value: purchaseAmount / Math.max(payablesOutstanding, 1), note: "Purchases over payables" },
    { slug: "debt-to-equity-ratio", metric: "Debt-to-Equity", value: totalDebt / ownerEquityBase, note: "Debt over owner equity" },
    { slug: "debt-ratio", metric: "Debt Ratio", value: totalDebt / totalAssetsBase, note: "Debt over total assets" },
    { slug: "working-capital-analysis", metric: "Working Capital", value: currentAssets - payablesOutstanding, note: "Current assets minus current liabilities" },
  ];

  if (ratioRows.some((row) => row.slug === slug)) {
    const selectedRatio = ratioRows.find((row) => row.slug === slug)!;
    const rows = [selectedRatio].map((row) => ({
      Metric: row.metric,
      Value: slug === "working-capital-analysis" ? formatReportAmount(row.value) : row.metric.includes("Margin") || row.metric === "ROA" || row.metric === "ROE" ? `${row.value.toFixed(2)}%` : row.value.toFixed(2),
      Note: row.note,
    }));

    return {
      kind: "table",
      title: reportLabel,
      description: "Ratio analysis based on current financial positions.",
      columns: ["Metric", "Value", "Note"],
      rows,
      summary: [{ label: "Measures", value: "1", tone: "blue" }],
      emptyMessage: "No ratio analysis available.",
    };
  }

  if (
    slug === "sales-dashboard" ||
    slug === "purchase-dashboard" ||
    slug === "top-selling-products" ||
    slug === "top-customers" ||
    slug === "top-suppliers" ||
    slug === "top-salespersons" ||
    slug === "monthly-sales-trend" ||
    slug === "monthly-purchase-trend" ||
    slug === "monthly-expense-trend" ||
    slug === "gross-profit-analysis" ||
    slug === "net-profit-analysis" ||
    slug === "sales-growth-analysis" ||
    slug === "purchase-trend-analysis"
  ) {
    const byMonth = Array.from(
      vouchers.reduce((map, voucher) => {
        const key = voucher.voucherDate.slice(0, 7);
        const current = map.get(key) ?? { sales: 0, purchase: 0, expense: 0 };
        if (isRealSalesInvoice(voucher)) {
          current.sales = sumMoney([current.sales, Number(voucher.amount || 0)]);
        }
        if (voucher.voucherType === "purchase") {
          current.purchase = sumMoney([current.purchase, Number(voucher.amount || 0)]);
        }
        if (voucher.voucherType === "expense") {
          current.expense = sumMoney([current.expense, Number(voucher.amount || 0)]);
        }
        map.set(key, current);
        return map;
      }, new Map<string, { sales: number; purchase: number; expense: number }>()),
    ).map(([month, totals]) => ({ month, ...totals }));

    if (slug === "sales-dashboard" || slug === "purchase-dashboard") {
      const isSales = slug === "sales-dashboard";
      const total = isSales ? salesAmount : purchaseAmount;
      const count = vouchers.filter((voucher) => (isSales ? isRealSalesInvoice(voucher) : voucher.voucherType === "purchase")).length;
      const average = count ? roundMoney(total / count) : 0;

      return {
        kind: "table",
        title: reportLabel,
        description: `${reportLabel} snapshot for the selected range.`,
        columns: ["Metric", "Value"],
        rows: [
          { Metric: "Total", Value: formatReportAmount(total) },
          { Metric: "Transactions", Value: String(count) },
          { Metric: "Average", Value: formatReportAmount(average) },
        ],
        summary: [{ label: "Snapshot", value: isSales ? formatReportAmount(salesAmount) : formatReportAmount(purchaseAmount), tone: isSales ? "green" : "orange" }],
        emptyMessage: `No ${reportLabel.toLowerCase()} data found.`,
      };
    }

    if (slug === "top-selling-products") {
      const grouped = new Map<string, { qty: number; amount: number }>();
      vouchers.filter((voucher) => isRealSalesInvoice(voucher)).forEach((voucher) => {
        (voucher.inventoryItems ?? []).forEach((item) => {
          const current = grouped.get(item.itemName) ?? { qty: 0, amount: 0 };
          current.qty += Number(item.quantity || 0);
          current.amount = sumMoney([current.amount, Number(item.quantity || 0) * Number(item.unitPrice || 0)]);
          grouped.set(item.itemName, current);
        });
      });
      const rows = Array.from(grouped.entries())
        .map(([item, row]) => ({ Item: item, Quantity: formatNumber(row.qty), Sales: formatReportAmount(row.amount) }))
        .sort((left, right) => Number(right.Sales.replace(/[^\d.-]/g, "") || 0) - Number(left.Sales.replace(/[^\d.-]/g, "") || 0))
        .slice(0, 10);

      return {
        kind: "table",
        title: reportLabel,
        description: "Top products ranked by sales value.",
        columns: ["Item", "Quantity", "Sales"],
        rows,
        summary: [{ label: "Products", value: String(rows.length), tone: "blue" }],
        emptyMessage: "No product sales data found.",
      };
    }

    if (slug === "top-customers" || slug === "top-suppliers") {
      const targetType = slug === "top-customers" ? "customer" : "supplier";
      const rows = parties
        .filter((party) => party.type === targetType)
        .map((party) => {
          const partyVouchers = vouchers.filter((voucher) => voucher.partyName.trim().toLowerCase() === party.name.trim().toLowerCase());
          const amount = targetType === "customer" ? sumRealSalesInvoiceAmount(partyVouchers) : sumVoucherAmount(partyVouchers, ["purchase"]);
          return { Name: party.name, Amount: formatReportAmount(amount), Contact: party.contact };
        })
        .sort((left, right) => Number(right.Amount.replace(/[^\d.-]/g, "") || 0) - Number(left.Amount.replace(/[^\d.-]/g, "") || 0))
        .slice(0, 10);

      return {
        kind: "table",
        title: reportLabel,
        description: `${reportLabel} ranked by transaction value.`,
        columns: ["Name", "Amount", "Contact"],
        rows,
        summary: [{ label: "Rows", value: String(rows.length), tone: "blue" }],
        emptyMessage: `No ${targetType} ranking data found.`,
      };
    }

    if (slug === "top-salespersons") {
      const grouped = Array.from(
        vouchers
          .filter((voucher) => isRealSalesInvoice(voucher))
          .reduce((map, voucher) => {
            map.set(voucher.enteredBy, sumMoney([map.get(voucher.enteredBy) ?? 0, Number(voucher.amount || 0)]));
            return map;
          }, new Map<string, number>()),
      )
        .map(([name, amount]) => ({ Salesperson: name, Sales: formatReportAmount(amount) }))
        .sort((left, right) => Number(right.Sales.replace(/[^\d.-]/g, "") || 0) - Number(left.Sales.replace(/[^\d.-]/g, "") || 0));

      return {
        kind: "table",
        title: reportLabel,
        description: "Sales ranking by voucher creator.",
        columns: ["Salesperson", "Sales"],
        rows: grouped,
        summary: [{ label: "People", value: String(grouped.length), tone: "blue" }],
        emptyMessage: "No salesperson data found.",
      };
    }

    if (slug === "monthly-sales-trend" || slug === "monthly-purchase-trend" || slug === "monthly-expense-trend" || slug === "sales-growth-analysis" || slug === "purchase-trend-analysis") {
      const rows = byMonth.map((entry, index) => {
        const value =
          slug === "monthly-sales-trend" || slug === "sales-growth-analysis"
            ? entry.sales
            : slug === "monthly-purchase-trend" || slug === "purchase-trend-analysis"
              ? entry.purchase
              : entry.expense;
        const previousValue =
          index === 0
            ? 0
            : slug === "monthly-sales-trend" || slug === "sales-growth-analysis"
              ? byMonth[index - 1]?.sales ?? 0
              : slug === "monthly-purchase-trend" || slug === "purchase-trend-analysis"
                ? byMonth[index - 1]?.purchase ?? 0
                : byMonth[index - 1]?.expense ?? 0;
        const growth = previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : 0;

        return {
          Month: entry.month,
          Amount: formatReportAmount(value),
          "Growth %": `${growth.toFixed(2)}%`,
        };
      });

      return {
        kind: "table",
        title: reportLabel,
        description: `${reportLabel} shown month by month.`,
        columns: ["Month", "Amount", "Growth %"],
        rows,
        summary: [{ label: "Months", value: String(rows.length), tone: "blue" }],
        emptyMessage: `No ${reportLabel.toLowerCase()} data found.`,
      };
    }

    if (slug === "gross-profit-analysis" || slug === "net-profit-analysis") {
      return {
        kind: "table",
        title: reportLabel,
        description: `${reportLabel} for the current reporting window.`,
        columns: ["Metric", "Value"],
        rows: [
          { Metric: "Sales", Value: formatReportAmount(salesAmount) },
          { Metric: "Gross Profit", Value: formatReportAmount(grossProfit) },
          { Metric: "Net Profit", Value: formatReportAmount(netProfit) },
        ],
        summary: [{
          label: "Profit",
          value: formatReportAmount(slug === "gross-profit-analysis" ? grossProfit : netProfit),
          tone: moneyToMinorUnits(slug === "gross-profit-analysis" ? grossProfit : netProfit) >= 0 ? "green" : "red",
        }],
        emptyMessage: "No profit analysis available.",
      };
    }
  }

  if (AUDIT_REPORT_SLUGS.has(slug)) {
    const scopedAuditRows = auditRows.filter((row) => {
      // Audit timestamps are stored as UTC. Compare them in Bangladesh time so
      // an early-morning action does not fall onto the previous report date.
      const timestamp = new Date(row.date);
      const dateKey = Number.isNaN(timestamp.getTime())
        ? row.date.slice(0, 10)
        : new Date(timestamp.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return dateKey >= fromDate && dateKey <= toDate;
    });
    if (scopedAuditRows.length > 0) {
      return {
        kind: "table",
        title: reportLabel,
        description: `${reportLabel} for this company, most recent first.`,
        columns: ["Date", "User", "Role", "Action", "Details"],
        rows: scopedAuditRows.map((row) => ({
          Date: formatActivityDateTime(row.date),
          User: row.user,
          Role: row.role || "Member",
          Action: row.action,
          Details: row.details,
        })),
        summary: [{ label: "Entries", value: String(scopedAuditRows.length), tone: "blue" }],
        emptyMessage: `No ${reportLabel.toLowerCase()} available yet.`,
      };
    }

    return createEmptyTableView(
      reportLabel,
      `${reportLabel} tracks recorded actions by their actual activity time, most recent first.`,
      ["Date", "User", "Role", "Action", "Details"],
      `No ${reportLabel.toLowerCase()} entries found for the selected activity-time range.`,
    );
  }

  if (slug === "profit-loss") {
    return {
      kind: "profit-loss",
      title: "PROFIT AND LOSS REPORT",
      description: `Statement of profitability between ${formatDate(fromDate)} and ${formatDate(toDate)}.`,
      rows: [
        { label: "Sales Revenue", amount: profitAndLoss.salesRevenue, tone: "positive" },
        { label: "Less: Sales Returns / Credit Notes", amount: profitAndLoss.salesReturns, tone: "negative", indent: true },
        { label: "Net Sales", amount: profitAndLoss.netSales, tone: moneyToMinorUnits(profitAndLoss.netSales) >= 0 ? "positive" : "negative", total: true },
        { label: "Less: Cost of Goods Sold (MWA)", amount: profitAndLoss.costOfGoodsSold, tone: "negative" },
        {
          label: "Purchase Return Cost Variance",
          amount: profitAndLoss.purchaseReturnVariance,
          tone: moneyToMinorUnits(profitAndLoss.purchaseReturnVariance) >= 0 ? "positive" : "negative",
        },
        { label: "Gross Profit", amount: profitAndLoss.grossProfit, tone: moneyToMinorUnits(profitAndLoss.grossProfit) >= 0 ? "positive" : "negative", total: true },
        { label: "Add: Other Income", amount: profitAndLoss.otherIncome, tone: "positive" },
        { label: "Less: Operating Expenses", amount: profitAndLoss.operatingExpenses, tone: "negative" },
        { label: "Net Profit / (Loss)", amount: profitAndLoss.netProfit, tone: moneyToMinorUnits(profitAndLoss.netProfit) >= 0 ? "positive" : "negative", total: true },
      ],
      summary: [
        { label: "Sales", value: formatReportAmount(profitAndLoss.salesRevenue), tone: "green" },
        { label: "COGS", value: formatReportAmount(costOfGoodsSold), tone: "orange" },
        { label: "Net Profit", value: formatReportAmount(netProfit), tone: moneyToMinorUnits(netProfit) >= 0 ? "blue" : "red" },
      ],
      otherIncomeBreakdown,
      operatingExpenseBreakdown,
      cogsFormula,
    };
  }

  if (slug === "balance-sheet") {
    if (accountTree?.length) {
      return buildChartBasedBalanceSheet({
        accountTree,
        trialBalanceRows,
        supplierNames: parties.filter((party) => party.type === "supplier").map((party) => party.name),
        closingStock,
        currentYearProfit,
        toDate,
      });
    }

    const receivables = Math.max(0, sumMoney(trialBalanceRows
        .filter((row) => row.group === "Sundry Debtors")
        .map((row) => roundMoney(row.debit - row.credit))));
    const cashAccounts = Math.max(0, sumMoney(trialBalanceRows
        .filter((row) => row.group === "Cash-in-Hand")
        .map((row) => roundMoney(row.debit - row.credit))));
    const bankAccounts = Math.max(0, sumMoney(trialBalanceRows
        .filter((row) => row.group === "Bank Accounts")
        .map((row) => roundMoney(row.debit - row.credit))));
    const creditors = Math.max(0, sumMoney(trialBalanceRows
        .filter((row) => row.group === "Sundry Creditors")
        .map((row) => roundMoney(row.credit - row.debit))));
    const loanOutstanding = sumMoney(loanRows.map((row) => row.total));
    const totalAssets = sumMoney([receivables, cashAccounts, bankAccounts, closingStock]);
    const contributedEquity = sumMoney(trialBalanceRows
      .filter((row) => /capital|retained earnings|drawings|opening balance adjustment/i.test(row.ledger))
      .filter((row) => !/current year profit|profit or loss/i.test(row.ledger))
      .map((row) => roundMoney(row.credit - row.debit)));
    const closingEquity = sumMoney([contributedEquity, currentYearProfit]);

    return {
      kind: "balance-sheet",
      title: "Balance Sheet",
      description: `Balance sheet as on ${formatDate(toDate)}.`,
      liabilities: [
        {
          title: "Equities & Liabilities",
          total: closingEquity,
          lines: [
            { label: "Capital Account", amount: contributedEquity, strong: true },
            { label: "Owner's Equity", amount: contributedEquity, indent: true },
            { label: "Reserves & Surplus", amount: currentYearProfit, strong: true },
            { label: "Current Year Profit or Loss", amount: currentYearProfit, indent: true },
          ],
        },
        {
          title: "Long-term Liabilities",
          total: loanOutstanding,
          lines: [{ label: "Loan Accounts", amount: loanOutstanding, strong: true }],
        },
        {
          title: "Current Liabilities",
          total: creditors,
          lines: [{ label: "Sundry Creditors", amount: creditors, strong: true }],
        },
      ],
      assets: [
        {
          title: "Assets",
          total: totalAssets,
          lines: [
            { label: "Fixed Assets", amount: 0, strong: true },
            { label: "Non Current Assets", amount: 0, strong: true },
            { label: "Current Assets", amount: sumMoney([receivables, bankAccounts, cashAccounts, closingStock]), strong: true },
            { label: "Sundry Debtors", amount: receivables, indent: true },
            { label: "Bank Accounts", amount: bankAccounts, indent: true },
            { label: "Cash Accounts", amount: cashAccounts, indent: true },
            { label: "Stock-in-hand", amount: closingStock, indent: true },
            { label: "Other Assets", amount: 0, strong: true },
          ],
        },
      ],
      totalLiabilities: sumMoney([closingEquity, creditors, loanOutstanding]),
      totalAssets,
    };
  }

  if (slug === "trial-balance") {
    const rows = trialBalanceRows
      .filter((row) => {
        const debit = Number(row.debit || 0);
        const credit = Number(row.credit || 0);
        return moneyToMinorUnits(debit) !== 0 || moneyToMinorUnits(credit) !== 0 || moneyToMinorUnits(Number(row.closingBalance || 0)) !== 0;
      })
      .map((row) => ({
        id: row.id,
        accountId: row.accountId,
        ledger: row.ledger,
        group: row.group,
        openingBalance: Number(row.openingBalance || 0),
        debit: row.debit,
        credit: row.credit,
        closingBalance: Number(row.closingBalance || 0),
      }));

    return {
      kind: "trial-balance",
      title: "TRIAL BALANCE REPORT",
      description: `Ledger-wise debit and credit positions as on ${formatDate(toDate)}.`,
      rows,
      totalDebit: sumMoney(rows.map((row) => row.debit)),
      totalCredit: sumMoney(rows.map((row) => row.credit)),
      totalClosingBalance: sumMoney(rows.map((row) => row.closingBalance)),
    };
  }

  if (slug === "sales-report") {
    const rows = vouchers
      .filter((voucher) => isRealSalesInvoice(voucher))
      .map((voucher) => ({
        Date: formatDate(voucher.voucherDate),
        Invoice: voucher.voucherNumber,
        Party: voucher.partyName || "-",
        Amount: formatReportAmount(voucher.amount),
        Status: voucher.status,
      }));

    return {
      kind: "table",
      title: "Sale Report",
      description: "Sales transactions posted during the selected period.",
      columns: ["Date", "Invoice", "Party", "Amount", "Status"],
      rows,
      summary: [
        { label: "Invoices", value: String(rows.length), tone: "blue" },
        { label: "Total Sales", value: formatReportAmount(salesAmount), tone: "green" },
      ],
      emptyMessage: "No sales found for the selected period.",
    };
  }

  if (slug === "purchase-report") {
    const rows = vouchers
      .filter((voucher) => voucher.voucherType === "purchase")
      .map((voucher) => ({
        Date: formatDate(voucher.voucherDate),
        Invoice: voucher.voucherNumber,
        Supplier: voucher.partyName || "-",
        Amount: formatReportAmount(voucher.amount),
        Status: voucher.status,
      }));

    return {
      kind: "table",
      title: "Purchase Report",
      description: "Purchase transactions posted during the selected period.",
      columns: ["Date", "Invoice", "Supplier", "Amount", "Status"],
      rows,
      summary: [
        { label: "Bills", value: String(rows.length), tone: "blue" },
        { label: "Total Purchase", value: formatReportAmount(purchaseAmount), tone: "orange" },
      ],
      emptyMessage: "No purchases found for the selected period.",
    };
  }

  if (slug === "all-transactions" || slug === "day-book") {
    const isDayBook = slug === "day-book";
    const rows = vouchers
      .filter((voucher) => !isReversalArtifact(voucher))
      .sort(
        (left, right) =>
          left.voucherDate.localeCompare(right.voucherDate)
          || new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
          || left.voucherNumber.localeCompare(right.voucherNumber, undefined, { numeric: true }),
      )
      .map((voucher) => ({
        Date: formatDate(voucher.voucherDate),
        Type: voucher.voucherType === "debit-note" ? "Purchase Return" : voucher.voucherType.replace(/-/g, " "),
        Voucher: voucher.voucherNumber,
        Party: voucher.partyName || "-",
        Amount: formatReportAmount(voucher.amount),
        Status: voucher.status,
      }));

    return {
      kind: "table",
      title: isDayBook ? "Day Book" : "All Transactions",
      description: isDayBook ? "Chronological voucher activity for the selected reporting period." : "",
      columns: ["Date", "Type", "Voucher", "Party", "Amount", "Status"],
      rows,
      summary: [
        { label: "Transactions", value: String(rows.length), tone: "blue" },
        { label: "Inflow", value: formatReportAmount(receipts + salesAmount), tone: "green" },
        { label: "Outflow", value: formatReportAmount(payments + purchaseAmount + expenseAmount), tone: "orange" },
      ],
      emptyMessage: isDayBook ? "No day book entries found for the selected period." : "No transactions found for the selected period.",
    };
  }

  if (slug === "bill-wise-report") {
    const maturityDaysByParty = new Map(
      dataset.parties.map((party) => [
        `${party.type}:${normalizeReportKey(party.name)}`,
        Number.isInteger(Number(party.billMaturityDays)) ? Number(party.billMaturityDays) : 30,
      ]),
    );
    const maturityDateFor = (voucher: VoucherRecord) => {
      const partyType = voucher.voucherType === "sales" ? "customer" : "supplier";
      const days = maturityDaysByParty.get(`${partyType}:${normalizeReportKey(voucher.partyName)}`) ?? 30;
      const maturityDate = new Date(`${voucher.voucherDate}T00:00:00.000Z`);
      maturityDate.setUTCDate(maturityDate.getUTCDate() + days);
      return maturityDate.toISOString().slice(0, 10);
    };
    // Purchase/Sale Orders are pre-ledger documents saved with status "pending"
    // (see voucher-entry-screen.tsx's isPreLedgerDocument) — they never reach
    // "posted", so isLiveVoucher above already excluded them from
    // allWorkspaceVouchers. Resolving the order chain needs its own,
    // status-inclusive lookup or a pending Order can never be found at all; the
    // advance PAYMENT itself is still read from allWorkspaceVouchers below, since
    // only a posted payment is real money actually moved.
    const structuralVouchers = dataset.vouchers.filter(
      (entry) => entry.workspaceId === workspaceId && entry.status !== "cancelled",
    );
    const vouchersById = new Map(structuralVouchers.map((entry) => [entry.id, entry]));
    const ORDER_DOCUMENT_KINDS = new Set(["purchase-order", "sale-order"]);
    // The document one step below an order — a receipt note for a purchase order,
    // a delivery note for a sale order — and the one a Bill/Invoice is raised from.
    const INTERMEDIATE_DOCUMENT_KINDS = new Set(["receipt-note", "delivery-note"]);
    // A combined bill (several receipt notes billed together) can only carry one
    // real sourceVoucherId — every note past the earliest-dated one only survives
    // in the bill's " + "-joined reference / line billReference text (same
    // constraint purchase-workspace-screen.tsx's buildBilledAmountsByReceiptReference
    // works around). Splitting that text back into tokens is what lets every one of
    // those notes, and the order behind each, be found — not just the first.
    function collectReferenceTokens(record: VoucherRecord) {
      const tokens = new Set<string>();
      for (const value of [record.reference, record.voucherNumber, ...record.lines.map((line) => line.billReference)]) {
        for (const part of (value ?? "").split("+")) {
          const normalized = normalizeReportKey(part);
          if (normalized) tokens.add(normalized);
        }
      }
      return tokens;
    }
    function referenceKey(partyName: string, token: string) {
      return `${normalizeReportKey(partyName)}::${token}`;
    }
    const ordersByReferenceKey = new Map<string, VoucherRecord>();
    const intermediatesByReferenceKey = new Map<string, VoucherRecord>();
    for (const entry of structuralVouchers) {
      if (!entry.documentKind) continue;
      const isOrder = ORDER_DOCUMENT_KINDS.has(entry.documentKind);
      const isIntermediate = INTERMEDIATE_DOCUMENT_KINDS.has(entry.documentKind);
      if (!isOrder && !isIntermediate) continue;
      const target = isOrder ? ordersByReferenceKey : intermediatesByReferenceKey;
      for (const token of collectReferenceTokens(entry)) {
        target.set(referenceKey(entry.partyName, token), entry);
      }
    }
    // A Purchase/Sale Order's advance is a separate Payment/Receipt voucher linked
    // only through sourceVoucherId to the ORDER itself (see voucher-entry-screen.tsx's
    // isPurchaseOrderWorkflow save) — never to the Bill/Invoice that order is later
    // converted into. Walking up from the Bill/Invoice — by id where the link
    // survived, by reference token where it didn't — is the only way to find every
    // order it descends from, so each one's advance can be pulled into this bill's
    // Paid/Balance instead of silently vanishing.
    function resolveUpstreamOrders(startVoucher: VoucherRecord): VoucherRecord[] {
      const orders = new Map<string, VoucherRecord>();
      const visited = new Set<string>([startVoucher.id]);
      function visit(record: VoucherRecord) {
        const parent = record.sourceVoucherId ? vouchersById.get(record.sourceVoucherId) : undefined;
        if (parent && !visited.has(parent.id)) {
          if (ORDER_DOCUMENT_KINDS.has(parent.documentKind ?? "")) {
            orders.set(parent.id, parent);
          } else if (INTERMEDIATE_DOCUMENT_KINDS.has(parent.documentKind ?? "")) {
            visited.add(parent.id);
            visit(parent);
          }
        }
        for (const token of collectReferenceTokens(record)) {
          const orderMatch = ordersByReferenceKey.get(referenceKey(record.partyName, token));
          if (orderMatch) {
            orders.set(orderMatch.id, orderMatch);
            continue;
          }
          const intermediateMatch = intermediatesByReferenceKey.get(referenceKey(record.partyName, token));
          if (intermediateMatch && !visited.has(intermediateMatch.id)) {
            visited.add(intermediateMatch.id);
            visit(intermediateMatch);
          }
        }
      }
      visit(startVoucher);
      return Array.from(orders.values());
    }
    // Only real Cash / Bank / MFS ledgers belong here. "Not this bill's party" is
    // not good enough as a test: one receipt can settle several customers at once,
    // and those other parties' ledgers would then be reported as if the money had
    // landed in them. A ledger qualifies only if the posting itself says it is a
    // money account, or the Chart of Accounts puts it under a money category.
    function computeMoneyLines(entry: VoucherRecord) {
      const moneyLineTotals = new Map<string, number>();
      for (const line of entry.lines) {
        if (!line.ledger) continue;
        const ledgerKey = normalizeReportKey(line.ledger);
        const group = accountIndex.resolve(line)?.parentName ?? "";
        const isMoneyLedger = Boolean(line.moneyAccountType)
          || line.costCenter === "Cash-in-Hand"
          || MONEY_ACCOUNT_GROUPS.has(normalizeReportKey(group))
          || MONEY_ACCOUNT_GROUPS.has(ledgerKey)
          || (bankAccountNames ?? []).some((name) => normalizeReportKey(name) === ledgerKey)
          || (mfsAccountNames ?? []).some((name) => normalizeReportKey(name) === ledgerKey)
          || line.ledger.toLowerCase().includes("cash");
        if (!isMoneyLedger) continue;
        // A receipt debits the money ledger while a payment credits it, so the
        // magnitude of the net movement is the amount either way.
        const moved = Math.abs(roundMoney(Number(line.debit || 0) - Number(line.credit || 0)));
        if (moneyToMinorUnits(moved) === 0) continue;
        moneyLineTotals.set(line.ledger, sumMoney([moneyLineTotals.get(line.ledger) ?? 0, moved]));
      }
      return Array.from(moneyLineTotals.entries())
        .map(([ledger, amount]) => ({ ledger, amount }))
        .sort((left, right) => right.amount - left.amount);
    }
    const unfilteredBillRows = vouchers
      .filter((voucher) => !isReversalArtifact(voucher))
      .filter(
        (voucher) =>
          isRealSalesInvoice(voucher)
          || (voucher.voucherType === "purchase" && (voucher.documentKind == null || voucher.documentKind === "bill")),
      )
      .sort(
        (left, right) =>
          left.voucherDate.localeCompare(right.voucherDate)
          || left.voucherNumber.localeCompare(right.voucherNumber, undefined, { numeric: true }),
      )
      .map((voucher) => {
        const billAmount = Number(voucher.amount || 0);
        const isSalesBill = voucher.voucherType === "sales";
        const billItemsOf = (entry: VoucherRecord): BillReportItem[] =>
          (entry.inventoryItems ?? []).map((item) => ({
            itemId: item.inventoryItemId ?? null,
            name: item.itemName,
            warehouse: item.warehouse?.name ?? "",
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || 0),
            amount: Number(item.quantity || 0) * Number(item.unitPrice || 0),
          }));
        const linkedEvents = allWorkspaceVouchers
          .filter((entry) => !isReversalArtifact(entry) && entry.id !== voucher.id)
          .flatMap((entry) => {
            const matchingLines = entry.lines.filter((line) => line.billReference === voucher.voucherNumber);
            const directlyLinked = entry.sourceVoucherId === voucher.id || entry.reference === voucher.voucherNumber;
            if (!matchingLines.length && !directlyLinked) return [];
            const isCollection = isSalesBill && entry.voucherType === "receipt";
            const isPayment = !isSalesBill && entry.voucherType === "payment";
            const isReturn = (isSalesBill && entry.voucherType === "credit-note") || (!isSalesBill && entry.voucherType === "debit-note");
            if (!isCollection && !isPayment && !isReturn) return [];
            const allocated = sumMoney(matchingLines
              .filter((line) => normalizeReportKey(line.ledger) === normalizeReportKey(voucher.partyName))
              .map((line) => isSalesBill ? Number(line.credit || 0) : Number(line.debit || 0)));
            // A split settlement has several money lines; two legs on one ledger
            // (a transfer plus a cheque drawn on the same bank) merge, since both
            // just move that one ledger.
            const moneyLines = computeMoneyLines(entry);
            const eventAmount = moneyToMinorUnits(allocated) !== 0 ? allocated : roundMoney(Number(entry.amount || 0));
            return [{
              date: entry.voucherDate,
              type: isReturn ? "Return" : isCollection ? "Collection" : "Payment",
              voucherNumber: entry.voucherNumber,
              amount: eventAmount,
              // Every linked event settles the bill down, so it always posts on
              // the side opposite the bill itself.
              debit: isSalesBill ? 0 : eventAmount,
              credit: isSalesBill ? eventAmount : 0,
              reference: entry.reference || voucher.voucherNumber,
              voucherId: entry.id,
              voucherType: entry.voucherType,
              method: moneyLines.map((line) => line.ledger).join(" + ") || "—",
              moneyLines,
              narration: entry.narration || "",
              items: billItemsOf(entry),
            }];
          });
        // An advance paid against the Order this bill descends from is real money
        // already settled against it, even though it was posted long before the
        // bill existed and carries the Order's reference/id, not this bill's.
        const advanceEvents = resolveUpstreamOrders(voucher).flatMap((order) => {
          const expectedType = order.documentKind === "purchase-order" ? "payment" : "receipt";
          return allWorkspaceVouchers
            .filter(
              (entry) => !isReversalArtifact(entry) && entry.voucherType === expectedType && entry.sourceVoucherId === order.id,
            )
            .map((entry) => {
              const eventAmount = Number(entry.amount || 0);
              const moneyLines = computeMoneyLines(entry);
              return {
                date: entry.voucherDate,
                type: "Advance Payment",
                voucherNumber: entry.voucherNumber,
                amount: eventAmount,
                debit: isSalesBill ? 0 : eventAmount,
                credit: isSalesBill ? eventAmount : 0,
                reference: entry.reference || order.reference || order.voucherNumber,
                voucherId: entry.id,
                voucherType: entry.voucherType,
                method: moneyLines.map((line) => line.ledger).join(" + ") || "—",
                moneyLines,
                narration: entry.narration || "",
                items: [] as BillReportItem[],
              };
            });
        });
        const advanceAmount = sumMoney(advanceEvents.map((event) => event.amount));
        const immediatePaid = voucher.settlementMode === "cash" || voucher.settlementMode === "bank"
          ? (Number(voucher.paidAmount || 0) || billAmount)
          : Number(voucher.paidAmount || 0);
        const paidAmount = sumMoney([
          immediatePaid,
          ...linkedEvents.filter((event) => event.type === "Collection" || event.type === "Payment").map((event) => event.amount),
          advanceAmount,
        ]);
        const returnedAmount = sumMoney(linkedEvents.filter((event) => event.type === "Return").map((event) => event.amount));
        const balance = Math.max(0, roundMoney(billAmount - paidAmount - returnedAmount));
        const maturityDate = maturityDateFor(voucher);
        return {
          Date: formatDate(voucher.voucherDate),
          "Maturity Date": formatDate(maturityDate),
          "Bill No.": voucher.voucherNumber,
          Type: voucher.voucherType === "sales" ? "Sales Invoice" : "Purchase Bill",
          Party: voucher.partyName || "-",
          "Bill Amount": formatReportAmount(billAmount),
          Return: formatReportAmount(returnedAmount),
          Paid: formatReportAmount(paidAmount),
          Balance: formatReportAmount(balance),
          Status: moneyToMinorUnits(balance) === 0 ? "Paid" : moneyToMinorUnits(paidAmount) > 0 ? "Partially Paid" : "Unpaid",
          _billAmount: String(billAmount),
          _paidAmount: String(paidAmount),
          // Returns reduce the balance just as payments do, so the figure has to
          // travel with the row — without it Bill − Paid does not reach Balance
          // and the statement cannot be reconciled by eye.
          _returnedAmount: String(returnedAmount),
          // Kept separate from _paidAmount (which it's already folded into, so
          // Balance stays Bill − Paid − Returned) purely so the detail dialog can
          // show it as its own line — otherwise an Order's advance just looks like
          // an ordinary payment with no indication of where it actually came from.
          _advanceAmount: String(advanceAmount),
          _balance: String(balance),
          _date: voucher.voucherDate,
          _settlementMode: voucher.settlementMode ?? "Not specified",
          _reference: voucher.reference ?? "-",
          _events: JSON.stringify((() => {
            const ordered = [
              {
                date: voucher.voucherDate,
                type: "Bill Created",
                voucherNumber: voucher.voucherNumber,
                amount: billAmount,
                // A cash/bank bill is raised and settled the same moment, so it
                // carries both legs on this one row; a credit bill leaves the
                // settling side blank until a real payment event arrives.
                debit: isSalesBill ? billAmount : immediatePaid,
                credit: isSalesBill ? immediatePaid : billAmount,
                reference: voucher.reference || "-",
                voucherId: voucher.id,
                voucherType: voucher.voucherType,
                method: voucher.settlementMode === "cash"
                  ? "Cash"
                  : voucher.settlementMode === "bank"
                    ? "Bank / MFS"
                    : "Credit",
                moneyLines: [],
                narration: voucher.narration || "",
                items: billItemsOf(voucher),
              },
              ...linkedEvents,
              ...advanceEvents,
            ].sort((left, right) => left.date.localeCompare(right.date) || left.voucherNumber.localeCompare(right.voucherNumber));
            // Walk the outstanding amount down event by event so the statement
            // shows how the bill got from its full value to the balance in the
            // header. A cash/bank bill is settled at creation with no separate
            // event of its own, so that payment lands on the first row. Each step
            // is floored at zero, matching the (also floored) header balance so
            // the last row always agrees with it.
            let outstanding = billAmount;
            return ordered.map((event, index) => {
              if (index === 0) outstanding = Math.max(0, roundMoney(billAmount - immediatePaid));
              else outstanding = Math.max(0, roundMoney(outstanding - event.amount));
              return { ...event, runningBalance: outstanding };
            });
          })()),
        };
      });
    const billRows = unfilteredBillRows.filter((row) => {
      if (billTypeFilter === "sales" && row.Type !== "Sales Invoice") return false;
      if (billTypeFilter === "purchase" && row.Type !== "Purchase Bill") return false;
      if (billStatusFilter === "live" && moneyToMinorUnits(Number(row._balance)) === 0) return false;
      if (billStatusFilter === "closed" && moneyToMinorUnits(Number(row._balance)) > 0) return false;
      return true;
    });
    const totalBillAmount = sumMoney(billRows.map((row) => Number(row._billAmount)));
    const totalReturned = sumMoney(billRows.map((row) => Number(row._returnedAmount)));
    const totalPaid = sumMoney(billRows.map((row) => Number(row._paidAmount)));
    const totalBalance = sumMoney(billRows.map((row) => Number(row._balance)));
    const billDetails: BillReportDetail[] = billRows.map((row) => ({
      voucherNumber: row["Bill No."],
      date: row._date,
      type: row.Type,
      party: row.Party,
      billAmount: Number(row._billAmount),
      paidAmount: Number(row._paidAmount),
      returnedAmount: Number(row._returnedAmount),
      advanceAmount: Number(row._advanceAmount),
      balance: Number(row._balance),
      status: row.Status,
      settlementMode: row._settlementMode,
      reference: row._reference,
      events: JSON.parse(row._events) as BillReportDetail["events"],
    }));
    const rows = billRows.map(({ _billAmount, _paidAmount, _returnedAmount, _advanceAmount, _balance, _date, _settlementMode, _reference, _events, ...row }) => {
      void [_billAmount, _paidAmount, _returnedAmount, _advanceAmount, _balance, _date, _settlementMode, _reference, _events];
      return row;
    });

    return {
      kind: "table",
      title: "Bill Wise Report",
      description: "Sales invoices and purchase bills with paid and outstanding balances for the selected period.",
      columns: ["Date", "Maturity Date", "Bill No.", "Type", "Party", "Bill Amount", "Return", "Paid", "Balance", "Status"],
      rows,
      billDetails,
      summary: [
        { label: "Bills", value: String(rows.length), tone: "blue" },
        { label: "Bill Amount", value: formatReportAmount(totalBillAmount), tone: "orange" },
        { label: "Returned", value: formatReportAmount(totalReturned), tone: "red" },
        { label: "Paid", value: formatReportAmount(totalPaid), tone: "green" },
        { label: "Outstanding", value: formatReportAmount(totalBalance), tone: moneyToMinorUnits(totalBalance) > 0 ? "red" : "blue" },
      ],
      emptyMessage: "No sales or purchase bills found for the selected period.",
    };
  }

  if (slug === "bill-wise-profit") {
    const profitDocuments = vouchers
      .filter((voucher) => isRealSalesInvoice(voucher) || voucher.voucherType === "credit-note")
      .map((voucher) => {
        const sign = voucher.voucherType === "credit-note" ? -1 : 1;
        const sales = sign * Number(voucher.amount || 0);
        const cost = sign * getVoucherInventoryCost(dataset, voucher).total;
        return {
          type: voucher.voucherType === "credit-note" ? "Sales Return" : "Sales Invoice",
          voucherNumber: voucher.voucherNumber,
          party: voucher.partyName || "-",
          sales,
          cost,
          profit: roundMoney(sales - cost),
        };
      });
    const rows = profitDocuments.map((document) => ({
          Type: document.type,
          Invoice: document.voucherNumber,
          Party: document.party,
          Sales: formatReportAmount(document.sales),
          Cost: formatReportAmount(document.cost),
          Profit: formatReportAmount(document.profit),
        }));
    const billGrossProfit = sumMoney(profitDocuments.map((document) => document.profit));

    return {
      kind: "table",
      title: "Bill Wise Profit",
      description: "Voucher-level gross profit using sale-time moving weighted average cost, including sales returns.",
      columns: ["Type", "Invoice", "Party", "Sales", "Cost", "Profit"],
      rows,
      summary: [
        { label: "Documents", value: String(rows.length), tone: "blue" },
        { label: "Gross Profit", value: formatReportAmount(billGrossProfit), tone: moneyToMinorUnits(billGrossProfit) >= 0 ? "green" : "red" },
      ],
      emptyMessage: "No sales invoices or sales returns found for bill-wise profit.",
    };
  }

  if (slug === "cashflow-statement") {
    const movements = accountingVouchers
      .flatMap((voucher) => voucher.lines.map((line) => ({
        voucher,
        line,
        channel: getCashFlowLineChannel(line, bankAccountNames, mfsAccountNames, accountIndex.resolve),
        amount: roundMoney(Number(line.debit || 0) - Number(line.credit || 0)),
      })))
      .filter((movement) => movement.channel && (cashFlowChannel === "all" || movement.channel === cashFlowChannel));
    const sumMovement = (predicate: (voucher: VoucherRecord) => boolean) => sumMoney(movements
      .filter((movement) => predicate(movement.voucher))
      .map((movement) => movement.amount));
    const customerMovement = sumMovement((voucher) => ["sales", "receipt", "credit-note"].includes(voucher.voucherType));
    const supplierMovement = sumMovement((voucher) => ["purchase", "payment", "debit-note"].includes(voucher.voucherType));
    const expenseMovement = sumMovement((voucher) => voucher.voucherType === "expense");
    const loanMovement = sumMoney(movements
      .filter((movement) => movement.voucher.lines.some((line) => normalizeReportKey(line.ledger).includes("loan")))
      .map((movement) => movement.amount));
    const classifiedVoucherIds = new Set(movements
      .filter((movement) =>
        ["sales", "receipt", "credit-note", "purchase", "payment", "debit-note", "expense"].includes(movement.voucher.voucherType)
        || movement.voucher.lines.some((line) => normalizeReportKey(line.ledger).includes("loan")),
      )
      .map((movement) => movement.voucher.id));
    const otherMovement = sumMoney(movements
      .filter((movement) => !classifiedVoucherIds.has(movement.voucher.id))
      .map((movement) => movement.amount));
    const totalInflow = sumMoney(movements.map((movement) => Math.max(0, movement.amount)));
    const totalOutflow = sumMoney(movements.map((movement) => Math.max(0, -movement.amount)));
    const netMovement = roundMoney(totalInflow - totalOutflow);
    const channelLabel = cashFlowChannel === "all" ? "All Channels" : cashFlowChannel === "mfs" ? "MFS" : cashFlowChannel[0].toUpperCase() + cashFlowChannel.slice(1);
    const cashEquivalentLedgers: Array<{ node: AccountNode; channel: Exclude<CashFlowChannel, "all"> }> = [];
    const collectCashEquivalentLedgers = (node: AccountNode) => {
      if (node.level === "LEDGER") {
        const type = reportMoneyAccountType(accountIndex.byId.get(node.id));
        if (type) cashEquivalentLedgers.push({
          node,
          channel: type === "CASH" ? "cash" : type === "BANK" ? "bank" : "mfs",
        });
      }
      node.children.forEach(collectCashEquivalentLedgers);
    };
    accountTree?.forEach(collectCashEquivalentLedgers);
    const cashEquivalentRows = cashEquivalentLedgers
      .filter((ledger) => cashFlowChannel === "all" || ledger.channel === cashFlowChannel)
      .map(({ node, channel }) => {
        const matchesLedger = (line: VoucherRecord["lines"][number]) => line.accountId
          ? line.accountId === node.id
          : normalizeReportKey(line.ledger) === normalizeReportKey(node.name);
        const hasOpeningJournal = allWorkspaceAccountingVouchers.some((voucher) =>
          voucher.documentKind === "opening-balance"
          && voucher.lines.some((line) => line.accountId === node.id),
        );
        const openingFromAccount = !hasOpeningJournal && (!node.openingBalanceDate || node.openingBalanceDate <= fromDate)
          ? Number(node.openingBalance || 0)
          : 0;
        const openingFromPostings = sumMoney(allWorkspaceAccountingVouchers
          .filter((voucher) => voucher.voucherDate < fromDate)
          .flatMap((voucher) => voucher.lines)
          .filter(matchesLedger)
          .map((line) => roundMoney(Number(line.debit || 0) - Number(line.credit || 0))));
        const periodMovements = accountingVouchers
          .flatMap((voucher) => voucher.lines)
          .filter(matchesLedger)
          .map((line) => roundMoney(Number(line.debit || 0) - Number(line.credit || 0)));
        const moneyIn = sumMoney(periodMovements.map((amount) => Math.max(0, amount)));
        const moneyOut = sumMoney(periodMovements.map((amount) => Math.max(0, -amount)));
        const opening = sumMoney([openingFromAccount, openingFromPostings]);
        return { ledgerId: node.id, ledger: node.name, channel, opening, moneyIn, moneyOut, closing: sumMoney([opening, moneyIn, -moneyOut]) };
      })
      .sort((left, right) => left.channel.localeCompare(right.channel) || left.ledger.localeCompare(right.ledger));
    const rows = [
      { Section: "Operating", Particulars: "Customer receipts", Amount: formatReportAmount(Math.abs(customerMovement)), Direction: moneyToMinorUnits(customerMovement) >= 0 ? "Inflow" : "Outflow" },
      { Section: "Operating", Particulars: "Supplier payments", Amount: formatReportAmount(Math.abs(supplierMovement)), Direction: moneyToMinorUnits(supplierMovement) >= 0 ? "Inflow" : "Outflow" },
      { Section: "Operating", Particulars: "Expense payments", Amount: formatReportAmount(Math.abs(expenseMovement)), Direction: moneyToMinorUnits(expenseMovement) >= 0 ? "Inflow" : "Outflow" },
      { Section: "Financing", Particulars: "Loan movements", Amount: formatReportAmount(Math.abs(loanMovement)), Direction: moneyToMinorUnits(loanMovement) > 0 ? "Inflow" : moneyToMinorUnits(loanMovement) < 0 ? "Outflow" : "No movement" },
      { Section: "Other", Particulars: "Transfers and other movements", Amount: formatReportAmount(Math.abs(otherMovement)), Direction: moneyToMinorUnits(otherMovement) > 0 ? "Inflow" : moneyToMinorUnits(otherMovement) < 0 ? "Outflow" : "No movement" },
      { Section: "Net", Particulars: "Net money movement", Amount: formatReportAmount(netMovement), Direction: "Closing" },
    ].filter((row) => row.Section === "Net" || moneyToMinorUnits(Number(String(row.Amount).replace(/[^0-9.-]/g, ""))) !== 0);

    return {
      kind: "table",
      title: "Cash Flow Statement",
      description: `${channelLabel} operating and financing movement for the selected reporting period.`,
      columns: ["Section", "Particulars", "Amount", "Direction"],
      rows,
      summary: [
        { label: "Money In", value: formatReportAmount(totalInflow), tone: "green" },
        { label: "Money Out", value: formatReportAmount(totalOutflow), tone: "orange" },
        { label: "Net", value: formatReportAmount(netMovement), tone: moneyToMinorUnits(netMovement) >= 0 ? "blue" : "red" },
      ],
      cashEquivalentRows,
      emptyMessage: "No cash movement found for the selected period.",
    };
  }

  if (slug === "party-statement") {
    const partyRows = parties.map((party) => {
      const partyVouchers = vouchers.filter((voucher) => voucher.partyName.trim().toLowerCase() === party.name.trim().toLowerCase());
      const sales = sumVoucherAmount(partyVouchers, ["sales", "receipt"]);
      const purchase = sumVoucherAmount(partyVouchers, ["purchase", "payment"]);
      return {
        Party: party.name,
        Type: party.type === "customer" ? "Customer" : "Supplier",
        Contact: party.contact,
        Movement: formatReportAmount(sumMoney([sales, purchase])),
        Status: party.status,
      };
    });

    return {
      kind: "table",
      title: "Party Statement",
      description: "Commercial relationship summary for each active party in the current workspace.",
      columns: ["Party", "Type", "Contact", "Movement", "Status"],
      rows: partyRows,
      summary: [
        { label: "Active Parties", value: String(partyRows.length), tone: "blue" },
        { label: "Customers", value: String(partyRows.filter((row) => row.Type === "Customer").length), tone: "green" },
        { label: "Suppliers", value: String(partyRows.filter((row) => row.Type === "Supplier").length), tone: "orange" },
      ],
      emptyMessage: "No active parties found.",
    };
  }

  if (slug === "party-wise-profit-loss") {
    const partyResults = parties.map((party) => {
      const partyVouchers = vouchers.filter((voucher) => voucher.partyName.trim().toLowerCase() === party.name.trim().toLowerCase());
      const salesInvoices = partyVouchers.filter(isRealSalesInvoice);
      const salesReturns = partyVouchers.filter((voucher) => voucher.voucherType === "credit-note");
      const partySales = roundMoney(sumRealSalesInvoiceAmount(salesInvoices) - sumVoucherAmount(salesReturns, ["credit-note"]));
      const partySalesCost = sumMoney([
        ...salesInvoices.map((voucher) => getVoucherInventoryCost(dataset, voucher).total),
        ...salesReturns.map((voucher) => -getVoucherInventoryCost(dataset, voucher).total),
      ]);
      const partyPurchase = roundMoney(sumVoucherAmount(partyVouchers, ["purchase"]) - sumVoucherAmount(partyVouchers, ["debit-note"]));
      return {
        party: party.name,
        type: party.type === "customer" ? "Customer" : "Supplier",
        sales: partySales,
        cost: party.type === "customer" ? partySalesCost : partyPurchase,
        profit: party.type === "customer" ? roundMoney(partySales - partySalesCost) : roundMoney(-partyPurchase),
      };
    });
    const partyRows = partyResults.map((party) => ({
      Party: party.party,
      Type: party.type,
      Sales: formatReportAmount(party.sales),
      "MWA Cost / Net Purchase": formatReportAmount(party.cost),
      Profit: formatReportAmount(party.profit),
    }));
    const partyNetProfit = sumMoney(partyResults.map((party) => party.profit));

    return {
      kind: "table",
      title: "Party wise Profit & Loss",
      description: "Party-level commercial contribution across sales and purchase activity.",
      columns: ["Party", "Type", "Sales", "MWA Cost / Net Purchase", "Profit"],
      rows: partyRows,
      summary: [
        { label: "Rows", value: String(partyRows.length), tone: "blue" },
        { label: "Net", value: formatReportAmount(partyNetProfit), tone: moneyToMinorUnits(partyNetProfit) >= 0 ? "green" : "red" },
      ],
      emptyMessage: "No party contribution data found.",
    };
  }

  if (slug === "all-parties-report") {
    const partyRows = parties.map((party) => ({
      "Party Name": party.name,
      Type: party.type === "customer" ? "Customer" : "Supplier",
      Contact: party.contact,
      Address: party.address,
      "Credit Limit": formatReportAmount(party.creditLimit),
    }));

    return {
      kind: "table",
      title: "All Parties",
      description: "Master list of all active parties available in the workspace.",
      columns: ["Party Name", "Type", "Contact", "Address", "Credit Limit"],
      rows: partyRows,
      summary: [{ label: "Parties", value: String(partyRows.length), tone: "blue" }],
      emptyMessage: "No party master data found.",
    };
  }

  if (slug === "party-report-by-item") {
    const grouped = new Map<string, { party: string; item: string; quantity: number; amount: number }>();
    vouchers.forEach((voucher) => {
      (voucher.inventoryItems ?? []).forEach((item) => {
        const key = `${voucher.partyName}::${item.itemName}`;
        const current = grouped.get(key) ?? { party: voucher.partyName || "-", item: item.itemName, quantity: 0, amount: 0 };
        current.quantity += Number(item.quantity || 0);
        current.amount = sumMoney([current.amount, Number(item.quantity || 0) * Number(item.unitPrice || 0)]);
        grouped.set(key, current);
      });
    });

    const rows = Array.from(grouped.values()).map((row) => ({
      Party: row.party,
      Item: row.item,
      Quantity: formatNumber(row.quantity),
      Amount: formatReportAmount(row.amount),
    }));

    return {
      kind: "table",
      title: "Party Report By Item",
      description: "Item-level movement grouped by commercial party.",
      columns: ["Party", "Item", "Quantity", "Amount"],
      rows,
      summary: [{ label: "Combinations", value: String(rows.length), tone: "blue" }],
      emptyMessage: "No party-item movement found.",
    };
  }

  if (slug === "sale-purchase-by-party" || slug === "sale-purchase-by-party-group") {
    const grouped = new Map<string, { label: string; sales: number; purchase: number }>();
    parties.forEach((party) => {
      const key = slug === "sale-purchase-by-party-group" ? party.type : party.name;
      const label = slug === "sale-purchase-by-party-group" ? (party.type === "customer" ? "Customers" : "Suppliers") : party.name;
      const current = grouped.get(key) ?? { label, sales: 0, purchase: 0 };
      const partyVouchers = vouchers.filter((voucher) => voucher.partyName.trim().toLowerCase() === party.name.trim().toLowerCase());
      current.sales = sumMoney([current.sales, sumRealSalesInvoiceAmount(partyVouchers)]);
      current.purchase = sumMoney([current.purchase, sumVoucherAmount(partyVouchers, ["purchase"])]);
      grouped.set(key, current);
    });

    const rows = Array.from(grouped.values()).map((row) => ({
      Group: row.label,
      Sales: formatReportAmount(row.sales),
      Purchase: formatReportAmount(row.purchase),
      Balance: formatReportAmount(roundMoney(row.sales - row.purchase)),
    }));

    return {
      kind: "table",
      title: slug === "sale-purchase-by-party" ? "Sale Purchase By Party" : "Sale Purchase By Party Group",
      description: "Commercial movement comparison between sales and purchase volume.",
      columns: ["Group", "Sales", "Purchase", "Balance"],
      rows,
      summary: [{ label: "Rows", value: String(rows.length), tone: "blue" }],
      emptyMessage: "No party totals available.",
    };
  }

  if (slug === "stock-summary" || slug === "stock-detail" || slug === "item-detail") {
    const rows = stockItems.map((item) => ({
      "Item Code": item.itemCode,
      "Item Name": item.itemName,
      Category: item.category,
      Unit: item.unit,
      Quantity: formatNumber(item.qty),
      Rate: formatReportAmount(item.rate),
      Value: formatReportAmount(item.qty * item.rate),
      _itemId: findInventoryItemId(item.itemCode, item.itemName),
    }));

    return {
      kind: "table",
      title: slug === "stock-summary" ? "Stock Summary" : slug === "stock-detail" ? "Stock Detail" : "Item Detail",
      description: "Current stock position derived from opening stock and posted inventory vouchers.",
      columns: ["Item Code", "Item Name", "Category", "Unit", "Quantity", "Rate", "Value"],
      rows,
      summary: [
        { label: "Items", value: String(rows.length), tone: "blue" },
        { label: "Closing Value", value: formatReportAmount(closingStock), tone: "green" },
      ],
      emptyMessage: "No stock items found in the workspace.",
    };
  }

  if (slug === "item-report-by-party") {
    const rows = vouchers.flatMap((voucher) =>
      (voucher.inventoryItems ?? []).map((item) => ({
        Item: item.itemName,
        Party: voucher.partyName || "-",
        Type: voucher.voucherType,
        Quantity: formatNumber(Number(item.quantity || 0)),
        Value: formatReportAmount(Number(item.quantity || 0) * Number(item.unitPrice || 0)),
      })),
    );

    return {
      kind: "table",
      title: "Item Report By Party",
      description: "See which party is linked with each stock movement line.",
      columns: ["Item", "Party", "Type", "Quantity", "Value"],
      rows,
      summary: [{ label: "Lines", value: String(rows.length), tone: "blue" }],
      emptyMessage: "No item movement available.",
    };
  }

  if (slug === "item-wise-profit-loss") {
    const grouped = new Map<string, { sales: number; qty: number; cost: number }>();
    vouchers
      .filter((voucher) => isRealSalesInvoice(voucher) || voucher.voucherType === "credit-note")
      .forEach((voucher) => {
        const sign = voucher.voucherType === "credit-note" ? -1 : 1;
        const voucherCost = getVoucherInventoryCost(dataset, voucher);
        const lineValueFactor = getVoucherLineValueFactor(voucher);
        (voucher.inventoryItems ?? []).forEach((item) => {
          const current = grouped.get(item.itemName) ?? { sales: 0, qty: 0, cost: 0 };
          const quantity = Number(item.quantity || 0);
          current.sales = sumMoney([current.sales, sign * quantity * Number(item.unitPrice || 0) * lineValueFactor]);
          current.qty += sign * quantity;
          current.cost = sumMoney([current.cost, sign * consumeInventoryItemCost(voucherCost, item)]);
          grouped.set(item.itemName, current);
        });
      });

    const rows = Array.from(grouped.entries()).map(([itemName, row]) => ({
      Item: itemName,
      Quantity: formatNumber(row.qty),
      Sales: formatReportAmount(row.sales),
      Cost: formatReportAmount(row.cost),
      Profit: formatReportAmount(roundMoney(row.sales - row.cost)),
      _itemId: findInventoryItemId(undefined, itemName),
    }));

    return {
      kind: "table",
      title: "Item Wise Profit And Loss",
      description: "Item contribution using sale-time moving weighted average cost.",
      columns: ["Item", "Quantity", "Sales", "Cost", "Profit"],
      rows,
      summary: [{ label: "Items", value: String(rows.length), tone: "blue" }],
      emptyMessage: "No item-wise sales profit data found.",
    };
  }

  if (slug === "item-category-wise-profit-loss" || slug === "sale-purchase-report-by-item-category" || slug === "stock-summary-report-by-item-category") {
    const grouped = new Map<string, { sales: number; purchase: number; stock: number; cost: number }>();
    stockItems.forEach((item) => {
      const current = grouped.get(item.category) ?? { sales: 0, purchase: 0, stock: 0, cost: 0 };
      current.stock = sumMoney([current.stock, item.qty * item.rate]);
      grouped.set(item.category, current);
    });
    vouchers.forEach((voucher) => {
      const salesSign = isRealSalesInvoice(voucher) ? 1 : voucher.voucherType === "credit-note" ? -1 : 0;
      const saleCost = salesSign ? getVoucherInventoryCost(dataset, voucher) : null;
      const lineValueFactor = getVoucherLineValueFactor(voucher);
      (voucher.inventoryItems ?? []).forEach((item) => {
        const category = getStockCategory(stockItems, item.itemName);
        const current = grouped.get(category) ?? { sales: 0, purchase: 0, stock: 0, cost: 0 };
        const value = Number(item.quantity || 0) * Number(item.unitPrice || 0) * lineValueFactor;
        current.sales = sumMoney([current.sales, salesSign * value]);
        if (voucher.voucherType === "purchase") {
          current.purchase = sumMoney([current.purchase, value]);
        } else if (voucher.voucherType === "debit-note") {
          current.purchase = sumMoney([current.purchase, -value]);
        }
        if (saleCost) current.cost = sumMoney([current.cost, salesSign * consumeInventoryItemCost(saleCost, item)]);
        grouped.set(category, current);
      });
    });

    const rows = Array.from(grouped.entries()).map(([category, row]) => ({
      Category: category,
      Sales: formatReportAmount(row.sales),
      Purchase: formatReportAmount(row.purchase),
      "Stock Value": formatReportAmount(row.stock),
      Profit: formatReportAmount(roundMoney(row.sales - row.cost)),
    }));

    return {
      kind: "table",
      title:
        slug === "item-category-wise-profit-loss"
          ? "Item Category Wise Profit And Loss"
          : slug === "sale-purchase-report-by-item-category"
            ? "Sale/ Purchase Report By Item Category"
            : "Stock Summary Report By Item Category",
      description: "Category-level commercial and stock contribution summary.",
      columns: ["Category", "Sales", "Purchase", "Stock Value", "Profit"],
      rows,
      summary: [{ label: "Categories", value: String(rows.length), tone: "blue" }],
      emptyMessage: "No category summary found.",
    };
  }

  if (slug === "low-stock-summary") {
    const rows = stockItems
      .filter((item) => item.reorderLevel > 0 && item.qty <= item.reorderLevel)
      .map((item) => ({
        "Item Code": item.itemCode,
        "Item Name": item.itemName,
        Quantity: formatNumber(item.qty),
        "Reorder Level": formatNumber(item.reorderLevel),
        Gap: formatNumber(item.reorderLevel - item.qty),
      }));

    return {
      kind: "table",
      title: "Low Stock Summary",
      description: "Stock items that have already touched or crossed their reorder level.",
      columns: ["Item Code", "Item Name", "Quantity", "Reorder Level", "Gap"],
      rows,
      summary: [{ label: "Alerts", value: String(rows.length), tone: rows.length ? "red" : "green" }],
      emptyMessage: "No low stock alerts in the selected workspace.",
    };
  }

  if (slug === "item-wise-discount") {
    const rows = vouchers
      .filter((voucher) => moneyToMinorUnits(Number(voucher.discountAmount || 0)) > 0)
      .flatMap((voucher) =>
        (voucher.inventoryItems ?? []).map((item) => ({
          Voucher: voucher.voucherNumber,
          Item: item.itemName,
          Quantity: formatNumber(Number(item.quantity || 0)),
          Discount: formatReportAmount(Number(voucher.discountAmount || 0)),
          _itemId: item.inventoryItemId ?? findInventoryItemId(undefined, item.itemName),
        })),
      );

    return {
      kind: "table",
      title: "Item Wise Discount",
      description: "Discount-bearing voucher lines grouped at item level.",
      columns: ["Voucher", "Item", "Quantity", "Discount"],
      rows,
      summary: [{ label: "Discount Lines", value: String(rows.length), tone: rows.length ? "orange" : "blue" }],
      emptyMessage: "No discounted item lines found for the selected period.",
    };
  }

  if (slug === "bank-statement") {
    const rows = vouchers
      .filter((voucher) => voucher.settlementMode !== "cash" || voucher.lines.some((line) => line.ledger.toLowerCase().includes("bank")))
      .map((voucher) => ({
        Date: formatDate(voucher.voucherDate),
        Voucher: voucher.voucherNumber,
        Particulars: voucher.partyName || voucher.particulars,
        Amount: formatReportAmount(voucher.amount),
        Channel:
          voucher.settlementMode === "cash"
            ? "Cash Transfer"
            : voucher.settlementMode === "bank"
              ? (voucher.lines.some((line) => line.ledger === "Mobile Financial Service Accounts") ? "MFS" : "Bank")
              : "Bank",
      }));

    return {
      kind: "table",
      title: "Bank Statement",
      description: "Voucher movement linked to bank settlement and bank ledger activity.",
      columns: ["Date", "Voucher", "Particulars", "Amount", "Channel"],
      rows,
      summary: [{ label: "Bank Entries", value: String(rows.length), tone: "blue" }],
      emptyMessage: "No bank-related entries found.",
    };
  }

  if (slug === "discount-report") {
    const rows = vouchers
      .filter((voucher) => moneyToMinorUnits(Number(voucher.discountAmount || 0)) > 0)
      .map((voucher) => ({
        Date: formatDate(voucher.voucherDate),
        Voucher: voucher.voucherNumber,
        Party: voucher.partyName || "-",
        "Discount Type": voucher.discountType || "fixed",
        Discount: formatReportAmount(Number(voucher.discountAmount || 0)),
      }));

    return {
      kind: "table",
      title: "Discount Report",
      description: "Voucher-level discounts recorded inside the selected report period.",
      columns: ["Date", "Voucher", "Party", "Discount Type", "Discount"],
      rows,
      summary: [{ label: "Discount Vouchers", value: String(rows.length), tone: rows.length ? "orange" : "blue" }],
      emptyMessage: "No discounts were recorded during this period.",
    };
  }

  if (slug === "tax-report" || slug === "tax-rate-report") {
    const taxDetailRows = vouchers
      .flatMap((voucher) =>
        voucher.lines
          .filter((line) => line.ledger.toLowerCase().includes("tax") || line.description.toLowerCase().includes("tax"))
          .map((line) => ({
            Tax: line.ledger,
            Date: formatDate(voucher.voucherDate),
            Voucher: voucher.voucherNumber,
            Debit: formatReportAmount(Number(line.debit || 0)),
            Credit: formatReportAmount(Number(line.credit || 0)),
          })),
      );
    const taxRows = slug === "tax-rate-report"
      ? Array.from(taxDetailRows.reduce((totals, row) => {
          const current = totals.get(row.Tax) ?? { debit: 0, credit: 0 };
          totals.set(row.Tax, {
            debit: sumMoney([current.debit, Number(row.Debit.replace(/[^0-9.-]/g, ""))]),
            credit: sumMoney([current.credit, Number(row.Credit.replace(/[^0-9.-]/g, ""))]),
          });
          return totals;
        }, new Map<string, { debit: number; credit: number }>()).entries()).map(([tax, totals]) => ({
          Tax: tax,
          Date: `${formatDate(fromDate)} - ${formatDate(toDate)}`,
          Voucher: "Summary",
          Debit: formatReportAmount(totals.debit),
          Credit: formatReportAmount(totals.credit),
        }))
      : taxDetailRows;

    return {
      kind: "table",
      title: slug === "tax-report" ? "Tax Report" : "Tax Rate report",
      description: "Ledger lines containing tax references from the selected period.",
      columns: ["Tax", "Date", "Voucher", "Debit", "Credit"],
      rows: taxRows,
      summary: [{ label: "Tax Rows", value: String(taxRows.length), tone: taxRows.length ? "orange" : "blue" }],
      emptyMessage: "No tax-related lines found in the selected period.",
    };
  }

  if (slug === "expense-report" || slug === "expense-category-report" || slug === "expense-item-report") {
    const expenseVouchers = vouchers.filter((voucher) => voucher.voucherType === "expense");
    if (slug === "expense-category-report") {
      const rows = Array.from(
        expenseVouchers.reduce((map, voucher) => {
          const key = voucher.particulars || "General Expense";
          map.set(key, sumMoney([map.get(key) ?? 0, voucher.amount]));
          return map;
        }, new Map<string, number>()),
      ).map(([category, amount]) => ({
        category,
        categoryType: "Indirect Expense",
        amount,
      }));

      return {
        kind: "expense-category",
        title: "EXPENSE",
        description: "Expense categories grouped for the selected period.",
        rows,
        totalExpense: sumMoney(rows.map((row) => row.amount)),
      };
    }

    if (slug === "expense-item-report") {
      const rows = expenseVouchers.map((voucher) => ({
        item: voucher.particulars || "Expense Item",
        unitPrice: Number(voucher.amount || 0),
        quantity: 1,
        amount: Number(voucher.amount || 0),
        voucherId: voucher.id,
      }));

      return {
        kind: "expense-item",
        title: "Expense Item Report",
        description: "Expense items with quantity and amount details.",
        rows,
        totalQuantity: rows.reduce((total, row) => total + row.quantity, 0),
        totalAmount: sumMoney(rows.map((row) => row.amount)),
      };
    }

    const rows = expenseVouchers.map((voucher) => ({
      Date: formatDate(voucher.voucherDate),
      Voucher: voucher.voucherNumber,
      Particulars: voucher.particulars,
      Party: voucher.partyName || "-",
      Amount: formatReportAmount(voucher.amount),
    }));

    return {
      kind: "table",
      title: "Expense",
      description: "Expense movement classified for operational review.",
      columns: rows[0] ? Object.keys(rows[0]) : ["Date", "Voucher", "Particulars", "Party", "Amount"],
      rows,
      summary: [{ label: "Expense Total", value: formatReportAmount(expenseAmount), tone: "orange" }],
      emptyMessage: "No expense vouchers found for the selected period.",
    };
  }

  if (slug === "sale-orders-report" || slug === "sale-order-item-report") {
    const rows = vouchers
      .filter((voucher) => voucher.voucherType === "sales" && voucher.documentKind === "sale-order")
      .map((voucher) => ({
        date: voucher.voucherDate,
        orderNo: voucher.voucherNumber,
        name: voucher.partyName || "-",
        dueDate: voucher.voucherDate,
        status: voucher.status,
        type: voucher.settlementMode === "cash" ? "Cash" : "Credit",
        total: Number(voucher.amount || 0),
        advance: voucher.settlementMode === "cash" ? Number(voucher.amount || 0) : 0,
        balance: voucher.settlementMode === "cash" ? 0 : Number(voucher.amount || 0),
      }));

    return {
      kind: "sale-orders",
      title: slug === "sale-orders-report" ? "Sale Orders" : "Sale Order Item",
      description: "Order-wise sales view with due and advance positions.",
      rows,
      totalAmount: sumMoney(rows.map((row) => row.total)),
    };
  }

  if (slug === "loan-statement") {
    const accountOptions = Array.from(new Set(loanRows.map((row) => row.accountName)));
    const selectedAccount = accountOptions.includes(selectedLoanAccount) ? selectedLoanAccount : accountOptions[0] ?? "";
    let runningBalance = 0;
    const rows = loanRows
      .filter((row) => row.accountName === selectedAccount && row.date >= fromDate && row.date <= toDate)
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((row) => {
        if (row.type === "Opening Loan" || row.type === "Loan Top Up") {
          runningBalance = sumMoney([runningBalance, row.total]);
        } else if (row.type === "Loan Payment") {
          runningBalance = sumMoney([runningBalance, -row.principal]);
        }

        return {
          date: row.date,
          type: row.type,
          amount: row.total,
          endingBalance: runningBalance,
        };
      });
    const openingBalance = rows[0]?.endingBalance ?? 0;
    const balanceDue = rows.at(-1)?.endingBalance ?? 0;
    const totalPrincipalPaid = sumMoney(loanRows
      .filter((row) => row.accountName === selectedAccount && row.type === "Loan Payment")
      .map((row) => row.principal));
    const totalInterestPaid = sumMoney(loanRows
      .filter((row) => row.accountName === selectedAccount && row.type === "Loan Payment")
      .map((row) => row.charges));

    return {
      kind: "loan-statement",
      title: "Loan Statement",
      description: "Loan movements pulled from the current loan accounts workspace.",
      accountOptions,
      selectedAccount,
      rows,
      openingBalance,
      balanceDue,
      totalPrincipalPaid,
      totalInterestPaid,
    };
  }

  if (slug === "stock-summary-report-by-item-category") {
    return createEmptyTableView(
      "Stock Summary Report By Item Category",
      "Category summary will grow automatically with more stock movement.",
      ["Category", "Stock Value", "Items"],
      "No category summary found.",
    );
  }

  return createEmptyTableView("Report", "This report layout will appear here.", ["Particulars", "Amount"], "No data available.");
}

export function buildChartBasedBalanceSheet({
  accountTree,
  trialBalanceRows,
  supplierNames,
  closingStock,
  currentYearProfit,
  toDate,
}: {
  accountTree: AccountNode[];
  trialBalanceRows: Array<{ accountId?: string; ledger: string; group: string; debit: number; credit: number }>;
  supplierNames: string[];
  closingStock: number;
  currentYearProfit: number;
  toDate: string;
}): BalanceSheetView {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const accountNodesById = new Map<string, AccountNode>();
  const accountNodesByCode = new Map<string, AccountNode>();
  const accountNodesByName = new Map<string, AccountNode[]>();
  const ledgerNodesByName = new Map<string, AccountNode[]>();
  const allAccountNodes: AccountNode[] = [];

  const indexNode = (node: AccountNode) => {
    allAccountNodes.push(node);
    accountNodesById.set(node.id, node);
    accountNodesByCode.set(node.code, node);
    const nameKey = normalize(node.name);
    accountNodesByName.set(nameKey, [...(accountNodesByName.get(nameKey) ?? []), node]);
    if (node.level === "LEDGER") {
      ledgerNodesByName.set(nameKey, [...(ledgerNodesByName.get(nameKey) ?? []), node]);
    }
    node.children.forEach(indexNode);
  };
  accountTree.forEach(indexNode);
  const uniqueNamedNode = (name: string) => {
    const candidates = accountNodesByName.get(normalize(name)) ?? [];
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  const uniqueNamedLedger = (name: string) => {
    const candidates = ledgerNodesByName.get(normalize(name)) ?? [];
    return candidates.length === 1 ? candidates[0] : undefined;
  };

  const amounts = new Map<string, number>();
  const addAmount = (node: AccountNode, amount: number) => amounts.set(node.id, sumMoney([amounts.get(node.id) ?? 0, amount]));
  const supplierKeys = new Set(supplierNames.map(normalize));
  const supplierPayableNode = accountNodesByCode.get("2211000") ?? uniqueNamedNode("Accounts Payable - Supplier");
  const advanceReceivedNode = accountNodesByCode.get("2220000") ?? uniqueNamedNode("Advance Received");
  const supplierAdvanceNode = accountNodesByCode.get("1241000")
    ?? accountNodesByCode.get("1242000")
    ?? uniqueNamedNode("Advance & IOU")
    ?? uniqueNamedNode("Deposit & Advance");
  const legacyLedgerNames: Record<string, string> = {
    "sundry debtors": "Accounts Receivable Control",
    "sundry creditors": "Accounts Payable - Supplier",
    "cash in hand": "Cash in Hand",
    "purchase bill pending": "Goods Received Not Invoiced (GRNI)",
  };
  const findControlLedger = (groupKey: string) => {
    const candidates = allAccountNodes;
    if (groupKey.includes("sundry creditor") || groupKey.includes("payable") || groupKey.includes("supplier")) {
      return candidates.find((node) => node.nature === "LIABILITY" && normalize(node.name) === "accounts payable supplier")
        ?? candidates.find((node) => node.nature === "LIABILITY" && normalize(node.name).includes("accounts payable"))
        ?? candidates.find((node) => node.nature === "LIABILITY" && normalize(node.name).includes("supplier payable"));
    }
    if (groupKey.includes("sundry debtor") || groupKey.includes("receivable") || groupKey.includes("customer")) {
      return candidates.find((node) => node.nature === "ASSET" && normalize(node.name).includes("accounts receivable"))
        ?? candidates.find((node) => node.nature === "ASSET" && normalize(node.name).includes("customer receivable"));
    }
    return undefined;
  };

  trialBalanceRows.forEach((row) => {
    const ledgerKey = normalize(row.ledger);
    const groupKey = normalize(row.group);
    const mappedName = legacyLedgerNames[ledgerKey] ?? legacyLedgerNames[groupKey];
    // Supplier master is the authority for Accounts Payable - Supplier. Party
    // ledgers do not exist as COA children, so roll every active supplier's
    // posted balance into the supplier-payable group shown on the Balance Sheet.
    // An ID-bearing row is never reinterpreted through its mutable caption.
    // If its Account is absent from the supplied COA tree, leave it unmapped so
    // the integrity problem is visible instead of silently charging a
    // same-named but different ledger. Caption/control fallbacks are exclusively
    // for historical rows that genuinely predate accountId.
    const node = row.accountId
      ? accountNodesById.get(row.accountId)
      : (supplierKeys.has(ledgerKey) ? supplierPayableNode : undefined)
        ?? uniqueNamedLedger(row.ledger)
        ?? (mappedName ? uniqueNamedNode(mappedName) : undefined)
        ?? findControlLedger(groupKey)
        ?? findControlLedger(ledgerKey);
    if (!node) return;
    const naturalAmount = roundMoney(node.nature === "ASSET" ? row.debit - row.credit : row.credit - row.debit);
    // A customer's credit balance is money received before (or in excess of)
    // invoicing. It is a liability, never a negative receivable asset. Likewise,
    // a supplier's debit balance is an advance asset, not a negative payable.
    // Keep the party subledger untouched and reclassify only its Balance Sheet
    // presentation, as required by normal financial-statement presentation.
    if (node.nature === "ASSET" && moneyToMinorUnits(naturalAmount) < 0 && (groupKey.includes("sundry debtor") || groupKey.includes("receivable") || groupKey.includes("customer"))) {
      if (advanceReceivedNode) addAmount(advanceReceivedNode, Math.abs(naturalAmount));
      return;
    }
    if (node.nature === "LIABILITY" && moneyToMinorUnits(naturalAmount) < 0 && (supplierKeys.has(ledgerKey) || groupKey.includes("sundry creditor") || groupKey.includes("supplier"))) {
      if (supplierAdvanceNode) addAmount(supplierAdvanceNode, Math.abs(naturalAmount));
      return;
    }
    addAmount(node, naturalAmount);
  });

  // Purchase Bills currently debit Purchase Account while the perpetual stock
  // subledger carries the asset value and Delivery Notes carry its MWA relief.
  // The fixed COA intentionally provides Closing Balance as the stock-holding
  // category rather than a user ledger, so surface the authoritative closing
  // stock there. Do not add it when an actual inventory/closing-stock ledger is
  // already mapped, which keeps future GL-controlled inventory from doubling.
  const closingBalanceNode = accountNodesByCode.get("1210000") ?? uniqueNamedNode("Closing Balance");
  const inventoryControlNode = accountNodesByCode.get("1210001");
  const hasMappedStockLedger = inventoryControlNode
    ? amounts.has(inventoryControlNode.id)
    : allAccountNodes.some((node) => {
        if (node.level !== "LEDGER") return false;
        const key = normalize(node.name);
        return (key.includes("inventory") || key.includes("stock in hand") || key.includes("closing stock"))
          && moneyToMinorUnits(amounts.get(node.id) ?? 0) !== 0;
      });
  if (closingBalanceNode && !hasMappedStockLedger) {
    addAmount(closingBalanceNode, closingStock);
  }

  const nodeTotal = (node: AccountNode): number => sumMoney([
    amounts.get(node.id) ?? 0,
    ...node.children.map((child) => nodeTotal(child)),
  ]);

  const makeLines = (node: AccountNode, depth = 0): BalanceSheetLine[] => {
    const line: BalanceSheetLine = {
      label: node.name,
      amount: nodeTotal(node),
      depth,
      indent: depth > 0,
      strong: node.level !== "LEDGER",
      kind: node.level === "LEDGER" ? "account" : "group",
    };
    return [line, ...node.children.flatMap((child) => makeLines(child, depth + 1))];
  };

  const makeSections = (root: AccountNode | undefined): BalanceSheetSection[] => {
    if (!root) return [];
    if (!root.children.length) return [{ title: root.name, lines: [], total: nodeTotal(root) }];
    return root.children.map((child) => ({
      title: child.name,
      lines: child.children.flatMap((descendant) => makeLines(descendant)),
      total: nodeTotal(child),
    }));
  };

  const assetsRoot = accountNodesByCode.get("1000000")
    ?? accountTree.find((node) => node.nature === "ASSET" && node.level === "MAIN_CATEGORY");
  const liabilitiesRoot = accountNodesByCode.get("2000000")
    ?? accountTree.find((node) => node.nature === "LIABILITY" && node.level === "MAIN_CATEGORY");
  const equityRoot = accountNodesByCode.get("3000000")
    ?? accountTree.find((node) => node.nature === "EQUITY" && node.level === "MAIN_CATEGORY");

  // Until the year is closed, the same FY-to-date result shown by Profit & Loss
  // belongs under the fixed Profit & Loss Accounts category. The user's fixed
  // COA contains that category (not a synthetic ledger), so support both forms.
  const profitLossNode = accountNodesByCode.get("3300000")
    ?? uniqueNamedLedger("Current Year Profit or Loss")
    ?? uniqueNamedNode("Profit & Loss Accounts");
  if (profitLossNode) {
    amounts.set(profitLossNode.id, currentYearProfit);
  }

  const assets = makeSections(assetsRoot);
  const liabilities = [...makeSections(equityRoot), ...makeSections(liabilitiesRoot)];

  return {
    kind: "balance-sheet",
    title: "Balance Sheet",
    description: `Balance sheet as on ${formatDate(toDate)}.`,
    liabilities,
    assets,
    totalLiabilities: sumMoney(liabilities.map((section) => section.total)),
    totalAssets: sumMoney(assets.map((section) => section.total)),
  };
}

function LedgerFilterCombobox({
  value,
  options,
  onChange,
  allLabel = "All Ledgers",
  ariaLabel = "Filter by ledger",
  emptyWhenAll = false,
  valueMode = "name",
  className,
}: {
  value: string;
  options: Array<{ id: string; name: string; path: string }>;
  onChange: (value: string) => void;
  allLabel?: string;
  ariaLabel?: string;
  emptyWhenAll?: boolean;
  valueMode?: "id" | "name";
  className?: string;
}) {
  const selectedOption = options.find((option) => valueMode === "id" ? option.id === value : option.name === value);
  const selectedLabel = (selectedOption?.name ?? (valueMode === "name" ? value : "")) || (emptyWhenAll ? "" : allLabel);
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = `general-ledger-filter-${useId()}`;
  const allOptions = useMemo(() => [{ id: "all", name: allLabel, path: "" }, ...options], [allLabel, options]);
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allOptions.filter((option) => !needle || `${option.name} ${option.path}`.toLowerCase().includes(needle));
  }, [allOptions, query]);

  useEffect(() => setQuery(selectedLabel), [selectedLabel]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery(selectedLabel);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [selectedLabel]);
  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(filteredOptions.length - 1, 0)));
  }, [filteredOptions.length]);
  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const choose = (index: number) => {
    const option = filteredOptions[index];
    if (!option) return;
    onChange(option.id === "all" ? "" : valueMode === "id" ? option.id : option.name);
    setQuery(option.id === "all" && emptyWhenAll ? "" : option.name);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative w-[250px]", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#8190a8]" />
      <Input
        value={query}
        placeholder={allLabel}
        className="h-9 border-[#d7dfeb] bg-white pl-9 pr-9 text-sm font-medium text-[#34435f]"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        onFocus={(event) => { setOpen(true); setActiveIndex(0); event.currentTarget.select(); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            choose(activeIndex);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setQuery(selectedLabel);
          }
        }}
      />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8190a8]" />
      {open ? (
        <div id={listboxId} role="listbox" className="absolute right-0 z-[90] mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-[#d7dfeb] bg-white p-1 shadow-xl">
          {filteredOptions.length ? filteredOptions.map((option, index) => (
            <button
              key={option.id}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role="option"
              aria-selected={(option.id === "all" && !value) || (valueMode === "id" ? option.id === value : option.name === value)}
              className={cn("flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm", index === activeIndex ? "bg-[#eaf2ff] text-[#155fc0]" : "text-[#25365b] hover:bg-[#f7f9fc]")}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              {((option.id === "all" && !value) || (valueMode === "id" ? option.id === value : option.name === value)) ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#e76412]" /> : null}
            </button>
          )) : <div className="px-3 py-5 text-center text-sm text-[#8994a6]">No matching ledger found</div>}
        </div>
      ) : null}
    </div>
  );
}

export function ReportsWorkspaceScreen({ slug, profitLossDetail }: { slug: string; profitLossDetail?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, session } = useSessionContext();
  const workspaceId = session?.workspaceId ?? "ws-trading";
  const workflowSettingsQuery = useWorkflowSettingsQuery(
    mode,
    session?.workspaceId ?? (mode === "api" ? null : "workspace"),
  );
  const workflowSettings = workflowSettingsQuery.data ?? defaultWorkflowSettings;

  function orderRootActionLabel(kind: "purchase" | "sales") {
    const policy = kind === "purchase"
      ? workflowSettings.purchaseWorkflow
      : workflowSettings.salesWorkflow;
    if (policy === "DIRECT") return "Workflow Settings";
    return kind === "purchase" ? "Add Purchase Order" : "Add Sales Order";
  }

  function openOrderRootFromReport(kind: "purchase" | "sales") {
    if (workflowSettingsQuery.isPending) {
      toast.info("Company transaction workflow is still loading. Please try again.");
      return;
    }
    if (workflowSettingsQuery.isError) {
      toast.error("Company transaction workflow could not be loaded. Retry before creating a new order.");
      return;
    }

    const policy = kind === "purchase"
      ? workflowSettings.purchaseWorkflow
      : workflowSettings.salesWorkflow;
    if (policy === "DIRECT") {
      toast.info(`This company uses Direct ${kind === "purchase" ? "Purchase" : "Sales"} Mode. Existing order history stays available here; change the workflow setting to create a new order.`);
      router.push(`${buildWorkspaceRoute(mode, "/masters/settings")}?section=workflow`);
      return;
    }

    router.push(
      buildWorkspaceRoute(
        mode,
        kind === "purchase"
          ? "/vouchers/purchase/new?workflow=purchase-order"
          : "/sales/sale-order?create=1",
      ),
    );
  }
  const catalogScrollRef = useRef<HTMLDivElement | null>(null);
  const cashBookInitializedKeyRef = useRef<string | null>(null);
  const purchaseTrendInitializedKeyRef = useRef<string | null>(null);
  const purchaseTrendAnalysisInitializedKeyRef = useRef<string | null>(null);
  const paymentRegisterInitializedKeyRef = useRef<string | null>(null);
  const purchaseOrdersInitializedKeyRef = useRef<string | null>(null);
  const purchaseReturnRegisterInitializedKeyRef = useRef<string | null>(null);
  const purchaseRegisterInitializedKeyRef = useRef<string | null>(null);
  const postingRangeInitializedKeyRef = useRef<string | null>(null);
  const [profitLossView, setProfitLossView] = useState<"bizovix" | "accounting">("bizovix");
  const [balanceSheetOrientation, setBalanceSheetOrientation] = useState<"vertical" | "horizontal">("vertical");
  const [selectedPartyStatementDetail, setSelectedPartyStatementDetail] = useState<PartyStatementDetail | null>(null);
  const [selectedInventoryReportDetail, setSelectedInventoryReportDetail] = useState<InventoryReportRowDetail | null>(null);
  const [selectedExpenseReportDetail, setSelectedExpenseReportDetail] = useState<ExpenseReportRowDetail | null>(null);
  const [selectedOperationalReportDetail, setSelectedOperationalReportDetail] = useState<OperationalReportRowDetail | null>(null);
  const [selectedBillDetail, setSelectedBillDetail] = useState<BillReportDetail | null>(null);
  const [selectedRegisterInvoice, setSelectedRegisterInvoice] = useState<VoucherRecord | null>(null);
  const [cashFlowDrilldown, setCashFlowDrilldown] = useState<{ title: string; vouchers: VoucherRecord[] } | null>(null);
  const [cashFlowChannel, setCashFlowChannel] = useState<CashFlowChannel>("all");
  const [cashEquivalentChannel, setCashEquivalentChannel] = useState<CashFlowChannel>("all");
  const [cashEquivalentSearch, setCashEquivalentSearch] = useState("");
  const [selectedCashEquivalentLedger, setSelectedCashEquivalentLedger] = useState<CashEquivalentLedgerRow | null>(null);
  const [cashEquivalentTransactionFilters, setCashEquivalentTransactionFilters] = useState<Record<string, string>>({});
  const [openCashEquivalentTransactionFilter, setOpenCashEquivalentTransactionFilter] = useState<string | null>(null);
  const [billTypeFilter, setBillTypeFilter] = useState<"all" | "purchase" | "sales">("all");
  const [billStatusFilter, setBillStatusFilter] = useState<"all" | "live" | "closed">("all");
  const today = new Date().toISOString().slice(0, 10);
  const activityToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [fromDate, setFromDate] = useState(() => searchParams.get("from") ?? "");
  const [toDate, setToDate] = useState(() => searchParams.get("to") ?? today);
  const hasExplicitDateRange = Boolean(searchParams.get("from") && searchParams.get("to"));
  const [balanceSheetPeriod, setBalanceSheetPeriod] = useState<"latest-month" | "custom" | "today" | "this-month" | "this-year">("latest-month");
  const [trialBalancePeriod, setTrialBalancePeriod] = useState<"latest-month" | "custom" | "today" | "this-month" | "this-year">("latest-month");
  const [purchaseRegisterPeriod, setPurchaseRegisterPeriod] = useState<"latest-sales-month" | "latest-purchase-month" | "latest-receipt-month" | "latest-payment-month" | "latest-sales-return-month" | "latest-purchase-return-month" | "latest-cash-month" | "this-month" | "last-month" | "last-6-months" | "last-1-year" | "custom">("this-month");
  const [allTransactionsPeriod, setAllTransactionsPeriod] = useState<"latest-month" | "previous-month" | "last-6-months" | "last-1-year" | "custom">("latest-month");
  const [auditPeriod, setAuditPeriod] = useState<"today" | "yesterday" | "last-7-days" | "last-30-days" | "custom">("last-7-days");
  // "all" means no party filter — otherwise an exact party name to restrict a
  // register report to (Customer for Sales-side registers, Supplier for
  // Purchase-side ones; reset whenever the active report changes so it never
  // silently carries over and hides rows on an unrelated register).
  const [registerPartyFilter, setRegisterPartyFilter] = useState("all");
  const [selectedComparisonCustomerId, setSelectedComparisonCustomerId] = useState(
    () => searchParams.get("customerId") ?? "",
  );
  const [selectedComparisonSupplierId, setSelectedComparisonSupplierId] = useState(
    () => searchParams.get("supplierId") ?? "",
  );
  const [stockCategoryFilter, setStockCategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState<"all" | "positive" | "zero" | "negative">("all");
  const [warehouseReportFilter, setWarehouseReportFilter] = useState("all");
  useEffect(() => {
    const savedOrientation = window.localStorage.getItem(`bizovix:balance-sheet-orientation:${mode}:${workspaceId}`);
    setBalanceSheetOrientation(savedOrientation === "horizontal" ? "horizontal" : "vertical");
  }, [mode, workspaceId]);

  const updateBalanceSheetOrientation = (orientation: "vertical" | "horizontal") => {
    setBalanceSheetOrientation(orientation);
    window.localStorage.setItem(`bizovix:balance-sheet-orientation:${mode}:${workspaceId}`, orientation);
  };

  useEffect(() => {
    setRegisterPartyFilter("all");
    setAllTransactionsColumnFilters({});
    setOpenAllTransactionsFilter(null);
    setBillTypeFilter("all");
    setBillStatusFilter("all");
    setStockCategoryFilter("all");
    setStockStatusFilter("all");
    setWarehouseReportFilter("all");
    setCashFlowChannel("all");
    setCashEquivalentChannel("all");
    setCashEquivalentSearch("");
    setSelectedCashEquivalentLedger(null);
    if (AUDIT_REPORT_SLUGS.has(slug)) {
      const recentStart = new Date(`${activityToday}T12:00:00`);
      recentStart.setDate(recentStart.getDate() - 6);
      setAuditPeriod("last-7-days");
      setFromDate(recentStart.toISOString().slice(0, 10));
      setToDate(activityToday);
    }
  }, [activityToday, slug]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [reportSearch, setReportSearch] = useState("");
  const [reportRowSearch, setReportRowSearch] = useState("");
  const [selectedAuditRole, setSelectedAuditRole] = useState("all");
  const [selectedLoanAccount, setSelectedLoanAccount] = useState("");
  const [selectedGeneralLedger, setSelectedGeneralLedger] = useState("");
  const [selectedBankAccount, setSelectedBankAccount] = useState("");
  const [selectedMfsAccount, setSelectedMfsAccount] = useState("");
  const [selectedMfsVoucherIds, setSelectedMfsVoucherIds] = useState<string[]>([]);
  const [mfsDeleteVoucherIds, setMfsDeleteVoucherIds] = useState<string[]>([]);
  const [mfsDeleteBusy, setMfsDeleteBusy] = useState(false);
  const [allTransactionsColumnFilters, setAllTransactionsColumnFilters] = useState<Record<string, string>>({});
  const [openAllTransactionsFilter, setOpenAllTransactionsFilter] = useState<string | null>(null);
  const catalogScrollStorageKey = `bizovix:reports-catalog-scroll:${mode}:${workspaceId}`;

  useEffect(() => {
    const globalSearch = searchParams.get("search")?.trim() ?? "";
    if (globalSearch) setReportRowSearch(globalSearch);
  }, [searchParams, slug]);

  useEffect(() => {
    setSelectedMfsVoucherIds([]);
    setMfsDeleteVoucherIds([]);
  }, [fromDate, selectedMfsAccount, slug, toDate]);

  useEffect(() => {
    function refresh() {
      setRefreshToken((current) => current + 1);
    }

    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextScrollTop = window.sessionStorage.getItem(catalogScrollStorageKey);
    if (!nextScrollTop || !catalogScrollRef.current) {
      return;
    }

    catalogScrollRef.current.scrollTop = Number(nextScrollTop);
  }, [catalogScrollStorageKey, slug]);

  // Reports always run on the live workspace: mock/demo read the seeded browser
  // dataset, API mode assembles one from real vouchers, parties, and stock.
  const datasetQuery = useQuery({
    queryKey: [mode, "report-dataset", workspaceId, refreshToken],
    queryFn: () => loadWorkspaceReportDataset(mode, workspaceId),
    enabled: Boolean(workspaceId),
    placeholderData: (previous) => previous,
  });
  const deadStockMonthsQuery = useQuery({
    queryKey: [mode, "dead-stock-months", workspaceId, refreshToken],
    queryFn: () => getWorkspaceDeadStockMonths(mode, workspaceId),
    enabled: Boolean(workspaceId) && slug === "dead-stock-report",
    staleTime: 30_000,
  });

  const dataset = datasetQuery.data ?? emptyReportDataset;
  const latestWorkspacePostingRange = useMemo(
    () =>
      getLatestPostingMonthRange(
        dataset.vouchers
          .filter(
            (voucher) =>
              voucher.workspaceId === workspaceId
              && isLiveVoucher(voucher)
              && !isReversalArtifact(voucher),
          )
          .map((voucher) => voucher.voucherDate),
      ),
    [dataset.vouchers, workspaceId],
  );
  const defaultPostingRange = hasExplicitDateRange ? null : latestWorkspacePostingRange;

  const reportAccountTreeQuery = useAccountTreeQuery(
    mode === "api" && (slug === "balance-sheet" || slug === "profit-loss" || slug === "bank-book" || slug === "mfs-report" || slug === "cashflow-statement" || slug === "customer-supplier-comparison"),
    true,
  );
  const reportMoneyAccountsQuery = useMoneyAccountsQuery(mode === "api" && (slug === "bank-book" || slug === "mfs-report" || slug === "cashflow-statement" || slug === "customer-supplier-comparison"));
  const generalLedgerAccountsQuery = usePostableLedgersQuery(mode === "api" && slug === "general-ledger");

  useEffect(() => {
    if (slug !== "cash-book") {
      cashBookInitializedKeyRef.current = null;
      return;
    }
    if (!datasetQuery.data || !workspaceId) return;
    const initializationKey = `${workspaceId}:cash-book`;
    if (cashBookInitializedKeyRef.current === initializationKey) return;
    const transactionDates = datasetQuery.data.vouchers
      .filter((voucher) => voucher.workspaceId === workspaceId && isLiveVoucher(voucher))
      .map((voucher) => voucher.voucherDate)
      .filter(Boolean)
      .sort();
    setFromDate(transactionDates[0] ?? today);
    setToDate(transactionDates.at(-1) && transactionDates.at(-1)! > today ? transactionDates.at(-1)! : today);
    cashBookInitializedKeyRef.current = initializationKey;
  }, [datasetQuery.data, slug, today, workspaceId]);

  // Monthly Purchase Trend is a month-by-month aggregation, but the shared
  // fromDate/toDate default (current-month-to-date) is often a single half
  // month wide, so byMonth can never contain more than one entry. Widen the
  // default to a rolling 12-month window whenever this report is opened,
  // without touching the shared date-range default used by other reports.
  useEffect(() => {
    if (slug !== "monthly-purchase-trend") {
      purchaseTrendInitializedKeyRef.current = null;
      return;
    }
    const initializationKey = `${workspaceId}:monthly-purchase-trend`;
    if (purchaseTrendInitializedKeyRef.current === initializationKey) return;
    const start = new Date(today);
    start.setMonth(start.getMonth() - 11, 1);
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(today);
    purchaseTrendInitializedKeyRef.current = initializationKey;
  }, [slug, today, workspaceId]);

  // Purchase Trend Analysis shares the exact same month-by-month aggregation
  // branch as Monthly Purchase Trend, so it has the same defect: the shared
  // fromDate/toDate default (current-month-to-date) is often a single half
  // month wide, so byMonth can never contain more than one entry. Widen the
  // default to a rolling 12-month window whenever this report is opened,
  // without touching the shared date-range default used by other reports.
  useEffect(() => {
    if (slug !== "purchase-trend-analysis") {
      purchaseTrendAnalysisInitializedKeyRef.current = null;
      return;
    }
    const initializationKey = `${workspaceId}:purchase-trend-analysis`;
    if (purchaseTrendAnalysisInitializedKeyRef.current === initializationKey) return;
    const start = new Date(today);
    start.setMonth(start.getMonth() - 11, 1);
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(today);
    purchaseTrendAnalysisInitializedKeyRef.current = initializationKey;
  }, [slug, today, workspaceId]);

  // Purchase Orders stay open across month boundaries (they're placed once and
  // can remain pending for weeks), so the shared fromDate/toDate default
  // (current-month-to-date) routinely excludes every open order. Widen the
  // default to span from the earliest live purchase order on record to today
  // whenever this report is opened, without touching the shared date-range
  // default used by other reports.
  useEffect(() => {
    if (slug !== "purchase-orders") {
      purchaseOrdersInitializedKeyRef.current = null;
      return;
    }
    if (!datasetQuery.data || !workspaceId) return;
    const initializationKey = `${workspaceId}:purchase-orders`;
    if (purchaseOrdersInitializedKeyRef.current === initializationKey) return;
    const purchaseOrderDates = datasetQuery.data.vouchers
      .filter(
        (voucher) =>
          voucher.workspaceId === workspaceId &&
          isLiveVoucher(voucher) &&
          voucher.voucherType === "purchase" &&
          voucher.documentKind === "purchase-order",
      )
      .map((voucher) => voucher.voucherDate)
      .filter(Boolean)
      .sort();
    if (purchaseOrderDates.length > 0) {
      setFromDate(purchaseOrderDates[0]);
      setToDate(purchaseOrderDates.at(-1)! > today ? purchaseOrderDates.at(-1)! : today);
    }
    purchaseOrdersInitializedKeyRef.current = initializationKey;
  }, [datasetQuery.data, slug, today, workspaceId]);

  // Purchase Return Register lists debit-note vouchers, which are posted
  // whenever a return happens and can easily fall outside the current month.
  // The shared fromDate/toDate default (current-month-to-date) then silently
  // excludes every real return, and this report's catalog group does not
  // render the date-range picker either, so there was no way to discover or
  // widen the filter. Widen the default to span from the earliest live
  // debit-note voucher on record to today whenever this report is opened,
  // without touching the shared date-range default used by other reports.
  useEffect(() => {
    if (slug !== "purchase-return-register") {
      purchaseReturnRegisterInitializedKeyRef.current = null;
      return;
    }
    if (!datasetQuery.data || !workspaceId) return;
    const initializationKey = `${workspaceId}:purchase-return-register`;
    if (purchaseReturnRegisterInitializedKeyRef.current === initializationKey) return;
    const debitNoteDates = datasetQuery.data.vouchers
      .filter(
        (voucher) =>
          voucher.workspaceId === workspaceId &&
          isLiveVoucher(voucher) &&
          voucher.voucherType === "debit-note",
      )
      .map((voucher) => voucher.voucherDate)
      .filter(Boolean)
      .sort();
    if (debitNoteDates.length > 0) {
      setFromDate(debitNoteDates[0]);
      setToDate(debitNoteDates.at(-1)! > today ? debitNoteDates.at(-1)! : today);
    }
    purchaseReturnRegisterInitializedKeyRef.current = initializationKey;
  }, [datasetQuery.data, slug, today, workspaceId]);

  // Purchase Register opens on the current month. Wider history remains one click
  // away through its explicit quick-filter control instead of silently widening.
  useEffect(() => {
    if (slug !== "purchase-register") {
      purchaseRegisterInitializedKeyRef.current = null;
      return;
    }
    const initializationKey = `${workspaceId}:purchase-register`;
    if (purchaseRegisterInitializedKeyRef.current === initializationKey) return;
    setPurchaseRegisterPeriod("this-month");
    setFromDate(`${today.slice(0, 8)}01`);
    setToDate(today);
    purchaseRegisterInitializedKeyRef.current = initializationKey;
  }, [slug, today, workspaceId]);

  // Payment Register lists payment vouchers, which are frequently dated before the
  // current calendar month (e.g. settling a bill raised weeks earlier). The shared
  // fromDate/toDate default (current-month-to-date) then silently excludes those real
  // payments, showing "Entries: 0 / Total Payments: 0.00" with no visible signal that a
  // date filter is even active. Widen the default to span from the earliest live payment
  // voucher on record to today whenever this report is opened, without touching the
  // shared date-range default used by other reports.
  useEffect(() => {
    if (slug !== "payment-register") {
      paymentRegisterInitializedKeyRef.current = null;
      return;
    }
    if (!datasetQuery.data || !workspaceId) return;
    const initializationKey = `${workspaceId}:payment-register`;
    if (paymentRegisterInitializedKeyRef.current === initializationKey) return;
    const paymentDates = datasetQuery.data.vouchers
      .filter(
        (voucher) =>
          voucher.workspaceId === workspaceId &&
          isLiveVoucher(voucher) &&
          voucher.voucherType === "payment" &&
          voucher.status !== "cancelled",
      )
      .map((voucher) => voucher.voucherDate)
      .filter(Boolean)
      .sort();
    if (paymentDates.length > 0) {
      setFromDate(paymentDates[0]);
      setToDate(paymentDates.at(-1)! > today ? paymentDates.at(-1)! : today);
    }
    paymentRegisterInitializedKeyRef.current = initializationKey;
  }, [datasetQuery.data, slug, today, workspaceId]);

  // Every report opens on one calendar month ending at the workspace's latest
  // posting date. Keep this after report-specific initializers so the global
  // transaction-window rule is the final default everywhere.
  useEffect(() => {
    // Audit reports use the action's real createdAt timestamp, never a voucher
    // posting month. Applying this shared posting range made "Today" display
    // July dates and hid every action recorded today.
    if (AUDIT_REPORT_SLUGS.has(slug)) return;
    if (!datasetQuery.data || !workspaceId) return;
    const range = defaultPostingRange;
    if (!range) return;
    const initializationKey = `${workspaceId}:${slug}:${range.to}`;
    if (postingRangeInitializedKeyRef.current === initializationKey) return;
    setFromDate(range.from);
    setToDate(range.to);
    if (slug === "sales-register") setPurchaseRegisterPeriod("latest-sales-month");
    else if (slug === "purchase-register") setPurchaseRegisterPeriod("latest-purchase-month");
    else if (slug === "receipt-register") setPurchaseRegisterPeriod("latest-receipt-month");
    else if (slug === "payment-register") setPurchaseRegisterPeriod("latest-payment-month");
    else if (slug === "sales-return-register") setPurchaseRegisterPeriod("latest-sales-return-month");
    else if (slug === "purchase-return-register") setPurchaseRegisterPeriod("latest-purchase-return-month");
    else if (slug === "cash-book") setPurchaseRegisterPeriod("latest-cash-month");
    if (slug === "all-transactions") setAllTransactionsPeriod("latest-month");
    if (slug === "balance-sheet") setBalanceSheetPeriod("latest-month");
    if (slug === "trial-balance") setTrialBalancePeriod("latest-month");
    postingRangeInitializedKeyRef.current = initializationKey;
  }, [datasetQuery.data, defaultPostingRange, slug, workspaceId]);

  useEffect(() => {
    if (!AUDIT_REPORT_SLUGS.has(slug) || auditPeriod !== "today") return;
    setFromDate(activityToday);
    setToDate(activityToday);
  }, [activityToday, auditPeriod, slug]);

  const isAuditReportSlug = AUDIT_REPORT_SLUGS.has(slug);
  const auditReportQuery = useQuery({
    queryKey: [mode, "audit-report", slug, workspaceId, refreshToken],
    queryFn: () => listAuditReport(slug, workspaceId),
    enabled: mode === "api" && isAuditReportSlug && Boolean(workspaceId),
    placeholderData: (previous) => previous,
  });
  const auditRows = isAuditReportSlug ? auditReportQuery.data ?? [] : [];

  const isWarehouseReportSlug = slug === "warehouse-wise-report";
  const warehouseStockQuery = useQuery({
    queryKey: [mode, "warehouse-stock", workspaceId, toDate, refreshToken],
    queryFn: () => listWarehouseStock(workspaceId, toDate),
    enabled: mode === "api" && isWarehouseReportSlug && Boolean(workspaceId),
  });
  const warehouseStockRows = isWarehouseReportSlug ? warehouseStockQuery.data ?? [] : [];
  // The stock rows only cover warehouses that actually hold something on the
  // as-at date. Driving the picker off them would silently hide a warehouse
  // that is empty (or was created after the date) - it would simply vanish
  // from the report with no way to ask about it. So the picker lists the
  // warehouse master, and the rows stay the honest answer about stock.
  const warehouseMasterQuery = useQuery({
    queryKey: [mode, "warehouse-master", workspaceId, refreshToken],
    queryFn: () => listWarehouses(workspaceId, true),
    enabled: mode === "api" && isWarehouseReportSlug && Boolean(workspaceId),
    placeholderData: (previous) => previous,
  });
  const warehouseReportOptions = useMemo(() => {
    const fromStock = new Map(warehouseStockRows.map((row) => [row.warehouseId, { id: row.warehouseId, name: row.warehouseName, code: row.warehouseCode }]));
    // Fall back to the stock-derived list if the master could not be loaded, so
    // a failed lookup never leaves the picker empty.
    for (const warehouse of warehouseMasterQuery.data ?? []) {
      fromStock.set(warehouse.id, { id: warehouse.id, name: warehouse.name, code: warehouse.code });
    }
    return Array.from(fromStock.values()).sort((left, right) => (left.name ?? "").localeCompare(right.name ?? ""));
  }, [warehouseStockRows, warehouseMasterQuery.data]);
  const filteredWarehouseStockRows = warehouseReportFilter === "all"
    ? warehouseStockRows
    : warehouseStockRows.filter((row) => row.warehouseId === warehouseReportFilter);

  const loanRows = useMemo(() => getLoanRows(mode, workspaceId), [mode, refreshToken, workspaceId]);
  const chequeRows = useMemo(() => getChequeRows(mode, workspaceId), [mode, refreshToken, workspaceId]);
  const moneyAccountOptions = useMemo(() => {
    if (mode === "api") {
      return (reportMoneyAccountsQuery.data ?? [])
        .filter((account) => account.status === "ACTIVE" && (account.type === "BANK" || account.type === "MFS"))
        .map((account) => ({ id: account.id, name: account.name, path: account.path, kind: account.type as "BANK" | "MFS" }))
        .sort((left, right) => left.name.localeCompare(right.name));
    }

    const result: Array<{ id: string; name: string; path: string; kind: "BANK" | "MFS" }> = [];
    const visit = (node: AccountNode, parents: string[]) => {
      const nextParents = [...parents, node.name];
      const hierarchy = nextParents.join(" ").toLowerCase();
      const inferredKind = node.bankDetails?.accountKind
        ?? (hierarchy.includes("mobile finance service") ? "MFS" : hierarchy.includes("bank accounts") ? "BANK" : undefined);
      if (node.level === "LEDGER" && (inferredKind === "BANK" || inferredKind === "MFS")) {
        result.push({ id: node.id, name: node.name, path: nextParents.join(" › "), kind: inferredKind });
      }
      node.children.forEach((child) => visit(child, nextParents));
    };
    (reportAccountTreeQuery.data ?? []).forEach((node) => visit(node, []));
    return result.sort((left, right) => left.name.localeCompare(right.name));
  }, [mode, reportAccountTreeQuery.data, reportMoneyAccountsQuery.data]);
  const comparisonCustomers = useMemo(
    () => dataset.parties
      .filter((party) => party.workspaceId === workspaceId && party.type === "customer")
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    [dataset.parties, workspaceId],
  );
  const comparisonSuppliers = useMemo(
    () => dataset.parties
      .filter((party) => party.workspaceId === workspaceId && party.type === "supplier")
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    [dataset.parties, workspaceId],
  );
  const toComparisonPartyOption = (party: (typeof comparisonCustomers)[number]) => ({
    id: party.id,
    name: `${party.name}${party.contact ? ` · ${party.contact}` : ""}${party.status === "inactive" ? " (Inactive)" : ""}`,
    path: `${party.address || "No address"} · Party ID ${party.id}`,
  });
  const comparisonCustomerOptions = comparisonCustomers.map(toComparisonPartyOption);
  const comparisonSupplierOptions = comparisonSuppliers.map(toComparisonPartyOption);

  useEffect(() => {
    if (!datasetQuery.data) return;
    if (selectedComparisonCustomerId && !comparisonCustomers.some((party) => party.id === selectedComparisonCustomerId)) {
      setSelectedComparisonCustomerId("");
    }
    if (selectedComparisonSupplierId && !comparisonSuppliers.some((party) => party.id === selectedComparisonSupplierId)) {
      setSelectedComparisonSupplierId("");
    }
  }, [comparisonCustomers, comparisonSuppliers, datasetQuery.data, selectedComparisonCustomerId, selectedComparisonSupplierId]);

  function selectComparisonCustomer(nextId: string) {
    setSelectedComparisonCustomerId(nextId);
    if (!nextId || selectedComparisonSupplierId) return;
    const selected = comparisonCustomers.find((party) => party.id === nextId);
    if (!selected) return;
    const sameNamedSuppliers = comparisonSuppliers.filter(
      (party) => normalizeReportKey(party.name) === normalizeReportKey(selected.name),
    );
    if (sameNamedSuppliers.length === 1) setSelectedComparisonSupplierId(sameNamedSuppliers[0].id);
  }

  function selectComparisonSupplier(nextId: string) {
    setSelectedComparisonSupplierId(nextId);
    if (!nextId || selectedComparisonCustomerId) return;
    const selected = comparisonSuppliers.find((party) => party.id === nextId);
    if (!selected) return;
    const sameNamedCustomers = comparisonCustomers.filter(
      (party) => normalizeReportKey(party.name) === normalizeReportKey(selected.name),
    );
    if (sameNamedCustomers.length === 1) setSelectedComparisonCustomerId(sameNamedCustomers[0].id);
  }

  const groupedCatalog = useMemo(() => {
    const needle = reportSearch.trim().toLowerCase();
    return reportCatalog.filter((item) => !needle || `${item.label} ${item.group}`.toLowerCase().includes(needle)).reduce<Record<string, ReportCatalogItem[]>>((groups, item) => {
      groups[item.group] = [...(groups[item.group] ?? []), item];
      return groups;
    }, {});
  }, [reportSearch]);

  const activeCatalogItem = reportCatalog.find((item) => item.slug === slug) ?? reportCatalog.find((item) => item.slug === "balance-sheet")!;
  const activeGroupLabel = activeCatalogItem.group.replace(/^\d+\.\s*/, "");
  const activeReport = useMemo(
    () =>
      buildReportView({
        slug: activeCatalogItem.slug,
        dataset,
        workspaceId,
        fromDate,
        toDate,
        loanRows,
        chequeRows,
        auditRows,
        warehouseStockRows: filteredWarehouseStockRows,
        warehouseTotalCount: warehouseReportOptions.length,
        selectedLoanAccount,
        accountTree: reportAccountTreeQuery.data,
        selectedGeneralLedger,
        selectedGeneralLedgerName: (generalLedgerAccountsQuery.data ?? [])
          .find((ledger) => ledger.id === selectedGeneralLedger)?.name,
        bankAccountNames: moneyAccountOptions.filter((account) => account.kind === "BANK").map((account) => account.name),
        mfsAccountNames: moneyAccountOptions.filter((account) => account.kind === "MFS").map((account) => account.name),
        selectedBankAccount,
        selectedMfsAccount,
        registerPartyFilter,
        selectedComparisonCustomerId,
        selectedComparisonSupplierId,
        billTypeFilter,
        billStatusFilter,
        cashFlowChannel,
        deadStockMonths: deadStockMonthsQuery.data ?? 12,
      }),
    [activeCatalogItem.slug, auditRows, billStatusFilter, billTypeFilter, cashFlowChannel, chequeRows, dataset, deadStockMonthsQuery.data, filteredWarehouseStockRows, fromDate, generalLedgerAccountsQuery.data, loanRows, moneyAccountOptions, reportAccountTreeQuery.data, registerPartyFilter, selectedBankAccount, selectedComparisonCustomerId, selectedComparisonSupplierId, selectedGeneralLedger, selectedLoanAccount, selectedMfsAccount, toDate, warehouseReportOptions.length, workspaceId],
  );
  const cashEquivalentTransactions = useMemo(() => {
    if (!selectedCashEquivalentLedger) return [];
    const movements = dataset.vouchers
      .filter((voucher) =>
        voucher.workspaceId === workspaceId
        && voucher.voucherDate >= fromDate
        && voucher.voucherDate <= toDate
        && isAccountingVoucher(voucher),
      )
      .flatMap((voucher) => voucher.lines
        .filter((line) =>
          line.accountId
            ? line.accountId === selectedCashEquivalentLedger.ledgerId
            : normalizeReportKey(line.ledger) === normalizeReportKey(selectedCashEquivalentLedger.ledger),
        )
        .map((line) => ({
          voucher,
          amount: sumMoney([line.debit, -roundMoney(line.credit)]),
          description: line.description || voucher.particulars || voucher.narration || "-",
        })))
      .sort((left, right) =>
        left.voucher.voucherDate.localeCompare(right.voucher.voucherDate)
        || left.voucher.createdAt.localeCompare(right.voucher.createdAt)
        || left.voucher.voucherNumber.localeCompare(right.voucher.voucherNumber),
      );
    let runningBalance = selectedCashEquivalentLedger.opening;
    return movements.map((movement) => {
      runningBalance = sumMoney([runningBalance, movement.amount]);
      return {
        ...movement,
        moneyIn: roundMoney(Math.max(0, movement.amount)),
        moneyOut: roundMoney(Math.max(0, -movement.amount)),
        runningBalance,
      };
    });
  }, [dataset.vouchers, fromDate, selectedCashEquivalentLedger, toDate, workspaceId]);
  const visibleCashEquivalentTransactions = useMemo(() => cashEquivalentTransactions.filter((transaction) => {
    const filterValues: Record<string, string> = {
      Date: formatDate(transaction.voucher.voucherDate),
      Voucher: `${transaction.voucher.voucherNumber} ${transaction.voucher.partyName || ""} ${transaction.voucher.voucherType.replace(/-/g, " ")}`,
      Particulars: transaction.description,
      "Money In": `${transaction.moneyIn} ${formatReportAmount(transaction.moneyIn)}`,
      "Money Out": `${transaction.moneyOut} ${formatReportAmount(transaction.moneyOut)}`,
      Balance: `${transaction.runningBalance} ${formatReportAmount(transaction.runningBalance)}`,
    };
    return Object.entries(cashEquivalentTransactionFilters).every(([column, query]) =>
      !query.trim() || normalizeReportKey(filterValues[column] ?? "").includes(normalizeReportKey(query)),
    );
  }), [cashEquivalentTransactionFilters, cashEquivalentTransactions]);

  useEffect(() => {
    setCashEquivalentTransactionFilters({});
    setOpenCashEquivalentTransactionFilter(null);
  }, [selectedCashEquivalentLedger?.ledgerId]);

  // Mirrors transactionRegisterMeta's partyLabel inside buildReportView — kept
  // here too since the party-filter dropdown needs to know which column holds
  // the party name before it can read distinct values out of activeReport.rows.
  const registerPartyLabel: Partial<Record<string, string>> = {
    "sales-register": "Customer",
    "purchase-register": "Supplier",
    "receipt-register": "From",
    "payment-register": "To",
    "sales-return-register": "Customer",
    "purchase-return-register": "Supplier",
  };
  const registerPartyOptions = useMemo(() => {
    const label = registerPartyLabel[activeCatalogItem.slug];
    if (!label || activeReport.kind !== "table") return [];
    return [...new Set(activeReport.rows.map((row) => row[label]).filter((value): value is string => Boolean(value?.trim())))]
      .sort((left, right) => left.localeCompare(right));
  }, [activeCatalogItem.slug, activeReport]);

  function navigateToReport(nextSlug: string) {
    if (typeof window !== "undefined" && catalogScrollRef.current) {
      window.sessionStorage.setItem(catalogScrollStorageKey, String(catalogScrollRef.current.scrollTop));
    }

    const dateRange = new URLSearchParams();
    if (fromDate) dateRange.set("from", fromDate);
    if (toDate) dateRange.set("to", toDate);
    const query = dateRange.toString();
    router.push(`${buildWorkspaceRoute(mode, `/reports/${nextSlug}`)}${query ? `?${query}` : ""}`);
  }

  function updateBalanceSheetPeriod(period: "latest-month" | "custom" | "today" | "this-month" | "this-year") {
    setBalanceSheetPeriod(period);
    if (period === "custom") return;

    if (period === "latest-month") {
      const range = latestWorkspacePostingRange;
      if (range) {
        setFromDate(range.from);
        setToDate(range.to);
      }
      return;
    }

    const nextTo = today;
    const nextFrom = period === "today" ? today : period === "this-month" ? `${today.slice(0, 8)}01` : `${today.slice(0, 4)}-01-01`;
    setFromDate(nextFrom);
    setToDate(nextTo);
  }

  function updateTrialBalancePeriod(period: "latest-month" | "custom" | "today" | "this-month" | "this-year") {
    setTrialBalancePeriod(period);
    if (period === "custom") return;
    if (period === "latest-month") {
      const range = latestWorkspacePostingRange;
      if (range) {
        setFromDate(range.from);
        setToDate(range.to);
      }
      return;
    }
    const nextFrom = period === "today" ? today : period === "this-month" ? `${today.slice(0, 8)}01` : `${today.slice(0, 4)}-01-01`;
    setFromDate(nextFrom);
    setToDate(today);
  }

  function updatePurchaseRegisterPeriod(period: "latest-sales-month" | "latest-purchase-month" | "latest-receipt-month" | "latest-payment-month" | "latest-sales-return-month" | "latest-purchase-return-month" | "latest-cash-month" | "this-month" | "last-month" | "last-6-months" | "last-1-year" | "custom") {
    setPurchaseRegisterPeriod(period);
    if (period === "custom") return;

    // Every "latest" transaction/report preset shares one workspace-wide anchor:
    // the last valid posting date. This prevents different reports from silently
    // opening on different months merely because that voucher type was last used
    // earlier than another one.
    if (period.startsWith("latest-")) {
      if (latestWorkspacePostingRange) {
        setFromDate(latestWorkspacePostingRange.from);
        setToDate(latestWorkspacePostingRange.to);
      }
      return;
    }

    if (period === "latest-sales-month") {
      const range = getLatestPostingMonthRange(
        dataset.vouchers
          .filter(
            (voucher) =>
              voucher.workspaceId === workspaceId
              && isLiveVoucher(voucher)
              && isRealSalesInvoice(voucher),
          )
          .map((voucher) => voucher.voucherDate),
      );
      if (range) {
        setFromDate(range.from);
        setToDate(range.to);
      }
      return;
    }

    if (period === "latest-purchase-month") {
      const range = getLatestPostingMonthRange(
        dataset.vouchers
          .filter(
            (voucher) =>
              voucher.workspaceId === workspaceId
              && isLiveVoucher(voucher)
              && isRealPurchaseBill(voucher),
          )
          .map((voucher) => voucher.voucherDate),
      );
      if (range) {
        setFromDate(range.from);
        setToDate(range.to);
      }
      return;
    }

    if (period === "latest-receipt-month") {
      const range = getLatestPostingMonthRange(
        dataset.vouchers
          .filter(
            (voucher) =>
              voucher.workspaceId === workspaceId
              && isLiveVoucher(voucher)
              && !isReversalArtifact(voucher)
              && voucher.voucherType === "receipt",
          )
          .map((voucher) => voucher.voucherDate),
      );
      if (range) {
        setFromDate(range.from);
        setToDate(range.to);
      }
      return;
    }

    if (period === "latest-payment-month") {
      const range = getLatestPostingMonthRange(
        dataset.vouchers
          .filter(
            (voucher) =>
              voucher.workspaceId === workspaceId
              && isLiveVoucher(voucher)
              && !isReversalArtifact(voucher)
              && voucher.voucherType === "payment",
          )
          .map((voucher) => voucher.voucherDate),
      );
      if (range) {
        setFromDate(range.from);
        setToDate(range.to);
      }
      return;
    }

    if (period === "latest-sales-return-month") {
      const range = getLatestPostingMonthRange(
        dataset.vouchers
          .filter(
            (voucher) =>
              voucher.workspaceId === workspaceId
              && isLiveVoucher(voucher)
              && !isReversalArtifact(voucher)
              && voucher.voucherType === "credit-note",
          )
          .map((voucher) => voucher.voucherDate),
      );
      if (range) {
        setFromDate(range.from);
        setToDate(range.to);
      }
      return;
    }

    if (period === "latest-purchase-return-month") {
      const range = getLatestPostingMonthRange(
        dataset.vouchers
          .filter(
            (voucher) =>
              voucher.workspaceId === workspaceId
              && isLiveVoucher(voucher)
              && !isReversalArtifact(voucher)
              && voucher.voucherType === "debit-note",
          )
          .map((voucher) => voucher.voucherDate),
      );
      if (range) {
        setFromDate(range.from);
        setToDate(range.to);
      }
      return;
    }

    if (period === "latest-cash-month") {
      const range = getLatestPostingMonthRange(
        dataset.vouchers
          .filter(
            (voucher) =>
              voucher.workspaceId === workspaceId
              && isLiveVoucher(voucher)
              && !isReversalArtifact(voucher)
              && hasCashBookMovement(voucher),
          )
          .map((voucher) => voucher.voucherDate),
      );
      if (range) {
        setFromDate(range.from);
        setToDate(range.to);
      }
      return;
    }

    const todayDate = new Date(`${today}T00:00:00`);
    let start = new Date(todayDate);
    let end = new Date(todayDate);
    if (period === "this-month") {
      start.setDate(1);
    } else if (period === "last-month") {
      start = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1);
      end = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0);
    } else if (period === "last-6-months") {
      start.setMonth(start.getMonth() - 6);
    } else {
      start.setFullYear(start.getFullYear() - 1);
    }
    const toDateKey = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    setFromDate(toDateKey(start));
    setToDate(toDateKey(end));
  }

  function updateAuditPeriod(period: typeof auditPeriod) {
    setAuditPeriod(period);
    if (period === "custom") return;

    const end = new Date(`${activityToday}T12:00:00`);
    if (period === "yesterday") end.setDate(end.getDate() - 1);
    const start = new Date(end);
    if (period === "last-7-days") start.setDate(start.getDate() - 6);
    if (period === "last-30-days") start.setDate(start.getDate() - 29);
    const toDateKey = end.toISOString().slice(0, 10);
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(toDateKey);
  }

  function updateAllTransactionsPeriod(period: typeof allTransactionsPeriod) {
    setAllTransactionsPeriod(period);
    if (period === "custom") return;

    const postingDates = dataset.vouchers
      .filter(
        (voucher) =>
          voucher.workspaceId === workspaceId
          && isLiveVoucher(voucher)
          && !isReversalArtifact(voucher),
      )
      .map((voucher) => voucher.voucherDate)
      .filter(Boolean)
      .sort();
    const latestPostingDate = postingDates.at(-1) ?? today;
    const anchor = new Date(`${latestPostingDate}T00:00:00`);
    let start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    let end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    if (period === "previous-month") {
      start = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
      end = new Date(anchor.getFullYear(), anchor.getMonth(), 0);
    } else if (period === "last-6-months") {
      start = new Date(anchor.getFullYear(), anchor.getMonth() - 5, 1);
    } else if (period === "last-1-year") {
      start = new Date(anchor.getFullYear() - 1, anchor.getMonth() + 1, 1);
    }
    const dateKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    setFromDate(dateKey(start));
    setToDate(dateKey(end));
  }

  function printActiveReport() {
    toast.info("Opening print preview for this report only.");
    document.body.classList.add("report-printing");
    const cleanup = () => document.body.classList.remove("report-printing");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1_000);
  }

  function openExpenseEntry() {
    router.push(buildVoucherRoute(mode, "expense"));
  }

  function openMfsVoucherEditor(voucherId: string, voucherType: VoucherType) {
    router.push(
      voucherType === "contra"
        ? `${buildWorkspaceRoute(mode, "/utilities/bank-transfers")}?edit=${encodeURIComponent(voucherId)}`
        : `${buildVoucherRoute(mode, voucherType)}?edit=${encodeURIComponent(voucherId)}`,
    );
  }

  async function confirmDeleteMfsVouchers() {
    if (!workspaceId || !mfsDeleteVoucherIds.length || mfsDeleteBusy) return;

    const ids = [...new Set(mfsDeleteVoucherIds)];
    setMfsDeleteBusy(true);
    try {
      for (const voucherId of ids) {
        await deleteVoucher(mode, voucherId, workspaceId);
      }
      setMfsDeleteVoucherIds([]);
      setSelectedMfsVoucherIds((current) => current.filter((id) => !ids.includes(id)));
      await datasetQuery.refetch();
      toast.success(`${ids.length} MFS transaction${ids.length === 1 ? "" : "s"} deleted`);
    } catch (error) {
      await datasetQuery.refetch();
      toast.error(error instanceof Error ? error.message : "MFS transaction could not be deleted");
    } finally {
      setMfsDeleteBusy(false);
    }
  }

  function exportActiveReport() {
    if (activeReport.kind === "trial-balance") {
      downloadCsv(
        `${activeCatalogItem.slug}.csv`,
        activeReport.rows.map((row) => ({
          Ledger: row.ledger,
          Group: row.group,
          OpeningBalance: formatClosingBalance(row.openingBalance),
          Debit: row.debit,
          Credit: row.credit,
          ClosingBalance: row.closingBalance,
        })),
      );
      toast.success(`${activeReport.title} exported`);
      return;
    }

    if (activeReport.kind === "balance-sheet") {
      const rows = [
        ...activeReport.liabilities.flatMap((section) =>
          section.lines.map((line) => ({
            Side: "Liabilities",
            Section: section.title,
            Account: line.label,
            Amount: formatReportAmount(line.amount),
          })),
        ),
        ...activeReport.assets.flatMap((section) =>
          section.lines.map((line) => ({
            Side: "Assets",
            Section: section.title,
            Account: line.label,
            Amount: formatReportAmount(line.amount),
          })),
        ),
      ];
      downloadCsv(`${activeCatalogItem.slug}.csv`, rows);
      toast.success(`${activeReport.title} exported`);
      return;
    }

    if (activeReport.kind === "profit-loss") {
      downloadCsv(
        `${activeCatalogItem.slug}.csv`,
        activeReport.rows.map((row) => ({
          Particulars: row.label,
          Amount: row.amount,
        })),
      );
      toast.success(`${activeReport.title} exported`);
      return;
    }

    if (activeCatalogItem.slug === "customer-supplier-comparison" && activeReport.kind === "table") {
      downloadCsv(
        `${activeCatalogItem.slug}.csv`,
        activeReport.rows.map((row) => Object.fromEntries(
          activeReport.columns.map((column) => [column, row[column] ?? "-"]),
        )),
      );
      toast.success(`${activeReport.title} exported`);
      return;
    }

    downloadCsv(`${activeCatalogItem.slug}.csv`, activeReport.rows);
    toast.success(`${activeReport.title} exported`);
  }

  function renderReportView() {
    if (datasetQuery.isError) {
      return (
        <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center">
          <div className="text-[17px] font-semibold text-[#25365b]">Report data could not be loaded</div>
          <div className="max-w-[420px] text-sm leading-6 text-[#6f7f98]">
            The workspace data behind this report is unavailable right now. Retry once the local service is reachable.
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#cf670f]"
            onClick={() => void datasetQuery.refetch()}
          >
            Retry
          </button>
        </div>
      );
    }

    if (datasetQuery.isPending) {
      return (
        <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-[#6f7f98]">Loading report data...</div>
      );
    }

    if (mode === "api" && slug === "customer-supplier-comparison" && reportAccountTreeQuery.isPending) {
      return (
        <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-[#6f7f98]">Loading Chart of Accounts for exact collection and payment totals...</div>
      );
    }

    if (mode === "api" && slug === "customer-supplier-comparison" && reportAccountTreeQuery.isError) {
      return (
        <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center">
          <div className="text-[17px] font-semibold text-[#25365b]">Chart of Accounts could not be loaded</div>
          <div className="max-w-[440px] text-sm leading-6 text-[#6f7f98]">
            This report uses account IDs to identify Cash, Bank and MFS movement. Retry before viewing collection or payment totals.
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#cf670f]"
            onClick={() => void reportAccountTreeQuery.refetch()}
          >
            Retry
          </button>
        </div>
      );
    }

    if (mode === "api" && isAuditReportSlug && auditReportQuery.isError) {
      return (
        <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center">
          <ShieldCheck className="h-10 w-10 text-[#4169c1]" />
          <div className="text-[17px] font-semibold text-[#25365b]">Audit data could not be loaded</div>
          <div className="max-w-[430px] text-sm leading-6 text-[#6f7f98]">The audit service is unavailable right now. Retry when the API is reachable.</div>
          <button type="button" className="rounded-full bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]" onClick={() => void auditReportQuery.refetch()}>Retry</button>
        </div>
      );
    }

    if (mode === "api" && isAuditReportSlug && auditReportQuery.isPending) {
      return <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-[#6f7f98]">Loading audit activity...</div>;
    }

    if (isWarehouseReportSlug && mode !== "api") {
      return (
        <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center">
          <div className="text-[17px] font-semibold text-[#25365b]">Warehouse Wise Report needs a live workspace</div>
          <div className="max-w-[430px] text-sm leading-6 text-[#6f7f98]">Warehouse-level stock tracking is only available in the live/API workspace, not in demo or offline mode.</div>
        </div>
      );
    }

    if (mode === "api" && isWarehouseReportSlug && warehouseStockQuery.isError) {
      return (
        <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center">
          <div className="text-[17px] font-semibold text-[#25365b]">Warehouse stock could not be loaded</div>
          <div className="max-w-[430px] text-sm leading-6 text-[#6f7f98]">The inventory service is unavailable right now. Retry when the API is reachable.</div>
          <button type="button" className="rounded-full bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]" onClick={() => void warehouseStockQuery.refetch()}>Retry</button>
        </div>
      );
    }

    if (mode === "api" && isWarehouseReportSlug && warehouseStockQuery.isPending) {
      return <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-[#6f7f98]">Loading warehouse stock...</div>;
    }

    if (activeReport.kind === "profit-loss") {
      const amountFor = (label: string) => activeReport.rows.find((row) => row.label === label)?.amount ?? 0;
      const salesRevenue = amountFor("Sales Revenue");
      const salesReturns = amountFor("Less: Sales Returns / Credit Notes");
      const netSales = amountFor("Net Sales");
      const costOfGoodsSold = amountFor("Less: Cost of Goods Sold (MWA)");
      const purchaseReturnVariance = amountFor("Purchase Return Cost Variance");
      const grossProfit = amountFor("Gross Profit");
      const otherIncome = amountFor("Add: Other Income");
      const operatingExpenses = amountFor("Less: Operating Expenses");
      const netProfit = amountFor("Net Profit / (Loss)");
      const tradingCredits = netSales;
      const tradingDebits = sumMoney([costOfGoodsSold, -purchaseReturnVariance]);
      const incomeCredits = sumMoney([grossProfit, otherIncome]);
      const incomeDebits = operatingExpenses;
      const isProfit = moneyToMinorUnits(netProfit) >= 0;
      const periodVouchers = dataset.vouchers.filter(
        (voucher) => voucher.workspaceId === workspaceId && isAccountingVoucher(voucher) && voucher.voucherDate >= fromDate && voucher.voucherDate <= toDate,
      );
      const detailAccountIndex = buildReportAccountIndex(reportAccountTreeQuery.data);
      const hasAccountTree = Boolean(reportAccountTreeQuery.data?.length);
      const voucherHasAccount = (voucher: VoucherRecord, predicate: (account: ReportAccountMetadata) => boolean) => voucher.lines.some((line) => {
        const account = detailAccountIndex.resolve(line);
        return account ? predicate(account) : false;
      });
      const salesVouchers = hasAccountTree
        ? periodVouchers.filter((voucher) => voucherHasAccount(voucher, isSalesRevenueAccount))
        : periodVouchers.filter(isRealSalesInvoice);
      const salesReturnVouchers = hasAccountTree
        ? periodVouchers.filter((voucher) => voucherHasAccount(voucher, isSalesReturnAccount))
        : periodVouchers.filter((voucher) => voucher.voucherType === "credit-note" && !isReversalArtifact(voucher));
      const directExpenseVouchers = hasAccountTree
        ? periodVouchers.filter((voucher) => voucherHasAccount(voucher, (account) => account.nature === "DIRECT_EXPENSE"))
        : periodVouchers.filter((voucher) => voucher.voucherType === "expense" && !isReversalArtifact(voucher));
      const operatingExpenseVouchers = hasAccountTree
        ? periodVouchers.filter((voucher) => voucherHasAccount(voucher, (account) => account.nature === "INDIRECT_EXPENSE"))
        : directExpenseVouchers;
      const otherIncomeVouchers = hasAccountTree
        ? periodVouchers.filter((voucher) => voucherHasAccount(voucher, (account) => account.nature === "INCOME" && !isSalesRevenueAccount(account) && !isSalesReturnAccount(account)))
        : periodVouchers.filter((voucher) => voucher.voucherType === "revenue" && !isReversalArtifact(voucher));
      const purchaseReturnVouchers = periodVouchers.filter((voucher) => voucher.voucherType === "debit-note" && !isReversalArtifact(voucher));
      const detailIdFor = (label: string) => {
        const normalized = normalizeReportKey(label);
        if (normalized.includes("sales revenue")) return "sales-revenue";
        if (normalized.includes("sales return")) return "sales-returns";
        if (normalized.includes("net sales") || normalized.includes("trading total")) return "net-sales";
        if (normalized.includes("cost of goods sold")) return "cost-of-goods-sold";
        if (normalized.includes("purchase return")) return "purchase-return-variance";
        if (normalized.includes("gross profit")) return "gross-profit";
        if (normalized.includes("other income")) return "other-income";
        if (normalized.includes("operating expenses")) return "operating-expenses";
        return "net-profit-loss";
      };
      const detailFor = (label: string, amount: number): ProfitLossDetail => {
        if (label.includes("Sales Revenue")) return { label, amount, calculation: "Net credit movement of Sales Accounts COA ledgers in the selected period.", vouchers: salesVouchers };
        if (label.includes("Sales Returns")) return { label, amount, calculation: "Net debit movement of Sales Return COA ledgers in the selected period.", vouchers: salesReturnVouchers };
        if (label.includes("Net Sales")) return { label, amount, calculation: "Sales Revenue − Sales Returns / Credit Notes.", vouchers: [...salesVouchers, ...salesReturnVouchers] };
        if (label.includes("Cost of Goods Sold")) return { label, amount, calculation: "Opening Stock + Purchases − Purchase Returns + Direct Expenses − Closing Stock.", vouchers: [...salesVouchers, ...salesReturnVouchers, ...directExpenseVouchers], formula: activeReport.cogsFormula };
        if (label.includes("Purchase Return")) return { label, amount, calculation: "Supplier refund value − MWA inventory cost relieved by purchase returns.", vouchers: purchaseReturnVouchers };
        if (label.includes("Other Income")) return { label, amount, calculation: "Net credit movement of Income-nature COA ledgers outside Sales Accounts.", vouchers: otherIncomeVouchers, ledgerBreakdown: activeReport.otherIncomeBreakdown };
        if (label.includes("Operating Expenses")) return { label, amount, calculation: "Net debit movement of Indirect Expense-nature COA ledgers.", vouchers: operatingExpenseVouchers, ledgerBreakdown: activeReport.operatingExpenseBreakdown };
        if (label.includes("Gross Profit")) return { label, amount, calculation: "Net Sales − Cost of Goods Sold + Purchase Return Cost Variance.", vouchers: [...salesVouchers, ...salesReturnVouchers, ...purchaseReturnVouchers, ...directExpenseVouchers] };
        return { label, amount, calculation: "Gross Profit + Other Income − Operating Expenses.", vouchers: [...salesVouchers, ...salesReturnVouchers, ...purchaseReturnVouchers, ...otherIncomeVouchers, ...operatingExpenseVouchers] };
      };
      const reportDetail = profitLossDetail
        ? activeReport.rows.map((row) => detailFor(row.label, row.amount)).find((detail) => detailIdFor(detail.label) === profitLossDetail)
        : null;
      if (profitLossDetail) {
        if (!reportDetail) return <div className="rounded-lg border border-dashed border-[#dbe4ef] p-8 text-center text-sm text-[#718098]">Profit & Loss detail was not found for this link.</div>;
        return <ProfitLossDetailPage
          detail={reportDetail}
          onBack={() => router.back()}
          onOpenVoucher={(voucher) => router.push(`${buildVoucherRoute(mode, voucher.voucherType)}?edit=${encodeURIComponent(voucher.id)}`)}
          onOpenProduct={(itemId) => router.push(`${buildWorkspaceRoute(mode, "/masters/inventory")}?item=${encodeURIComponent(itemId)}`)}
        />;
      }
      const openDetailPage = (label: string) => router.push(buildWorkspaceRoute(mode, `/reports/profit-loss/${detailIdFor(label)}?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`));
      const statementLine = (label: string, amount: number, emphasis = false, indent = false) => (
        <button
          type="button"
          onClick={() => openDetailPage(label)}
          className={cn("grid w-full grid-cols-[1fr_190px] gap-4 px-5 py-2.5 text-left text-sm transition-colors hover:bg-[#edf5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]", emphasis ? "border-t border-[#cfd9e8] font-semibold text-[#172b4d]" : "text-[#324766]")}
        >
          <span className={indent ? "pl-5" : ""}>{label}</span>
          <span className="text-right tabular-nums underline decoration-dotted underline-offset-4">{formatReportAmount(amount)}</span>
        </button>
      );
      const statementTotal = (label: string, amount: number) => (
        <button
          type="button"
          onClick={() => openDetailPage(label)}
          className="w-full border-t border-[#d7dfeb] px-5 py-3 text-right text-sm font-semibold text-[#25365b] transition-colors hover:bg-[#edf5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]"
        >
          {label}: <span className="tabular-nums underline decoration-dotted underline-offset-4">{formatReportAmount(amount)}</span>
        </button>
      );

      return (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-[10px] border border-[#d8e1ee] bg-white px-3 py-2 text-sm text-[#324766] shadow-sm">
                <span>From</span>
                <div className="relative">
                  <AppDateInput value={fromDate} onChange={setFromDate} className="w-[140px]" inputClassName="h-8 border-0 bg-transparent px-2 py-0 pr-8 shadow-none" aria-label="Profit and loss from date" />
                </div>
                <span>To</span>
                <div className="relative">
                  <AppDateInput value={toDate} onChange={setToDate} className="w-[140px]" inputClassName="h-8 border-0 bg-transparent px-2 py-0 pr-8 shadow-none" aria-label="Profit and loss to date" />
                </div>
              </div>

              <div className="text-[27px] font-semibold text-[#25365b]">{activeReport.title}</div>
              <div className="flex items-center gap-5 text-[15px] text-[#324766]">
                <span>View :</span>
                {(["bizovix", "accounting"] as const).map((option) => (
                  <label key={option} className="inline-flex items-center gap-2">
                    <input type="radio" checked={profitLossView === option} onChange={() => setProfitLossView(option)} />
                    <span>{option === "bizovix" ? "Vertical" : "Two-column"}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {activeReport.summary.map((item) => (
                <div key={item.label} className={cn("rounded-full px-4 py-2 text-sm font-semibold", toneClassMap[item.tone ?? "blue"])}>
                  {item.label}: {item.value}
                </div>
              ))}
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d7dfeb] text-[#0f9f63] shadow-sm hover:bg-[#f5fbf8]" onClick={exportActiveReport}>
                <Download className="h-4 w-4" />
              </button>
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d7dfeb] text-[#5ea7b8] shadow-sm hover:bg-[#f5fbfd]" onClick={printActiveReport}>
                <Printer className="h-4 w-4" />
              </button>
            </div>
          </div>

          {profitLossView === "bizovix" ? (
            <div className="overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white">
              <div className="border-b border-[#d7dfeb] bg-[#f7f7f8] px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#25365b]">Trading Account</div>
              {statementLine("Sales Revenue", salesRevenue)}
              {statementLine("Less: Sales Returns / Credit Notes", salesReturns, false, true)}
              {statementLine("Net Sales", netSales, true)}
              {statementLine("Less: Cost of Goods Sold (MWA)", costOfGoodsSold)}
              {moneyToMinorUnits(purchaseReturnVariance) !== 0 ? statementLine("Add: Purchase Return Cost Variance", purchaseReturnVariance) : null}
              {statementLine("Gross Profit", grossProfit, true)}
              <div className="border-y border-[#d7dfeb] bg-[#f7f7f8] px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#25365b]">Income Statement</div>
              {statementLine("Gross Profit b/f", grossProfit)}
              {statementLine("Add: Other Income", otherIncome)}
              {statementLine("Less: Operating Expenses", operatingExpenses)}
              {statementLine("Net Profit / (Loss)", netProfit, true)}
            </div>
          ) : (
            <div className="grid overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white lg:grid-cols-2">
              <div className="border-b border-[#d7dfeb] lg:border-b-0 lg:border-r">
                <div className="grid grid-cols-[1fr_170px] border-b border-[#d7dfeb] bg-[#f7f7f8] px-5 py-3 text-sm font-semibold text-[#25365b]"><span>Particulars</span><span className="text-right">Debit</span></div>
                <div className="px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#25365b]">Trading Account</div>
                {statementLine("Cost of Goods Sold (MWA)", costOfGoodsSold)}
                {moneyToMinorUnits(purchaseReturnVariance) !== 0 ? statementLine("Purchase Return Cost Variance", purchaseReturnVariance) : null}
                {statementLine("Gross Profit c/o", grossProfit, true)}
                {statementTotal("Trading Total", sumMoney([tradingDebits, grossProfit]))}
                <div className="border-y border-[#d7dfeb] px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#25365b]">Income Statement</div>
                {statementLine("Operating Expenses", operatingExpenses)}
                {isProfit ? statementLine("Net Profit", netProfit, true) : null}
                {statementTotal("Income Total", sumMoney([incomeDebits, isProfit ? netProfit : 0]))}
              </div>
              <div>
                <div className="grid grid-cols-[1fr_170px] border-b border-[#d7dfeb] bg-[#f7f7f8] px-5 py-3 text-sm font-semibold text-[#25365b]"><span>Particulars</span><span className="text-right">Credit</span></div>
                <div className="px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#25365b]">Trading Account</div>
                {statementLine("Net Sales", netSales)}
                {statementTotal("Trading Total", tradingCredits)}
                <div className="border-y border-[#d7dfeb] px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#25365b]">Income Statement</div>
                {statementLine("Gross Profit b/f", grossProfit)}
                {statementLine("Other Income", otherIncome)}
                {!isProfit ? statementLine("Net Loss", Math.abs(netProfit), true) : null}
                {statementTotal("Income Total", sumMoney([incomeCredits, !isProfit ? Math.abs(netProfit) : 0]))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activeReport.kind === "balance-sheet") {
      const balanceDifference = roundMoney(activeReport.totalAssets - activeReport.totalLiabilities);
      const isBalanced = moneyAmountsEqual(activeReport.totalAssets, activeReport.totalLiabilities);
      return (
        <div className="space-y-5">
          {/* Pulled up by the scroll pane's own py-5/pl-4/pr-2 padding (see the
              #report-print-area wrapper) and given matching padding back, so the
              sticky block sits flush against the real edges with no residual gap
              once scrolled — a plain `top-0` alone would leave that padding as a
              permanent blank strip above it. */}
          <div className="sticky -top-5 z-10 -ml-4 -mr-2 -mt-5 space-y-4 bg-white pl-4 pr-2 pt-5">
          <div className="flex flex-wrap items-center gap-2.5 pb-3">
            <div className="text-[15px] font-semibold text-[#25365b]">{activeReport.title}</div>
            <span className="text-xs text-[#324766]">Period :</span>
            <div className="relative">
              <select
                value={balanceSheetPeriod}
                onChange={(event) => updateBalanceSheetPeriod(event.target.value as "latest-month" | "custom" | "today" | "this-month" | "this-year")}
                className="h-7 appearance-none rounded-full border-0 bg-[#dfeeff] pl-3 pr-7 text-xs font-medium text-[#244c88] outline-none focus:ring-2 focus:ring-[#8ebcf2]"
                aria-label="Balance sheet period"
              >
                <option value="latest-month">Last Posting Month</option>
                <option value="custom">Custom</option>
                <option value="today">Today</option>
                <option value="this-month">This Month</option>
                <option value="this-year">This Year</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#244c88]" />
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#dfeeff] px-2.5 py-1 text-xs font-medium text-[#244c88]">
              <CalendarDays className="h-3.5 w-3.5" />
              <AppDateInput
                value={fromDate}
                max={toDate}
                onChange={(value) => {
                  setBalanceSheetPeriod("custom");
                  setFromDate(value);
                }}
                className="w-[116px]"
                inputClassName="h-6 border-0 bg-transparent px-1 pr-7 text-xs shadow-none focus:ring-0"
                aria-label="Balance sheet from date"
              />
              <span>To</span>
              <AppDateInput
                value={toDate}
                min={fromDate}
                onChange={(value) => {
                  setBalanceSheetPeriod("custom");
                  setToDate(value);
                }}
                className="w-[116px]"
                inputClassName="h-6 border-0 bg-transparent px-1 pr-7 text-xs shadow-none focus:ring-0"
                aria-label="Balance sheet to date"
              />
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex h-7 min-w-[62px] items-center justify-center gap-1.5 rounded-full bg-[#e35a46] px-2.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#cf4f3c]"
                onClick={printActiveReport}
                title="Print or save the balance sheet as PDF"
              >
                <FileText className="h-3 w-3" strokeWidth={2.2} />
                <span>PDF</span>
              </button>
              <button
                type="button"
                className="inline-flex h-7 min-w-[62px] items-center justify-center gap-1.5 rounded-full bg-[#2f9c50] px-2.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#268244]"
                onClick={exportActiveReport}
                title="Download an Excel-compatible CSV file"
              >
                <FileSpreadsheet className="h-3 w-3" strokeWidth={2.2} />
                <span>XLS</span>
              </button>
              <div className="inline-flex items-center rounded-full border border-[#d7dfeb] bg-white p-0.5 shadow-sm">
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-7 min-w-[88px] items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition",
                    balanceSheetOrientation === "horizontal"
                      ? "bg-[#eef4ff] text-[#255fca]"
                      : "text-[#5d6c86] hover:bg-[#f7f9fc]",
                  )}
                  onClick={() => updateBalanceSheetOrientation("horizontal")}
                  aria-pressed={balanceSheetOrientation === "horizontal"}
                >
                  <Columns2 className="h-3.5 w-3.5" />
                  <span>Horizontal</span>
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-7 min-w-[76px] items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition",
                    balanceSheetOrientation === "vertical"
                      ? "bg-[#eef4ff] text-[#255fca]"
                      : "text-[#5d6c86] hover:bg-[#f7f9fc]",
                  )}
                  onClick={() => updateBalanceSheetOrientation("vertical")}
                  aria-pressed={balanceSheetOrientation === "vertical"}
                >
                  <Rows3 className="h-3.5 w-3.5" />
                  <span>Vertical</span>
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-[#d7dfeb] pb-4 pt-4 text-[17px] font-semibold text-[#25365b]">
            Balance Sheet as on {formatDate(toDate)}
          </div>
          </div>

          <div className="overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white">
            <div className={cn("grid", balanceSheetOrientation === "horizontal" ? "lg:grid-cols-2" : "grid-cols-1")}>
              <BalanceSheetPanel
                title="Equities & Liabilities"
                sections={activeReport.liabilities}
                totalLabel="Total Equities & Liabilities"
                total={activeReport.totalLiabilities}
                divider={balanceSheetOrientation === "horizontal"}
              />
              <BalanceSheetPanel
                title="Assets"
                sections={activeReport.assets}
                totalLabel="Total Assets"
                total={activeReport.totalAssets}
              />
            </div>
          </div>
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm font-semibold",
              isBalanced
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700",
            )}
          >
            <span>{isBalanced ? "Balance Sheet is balanced" : "Balance Sheet is out of balance"}</span>
            <span>
              Difference: {formatReportAmount(Math.abs(balanceDifference))}
              {!isBalanced && (moneyToMinorUnits(balanceDifference) > 0 ? " (Assets higher)" : " (Liabilities higher)")}
            </span>
          </div>
        </div>
      );
    }

    if (activeReport.kind === "trial-balance") {
      return (
        <div data-trial-balance-report className="space-y-5">
          <div data-trial-balance-header className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="text-[27px] font-semibold text-[#25365b]">{activeReport.title}</div>
              <div className="text-sm text-[#6d7b94]">{activeReport.description}</div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d7dfeb] text-[#0f9f63] shadow-sm hover:bg-[#f5fbf8]" onClick={exportActiveReport}>
                <Download className="h-4 w-4" />
              </button>
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d7dfeb] text-[#5ea7b8] shadow-sm hover:bg-[#f5fbfd]" onClick={printActiveReport}>
                <Printer className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div data-trial-balance-period-filter className="flex flex-wrap items-center gap-3 rounded-[8px] border border-[#d7dfeb] bg-[#f8fbff] px-4 py-3 text-sm text-[#324766]">
            <span className="font-semibold">Period</span>
            <select
              value={trialBalancePeriod}
              onChange={(event) => updateTrialBalancePeriod(event.target.value as "latest-month" | "custom" | "today" | "this-month" | "this-year")}
              className="h-9 rounded-[6px] border border-[#ccd7e6] bg-white px-3 font-medium outline-none focus:ring-2 focus:ring-[#8ebcf2]"
              aria-label="Trial balance period"
            >
              <option value="latest-month">Last Posting Month</option>
              <option value="today">Today</option>
              <option value="this-month">This Month</option>
              <option value="this-year">This Year</option>
              <option value="custom">Custom</option>
            </select>
            <div className="inline-flex items-center gap-2 rounded-[6px] border border-[#ccd7e6] bg-white px-3">
              <CalendarDays className="h-4 w-4 text-[#315b8f]" />
              <AppDateInput
                value={fromDate}
                max={toDate}
                onChange={(value) => { setTrialBalancePeriod("custom"); setFromDate(value); }}
                className="w-[138px]"
                inputClassName="h-9 border-0 px-1 pr-8 shadow-none focus:ring-0"
                aria-label="Trial balance from date"
              />
              <span className="text-[#7a8799]">To</span>
              <AppDateInput
                value={toDate}
                min={fromDate}
                onChange={(value) => { setTrialBalancePeriod("custom"); setToDate(value); }}
                className="w-[138px]"
                inputClassName="h-9 border-0 px-1 pr-8 shadow-none focus:ring-0"
                aria-label="Trial balance to date"
              />
            </div>
            <span className="text-xs text-[#718099]">Closing balance as on {formatDate(toDate)}</span>
          </div>

          <div data-trial-balance-table className="overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white">
            <div data-trial-balance-grid data-trial-balance-header-grid className="grid grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,0.75fr))] border-b border-[#d7dfeb] bg-[#f7f7f8] text-[13px] font-semibold text-[#34445d] 2xl:grid-cols-[minmax(360px,1fr)_170px_150px_150px_170px]">
              <div className="row-span-2 flex items-center border-r border-[#d7dfeb] px-5 py-3 uppercase tracking-[0.16em]">Particulars</div>
              <div className="row-span-2 flex items-center justify-end border-r border-[#d7dfeb] px-3 py-3 text-right">Opening Balance</div>
              <div className="col-span-2 border-b border-r border-[#d7dfeb] px-3 py-1.5 text-center">Transactions</div>
              <div className="row-span-2 flex items-center justify-end px-3 py-3 text-right">Closing Balance</div>
              <div className="border-r border-[#d7dfeb] px-3 py-1.5 text-right">Debit</div>
              <div className="border-r border-[#d7dfeb] px-3 py-1.5 text-right">Credit</div>
            </div>
            <TrialBalanceAccountTree rows={activeReport.rows} />
            <div data-trial-balance-grid className="grid grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,0.75fr))] border-t border-[#d7dfeb] bg-[#fff4bf] px-5 py-3 text-[15px] 2xl:grid-cols-[minmax(360px,1fr)_170px_150px_150px_170px]">
                <div className="font-bold uppercase tracking-[0.12em] text-[#25365b]">Grand Total</div>
                <div />
                <div className="text-right font-semibold text-[#0f9f63]">{formatReportAmount(activeReport.totalDebit)}</div>
                <div className="text-right font-semibold text-[#0f5fc4]">{formatReportAmount(activeReport.totalCredit)}</div>
                <div />
            </div>
          </div>
        </div>
      );
    }

    if (activeReport.kind === "loan-statement") {
      return (
        <div className="flex min-h-full flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap items-end gap-6">
              <label className="grid gap-2 text-sm font-semibold text-[#1674ff]">
                <span>ACCOUNT:</span>
                <select value={activeReport.selectedAccount} onChange={(event) => setSelectedLoanAccount(event.target.value)} className="h-11 min-w-[420px] rounded-[6px] border border-[#ccd7e6] bg-white px-4 text-[15px] text-[#24365a] outline-none">
                  {!activeReport.accountOptions.length ? <option value="">No loan accounts</option> : null}
                  {activeReport.accountOptions.map((account) => (
                    <option key={account} value={account}>
                      {account}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-3 pb-[1px]">
                <AppDateInput value={fromDate} max={toDate} onChange={setFromDate} className="w-[166px]" inputClassName="h-11 rounded-[6px] border-[#ccd7e6]" aria-label="Loan statement from date" />
                <span className="text-[#1674ff]">TO</span>
                <AppDateInput value={toDate} min={fromDate} onChange={setToDate} className="w-[166px]" inputClassName="h-11 rounded-[6px] border-[#ccd7e6]" aria-label="Loan statement to date" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d7dfeb] text-[#0f9f63] shadow-sm hover:bg-[#f5fbf8]" onClick={exportActiveReport}>
                <Download className="h-4 w-4" />
              </button>
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d7dfeb] text-[#5ea7b8] shadow-sm hover:bg-[#f5fbfd]" onClick={printActiveReport}>
                <Printer className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => router.push(buildWorkspaceRoute(mode, "/utilities/loan-accounts?create=1"))} className="inline-flex items-center gap-2 rounded-[10px] bg-[#eb6b20] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(235,107,32,0.2)] hover:bg-[#d85d15]">
                <Plus className="h-4 w-4" />
                Add Loan A/C
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[#d7dfeb] bg-white">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr] border-b border-[#d7dfeb] bg-[#f7f7f8] px-3 py-3 text-[13px] font-semibold text-[#6d7b94]">
              <div>DATE</div>
              <div>TYPE</div>
              <div>Amount</div>
              <div>Ending Balance</div>
            </div>
            {activeReport.rows.length ? (
              activeReport.rows.map((row, index) => (
                <button
                  key={`${row.date}-${row.type}-${index}`}
                  type="button"
                  className="grid grid-cols-[1fr_1fr_1fr_1fr] px-3 py-4 text-left text-[15px] text-[#24365a] transition hover:bg-[#eef6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#2563eb]"
                  onClick={() => setSelectedOperationalReportDetail({
                    title: row.type,
                    reportTitle: activeReport.title,
                    group: "Banking Reports",
                    fields: [
                      { label: "Date", value: formatDate(row.date) },
                      { label: "Type", value: row.type },
                      { label: "Amount", value: formatReportAmount(row.amount) },
                      { label: "Ending Balance", value: formatReportAmount(row.endingBalance) },
                    ],
                  })}
                >
                  <div>{formatDate(row.date)}</div>
                  <div>{row.type}</div>
                  <div>{formatReportAmount(row.amount)}</div>
                  <div>{formatReportAmount(row.endingBalance)}</div>
                </button>
              ))
            ) : (
              <div className="flex flex-1 items-center justify-center px-3 py-10">
                <BankingReportEmptyState title="No loan transactions found" description="Select another account or date range, or create a loan account to start its statement." onAdd={() => router.push(buildWorkspaceRoute(mode, "/utilities/loan-accounts?create=1"))} actionLabel="Add Loan A/C" />
              </div>
            )}
            <div className="mt-auto flex items-end justify-between border-t border-[#d7dfeb] px-3 py-4 text-[14px] text-[#4e5d76]">
              <div>
                <div className="font-semibold text-[#3f4d65]">Loan Account Summary</div>
                <div className="mt-2">Opening Balance: {formatReportAmount(activeReport.openingBalance)}</div>
                <div>Balance Due: {formatReportAmount(activeReport.balanceDue)}</div>
              </div>
              <div className="text-right">
                <div>Total Principal Paid: {formatReportAmount(activeReport.totalPrincipalPaid)}</div>
                <div>Total Interest Paid: {formatReportAmount(activeReport.totalInterestPaid)}</div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeReport.kind === "sale-orders") {
      return (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-[10px] border border-[#d8e1ee] bg-white px-3 py-2 text-sm text-[#324766] shadow-sm">
              <span>From</span>
              <div className="relative">
                <AppDateInput value={fromDate} onChange={setFromDate} className="w-[140px]" inputClassName="h-8 border-0 bg-transparent px-2 py-0 pr-8 shadow-none" aria-label="Sale orders from date" />
              </div>
              <span>To</span>
              <div className="relative">
                <AppDateInput value={toDate} onChange={setToDate} className="w-[140px]" inputClassName="h-8 border-0 bg-transparent px-2 py-0 pr-8 shadow-none" aria-label="Sale orders to date" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d7dfeb] text-[#0f9f63] shadow-sm hover:bg-[#f5fbf8]" onClick={exportActiveReport}>
                <Download className="h-4 w-4" />
              </button>
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d7dfeb] text-[#5ea7b8] shadow-sm hover:bg-[#f5fbfd]" onClick={printActiveReport}>
                <Printer className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-4 rounded-[4px] border border-[#d7dfeb] bg-white p-3">
            <div className="flex flex-wrap items-center gap-5 text-[12px] font-semibold uppercase text-[#6d7b94]">
              <span>Filters</span>
              <Input placeholder="Party filter" className="h-8 w-[140px] rounded-[4px] border-[#ccd7e6]" />
              <button type="button" className="inline-flex min-w-[156px] items-center justify-between rounded-[4px] bg-[#f0f2f5] px-4 py-2 text-[13px] font-medium text-[#1f65bb]">
                <span>SALE ORDER</span>
                <ChevronDown className="h-4 w-4 text-[#6d7b94]" />
              </button>
              <button type="button" className="inline-flex min-w-[140px] items-center justify-between rounded-[4px] border border-[#ccd7e6] bg-white px-4 py-2 text-[13px] text-[#324766]">
                <span>All Orders</span>
                <ChevronDown className="h-4 w-4 text-[#6d7b94]" />
              </button>
            </div>

            <div className="overflow-hidden rounded-[4px] border border-[#edf1f7]">
              <div className="grid grid-cols-[0.9fr_1fr_1.1fr_1fr_0.9fr_0.9fr_1fr_1fr_1fr] bg-[#f7f7f8] px-2 py-3 text-[12px] font-semibold uppercase text-[#6d7b94]">
                <div>DATE</div>
                <div>Order No.</div>
                <div>NAME</div>
                <div>Due Date</div>
                <div>Status</div>
                <div>TYPE</div>
                <div className="text-right">TOTAL</div>
                <div className="text-right">ADVANCE</div>
                <div className="text-right">BALANCE</div>
              </div>
              {activeReport.rows.length ? (
                activeReport.rows.map((row, index) => (
                  <button
                    key={`${row.orderNo}-${index}`}
                    type="button"
                    className="grid w-full grid-cols-[0.9fr_1fr_1.1fr_1fr_0.9fr_0.9fr_1fr_1fr_1fr] border-t border-[#edf1f7] px-2 py-3 text-left text-[14px] text-[#24365a] transition hover:bg-[#eef6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#2563eb]"
                    onClick={() => setSelectedOperationalReportDetail({
                      title: row.orderNo,
                      reportTitle: activeReport.title,
                      group: "Order Reports",
                      fields: [
                        { label: "Date", value: formatDate(row.date) },
                        { label: "Order No.", value: row.orderNo },
                        { label: "Name", value: row.name },
                        { label: "Due Date", value: formatDate(row.dueDate) },
                        { label: "Status", value: row.status },
                        { label: "Type", value: row.type },
                        { label: "Total", value: formatReportAmount(row.total) },
                        { label: "Advance", value: formatReportAmount(row.advance) },
                        { label: "Balance", value: formatReportAmount(row.balance) },
                      ],
                    })}
                  >
                    <div>{formatDate(row.date)}</div>
                    <div>{row.orderNo}</div>
                    <div>{row.name}</div>
                    <div>{formatDate(row.dueDate)}</div>
                    <div className="capitalize">{row.status}</div>
                    <div>{row.type}</div>
                    <div className="text-right">{formatReportAmount(row.total)}</div>
                    <div className="text-right">{formatReportAmount(row.advance)}</div>
                    <div className="text-right">{formatReportAmount(row.balance)}</div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-8">
                  <OrderReportEmptyState
                    title="No sale orders found"
                    description="Try another date range or create a sale order to populate this report."
                    actionLabel={orderRootActionLabel("sales")}
                    onAdd={() => openOrderRootFromReport("sales")}
                  />
                </div>
              )}
            </div>

            <div className="border-t border-[#d7dfeb] pt-3 text-right text-[14px] text-[#4e5d76]">
              Total Amount: <span className="font-medium text-[#0f9f63]">{formatReportAmount(activeReport.totalAmount)}</span>
            </div>
          </div>
        </div>
      );
    }

    if (activeReport.kind === "expense-item") {
      const itemNeedle = reportRowSearch.trim().toLowerCase();
      const expenseItemColumns = ["Expense Item", "Unit Price", "Quantity", "Amount"] as const;
      const getExpenseItemColumnValue = (row: (typeof activeReport.rows)[number], column: (typeof expenseItemColumns)[number]) => {
        if (column === "Expense Item") return row.item;
        if (column === "Unit Price") return formatReportAmount(row.unitPrice);
        if (column === "Quantity") return formatNumber(row.quantity);
        return formatReportAmount(row.amount);
      };
      const visibleExpenseItems = activeReport.rows.filter((row) => {
        if (itemNeedle && !row.item.toLowerCase().includes(itemNeedle)) return false;
        return !expenseItemColumns.some((column) => {
          const filterValue = allTransactionsColumnFilters[column]?.trim().toLowerCase();
          return filterValue && !getExpenseItemColumnValue(row, column).toLowerCase().includes(filterValue);
        });
      });
      return (
        <div className="flex min-h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-4 rounded-[4px] border border-[#d7dfeb] bg-white px-4 py-4">
            <div className="flex flex-wrap items-center gap-5">
              <select value={balanceSheetPeriod} onChange={(event) => updateBalanceSheetPeriod(event.target.value as "latest-month" | "custom" | "today" | "this-month" | "this-year")} className="h-10 rounded-[4px] border border-[#ccd7e6] bg-white px-3 text-sm font-semibold text-[#25365b] outline-none">
                <option value="latest-month">Last Posting Month</option>
                <option value="custom">Custom</option>
                <option value="today">Today</option>
                <option value="this-month">This Month</option>
                <option value="this-year">This Year</option>
              </select>
              <div className="inline-flex items-center gap-0 overflow-hidden rounded-[4px] border border-[#ccd7e6]">
                <span className="bg-[#315b8f] px-3 py-2 text-sm font-semibold text-white">Between</span>
                <div className="flex items-center gap-2 px-3 py-2 text-sm">
                  <AppDateInput value={fromDate} max={toDate} onChange={(value) => { setBalanceSheetPeriod("custom"); setFromDate(value); }} className="w-[138px]" inputClassName="h-8 border-0 px-1 pr-8 shadow-none" aria-label="Expense item report from date" />
                  <span>To</span>
                  <AppDateInput value={toDate} min={fromDate} onChange={(value) => { setBalanceSheetPeriod("custom"); setToDate(value); }} className="w-[138px]" inputClassName="h-8 border-0 px-1 pr-8 shadow-none" aria-label="Expense item report to date" />
                </div>
              </div>
              <select className="h-11 min-w-[150px] rounded-[4px] border border-[#ccd7e6] bg-white px-4 text-[14px] text-[#24365a] outline-none">
                <option>ALL FIRMS</option>
              </select>
            </div>
            <div className="flex items-center gap-6">
              <button type="button" className="text-center text-[12px] font-medium text-[#1d3b63]" onClick={exportActiveReport}>
                <div className="mx-auto mb-1 inline-flex h-8 w-8 items-center justify-center text-[#1d3b63]">
                  <Download className="h-5 w-5" />
                </div>
                Excel Report
              </button>
              <button type="button" className="text-center text-[12px] font-medium text-[#1d3b63]" onClick={printActiveReport}>
                <div className="mx-auto mb-1 inline-flex h-8 w-8 items-center justify-center text-[#1d3b63]">
                  <Printer className="h-5 w-5" />
                </div>
                Print
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-[4px] border border-[#d7dfeb] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d7dfeb] px-4 py-4">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e9bb0]" />
                <Input value={reportRowSearch} onChange={(event) => setReportRowSearch(event.target.value)} placeholder="Search expense items..." className="h-10 w-[232px] rounded-[4px] border-[#ccd7e6] pl-9" />
              </label>
              <button type="button" onClick={openExpenseEntry} className="inline-flex items-center gap-2 rounded-full bg-[#eb6b20] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(235,107,32,0.2)] transition hover:bg-[#d85d15]">
                <Plus className="h-4 w-4" />
                Add Expense
              </button>
            </div>
            <div className="grid grid-cols-[1.8fr_0.8fr_0.7fr_0.7fr] border-b border-[#d7dfeb] bg-[#f7f7f8] text-[12px] font-semibold uppercase text-[#6d7b94]">
              {expenseItemColumns.map((column, columnIndex) => (
                <div key={column} className={cn("flex items-center justify-between gap-2 px-3 py-3", columnIndex > 0 ? "border-l border-l-[#e3e9f2]" : "", column !== "Expense Item" ? "text-right" : "")}>
                  <span>{column}</span>
                  <DropdownMenuPrimitive.Root open={openAllTransactionsFilter === column} onOpenChange={(open) => setOpenAllTransactionsFilter(open ? column : null)}>
                    <DropdownMenuPrimitive.Trigger asChild>
                      <button type="button" className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-[#e8eef7]", allTransactionsColumnFilters[column]?.trim() ? "text-[#e76412]" : "text-[#7a8799]")} aria-label={`Filter ${column}`}>
                        <Filter className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuPrimitive.Trigger>
                    <DropdownMenuPrimitive.Portal>
                      <DropdownMenuPrimitive.Content align="start" sideOffset={6} collisionPadding={12} className="z-[100] w-56 rounded-md border border-[#d7dfeb] bg-white p-3 text-left normal-case shadow-xl" onCloseAutoFocus={(event) => event.preventDefault()}>
                        <div className="mb-2 text-xs font-semibold text-[#53627a]">Filter by {column}</div>
                        <Input autoFocus value={allTransactionsColumnFilters[column] ?? ""} onChange={(event) => setAllTransactionsColumnFilters((current) => ({ ...current, [column]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter") setOpenAllTransactionsFilter(null); }} placeholder={`Search ${column.toLowerCase()}...`} className="h-8 bg-white text-sm font-normal" />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <button type="button" className="text-xs font-medium text-[#e76412] hover:underline" onClick={() => { setAllTransactionsColumnFilters((current) => ({ ...current, [column]: "" })); setOpenAllTransactionsFilter(null); }}>Clear</button>
                          <button type="button" className="rounded bg-[#2563eb] px-3 py-1 text-xs font-semibold text-white" onClick={() => setOpenAllTransactionsFilter(null)}>Apply</button>
                        </div>
                      </DropdownMenuPrimitive.Content>
                    </DropdownMenuPrimitive.Portal>
                  </DropdownMenuPrimitive.Root>
                </div>
              ))}
            </div>
            {visibleExpenseItems.length ? (
              visibleExpenseItems.map((row, index) => (
                <button
                  key={`${row.item}-${index}`}
                  type="button"
                  className="grid grid-cols-[1.8fr_0.8fr_0.7fr_0.7fr] border-b border-[#edf1f7] text-left text-[15px] text-[#24365a] transition hover:bg-[#eef6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#2563eb]"
                  onClick={() => setSelectedExpenseReportDetail({
                    title: row.item,
                    reportTitle: activeReport.title,
                    voucherId: row.voucherId,
                    fields: [
                      { label: "Expense Item", value: row.item },
                      { label: "Unit Price", value: formatReportAmount(row.unitPrice) },
                      { label: "Quantity", value: formatNumber(row.quantity) },
                      { label: "Amount", value: formatReportAmount(row.amount) },
                    ],
                  })}
                >
                  <div className="px-3 py-4">{row.item}</div>
                  <div className="border-l border-l-[#edf1f7] px-3 py-4 text-right">{formatReportAmount(row.unitPrice)}</div>
                  <div className="border-l border-l-[#edf1f7] px-3 py-4 text-right">{formatNumber(row.quantity)}</div>
                  <div className="border-l border-l-[#edf1f7] px-3 py-4 text-right">{formatReportAmount(row.amount)}</div>
                </button>
              ))
            ) : (
              <div className="flex flex-1 items-center justify-center px-3 py-10">
                <ExpenseReportEmptyState
                  title="No expense items found"
                  description="Try another date range or create an expense voucher to start tracking item-wise expenses."
                  onAdd={openExpenseEntry}
                />
              </div>
            )}
            <div className="mt-auto flex items-center justify-between border-t border-[#d7dfeb] px-3 py-3 text-[13px] font-medium text-[#ff3b4d]">
              <div>Total Quantity: {formatNumber(activeReport.totalQuantity)}</div>
              <div>Total Amount: {formatReportAmount(activeReport.totalAmount)}</div>
            </div>
          </div>
        </div>
      );
    }

    if (activeReport.kind === "expense-category") {
      const categoryNeedle = reportRowSearch.trim().toLowerCase();
      const visibleExpenseCategories = activeReport.rows.filter((row) => !categoryNeedle || `${row.category} ${row.categoryType}`.toLowerCase().includes(categoryNeedle));
      return (
        <div className="flex min-h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-[10px] border border-[#d8e1ee] bg-white px-3 py-2 text-sm text-[#324766] shadow-sm">
              <span>From</span>
              <div className="relative">
                <AppDateInput value={fromDate} onChange={setFromDate} className="w-[140px]" inputClassName="h-8 border-0 bg-transparent px-2 py-0 pr-8 shadow-none" aria-label="Expense category from date" />
              </div>
              <span>To</span>
              <div className="relative">
                <AppDateInput value={toDate} onChange={setToDate} className="w-[140px]" inputClassName="h-8 border-0 bg-transparent px-2 py-0 pr-8 shadow-none" aria-label="Expense category to date" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d7dfeb] text-[#0f9f63] shadow-sm hover:bg-[#f5fbf8]" onClick={exportActiveReport}>
                <Download className="h-4 w-4" />
              </button>
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d7dfeb] text-[#5ea7b8] shadow-sm hover:bg-[#f5fbfd]" onClick={printActiveReport}>
                <Printer className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-[4px] border border-[#d7dfeb] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d7dfeb] px-4 py-4">
              <div className="text-[28px] font-semibold text-[#25365b]">{activeReport.title}</div>
              <label className="relative ml-auto block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e9bb0]" />
                <Input value={reportRowSearch} onChange={(event) => setReportRowSearch(event.target.value)} placeholder="Search categories..." className="h-10 w-[230px] pl-9" />
              </label>
              <button type="button" onClick={openExpenseEntry} className="inline-flex items-center gap-2 rounded-[10px] bg-[#eb6b20] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(235,107,32,0.2)] transition hover:bg-[#d85d15]">
                <Plus className="h-4 w-4" />
                Add Expense
              </button>
            </div>
            <div className="grid grid-cols-[1.1fr_0.9fr_0.5fr] border-b border-[#d7dfeb] bg-[#f7f7f8] px-3 py-3 text-[12px] font-medium text-[#6d7b94]">
              <div>Expense Category</div>
              <div>Category Type</div>
              <div className="text-right">Amount</div>
            </div>
            {visibleExpenseCategories.length ? (
              visibleExpenseCategories.map((row, index) => (
                <button
                  key={`${row.category}-${index}`}
                  type="button"
                  className="grid grid-cols-[1.1fr_0.9fr_0.5fr] px-3 py-4 text-left text-[15px] text-[#24365a] transition hover:bg-[#eef6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#2563eb]"
                  onClick={() => setSelectedExpenseReportDetail({
                    title: row.category,
                    reportTitle: activeReport.title,
                    fields: [
                      { label: "Expense Category", value: row.category },
                      { label: "Category Type", value: row.categoryType },
                      { label: "Amount", value: formatReportAmount(row.amount) },
                    ],
                  })}
                >
                  <div>{row.category}</div>
                  <div>{row.categoryType}</div>
                  <div className="text-right">{formatReportAmount(row.amount)}</div>
                </button>
              ))
            ) : (
              <div className="flex flex-1 items-center justify-center px-3 py-10">
                <ExpenseReportEmptyState
                  title="No expense categories found"
                  description="Try another date range or add an expense voucher to build the category report."
                  onAdd={openExpenseEntry}
                />
              </div>
            )}
            <div className="mt-auto border-t border-[#d7dfeb] px-3 py-3 text-right text-[13px] font-medium text-[#ff3b4d]">
              Total Expense: {formatReportAmount(activeReport.totalExpense)}
            </div>
          </div>
        </div>
      );
    }

    const isExpenseReport = activeCatalogItem.group === "5. Expense Reports";
    const isCashBookReport = activeCatalogItem.slug === "cash-book" || activeCatalogItem.slug === "bank-book" || activeCatalogItem.slug === "mfs-report";
    const isCashRegisterReport = activeCatalogItem.slug === "cash-book";
    const isBankBookReport = activeCatalogItem.slug === "bank-book";
    const isGeneralLedgerReport = activeCatalogItem.slug === "general-ledger";
    const isBankingReport = activeCatalogItem.group === "6. Banking Reports";
    const isTaxReport = activeCatalogItem.group === "7. Tax Reports";
    const isOrderReport = activeCatalogItem.group === "8. Order Reports";
    const isRatioReport = activeCatalogItem.group === "9. Ratio Analysis";
    const isBusinessAnalytics = activeCatalogItem.group === "10. Business Analytics";
    const isAuditReport = activeCatalogItem.group === "11. Audit & Activity Reports";
    const isPurchaseOrderReport = activeCatalogItem.slug.includes("purchase");
    // Every register in "1. Transaction Reports" shares the same defect: that group never
    // exposes the shared From/To date controls, so the fromDate..toDate window silently
    // filters its rows with no way for the user to see or widen it. Originally fixed for
    // Purchase/Payment/Purchase Return Register only; sales-register, receipt-register and
    // sales-return-register shared the exact same gap and now get the identical treatment.
    const isPurchaseRegisterReport = activeCatalogItem.slug === "purchase-register";
    const isPaymentRegisterReport = activeCatalogItem.slug === "payment-register";
    const isPurchaseReturnRegisterReport = activeCatalogItem.slug === "purchase-return-register";
    const isSalesRegisterReport = activeCatalogItem.slug === "sales-register";
    const isReceiptRegisterReport = activeCatalogItem.slug === "receipt-register";
    const isSalesReturnRegisterReport = activeCatalogItem.slug === "sales-return-register";
    const isComparisonReport = activeCatalogItem.slug === "customer-supplier-comparison";
    const isAllTransactionsReport = activeCatalogItem.slug === "all-transactions";
    const isDayBookReport = activeCatalogItem.slug === "day-book";
    const isTransactionModalReport = isDayBookReport || isAllTransactionsReport || activeCatalogItem.slug === "bank-book";
    const isMfsReport = activeCatalogItem.slug === "mfs-report";
    const isBillWiseProfitReport = activeCatalogItem.slug === "bill-wise-profit";
    const isCashFlowReport = activeCatalogItem.slug === "cashflow-statement";
    const hasTransactionDrilldown = (row: Record<string, string>) =>
      (isTransactionModalReport && row.Voucher !== "B/F")
      || (isComparisonReport && Boolean(row._voucherId))
      || (isMfsReport && row.Voucher !== "B/F")
      || (isGeneralLedgerReport && Boolean(row._voucherId))
      || (isBillWiseProfitReport && Boolean(row.Invoice))
      || isCashFlowReport;
    const openTransactionDrilldown = (row: Record<string, string>) => {
      if (isCashFlowReport) {
        const candidates = dataset.vouchers.filter(
          (voucher) =>
            voucher.workspaceId === workspaceId
            && voucher.voucherDate >= fromDate
            && voucher.voucherDate <= toDate
            && isLiveVoucher(voucher)
            && !isReversalArtifact(voucher)
            && voucherUsesCashFlowChannel(
              voucher,
              cashFlowChannel,
              moneyAccountOptions.filter((account) => account.kind === "BANK").map((account) => account.name),
              moneyAccountOptions.filter((account) => account.kind === "MFS").map((account) => account.name),
            ),
        );
        const particulars = row.Particulars ?? "Cash movement";
        const matching = particulars === "Customer receipts"
          ? candidates.filter((voucher) => voucher.voucherType === "receipt" || voucher.voucherType === "sales")
          : particulars === "Supplier payments"
            ? candidates.filter((voucher) => voucher.voucherType === "purchase" || voucher.voucherType === "payment")
            : particulars === "Expense payments"
              ? candidates.filter((voucher) => voucher.voucherType === "expense")
              : particulars === "Loan movements"
                ? candidates.filter((voucher) => voucher.lines.some((line) => line.ledger.toLowerCase().includes("loan")))
                : candidates.filter((voucher) => ["sales", "purchase", "receipt", "payment", "expense", "revenue", "contra"].includes(voucher.voucherType));
        setCashFlowDrilldown({ title: particulars, vouchers: matching });
        return;
      }

      const voucher = dataset.vouchers.find(
        (entry) =>
          entry.workspaceId === workspaceId
          && (row._voucherId ? entry.id === row._voucherId : entry.voucherNumber === (row.Voucher ?? row.Invoice)),
      );
      if (voucher) setSelectedRegisterInvoice(voucher);
    };
    const isBillWiseReport = activeCatalogItem.slug === "bill-wise-report";
    const isCustomerStatementReport = activeCatalogItem.slug === "customer-statement";
    const isClosingStockReport = activeCatalogItem.slug === "closing-stock";
    const isInvoiceRegisterReport = isSalesRegisterReport || isPurchaseRegisterReport;
    const isVoucherViewRegisterReport = isInvoiceRegisterReport || isReceiptRegisterReport || isPaymentRegisterReport || isSalesReturnRegisterReport || isPurchaseReturnRegisterReport || isCashRegisterReport;
    const isAnyRegisterReport =
      isPurchaseRegisterReport || isPaymentRegisterReport || isPurchaseReturnRegisterReport ||
      isSalesRegisterReport || isReceiptRegisterReport || isSalesReturnRegisterReport;
    const isFullHeightReport = isCashBookReport || isGeneralLedgerReport || isExpenseReport || isBankingReport || isTaxReport || isOrderReport || isRatioReport || isBusinessAnalytics || isAuditReport || isAnyRegisterReport || isAllTransactionsReport || isBillWiseReport || isClosingStockReport || isComparisonReport;
    const tableNeedle = reportRowSearch.trim().toLowerCase();
    const stockCategoryOptions = isClosingStockReport
      ? [...new Set(activeReport.rows.map((row) => String(row.Category || "Uncategorized")))].sort((left, right) => left.localeCompare(right))
      : [];
    const auditRoleOptions = isAuditReport
      ? [...new Set(activeReport.rows.map((row) => String(row.Role || "Member")))].sort((left, right) => left.localeCompare(right))
      : [];
    const visibleTableRows = activeReport.rows.filter((row) => {
      if (isAuditReport && selectedAuditRole !== "all" && String(row.Role || "Member") !== selectedAuditRole) return false;
      if (isClosingStockReport) {
        if (stockCategoryFilter !== "all" && String(row.Category || "Uncategorized") !== stockCategoryFilter) return false;
        const quantity = Number(String(row.Quantity ?? "0").replace(/[^0-9.-]/g, "")) || 0;
        if (stockStatusFilter === "positive" && quantity <= 0) return false;
        if (stockStatusFilter === "zero" && quantity !== 0) return false;
        if (stockStatusFilter === "negative" && quantity >= 0) return false;
      }
      if (Object.entries(allTransactionsColumnFilters).some(
        ([column, value]) => value.trim() && !String(row[column] ?? "").toLowerCase().includes(value.trim().toLowerCase()),
      )) return false;
      return !tableNeedle || Object.values(row).some((value) => String(value).toLowerCase().includes(tableNeedle));
    });
    const visibleMfsVoucherIds = isMfsReport
      ? [...new Set(visibleTableRows.map((row) => row._voucherId).filter(Boolean))]
      : [];
    const allVisibleMfsRowsSelected = visibleMfsVoucherIds.length > 0
      && visibleMfsVoucherIds.every((id) => selectedMfsVoucherIds.includes(id));
    const salesRegisterVisibleTotal = isSalesRegisterReport
      ? sumMoney(visibleTableRows.map(
          (row) => Number(String(row.Amount ?? "").replace(/[^0-9.-]/g, "")) || 0,
        ))
      : 0;
    const shouldStretchTable = isFullHeightReport && visibleTableRows.length === 0;
    const emptyDueToFilters = activeReport.rows.length > 0 && visibleTableRows.length === 0;
    const isPartyStatementReport = activeCatalogItem.slug === "customer-statement" || activeCatalogItem.slug === "supplier-statement";
    const comparisonAmountColumns = new Set([
      "Sales",
      "Sales Return",
      "Collection",
      "Purchase",
      "Purchase Return",
      "Payment",
      "Customer Due",
      "Supplier Due",
      "Net Position",
    ]);
    const comparisonColumnWidths: Record<string, string> = {
      Date: "7.5%",
      Voucher: "9%",
      Transaction: "10%",
      Party: "9%",
      Sales: "6.5%",
      "Sales Return": "7.5%",
      Collection: "7%",
      Purchase: "7%",
      "Purchase Return": "8%",
      Payment: "7%",
      "Customer Due": "7%",
      "Supplier Due": "7%",
      "Net Position": "7.5%",
    };
    const hasPartyDetailRows = activeReport.rowDetails !== undefined;
    const isInventoryReport = activeCatalogItem.group.includes("Inventory Reports");
    const hasOperationalDetail = isBankingReport || isTaxReport || isOrderReport || isBusinessAnalytics || isAuditReport;
    const fitTableToAvailableWidth = isDayBookReport || isAllTransactionsReport || hasPartyDetailRows || isInventoryReport || isExpenseReport || hasOperationalDetail || isCashFlowReport || isBillWiseProfitReport;
    const cashEquivalentNeedle = cashEquivalentSearch.trim().toLowerCase();
    const visibleCashEquivalentRows = isCashFlowReport
      ? (activeReport.cashEquivalentRows ?? []).filter((row) =>
          (cashEquivalentChannel === "all" || row.channel === cashEquivalentChannel)
          && (!cashEquivalentNeedle || row.ledger.toLowerCase().includes(cashEquivalentNeedle)),
        )
      : [];
    const parsePartyStatementAmount = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
    const partyStatementTotals = isPartyStatementReport
      ? visibleTableRows.reduce(
          (totals, row) => ({
            debit: sumMoney([totals.debit, parsePartyStatementAmount(row.Debit)]),
            credit: sumMoney([totals.credit, parsePartyStatementAmount(row.Credit)]),
            balance: sumMoney([totals.balance, parsePartyStatementAmount(row.Balance)]),
            creditSales: sumMoney([totals.creditSales, parsePartyStatementAmount(row["Credit Sales"])]),
            salesReturn: sumMoney([totals.salesReturn, parsePartyStatementAmount(row["Sales Return"])]),
            collection: sumMoney([totals.collection, parsePartyStatementAmount(row.Collection)]),
            due: sumMoney([totals.due, parsePartyStatementAmount(row.Due)]),
          }),
          { debit: 0, credit: 0, balance: 0, creditSales: 0, salesReturn: 0, collection: 0, due: 0 },
        )
      : null;

    return (
      <div data-comparison-report={isComparisonReport ? "true" : undefined} className={cn(isFullHeightReport ? "flex min-h-full flex-col gap-3" : "space-y-3")}>
        <div data-comparison-report-header={isComparisonReport ? "true" : undefined} className="sticky -top-5 z-20 -mx-5 -mt-5 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[#e2e8f0] bg-white px-5 py-2 shadow-[0_1px_0_rgba(226,232,240,0.9)]">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-[22px] font-semibold text-[#25365b]">{activeReport.title}</div>
              {isDayBookReport ? (
                <label className="flex h-9 items-center gap-2 rounded-md border border-[#d7dfeb] bg-[#f8fbff] px-3">
                  <CalendarDays className="h-4 w-4 text-[#2563eb]" />
                  <span className="text-xs font-semibold text-[#53627a]">Date Filter</span>
                  <AppDateInput
                    value={toDate}
                    onChange={(value) => {
                      setFromDate(value);
                      setToDate(value);
                    }}
                    className="w-[145px]"
                    inputClassName="h-7 border-0 bg-white px-2 pr-8 text-sm shadow-none"
                    aria-label="Day Book date filter"
                  />
                </label>
              ) : null}
            </div>
            {activeReport.description ? <div className="text-[12px] text-[#6d7b94]">{activeReport.description}</div> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isGeneralLedgerReport ? (
              <LedgerFilterCombobox
                value={selectedGeneralLedger}
                options={(generalLedgerAccountsQuery.data ?? [])
                  .filter((ledger) => ledger.status === "ACTIVE")
                  .sort((left, right) => left.name.localeCompare(right.name))
                  .map((ledger) => ({ id: ledger.id, name: ledger.name, path: ledger.path }))}
                onChange={setSelectedGeneralLedger}
                emptyWhenAll
                valueMode="id"
                className="w-[340px] xl:w-[390px]"
              />
            ) : null}
            {activeCatalogItem.slug === "bank-book" ? (
              <LedgerFilterCombobox
                value={selectedBankAccount}
                options={moneyAccountOptions.filter((account) => account.kind === "BANK")}
                onChange={setSelectedBankAccount}
                allLabel="All Banks"
                ariaLabel="Filter bank book by bank account"
              />
            ) : null}
            {activeCatalogItem.slug === "mfs-report" ? (
              <LedgerFilterCombobox
                value={selectedMfsAccount}
                options={moneyAccountOptions.filter((account) => account.kind === "MFS")}
                onChange={setSelectedMfsAccount}
                allLabel="All MFS Accounts"
                ariaLabel="Filter MFS report by account"
              />
            ) : null}
            {isCashFlowReport ? (
              <>
                <label className="flex h-9 items-center gap-2 rounded-md border border-[#d7dfeb] bg-[#f8fbff] px-2.5">
                  <Filter className="h-4 w-4 text-[#2563eb]" />
                  <span className="text-xs font-semibold text-[#53627a]">Channel</span>
                  <select
                    value={cashFlowChannel}
                    onChange={(event) => setCashFlowChannel(event.target.value as CashFlowChannel)}
                    className="h-7 min-w-[106px] border-0 bg-white px-2 text-xs font-medium text-[#34435f] outline-none"
                    aria-label="Filter cash flow by money channel"
                  >
                    <option value="all">All Channels</option>
                    <option value="cash">Cash</option>
                    <option value="bank">Bank</option>
                    <option value="mfs">MFS</option>
                  </select>
                </label>
                <div className="flex h-9 items-center gap-2 rounded-md border border-[#d7dfeb] bg-[#f8fbff] px-2.5">
                  <CalendarDays className="h-4 w-4 text-[#2563eb]" />
                  <span className="text-xs font-semibold text-[#53627a]">From</span>
                  <AppDateInput
                    value={fromDate}
                    max={toDate}
                    onChange={setFromDate}
                    className="w-[124px]"
                    inputClassName="h-7 border-0 bg-white px-1.5 pr-8 text-xs shadow-none"
                    aria-label="Cash flow from date"
                  />
                  <span className="text-xs font-semibold text-[#53627a]">To</span>
                  <AppDateInput
                    value={toDate}
                    min={fromDate}
                    onChange={setToDate}
                    className="w-[124px]"
                    inputClassName="h-7 border-0 bg-white px-1.5 pr-8 text-xs shadow-none"
                    aria-label="Cash flow to date"
                  />
                </div>
              </>
            ) : null}
            {isWarehouseReportSlug ? (
              <>
                <label className="flex h-9 items-center gap-2 rounded-md border border-[#d7dfeb] bg-[#f8fbff] px-2.5">
                  <Filter className="h-4 w-4 text-[#2563eb]" />
                  <select
                    value={warehouseReportFilter}
                    onChange={(event) => setWarehouseReportFilter(event.target.value)}
                    className="h-7 min-w-[190px] border-0 bg-white px-2 text-xs font-medium text-[#34435f] outline-none"
                    aria-label="Filter report by warehouse"
                  >
                    <option value="all">All Warehouses</option>
                    {warehouseReportOptions.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code ?? "-"})</option>
                    ))}
                  </select>
                </label>
                <div className="flex h-9 items-center gap-2 rounded-md border border-[#d7dfeb] bg-[#f8fbff] px-2.5">
                  <CalendarDays className="h-4 w-4 text-[#2563eb]" />
                  <span className="text-xs font-semibold text-[#53627a]">As at</span>
                  <AppDateInput value={toDate} onChange={setToDate} className="w-[124px]" inputClassName="h-7 border-0 bg-white px-1.5 pr-8 text-xs shadow-none" aria-label="Warehouse report as-at date" />
                </div>
              </>
            ) : null}
            {activeReport.summary.map((item) => (
              <div key={item.label} className={cn("rounded-full px-3 py-1.5 text-[12px] font-semibold", toneClassMap[item.tone ?? "blue"])}>
                {item.label}: {item.value}
              </div>
            ))}
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d7dfeb] text-[#0f9f63] shadow-sm hover:bg-[#f5fbf8] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={exportActiveReport}
              disabled={isWarehouseReportSlug && warehouseStockQuery.isPending}
              aria-label={isWarehouseReportSlug && warehouseStockQuery.isPending ? "Warehouse report is loading" : "Export report"}
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d7dfeb] text-[#5ea7b8] shadow-sm hover:bg-[#f5fbfd] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={printActiveReport}
              disabled={isWarehouseReportSlug && warehouseStockQuery.isPending}
              aria-label={isWarehouseReportSlug && warehouseStockQuery.isPending ? "Warehouse report is loading" : "Print report"}
            >
              <Printer className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isFullHeightReport ? (
          <div
            data-comparison-report-filters={isComparisonReport ? "true" : undefined}
            data-cash-book-report-filters={isCashRegisterReport ? "true" : undefined}
            data-audit-report-filters={isAuditReport ? "true" : undefined}
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-[6px] border border-[#d7dfeb] bg-[#f8fbff] p-3",
              isComparisonReport ? "flex-nowrap gap-2 p-2.5" : "",
              isAuditReport ? "flex-nowrap gap-2 p-2.5 2xl:gap-3 2xl:p-3" : "",
            )}
          >
            {isComparisonReport ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#53627a]">Customer</span>
                  <LedgerFilterCombobox
                    value={selectedComparisonCustomerId}
                    options={comparisonCustomerOptions}
                    onChange={selectComparisonCustomer}
                    allLabel="Select Customer"
                    ariaLabel="Select comparison customer"
                    emptyWhenAll
                    valueMode="id"
                    className="w-[238px]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#53627a]">Supplier</span>
                  <LedgerFilterCombobox
                    value={selectedComparisonSupplierId}
                    options={comparisonSupplierOptions}
                    onChange={selectComparisonSupplier}
                    allLabel="Select Supplier"
                    ariaLabel="Select comparison supplier"
                    emptyWhenAll
                    valueMode="id"
                    className="w-[238px]"
                  />
                </div>
              </>
            ) : null}
            {isAnyRegisterReport ? (
              <label className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#53627a]">Quick Filter</span>
                <select
                  value={purchaseRegisterPeriod}
                  onChange={(event) => updatePurchaseRegisterPeriod(event.target.value as typeof purchaseRegisterPeriod)}
                  className="h-9 rounded-md border border-[#d7dfeb] bg-white px-3 text-sm text-[#34435f] outline-none focus:border-[#7ba7e8]"
                  aria-label="Register quick filter"
                >
                  {isSalesRegisterReport ? <option value="latest-sales-month">Last Sales Month</option> : null}
                  {isPurchaseRegisterReport ? <option value="latest-purchase-month">Last Purchase Month</option> : null}
                  {isReceiptRegisterReport ? <option value="latest-receipt-month">Last Receipt Month</option> : null}
                  {isPaymentRegisterReport ? <option value="latest-payment-month">Last Payment Month</option> : null}
                  {isSalesReturnRegisterReport ? <option value="latest-sales-return-month">Last Sales Return Month</option> : null}
                  {isPurchaseReturnRegisterReport ? <option value="latest-purchase-return-month">Last Purchase Return Month</option> : null}
                  <option value="this-month">This Month</option>
                  <option value="last-month">Last Month</option>
                  <option value="last-6-months">Last 6 Months</option>
                  <option value="last-1-year">Last 1 Year</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
            ) : null}
            {isCashRegisterReport ? (
              <label data-cash-book-quick-filter className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#53627a]">Quick Filter</span>
                <select
                  value={purchaseRegisterPeriod}
                  onChange={(event) => updatePurchaseRegisterPeriod(event.target.value as typeof purchaseRegisterPeriod)}
                  className="h-9 rounded-md border border-[#d7dfeb] bg-white px-3 text-sm text-[#34435f] outline-none focus:border-[#7ba7e8]"
                  aria-label="Cash Book quick filter"
                >
                  <option value="latest-cash-month">Last Cash Posting Month</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
            ) : null}
            {isAllTransactionsReport ? (
              <label className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#53627a]">Quick Filter</span>
                <select
                  value={allTransactionsPeriod}
                  onChange={(event) => updateAllTransactionsPeriod(event.target.value as typeof allTransactionsPeriod)}
                  className="h-9 rounded-md border border-[#d7dfeb] bg-white px-3 text-sm text-[#34435f] outline-none focus:border-[#7ba7e8]"
                  aria-label="All transactions period filter"
                >
                  <option value="latest-month">Last Posting Month</option>
                  <option value="previous-month">Previous Month</option>
                  <option value="last-6-months">Last 6 Months</option>
                  <option value="last-1-year">Last 1 Year</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
            ) : null}
            {isBillWiseReport ? (
              <>
                <label className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#53627a]">Bill Type</span>
                  <select value={billTypeFilter} onChange={(event) => setBillTypeFilter(event.target.value as typeof billTypeFilter)} className="h-9 rounded-md border border-[#d7dfeb] bg-white px-3 text-sm text-[#34435f] outline-none focus:border-[#7ba7e8]" aria-label="Filter bills by type">
                    <option value="all">All</option>
                    <option value="purchase">Purchase</option>
                    <option value="sales">Sales</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#53627a]">Bill Status</span>
                  <select value={billStatusFilter} onChange={(event) => setBillStatusFilter(event.target.value as typeof billStatusFilter)} className="h-9 rounded-md border border-[#d7dfeb] bg-white px-3 text-sm text-[#34435f] outline-none focus:border-[#7ba7e8]" aria-label="Filter bills by status">
                    <option value="all">All Bill</option>
                    <option value="live">Live Bill</option>
                    <option value="closed">Closed Bill</option>
                  </select>
                </label>
              </>
            ) : null}
            {isClosingStockReport ? (
              <>
                <label className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#53627a]">Category</span>
                  <select
                    value={stockCategoryFilter}
                    onChange={(event) => setStockCategoryFilter(event.target.value)}
                    className="h-9 max-w-[240px] rounded-md border border-[#d7dfeb] bg-white px-3 text-sm text-[#34435f] outline-none focus:border-[#7ba7e8]"
                    aria-label="Filter closing stock by category"
                  >
                    <option value="all">All Categories</option>
                    {stockCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#53627a]">Stock Status</span>
                  <select
                    value={stockStatusFilter}
                    onChange={(event) => setStockStatusFilter(event.target.value as typeof stockStatusFilter)}
                    className="h-9 rounded-md border border-[#d7dfeb] bg-white px-3 text-sm text-[#34435f] outline-none focus:border-[#7ba7e8]"
                    aria-label="Filter closing stock by quantity status"
                  >
                    <option value="all">All Stock</option>
                    <option value="positive">In Stock</option>
                    <option value="zero">Zero Stock</option>
                    <option value="negative">Negative Stock</option>
                  </select>
                </label>
              </>
            ) : null}
            {isAuditReport ? (
              <label className="flex shrink-0 items-center gap-2">
                <span className="whitespace-nowrap text-xs font-medium text-[#53627a] 2xl:text-sm">Activity Time</span>
                <select
                  value={auditPeriod}
                  onChange={(event) => updateAuditPeriod(event.target.value as typeof auditPeriod)}
                  className="h-9 w-[100px] rounded-md border border-[#d7dfeb] bg-white px-2 text-xs text-[#34435f] outline-none focus:border-[#7ba7e8] 2xl:w-auto 2xl:px-3 2xl:text-sm"
                  aria-label="Activity time quick filter"
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last-7-days">Last 7 Days</option>
                  <option value="last-30-days">Last 30 Days</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
            ) : null}
            {isAnyRegisterReport ? (
              <label className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#53627a]">{registerPartyLabel[activeCatalogItem.slug] ?? "Party"}</span>
                <select
                  value={registerPartyFilter}
                  onChange={(event) => setRegisterPartyFilter(event.target.value)}
                  className="h-9 max-w-[200px] rounded-md border border-[#d7dfeb] bg-white px-3 text-sm text-[#34435f] outline-none focus:border-[#7ba7e8]"
                  aria-label={`Filter register by ${registerPartyLabel[activeCatalogItem.slug] ?? "party"}`}
                >
                  <option value="all">All {registerPartyLabel[activeCatalogItem.slug] ?? "Parties"}</option>
                  {registerPartyOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
            ) : null}
            {!isClosingStockReport ? (
              <>
                <span className={cn("shrink-0 font-medium text-[#53627a]", isAuditReport ? "text-xs 2xl:text-sm" : "text-sm")}>From</span>
                <AppDateInput
                  value={fromDate}
                  max={toDate}
                  onChange={(value) => {
                    if (isAnyRegisterReport || isCashRegisterReport) setPurchaseRegisterPeriod("custom");
                    if (isAllTransactionsReport) setAllTransactionsPeriod("custom");
                    if (isAuditReport) setAuditPeriod("custom");
                    setFromDate(value);
                  }}
                  className={isComparisonReport ? "w-[138px]" : isAuditReport ? "w-[130px] 2xl:w-[155px]" : "w-[155px]"}
                  inputClassName="h-9 bg-white text-sm"
                  aria-label={isCashRegisterReport ? "Cash Book from date" : isAuditReport ? "Activity from date" : "Report from date"}
                />
                <span className={cn("shrink-0 text-[#6d7b94]", isAuditReport ? "text-xs 2xl:text-sm" : "text-sm")}>To</span>
                <AppDateInput
                  value={toDate}
                  min={fromDate}
                  onChange={(value) => {
                    if (isAnyRegisterReport || isCashRegisterReport) setPurchaseRegisterPeriod("custom");
                    if (isAllTransactionsReport) setAllTransactionsPeriod("custom");
                    if (isAuditReport) setAuditPeriod("custom");
                    setToDate(value);
                  }}
                  className={isComparisonReport ? "w-[138px]" : isAuditReport ? "w-[130px] 2xl:w-[155px]" : "w-[155px]"}
                  inputClassName="h-9 bg-white text-sm"
                  aria-label={isCashRegisterReport ? "Cash Book to date" : isAuditReport ? "Activity to date" : "Report to date"}
                />
              </>
            ) : null}
            {isCashBookReport ? (
              <button
                type="button"
                data-cash-book-all-transactions
                className="h-9 rounded-md border border-[#d7dfeb] bg-white px-3 text-sm font-medium text-[#34435f] hover:bg-[#f2f6fb]"
                onClick={() => {
                  const dates = dataset.vouchers.filter((voucher) => voucher.workspaceId === workspaceId && isLiveVoucher(voucher)).map((voucher) => voucher.voucherDate).sort();
                  setFromDate(dates[0] ?? today);
                  setToDate(dates.at(-1) && dates.at(-1)! > today ? dates.at(-1)! : today);
                }}
              >
                All Transactions
              </button>
            ) : null}
            {isAuditReport ? (
              <select
                value={selectedAuditRole}
                onChange={(event) => setSelectedAuditRole(event.target.value)}
                className="h-9 w-[135px] shrink-0 rounded-md border border-[#d7dfeb] bg-white px-2 text-xs text-[#34435f] outline-none focus:border-[#7ba7e8] 2xl:min-w-[155px] 2xl:px-3 2xl:text-sm"
                aria-label="Filter activity by role"
              >
                <option value="all">All Roles</option>
                {auditRoleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            ) : null}
            <label data-comparison-report-search={isComparisonReport ? "true" : undefined} data-cash-book-report-search={isCashRegisterReport ? "true" : undefined} data-audit-report-search={isAuditReport ? "true" : undefined} className="relative ml-auto block min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e9bb0]" />
              <Input value={reportRowSearch} onChange={(event) => setReportRowSearch(event.target.value)} placeholder="Search this report..." className={cn("h-9 w-[240px] bg-white pl-9", isComparisonReport ? "w-[198px]" : "", isAuditReport ? "w-[190px] text-xs 2xl:w-[240px] 2xl:text-sm" : "")} />
            </label>
            {isExpenseReport ? (
              <button type="button" onClick={openExpenseEntry} className="inline-flex h-9 items-center gap-2 rounded-full bg-[#eb6b20] px-4 text-sm font-semibold text-white hover:bg-[#d85d15]">
                <Plus className="h-4 w-4" /> Add Expense
              </button>
            ) : isOrderReport ? (
              <button
                type="button"
                onClick={() => openOrderRootFromReport(isPurchaseOrderReport ? "purchase" : "sales")}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-[#eb6b20] px-4 text-sm font-semibold text-white hover:bg-[#d85d15]"
              >
                <Plus className="h-4 w-4" /> {orderRootActionLabel(isPurchaseOrderReport ? "purchase" : "sales")}
              </button>
            ) : null}
          </div>
        ) : null}

        {isMfsReport ? (
          <div className="flex min-h-10 items-center justify-between gap-3 border-x border-t border-[#d7dfeb] bg-[#f8fbff] px-3 py-2">
            <span className="text-sm font-medium text-[#53627a]">
              {selectedMfsVoucherIds.length ? `${selectedMfsVoucherIds.length} selected` : "Select transactions to edit or delete"}
            </span>
            <button
              type="button"
              disabled={!selectedMfsVoucherIds.length || mfsDeleteBusy}
              onClick={() => setMfsDeleteVoucherIds(selectedMfsVoucherIds)}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-[#efb7b2] bg-white px-3 text-xs font-semibold text-[#bd342c] transition hover:bg-[#fff1f0] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete selected
            </button>
          </div>
        ) : null}

        <div className={cn("overflow-hidden border border-[#d7dfeb] bg-white", isMfsReport ? "rounded-b-[8px]" : "rounded-[8px]", isFullHeightReport ? "min-h-0 flex-1" : "")}>
          <div data-comparison-report-table-scroll={isComparisonReport ? "true" : undefined} className={cn((isAuditReport || isVoucherViewRegisterReport || fitTableToAvailableWidth || isClosingStockReport || isBankBookReport || isComparisonReport) ? "overflow-x-hidden" : "overflow-x-auto", shouldStretchTable ? "h-full" : "")}>
            <table
              data-comparison-report-table={isComparisonReport ? "true" : undefined}
              className={cn("min-w-full text-sm", (isAuditReport || isVoucherViewRegisterReport || fitTableToAvailableWidth || isClosingStockReport || isBankBookReport || isComparisonReport) ? "w-full table-fixed" : "", isComparisonReport ? "text-[11.5px]" : "", shouldStretchTable ? "h-full" : "")}
              style={(fitTableToAvailableWidth || isComparisonReport) ? { width: "100%" } : undefined}
            >
              {isComparisonReport ? (
                <colgroup data-comparison-report-columns>
                  {activeReport.columns.map((column) => <col key={column} data-comparison-report-column={column} style={{ width: comparisonColumnWidths[column] }} />)}
                </colgroup>
              ) : null}
              {isBankBookReport ? (
                <colgroup>
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                </colgroup>
              ) : null}
              <thead className="bg-[#f7f7f8] text-left text-[#6d7b94]">
                <tr>
                  {isMfsReport ? (
                    <th className="w-12 border-b border-[#d7dfeb] px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label="Select all visible MFS transactions"
                        checked={allVisibleMfsRowsSelected}
                        onChange={(event) => setSelectedMfsVoucherIds((current) => event.target.checked
                          ? [...new Set([...current, ...visibleMfsVoucherIds])]
                          : current.filter((id) => !visibleMfsVoucherIds.includes(id)))}
                        className="h-4 w-4 accent-[#2563eb]"
                      />
                    </th>
                  ) : null}
                  {activeReport.columns.map((column, columnIndex) => (
                    <th
                      key={column}
                      data-comparison-report-column={isComparisonReport ? column : undefined}
                      style={isComparisonReport
                        ? { width: comparisonColumnWidths[column] }
                        : isAuditReport
                        ? { width: column === "Date" ? "13%" : column === "User" ? "14%" : column === "Role" ? "9%" : column === "Action" ? "17%" : column === "Details" ? "47%" : `${100 / activeReport.columns.length}%` }
                        : isBillWiseProfitReport
                          ? { width: column === "Type" ? "15%" : column === "Invoice" ? "24%" : column === "Party" ? "14%" : "15.67%" }
                        : fitTableToAvailableWidth
                          ? { width: `${100 / activeReport.columns.length}%` }
                          : undefined}
                      className={cn(
                        "relative whitespace-nowrap border-b border-[#d7dfeb] px-4 py-3 font-semibold",
                        columnIndex > 0 ? "border-l border-l-[#e3e9f2]" : "",
                        isAuditReport && column === "Date" ? "w-[150px]" : "",
                        isAuditReport && column === "User" ? "w-[120px]" : "",
                        isAuditReport && column === "Role" ? "w-[100px]" : "",
                        isAuditReport && column === "Action" ? "w-[190px]" : "",
                        isVoucherViewRegisterReport && column === "Date" ? "w-[100px]" : "",
                        isVoucherViewRegisterReport && column === "Voucher" ? "w-[175px]" : "",
                        isSalesRegisterReport && column === "Customer" ? "w-[110px]" : "",
                        isSalesReturnRegisterReport && column === "Customer" ? "w-[140px]" : "",
                        isPurchaseRegisterReport && column === "Supplier" ? "w-[105px]" : "",
                        isPurchaseReturnRegisterReport && column === "Supplier" ? "w-[140px]" : "",
                        isReceiptRegisterReport && column === "From" ? "w-[180px]" : "",
                        isPaymentRegisterReport && column === "To" ? "w-[180px]" : "",
                        isCashRegisterReport && column === "Particulars" ? "" : "",
                        isPurchaseRegisterReport && column === "Type" ? "w-[82px]" : "",
                        isVoucherViewRegisterReport && column === "Amount" ? "w-[140px]" : "",
                        isPurchaseRegisterReport && column === "Balance" ? "w-[125px]" : "",
                        isCashRegisterReport && (column === "Debit" || column === "Credit" || column === "Balance") ? "w-[145px]" : "",
                        isBankBookReport && (column === "Debit" || column === "Credit" || column === "Balance") ? "text-right" : "",
                        isPartyStatementReport && ["Debit", "Credit", "Balance", "Credit Sales", "Sales Return", "Collection", "Due"].includes(column) ? "text-right" : "",
                        isComparisonReport && comparisonAmountColumns.has(column) ? "text-right" : "",
                        isVoucherViewRegisterReport && column === "Status" ? "w-[100px]" : "",
                        isCustomerStatementReport && column === "Customer" ? "w-[170px]" : "",
                        isCustomerStatementReport && column === "Contact" ? "w-[145px]" : "",
                        isCustomerStatementReport && column === "Status" ? "w-[90px]" : "",
                        isComparisonReport ? "whitespace-normal px-1.5 py-2 leading-tight" : "",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{column}</span>
                        <DropdownMenuPrimitive.Root
                          open={openAllTransactionsFilter === column}
                          onOpenChange={(open) => setOpenAllTransactionsFilter(open ? column : null)}
                        >
                          <DropdownMenuPrimitive.Trigger asChild>
                            <button
                              type="button"
                              data-comparison-report-column-filter={isComparisonReport ? "true" : undefined}
                              className={cn(
                                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-[#e8eef7]",
                                allTransactionsColumnFilters[column]?.trim() ? "text-[#e76412]" : "text-[#7a8799]",
                              )}
                              aria-label={`Filter ${column}`}
                            >
                              <Filter className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuPrimitive.Trigger>
                          <DropdownMenuPrimitive.Portal>
                            <DropdownMenuPrimitive.Content
                              align="start"
                              sideOffset={6}
                              collisionPadding={12}
                              className="z-[100] w-56 rounded-md border border-[#d7dfeb] bg-white p-3 text-left shadow-xl"
                              onCloseAutoFocus={(event) => event.preventDefault()}
                            >
                              <div className="mb-2 text-xs font-semibold text-[#53627a]">Filter by {column}</div>
                              <Input
                                autoFocus
                                value={allTransactionsColumnFilters[column] ?? ""}
                                onChange={(event) => setAllTransactionsColumnFilters((current) => ({ ...current, [column]: event.target.value }))}
                                onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter") setOpenAllTransactionsFilter(null); }}
                                placeholder={`Search ${column.toLowerCase()}...`}
                                className="h-8 bg-white text-sm font-normal"
                              />
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  className="text-xs font-medium text-[#e76412] hover:underline"
                                  onClick={() => {
                                    setAllTransactionsColumnFilters((current) => ({ ...current, [column]: "" }));
                                    setOpenAllTransactionsFilter(null);
                                  }}
                                >
                                  Clear
                                </button>
                                <button type="button" className="rounded bg-[#2563eb] px-3 py-1 text-xs font-semibold text-white" onClick={() => setOpenAllTransactionsFilter(null)}>
                                  Apply
                                </button>
                              </div>
                            </DropdownMenuPrimitive.Content>
                          </DropdownMenuPrimitive.Portal>
                        </DropdownMenuPrimitive.Root>
                      </div>
                    </th>
                  ))}
                  {isMfsReport ? <th className="w-24 border-b border-l border-[#d7dfeb] px-3 py-3 text-center font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {visibleTableRows.length ? (
                  visibleTableRows.map((row, index) => (
                    (() => {
                      const hasInventoryDetail = Boolean(row._itemId) || (isInventoryReport && Boolean(row.Category));
                      const hasExpenseDetail = isExpenseReport;
                      return (
                    <tr
                      key={`${activeReport.title}-${index}`}
                      className={cn(
                        index % 2 === 0 ? "bg-white" : "bg-[#fbfbfc]",
                        isComparisonReport && (row.Voucher === "B/F" || row.Voucher === "C/F") ? "font-semibold bg-[#f4f8fd]" : "",
                        (hasTransactionDrilldown(row) || (isVoucherViewRegisterReport && row.Voucher !== "B/F") || hasPartyDetailRows || hasInventoryDetail || hasExpenseDetail || hasOperationalDetail || (row["Bill No."] && activeReport.billDetails?.some((detail) => detail.voucherNumber === row["Bill No."]))) ? "cursor-pointer transition hover:bg-[#eef6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#2563eb]" : "",
                      )}
                      role={hasTransactionDrilldown(row) || hasPartyDetailRows || hasInventoryDetail || hasExpenseDetail || hasOperationalDetail ? "button" : (isVoucherViewRegisterReport && row.Voucher !== "B/F") ? "link" : undefined}
                      tabIndex={hasTransactionDrilldown(row) || (isVoucherViewRegisterReport && row.Voucher !== "B/F") || hasPartyDetailRows || hasInventoryDetail || hasExpenseDetail || hasOperationalDetail ? 0 : undefined}
                      aria-label={hasPartyDetailRows
                        ? `View statement details for ${row.Customer ?? row.Supplier ?? "party"}`
                        : hasInventoryDetail
                          ? `Open inventory item ${row["Item Name"] ?? row.Item ?? "details"}`
                        : hasExpenseDetail
                          ? `View expense details ${row.Particulars ?? row.Month ?? ""}`
                        : hasOperationalDetail
                          ? `View ${activeReport.title} row details`
                        : hasTransactionDrilldown(row)
                          ? `View transaction details ${row.Voucher ?? row.Invoice ?? row.Particulars ?? ""}`
                        : isVoucherViewRegisterReport && row.Voucher !== "B/F"
                          ? `Open ${isSalesRegisterReport ? "sales invoice" : isPurchaseRegisterReport ? "purchase bill" : isReceiptRegisterReport ? "receipt" : isPaymentRegisterReport ? "payment" : isSalesReturnRegisterReport ? "sales return" : isPurchaseReturnRegisterReport ? "purchase return" : "cash transaction"} ${row.Voucher ?? ""}`
                          : undefined}
                      onClick={() => {
                        if (hasTransactionDrilldown(row)) {
                          openTransactionDrilldown(row);
                          return;
                        }
                        if (hasPartyDetailRows && row._partyId) {
                          const partyDetail = activeReport.rowDetails?.find((detail) => detail.partyId === row._partyId);
                          if (partyDetail) setSelectedPartyStatementDetail(partyDetail);
                          return;
                        }
                        if (row._itemId) {
                          setSelectedInventoryReportDetail({
                            itemId: row._itemId,
                            title: row["Item Name"] ?? row.Item ?? "Inventory Item",
                            reportTitle: activeReport.title,
                            fields: activeReport.columns.map((column) => ({ label: column, value: row[column] ?? "-" })),
                          });
                          return;
                        }
                        if (isInventoryReport && row.Category) {
                          setSelectedInventoryReportDetail({
                            title: row.Category,
                            reportTitle: activeReport.title,
                            fields: activeReport.columns.map((column) => ({ label: column, value: row[column] ?? "-" })),
                          });
                          return;
                        }
                        if (hasExpenseDetail) {
                          setSelectedExpenseReportDetail({
                            title: row.Particulars ?? row.Month ?? activeReport.title,
                            reportTitle: activeReport.title,
                            voucherId: row._voucherId || undefined,
                            fields: activeReport.columns.map((column) => ({ label: column, value: row[column] ?? "-" })),
                          });
                          return;
                        }
                        if (hasOperationalDetail) {
                          const voucherNumber = row.Voucher ?? row.Invoice;
                          const sourceVoucher = voucherNumber
                            ? dataset.vouchers.find((entry) => entry.workspaceId === workspaceId && entry.voucherNumber === voucherNumber)
                            : undefined;
                          setSelectedOperationalReportDetail({
                            title: row.Voucher ?? row.Invoice ?? row["Cheque No"] ?? row.Order ?? row.Month ?? row.User ?? activeReport.title,
                            reportTitle: activeReport.title,
                            group: activeCatalogItem.group,
                            voucherId: sourceVoucher?.id,
                            fields: activeReport.columns.map((column) => ({ label: column, value: row[column] ?? "-" })),
                          });
                          return;
                        }
                        const billDetail = activeReport.billDetails?.find((detail) => detail.voucherNumber === row["Bill No."]);
                        if (billDetail) setSelectedBillDetail(billDetail);
                        if (isVoucherViewRegisterReport && row.Voucher !== "B/F") {
                          const voucher = dataset.vouchers.find(
                            (entry) =>
                              entry.workspaceId === workspaceId
                              && entry.voucherNumber === row.Voucher
                              && (isSalesRegisterReport
                                ? isRealSalesInvoice(entry)
                                : isPurchaseRegisterReport
                                  ? isRealPurchaseBill(entry)
                                  : isCashRegisterReport
                                    ? hasCashBookMovement(entry) && !isReversalArtifact(entry)
                                    : entry.voucherType === (isReceiptRegisterReport ? "receipt" : isPaymentRegisterReport ? "payment" : isSalesReturnRegisterReport ? "credit-note" : "debit-note") && !isReversalArtifact(entry)),
                          );
                          if (voucher) setSelectedRegisterInvoice(voucher);
                        }
                      }}
                      onKeyDown={(event) => {
                        if ((hasTransactionDrilldown(row) || (isVoucherViewRegisterReport && row.Voucher !== "B/F") || hasPartyDetailRows || hasInventoryDetail || hasExpenseDetail || hasOperationalDetail) && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          event.currentTarget.click();
                        }
                      }}
                    >
                      {isMfsReport ? (
                        <td className="w-12 border-b border-[#edf1f7] px-4 py-3 text-center">
                          {row._voucherId ? (
                            <input
                              type="checkbox"
                              aria-label={`Select ${row.Voucher ?? "MFS transaction"}`}
                              checked={selectedMfsVoucherIds.includes(row._voucherId)}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => setSelectedMfsVoucherIds((current) => event.target.checked
                                ? [...new Set([...current, row._voucherId])]
                                : current.filter((id) => id !== row._voucherId))}
                              className="h-4 w-4 accent-[#2563eb]"
                            />
                          ) : null}
                        </td>
                      ) : null}
                      {activeReport.columns.map((column, columnIndex) => (
                        <td
                          key={`${index}-${column}`}
                          data-comparison-report-column={isComparisonReport ? column : undefined}
                          className={cn(
                            "border-b border-[#edf1f7] px-4 py-3 text-[#25365b]",
                            columnIndex > 0 ? "border-l border-l-[#edf1f7]" : "",
                            fitTableToAvailableWidth ? "overflow-hidden text-ellipsis" : "",
                            isBankBookReport ? "overflow-hidden text-ellipsis" : "",
                            isBankBookReport && (column === "Debit" || column === "Credit" || column === "Balance") ? "text-right tabular-nums" : "",
                            isPartyStatementReport && ["Debit", "Credit", "Balance", "Credit Sales", "Sales Return", "Collection", "Due"].includes(column) ? "text-right tabular-nums" : "",
                            isComparisonReport && comparisonAmountColumns.has(column) ? "text-right tabular-nums" : "",
                            isVoucherViewRegisterReport ? "overflow-hidden text-ellipsis" : "",
                            (isVoucherViewRegisterReport || hasTransactionDrilldown(row)) && (column === "Voucher" || column === "Invoice") ? "font-semibold text-[#2563eb] underline decoration-[#93b4ea] underline-offset-2" : "",
                            isAuditReport && column === "Action" ? "font-medium leading-5" : "",
                            isAuditReport && column === "Details"
                              ? "border-l border-l-[#e3e9f2] whitespace-normal break-words pl-5 leading-5"
                              : isAuditReport && column === "Action"
                                ? "whitespace-normal break-words"
                                : "whitespace-nowrap",
                            isComparisonReport ? "whitespace-normal break-words px-1.5 py-2 leading-tight" : "",
                          )}
                        >
                          {isAuditReport && column === "Details" ? (
                            <span className="line-clamp-3" title={row[column] ?? "-"}>{row[column] ?? "-"}</span>
                          ) : isGeneralLedgerReport && column === "Action" && row._voucherId && row._voucherType ? (
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#245b96] transition hover:bg-[#eaf2ff]"
                              aria-label={`Edit ${row.Voucher ?? "voucher"}`}
                              title="Edit voucher"
                              onClick={(event) => {
                                event.stopPropagation();
                                const voucherId = String(row._voucherId);
                                const voucherType = String(row._voucherType) as VoucherType;
                                router.push(
                                  voucherType === "contra"
                                    ? `${buildWorkspaceRoute(mode, "/utilities/bank-transfers")}?edit=${encodeURIComponent(voucherId)}`
                                    : `${buildVoucherRoute(mode, voucherType)}?edit=${encodeURIComponent(voucherId)}`,
                                );
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          ) : isInvoiceRegisterReport && column === "Items" ? (
                            <span className="block truncate" title={row[column] ?? "-"}>{row[column] ?? "-"}</span>
                          ) : row[column] ?? "-"}
                        </td>
                      ))}
                      {isMfsReport ? (
                        <td className="border-b border-l border-[#edf1f7] px-3 py-2">
                          {row._voucherId && row._voucherType ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                aria-label={`Edit ${row.Voucher ?? "MFS transaction"}`}
                                title="Edit transaction"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openMfsVoucherEditor(row._voucherId, row._voucherType as VoucherType);
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#2563eb] transition hover:bg-[#eaf2ff]"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${row.Voucher ?? "MFS transaction"}`}
                                title="Delete transaction"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setMfsDeleteVoucherIds([row._voucherId]);
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#c43d34] transition hover:bg-[#fff0ef]"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                      );
                    })()
                  ))
                ) : (
                  <tr>
                    <td colSpan={activeReport.columns.length + (isMfsReport ? 2 : 0)} className="px-4 py-14 text-center text-sm text-[#6d7b94]">
                      {isExpenseReport ? (
                        <ExpenseReportEmptyState
                          title={`No ${activeReport.title.toLowerCase()} data found`}
                          description="Try another date range or create an expense voucher to populate this report."
                          onAdd={openExpenseEntry}
                        />
                      ) : isBankingReport ? (
                        <BankingReportEmptyState
                          title={`No ${activeReport.title.toLowerCase()} data found`}
                          description="Try another date range. Banking activity will appear here automatically when transactions are recorded."
                        />
                      ) : isTaxReport ? (
                        <TaxReportEmptyState
                          title={`No ${activeReport.title.toLowerCase()} data found`}
                          description="Try another date range. Tax and VAT ledger activity will appear here automatically when vouchers are recorded."
                        />
                      ) : isOrderReport ? (
                        <OrderReportEmptyState
                          title={`No ${activeReport.title.toLowerCase()} found`}
                          description="Try another date range or create a new order to populate this report."
                          actionLabel={orderRootActionLabel(isPurchaseOrderReport ? "purchase" : "sales")}
                          onAdd={() => openOrderRootFromReport(isPurchaseOrderReport ? "purchase" : "sales")}
                        />
                      ) : isRatioReport ? (
                        <RatioReportEmptyState
                          title={`No ${activeReport.title.toLowerCase()} available`}
                          description="Record financial transactions for the selected period to calculate this ratio."
                        />
                      ) : isBusinessAnalytics ? (
                        <AnalyticsEmptyState
                          title={`No ${activeReport.title.toLowerCase()} data found`}
                          description="Try another date range. Analytics will update automatically as business transactions are recorded."
                        />
                      ) : isAuditReport ? (
                        <AuditReportEmptyState
                          title={`No ${activeReport.title.toLowerCase()} entries found`}
                          description="Try another date range. Matching user and transaction activity will appear here automatically."
                        />
                      ) : (
                        <ReportEmptyState
                          group={activeCatalogItem.group}
                          reportSlug={activeCatalogItem.slug}
                          title={emptyDueToFilters ? "No matching report rows" : `No ${activeReport.title.toLowerCase()} data yet`}
                          description={emptyDueToFilters
                            ? "Clear the report search or column filters, or choose a different date range."
                            : activeReport.emptyMessage}
                          filtered={emptyDueToFilters}
                        />
                      )}
                    </td>
                  </tr>
                )}
                {isPartyStatementReport && visibleTableRows.length && partyStatementTotals ? (
                  <tr className="border-t border-[#d7dfeb] bg-[#f7f7f8] text-[15px] font-semibold">
                    <td colSpan={2} className="whitespace-nowrap px-4 py-3 text-[#25365b]">Total</td>
                    {isCustomerStatementReport ? (
                      <>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-[#0f9f63]">{formatReportAmount(partyStatementTotals.creditSales)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-[#dc6b16]">{formatReportAmount(partyStatementTotals.salesReturn)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-[#0f5fc4]">{formatReportAmount(partyStatementTotals.collection)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-[#25365b]">{formatReportAmount(partyStatementTotals.due)}</td>
                      </>
                    ) : (
                      <>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-[#0f9f63]">{formatReportAmount(partyStatementTotals.debit)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-[#0f5fc4]">{formatReportAmount(partyStatementTotals.credit)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-[#25365b]">{formatReportAmount(partyStatementTotals.balance)}</td>
                      </>
                    )}
                    <td className="whitespace-nowrap px-4 py-3" />
                  </tr>
                ) : null}
                {isSalesRegisterReport && visibleTableRows.length ? (
                  <tr className="border-t-2 border-[#cbd8e8] bg-[#eef6ff] text-[15px] font-semibold">
                    <td colSpan={4} className="whitespace-nowrap px-4 py-3 text-right text-[#25365b]">
                      Total ({visibleTableRows.length} {visibleTableRows.length === 1 ? "entry" : "entries"})
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#0f9f63]">
                      {formatReportAmount(salesRegisterVisibleTotal)}
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        {isCashFlowReport ? (
          <section className="overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d7dfeb] bg-[#f8fbff] px-4 py-3">
              <div>
                <h3 className="text-[15px] font-semibold text-[#25365b]">Cash &amp; Cash Equivalents</h3>
                <p className="mt-0.5 text-[11px] text-[#74839b]">All posting ledgers under the protected Cash &amp; Cash Equivalents account.</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8190a6]" />
                  <Input
                    value={cashEquivalentSearch}
                    onChange={(event) => setCashEquivalentSearch(event.target.value)}
                    placeholder="Search ledger..."
                    className="h-8 w-[180px] bg-white pl-8 text-xs"
                    aria-label="Search cash equivalent ledgers"
                  />
                </label>
                <label className="flex h-8 items-center gap-1.5 rounded-md border border-[#d7dfeb] bg-white px-2">
                  <Filter className="h-3.5 w-3.5 text-[#2563eb]" />
                  <select
                    value={cashEquivalentChannel}
                    onChange={(event) => setCashEquivalentChannel(event.target.value as CashFlowChannel)}
                    className="h-6 min-w-[94px] border-0 bg-white text-xs font-medium text-[#40516c] outline-none"
                    aria-label="Filter cash equivalent ledgers by channel"
                  >
                    <option value="all">All Ledgers</option>
                    <option value="cash">Cash</option>
                    <option value="bank">Bank</option>
                    <option value="mfs">MFS</option>
                  </select>
                </label>
                <div className="rounded-full bg-[#edf4ff] px-3 py-1 text-[11px] font-semibold text-[#2563eb]">
                  {visibleCashEquivalentRows.length}/{activeReport.cashEquivalentRows?.length ?? 0} ledgers
                </div>
              </div>
            </div>
            {visibleCashEquivalentRows.length ? (
              <table className="w-full table-fixed text-[13px]">
                <colgroup>
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14.5%" }} />
                  <col style={{ width: "14.5%" }} />
                  <col style={{ width: "14.5%" }} />
                  <col style={{ width: "14.5%" }} />
                </colgroup>
                <thead className="bg-[#f7f7f8] text-left text-[#6d7b94]">
                  <tr>
                    {[
                      "Ledger", "Channel", "Opening", "Money In", "Money Out", "Closing",
                    ].map((column, index) => (
                      <th key={column} className={cn("border-b border-[#d7dfeb] px-4 py-2.5 font-semibold", index > 1 ? "text-right" : "", index > 0 ? "border-l border-l-[#e3e9f2]" : "")}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleCashEquivalentRows.map((row, index) => (
                    <tr
                      key={`${row.channel}-${row.ledger}`}
                      className={cn(index % 2 === 0 ? "bg-white" : "bg-[#fbfbfc]", "cursor-pointer transition hover:bg-[#eef6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#2563eb]")}
                      role="button"
                      tabIndex={0}
                      aria-label={`View transactions for ${row.ledger}`}
                      onClick={() => setSelectedCashEquivalentLedger(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedCashEquivalentLedger(row);
                        }
                      }}
                    >
                      <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-[#edf1f7] px-4 py-2.5 font-medium text-[#25365b]" title={row.ledger}>{row.ledger}</td>
                      <td className="border-b border-l border-[#edf1f7] px-4 py-2.5">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", row.channel === "cash" ? "bg-[#eef8f2] text-[#16805a]" : row.channel === "bank" ? "bg-[#edf4ff] text-[#2563eb]" : "bg-[#fff3e8] text-[#d66b16]")}>{row.channel}</span>
                      </td>
                      <td className="border-b border-l border-[#edf1f7] px-4 py-2.5 text-right tabular-nums text-[#53627a]">{formatReportAmount(row.opening)}</td>
                      <td className="border-b border-l border-[#edf1f7] px-4 py-2.5 text-right tabular-nums text-[#0f9f63]">{formatReportAmount(row.moneyIn)}</td>
                      <td className="border-b border-l border-[#edf1f7] px-4 py-2.5 text-right tabular-nums text-[#d96a14]">{formatReportAmount(row.moneyOut)}</td>
                      <td className={cn("border-b border-l border-[#edf1f7] px-4 py-2.5 text-right font-semibold tabular-nums", moneyToMinorUnits(row.closing) < 0 ? "text-[#dc4b55]" : "text-[#1d5fb8]")}>{formatReportAmount(row.closing)}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#eef6ff] font-semibold text-[#25365b]">
                    <td colSpan={2} className="px-4 py-3">Total Cash &amp; Cash Equivalents</td>
                    {(["opening", "moneyIn", "moneyOut", "closing"] as const).map((field) => (
                      <td key={field} className="border-l border-[#d7e4f3] px-4 py-3 text-right tabular-nums">
                        {formatReportAmount(sumMoney(visibleCashEquivalentRows.map((row) => row[field])))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="px-6 py-10 text-center">
                <Landmark className="mx-auto h-8 w-8 text-[#9db2d3]" strokeWidth={1.5} />
                <p className="mt-3 text-[13px] font-semibold text-[#40536f]">No matching cash-equivalent ledgers</p>
                <p className="mt-1 text-[11px] text-[#8290a5]">No ledger under Cash &amp; Cash Equivalents matches the selected channel.</p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    );
  }

  const isComparisonWorkspace = activeCatalogItem.slug === "customer-supplier-comparison";

  return (
    <div data-comparison-report-workspace={isComparisonWorkspace ? "true" : undefined} className="flex h-full min-h-0 flex-col overflow-hidden rounded-[6px] border border-[#d7dfeb] bg-white">
      <div className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#d7dfeb] bg-[#fbfcff] px-3 py-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="text-[14px] font-semibold text-[#1f3253]">Reports</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-[#697791]">
            <span>{activeGroupLabel}</span>
            <span className="text-[#b4bfce]">/</span>
            <span className="text-primary">{activeCatalogItem.label}</span>
          </div>
        </div>
        <div className="rounded-full border border-[#d7dfeb] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#5d6c86]">
          {reportCatalog.length} reports
        </div>
      </div>
      <div data-comparison-report-layout={isComparisonWorkspace ? "true" : undefined} className="grid min-h-0 flex-1 lg:grid-cols-[clamp(210px,16.3vw,278px)_minmax(0,1fr)]">
        <div data-comparison-report-catalog={isComparisonWorkspace ? "true" : undefined} className="flex min-h-0 flex-col border-r border-[#d7dfeb] bg-white">
          <div className="shrink-0 border-b border-[#d7dfeb] bg-white p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7b8ba3]" />
              <Input
                value={reportSearch}
                onChange={(event) => setReportSearch(event.target.value)}
                placeholder="Search reports..."
                aria-label="Search reports"
                className="h-8 rounded-md border-[#cad7e6] bg-[#fbfdff] pl-8 pr-3 text-sm focus-visible:bg-white"
              />
            </div>
          </div>
          <div ref={catalogScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {Object.entries(groupedCatalog).length ? Object.entries(groupedCatalog).map(([group, items]) => (
              <div key={group}>
                <div className="sticky top-0 z-10 bg-[#d4ebf4] px-4 py-3 text-[13px] font-semibold text-[#385170]">{formatReportGroupHeading(group)}</div>
                <div className="relative ml-4 border-l border-[#d6e1ee] py-1">
                  {items.map((item) => {
                    const active = item.slug === activeCatalogItem.slug;
                    return (
                      <button
                        key={item.slug}
                        type="button"
                        className={cn(
                          "relative flex w-full items-center justify-between py-2.5 pl-7 pr-4 text-left text-[15px] transition",
                          active
                            ? "bg-[#dce8f5] font-semibold text-[#17345f] shadow-[inset_3px_0_0_#1689e8]"
                            : "bg-white text-[#28365b] hover:bg-[#f8fafc]",
                        )}
                        onClick={() => navigateToReport(item.slug)}
                      >
                        <span aria-hidden className="absolute left-0 top-1/2 w-4 border-t border-[#d6e1ee]" />
                        <span
                          aria-hidden
                          className={cn(
                            "absolute left-[13px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full",
                            active ? "bg-[#1e9bff]" : "bg-[#b9c7d8]",
                          )}
                        />
                        <span className="min-w-0 truncate">{item.label}</span>
                        {active ? (
                          <span className="ml-2 shrink-0 rounded-full bg-[#f59e0b] px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-[0.08em] text-[#17213d]">
                            Current
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )) : (
              <div className="px-3 py-5">
                <ReportEmptyState group="Reports" title="No reports found" description="Try a different report name in the search box." filtered compact />
              </div>
            )}
          </div>
        </div>

        <div id="report-print-area" data-comparison-report-content={isComparisonWorkspace ? "true" : undefined} className="h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain bg-white py-5 pl-4 pr-2">
          {activeCatalogItem.slug === "chart-of-accounts" ? <ChartOfAccountsPanel /> : renderReportView()}
        </div>
      </div>
      <ConfirmationDialog
        open={mfsDeleteVoucherIds.length > 0}
        onOpenChange={(open) => { if (!open && !mfsDeleteBusy) setMfsDeleteVoucherIds([]); }}
        title={`Delete ${mfsDeleteVoucherIds.length} MFS transaction${mfsDeleteVoucherIds.length === 1 ? "" : "s"}?`}
        description="The selected voucher and its ledger posting will be removed and the MFS balance will be recalculated. This cannot be undone from this report."
        confirmLabel={mfsDeleteBusy ? "Deleting..." : "Delete"}
        tone="danger"
        onConfirm={() => void confirmDeleteMfsVouchers()}
      />
      <PartyStatementDetailDialog
        detail={selectedPartyStatementDetail}
        onClose={() => setSelectedPartyStatementDetail(null)}
        onOpenLedger={(detail) => {
          const masterPath = detail.type === "customer" ? "/masters/customers" : "/masters/suppliers";
          router.push(buildWorkspaceRoute(mode, `${masterPath}?partyId=${encodeURIComponent(detail.partyId)}&tab=ledger`));
        }}
      />
      <InventoryReportDetailDialog
        detail={selectedInventoryReportDetail}
        onClose={() => setSelectedInventoryReportDetail(null)}
        onOpenInventory={(itemId) => router.push(itemId
          ? `${buildWorkspaceRoute(mode, "/masters/inventory")}?item=${encodeURIComponent(itemId)}`
          : buildWorkspaceRoute(mode, "/masters/inventory"))}
      />
      <ExpenseReportDetailDialog
        detail={selectedExpenseReportDetail}
        onClose={() => setSelectedExpenseReportDetail(null)}
        onOpenVoucher={(voucherId) => {
          const voucher = dataset.vouchers.find((entry) => entry.workspaceId === workspaceId && entry.id === voucherId);
          if (voucher) setSelectedRegisterInvoice(voucher);
        }}
      />
      <OperationalReportDetailDialog
        detail={selectedOperationalReportDetail}
        onClose={() => setSelectedOperationalReportDetail(null)}
        onOpenVoucher={(voucherId) => {
          const voucher = dataset.vouchers.find((entry) => entry.workspaceId === workspaceId && entry.id === voucherId);
          if (voucher) setSelectedRegisterInvoice(voucher);
        }}
      />
      <BillReportDetailDialog
        detail={selectedBillDetail}
        onClose={() => setSelectedBillDetail(null)}
        onOpenVoucher={(voucherId, voucherType) => router.push(`${buildVoucherRoute(mode, voucherType)}?edit=${encodeURIComponent(voucherId)}`)}
      />
      <Dialog open={Boolean(cashFlowDrilldown)} onOpenChange={(open) => !open && setCashFlowDrilldown(null)}>
        <DialogContent className="w-[min(94vw,720px)] max-w-[720px] overflow-hidden rounded-[12px] border border-[#dbe4ef] p-0">
          <div className="border-b border-[#e2e8f0] bg-[#f7faff] px-6 py-5">
            <DialogTitle className="text-xl text-[#203653]">{cashFlowDrilldown?.title ?? "Cash Flow Details"}</DialogTitle>
            <DialogDescription className="mt-1">Transactions included in this cash-flow line for the selected period.</DialogDescription>
          </div>
          <div className="max-h-[460px] overflow-y-auto px-4 py-3">
            {cashFlowDrilldown?.vouchers.length ? cashFlowDrilldown.vouchers.map((voucher) => (
              <button
                key={voucher.id}
                type="button"
                className="grid w-full grid-cols-[110px_minmax(0,1fr)_130px] items-center gap-3 border-b border-[#edf1f6] px-2 py-3 text-left transition hover:bg-[#eef6ff]"
                onClick={() => {
                  setCashFlowDrilldown(null);
                  setSelectedRegisterInvoice(voucher);
                }}
              >
                <span className="text-xs text-[#6d7b94]">{formatDate(voucher.voucherDate)}</span>
                <span className="min-w-0"><span className="block truncate font-semibold text-[#2563eb]">{voucher.voucherNumber}</span><span className="mt-0.5 block truncate text-xs capitalize text-[#66768f]">{voucher.partyName || voucher.voucherType.replace(/-/g, " ")}</span></span>
                <span className="text-right text-sm font-semibold tabular-nums text-[#25365b]">{formatReportAmount(Number(voucher.amount || 0))}</span>
              </button>
            )) : <ReportEmptyState group="Transaction Reports" title="No source transactions found" description="This cash-flow line has no matching transaction rows in the selected period." compact />}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(selectedCashEquivalentLedger) && !selectedRegisterInvoice} onOpenChange={(open) => !open && !selectedRegisterInvoice && setSelectedCashEquivalentLedger(null)}>
        <DialogContent className="w-[min(94vw,1040px)] max-w-[1040px] overflow-hidden rounded-[12px] border border-[#dbe4ef] p-0">
          <div className="border-b border-[#e2e8f0] bg-[#f7faff] px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-7">
              <div>
                <DialogTitle className="text-xl text-[#203653]">{selectedCashEquivalentLedger?.ledger ?? "Cash ledger movements"}</DialogTitle>
                <DialogDescription className="mt-1">Voucher-wise movement from {formatDate(fromDate)} to {formatDate(toDate)}. Select a row to view the complete voucher.</DialogDescription>
              </div>
              {selectedCashEquivalentLedger ? <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${selectedCashEquivalentLedger.channel === "cash" ? "bg-[#e9f8ef] text-[#168356]" : selectedCashEquivalentLedger.channel === "bank" ? "bg-[#eaf2ff] text-[#2463b3]" : "bg-[#fff1e6] text-[#c45d0a]"}`}>{selectedCashEquivalentLedger.channel}</span> : null}
            </div>
          </div>
          {selectedCashEquivalentLedger ? (
            <>
              <div className="grid grid-cols-2 gap-2 border-b border-[#e2e8f0] bg-white px-4 py-3 sm:grid-cols-4">
                {[
                  ["Opening", selectedCashEquivalentLedger.opening, "text-[#25365b]"],
                  ["Money In", selectedCashEquivalentLedger.moneyIn, "text-[#08965e]"],
                  ["Money Out", selectedCashEquivalentLedger.moneyOut, "text-[#e35f13]"],
                  ["Closing", selectedCashEquivalentLedger.closing, "text-[#145ac6]"],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="rounded-[8px] border border-[#e3eaf3] bg-[#fbfdff] px-3 py-2">
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#71819b]">{label}</span>
                    <span className={`mt-1 block text-sm font-bold tabular-nums ${color}`}>{formatReportAmount(Number(value))}</span>
                  </div>
                ))}
              </div>
              <div className="max-h-[460px] overflow-y-auto bg-white px-4 py-3">
                {visibleCashEquivalentTransactions.length ? (
                  <table className="w-full table-fixed border-collapse overflow-hidden rounded-[8px] border border-[#dce5f0] text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-[#f5f7fa] text-[#556987]">
                      <tr>{[["Date", "11%"], ["Voucher", "18%"], ["Particulars", "33%"], ["Money In", "12%"], ["Money Out", "12%"], ["Balance", "14%"]].map(([label, width]) => (
                        <th key={label} style={{ width }} className="border-b border-r border-[#dce5f0] px-2 py-2 last:border-r-0">
                          <div className="flex items-center justify-between gap-1">
                            <span>{label}</span>
                            <DropdownMenuPrimitive.Root open={openCashEquivalentTransactionFilter === label} onOpenChange={(open) => setOpenCashEquivalentTransactionFilter(open ? label : null)}>
                              <DropdownMenuPrimitive.Trigger asChild>
                                <button type="button" className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-[#e5edf8]", cashEquivalentTransactionFilters[label]?.trim() ? "text-[#e76412]" : "text-[#71819b]")} aria-label={`Filter ${label}`}>
                                  <Filter className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuPrimitive.Trigger>
                              <DropdownMenuPrimitive.Portal>
                                <DropdownMenuPrimitive.Content align="end" sideOffset={6} collisionPadding={12} className="z-[120] w-60 rounded-md border border-[#d7dfeb] bg-white p-3 text-left font-normal shadow-xl" onCloseAutoFocus={(event) => event.preventDefault()}>
                                  <div className="mb-2 text-xs font-semibold text-[#53627a]">Filter by {label}</div>
                                  <Input autoFocus value={cashEquivalentTransactionFilters[label] ?? ""} onChange={(event) => setCashEquivalentTransactionFilters((current) => ({ ...current, [label]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter") setOpenCashEquivalentTransactionFilter(null); }} placeholder={label === "Date" ? "Search date (DD/MM/YYYY)..." : `Search ${label.toLowerCase()}...`} className="h-8 bg-white text-sm font-normal" />
                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <button type="button" className="text-xs font-medium text-[#e76412] hover:underline" onClick={() => { setCashEquivalentTransactionFilters((current) => ({ ...current, [label]: "" })); setOpenCashEquivalentTransactionFilter(null); }}>Clear</button>
                                    <button type="button" className="rounded bg-[#2563eb] px-3 py-1 text-xs font-semibold text-white" onClick={() => setOpenCashEquivalentTransactionFilter(null)}>Apply</button>
                                  </div>
                                </DropdownMenuPrimitive.Content>
                              </DropdownMenuPrimitive.Portal>
                            </DropdownMenuPrimitive.Root>
                          </div>
                        </th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {visibleCashEquivalentTransactions.map((transaction, index) => (
                        <tr
                          key={`${transaction.voucher.id}-${index}`}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer border-b border-[#e7edf5] text-[#263958] transition last:border-b-0 hover:bg-[#eef6ff] focus-visible:bg-[#eef6ff] focus-visible:outline-none"
                          onClick={() => setSelectedRegisterInvoice(transaction.voucher)}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedRegisterInvoice(transaction.voucher); } }}
                        >
                          <td className="border-r border-[#e7edf5] px-3 py-3 align-top">{formatDate(transaction.voucher.voucherDate)}</td>
                          <td className="border-r border-[#e7edf5] px-3 py-3 align-top"><span className="block truncate font-semibold text-[#2563eb]">{transaction.voucher.voucherNumber}</span><span className="mt-0.5 block truncate capitalize text-[10px] text-[#75839a]">{transaction.voucher.partyName || transaction.voucher.voucherType.replace(/-/g, " ")}</span></td>
                          <td className="border-r border-[#e7edf5] px-3 py-3 align-top leading-5 break-words">{transaction.description}</td>
                          <td className="border-r border-[#e7edf5] px-3 py-3 text-right align-top font-semibold tabular-nums text-[#08965e]">{transaction.moneyIn ? formatReportAmount(transaction.moneyIn) : "—"}</td>
                          <td className="border-r border-[#e7edf5] px-3 py-3 text-right align-top font-semibold tabular-nums text-[#e35f13]">{transaction.moneyOut ? formatReportAmount(transaction.moneyOut) : "—"}</td>
                          <td className="px-3 py-3 text-right align-top font-bold tabular-nums text-[#145ac6]">{formatReportAmount(transaction.runningBalance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <ReportEmptyState group="Financial Reports" title="No matching ledger movements" description={cashEquivalentTransactions.length ? "No transactions match the active column filters. Clear a filter to see the ledger movements." : "This ledger has no posted transactions in the selected date range."} compact />}
              </div>
              <div className="flex justify-end border-t border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
                <button type="button" className="rounded-[8px] border border-[#d7e1ed] bg-white px-4 py-2 text-xs font-semibold text-[#334865] hover:bg-[#f2f6fb]" onClick={() => setSelectedCashEquivalentLedger(null)}>Close</button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <InvoiceRegisterViewDialog
        invoice={selectedRegisterInvoice}
        onClose={() => setSelectedRegisterInvoice(null)}
        onBack={selectedCashEquivalentLedger ? () => setSelectedRegisterInvoice(null) : undefined}
      />
    </div>
  );
}

function ProfitLossDetailPage({ detail, onBack, onOpenVoucher, onOpenProduct }: {
  detail: ProfitLossDetail;
  onBack: () => void;
  onOpenVoucher: (voucher: VoucherRecord) => void;
  onOpenProduct: (itemId: string) => void;
}) {
  const products = Array.from(
    detail.vouchers.reduce((items, voucher) => {
      for (const item of voucher.inventoryItems ?? []) {
        const key = item.inventoryItemId ?? item.itemName;
        const current = items.get(key) ?? { id: item.inventoryItemId, name: item.itemName, unit: "", quantity: 0, amount: 0 };
        current.quantity += Number(item.quantity || 0);
        current.amount = sumMoney([current.amount, Number(item.quantity || 0) * Number(item.unitPrice || 0)]);
        items.set(key, current);
      }
      return items;
    }, new Map<string, { id?: string | null; name: string; unit: string; quantity: number; amount: number }>()),
  ).map(([, item]) => item).sort((left, right) => right.amount - left.amount);

  return (
    <div className="flex min-h-full w-full flex-col space-y-5">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-[#155fc0] hover:underline">← Back to Profit & Loss</button>
      <div className="flex min-h-[calc(100vh-250px)] flex-1 flex-col overflow-hidden rounded-[12px] border border-[#dbe4ef] bg-white shadow-sm">
        <div className="border-b border-[#dbe4ef] bg-[#f7faff] px-6 py-5">
          <div className="text-xl font-semibold text-[#25365b]">{detail.label}</div>
          <div className="mt-1 text-sm text-[#60718a]">{detail.calculation}</div>
          <div className="mt-4 text-2xl font-semibold tabular-nums text-[#155fc0]">{formatReportAmount(detail.amount)}</div>
        </div>
        <div className="flex-1 p-5">
          {detail.formula?.length ? (
            <div className="mb-6">
              <div className="mb-3 text-sm font-semibold text-[#25365b]">Calculation</div>
              <div className="max-w-[560px] overflow-hidden rounded-lg border border-[#dbe4ef]">
                {detail.formula.map((line) => (
                  <div
                    key={line.label}
                    className={cn(
                      "grid grid-cols-[1fr_170px] gap-3 px-4 py-3 text-sm",
                      line.total
                        ? "border-t-2 border-[#cfd9e8] bg-[#f7faff] font-semibold text-[#172b4d]"
                        : "border-t border-[#edf1f6] text-[#324766] first:border-t-0",
                    )}
                  >
                    <span>{line.label}</span>
                    <span className="text-right tabular-nums">{formatReportAmount(line.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {detail.ledgerBreakdown?.length ? (
            <div className="mb-6">
              <div className="mb-3 text-sm font-semibold text-[#25365b]">Chart of Accounts Ledger Breakdown ({detail.ledgerBreakdown.length})</div>
              <div className="overflow-hidden rounded-lg border border-[#dbe4ef]">
                <div className="grid grid-cols-[1fr_150px] gap-3 bg-[#f7f7f8] px-4 py-2.5 text-xs font-semibold text-[#60718a]"><span>Ledger</span><span className="text-right">Amount</span></div>
                {detail.ledgerBreakdown.map((line) => (
                  <div key={line.label} className="grid w-full grid-cols-[1fr_150px] gap-3 border-t border-[#edf1f6] px-4 py-3 text-sm text-[#324766]">
                    <span className="font-medium text-[#25365b]">{line.label}</span>
                    <span className="text-right tabular-nums">{formatReportAmount(line.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {products.length && !detail.formula?.length ? (
            <div className="mb-6">
              <div className="mb-3 text-sm font-semibold text-[#25365b]">Products ({products.length})</div>
              <div className="overflow-hidden rounded-lg border border-[#dbe4ef]">
                <div className="grid grid-cols-[1fr_120px_150px] gap-3 bg-[#f7f7f8] px-4 py-2.5 text-xs font-semibold text-[#60718a]"><span>Product</span><span className="text-right">Quantity</span><span className="text-right">Amount</span></div>
                {products.map((product) => (
                  <button key={`${product.id ?? product.name}`} type="button" disabled={!product.id} onClick={() => product.id && onOpenProduct(product.id)} className="grid w-full grid-cols-[1fr_120px_150px] gap-3 border-t border-[#edf1f6] px-4 py-3 text-left text-sm text-[#324766] transition-colors hover:bg-[#edf5ff] disabled:cursor-default disabled:hover:bg-white">
                    <span className={product.id ? "font-medium text-[#155fc0] underline decoration-dotted underline-offset-4" : "font-medium text-[#25365b]"}>{product.name}</span>
                    <span className="text-right tabular-nums">{formatNumber(product.quantity)} {product.unit}</span>
                    <span className="text-right tabular-nums">{formatReportAmount(product.amount)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mb-3 text-sm font-semibold text-[#25365b]">Related vouchers ({detail.vouchers.length})</div>
          {detail.vouchers.length ? (
            <div className="overflow-hidden rounded-lg border border-[#dbe4ef]">
              <div className="grid grid-cols-[110px_1fr_130px] gap-3 bg-[#f7f7f8] px-4 py-2.5 text-xs font-semibold text-[#60718a]">
                <span>Date</span><span>Voucher / Party</span><span className="text-right">Amount</span>
              </div>
              {detail.vouchers.map((voucher) => (
                <button type="button" onClick={() => onOpenVoucher(voucher)} key={voucher.id} className="grid w-full grid-cols-[110px_1fr_130px] gap-3 border-t border-[#edf1f6] px-4 py-3 text-left text-sm text-[#324766] transition-colors hover:bg-[#edf5ff]">
                  <span>{formatDate(voucher.voucherDate)}</span>
                  <span className="min-w-0"><span className="font-medium text-[#155fc0] underline decoration-dotted underline-offset-4">{voucher.voucherNumber}</span>{voucher.partyName ? <span className="block truncate text-xs text-[#718098]">{voucher.partyName}</span> : null}</span>
                  <span className="text-right tabular-nums">{formatReportAmount(Number(voucher.amount || 0))}</span>
                </button>
              ))}
            </div>
          ) : <div className="rounded-lg border border-dashed border-[#dbe4ef] px-4 py-4"><ReportEmptyState group="Financial Reports" title="No direct vouchers" description="This is a calculated balance and has no direct voucher rows to display." compact /></div>}
        </div>
      </div>
    </div>
  );
}

function InvoiceRegisterViewDialog({ invoice, onClose, onBack }: { invoice: VoucherRecord | null; onClose: () => void; onBack?: () => void }) {
  const router = useRouter();
  const { mode } = useSessionContext();
  if (!invoice) return null;
  const isPurchaseInvoice = invoice.voucherType === "purchase";
  const isReceiptVoucher = invoice.voucherType === "receipt";
  const isPaymentVoucher = invoice.voucherType === "payment";
  const isSalesReturn = invoice.voucherType === "credit-note";
  const isPurchaseReturn = invoice.voucherType === "debit-note";
  const isReturnVoucher = isSalesReturn || isPurchaseReturn;
  const isCashVoucher = isReceiptVoucher || isPaymentVoucher;
  const items = invoice.inventoryItems ?? [];
  const isLedgerDetailVoucher = isCashVoucher || items.length === 0;
  const invoiceLabel = isReceiptVoucher
    ? "Receipt Voucher"
    : isPaymentVoucher
      ? "Payment Voucher"
      : isSalesReturn
        ? "Sales Return"
        : isPurchaseReturn
          ? "Purchase Return"
          : isPurchaseInvoice
            ? "Purchase Bill"
            : invoice.voucherType === "sales"
              ? "Sales Invoice"
              : `${invoice.voucherType.replace(/-/g, " ")} Voucher`;
  const subtotal = invoice.subtotal ?? sumMoney(items.map((item) => Number(item.quantity || 0) * Number(item.unitPrice || 0)));
  const discount = Number(invoice.discountAmount || 0);

  async function shareInvoice() {
    const url = `${window.location.origin}${buildVoucherRoute(mode, invoice!.voucherType)}?edit=${encodeURIComponent(invoice!.id)}`;
    const text = `${invoiceLabel} ${invoice!.voucherNumber}\n${invoice!.partyName || (isPurchaseInvoice || isPurchaseReturn ? "Supplier" : isReceiptVoucher ? "Received From" : isPaymentVoucher ? "Paid To" : "Customer")}\n${formatReportAmount(Number(invoice!.amount || 0))}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: invoice!.voucherNumber, text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast.success("Invoice details copied to clipboard");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Invoice could not be shared");
    }
  }

  async function printFullInvoice() {
    try {
      await printInvoice(buildInvoiceExportPayloadFromVoucher(mode, invoice!));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invoice could not be printed");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(95vw,780px)] max-w-[780px] overflow-hidden rounded-[12px] border border-[#dbe4ef] p-0 shadow-[0_24px_70px_rgba(15,23,42,0.2)]">
        <div className="border-b border-[#e2e8f0] bg-white px-6 py-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2563eb]">{invoiceLabel} · View only</div>
          <DialogTitle className="mt-1 text-[20px] font-semibold text-[#203653]">{invoice.voucherNumber}</DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-[#6d7b94]">{invoice.partyName || "Walk-in Customer"} · {formatDate(invoice.voucherDate)}</DialogDescription>
        </div>

        <div className="grid grid-cols-2 gap-3 px-6 py-4 sm:grid-cols-4">
          {[
            [isPurchaseInvoice || isPurchaseReturn ? "Supplier" : isReceiptVoucher ? "Received From" : isPaymentVoucher ? "Paid To" : invoice.voucherType === "sales" || isSalesReturn ? "Customer" : "Particulars", invoice.partyName || invoice.particulars || "-"],
            ["Date", formatDate(invoice.voucherDate)],
            ["Status", invoice.status],
            [isReceiptVoucher ? "Receipt Amount" : isPaymentVoucher ? "Payment Amount" : isReturnVoucher ? "Return Amount" : isLedgerDetailVoucher ? "Transaction Amount" : "Invoice Total", formatReportAmount(Number(invoice.amount || 0))],
          ].map(([label, value], index) => (
            <div key={label} className={cn("rounded-lg p-3", index === 3 ? "bg-[#eaf3ff]" : "bg-[#f7f9fc]") }>
              <div className="text-[11px] text-[#74839b]">{label}</div>
              <div className={cn("mt-1 truncate text-sm font-semibold capitalize", index === 3 ? "text-[#155fc0]" : "text-[#25365b]")}>{value}</div>
            </div>
          ))}
        </div>

        {isLedgerDetailVoucher ? (
          <div className="mx-6 mb-4 overflow-hidden rounded-[9px] border border-[#dbe4ef]">
            <div className="grid grid-cols-[minmax(0,1fr)_120px_120px] bg-[#f4f7fb] px-4 py-2.5 text-[12px] font-semibold text-[#62728b]">
              <div>Ledger / Allocation</div><div className="text-right">Debit</div><div className="text-right">Credit</div>
            </div>
            <div className="max-h-[260px] overflow-y-auto">
              {invoice.lines.map((line) => (
                <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_120px_120px] items-center border-t border-[#edf1f6] px-4 py-3 text-[13px] text-[#25365b]">
                  <div className="min-w-0"><div className="truncate font-medium" title={line.ledger}>{line.ledger}</div>{line.description ? <div className="mt-0.5 truncate text-[11px] text-[#8090a7]">{line.description}</div> : null}</div>
                  <div className="text-right tabular-nums">{Number(line.debit || 0) ? formatReportAmount(Number(line.debit)) : "-"}</div>
                  <div className="text-right tabular-nums">{Number(line.credit || 0) ? formatReportAmount(Number(line.credit)) : "-"}</div>
                </div>
              ))}
            </div>
          </div>
        ) : <div className="mx-6 mb-4 overflow-hidden rounded-[9px] border border-[#dbe4ef]">
          <div className="grid grid-cols-[minmax(0,1fr)_58px_105px_115px] bg-[#f4f7fb] px-4 py-2.5 text-[12px] font-semibold text-[#62728b]">
            <div>Item Details</div><div className="text-right">Qty</div><div className="text-right">Rate</div><div className="text-right">Total</div>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {items.length ? items.map((item, index) => {
              const lineTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0);
              return (
                <div key={item.id || `${item.itemName}-${index}`} className="grid grid-cols-[minmax(0,1fr)_58px_105px_115px] items-center border-t border-[#edf1f6] px-4 py-3 text-[13px] text-[#25365b]">
                  <div className="min-w-0">
                    <div className="truncate font-medium" title={item.itemName}>{item.itemName}</div>
                    {item.warehouse?.name ? <div className="mt-0.5 truncate text-[11px] text-[#8090a7]">Warehouse: {item.warehouse.name}</div> : null}
                  </div>
                  <div className="text-right tabular-nums">{formatNumber(Number(item.quantity || 0))}</div>
                  <div className="text-right tabular-nums">{formatReportAmount(Number(item.unitPrice || 0))}</div>
                  <div className="text-right font-semibold tabular-nums">{formatReportAmount(lineTotal)}</div>
                </div>
              );
            }) : <ReportEmptyState group="Inventory Reports" title="No item details recorded" description="This voucher does not contain inventory item lines." compact />}
          </div>
        </div>}

        {isLedgerDetailVoucher ? (
          <div className="mx-6 mb-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-[9px] border border-[#dbe4ef] bg-[#fbfcff] p-4 text-sm">
            <div><div className="text-xs text-[#74839b]">Reference</div><div className="mt-1 font-medium text-[#25365b]">{invoice.reference || "-"}</div></div>
            <div><div className="text-xs text-[#74839b]">Settlement</div><div className="mt-1 font-medium capitalize text-[#25365b]">{invoice.settlementMode?.replace(/-/g, " ") || "-"}</div></div>
            <div className="col-span-2"><div className="text-xs text-[#74839b]">Narration</div><div className="mt-1 font-medium text-[#25365b]">{invoice.narration || "-"}</div></div>
            <div className="col-span-2 flex justify-between border-t border-[#dbe4ef] pt-3 font-bold text-[#203653]"><span>{isPaymentVoucher ? "Total Paid" : isReceiptVoucher ? "Total Received" : "Transaction Total"}</span><span>{formatReportAmount(Number(invoice.amount || 0))}</span></div>
          </div>
        ) : <div className="mx-6 mb-6 ml-auto w-[min(100%,330px)] space-y-2 rounded-[9px] border border-[#dbe4ef] bg-[#fbfcff] p-4 text-sm">
          <div className="flex justify-between text-[#697991]"><span>Subtotal</span><span>{formatReportAmount(Number(subtotal))}</span></div>
          {moneyToMinorUnits(discount) > 0 ? <div className="flex justify-between text-[#d15d24]"><span>Discount</span><span>-{formatReportAmount(discount)}</span></div> : null}
          <div className="flex justify-between border-t border-[#dbe4ef] pt-2 font-bold text-[#203653]"><span>{isReturnVoucher ? "Return Total" : "Grand Total"}</span><span>{formatReportAmount(Number(invoice.amount || 0))}</span></div>
        </div>}
        <div className={cn("flex items-center gap-2 border-t border-[#e2e8f0] bg-[#fbfcff] px-6 py-4", onBack ? "justify-between" : "justify-end")}>
          {onBack ? (
            <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md border border-[#cfd9e7] bg-white px-4 text-sm font-semibold text-[#34435f] transition hover:bg-[#eef4fb]" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" /> Back to Ledger
            </button>
          ) : null}
          <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#2563eb] px-4 text-sm font-semibold text-white transition hover:bg-[#1d55c7]"
            onClick={() => {
              onClose();
              if (invoice.voucherType === "contra") {
                router.push(`${buildWorkspaceRoute(mode, "/utilities/bank-transfers")}?edit=${encodeURIComponent(invoice.id)}`);
                return;
              }
              const adjustmentMode = invoice.voucherType === "journal" ? "&adjustment=1" : "";
              router.push(`${buildVoucherRoute(mode, invoice.voucherType)}?edit=${encodeURIComponent(invoice.id)}${adjustmentMode}`);
            }}
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#cfd9e7] bg-white px-4 text-sm font-semibold text-[#34435f] transition hover:bg-[#f3f6fa]"
            onClick={() => void shareInvoice()}
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#cfd9e7] bg-white px-4 text-sm font-semibold text-[#34435f] transition hover:bg-[#f3f6fa]"
            onClick={() => void printFullInvoice()}
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Header, event rows and item rows all share this template so every column
// stays aligned down the whole statement.
const billLedgerGrid = "grid grid-cols-[0.6fr_0.7fr_1fr_2.4fr_0.8fr_0.8fr_0.9fr] items-start gap-3";

function BillReportDetailDialog({ detail, onClose, onOpenVoucher }: {
  detail: BillReportDetail | null;
  onClose: () => void;
  onOpenVoucher: (voucherId: string, voucherType: VoucherType) => void;
}) {
  if (!detail) return null;
  // What the company is actually left holding — and actually owes for — once
  // returns are netted off the bill. Derived from the events already on screen
  // (the bill adds stock, a return gives it back), so it needs no extra data and
  // cannot drift from the rows above it. Rate is the effective rate after
  // netting, which differs from the bill rate only if a return was priced
  // differently. Shown only when something was actually returned; with no return
  // the net is the bill itself and the table would just repeat it.
  const hasReturns = detail.events.some((event) => event.type !== "Bill Created" && event.items.length > 0);
  const netItems = hasReturns
    ? Array.from(
        detail.events
          .reduce((totals, event) => {
            const sign = event.type === "Bill Created" ? 1 : -1;
            for (const item of event.items) {
              const key = item.itemId ?? item.name;
              const current = totals.get(key) ?? { name: item.name, warehouse: item.warehouse, quantity: 0, amount: 0 };
              current.quantity += sign * item.quantity;
              current.amount = sumMoney([current.amount, sign * item.amount]);
              totals.set(key, current);
            }
            return totals;
          }, new Map<string, { name: string; warehouse: string; quantity: number; amount: number }>())
          .values(),
      ).filter((row) => Math.abs(row.quantity) > 0.0001 || moneyToMinorUnits(row.amount) !== 0)
    : [];
  const netQuantity = netItems.reduce((total, row) => total + row.quantity, 0);
  const netAmount = sumMoney(netItems.map((row) => row.amount));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Near-full-screen: a bill's payment history can run to many events, so
          the header stays pinned while only the body scrolls. */}
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,1080px)] max-w-[1080px] flex-col overflow-hidden rounded-[12px] border border-[#dbe4ef] p-0 shadow-[0_24px_70px_rgba(15,23,42,0.2)]">
        <div className="shrink-0 border-b border-[#e2e8f0] bg-[#fbfcff] px-7 py-5">
          <DialogTitle className="text-[26px] font-semibold text-[#203653]">{detail.voucherNumber}</DialogTitle>
          <DialogDescription className="mt-1.5 text-[15px] text-[#6d7b94]">{detail.type} · {detail.party}</DialogDescription>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Returned/Advance are shown only when there is one, because Balance is
              Bill less Paid (which already includes any Order-level advance) AND
              less Returned — with either hidden the figures visibly fail to
              reconcile (a 255,000 bill with nothing paid sitting at a 130,000
              balance). Advance is broken out of Paid purely so it's visible where
              that money actually came from — it is already folded into Paid. */}
          <div className={cn(
            "grid gap-4 px-7 py-5",
            [detail.returnedAmount, detail.advanceAmount].filter((value) => moneyToMinorUnits(value) > 0).length === 2
              ? "grid-cols-5"
              : [detail.returnedAmount, detail.advanceAmount].some((value) => moneyToMinorUnits(value) > 0)
                ? "grid-cols-4"
                : "grid-cols-3",
          )}>
            <StatementMetric label="Bill Amount" value={detail.billAmount} large />
            {moneyToMinorUnits(detail.advanceAmount) > 0 ? <StatementMetric label="Advance Payment" value={detail.advanceAmount} large /> : null}
            <StatementMetric label="Paid" value={detail.paidAmount} large />
            {moneyToMinorUnits(detail.returnedAmount) > 0 ? <StatementMetric label="Returned" value={detail.returnedAmount} large /> : null}
            <StatementMetric label="Balance" value={detail.balance} accent={moneyToMinorUnits(detail.balance) > 0} large />
          </div>
          <div className="mx-7 mb-6 grid grid-cols-4 gap-x-8 gap-y-4 rounded-[10px] border border-[#dbe4ef] bg-[#fbfcff] p-5">
            <div><div className="text-[13px] text-[#74839b]">Date</div><div className="mt-1.5 text-[15px] font-medium text-[#25365b]">{formatDate(detail.date)}</div></div>
            <div><div className="text-[13px] text-[#74839b]">Status</div><div className="mt-1.5 text-[15px] font-medium text-[#25365b]">{detail.status}</div></div>
            <div><div className="text-[13px] text-[#74839b]">Settlement</div><div className="mt-1.5 text-[15px] font-medium capitalize text-[#25365b]">{detail.settlementMode.replace(/-/g, " ")}</div></div>
            <div><div className="text-[13px] text-[#74839b]">Reference</div><div className="mt-1.5 break-all text-[15px] font-medium text-[#25365b]">{detail.reference}</div></div>
          </div>
          <div className="mx-7 mb-3 flex items-center justify-between">
            <div className="text-[15px] font-semibold text-[#25365b]">Full Details ({detail.events.length})</div>
            <div className="text-[13px] text-[#74839b]">Click a voucher row to open it</div>
          </div>
          <div className="mx-7 mb-7 overflow-hidden rounded-[10px] border border-[#dbe4ef]">
            <div className={cn(billLedgerGrid, "bg-[#f5f8fc] px-5 py-3.5 text-[13px] font-semibold text-[#697791]")}>
              <div>Date</div>
              <div>Event</div>
              <div>Voucher / Reference</div>
              <div>Item</div>
              <div className="text-right">Debit</div>
              <div className="text-right">Credit</div>
              <div className="text-right">Running Balance</div>
            </div>
            {detail.events.map((event, index) => {
              // One receipt can settle several bills at once. In that case the
              // voucher's money legs cover more than this bill's share, and there
              // is no per-ledger record of how the payment was split between
              // bills — so the ledgers are still named, but their amounts are
              // withheld rather than shown against the wrong bill. Amounts print
              // only when the whole voucher belongs to this bill.
              const moneyTotal = sumMoney(event.moneyLines.map((line) => line.amount));
              const moneyFootsToEvent = moneyAmountsEqual(moneyTotal, event.amount);
              return (
              <div key={`${event.voucherNumber}-${event.type}-${index}`} className="border-t border-[#edf1f6] first:border-t-0">
                <button
                  type="button"
                  onClick={() => onOpenVoucher(event.voucherId, event.voucherType)}
                  className={cn(billLedgerGrid, "w-full px-5 py-3.5 text-left text-[15px] text-[#25365b] transition-colors hover:bg-[#edf5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3b82f6]")}
                >
                  <div>{formatDate(event.date)}</div>
                  <div className="font-medium">{event.type}</div>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[#155fc0] underline decoration-dotted underline-offset-4">{event.voucherNumber}</div>
                    <div className="mt-0.5 truncate text-[13px] text-[#74839b]">{event.reference}</div>
                    {/* Only print the settlement here when the Item cell is not
                        already naming the ledgers, so it never appears twice —
                        and never print the "—" placeholder, which a return
                        (no money legs at all) would otherwise leave behind. */}
                    {(() => {
                      const settlement = event.moneyLines.length && !event.items.length ? "" : event.method;
                      const caption = [settlement === "—" ? "" : settlement, event.narration].filter(Boolean).join(" · ");
                      return caption ? <div className="mt-0.5 truncate text-[13px] text-[#8492a8]">{caption}</div> : null;
                    })()}
                  </div>
                  {/* Every stock line the event moved lives inside this one cell,
                      so the statement stays one row per voucher — the Debit /
                      Credit columns then only ever carry the voucher's own total,
                      never a total plus its parts. */}
                  {/* A stock event fills this cell with what moved. A settlement
                      moved money, not goods, so it fills the same cell with the
                      Cash / Bank / MFS ledgers it ran through — this column is the
                      wide one, so a split settlement's ledgers fit here without
                      being cut off the way they were beside the voucher number. */}
                  <div className="min-w-0 space-y-1.5">
                    {event.items.length ? event.items.map((item, itemIndex) => (
                      <div key={`${item.itemId ?? item.name}-${itemIndex}`} className="min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[14px] font-medium text-[#25365b]">{item.name}</span>
                          <span className="shrink-0 text-[14px] tabular-nums text-[#48597a]">{formatReportAmount(item.amount)}</span>
                        </div>
                        <div className="truncate text-[13px] text-[#74839b]">
                          {formatNumber(item.quantity)} × {formatReportAmount(item.unitPrice)}
                          {item.warehouse ? ` · ${item.warehouse}` : ""}
                        </div>
                      </div>
                    )) : event.moneyLines.length ? event.moneyLines.map((line) => (
                      <div key={line.ledger} className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[14px] font-medium text-[#25365b]">{line.ledger}</span>
                        {moneyFootsToEvent ? (
                          <span className="shrink-0 text-[14px] tabular-nums text-[#48597a]">{formatReportAmount(line.amount)}</span>
                        ) : null}
                      </div>
                    )) : <span className="text-[13px] text-[#9aa7ba]">—</span>}
                    {event.moneyLines.length && !moneyFootsToEvent ? (
                      <div className="text-[13px] text-[#9aa7ba]">Voucher settles more than this bill</div>
                    ) : null}
                  </div>
                  <div className="text-right font-semibold tabular-nums">{moneyToMinorUnits(event.debit) > 0 ? formatReportAmount(event.debit) : ""}</div>
                  <div className="text-right font-semibold tabular-nums">{moneyToMinorUnits(event.credit) > 0 ? formatReportAmount(event.credit) : ""}</div>
                  <div className={cn("text-right tabular-nums", moneyToMinorUnits(event.runningBalance) > 0 ? "font-semibold text-[#b4530f]" : "text-[#14804a]")}>
                    {formatReportAmount(event.runningBalance)}
                  </div>
                </button>
              </div>
              );
            })}
          </div>

          {netItems.length ? (
            <div className="mx-7 mb-7">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[15px] font-semibold text-[#25365b]">Net Product (after returns)</div>
                <div className="text-[13px] text-[#74839b]">What is actually kept and payable</div>
              </div>
              <div className="overflow-hidden rounded-[10px] border border-[#dbe4ef]">
                <div className="grid grid-cols-[1.9fr_1.1fr_0.7fr_0.9fr_0.95fr] gap-3 bg-[#f5f8fc] px-5 py-3 text-[13px] font-semibold text-[#697791]">
                  <div>Product</div>
                  <div>Warehouse</div>
                  <div className="text-right">Net Qty</div>
                  <div className="text-right">Rate</div>
                  <div className="text-right">Net Amount</div>
                </div>
                {netItems.map((row) => (
                  <div key={row.name} className="grid grid-cols-[1.9fr_1.1fr_0.7fr_0.9fr_0.95fr] gap-3 border-t border-[#edf1f6] px-5 py-3 text-[15px] text-[#25365b]">
                    <div className="min-w-0 truncate font-medium">{row.name}</div>
                    <div className="min-w-0 truncate text-[14px] text-[#60718a]">{row.warehouse || "—"}</div>
                    <div className="text-right tabular-nums">{formatNumber(row.quantity)}</div>
                    <div className="text-right tabular-nums">
                      {Math.abs(row.quantity) > 0.0001 ? formatReportAmount(row.amount / row.quantity) : "—"}
                    </div>
                    <div className="text-right font-semibold tabular-nums">{formatReportAmount(row.amount)}</div>
                  </div>
                ))}
                <div className="grid grid-cols-[1.9fr_1.1fr_0.7fr_0.9fr_0.95fr] gap-3 border-t-2 border-[#cfd9e8] bg-[#fbfcff] px-5 py-3 text-[15px] font-semibold text-[#172b4d]">
                  <div>Net Total</div>
                  <div />
                  <div className="text-right tabular-nums">{formatNumber(netQuantity)}</div>
                  <div />
                  <div className="text-right tabular-nums">{formatReportAmount(netAmount)}</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OperationalReportDetailDialog({
  detail,
  onClose,
  onOpenVoucher,
}: {
  detail: OperationalReportRowDetail | null;
  onClose: () => void;
  onOpenVoucher: (voucherId: string) => void;
}) {
  if (!detail) return null;
  const isAuditDetail = detail.group.includes("Audit");
  const DetailIcon = detail.group.includes("Banking")
    ? Landmark
    : detail.group.includes("Tax")
      ? ReceiptText
      : detail.group.includes("Order")
        ? ShoppingCart
        : detail.group.includes("Audit")
          ? ShieldCheck
          : BarChart3;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn("overflow-hidden rounded-[10px] border border-[#dbe4ef] p-0 shadow-[0_24px_70px_rgba(15,23,42,0.2)]", isAuditDetail ? "w-[min(94vw,900px)] max-w-[900px]" : "w-[min(94vw,720px)] max-w-[720px]")}>
        <div className="flex items-center gap-3 border-b border-[#dbe4ef] bg-[#f7faff] px-5 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e8f2ff] text-[#2563b9]"><DetailIcon className="h-5 w-5" /></span>
          <div className="min-w-0"><DialogTitle className="truncate text-[19px] font-semibold text-[#203653]">{detail.title}</DialogTitle><DialogDescription className="mt-1 text-[13px] text-[#6d7b94]">Details from {detail.reportTitle}</DialogDescription></div>
        </div>
        <div className="grid max-h-[440px] grid-cols-1 gap-3 overflow-y-auto px-5 py-5 sm:grid-cols-2">
          {detail.fields.map((field) => (
            <div key={field.label} className={cn("min-w-0 rounded-[8px] border border-[#dbe4ef] bg-white px-4 py-3", isAuditDetail && field.label === "Details" ? "sm:col-span-2" : "")}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#74839b]">{field.label}</div>
              <div className={cn("mt-1 text-[14px] font-semibold text-[#25365b]", isAuditDetail && field.label === "Details" ? "whitespace-pre-wrap break-words leading-6" : "truncate")} title={field.value}>{field.value}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#dbe4ef] bg-[#f7faff] px-5 py-3">
          <button type="button" className="rounded-md border border-[#cfd9e8] bg-white px-4 py-2 text-[13px] font-semibold text-[#465a78] transition hover:bg-[#f3f6fa]" onClick={onClose}>Close</button>
          {detail.voucherId ? <button type="button" className="rounded-md bg-[#2563eb] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1d4ed8]" onClick={() => onOpenVoucher(detail.voucherId!)}>Open Source Voucher</button> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseReportDetailDialog({
  detail,
  onClose,
  onOpenVoucher,
}: {
  detail: ExpenseReportRowDetail | null;
  onClose: () => void;
  onOpenVoucher: (voucherId: string) => void;
}) {
  if (!detail) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(94vw,680px)] max-w-[680px] overflow-hidden rounded-[10px] border border-[#eadfd5] p-0 shadow-[0_24px_70px_rgba(15,23,42,0.2)]">
        <div className="border-b border-[#eadfd5] bg-[#fffaf5] px-5 py-4">
          <DialogTitle className="text-[19px] font-semibold text-[#203653]">{detail.title}</DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-[#6d7b94]">Details from {detail.reportTitle}</DialogDescription>
        </div>
        <div className="grid max-h-[420px] grid-cols-1 gap-3 overflow-y-auto px-5 py-5 sm:grid-cols-2">
          {detail.fields.map((field) => (
            <div key={field.label} className="min-w-0 rounded-[8px] border border-[#eadfd5] bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a7768]">{field.label}</div>
              <div className="mt-1 truncate text-[14px] font-semibold text-[#25365b]" title={field.value}>{field.value}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#eadfd5] bg-[#fffaf5] px-5 py-3">
          <button type="button" className="rounded-md border border-[#d9cfc6] bg-white px-4 py-2 text-[13px] font-semibold text-[#5d5148] transition hover:bg-[#faf5f0]" onClick={onClose}>Close</button>
          {detail.voucherId ? (
            <button type="button" className="rounded-md bg-[#eb6b20] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#d85d15]" onClick={() => onOpenVoucher(detail.voucherId!)}>
              Open Expense Voucher
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InventoryReportDetailDialog({
  detail,
  onClose,
  onOpenInventory,
}: {
  detail: InventoryReportRowDetail | null;
  onClose: () => void;
  onOpenInventory: (itemId?: string) => void;
}) {
  if (!detail) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(94vw,680px)] max-w-[680px] overflow-hidden rounded-[10px] border border-[#dbe4ef] p-0 shadow-[0_24px_70px_rgba(15,23,42,0.2)]">
        <div className="border-b border-[#e2e8f0] bg-[#fbfcff] px-5 py-4">
          <DialogTitle className="text-[19px] font-semibold text-[#203653]">{detail.title}</DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-[#6d7b94]">
            Details from {detail.reportTitle}
          </DialogDescription>
        </div>
        <div className="grid max-h-[420px] grid-cols-1 gap-3 overflow-y-auto px-5 py-5 sm:grid-cols-2">
          {detail.fields.map((field) => (
            <div key={field.label} className="min-w-0 rounded-[8px] border border-[#e0e7f0] bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#74839b]">{field.label}</div>
              <div className="mt-1 truncate text-[14px] font-semibold text-[#25365b]" title={field.value}>{field.value}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e2e8f0] bg-[#fbfcff] px-5 py-3">
          <button type="button" className="rounded-md border border-[#cfd9e8] bg-white px-4 py-2 text-[13px] font-semibold text-[#465a78] transition hover:bg-[#f3f6fa]" onClick={onClose}>
            Close
          </button>
          <button type="button" className="rounded-md bg-[#2563eb] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1d4ed8]" onClick={() => onOpenInventory(detail.itemId)}>
            {detail.itemId ? "Open Inventory Item" : "Open Inventory"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PartyStatementDetailDialog({
  detail,
  onClose,
  onOpenLedger,
}: {
  detail: PartyStatementDetail | null;
  onClose: () => void;
  onOpenLedger: (detail: PartyStatementDetail) => void;
}) {
  if (!detail) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(94vw,760px)] max-w-[760px] overflow-hidden rounded-[10px] border border-[#dbe4ef] p-0 shadow-[0_24px_70px_rgba(15,23,42,0.2)]">
        <div className="border-b border-[#e2e8f0] bg-[#fbfcff] px-5 py-4">
          <DialogTitle className="text-[19px] font-semibold text-[#203653]">{detail.name}</DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-[#6d7b94]">
            {detail.type === "supplier" ? "Supplier payable statement" : "Customer receivable statement"}{detail.contact ? ` · ${detail.contact}` : ""}{detail.outstandingDocuments ? ` · Credit period: ${detail.maturityDays} days` : ""}
          </DialogDescription>
        </div>

        <div className="grid grid-cols-3 gap-3 px-5 py-4">
          <StatementMetric label="Opening Balance" value={detail.openingBalance} />
          <StatementMetric label="Period Movement" value={detail.movement} />
          <StatementMetric label="Closing Balance" value={detail.closingBalance} accent />
        </div>

        <div className="mx-5 mb-5 overflow-hidden rounded-[8px] border border-[#dbe4ef]">
          {detail.outstandingDocuments ? (
            <>
              <div className="grid grid-cols-[0.85fr_1.25fr_0.9fr_1fr_1fr_0.65fr] bg-[#f5f8fc] px-3 py-2.5 text-[12px] font-semibold text-[#697791]">
                <div>Date</div><div>{detail.type === "supplier" ? "Purchase Bill" : "Sales Invoice"}</div><div>Type</div><div className="text-right">Bill Amount</div><div className="text-right">Outstanding</div><div className="text-right">Age</div>
              </div>
              {detail.outstandingDocuments.length ? detail.outstandingDocuments.map((document) => (
                <div key={document.id} className="grid grid-cols-[0.85fr_1.25fr_0.9fr_1fr_1fr_0.65fr] border-t border-[#edf1f6] px-3 py-2.5 text-[13px] text-[#25365b]">
                  <div>{formatDate(document.date)}</div>
                  <div className="font-medium text-[#2563eb]">{document.voucherNumber}</div>
                  <div className="text-[#60718a]">{detail.type === "supplier" ? "Purchase" : "Sales"}</div>
                  <div className="text-right tabular-nums">{formatReportAmount(document.amount)}</div>
                  <div className="text-right font-semibold tabular-nums">{formatReportAmount(document.outstanding)}</div>
                  <div className={cn("text-right font-semibold tabular-nums", document.overdue ? "text-[#dc2626]" : "text-[#596b85]")}>{document.ageDays}d</div>
                </div>
              )) : <ReportEmptyState group="Customer & Supplier Reports" title="No outstanding bills" description="All bills for this party are settled within the selected report date." compact />}
            </>
          ) : (
            <>
              <div className="grid grid-cols-[0.8fr_1.05fr_0.9fr_0.55fr_0.75fr_0.75fr_0.85fr] bg-[#f5f8fc] px-3 py-2.5 text-[12px] font-semibold text-[#697791]">
                <div>Date</div><div>Voucher</div><div>Type</div><div className="text-right">Age</div><div className="text-right">Debit</div><div className="text-right">Credit</div><div className="text-right">Balance</div>
              </div>
              {detail.transactions.length ? detail.transactions.map((transaction) => (
                <div key={transaction.id} className="grid grid-cols-[0.8fr_1.05fr_0.9fr_0.55fr_0.75fr_0.75fr_0.85fr] border-t border-[#edf1f6] px-3 py-2.5 text-[13px] text-[#25365b]">
                  <div>{formatDate(transaction.date)}</div><div className="font-medium">{transaction.voucherNumber}</div><div className="capitalize text-[#60718a]">{transaction.voucherType === "debit-note" ? "Purchase Return" : transaction.voucherType.replace(/-/g, " ")}</div><div className="text-right font-medium text-[#596b85]">{transaction.ageDays === null ? "—" : `${transaction.ageDays}d`}</div><div className="text-right">{formatReportAmount(transaction.debit)}</div><div className="text-right">{formatReportAmount(transaction.credit)}</div><div className="text-right font-semibold">{formatReportAmount(transaction.runningBalance)}</div>
                </div>
              )) : <ReportEmptyState group="Customer & Supplier Reports" title="No party transactions" description="No transactions were found for this party in the selected period." compact />}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e2e8f0] bg-[#fbfcff] px-5 py-3">
          <button type="button" className="rounded-md border border-[#cfd9e8] bg-white px-4 py-2 text-[13px] font-semibold text-[#465a78] transition hover:bg-[#f3f6fa]" onClick={onClose}>
            Close
          </button>
          <button type="button" className="rounded-md bg-[#2563eb] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1d4ed8]" onClick={() => onOpenLedger(detail)}>
            Open {detail.type === "customer" ? "Customer" : "Supplier"} Ledger
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// `large` is used by the full-screen bill dialog, where the compact sizing reads
// as too small against the wider layout.
function StatementMetric({ label, value, accent = false, large = false }: { label: string; value: number; accent?: boolean; large?: boolean }) {
  return (
    <div className={cn("rounded-[10px] border", large ? "px-5 py-4" : "px-4 py-3", accent ? "border-[#bdebd4] bg-[#f1fbf6]" : "border-[#e0e7f0] bg-white")}>
      <div className={cn("font-medium text-[#74839b]", large ? "text-[13px]" : "text-[12px]")}>{label}</div>
      <div className={cn("mt-1 font-semibold tabular-nums", large ? "text-[24px]" : "text-[16px]", accent ? "text-[#14804a]" : "text-[#25365b]")}>{formatReportAmount(value)}</div>
    </div>
  );
}

function formatClosingBalance(value: number) {
  const normalized = roundMoney(value);
  const minorUnits = moneyToMinorUnits(normalized);
  return `${formatReportAmount(Math.abs(normalized))} ${minorUnits > 0 ? "Dr" : minorUnits < 0 ? "Cr" : ""}`.trim();
}

function formatActivityDateTime(value: string | Date) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value || "-");

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}/${part("year")} ${part("hour")}:${part("minute")} ${part("dayPeriod").toUpperCase()}`;
}

export function selectTrialBalanceAccountCandidate<T extends { id: string }>(
  candidates: Array<{ node: T; pathKey: string }>,
  groupKey: string,
) {
  if (candidates.length <= 1) return candidates[0]?.node;
  const wantsPayable = groupKey.includes("sundry creditor") || groupKey.includes("payable") || groupKey.includes("supplier");
  const wantsReceivable = groupKey.includes("sundry debtor") || groupKey.includes("receivable") || groupKey.includes("customer");
  const matched = candidates.find(({ pathKey }) =>
    wantsPayable
      ? pathKey.includes("payable") || pathKey.includes("supplier")
      : wantsReceivable
        ? pathKey.includes("receivable") || pathKey.includes("customer")
        : false,
  );
  return matched?.node ?? candidates[0]?.node;
}

function TrialBalanceAccountTree({ rows }: { rows: TrialBalanceView["rows"] }) {
  // Historical balances must retain their exact Account-id node even after a
  // Party is archived and its managed ledger becomes inactive.
  const treeQuery = useAccountTreeQuery(true, true);
  const [viewLevel, setViewLevel] = useState<"class" | "category" | "ledger">("class");
  const tree = treeQuery.data ?? [];
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const accountNames = new Set<string>();
  const accountNodesByName = new Map<string, Array<{ node: AccountNode; pathKey: string }>>();
  const accountNodesById = new Map<string, AccountNode>();
  const visibleNodes: Array<{ node: AccountNode; depth: number }> = [];

  function indexNode(node: AccountNode, depth: number, parentPath = "") {
    accountNodesById.set(node.id, node);
    const nameKey = normalize(node.name);
    const pathKey = `${parentPath} ${nameKey}`.trim();
    accountNames.add(nameKey);
    const namedNodes = accountNodesByName.get(nameKey) ?? [];
    namedNodes.push({ node, pathKey });
    accountNodesByName.set(nameKey, namedNodes);
    if ((viewLevel === "class" && node.level === "MAIN_CATEGORY") || (viewLevel === "category" && node.level === "CATEGORY") || (viewLevel === "ledger" && node.level === "LEDGER")) {
      visibleNodes.push({ node, depth });
    }
    node.children.forEach((child) => indexNode(child, depth + 1, pathKey));
  }

  tree.forEach((node) => indexNode(node, 0));
  const balances = new Map<string, { openingBalance: number; debit: number; credit: number; closingBalance: number }>();
  const unmatchedRows: TrialBalanceView["rows"] = [];
  const directCategoryRows: TrialBalanceView["rows"] = [];
  const addBalance = (key: string, openingBalance: number, debit: number, credit: number, closingBalance: number) => {
    const current = balances.get(key) ?? { openingBalance: 0, debit: 0, credit: 0, closingBalance: 0 };
    balances.set(key, {
      openingBalance: sumMoney([current.openingBalance, openingBalance]),
      debit: sumMoney([current.debit, debit]),
      credit: sumMoney([current.credit, credit]),
      closingBalance: sumMoney([current.closingBalance, closingBalance]),
    });
  };

  const resolveAccountNode = (nameKey: string, groupKey = "") => {
    const candidates = accountNodesByName.get(nameKey) ?? [];
    return selectTrialBalanceAccountCandidate(candidates, groupKey);
  };

  rows.forEach((row) => {
    const ledgerKey = normalize(row.ledger);
    const groupKey = normalize(row.group);
    let targetNode = row.accountId ? accountNodesById.get(row.accountId) : resolveAccountNode(ledgerKey, groupKey);
    if (!row.accountId) {
      if (!targetNode && ledgerKey === normalize("Purchase Bill Pending")) {
        const grniKey = normalize("Goods Received Not Invoiced (GRNI)");
        targetNode = resolveAccountNode(grniKey, groupKey);
      }
      if (!targetNode && (groupKey.includes("sundry debtor") || groupKey.includes("receivable"))) targetNode = resolveAccountNode(normalize("Accounts Receivable Control"), groupKey);
      if (!targetNode && (groupKey.includes("sundry creditor") || groupKey.includes("payable"))) targetNode = resolveAccountNode(normalize("Accounts Payable Control"), groupKey);
      if (!targetNode) targetNode = resolveAccountNode(groupKey, groupKey);
    }

    if (targetNode) {
      addBalance(targetNode.id, row.openingBalance, row.debit, row.credit, row.closingBalance);
      // Some protected COA heads (for example Sales Return) are deliberately
      // fixed categories, not user ledgers. Their direct system postings must
      // still remain visible in Ledger view instead of disappearing merely
      // because the matched COA node is a category.
      if (targetNode.level !== "LEDGER") directCategoryRows.push(row);
    }
    else unmatchedRows.push(row);
  });

  // Older companies can contain postings created before the corresponding
  // control ledgers were added to the chart of accounts. Keep those balances
  // in their proper accounting hierarchy instead of presenting them as
  // "unmapped". Supplier/customer sub-ledgers are deliberately consolidated
  // into their control account, which is how they belong in a trial balance.
  const classifiedLegacyRows = new Map<string, { section: string; ledger: string; openingBalance: number; debit: number; credit: number; closingBalance: number }>();
  const addClassifiedLegacyRow = (section: string, ledger: string, row: TrialBalanceView["rows"][number]) => {
    const key = `${normalize(section)}:${normalize(ledger)}`;
    const current = classifiedLegacyRows.get(key) ?? { section, ledger, openingBalance: 0, debit: 0, credit: 0, closingBalance: 0 };
    classifiedLegacyRows.set(key, {
      ...current,
      openingBalance: sumMoney([current.openingBalance, row.openingBalance]),
      debit: sumMoney([current.debit, row.debit]),
      credit: sumMoney([current.credit, row.credit]),
      closingBalance: sumMoney([current.closingBalance, row.closingBalance]),
    });
  };

  unmatchedRows.forEach((row) => {
    const ledgerKey = normalize(row.ledger);
    const groupKey = normalize(row.group);
    if (row.accountId) {
      addClassifiedLegacyRow("Unmapped Account IDs", `${row.ledger} [${row.accountId}]`, row);
      return;
    }
    let section = "Other Accounts";
    let ledger = row.ledger;
    let categoryKey = "";

    if (groupKey.includes("sundry creditor") || groupKey.includes("payable")) {
      section = "Payables";
      ledger = "Accounts Payable Control";
      categoryKey = normalize("Payables");
    } else if (groupKey.includes("sundry debtor") || groupKey.includes("receivable")) {
      section = "Trade Receivables";
      ledger = "Accounts Receivable Control";
      categoryKey = normalize("Trade Receivables");
    } else if (groupKey.includes("direct expense")) {
      section = "Direct Expenses";
      categoryKey = normalize("Direct Expenses");
    } else if (groupKey.includes("indirect expense") || ledgerKey.includes("expense")) {
      section = "Indirect Expenses";
      categoryKey = normalize("Indirect Expenses");
    }

    if (categoryKey && accountNames.has(categoryKey)) {
      const categoryNode = resolveAccountNode(categoryKey, normalize(section));
      if (categoryNode) addBalance(categoryNode.id, row.openingBalance, row.debit, row.credit, row.closingBalance);
    }
    addClassifiedLegacyRow(section, ledger, row);
  });

  directCategoryRows.forEach((row) => {
    const groupKey = normalize(row.group);
    const section = groupKey.includes("income")
      ? "Income"
      : groupKey.includes("expense")
        ? "Expenses"
        : row.group || "System Categories";
    addClassifiedLegacyRow(section, row.ledger, row);
  });

  const classifiedSections = Array.from(classifiedLegacyRows.values()).reduce((sections, row) => {
    const sectionRows = sections.get(row.section) ?? [];
    sectionRows.push(row);
    sections.set(row.section, sectionRows);
    return sections;
  }, new Map<string, Array<{ section: string; ledger: string; openingBalance: number; debit: number; credit: number; closingBalance: number }>>());

  if (treeQuery.isLoading) {
    return <div className="px-5 py-10 text-center text-sm text-[#6d7b94]">Loading account hierarchy...</div>;
  }

  return (
    <div data-trial-balance-tree className="divide-y divide-[#edf1f7]">
      <div data-trial-balance-view-switcher className="flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-3">
        <div className="text-[13px] font-medium text-[#6d7b94]">Show trial balance by</div>
        <div className="inline-flex rounded-[6px] border border-[#d7dfeb] bg-[#f7f9fc] p-1">
          {(["class", "category", "ledger"] as const).map((level) => (
            <button key={level} type="button" className={cn("rounded-[4px] px-4 py-1.5 text-[13px] font-semibold capitalize transition", viewLevel === level ? "bg-white text-[#1463b8] shadow-sm" : "text-[#6d7b94] hover:text-[#25365b]")} onClick={() => setViewLevel(level)}>
              {level}
            </button>
          ))}
        </div>
      </div>
      {visibleNodes.map(({ node, depth }) => <TrialBalanceTreeNode key={node.id} node={node} depth={viewLevel === "class" ? 0 : Math.max(0, depth - 1)} balances={balances} renderChildren={false} />)}
      {viewLevel === "ledger" ? Array.from(classifiedSections.entries()).map(([section, sectionRows]) => (
        <div key={section}>
          <div data-trial-balance-grid className="grid grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,0.75fr))] bg-[#f8fbff] px-5 py-2.5 text-[13px] font-semibold text-[#52637f] 2xl:grid-cols-[minmax(360px,1fr)_170px_150px_150px_170px]">
            <div className="flex items-center gap-2"><FolderTree className="h-4 w-4" />{section}</div>
            <div />
            <div />
            <div />
            <div />
          </div>
          {sectionRows.map((row) => (
            <div key={`${section}:${row.ledger}`} data-trial-balance-grid className="grid grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,0.75fr))] px-5 py-2.5 text-[14px] 2xl:grid-cols-[minmax(360px,1fr)_170px_150px_150px_170px]">
              <div className="flex min-w-0 items-center gap-2 pl-6 text-[#25365b]">
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#8a9ab2]" />
                <span className="truncate">{row.ledger}</span>
              </div>
              <div className="text-right font-medium text-[#25365b]">{formatClosingBalance(row.openingBalance)}</div>
              <div className="text-right font-medium text-[#25365b]">{formatReportAmount(row.debit)}</div>
              <div className="text-right font-medium text-[#25365b]">{formatReportAmount(row.credit)}</div>
              <div className="text-right font-semibold text-[#25365b]">{formatClosingBalance(row.closingBalance)}</div>
            </div>
          ))}
        </div>
      )) : null}
      {!visibleNodes.length && !(viewLevel === "ledger" && (unmatchedRows.length || directCategoryRows.length)) ? (
        <ReportEmptyState group="Financial Reports" title="No accounts configured" description="Set up the Chart of Accounts to populate the trial balance hierarchy." compact />
      ) : null}
    </div>
  );
}

function TrialBalanceTreeNode({
  node,
  depth,
  balances,
  renderChildren = true,
}: {
  node: AccountNode;
  depth: number;
  balances: Map<string, { openingBalance: number; debit: number; credit: number; closingBalance: number }>;
  renderChildren?: boolean;
}) {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const own = balances.get(node.id) ?? { openingBalance: 0, debit: 0, credit: 0, closingBalance: 0 };
  const total = node.children.reduce(
    (sum, child) => {
      const childTotal = getTrialBalanceNodeTotal(child, balances);
      return {
        openingBalance: sumMoney([sum.openingBalance, childTotal.openingBalance]),
        debit: sumMoney([sum.debit, childTotal.debit]),
        credit: sumMoney([sum.credit, childTotal.credit]),
        closingBalance: sumMoney([sum.closingBalance, childTotal.closingBalance]),
      };
    },
    { ...own },
  );
  const Icon = node.level === "LEDGER" ? BookOpen : FolderTree;
  const displayName = normalize(node.name) === normalize("Goods Received Not Invoiced (GRNI)") ? "Purchase Bill Pending" : node.name;

  return (
    <>
      <div data-trial-balance-grid className={cn("grid grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,0.75fr))] px-5 py-2.5 text-[14px] 2xl:grid-cols-[minmax(360px,1fr)_170px_150px_150px_170px]", node.level === "MAIN_CATEGORY" ? "bg-[#fff4bf] font-bold" : node.level === "LEDGER" ? "bg-white italic" : "bg-white font-semibold")}>
        <div className="flex min-w-0 items-center gap-2 text-[#25365b]" style={{ paddingLeft: `${depth * 24}px` }}>
          <Icon className="h-3.5 w-3.5 shrink-0 text-[#7f91aa]" />
          <span className="truncate">{displayName}</span>
        </div>
        <div className="text-right font-medium text-[#25365b]">{formatClosingBalance(total.openingBalance)}</div>
        <div className="text-right font-medium text-[#25365b]">{formatReportAmount(total.debit)}</div>
        <div className="text-right font-medium text-[#25365b]">{formatReportAmount(total.credit)}</div>
        <div className="text-right font-semibold text-[#25365b]">{formatClosingBalance(total.closingBalance)}</div>
      </div>
      {renderChildren ? node.children.map((child) => <TrialBalanceTreeNode key={child.id} node={child} depth={depth + 1} balances={balances} />) : null}
    </>
  );
}

function getTrialBalanceNodeTotal(
  node: AccountNode,
  balances: Map<string, { openingBalance: number; debit: number; credit: number; closingBalance: number }>,
): { openingBalance: number; debit: number; credit: number; closingBalance: number } {
  return node.children.reduce(
    (sum, child) => {
      const childTotal = getTrialBalanceNodeTotal(child, balances);
      return {
        openingBalance: sumMoney([sum.openingBalance, childTotal.openingBalance]),
        debit: sumMoney([sum.debit, childTotal.debit]),
        credit: sumMoney([sum.credit, childTotal.credit]),
        closingBalance: sumMoney([sum.closingBalance, childTotal.closingBalance]),
      };
    },
    { ...(balances.get(node.id) ?? { openingBalance: 0, debit: 0, credit: 0, closingBalance: 0 }) },
  );
}

function ReportEmptyState({
  group,
  reportSlug,
  title,
  description,
  filtered = false,
  compact = false,
}: {
  group: string;
  reportSlug?: string;
  title: string;
  description: string;
  filtered?: boolean;
  compact?: boolean;
}) {
  const context = `${reportSlug ?? ""} ${title}`.toLowerCase();
  const illustration = (() => {
    if (filtered) return { icon: SearchX, tone: "neutral" } as const;
    if (context.includes("low-stock") || context.includes("low stock")) return { icon: AlertTriangle, tone: "warning" } as const;
    if (context.includes("negative-stock") || context.includes("negative stock")) return { icon: PackageX, tone: "danger" } as const;
    if (context.includes("dead-stock") || context.includes("dead stock")) return { icon: Clock3, tone: "neutral" } as const;
    if (context.includes("reorder")) return { icon: ClipboardList, tone: "blue" } as const;
    if (context.includes("slow-moving") || context.includes("slow moving")) return { icon: Clock3, tone: "warning" } as const;
    if (context.includes("fast-moving") || context.includes("fast moving")) return { icon: Zap, tone: "success" } as const;
    if (context.includes("warehouse")) return { icon: Warehouse, tone: "blue" } as const;
    if (context.includes("movement")) return { icon: ArrowLeftRight, tone: "blue" } as const;
    if (context.includes("valuation")) return { icon: CircleDollarSign, tone: "success" } as const;
    if (context.includes("closing-stock") || context.includes("closing stock")) return { icon: PackageCheck, tone: "success" } as const;
    if (context.includes("item") || context.includes("stock detail")) return { icon: PackageSearch, tone: "blue" } as const;
    if (context.includes("category")) return { icon: Tags, tone: "purple" } as const;
    if (context.includes("discount") || context.includes("tax")) return { icon: BadgePercent, tone: "purple" } as const;
    if (context.includes("profit") || context.includes("trend") || context.includes("growth")) return { icon: TrendingUp, tone: "success" } as const;
    if (group.includes("Inventory")) return { icon: Boxes, tone: "success" } as const;
    if (group.includes("Customer")) return { icon: UsersRound, tone: "blue" } as const;
    if (group.includes("Financial")) return { icon: CircleDollarSign, tone: "warning" } as const;
    if (group.includes("Transaction")) return { icon: ReceiptText, tone: "warning" } as const;
    if (group.includes("Banking")) return { icon: Landmark, tone: "blue" } as const;
    if (group.includes("Order")) return { icon: ShoppingCart, tone: "success" } as const;
    return { icon: BarChart3, tone: "warning" } as const;
  })();
  const EmptyIcon = illustration.icon;
  const palette = {
    neutral: { shell: "bg-[#f4f7fb] text-[#64748b] ring-[#dbe3ee]", orbit: "border-[#b8c5d5]", dot: "bg-[#94a3b8]" },
    warning: { shell: "bg-[#fff7e8] text-[#d97706] ring-[#f5dfb5]", orbit: "border-[#e9b866]", dot: "bg-[#e89a22]" },
    danger: { shell: "bg-[#fff0f1] text-[#d14343] ring-[#f2cdd1]", orbit: "border-[#e6949d]", dot: "bg-[#df5b68]" },
    success: { shell: "bg-[#eef8f3] text-[#16835d] ring-[#c8e8da]", orbit: "border-[#83c8ae]", dot: "bg-[#29a376]" },
    blue: { shell: "bg-[#eef5ff] text-[#2563b9] ring-[#cfe0f7]", orbit: "border-[#8ab4e8]", dot: "bg-[#4388d4]" },
    purple: { shell: "bg-[#f4f0ff] text-[#7251b5] ring-[#ded3f4]", orbit: "border-[#b6a0df]", dot: "bg-[#8969c8]" },
  }[illustration.tone];

  return (
    <div className={cn("mx-auto flex max-w-[470px] flex-col items-center text-center", compact ? "py-4" : "py-2")}>
      <div className={cn("relative flex items-center justify-center ring-1", compact ? "h-16 w-16 rounded-[20px]" : "h-24 w-24 rounded-[30px]", palette.shell)}>
        <div className={cn("absolute rotate-6 border border-dashed", compact ? "inset-2 rounded-[15px]" : "inset-3 rounded-[22px]", palette.orbit)} />
        <div className={cn("absolute -right-1 rounded-full ring-white", compact ? "top-3 h-2.5 w-2.5 ring-2" : "top-4 h-3 w-3 ring-4", palette.dot)} />
        <div className={cn("absolute rounded-full opacity-70", compact ? "bottom-1.5 left-1.5 h-1.5 w-1.5" : "bottom-2 left-2 h-2 w-2", palette.dot)} />
        <EmptyIcon className={cn("relative", compact ? "h-7 w-7" : "h-10 w-10")} strokeWidth={1.6} />
      </div>
      <div className={cn("font-semibold text-[#25365b]", compact ? "mt-3 text-[15px]" : "mt-5 text-[17px]")}>{title}</div>
      <div className={cn("max-w-[430px] text-[#6d7b94]", compact ? "mt-1 text-[12px] leading-5" : "mt-1.5 text-[13px] leading-6")}>{description}</div>
    </div>
  );
}

function ExpenseReportEmptyState({ title, description, onAdd }: { title: string; description: string; onAdd: () => void }) {
  return (
    <div className="mx-auto flex max-w-[430px] flex-col items-center text-center">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#fff3e8] text-[#eb6b20] ring-1 ring-[#f7d8be]">
        <div className="absolute inset-2 rounded-full border border-dashed border-[#efad79]" />
        <ReceiptText className="relative h-9 w-9" strokeWidth={1.7} />
        <span className="absolute -right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-base font-semibold text-[#eb6b20] shadow-sm ring-1 ring-[#f7d8be]">+</span>
      </div>
      <div className="mt-5 text-base font-semibold text-[#25365b]">{title}</div>
      <div className="mt-1.5 max-w-[370px] text-sm leading-6 text-[#718099]">{description}</div>
      <button type="button" onClick={onAdd} className="mt-5 inline-flex h-9 items-center gap-2 rounded-full bg-[#eb6b20] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(235,107,32,0.2)] transition hover:bg-[#d85d15]">
        <Plus className="h-4 w-4" /> Add Expense
      </button>
    </div>
  );
}

function BankingReportEmptyState({ title, description, onAdd, actionLabel }: { title: string; description: string; onAdd?: () => void; actionLabel?: string }) {
  return (
    <div className="mx-auto flex max-w-[440px] flex-col items-center text-center">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#eaf4ff] text-[#2563eb] ring-1 ring-[#c8def8]">
        <div className="absolute inset-2 rounded-full border border-dashed border-[#8fb9ea]" />
        <Landmark className="relative h-9 w-9" strokeWidth={1.7} />
      </div>
      <div className="mt-5 text-base font-semibold text-[#25365b]">{title}</div>
      <div className="mt-1.5 max-w-[380px] text-sm leading-6 text-[#718099]">{description}</div>
      {onAdd ? (
        <button type="button" onClick={onAdd} className="mt-5 inline-flex h-9 items-center gap-2 rounded-full bg-[#eb6b20] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(235,107,32,0.2)] hover:bg-[#d85d15]">
          <Plus className="h-4 w-4" /> {actionLabel ?? "Add Entry"}
        </button>
      ) : null}
    </div>
  );
}

function TaxReportEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-[440px] flex-col items-center text-center">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#f2edff] text-[#7654c4] ring-1 ring-[#dcd0f5]">
        <div className="absolute inset-2 rounded-full border border-dashed border-[#b9a3e6]" />
        <BadgePercent className="relative h-9 w-9" strokeWidth={1.7} />
      </div>
      <div className="mt-5 text-base font-semibold text-[#25365b]">{title}</div>
      <div className="mt-1.5 max-w-[380px] text-sm leading-6 text-[#718099]">{description}</div>
    </div>
  );
}

function OrderReportEmptyState({ title, description, actionLabel, onAdd }: { title: string; description: string; actionLabel: string; onAdd: () => void }) {
  return (
    <div className="mx-auto flex max-w-[440px] flex-col items-center text-center">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#eaf8f1] text-[#178a63] ring-1 ring-[#c7ead9]">
        <div className="absolute inset-2 rounded-full border border-dashed border-[#86c9aa]" />
        <ShoppingCart className="relative h-9 w-9" strokeWidth={1.7} />
      </div>
      <div className="mt-5 text-base font-semibold text-[#25365b]">{title}</div>
      <div className="mt-1.5 max-w-[380px] text-sm leading-6 text-[#718099]">{description}</div>
      <button type="button" onClick={onAdd} className="mt-5 inline-flex h-9 items-center gap-2 rounded-full bg-[#eb6b20] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(235,107,32,0.2)] hover:bg-[#d85d15]">
        <Plus className="h-4 w-4" /> {actionLabel}
      </button>
    </div>
  );
}

function RatioReportEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-[440px] flex-col items-center text-center">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#eef3ff] text-[#4169c1] ring-1 ring-[#d3def6]">
        <div className="absolute inset-2 rounded-full border border-dashed border-[#9fb4e3]" />
        <Gauge className="relative h-9 w-9" strokeWidth={1.7} />
      </div>
      <div className="mt-5 text-base font-semibold text-[#25365b]">{title}</div>
      <div className="mt-1.5 max-w-[380px] text-sm leading-6 text-[#718099]">{description}</div>
    </div>
  );
}

function AnalyticsEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-[440px] flex-col items-center text-center">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#eaf8f1] text-[#178a63] ring-1 ring-[#c7ead9]">
        <div className="absolute inset-2 rounded-full border border-dashed border-[#86c9aa]" />
        <BarChart3 className="relative h-9 w-9" strokeWidth={1.7} />
      </div>
      <div className="mt-5 text-base font-semibold text-[#25365b]">{title}</div>
      <div className="mt-1.5 max-w-[380px] text-sm leading-6 text-[#718099]">{description}</div>
    </div>
  );
}

function AuditReportEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-[440px] flex-col items-center text-center">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#eef3ff] text-[#4169c1] ring-1 ring-[#d3def6]">
        <div className="absolute inset-2 rounded-full border border-dashed border-[#9fb4e3]" />
        <ShieldCheck className="relative h-9 w-9" strokeWidth={1.7} />
      </div>
      <div className="mt-5 text-base font-semibold text-[#25365b]">{title}</div>
      <div className="mt-1.5 max-w-[380px] text-sm leading-6 text-[#718099]">{description}</div>
    </div>
  );
}

function BalanceSheetPanel({
  title,
  sections,
  totalLabel,
  total,
  divider = false,
}: {
  title: string;
  sections: BalanceSheetSection[];
  totalLabel: string;
  total: number;
  divider?: boolean;
}) {
  return (
    <div className={cn("flex min-h-full flex-col", divider ? "border-r border-[#d7dfeb]" : "")}>
      <div className="grid grid-cols-[1fr_180px] border-b border-[#d7dfeb] bg-[#f7f7f8] px-4 py-3 text-[14px] text-[#6d7b94]">
        <div>ACCOUNT</div>
        <div className="text-right">AMOUNT</div>
      </div>

      <div className="flex-1 bg-[#fbfdff]">
        <div className="flex items-center gap-3 border-b border-[#d6e3f3] bg-[#eaf3ff] px-4 py-4 text-[17px] font-bold text-[#163f73]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#2472df] shadow-sm ring-1 ring-[#c9dcf6]">
            <FolderTree className="h-4 w-4" />
          </span>
          <span>{title}</span>
          <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#52739f] ring-1 ring-[#c9dcf6]">Main Group</span>
        </div>
        {sections.map((section, sectionIndex) => (
          <div key={`${title}-${sectionIndex}-${section.title}`} className="border-b border-[#dce5ef] bg-white last:border-b-0">
            <div className="grid grid-cols-[1fr_180px] items-center border-b border-[#e3ebf5] bg-[#f4f7fb] px-4 py-3">
              <div className="flex items-center gap-2.5 text-[14px] font-bold text-[#294c78]">
                <FolderTree className="h-4 w-4 text-[#5b83b7]" />
                <span>{section.title}</span>
                <span className="rounded bg-[#e5edf8] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#607da2]">Section</span>
              </div>
              <div className="text-right text-[14px] font-bold text-[#294c78]">{formatReportAmount(section.total)}</div>
            </div>
            {section.lines.map((line, lineIndex) => (
              <div
                // A group and its only child ledger can legitimately share the
                // same name (e.g. an asset category with a single asset in
                // it), so the label alone isn't a unique key — the position
                // in this section's flattened line list is.
                key={`${section.title}-${lineIndex}-${line.label}`}
                className={cn(
                  "grid grid-cols-[1fr_180px] items-center border-b border-[#edf2f7] px-4 py-3.5 text-[15px] last:border-b-0",
                  line.strong ? "bg-[#fbfcfe]" : "bg-white",
                )}
              >
                <div
                  className={cn("relative flex items-center gap-2.5 text-[#25365b]", line.strong ? "font-bold" : "font-medium", (line.depth ?? (line.indent ? 1 : 0)) > 0 ? "border-l-2 border-[#c8d8ec] pl-5 text-[#526681]" : "")}
                  style={{ marginLeft: `${(line.depth ?? (line.indent ? 1 : 0)) * 20}px` }}
                >
                  {(line.depth ?? (line.indent ? 1 : 0)) > 0 ? (
                    <span aria-hidden className="absolute -left-[5px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-white bg-[#6b94c9] ring-1 ring-[#aac2df]" />
                  ) : (
                    line.kind === "account" ? <BookOpen className="h-4 w-4 shrink-0 text-[#4777ae]" /> : <FolderTree className="h-4 w-4 shrink-0 text-[#4777ae]" />
                  )}
                  <span>{line.label}</span>
                  <span className={cn("ml-1 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em]", line.kind === "account" ? "bg-[#f0f4f9] text-[#7a8da8]" : "bg-[#eaf1fa] text-[#58789f]")}>{line.kind === "account" ? "Account" : "Group"}</span>
                </div>
                <div className={cn("text-right tabular-nums", line.strong ? "font-bold text-[#294c78]" : "font-semibold text-[#526681]", moneyToMinorUnits(line.amount) === 0 ? "text-[#9aa8ba]" : "")}>{formatReportAmount(line.amount)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_180px] bg-[#d7ebff] px-4 py-4 text-[15px] font-semibold text-[#1674ff]">
        <div>{totalLabel}</div>
        <div className="text-right">{formatReportAmount(total)}</div>
      </div>
    </div>
  );
}

