import {
  Archive,
  Banknote,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  FileChartColumn,
  Landmark,
  ReceiptText,
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
      r("summary", "Tender Summary", "Purchased tender status and value overview."),
      r("performance", "Tender Performance", "Award rate and tender performance analysis."),
      r("document-purchase", "Document Purchase Report", "Tender document purchases and payments."),
      r("tender-security", "Tender Security Report", "Security amount, margin and expiry status."),
      r("credit-commitment", "Credit Commitment Report", "Tender commitment charges by bank."),
      r("pg-bg", "PG/BG Report", "Guarantee exposure, margin and expiry."),
      r(
        "security-deposit",
        "Security Deposit (SD) Report",
        "Project security deposit and release position.",
      ),
      r("organization", "Tender Organization Report", "Organization-wise tender activity."),
      r("category", "Tender Category Report", "Work category-wise tender analysis."),
    ],
  },
  {
    slug: "projects",
    title: "Project Reports",
    shortTitle: "Project Reports",
    icon: BriefcaseBusiness,
    reports: [
      r("summary", "Project Summary", "Consolidated project portfolio overview."),
      r("ongoing", "Ongoing Projects", "Active project value, receipt and expense."),
      r("archived", "Archived/Completed Projects", "Completed project financial outcome."),
      r("cost", "Project Cost Report", "Authoritative project-linked cost analysis."),
      r("contracts", "Contract Register", "Awarded contracts and work order register."),
      r("budget", "Project Budget Report", "Approved project budgets by project."),
      r("budget-vs-actual", "Budget vs Actual", "Approved budget vs real project expense variance."),
      r("boq-summary", "BOQ Summary", "Bill of quantities value and execution progress."),
      r("variations", "Variation Order Register", "Approved and pending variation orders by project."),
      r("time-extensions", "Time Extension Register", "Approved and pending EOT requests by project."),
      r("progress", "Project Progress Report", "Physical, financial and collection progress by project."),
      r(
        "profit-loss",
        "Project-wise Profit & Loss",
        "Revenue, cost, profit and margin by project.",
      ),
      r("receivable", "Project Receivable", "Project collection and outstanding position."),
      r("expense-summary", "Project Expense Summary", "Project-wise expense totals."),
      r(
        "financial-summary",
        "Project Financial Summary",
        "Contract, receipt, cost and balance summary.",
      ),
    ],
  },
  {
    slug: "expenses",
    title: "Expense Reports",
    shortTitle: "Expense Reports",
    icon: WalletCards,
    reports: [
      r("project", "Project Expense", "Detailed project-linked expenses."),
      r("general", "General Expense", "Administrative and company expenses."),
      r("category", "Expense by Category", "Category contribution and counts."),
      r("person", "Expense by Person", "Person-wise expense accountability."),
      r("account", "Expense by Payment Account", "Expense by source account."),
      r("monthly", "Monthly Expense", "Month-wise expense movement."),
    ],
  },
  {
    slug: "receipts",
    title: "Receipt Reports",
    shortTitle: "Receipt Reports",
    icon: ReceiptText,
    reports: [
      r("summary", "Receipt Summary", "Receipt totals and transaction details."),
      r("project-wise", "Project Receipts", "Collections against project contracts."),
      r("organization", "Receipt by Organization", "Client organization collection summary."),
      r("account", "Receipt by Payment Account", "Collections by receiving account."),
      r("monthly", "Monthly Receipt", "Month-wise receipt analysis."),
      r("outstanding", "Outstanding Receivable", "Uncollected project contract values."),
      r(
        "collection-performance",
        "Collection Performance",
        "Collection rate and receivable performance.",
      ),
    ],
  },
  {
    slug: "cash-bank",
    title: "Cash & Bank Reports",
    shortTitle: "Cash & Bank Reports",
    icon: Landmark,
    reports: [
      r("summary", "Cash Summary", "Cash and bank position overview."),
      r("cash-book", "Main Cash Report", "Main cash account movements."),
      r("petty-cash", "Petty Cash Report", "Small operational cash transactions."),
      r("bank-book", "Bank Account Report", "Bank account debit and credit movements."),
      r("transactions", "Bank Transaction Report", "Detailed bank transaction history."),
      r("transfers", "Bank Transfer Report", "Internal transfer history and charges."),
      r("reconciliation", "Bank Reconciliation Report", "ERP and statement balance matching."),
      r("cheques", "Cheque Report", "Issued and received cheque lifecycle."),
      r("cash-flow", "Cash Flow Report", "Opening, inflow, outflow and closing balance."),
    ],
  },
  {
    slug: "financial",
    title: "Financial Reports",
    shortTitle: "Financial Reports",
    icon: Banknote,
    reports: [
      r("trial-balance", "Trial Balance", "Posted ledger debit and credit balances."),
      r(
        "ledger",
        "General Ledger / Ledger Breakdown",
        "Posted journal detail and running balances.",
      ),
      r("profit-loss", "Profit & Loss", "Income and expense from posted accounting data."),
      r(
        "company-profit-loss",
        "Company-wise Profit & Loss",
        "Company performance from the ledger.",
      ),
      r("balance-sheet", "Balance Sheet", "Assets, liabilities and equity from posted entries."),
      r("cash-flow", "Cash Flow", "Ledger-based cash flow statement."),
      r("receivable-aging", "Receivable Aging", "Outstanding customer balances by age."),
      r("payable-aging", "Payable Aging", "Outstanding supplier balances by age."),
      r("account-balance", "Account Balance Summary", "Closing balances by ledger account."),
      r("running-bill-register", "Running Bill Register", "All running bills / IPCs with certification and receipt status."),
      r("retention-register", "Retention Register", "Retention deducted, released and outstanding by bill."),
      r("bill-receivable", "Certified Bill Receivable Report", "Certified bill receivables and outstanding by project."),
      r("vat-ait", "VAT/AIT Deduction Report", "VAT and AIT withheld on certified bills."),
    ],
  },
  {
    slug: "expiry-due",
    title: "Expiry & Due Reports",
    shortTitle: "Expiry & Due Reports",
    icon: CalendarClock,
    reports: [
      r("bill-maturity", "Bill Maturity Report", "Upcoming and overdue bills by maturity bucket."),
      r("tender-security", "Tender Security Expiry", "Security expiry and overdue list."),
      r("pg-bg", "PG/BG Expiry", "Guarantees approaching expiry."),
      r(
        "security-deposit",
        "Security Deposit Release Due",
        "Security deposits approaching release.",
      ),
      r("receivables", "Receivable Due", "Outstanding project collections."),
      r("payables", "Payable Due", "Upcoming expense liabilities."),
      r("cheques", "Cheque Maturity", "Pending cheque maturity dates."),
      r("documents", "Document Expiry", "Business document expiry dates."),
    ],
  },
  {
    slug: "inventory",
    title: "Inventory Reports",
    shortTitle: "Inventory Reports",
    icon: Boxes,
    reports: [
      r("summary", "Inventory Summary", "Inventory integration and stock overview."),
      r("stock-balance", "Stock Balance", "Opening, movement and closing stock."),
      r("stock-movement", "Stock Movement", "Item receipt and issue movement."),
      r("project-usage", "Project-wise Material Usage", "Materials consumed by project."),
      r("valuation", "Inventory Valuation", "Quantity and authoritative inventory value."),
      r("low-stock", "Low Stock", "Items at or below reorder level."),
      r("item-ledger", "Item Ledger", "Chronological item movement ledger."),
    ],
  },
  {
    slug: "assets",
    title: "Asset Reports",
    shortTitle: "Asset Reports",
    icon: Archive,
    reports: [
      r("summary", "Asset Summary", "Fixed asset integration overview."),
      r("schedule", "Asset Schedule", "Cost, depreciation and net book value."),
      r("depreciation", "Depreciation Schedule", "Period and accumulated depreciation."),
      r("category", "Asset by Category", "Asset position by category."),
      r("location", "Asset by Location", "Asset assignment by location."),
      r("disposal", "Asset Disposal Report", "Disposed asset proceeds and results."),
    ],
  },
  {
    slug: "inter-company",
    title: "Inter-Company Reports",
    shortTitle: "Inter-Company Reports",
    icon: Building2,
    reports: [
      r("transactions", "Inter-Company Transaction", "Transactions between business entities."),
      r("balance", "Inter-Company Balance", "Entity-wise inter-company balances."),
      r("due-to-from", "Due To / Due From", "Amounts due between business entities."),
      r("reconciliation", "Inter-Company Reconciliation", "Matched and unmatched entity balances."),
    ],
  },
];
export const findReport = (category: string, report: string) =>
  REPORT_CATEGORIES.find((c) => c.slug === category)?.reports.find((r) => r.slug === report);
