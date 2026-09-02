import { createTrialWorkspaceSubscription } from "@/lib/workspace-subscription";
import type { AppDataset, PartyRecord, StockItemRecord, VoucherRecord, VoucherType, Workspace } from "@/types/domain";

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

const workspaces: Workspace[] = [
  {
    id: "ws-trading",
    slug: "trading-division",
    name: "Trading Division",
    industry: "Trading",
    openPeriod: "01 May 2025 - 31 May 2025",
    financialYear: "01 Jul 2024 - 30 Jun 2025",
  },
  {
    id: "ws-tender",
    slug: "tender-division",
    name: "Tender Division",
    industry: "Tender and Government Supply",
    openPeriod: "01 May 2025 - 31 May 2025",
    financialYear: "01 Jul 2024 - 30 Jun 2025",
  },
  {
    id: "ws-rental",
    slug: "rental-division",
    name: "Rental Division",
    industry: "Equipment Rental",
    openPeriod: "01 May 2025 - 31 May 2025",
    financialYear: "01 Jul 2024 - 30 Jun 2025",
  },
  {
    id: "ws-service",
    slug: "service-division",
    name: "Service Division",
    industry: "Service Company",
    openPeriod: "01 May 2025 - 31 May 2025",
    financialYear: "01 Jul 2024 - 30 Jun 2025",
  },
];

function voucherTemplate(
  id: string,
  voucherType: VoucherType,
  voucherNumber: string,
  voucherDate: string,
  partyName: string,
  particulars: string,
  debit: number,
  credit: number,
  status: VoucherRecord["status"],
): VoucherRecord {
  return {
    id,
    workspaceId: "ws-trading",
    voucherType,
    voucherNumber,
    voucherDate,
    createdAt: new Date(voucherDate).toISOString(),
    partyName,
    particulars,
    debit,
    credit,
    amount: Math.max(debit, credit),
    status,
    enteredBy: "Accounts Officer",
    reference: voucherNumber,
    narration: particulars,
    currency: "BDT",
    lines: [
      {
        id: `${id}-1`,
        ledger: partyName,
        description: particulars,
        debit,
        credit,
        costCenter: "Head Office",
        project: "Trading",
        billReference: voucherNumber,
      },
    ],
  };
}

const vouchers: VoucherRecord[] = [
  voucherTemplate("v1", "sales", "SI-2505-00125", "2025-05-20", "Rahim Traders", "Sales Invoice", 0, 25450, "posted"),
  voucherTemplate("v2", "receipt", "RV-2505-00109", "2025-05-20", "Rahim Traders", "Receipt Voucher", 25450, 0, "posted"),
  voucherTemplate("v3", "purchase", "PI-2505-00098", "2025-05-19", "S. S. Corporation", "Purchase Invoice", 18750, 0, "posted"),
  voucherTemplate("v4", "payment", "PV-2505-00112", "2025-05-18", "S. S. Corporation", "Payment Voucher", 0, 18750, "posted"),
  voucherTemplate("v5", "receipt", "RV-2505-00108", "2025-05-18", "ABC Retail Ltd.", "Receipt Voucher", 42100, 0, "posted"),
  voucherTemplate("v6", "journal", "JV-2505-00077", "2025-05-17", "Office Expense", "Journal Voucher", 6500, 6500, "posted"),
  voucherTemplate("v7", "contra", "CN-2505-00056", "2025-05-16", "Cash to Bank", "Contra Voucher", 0, 50000, "posted"),
  voucherTemplate("v8", "sales", "SI-2505-00124", "2025-05-15", "Masud Enterprise", "Sales Invoice", 0, 12600, "posted"),
  voucherTemplate("v9", "receipt", "RV-2505-00107", "2025-05-15", "Masud Enterprise", "Receipt Voucher", 12600, 0, "posted"),
  voucherTemplate("v10", "purchase", "PI-2505-00097", "2025-05-14", "Global Supplies", "Purchase Invoice", 32400, 0, "draft"),
];

const parties: PartyRecord[] = [
  {
    id: "party-customer-rahim",
    workspaceId: "ws-trading",
    name: "Rahim Traders",
    type: "customer",
    contact: "01711-223344",
    address: "Motijheel, Dhaka",
    creditLimit: 500000,
    status: "active",
  },
  {
    id: "party-supplier-ss",
    workspaceId: "ws-trading",
    name: "S. S. Corporation",
    type: "supplier",
    contact: "01844-998877",
    address: "Chattogram Export Zone",
    creditLimit: 250000,
    status: "active",
  },
  {
    id: "party-customer-masud",
    workspaceId: "ws-trading",
    name: "Masud Enterprise",
    type: "customer",
    contact: "01911-664422",
    address: "Narayanganj, Dhaka",
    creditLimit: 300000,
    status: "active",
  },
  {
    id: "party-supplier-global",
    workspaceId: "ws-trading",
    name: "Global Supplies",
    type: "supplier",
    contact: "01611-334455",
    address: "Tejgaon Industrial Area, Dhaka",
    creditLimit: 450000,
    status: "active",
  },
  {
    id: "party-customer-abc",
    workspaceId: "ws-trading",
    name: "ABC Retail Ltd.",
    type: "customer",
    contact: "01555-221144",
    address: "Gulshan, Dhaka",
    creditLimit: 400000,
    status: "active",
  },
];

const stockItems: StockItemRecord[] = [
  {
    id: "stock-irm",
    workspaceId: "ws-trading",
    itemCode: "ITM-1001",
    itemName: "Industrial Raw Material",
    category: "Raw Materials",
    unit: "pcs",
    openingQty: 125,
    openingRate: 1500,
    reorderLevel: 100,
    status: "active",
  },
  {
    id: "stock-pvc",
    workspaceId: "ws-trading",
    itemCode: "ITM-1002",
    itemName: "PVC Pipe 3 inch",
    category: "Raw Materials",
    unit: "pcs",
    openingQty: 218,
    openingRate: 420,
    reorderLevel: 100,
    status: "active",
  },
  {
    id: "stock-paint",
    workspaceId: "ws-trading",
    itemCode: "ITM-1003",
    itemName: "Industrial Paint",
    category: "Consumables",
    unit: "drum",
    openingQty: 42,
    openingRate: 3250,
    reorderLevel: 25,
    status: "active",
  },
];

export function createSeedDataset(): AppDataset {
  const trialStartDate = new Date();
  const trialRenewalDate = addDays(trialStartDate, 30);
  const baseSubscription = {
    currentPlan: {
      code: "FREE_TRIAL_MONTHLY",
      name: "1 Month Free Trial",
      description: "Start instantly and use the full ERP experience free for 30 days before upgrading.",
      priceLabel: "Free",
      billingLabel: "30 days free access",
    },
    status: "free-active" as const,
    renewalDate: trialRenewalDate.toISOString().slice(0, 10),
    daysRemaining: 30,
    usages: [
      { id: "users", label: "Users", used: 1, limit: 2, status: "ok" as const },
      { id: "stock-items", label: "Stock Items", used: 42, limit: 100, status: "ok" as const },
      { id: "monthly-vouchers", label: "Monthly Vouchers", used: 182, limit: 300, status: "ok" as const },
      { id: "storage-mb", label: "Storage (GB)", used: 0.3, limit: 0.5, unit: "GB", status: "ok" as const },
    ],
    plans: [
      {
        code: "FREE_TRIAL_MONTHLY",
        name: "1 Month Free Trial",
        description: "Start instantly and use the full ERP experience free for 30 days before upgrading.",
        priceLabel: "Free",
        billingLabel: "30 days free access",
        isCurrent: true,
        isRecommended: false,
        features: ["Dashboard Access", "Single Workspace", "Basic Accounting", "Basic Inventory", "Basic Reports"],
        limits: [
          { key: "users", label: "Users", value: 2 },
          { key: "workspaces", label: "Workspaces", value: 1 },
          { key: "stock-items", label: "Stock Items", value: 100 },
          { key: "monthly-vouchers", label: "Monthly Vouchers", value: 300 },
          { key: "storage-mb", label: "Storage (GB)", value: 0.5, unit: "GB" },
        ],
      },
      {
        code: "STARTER_MONTHLY",
        name: "Starter",
        description: "Core accounting, daily vouchers, and reporting for a single workspace.",
        priceLabel: "BDT 1,000",
        billingLabel: "per month",
        isCurrent: false,
        isRecommended: false,
        features: ["Dashboard Access", "Single Workspace", "Basic Accounting", "Basic Reports"],
        limits: [
          { key: "users", label: "Users", value: 5 },
          { key: "workspaces", label: "Workspaces", value: 1 },
          { key: "stock-items", label: "Stock Items", value: 300 },
          { key: "monthly-vouchers", label: "Monthly Vouchers", value: 1000 },
          { key: "storage-mb", label: "Storage (GB)", value: 2, unit: "GB" },
        ],
      },
      {
        code: "BUSINESS_MONTHLY",
        name: "Business",
        description: "Inventory, approvals, reports, and multi-workspace operations for growing teams.",
        priceLabel: "BDT 1,000",
        billingLabel: "per month",
        isCurrent: false,
        isRecommended: true,
        features: [
          "Multiple Workspaces",
          "Basic Accounting",
          "Basic Inventory",
          "Approval Workflow",
          "Advanced Reports",
        ],
        limits: [
          { key: "users", label: "Users", value: 20 },
          { key: "workspaces", label: "Workspaces", value: 5 },
          { key: "stock-items", label: "Stock Items", value: 5000 },
          { key: "monthly-vouchers", label: "Monthly Vouchers", value: 10000 },
          { key: "storage-mb", label: "Storage (GB)", value: 10, unit: "GB" },
        ],
      },
      {
        code: "PROFESSIONAL_MONTHLY",
        name: "Professional",
        description: "Advanced controls, API access, demo spaces, and scale-ready limits.",
        priceLabel: "BDT 1,000",
        billingLabel: "per month",
        isCurrent: false,
        isRecommended: false,
        features: [
          "Multiple Workspaces",
          "Advanced Reports",
          "API Access",
          "Demo Workspaces",
          "Subscription Scale Controls",
        ],
        limits: [
          { key: "users", label: "Users", value: 75 },
          { key: "workspaces", label: "Workspaces", value: 20 },
          { key: "stock-items", label: "Stock Items", value: 25000 },
          { key: "monthly-vouchers", label: "Monthly Vouchers", value: 50000 },
          { key: "storage-mb", label: "Storage (GB)", value: 50, unit: "GB" },
        ],
      },
    ],
    upgradeRequest: null,
  };

  return {
    workspaces,
    users: [
      { id: "u-owner", name: "Abu Kawser", email: "owner@bizovix.app", role: "Owner", initials: "AK" },
      { id: "u-acc-manager", name: "Nusrat Jahan", email: "accounts@bizovix.app", role: "Accounts Manager", initials: "NJ" },
      { id: "u-acc-officer", name: "Shuvo Alam", email: "officer@bizovix.app", role: "Accounts Officer", initials: "SA" },
    ],
    parties,
    stockItems,
    vouchers,
    dashboardMetrics: [
      { id: "sales", label: "Total Sales", value: 38050, change: "+12.4%" },
      { id: "purchase", label: "Total Purchase", value: 18750, change: "+5.1%" },
      { id: "receipt", label: "Total Receipt", value: 25450, change: "+9.0%" },
      { id: "payment", label: "Total Payment", value: 18750, change: "-2.2%" },
      { id: "receivable", label: "Receivable", value: 91200, change: "-4.5%" },
      { id: "payable", label: "Payable", value: 54300, change: "+1.1%" },
    ],
    trialBalance: [
      { id: "tb-1", ledger: "Cash in Hand", group: "Cash-in-Hand", debit: 25450, credit: 0 },
      { id: "tb-2", ledger: "Dutch Bangla Bank", group: "Bank Accounts", debit: 1250000, credit: 0 },
      { id: "tb-3", ledger: "Sales Account", group: "Revenue", debit: 0, credit: 38050 },
      { id: "tb-4", ledger: "Purchase Account", group: "Direct Expenses", debit: 18750, credit: 0 },
      { id: "tb-5", ledger: "Rahim Traders", group: "Sundry Debtors", debit: 0, credit: 25450 },
    ],
    summary: [
      { label: "Total Sales", value: 38050, icon: "sales" },
      { label: "Total Purchase", value: 18750, icon: "purchase" },
      { label: "Total Receipt", value: 25450, icon: "receipt" },
      { label: "Total Payment", value: 18750, icon: "payment" },
      { label: "Cash in Hand", value: 25450, icon: "cash" },
      { label: "Bank Balance", value: 1250000, icon: "bank" },
    ],
    approvals: [
      { id: "a1", label: "Sales Invoice", count: 5, amount: 125450 },
      { id: "a2", label: "Purchase Invoice", count: 3, amount: 75300 },
      { id: "a3", label: "Payment Voucher", count: 4, amount: 42100 },
      { id: "a4", label: "Receipt Voucher", count: 2, amount: 12600 },
      { id: "a5", label: "Journal Voucher", count: 1, amount: 8500 },
    ],
    quickShortcuts: [
      { combo: "Alt + G", description: "Go To / Search" },
      { combo: "Ctrl + K", description: "Command Palette" },
      { combo: "Alt + C", description: "Create New" },
      { combo: "Alt + D", description: "Toggle Entry Mode" },
      { combo: "Alt + S", description: "Save" },
      { combo: "Alt + P", description: "Print" },
      { combo: "Esc", description: "Back / Close" },
    ],
    subscription: baseSubscription,
    workspaceSubscriptions: Object.fromEntries(
      workspaces.map((workspace) => [workspace.id, createTrialWorkspaceSubscription(baseSubscription, trialStartDate)]),
    ),
  };
}

