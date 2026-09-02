import { describe, expect, it } from "vitest";

import {
  buildChartBasedBalanceSheet,
  buildReportView,
  getVoucherInventoryCost,
  selectTrialBalanceAccountCandidate,
} from "@/features/screens/reports-workspace-screen";
import type { AppDataset, VoucherRecord } from "@/types/domain";
import type { AccountNode } from "@/types/accounts";

function record(overrides: Partial<VoucherRecord>): VoucherRecord {
  return {
    id: "record",
    workspaceId: "workspace-1",
    voucherType: "purchase",
    documentKind: null,
    sourceVoucherId: null,
    voucherNumber: "DOC-1",
    voucherDate: "2026-07-24",
    createdAt: "2026-07-24T00:00:00.000Z",
    partyName: "Walton",
    particulars: "",
    debit: 0,
    credit: 0,
    amount: 0,
    status: "posted",
    enteredBy: "Tester",
    currency: "BDT",
    lines: [],
    inventoryItems: [],
    ...overrides,
  };
}

function buildDataset(vouchers: VoucherRecord[]): AppDataset {
  return {
    workspaces: [],
    users: [],
    parties: [],
    stockItems: [],
    vouchers,
    dashboardMetrics: [],
    trialBalance: [],
    summary: [],
    approvals: [],
    quickShortcuts: [],
    subscription: {} as AppDataset["subscription"],
    workspaceSubscriptions: {},
  };
}

function account(id: string, name: string, level: AccountNode["level"], nature: AccountNode["nature"], children: AccountNode[] = []): AccountNode {
  return {
    id, code: id, name, level, nature, children, parentId: null, isSystem: true,
    isControlAccount: false, requiresItemDetails: false, status: "ACTIVE", sortOrder: 0,
    createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

describe("Trial Balance account identity", () => {
  it("posts a same-named supplier only to its payable ledger, not its customer ledger", () => {
    const customer = { id: "customer-shahida" };
    const supplier = { id: "supplier-shahida" };
    const candidates = [
      { node: customer, pathKey: "assets current assets receivables accounts receivable customers shahida" },
      { node: supplier, pathKey: "liabilities current liabilities payable accounts payable supplier shahida" },
    ];

    expect(selectTrialBalanceAccountCandidate(candidates, "sundry creditors")).toBe(supplier);
    expect(selectTrialBalanceAccountCandidate(candidates, "sundry debtors")).toBe(customer);
  });
});

describe("ID-authoritative financial reports", () => {
  const salesLedger = account("sales-id", "Renamed Turnover", "LEDGER", "INCOME");
  salesLedger.code = "4110001";
  const salesReturnLedger = account("sales-return-id", "Renamed Returns", "LEDGER", "INCOME");
  salesReturnLedger.code = "4120001";
  const otherIncomeLedger = account("other-income-id", "Renamed Commission Income", "LEDGER", "INCOME");
  otherIncomeLedger.code = "4210001";
  const cogsLedger = account("cogs-id", "Renamed Inventory Cost", "LEDGER", "DIRECT_EXPENSE");
  cogsLedger.code = "5110001";
  const rentLedger = account("rent-id", "Renamed Office Rent", "LEDGER", "INDIRECT_EXPENSE");
  rentLedger.code = "5210001";
  const cashLedger = account("cash-id", "Main Cash", "LEDGER", "ASSET");
  cashLedger.code = "1110001";
  const reportTree = [
    account("income-root", "Income", "MAIN_CATEGORY", "INCOME", [
      Object.assign(account("sales-category", "Sales Accounts", "CATEGORY", "INCOME", [salesLedger]), { code: "4110000" }),
      Object.assign(account("return-category", "Sales Return", "CATEGORY", "INCOME", [salesReturnLedger]), { code: "4120000" }),
      Object.assign(account("other-income-category", "Other Income", "CATEGORY", "INCOME", [otherIncomeLedger]), { code: "4200000" }),
    ]),
    account("expense-root", "Expenses", "MAIN_CATEGORY", "INDIRECT_EXPENSE", [
      Object.assign(account("purchase-category", "Purchase Accounts", "CATEGORY", "DIRECT_EXPENSE", [cogsLedger]), { code: "5110000" }),
      Object.assign(account("indirect-category", "Indirect Expenses", "CATEGORY", "INDIRECT_EXPENSE", [rentLedger]), { code: "5200000" }),
    ]),
    account("asset-root", "Assets", "MAIN_CATEGORY", "ASSET", [cashLedger]),
  ];

  function report(slug: string, vouchers: VoucherRecord[], overrides: Partial<Parameters<typeof buildReportView>[0]> = {}) {
    return buildReportView({
      slug,
      dataset: buildDataset(vouchers),
      workspaceId: "workspace-1",
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
      accountTree: reportTree,
      loanRows: [], chequeRows: [], auditRows: [], warehouseStockRows: [], selectedLoanAccount: "",
      ...overrides,
    });
  }

  it("classifies renamed journal lines by accountId, COA nature, and tree path", () => {
    const journal = record({
      id: "journal-pnl",
      voucherType: "journal",
      voucherNumber: "JV-1",
      lines: [
        { id: "sales", accountId: "sales-id", ledger: "Old Sales Caption", description: "", debit: 0, credit: 1_000 },
        { id: "cogs", accountId: "cogs-id", ledger: "Old Cost Caption", description: "", debit: 400, credit: 0 },
        { id: "rent", accountId: "rent-id", ledger: "Old Rent Caption", description: "", debit: 100, credit: 0 },
        { id: "other", accountId: "other-income-id", ledger: "Old Commission Caption", description: "", debit: 0, credit: 50 },
        // The caption looks like sales, but the authoritative account is an asset.
        { id: "wrong-id", accountId: "cash-id", ledger: "Renamed Turnover", description: "", debit: 0, credit: 999 },
      ],
    });

    const view = report("profit-loss", [journal]);
    if (view.kind !== "profit-loss") throw new Error("expected a profit-and-loss view");
    const values = new Map(view.rows.map((row) => [row.label, row.amount]));

    expect(values.get("Sales Revenue")).toBe(1_000);
    expect(values.get("Less: Cost of Goods Sold (MWA)")).toBe(400);
    expect(values.get("Add: Other Income")).toBe(50);
    expect(values.get("Less: Operating Expenses")).toBe(100);
    expect(values.get("Net Profit / (Loss)")).toBe(550);
    expect(view.otherIncomeBreakdown).toEqual([{ label: "Renamed Commission Income", amount: 50 }]);
    expect(view.operatingExpenseBreakdown).toEqual([{ label: "Renamed Office Rent", amount: 100 }]);
  });

  it("keeps a reversed source in its original period and nets it on the mirror date", () => {
    const source = record({
      id: "sale-source",
      voucherType: "sales",
      documentKind: "invoice",
      voucherNumber: "SI-1",
      voucherDate: "2026-07-10",
      status: "reversed",
      lines: [{ id: "sales", accountId: "sales-id", ledger: "Old Sales Caption", description: "", debit: 0, credit: 1_000 }],
    });
    const mirror = record({
      id: "sale-mirror",
      voucherType: "sales",
      documentKind: "invoice",
      voucherNumber: "SI-1-REV",
      voucherDate: "2026-08-05",
      reversalOfId: "sale-source",
      lines: [{ id: "sales-reversal", accountId: "sales-id", ledger: "Old Sales Caption", description: "", debit: 1_000, credit: 0 }],
    });

    const july = report("profit-loss", [source, mirror]);
    const throughAugust = report("profit-loss", [source, mirror], { toDate: "2026-08-31" });
    if (july.kind !== "profit-loss" || throughAugust.kind !== "profit-loss") throw new Error("expected profit-and-loss views");

    expect(july.rows.find((row) => row.label === "Sales Revenue")?.amount).toBe(1_000);
    expect(throughAugust.rows.find((row) => row.label === "Sales Revenue")?.amount).toBe(0);
  });

  it("filters General Ledger by accountId and includes dated reversal audit pairs", () => {
    const source = record({
      id: "gl-source",
      voucherType: "journal",
      voucherNumber: "JV-OLD",
      voucherDate: "2026-07-10",
      status: "reversed",
      lines: [
        { id: "wanted", accountId: "rent-id", ledger: "Historical Rent Caption", description: "", debit: 100, credit: 0 },
        { id: "same-caption-wrong-id", accountId: "cash-id", ledger: "Historical Rent Caption", description: "", debit: 50, credit: 0 },
      ],
    });
    const mirror = record({
      id: "gl-mirror",
      voucherType: "journal",
      voucherNumber: "JV-OLD-REV",
      voucherDate: "2026-08-05",
      reversalOfId: "gl-source",
      lines: [{ id: "wanted-reversal", accountId: "rent-id", ledger: "Historical Rent Caption", description: "", debit: 0, credit: 100 }],
    });

    const july = report("general-ledger", [source, mirror], {
      accountTree: undefined,
      selectedGeneralLedger: "rent-id",
      selectedGeneralLedgerName: "Renamed Office Rent",
    });
    const throughAugust = report("general-ledger", [source, mirror], {
      accountTree: undefined,
      selectedGeneralLedger: "rent-id",
      selectedGeneralLedgerName: "Renamed Office Rent",
      toDate: "2026-08-31",
    });
    if (july.kind !== "table" || throughAugust.kind !== "table") throw new Error("expected table views");

    expect(july.rows.map((row) => row.Voucher)).toEqual(["JV-OLD"]);
    expect(throughAugust.rows.map((row) => row.Voucher)).toEqual(["JV-OLD", "JV-OLD-REV"]);
  });

  it("keeps same-named party statements separate and applies reversals on their dated mirror", () => {
    const source = record({
      id: "party-source",
      voucherType: "sales",
      documentKind: "invoice",
      voucherNumber: "SI-PARTY",
      voucherDate: "2026-07-10",
      status: "reversed",
      partyId: "customer-1",
      partyName: "Same Name",
      lines: [{ id: "party-line", accountId: "ar-customer-1", ledger: "Historical Name", description: "", debit: 300, credit: 0 }],
    });
    const mirror = record({
      id: "party-mirror",
      voucherType: "sales",
      documentKind: "invoice",
      voucherNumber: "SI-PARTY-REV",
      voucherDate: "2026-08-05",
      reversalOfId: "party-source",
      partyId: "customer-1",
      partyName: "Same Name",
      lines: [{ id: "party-reversal", accountId: "ar-customer-1", ledger: "Historical Name", description: "", debit: 0, credit: 300 }],
    });
    const dataset = buildDataset([source, mirror]);
    dataset.parties = [
      { id: "customer-1", workspaceId: "workspace-1", ledgerAccountId: "ar-customer-1", name: "Same Name", type: "customer", contact: "1", address: "", creditLimit: 0, status: "active" },
      { id: "customer-2", workspaceId: "workspace-1", ledgerAccountId: "ar-customer-2", name: "Same Name", type: "customer", contact: "2", address: "", creditLimit: 0, status: "active" },
    ];
    const base = {
      slug: "customer-statement",
      dataset,
      workspaceId: "workspace-1",
      fromDate: "2026-07-01",
      loanRows: [], chequeRows: [], auditRows: [], warehouseStockRows: [], selectedLoanAccount: "",
    };
    const july = buildReportView({ ...base, toDate: "2026-07-31" });
    const throughAugust = buildReportView({ ...base, toDate: "2026-08-31" });
    if (july.kind !== "table" || throughAugust.kind !== "table") throw new Error("expected table views");

    expect(july.rows.find((row) => row._partyId === "customer-1")?.Due).toBe("300.00 ৳");
    expect(july.rows.find((row) => row._partyId === "customer-2")?.Due).toBe("0.00 ৳");
    expect(throughAugust.rows.find((row) => row._partyId === "customer-1")?.Due).toBe("0.00 ৳");
  });

  it("derives party B/F from the posted opening journal without adding the master scalar again", () => {
    const openingJournal = record({
      id: "opening-journal",
      voucherType: "journal",
      voucherNumber: "OB-PARTY-1",
      voucherDate: "2026-06-30",
      partyId: "customer-1",
      partyName: "Opening Customer",
      lines: [
        { id: "opening-party", accountId: "ar-customer-1", ledger: "Opening Customer", description: "", debit: 300, credit: 0 },
        { id: "opening-equity", accountId: "opening-equity-id", ledger: "Opening Balance Equity", description: "", debit: 0, credit: 300 },
      ],
    });
    const invoice = record({
      id: "period-invoice",
      voucherType: "sales",
      documentKind: "invoice",
      voucherNumber: "SI-PERIOD",
      voucherDate: "2026-07-10",
      partyId: "customer-1",
      partyName: "Opening Customer",
      lines: [{ id: "period-party", accountId: "ar-customer-1", ledger: "Opening Customer", description: "", debit: 100, credit: 0 }],
    });
    const dataset = buildDataset([openingJournal, invoice]);
    dataset.parties = [{
      id: "customer-1",
      workspaceId: "workspace-1",
      ledgerAccountId: "ar-customer-1",
      name: "Opening Customer",
      type: "customer",
      contact: "1",
      address: "",
      creditLimit: 0,
      openingBalance: 300,
      status: "active",
    }];

    const view = buildReportView({
      slug: "customer-statement",
      dataset,
      workspaceId: "workspace-1",
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
      loanRows: [], chequeRows: [], auditRows: [], warehouseStockRows: [], selectedLoanAccount: "",
    });
    if (view.kind !== "table") throw new Error("expected a table view");

    expect(view.rows[0].Due).toBe("400.00 ৳");
    expect(view.rowDetails?.[0].openingBalance).toBe(300);
    expect(view.rowDetails?.[0].transactions.map((entry) => entry.voucherNumber)).toEqual(["SI-PERIOD"]);
  });
});

describe("dead stock report", () => {
  it("uses the configured full-month threshold, last sale, and positive on-hand stock", () => {
    const recentSale = record({
      id: "recent-sale",
      voucherType: "sales",
      documentKind: "invoice",
      voucherDate: "2026-07-01",
      inventoryItems: [{ id: "sale-line", itemName: "Recently Sold", quantity: 1, unitPrice: 100 }],
    });
    const zeroStockSale = record({
      id: "zero-stock-sale",
      voucherType: "sales",
      documentKind: "invoice",
      voucherDate: "2025-01-01",
      inventoryItems: [{ id: "zero-line", itemName: "Zero Stock", quantity: 1, unitPrice: 100 }],
    });
    const dataset = buildDataset([recentSale, zeroStockSale]);
    dataset.stockItems = [
      { id: "dead", workspaceId: "workspace-1", itemCode: "DEAD", itemName: "Dead Item", category: "Test", unit: "pcs", openingQty: 5, openingRate: 100, reorderLevel: 0, status: "active", createdAt: "2025-07-31T00:00:00.000Z" },
      { id: "young", workspaceId: "workspace-1", itemCode: "YOUNG", itemName: "Young Item", category: "Test", unit: "pcs", openingQty: 5, openingRate: 100, reorderLevel: 0, status: "active", createdAt: "2025-08-01T00:00:00.000Z" },
      { id: "recent", workspaceId: "workspace-1", itemCode: "RECENT", itemName: "Recently Sold", category: "Test", unit: "pcs", openingQty: 5, openingRate: 100, reorderLevel: 0, status: "active", createdAt: "2024-01-01T00:00:00.000Z" },
      { id: "zero", workspaceId: "workspace-1", itemCode: "ZERO", itemName: "Zero Stock", category: "Test", unit: "pcs", openingQty: 1, openingRate: 100, reorderLevel: 0, status: "active", createdAt: "2024-01-01T00:00:00.000Z" },
    ];

    const view = buildReportView({
      slug: "dead-stock-report",
      dataset,
      workspaceId: "workspace-1",
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
      deadStockMonths: 12,
      loanRows: [], chequeRows: [], auditRows: [], warehouseStockRows: [], selectedLoanAccount: "",
    });

    if (view.kind !== "table") throw new Error("expected a table view");
    expect(view.rows.map((row) => row["Item Name"])).toEqual(["Dead Item"]);
    expect(view.rows[0]["Last Sale"]).toBe("Never sold");
    expect(view.rows[0]["Inactive Months"]).toBe("12");
  });
});

describe("Delivery Note sourced invoice cost", () => {
  function movement(overrides: Partial<NonNullable<AppDataset["inventoryMovements"]>[number]>) {
    return {
      id: "movement",
      workspaceId: "workspace-1",
      warehouseId: "warehouse-1",
      inventoryItemId: "item-1",
      itemName: "Item One",
      itemCode: "ITEM-1",
      unit: "pcs",
      transactionType: "DELIVERY_NOTE",
      transactionId: "dn-1",
      transactionLineId: "dn-line-1",
      referenceNo: "DN-1",
      movementType: "OUT" as const,
      quantity: 10,
      unitCost: 40,
      movementValue: 400,
      balanceQuantity: 0,
      balanceValue: 0,
      averageCost: 40,
      transactionDate: "2026-07-10T00:00:00.000Z",
      createdAt: "2026-07-10T00:00:00.000Z",
      ...overrides,
    };
  }

  it("sums exact partial costs across every Delivery Note instead of only the header source", () => {
    const firstDelivery = record({
      id: "dn-1",
      documentKind: "delivery-note",
      sourceVoucherId: "so-1",
      inventoryItems: [{ id: "dn-line-1", inventoryItemId: "item-1", itemName: "Item One", quantity: 10, unitPrice: 100 }],
    });
    const secondDelivery = record({
      id: "dn-2",
      documentKind: "delivery-note",
      sourceVoucherId: "so-2",
      inventoryItems: [{ id: "dn-line-2", inventoryItemId: "item-2", itemName: "Item Two", quantity: 5, unitPrice: 200 }],
    });
    const invoice = record({
      id: "si-1",
      voucherType: "sales",
      documentKind: null,
      sourceVoucherId: firstDelivery.id,
      inventoryItems: [
        { id: "si-line-1", sourceInventoryLineId: "dn-line-1", inventoryItemId: "item-1", itemName: "Item One", quantity: 3, unitPrice: 100 },
        { id: "si-line-2", sourceInventoryLineId: "dn-line-2", inventoryItemId: "item-2", itemName: "Item Two", quantity: 2, unitPrice: 200 },
      ],
    });
    const dataset = buildDataset([firstDelivery, secondDelivery, invoice]);
    dataset.inventoryMovements = [
      movement({ id: "movement-1", transactionId: "dn-1", transactionLineId: "dn-line-1", unitCost: 40, movementValue: 400 }),
      movement({
        id: "movement-2",
        transactionId: "dn-2",
        transactionLineId: "dn-line-2",
        inventoryItemId: "item-2",
        itemName: "Item Two",
        itemCode: "ITEM-2",
        quantity: 5,
        unitCost: 70,
        movementValue: 350,
      }),
    ];

    expect(getVoucherInventoryCost(dataset, invoice).total).toBe(260);
  });

  it("uses one source movement rate for several partial rows without dropping either row", () => {
    const delivery = record({
      id: "dn-1",
      documentKind: "delivery-note",
      inventoryItems: [{ id: "dn-line-1", inventoryItemId: "item-1", itemName: "Item One", quantity: 10, unitPrice: 100 }],
    });
    const invoice = record({
      id: "si-parts",
      voucherType: "sales",
      sourceVoucherId: delivery.id,
      inventoryItems: [
        { id: "si-part-1", sourceInventoryLineId: "dn-line-1", inventoryItemId: "item-1", itemName: "Item One", quantity: 2, unitPrice: 100 },
        { id: "si-part-2", sourceInventoryLineId: "dn-line-1", inventoryItemId: "item-1", itemName: "Item One", quantity: 1, unitPrice: 100 },
      ],
    });
    const dataset = buildDataset([delivery, invoice]);
    dataset.inventoryMovements = [movement({ unitCost: 40, movementValue: 400 })];

    expect(getVoucherInventoryCost(dataset, invoice).total).toBe(120);
  });
});

describe("Cash Flow Statement money-channel filter", () => {
  const cashLedger = account("cash-ledger", "Main Cash", "LEDGER", "ASSET");
  cashLedger.openingBalance = 10;
  const bankLedger = account("bank-ledger", "City Bank", "LEDGER", "ASSET");
  bankLedger.bankDetails = { bankName: "City Bank", accountNumber: "1", branchName: "", routingNumber: "", swiftCode: "", country: "", rmName: "", rmNumber: "", note: "", accountKind: "BANK" };
  const mfsLedger = account("mfs-ledger", "bKash", "LEDGER", "ASSET");
  mfsLedger.bankDetails = { bankName: "bKash", accountNumber: "2", branchName: "", routingNumber: "", swiftCode: "", country: "", rmName: "", rmNumber: "", note: "", accountKind: "MFS" };
  const cashEquivalentTree = [Object.assign(account("cash-equivalents", "Cash & Cash Equivalents", "CATEGORY", "ASSET", [
    Object.assign(account("cash-accounts", "Cash Accounts", "CATEGORY", "ASSET", [cashLedger]), { code: "1221000" }),
    Object.assign(account("bank-mfs", "Bank & MFS Accounts", "CATEGORY", "ASSET", [bankLedger, mfsLedger]), { code: "1222000" }),
  ]), { code: "1220000" })];
  const cashReceipt = record({
    id: "cash-receipt",
    voucherType: "receipt",
    amount: 100,
    lines: [
      { id: "cash", ledger: "Main Cash", description: "Cash received", debit: 100, credit: 0, moneyAccountType: "CASH" },
      { id: "party-1", ledger: "Customer", description: "Customer", debit: 0, credit: 100 },
    ],
  });
  const bankReceipt = record({
    id: "bank-receipt",
    voucherType: "receipt",
    amount: 250,
    lines: [
      { id: "bank", ledger: "City Bank", description: "Bank receipt", debit: 250, credit: 0, moneyAccountType: "BANK" },
      { id: "party-2", ledger: "Customer", description: "Customer", debit: 0, credit: 250 },
    ],
  });
  const mfsPayment = record({
    id: "mfs-payment",
    voucherType: "payment",
    amount: 40,
    lines: [
      { id: "supplier", ledger: "Supplier", description: "Supplier", debit: 40, credit: 0 },
      { id: "mfs", ledger: "bKash", description: "MFS payment", debit: 0, credit: 40, moneyAccountType: "MFS" },
    ],
  });

  function cashFlow(channel: "all" | "cash" | "bank" | "mfs") {
    return buildReportView({
      slug: "cashflow-statement",
      dataset: buildDataset([cashReceipt, bankReceipt, mfsPayment]),
      workspaceId: "workspace-1",
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
      cashFlowChannel: channel,
      accountTree: cashEquivalentTree,
      loanRows: [], chequeRows: [], auditRows: [], warehouseStockRows: [], selectedLoanAccount: "",
    });
  }

  it("shows only real cash ledger movement when Cash is selected", () => {
    const view = cashFlow("cash");
    if (view.kind !== "table") throw new Error("expected a table view");
    expect(view.summary.map((item) => [item.label, item.value])).toEqual([
      ["Money In", "100.00 ৳"],
      ["Money Out", "0.00 ৳"],
      ["Net", "100.00 ৳"],
    ]);
  });

  it("separates bank and MFS movement and reconciles all channels", () => {
    const bank = cashFlow("bank");
    const mfs = cashFlow("mfs");
    const all = cashFlow("all");
    if (bank.kind !== "table" || mfs.kind !== "table" || all.kind !== "table") throw new Error("expected table views");
    expect(bank.summary[0].value).toBe("250.00 ৳");
    expect(mfs.summary[1].value).toBe("40.00 ৳");
    expect(all.summary.map((item) => item.value)).toEqual(["350.00 ৳", "40.00 ৳", "310.00 ৳"]);
    expect(all.cashEquivalentRows?.map((row) => [row.ledger, row.channel, row.closing])).toEqual([
      ["City Bank", "bank", 250],
      ["Main Cash", "cash", 110],
      ["bKash", "mfs", -40],
    ]);
    expect(bank.cashEquivalentRows?.map((row) => row.ledger)).toEqual(["City Bank"]);
    expect(mfs.cashEquivalentRows?.map((row) => row.ledger)).toEqual(["bKash"]);
  });

  it("keeps a reversed cash source and its dated mirror so the ledger nets to zero", () => {
    const source = record({
      id: "cash-source",
      voucherType: "receipt",
      voucherNumber: "RV-REVERSIBLE",
      status: "reversed",
      lines: [
        { id: "cash-source-line", ledger: "Main Cash", description: "Collected", debit: 100, credit: 0, moneyAccountType: "CASH" },
        { id: "party-source-line", ledger: "Customer", description: "Customer", debit: 0, credit: 100 },
      ],
    });
    const mirror = record({
      id: "cash-mirror",
      voucherType: "receipt",
      voucherNumber: "RV-REVERSIBLE-REV",
      reversalOfId: source.id,
      lines: [
        { id: "cash-mirror-line", ledger: "Main Cash", description: "Reversal", debit: 0, credit: 100, moneyAccountType: "CASH" },
        { id: "party-mirror-line", ledger: "Customer", description: "Reversal", debit: 100, credit: 0 },
      ],
    });
    const view = buildReportView({
      slug: "cashflow-statement",
      dataset: buildDataset([source, mirror]),
      workspaceId: "workspace-1",
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
      cashFlowChannel: "cash",
      accountTree: cashEquivalentTree,
      loanRows: [], chequeRows: [], auditRows: [], warehouseStockRows: [], selectedLoanAccount: "",
    });

    if (view.kind !== "table") throw new Error("expected a table view");
    expect(view.summary.map((item) => Number(item.value.replace(/[^0-9.-]/g, "")))).toEqual([100, 100, 0]);
    expect(view.cashEquivalentRows?.find((row) => row.ledgerId === "cash-ledger")?.closing).toBe(10);
  });
});

describe("Chart-based Balance Sheet", () => {
  it("uses COA account identity after a payable ledger is renamed", () => {
    const cash = account("cash", "Cash in Hand", "LEDGER", "ASSET");
    const assets = account("assets", "Assets", "MAIN_CATEGORY", "ASSET", [
      account("current-assets", "Current Assets", "CATEGORY", "ASSET", [cash]),
    ]);
    const renamedPayable = account("other-payable-1", "Miscellaneous Payable", "LEDGER", "LIABILITY");
    const liabilities = account("liabilities", "Liabilities", "MAIN_CATEGORY", "LIABILITY", [
      account("current-liabilities", "Current Liabilities", "CATEGORY", "LIABILITY", [renamedPayable]),
    ]);
    const equity = account("equity", "Equity", "MAIN_CATEGORY", "EQUITY");

    const view = buildChartBasedBalanceSheet({
      accountTree: [assets, liabilities, equity],
      trialBalanceRows: [
        { accountId: "cash", ledger: "Cash in Hand", group: "Cash-in-Hand", debit: 68_000, credit: 0 },
        // Historical voucher lines retain their original caption, but their
        // stable account id still points at the renamed COA ledger above.
        { accountId: "other-payable-1", ledger: "Miscellanies Expenses", group: "General Ledger", debit: 0, credit: 68_000 },
      ],
      supplierNames: [],
      closingStock: 0,
      currentYearProfit: 0,
      toDate: "2026-07-20",
    });

    expect(view.totalAssets).toBe(68_000);
    expect(view.totalLiabilities).toBe(68_000);
    expect(view.liabilities.flatMap((section) => section.lines).some((line) => line.label === "Miscellaneous Payable" && line.amount === 68_000)).toBe(true);
  });

  it("never remaps an unknown account id through a same-named COA caption", () => {
    const cash = account("cash", "Cash in Hand", "LEDGER", "ASSET");
    const assets = account("assets", "Assets", "MAIN_CATEGORY", "ASSET", [
      account("current-assets", "Current Assets", "CATEGORY", "ASSET", [cash]),
    ]);
    const payable = account("payable-real", "Supplier Control", "LEDGER", "LIABILITY");
    const liabilities = account("liabilities", "Liabilities", "MAIN_CATEGORY", "LIABILITY", [
      account("current-liabilities", "Current Liabilities", "CATEGORY", "LIABILITY", [payable]),
    ]);

    const view = buildChartBasedBalanceSheet({
      accountTree: [assets, liabilities, account("equity", "Equity", "MAIN_CATEGORY", "EQUITY")],
      trialBalanceRows: [
        { accountId: "cash", ledger: "Cash in Hand", group: "Cash-in-Hand", debit: 100, credit: 0 },
        // The stale/missing id is authoritative. Its coincidentally matching
        // caption must not charge payable-real.
        { accountId: "missing-payable-id", ledger: "Supplier Control", group: "Sundry Creditors", debit: 0, credit: 100 },
      ],
      supplierNames: ["Supplier Control"],
      closingStock: 0,
      currentYearProfit: 0,
      toDate: "2026-08-31",
    });

    expect(view.totalAssets).toBe(100);
    expect(view.totalLiabilities).toBe(0);
    expect(view.liabilities.flatMap((section) => section.lines).some((line) => line.label === "Supplier Control" && line.amount !== 0)).toBe(false);
  });

  it("includes perpetual closing stock and FY profit in their fixed COA categories", () => {
    const cash = account("cash", "Cash in Hand", "LEDGER", "ASSET");
    const closingBalance = account("closing", "Closing Balance", "CATEGORY", "ASSET");
    const assets = account("assets", "Assets", "MAIN_CATEGORY", "ASSET", [
      account("current-assets", "Current Assets", "CATEGORY", "ASSET", [closingBalance, cash]),
    ]);
    const capital = account("capital", "Capital Accounts", "LEDGER", "EQUITY");
    const pnl = account("pnl", "Profit & Loss Accounts", "CATEGORY", "EQUITY");
    const equity = account("equity", "Equity", "MAIN_CATEGORY", "EQUITY", [
      account("capital-reserve", "Capital & Reserve", "CATEGORY", "EQUITY", [capital]),
      pnl,
    ]);
    const payable = account("payable", "Accounts Payable Controls (Supplier)", "CATEGORY", "LIABILITY");
    const liabilities = account("liabilities", "Liabilities", "MAIN_CATEGORY", "LIABILITY", [payable]);

    const view = buildChartBasedBalanceSheet({
      accountTree: [assets, liabilities, equity],
      trialBalanceRows: [
        { ledger: "Cash in Hand", group: "Cash-in-Hand", debit: 4_800_000, credit: 0 },
        { ledger: "Capital Accounts", group: "Capital & Reserve", debit: 0, credit: 5_000_000 },
        { ledger: "Shahida", group: "Sundry Creditors", debit: 0, credit: 34_000 },
      ],
      supplierNames: ["Shahida"],
      closingStock: 267_000,
      currentYearProfit: 33_000,
      toDate: "2026-08-20",
    });

    expect(view.totalAssets).toBe(5_067_000);
    expect(view.totalLiabilities).toBe(5_067_000);
  });
});

describe("Bill Wise Report carries an Order's advance forward", () => {
  it("reproduces PB-20260813-4008: Order advance + Return both net out of the bill's balance", () => {
    // Purchase Orders are pre-ledger documents — saved with status "pending",
    // never "posted" (see voucher-entry-screen.tsx's isPreLedgerDocument) — so
    // they are excluded from the report's normal posted-voucher pool and have
    // to be resolved through the structural (status-inclusive) lookup instead.
    const order = record({
      id: "order-1",
      documentKind: "purchase-order",
      voucherNumber: "PO-1001",
      reference: "PO-1001",
      status: "pending",
      amount: 591_000,
    });
    const advancePayment = record({
      id: "advance-1",
      voucherType: "payment",
      voucherNumber: "PV-1",
      voucherDate: "2026-07-20",
      sourceVoucherId: order.id,
      amount: 200_000,
      lines: [
        { id: "l1", ledger: "Cash", description: "Cash payment", debit: 0, credit: 200_000, moneyAccountType: "CASH" },
        { id: "l2", ledger: "Walton", description: "Advance to Walton against PO-1001", debit: 200_000, credit: 0, billReference: "PO-1001" },
      ],
    });
    const receiptNote = record({
      id: "receipt-1",
      documentKind: "receipt-note",
      voucherNumber: "RN-1",
      voucherDate: "2026-07-22",
      sourceVoucherId: order.id,
      amount: 591_000,
    });
    const bill = record({
      id: "bill-1",
      documentKind: "bill",
      voucherNumber: "PB-20260813-4008",
      voucherDate: "2026-07-24",
      sourceVoucherId: receiptNote.id,
      amount: 591_000,
      settlementMode: "accounts-payable",
    });
    const returnNote = record({
      id: "return-1",
      voucherType: "debit-note",
      voucherNumber: "PR-20260815-3601",
      voucherDate: "2026-07-25",
      amount: 159_000,
      lines: [{ id: "l3", ledger: "Walton", description: "Return", debit: 159_000, credit: 0, billReference: "PB-20260813-4008" }],
    });

    const dataset = buildDataset([order, advancePayment, receiptNote, bill, returnNote]);
    const view = buildReportView({
      slug: "bill-wise-report",
      dataset,
      workspaceId: "workspace-1",
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
      loanRows: [],
      chequeRows: [],
      auditRows: [],
      warehouseStockRows: [],
      selectedLoanAccount: "",
    });

    if (view.kind !== "table") throw new Error("expected a table view");
    const detail = view.billDetails?.find((row) => row.voucherNumber === "PB-20260813-4008");
    expect(detail).toBeTruthy();
    expect(detail!.advanceAmount).toBe(200_000);
    expect(detail!.returnedAmount).toBe(159_000);
    // 591,000 bill - 200,000 advance - 159,000 return = 232,000 still owed.
    expect(detail!.balance).toBe(232_000);
    expect(detail!.paidAmount).toBe(200_000);
    expect(detail!.events.some((event) => event.type === "Advance Payment" && event.voucherNumber === "PV-1")).toBe(true);
  });
});

describe("Customer & Supplier Comparison Report", () => {
  const selectedCustomer = {
    id: "customer-selected",
    workspaceId: "workspace-1",
    ledgerAccountId: "ar-selected",
    name: "Dual Role Trading",
    type: "customer" as const,
    contact: "01700000001",
    address: "Dhaka",
    creditLimit: 0,
    status: "active" as const,
  };
  const selectedSupplier = {
    id: "supplier-selected",
    workspaceId: "workspace-1",
    ledgerAccountId: "ap-selected",
    name: "Dual Role Trading",
    type: "supplier" as const,
    contact: "01700000002",
    address: "Dhaka",
    creditLimit: 0,
    status: "active" as const,
  };
  const sameNamedOtherCustomer = { ...selectedCustomer, id: "customer-other", ledgerAccountId: "ar-other", contact: "01700000003" };
  const sameNamedOtherSupplier = { ...selectedSupplier, id: "supplier-other", ledgerAccountId: "ap-other", contact: "01700000004" };
  const cashLedger = account("comparison-cash", "Main Cash", "LEDGER", "ASSET");
  const comparisonAccountTree = [
    Object.assign(
      account("comparison-assets", "Assets", "MAIN_CATEGORY", "ASSET", [
        Object.assign(account("comparison-cash-group", "Cash Accounts", "CATEGORY", "ASSET", [cashLedger]), { code: "1221000" }),
      ]),
      { code: "1000000" },
    ),
  ];
  const amount = (value: string | undefined) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;

  function comparisonReport(vouchers: VoucherRecord[], overrides: Partial<Parameters<typeof buildReportView>[0]> = {}) {
    const dataset = buildDataset(vouchers);
    dataset.parties = [selectedCustomer, selectedSupplier, sameNamedOtherCustomer, sameNamedOtherSupplier];
    return buildReportView({
      slug: "customer-supplier-comparison",
      dataset,
      workspaceId: "workspace-1",
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
      accountTree: comparisonAccountTree,
      selectedComparisonCustomerId: selectedCustomer.id,
      selectedComparisonSupplierId: selectedSupplier.id,
      loanRows: [], chequeRows: [], auditRows: [], warehouseStockRows: [], selectedLoanAccount: "",
      ...overrides,
    });
  }

  it("requires separate customer and supplier IDs", () => {
    const dataset = buildDataset([]);
    dataset.parties = [selectedCustomer, selectedSupplier];
    const view = buildReportView({
      slug: "customer-supplier-comparison",
      dataset,
      workspaceId: "workspace-1",
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
      loanRows: [], chequeRows: [], auditRows: [], warehouseStockRows: [], selectedLoanAccount: "",
    });
    if (view.kind !== "table") throw new Error("expected a table view");

    expect(view.title).toBe("Customer & Supplier Comparison Report");
    expect(view.rows).toEqual([]);
    expect(view.emptyMessage).toContain("Select one customer and one supplier");
  });

  it("combines the six financial activities chronologically without merging same-named party IDs or workflow documents", () => {
    const openingCustomer = record({
      id: "opening-customer",
      voucherType: "journal",
      voucherNumber: "OB-C",
      voucherDate: "2026-06-30",
      partyId: selectedCustomer.id,
      partyName: selectedCustomer.name,
      lines: [{ id: "opening-customer-line", accountId: "ar-selected", ledger: "Old Customer Caption", description: "", debit: 50, credit: 0 }],
    });
    const openingSupplier = record({
      id: "opening-supplier",
      voucherType: "journal",
      voucherNumber: "OB-S",
      voucherDate: "2026-06-30",
      partyId: selectedSupplier.id,
      partyName: selectedSupplier.name,
      lines: [{ id: "opening-supplier-line", accountId: "ap-selected", ledger: "Old Supplier Caption", description: "", debit: 0, credit: 25 }],
    });
    const sale = record({
      id: "sale-selected",
      voucherType: "sales",
      documentKind: "invoice",
      voucherNumber: "SI-1",
      voucherDate: "2026-07-02",
      createdAt: "2026-07-02T09:00:00.000Z",
      partyId: selectedCustomer.id,
      partyName: selectedCustomer.name,
      amount: 100,
      lines: [
        { id: "sale-party", accountId: "ar-selected", ledger: "Old Customer Caption", description: "", debit: 60, credit: 0 },
        { id: "sale-cash", accountId: cashLedger.id, ledger: "Old Cash Caption", description: "", debit: 40, credit: 0 },
        { id: "sale-income", accountId: "sales-account", ledger: "Sales", description: "", debit: 0, credit: 100 },
      ],
    });
    const salesReturn = record({
      id: "sales-return-selected",
      voucherType: "credit-note",
      voucherNumber: "SR-1",
      voucherDate: "2026-07-03",
      partyId: selectedCustomer.id,
      partyName: selectedCustomer.name,
      amount: 20,
      lines: [{ id: "sales-return-party", accountId: "ar-selected", ledger: "Old Customer Caption", description: "", debit: 0, credit: 20 }],
    });
    const receipt = record({
      id: "receipt-selected",
      voucherType: "receipt",
      voucherNumber: "RV-1",
      voucherDate: "2026-07-04",
      partyId: selectedCustomer.id,
      partyName: selectedCustomer.name,
      amount: 30,
      lines: [
        { id: "receipt-cash", accountId: cashLedger.id, ledger: "Old Cash Caption", description: "", debit: 30, credit: 0 },
        { id: "receipt-party", accountId: "ar-selected", ledger: "Old Customer Caption", description: "", debit: 0, credit: 30 },
      ],
    });
    const purchase = record({
      id: "purchase-selected",
      voucherType: "purchase",
      documentKind: "bill",
      voucherNumber: "PB-1",
      voucherDate: "2026-07-05",
      partyId: selectedSupplier.id,
      partyName: selectedSupplier.name,
      amount: 200,
      lines: [
        { id: "purchase-party", accountId: "ap-selected", ledger: "Old Supplier Caption", description: "", debit: 0, credit: 150 },
        { id: "purchase-cash", accountId: cashLedger.id, ledger: "Old Cash Caption", description: "", debit: 0, credit: 50 },
        { id: "purchase-stock", accountId: "inventory-account", ledger: "Inventory", description: "", debit: 200, credit: 0 },
      ],
    });
    const purchaseReturn = record({
      id: "purchase-return-selected",
      voucherType: "debit-note",
      voucherNumber: "PR-1",
      voucherDate: "2026-07-06",
      partyId: selectedSupplier.id,
      partyName: selectedSupplier.name,
      amount: 30,
      lines: [{ id: "purchase-return-party", accountId: "ap-selected", ledger: "Old Supplier Caption", description: "", debit: 30, credit: 0 }],
    });
    const payment = record({
      id: "payment-selected",
      voucherType: "payment",
      voucherNumber: "PV-1",
      voucherDate: "2026-07-07",
      partyId: selectedSupplier.id,
      partyName: selectedSupplier.name,
      amount: 40,
      lines: [
        { id: "payment-party", accountId: "ap-selected", ledger: "Old Supplier Caption", description: "", debit: 40, credit: 0 },
        { id: "payment-cash", accountId: cashLedger.id, ledger: "Old Cash Caption", description: "", debit: 0, credit: 40 },
      ],
    });
    const adjustment = record({
      id: "customer-adjustment",
      voucherType: "journal",
      voucherNumber: "JV-1",
      voucherDate: "2026-07-08",
      partyId: selectedCustomer.id,
      partyName: selectedCustomer.name,
      lines: [{ id: "adjustment-party", accountId: "ar-selected", ledger: "Old Customer Caption", description: "", debit: 5, credit: 0 }],
    });
    const excludedWorkflow = [
      record({ id: "sales-order", voucherType: "sales", documentKind: "sale-order", voucherNumber: "SO-X", voucherDate: "2026-07-09", partyId: selectedCustomer.id, amount: 999 }),
      record({ id: "delivery-note", voucherType: "sales", documentKind: "delivery-note", voucherNumber: "DN-X", voucherDate: "2026-07-10", partyId: selectedCustomer.id, amount: 999 }),
      record({ id: "purchase-order", voucherType: "purchase", documentKind: "purchase-order", voucherNumber: "PO-X", voucherDate: "2026-07-11", partyId: selectedSupplier.id, amount: 999 }),
      record({ id: "receipt-note", voucherType: "purchase", documentKind: "receipt-note", voucherNumber: "GRN-X", voucherDate: "2026-07-12", partyId: selectedSupplier.id, amount: 999 }),
    ];
    const sameNameWrongId = record({
      id: "wrong-id-sale",
      voucherType: "sales",
      documentKind: "invoice",
      voucherNumber: "SI-WRONG",
      voucherDate: "2026-07-01",
      partyId: sameNamedOtherCustomer.id,
      partyName: sameNamedOtherCustomer.name,
      amount: 777,
      lines: [{ id: "wrong-party-line", accountId: "ar-other", ledger: "Old Customer Caption", description: "", debit: 777, credit: 0 }],
    });

    const view = comparisonReport([
      payment,
      ...excludedWorkflow,
      sale,
      openingSupplier,
      sameNameWrongId,
      purchaseReturn,
      receipt,
      adjustment,
      openingCustomer,
      purchase,
      salesReturn,
    ]);
    if (view.kind !== "table") throw new Error("expected a table view");

    expect(view.rows.map((row) => row.Voucher)).toEqual(["B/F", "SI-1", "SR-1", "RV-1", "PB-1", "PR-1", "PV-1", "JV-1", "C/F"]);
    expect(view.rows.map((row) => row.Voucher)).not.toContain("SI-WRONG");
    expect(view.rows.map((row) => row.Voucher)).not.toContain("SO-X");
    expect(view.rows.map((row) => row.Voucher)).not.toContain("GRN-X");

    const summaries = new Map(view.summary.map((item) => [item.label, amount(item.value)]));
    expect(summaries).toEqual(new Map([
      ["Sales", 100],
      ["Purchase", 200],
      ["Sales Return", 20],
      ["Purchase Return", 30],
      ["Net Collection", 70],
      ["Net Payment", 90],
    ]));
    const closing = view.rows.at(-1)!;
    expect(amount(closing["Customer Due"])).toBe(65);
    expect(amount(closing["Supplier Due"])).toBe(105);
    expect(amount(closing["Net Position"])).toBe(-40);
    expect(view.rows.find((row) => row.Voucher === "JV-1")?.Transaction).toBe("Customer Adjustment");
  });

  it("keeps a reversed source in its original period and nets it on the dated reversal mirror", () => {
    const source = record({
      id: "comparison-sale-source",
      voucherType: "sales",
      documentKind: "invoice",
      voucherNumber: "SI-100",
      voucherDate: "2026-07-10",
      createdAt: "2026-07-10T09:00:00.000Z",
      status: "reversed",
      partyId: selectedCustomer.id,
      partyName: selectedCustomer.name,
      amount: 100,
      lines: [{ id: "source-party", accountId: "ar-selected", ledger: "Old Customer Caption", description: "", debit: 100, credit: 0 }],
    });
    const mirror = record({
      id: "comparison-sale-mirror",
      voucherType: "sales",
      documentKind: "invoice",
      voucherNumber: "SI-100-REV",
      voucherDate: "2026-08-05",
      createdAt: "2026-08-05T09:00:00.000Z",
      reversalOfId: source.id,
      partyId: selectedCustomer.id,
      partyName: selectedCustomer.name,
      amount: 100,
      lines: [{ id: "mirror-party", accountId: "ar-selected", ledger: "Old Customer Caption", description: "", debit: 0, credit: 100 }],
    });

    const july = comparisonReport([mirror, source]);
    const throughAugust = comparisonReport([mirror, source], { toDate: "2026-08-31" });
    if (july.kind !== "table" || throughAugust.kind !== "table") throw new Error("expected table views");

    expect(amount(july.summary.find((item) => item.label === "Sales")?.value)).toBe(100);
    expect(amount(july.rows.at(-1)?.["Customer Due"])).toBe(100);
    expect(amount(throughAugust.summary.find((item) => item.label === "Sales")?.value)).toBe(0);
    expect(amount(throughAugust.rows.at(-1)?.["Customer Due"])).toBe(0);
    expect(throughAugust.rows.find((row) => row.Voucher === "SI-100-REV")?.Transaction).toBe("Reversal · Sales");
  });
});
