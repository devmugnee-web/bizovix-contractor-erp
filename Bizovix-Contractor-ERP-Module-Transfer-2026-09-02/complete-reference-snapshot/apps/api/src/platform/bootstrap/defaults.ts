export interface IndustryPackSeed {
  categoryCode: string;
  categoryName: string;
  description: string;
  workspaceName: string;
  packCode: string;
  packName: string;
  modules: string[];
  menus: string[];
  terminology: Record<string, string>;
  workflows: string[];
  reports: string[];
  quickActions: string[];
  dashboardCards: string[];
}

export const industryPackSeeds: IndustryPackSeed[] = [
  {
    categoryCode: "TRADING",
    categoryName: "Trading",
    description: "Trading businesses with purchase, sales, inventory, and accounts workflows.",
    workspaceName: "Trading ERP Workspace",
    packCode: "PACK_TRADING",
    packName: "Trading Industry Pack",
    modules: ["dashboard", "customers", "suppliers", "products", "purchase", "sales", "inventory", "banking", "accounts", "reports"],
    menus: ["Dashboard", "Sales", "Purchase", "Inventory", "Accounts", "Reports"],
    terminology: {
      customer: "Customer",
      product: "Product",
      order: "Sales Order",
      invoice: "Sales Invoice",
    },
    workflows: ["sales-approval", "purchase-approval", "cash-receipt"],
    reports: ["trial-balance", "stock-summary", "customer-ledger"],
    quickActions: ["create-sales", "create-receipt", "create-purchase"],
    dashboardCards: ["sales", "purchase", "receipt", "payment", "receivable", "payable"],
  },
  {
    categoryCode: "TENDER",
    categoryName: "Tender and Government Supply",
    description: "Tender tracking, bid preparation, billing collection, and tender accounts.",
    workspaceName: "Tender ERP Workspace",
    packCode: "PACK_TENDER",
    packName: "Tender Industry Pack",
    modules: ["dashboard", "tender-notice", "procuring-entity", "bid-preparation", "boq", "delivery", "bill-submission", "tender-accounts", "reports"],
    menus: ["Dashboard", "Tender Notice", "Bid Preparation", "Delivery", "Tender Accounts", "Reports"],
    terminology: {
      customer: "Procuring Entity",
      product: "Tender Item",
      order: "Work Order",
      invoice: "Bill",
    },
    workflows: ["bid-review", "bill-submission", "collection"],
    reports: ["trial-balance", "bill-register", "tender-profitability"],
    quickActions: ["create-bid", "create-bill", "record-collection"],
    dashboardCards: ["sales", "receipt", "receivable", "payment", "payable", "purchase"],
  },
  {
    categoryCode: "RENTAL",
    categoryName: "Equipment Rental",
    description: "Rental bookings, contracts, dispatch, returns, and maintenance operations.",
    workspaceName: "Rental ERP Workspace",
    packCode: "PACK_RENTAL",
    packName: "Rental Industry Pack",
    modules: ["dashboard", "equipment", "rental-booking", "contract", "dispatch", "return", "maintenance", "rental-accounts", "reports"],
    menus: ["Dashboard", "Equipment", "Rental Booking", "Dispatch", "Maintenance", "Reports"],
    terminology: {
      customer: "Client",
      product: "Equipment",
      order: "Booking",
      invoice: "Rental Invoice",
    },
    workflows: ["booking-approval", "deposit-control", "damage-adjustment"],
    reports: ["trial-balance", "booking-summary", "maintenance-cost"],
    quickActions: ["create-booking", "create-invoice", "record-return"],
    dashboardCards: ["sales", "receipt", "payment", "receivable", "payable", "purchase"],
  },
  {
    categoryCode: "SERVICE",
    categoryName: "Service Company",
    description: "Clients, proposals, contracts, projects, worklogs, expenses, and service billing.",
    workspaceName: "Service ERP Workspace",
    packCode: "PACK_SERVICE",
    packName: "Service Industry Pack",
    modules: ["dashboard", "leads", "clients", "proposal", "contract", "project", "task", "invoice", "payment", "reports"],
    menus: ["Dashboard", "Clients", "Projects", "Invoice", "Payment", "Reports"],
    terminology: {
      customer: "Client",
      product: "Service",
      order: "Project Order",
      invoice: "Service Invoice",
    },
    workflows: ["proposal-review", "milestone-billing", "expense-approval"],
    reports: ["trial-balance", "profitability", "client-ledger"],
    quickActions: ["create-proposal", "create-invoice", "record-payment"],
    dashboardCards: ["sales", "receipt", "receivable", "payment", "payable", "purchase"],
  },
];

export function getIndustryPackSeed(categoryCode: string) {
  return industryPackSeeds.find((entry) => entry.categoryCode === categoryCode) ?? null;
}

export const roleSeeds = [
  { code: "OWNER", name: "Owner" },
  { code: "SUPER_ADMIN", name: "Super Admin" },
  { code: "ADMIN", name: "Admin" },
  { code: "ACCOUNTS_MANAGER", name: "Accounts Manager" },
  { code: "ACCOUNTS_OFFICER", name: "Accounts Officer" },
  { code: "SALES_MANAGER", name: "Sales Manager" },
  { code: "SALES_EXECUTIVE", name: "Sales Executive" },
  { code: "PURCHASE_OFFICER", name: "Purchase Officer" },
  { code: "INVENTORY_MANAGER", name: "Inventory Manager" },
  { code: "STORE_KEEPER", name: "Store Keeper" },
  { code: "QUALITY_MANAGER", name: "Quality Manager" },
  { code: "HR_MANAGER", name: "HR Manager" },
  { code: "EMPLOYEE", name: "Employee" },
  { code: "AUDITOR", name: "Auditor" },
  { code: "VIEWER", name: "Viewer" },
] as const;

export const moduleSeeds = [
  { key: "platform", label: "Platform" },
  { key: "workspace", label: "Workspace" },
  { key: "subscription", label: "Subscription" },
  { key: "dashboard", label: "Dashboard" },
  { key: "accounting", label: "Accounting" },
  { key: "inventory", label: "Inventory" },
  { key: "tender", label: "Tender" },
  { key: "rental", label: "Rental" },
  { key: "service", label: "Service" },
  { key: "hr", label: "HR & Payroll" },
  { key: "lc", label: "Import & LC Management" },
  { key: "manufacturing", label: "Manufacturing" },
] as const;

export const permissionSeeds = [
  { key: "dashboard.view", moduleKey: "dashboard", resource: "dashboard", action: "view" },
  { key: "workspace.view", moduleKey: "workspace", resource: "workspace", action: "view" },
  { key: "workspace.manage", moduleKey: "workspace", resource: "workspace", action: "edit" },
  { key: "subscription.view", moduleKey: "subscription", resource: "subscription", action: "view" },
  { key: "subscription.manage", moduleKey: "subscription", resource: "subscription", action: "edit" },
  { key: "accounting.ledger.create", moduleKey: "accounting", resource: "ledger", action: "create" },
  { key: "accounting.voucher.create", moduleKey: "accounting", resource: "voucher", action: "create" },
  { key: "accounting.voucher.delete", moduleKey: "accounting", resource: "voucher", action: "delete" },
  { key: "accounting.voucher.post", moduleKey: "accounting", resource: "voucher", action: "post" },
  { key: "accounting.report.trial_balance", moduleKey: "accounting", resource: "trial-balance", action: "view" },
  { key: "inventory.stock_item.create", moduleKey: "inventory", resource: "stock-item", action: "create" },
  { key: "inventory.stock_transfer", moduleKey: "inventory", resource: "stock-transfer", action: "create" },
  { key: "warehouse.view", moduleKey: "inventory", resource: "warehouse", action: "view" },
  { key: "warehouse.create", moduleKey: "inventory", resource: "warehouse", action: "create" },
  { key: "warehouse.update", moduleKey: "inventory", resource: "warehouse", action: "update" },
  { key: "warehouse.deactivate", moduleKey: "inventory", resource: "warehouse", action: "deactivate" },
  { key: "warehouse.transfer", moduleKey: "inventory", resource: "warehouse-transfer", action: "create" },
  { key: "warehouse.stock.view", moduleKey: "inventory", resource: "warehouse-stock", action: "view" },
  { key: "tender.boq.manage", moduleKey: "tender", resource: "boq", action: "edit" },
  { key: "rental.booking.create", moduleKey: "rental", resource: "booking", action: "create" },
  { key: "service.project.manage", moduleKey: "service", resource: "project", action: "edit" },
  { key: "reports.export", moduleKey: "dashboard", resource: "report", action: "export" },
  { key: "hr.employee.view", moduleKey: "hr", resource: "employee", action: "view" },
  { key: "hr.employee.create", moduleKey: "hr", resource: "employee", action: "create" },
  { key: "hr.employee.update", moduleKey: "hr", resource: "employee", action: "update" },
  { key: "hr.employee.delete", moduleKey: "hr", resource: "employee", action: "delete" },
  { key: "hr.payroll.manage", moduleKey: "hr", resource: "payroll", action: "manage" },
  { key: "hr.payroll.approve", moduleKey: "hr", resource: "payroll", action: "approve" },
  { key: "hr.leave.view", moduleKey: "hr", resource: "leave", action: "view" },
  { key: "hr.leave.manage", moduleKey: "hr", resource: "leave", action: "manage" },
  { key: "hr.leave.approve", moduleKey: "hr", resource: "leave", action: "approve" },
  { key: "hr.expense.view", moduleKey: "hr", resource: "expense", action: "view" },
  { key: "hr.expense.manage", moduleKey: "hr", resource: "expense", action: "manage" },
  { key: "hr.expense.approve", moduleKey: "hr", resource: "expense", action: "approve" },
  { key: "hr.loan.view", moduleKey: "hr", resource: "loan", action: "view" },
  { key: "hr.loan.manage", moduleKey: "hr", resource: "loan", action: "manage" },
  { key: "hr.loan.approve", moduleKey: "hr", resource: "loan", action: "approve" },
  { key: "hr.recruitment.view", moduleKey: "hr", resource: "recruitment", action: "view" },
  { key: "hr.recruitment.manage", moduleKey: "hr", resource: "recruitment", action: "manage" },
  { key: "lc.view", moduleKey: "lc", resource: "lc", action: "view" },
  { key: "lc.create", moduleKey: "lc", resource: "lc", action: "create" },
  { key: "lc.edit", moduleKey: "lc", resource: "lc", action: "update" },
  { key: "lc.delete", moduleKey: "lc", resource: "lc", action: "delete" },
  { key: "lc.cost.enter", moduleKey: "lc", resource: "cost-entry", action: "create" },
  { key: "lc.cost.edit", moduleKey: "lc", resource: "cost-entry", action: "update" },
  { key: "lc.cost.allocate", moduleKey: "lc", resource: "allocation", action: "manage" },
  { key: "lc.finalize", moduleKey: "lc", resource: "landed-cost", action: "finalize" },
  { key: "lc.finalize.reopen", moduleKey: "lc", resource: "landed-cost", action: "reopen" },
  { key: "lc.reports.view", moduleKey: "lc", resource: "report", action: "view" },
  { key: "lc.configure", moduleKey: "lc", resource: "cost-head", action: "configure" },
  { key: "manufacturing.view", moduleKey: "manufacturing", resource: "manufacturing", action: "view" },
  { key: "manufacturing.configure", moduleKey: "manufacturing", resource: "settings", action: "configure" },
  { key: "manufacturing.master.manage", moduleKey: "manufacturing", resource: "master", action: "manage" },
  { key: "manufacturing.plan.manage", moduleKey: "manufacturing", resource: "production-plan", action: "manage" },
  { key: "manufacturing.order.create", moduleKey: "manufacturing", resource: "production-order", action: "create" },
  { key: "manufacturing.order.approve", moduleKey: "manufacturing", resource: "production-order", action: "approve" },
  { key: "manufacturing.material.reserve", moduleKey: "manufacturing", resource: "material-reservation", action: "create" },
  { key: "manufacturing.material.issue", moduleKey: "manufacturing", resource: "material-issue", action: "post" },
  { key: "manufacturing.production.execute", moduleKey: "manufacturing", resource: "production-execution", action: "post" },
  { key: "manufacturing.quality.manage", moduleKey: "manufacturing", resource: "quality-master", action: "manage" },
  { key: "manufacturing.quality.inspect", moduleKey: "manufacturing", resource: "quality-inspection", action: "post" },
  { key: "manufacturing.quality.release", moduleKey: "manufacturing", resource: "quality-release", action: "approve" },
  { key: "manufacturing.packaging.execute", moduleKey: "manufacturing", resource: "packaging", action: "post" },
  { key: "manufacturing.cost.post", moduleKey: "manufacturing", resource: "production-cost", action: "post" },
  { key: "manufacturing.close", moduleKey: "manufacturing", resource: "production-order", action: "close" },
  { key: "manufacturing.reports.view", moduleKey: "manufacturing", resource: "manufacturing-report", action: "view" },
  { key: "manufacturing.audit.review", moduleKey: "manufacturing", resource: "workflow-review", action: "review" },
] as const;

export const featureSeeds = [
  { key: "dashboard.access", label: "Dashboard Access", moduleKey: "dashboard" },
  { key: "workspace.single", label: "Single Workspace", moduleKey: "workspace" },
  { key: "workspace.multi", label: "Multiple Workspaces", moduleKey: "workspace" },
  { key: "accounting.basic", label: "Basic Accounting", moduleKey: "accounting" },
  { key: "inventory.basic", label: "Basic Inventory", moduleKey: "inventory" },
  { key: "approvals.basic", label: "Approval Workflow", moduleKey: "platform" },
  { key: "reports.basic", label: "Basic Reports", moduleKey: "dashboard" },
  { key: "reports.advanced", label: "Advanced Reports", moduleKey: "dashboard" },
  { key: "api.access", label: "API Access", moduleKey: "platform" },
  { key: "demo.spaces", label: "Demo Workspaces", moduleKey: "platform" },
  { key: "subscription.scale", label: "Subscription Scale Controls", moduleKey: "subscription" },
  { key: "tender.advanced", label: "Advanced Tender", moduleKey: "tender" },
  { key: "rental.advanced", label: "Advanced Rental", moduleKey: "rental" },
] as const;

interface PlanLimitSource {
  maxOrganizations: number;
  maxCompanies: number;
  maxWorkspaces: number;
  maxBranches: number;
  maxUsers: number;
  maxGodowns: number;
  maxStockItems: number;
  maxCustomers: number;
  maxSuppliers: number;
  maxMonthlyVouchers: number;
  maxMonthlyInvoices: number;
  maxStorageMb: number;
}

function buildUsageLimitSeeds(plan: PlanLimitSource) {
  return [
    { key: "organizations", limit: plan.maxOrganizations },
    { key: "companies", limit: plan.maxCompanies },
    { key: "workspaces", limit: plan.maxWorkspaces },
    { key: "branches", limit: plan.maxBranches },
    { key: "users", limit: plan.maxUsers },
    { key: "godowns", limit: plan.maxGodowns },
    { key: "stock-items", limit: plan.maxStockItems },
    { key: "customers", limit: plan.maxCustomers },
    { key: "suppliers", limit: plan.maxSuppliers },
    { key: "monthly-vouchers", limit: plan.maxMonthlyVouchers },
    { key: "monthly-invoices", limit: plan.maxMonthlyInvoices },
    { key: "storage-mb", limit: plan.maxStorageMb },
  ] as const;
}

export const freeYearlyPlanSeed = {
  code: "FREE_YEARLY",
  name: "Free Yearly",
  description: "One-year free launch plan for a single-business ERP tenant.",
  durationMonths: 12,
  priceInMinor: 0,
  currencyCode: "BDT",
  maxOrganizations: 1,
  maxCompanies: 1,
  maxWorkspaces: 1,
  maxBranches: 1,
  maxUsers: 2,
  maxGodowns: 1,
  maxStockItems: 100,
  maxCustomers: 100,
  maxSuppliers: 50,
  maxMonthlyVouchers: 300,
  maxMonthlyInvoices: 100,
  maxStorageMb: 500,
};

export const starterMonthlyPlanSeed = {
  code: "STARTER_MONTHLY",
  name: "Starter",
  description: "Core accounting, daily vouchers, and reporting for a single workspace.",
  durationMonths: 1,
  priceInMinor: 100000,
  currencyCode: "BDT",
  maxOrganizations: 1,
  maxCompanies: 1,
  maxWorkspaces: 1,
  maxBranches: 1,
  maxUsers: 5,
  maxGodowns: 1,
  maxStockItems: 300,
  maxCustomers: 300,
  maxSuppliers: 150,
  maxMonthlyVouchers: 1000,
  maxMonthlyInvoices: 300,
  maxStorageMb: 2048,
};

export const businessMonthlyPlanSeed = {
  code: "BUSINESS_MONTHLY",
  name: "Business",
  description: "Inventory, approvals, reports, and multi-workspace operations for growing teams.",
  durationMonths: 1,
  priceInMinor: 100000,
  currencyCode: "BDT",
  maxOrganizations: 1,
  maxCompanies: 3,
  maxWorkspaces: 5,
  maxBranches: 5,
  maxUsers: 20,
  maxGodowns: 5,
  maxStockItems: 5000,
  maxCustomers: 3000,
  maxSuppliers: 1500,
  maxMonthlyVouchers: 10000,
  maxMonthlyInvoices: 3000,
  maxStorageMb: 10240,
};

export const professionalMonthlyPlanSeed = {
  code: "PROFESSIONAL_MONTHLY",
  name: "Professional",
  description: "Advanced controls, API access, demo spaces, and scale-ready limits.",
  durationMonths: 1,
  priceInMinor: 100000,
  currencyCode: "BDT",
  maxOrganizations: 3,
  maxCompanies: 10,
  maxWorkspaces: 20,
  maxBranches: 20,
  maxUsers: 75,
  maxGodowns: 20,
  maxStockItems: 25000,
  maxCustomers: 15000,
  maxSuppliers: 8000,
  maxMonthlyVouchers: 50000,
  maxMonthlyInvoices: 15000,
  maxStorageMb: 51200,
};

export const freeYearlyFeatureKeys = [
  "dashboard.access",
  "workspace.single",
  "accounting.basic",
  "inventory.basic",
  "reports.basic",
] as const;

export const subscriptionPlanSeeds = [
  {
    ...freeYearlyPlanSeed,
    featureKeys: freeYearlyFeatureKeys,
    usageLimits: buildUsageLimitSeeds(freeYearlyPlanSeed),
    recommended: false,
  },
  {
    ...starterMonthlyPlanSeed,
    featureKeys: ["dashboard.access", "workspace.single", "accounting.basic", "reports.basic"] as const,
    usageLimits: buildUsageLimitSeeds(starterMonthlyPlanSeed),
    recommended: false,
  },
  {
    ...businessMonthlyPlanSeed,
    featureKeys: [
      "dashboard.access",
      "workspace.multi",
      "accounting.basic",
      "inventory.basic",
      "approvals.basic",
      "reports.basic",
      "reports.advanced",
    ] as const,
    usageLimits: buildUsageLimitSeeds(businessMonthlyPlanSeed),
    recommended: true,
  },
  {
    ...professionalMonthlyPlanSeed,
    featureKeys: [
      "dashboard.access",
      "workspace.multi",
      "accounting.basic",
      "inventory.basic",
      "approvals.basic",
      "reports.basic",
      "reports.advanced",
      "api.access",
      "demo.spaces",
      "subscription.scale",
    ] as const,
    usageLimits: buildUsageLimitSeeds(professionalMonthlyPlanSeed),
    recommended: false,
  },
] as const;

export const usageLimitSeeds = buildUsageLimitSeeds(freeYearlyPlanSeed);

export const accountGroupSeeds = [
  { code: "ASSET", name: "Assets", nature: "ASSET" },
  { code: "LIABILITY", name: "Liabilities", nature: "LIABILITY" },
  { code: "EQUITY", name: "Equity", nature: "EQUITY" },
  { code: "INCOME", name: "Income", nature: "INCOME" },
  { code: "DIRECT_EXPENSE", name: "Direct Expense", nature: "DIRECT_EXPENSE" },
  { code: "INDIRECT_EXPENSE", name: "Indirect Expense", nature: "INDIRECT_EXPENSE" },
  { code: "CURRENT_ASSET", name: "Current Assets", nature: "ASSET" },
  { code: "FIXED_ASSET", name: "Fixed Assets", nature: "ASSET" },
  { code: "CASH", name: "Cash", nature: "ASSET" },
  { code: "BANK", name: "Bank", nature: "ASSET" },
  { code: "AR", name: "Accounts Receivable", nature: "ASSET" },
  { code: "INVENTORY", name: "Inventory", nature: "ASSET" },
  { code: "AP", name: "Accounts Payable", nature: "LIABILITY" },
  { code: "TAX_PAYABLE", name: "Tax Payable", nature: "LIABILITY" },
  { code: "VAT_PAYABLE", name: "VAT Payable", nature: "LIABILITY" },
  { code: "CAPITAL", name: "Capital", nature: "EQUITY" },
  { code: "SALES_REVENUE", name: "Sales Revenue", nature: "INCOME" },
  { code: "PURCHASE_COST", name: "Purchase Cost", nature: "DIRECT_EXPENSE" },
] as const;

export const voucherTypeSeeds = [
  { code: "CONTRA", name: "Contra", shortCode: "CN" },
  { code: "PAYMENT", name: "Payment", shortCode: "PV" },
  { code: "RECEIPT", name: "Receipt", shortCode: "RV" },
  { code: "JOURNAL", name: "Journal", shortCode: "JV" },
  { code: "SALES", name: "Sales", shortCode: "SI" },
  { code: "PURCHASE", name: "Purchase", shortCode: "PI" },
  { code: "CREDIT_NOTE", name: "Credit Note", shortCode: "CR" },
  { code: "DEBIT_NOTE", name: "Purchase Return", shortCode: "PR" },
  { code: "QUOTATION", name: "Quotation", shortCode: "QT" },
  { code: "PROFORMA_INVOICE", name: "Proforma Invoice", shortCode: "PF" },
  { code: "SALES_ORDER", name: "Sales Order", shortCode: "SO" },
  { code: "DELIVERY_NOTE", name: "Delivery Note", shortCode: "DN" },
  { code: "PURCHASE_ORDER", name: "Purchase Order", shortCode: "PO" },
  { code: "RECEIPT_NOTE", name: "Receipt Note", shortCode: "GRN" },
] as const;

export interface SystemAccountSeed {
  code: string;
  name: string;
  nature: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "DIRECT_EXPENSE" | "INDIRECT_EXPENSE";
  groupCode: (typeof accountGroupSeeds)[number]["code"];
  isControlAccount: boolean;
  parentCategoryCode: string;
}

type AccountCategoryLevel = "MAIN_CATEGORY" | "CATEGORY";

export interface AccountCategorySeed {
  code: string;
  name: string;
  level: AccountCategoryLevel;
  parentCode: string | null;
  nature: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "DIRECT_EXPENSE" | "INDIRECT_EXPENSE";
  sortOrder: number;
}

// The Chart of Accounts category tree that every ledger below is re-parented into.
// A Category nests under a Main Category or another Category to unlimited depth —
// this seed only goes 3-4 deep because that's all a typical business needs, not
// because anything caps it (e.g. a ledger may sit directly under a shallow
// Category where a real business structure doesn't need the extra depth, such
// as Equity or Expenses here).
//
// Codes follow the positional numbering scheme (see accounts/account-code.util.ts):
// a fixed-width 7-digit code where each category depth owns one digit position,
// zero-padded when unused — Main Category's digit is fixed by nature (Asset=1,
// Liability=2, Equity=3, Income=4, Expense=5), each Category depth below it
// follows sibling order. New companies get this scheme from the start, matching
// what `AccountsService`'s positional generator computes for hand-created accounts.
export const accountCategorySeeds: AccountCategorySeed[] = [
  { code: "1000000", name: "Assets", level: "MAIN_CATEGORY", parentCode: null, nature: "ASSET", sortOrder: 10 },
  { code: "1100000", name: "Fixed Assets", level: "CATEGORY", parentCode: "1000000", nature: "ASSET", sortOrder: 10 },
  { code: "1200000", name: "Current Assets", level: "CATEGORY", parentCode: "1000000", nature: "ASSET", sortOrder: 20 },
  { code: "1210000", name: "Closing Balance", level: "CATEGORY", parentCode: "1200000", nature: "ASSET", sortOrder: 10 },
  { code: "1220000", name: "Cash & Cash Equivalents", level: "CATEGORY", parentCode: "1200000", nature: "ASSET", sortOrder: 20 },
  { code: "1221000", name: "Cash Accounts", level: "CATEGORY", parentCode: "1220000", nature: "ASSET", sortOrder: 10 },
  { code: "1222000", name: "Bank & MFS Accounts", level: "CATEGORY", parentCode: "1220000", nature: "ASSET", sortOrder: 20 },
  { code: "1222100", name: "Bank Accounts", level: "CATEGORY", parentCode: "1222000", nature: "ASSET", sortOrder: 10 },
  { code: "1222200", name: "Mobile Financial Service Accounts", level: "CATEGORY", parentCode: "1222000", nature: "ASSET", sortOrder: 20 },
  { code: "1230000", name: "Receivables", level: "CATEGORY", parentCode: "1200000", nature: "ASSET", sortOrder: 30 },
  { code: "1231000", name: "Accounts Receivables Control (Customers)", level: "CATEGORY", parentCode: "1230000", nature: "ASSET", sortOrder: 10 },
  { code: "1232000", name: "Others Receivables", level: "CATEGORY", parentCode: "1230000", nature: "ASSET", sortOrder: 20 },
  { code: "1240000", name: "Deposit & Advance", level: "CATEGORY", parentCode: "1200000", nature: "ASSET", sortOrder: 40 },
  { code: "1241000", name: "Advance & IOU", level: "CATEGORY", parentCode: "1240000", nature: "ASSET", sortOrder: 10 },
  { code: "1242000", name: "Deposit & Others", level: "CATEGORY", parentCode: "1240000", nature: "ASSET", sortOrder: 20 },
  { code: "1250000", name: "Goods in Transit", level: "CATEGORY", parentCode: "1200000", nature: "ASSET", sortOrder: 50 },
  { code: "1300000", name: "Non-Current Assets", level: "CATEGORY", parentCode: "1000000", nature: "ASSET", sortOrder: 30 },

  { code: "2000000", name: "Liabilities", level: "MAIN_CATEGORY", parentCode: null, nature: "LIABILITY", sortOrder: 20 },
  { code: "2100000", name: "Long Term Liabilities", level: "CATEGORY", parentCode: "2000000", nature: "LIABILITY", sortOrder: 10 },
  { code: "2110000", name: "Bank Loan", level: "CATEGORY", parentCode: "2100000", nature: "LIABILITY", sortOrder: 10 },
  { code: "2200000", name: "Current Liabilities", level: "CATEGORY", parentCode: "2000000", nature: "LIABILITY", sortOrder: 20 },
  { code: "2210000", name: "Payable", level: "CATEGORY", parentCode: "2200000", nature: "LIABILITY", sortOrder: 10 },
  { code: "2211000", name: "Accounts Payable Controls (Supplier)", level: "CATEGORY", parentCode: "2210000", nature: "LIABILITY", sortOrder: 10 },
  { code: "2212000", name: "Others Payable", level: "CATEGORY", parentCode: "2210000", nature: "LIABILITY", sortOrder: 20 },
  { code: "2220000", name: "Advance Received", level: "CATEGORY", parentCode: "2200000", nature: "LIABILITY", sortOrder: 20 },
  { code: "2230000", name: "VAT Current Accounts", level: "CATEGORY", parentCode: "2200000", nature: "LIABILITY", sortOrder: 30 },
  { code: "2240000", name: "Loan", level: "CATEGORY", parentCode: "2200000", nature: "LIABILITY", sortOrder: 40 },
  { code: "2241000", name: "Short Term Loan", level: "CATEGORY", parentCode: "2240000", nature: "LIABILITY", sortOrder: 10 },
  { code: "2242000", name: "Time Loan", level: "CATEGORY", parentCode: "2240000", nature: "LIABILITY", sortOrder: 20 },
  { code: "2243000", name: "Personal Loan", level: "CATEGORY", parentCode: "2240000", nature: "LIABILITY", sortOrder: 30 },
  { code: "2250000", name: "Others Liabilities", level: "CATEGORY", parentCode: "2200000", nature: "LIABILITY", sortOrder: 50 },

  { code: "3000000", name: "Equity", level: "MAIN_CATEGORY", parentCode: null, nature: "EQUITY", sortOrder: 30 },
  { code: "3100000", name: "Capital & Reserve", level: "CATEGORY", parentCode: "3000000", nature: "EQUITY", sortOrder: 10 },
  { code: "3200000", name: "Withdraws", level: "CATEGORY", parentCode: "3000000", nature: "EQUITY", sortOrder: 20 },
  { code: "3300000", name: "Profit & Loss Accounts", level: "CATEGORY", parentCode: "3000000", nature: "EQUITY", sortOrder: 30 },

  { code: "4000000", name: "Income", level: "MAIN_CATEGORY", parentCode: null, nature: "INCOME", sortOrder: 40 },
  { code: "4100000", name: "Operating Income", level: "CATEGORY", parentCode: "4000000", nature: "INCOME", sortOrder: 10 },
  { code: "4110000", name: "Sales Accounts", level: "CATEGORY", parentCode: "4100000", nature: "INCOME", sortOrder: 10 },
  { code: "4120000", name: "Sales Return", level: "CATEGORY", parentCode: "4100000", nature: "INCOME", sortOrder: 20 },
  { code: "4200000", name: "Others Income (Non-Operating Income)", level: "CATEGORY", parentCode: "4000000", nature: "INCOME", sortOrder: 20 },

  { code: "5000000", name: "Expenses", level: "MAIN_CATEGORY", parentCode: null, nature: "INDIRECT_EXPENSE", sortOrder: 50 },
  { code: "5100000", name: "Operating Expenses", level: "CATEGORY", parentCode: "5000000", nature: "DIRECT_EXPENSE", sortOrder: 10 },
  { code: "5110000", name: "Purchase Accounts", level: "CATEGORY", parentCode: "5100000", nature: "DIRECT_EXPENSE", sortOrder: 10 },
  { code: "5120000", name: "Direct Expenses", level: "CATEGORY", parentCode: "5100000", nature: "DIRECT_EXPENSE", sortOrder: 20 },
  { code: "5200000", name: "Indirect Expenses (Non-Operating Expenses)", level: "CATEGORY", parentCode: "5000000", nature: "INDIRECT_EXPENSE", sortOrder: 20 },
  { code: "5210000", name: "Administrative Expenses", level: "CATEGORY", parentCode: "5200000", nature: "INDIRECT_EXPENSE", sortOrder: 10 },
  { code: "5220000", name: "Financial Expenses", level: "CATEGORY", parentCode: "5200000", nature: "INDIRECT_EXPENSE", sortOrder: 20 },
  { code: "5230000", name: "Sales & Marketing Expenses", level: "CATEGORY", parentCode: "5200000", nature: "INDIRECT_EXPENSE", sortOrder: 30 },
];

// Section 6 system/control accounts. Codes follow the same positional numbering
// as their category: the parent category's digits, plus a counter for this
// ledger's position among its siblings (see accounts/account-code.util.ts).
export const systemAccountSeeds: SystemAccountSeed[] = [
  { code: "1221001", name: "Cash in Hand", nature: "ASSET", groupCode: "CASH", isControlAccount: false, parentCategoryCode: "1221000" },
  { code: "1221002", name: "Petty Cash", nature: "ASSET", groupCode: "CASH", isControlAccount: false, parentCategoryCode: "1221000" },
  { code: "1210001", name: "Inventory Control", nature: "ASSET", groupCode: "INVENTORY", isControlAccount: true, parentCategoryCode: "1210000" },
  { code: "1232001", name: "Inventory Delivered Pending Invoice", nature: "ASSET", groupCode: "CURRENT_ASSET", isControlAccount: true, parentCategoryCode: "1232000" },
  { code: "2212001", name: "Purchase Bill Pending", nature: "LIABILITY", groupCode: "AP", isControlAccount: true, parentCategoryCode: "2212000" },
  { code: "3100001", name: "Opening Balance Equity", nature: "EQUITY", groupCode: "CAPITAL", isControlAccount: true, parentCategoryCode: "3100000" },
  { code: "4110001", name: "Sales Account", nature: "INCOME", groupCode: "SALES_REVENUE", isControlAccount: false, parentCategoryCode: "4110000" },
  { code: "4120001", name: "Sales Return", nature: "INCOME", groupCode: "SALES_REVENUE", isControlAccount: false, parentCategoryCode: "4120000" },
  { code: "4200001", name: "Inventory Adjustment Gain", nature: "INCOME", groupCode: "INCOME", isControlAccount: false, parentCategoryCode: "4200000" },
  { code: "5110001", name: "Cost of Goods Sold", nature: "DIRECT_EXPENSE", groupCode: "PURCHASE_COST", isControlAccount: true, parentCategoryCode: "5110000" },
  { code: "2250001", name: "Provident Fund Payable", nature: "LIABILITY", groupCode: "LIABILITY", isControlAccount: false, parentCategoryCode: "2250000" },
  { code: "5210006", name: "Provident Fund Expense", nature: "INDIRECT_EXPENSE", groupCode: "INDIRECT_EXPENSE", isControlAccount: false, parentCategoryCode: "5210000" },
  // Holds both sides of invoice rounding: a debit when the total is rounded down
  // (loss) and a credit when it is rounded up (gain).
  { code: "5210007", name: "Round Off", nature: "INDIRECT_EXPENSE", groupCode: "INDIRECT_EXPENSE", isControlAccount: false, parentCategoryCode: "5210000" },
  { code: "5210008", name: "Inventory Adjustment Loss", nature: "INDIRECT_EXPENSE", groupCode: "INDIRECT_EXPENSE", isControlAccount: false, parentCategoryCode: "5210000" },
];
