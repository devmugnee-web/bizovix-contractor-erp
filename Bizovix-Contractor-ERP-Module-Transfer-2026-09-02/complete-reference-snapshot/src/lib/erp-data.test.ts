import { describe, expect, it } from "vitest";

import { getInventoryOptionsAsOf, getItemWiseMovementRows, getTrialBalanceRows } from "@/lib/erp-data";
import type { AppDataset, VoucherRecord } from "@/types/domain";

function dataset(overrides: Partial<AppDataset>): AppDataset {
  return {
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
      currentPlan: { code: "test", name: "Test", description: "", priceLabel: "-", billingLabel: "-" },
      status: "paid-active",
      renewalDate: "",
      daysRemaining: 0,
      usages: [],
      plans: [],
      upgradeRequest: null,
    },
    workspaceSubscriptions: {},
    ...overrides,
  };
}

function voucher(input: Partial<VoucherRecord> & Pick<VoucherRecord, "id" | "voucherType" | "voucherDate">): VoucherRecord {
  return {
    workspaceId: "workspace-1",
    voucherNumber: input.id,
    createdAt: `${input.voucherDate}T10:00:00.000Z`,
    partyName: "Party",
    particulars: "",
    debit: 0,
    credit: 0,
    amount: 0,
    status: "posted",
    enteredBy: "Tester",
    currency: "BDT",
    lines: [],
    ...input,
  };
}

describe("trial balance period columns", () => {
  it("keeps postings under one stable COA account when its ledger name is renamed", () => {
    const value = dataset({
      vouchers: [
        voucher({
          id: "old-payable-caption",
          voucherType: "expense",
          voucherDate: "2026-07-08",
          lines: [
            { id: "expense-1", ledger: "Freight", description: "Expense", debit: 24_000, credit: 0 },
            { id: "payable-1", accountId: "other-payable-1", ledger: "Miscellanies Expenses", description: "Payable", debit: 0, credit: 24_000 },
          ],
        }),
        voucher({
          id: "new-payable-caption",
          voucherType: "expense",
          voucherDate: "2026-07-18",
          lines: [
            { id: "expense-2", ledger: "Freight", description: "Expense", debit: 27_500, credit: 0 },
            { id: "payable-2", accountId: "other-payable-1", ledger: "Miscellaneous Payable", description: "Payable", debit: 0, credit: 27_500 },
          ],
        }),
      ],
    });

    const rows = getTrialBalanceRows(value, "workspace-1", undefined, "2026-07-31");
    const payableRows = rows.filter((row) => row.accountId === "other-payable-1");

    expect(payableRows).toHaveLength(1);
    expect(payableRows[0]).toMatchObject({ accountId: "other-payable-1", debit: 0, credit: 51_500, closingBalance: -51_500 });
  });

  it("separates opening, period transactions, and closing balances", () => {
    const value = dataset({
      vouchers: [
        voucher({
          id: "opening-capital",
          voucherType: "receipt",
          voucherDate: "2026-06-30",
          lines: [
            { id: "cash-opening", ledger: "Cash in Hand", description: "Opening capital", debit: 1_000, credit: 0 },
            { id: "capital-opening", ledger: "Capital Accounts", description: "Opening capital", debit: 0, credit: 1_000 },
          ],
        }),
        voucher({
          id: "period-expense",
          voucherType: "expense",
          voucherDate: "2026-07-10",
          lines: [
            { id: "expense", ledger: "Carriage Inward", description: "Period expense", debit: 200, credit: 0 },
            { id: "cash-payment", ledger: "Cash in Hand", description: "Period payment", debit: 0, credit: 200 },
          ],
        }),
      ],
    });

    const rows = getTrialBalanceRows(value, "workspace-1", "2026-07-01", "2026-07-31");
    expect(rows.find((row) => row.ledger === "Cash in Hand")).toMatchObject({
      openingBalance: 1_000,
      debit: 0,
      credit: 200,
      closingBalance: 800,
    });
    expect(rows.find((row) => row.ledger === "Capital Accounts")).toMatchObject({
      openingBalance: -1_000,
      debit: 0,
      credit: 0,
      closingBalance: -1_000,
    });
  });

  it("excludes cash, bank, and MFS transfers posted after the as-on date", () => {
    const value = dataset({
      vouchers: [
        voucher({
          id: "opening-balances",
          voucherType: "journal",
          voucherDate: "2026-07-01",
          lines: [
            { id: "cash-opening", ledger: "Cash in Hand", description: "Opening", debit: 1_327_500, credit: 0 },
            { id: "bank-opening", ledger: "Brac Borenno", description: "Opening", debit: 2_905_000, credit: 0 },
            { id: "mfs-opening", ledger: "Bkash 01711180802", description: "Opening", debit: 0, credit: 132_000 },
            { id: "capital-opening", ledger: "Capital Accounts", description: "Opening", debit: 0, credit: 4_100_500 },
          ],
        }),
        voucher({
          id: "future-cash-to-mfs",
          voucherType: "contra",
          voucherDate: "2026-08-20",
          lines: [
            { id: "future-cash", ledger: "Cash in Hand", description: "Transfer", debit: 0, credit: 200_000 },
            { id: "future-mfs-cash", ledger: "Bkash 01711180802", description: "Transfer", debit: 200_000, credit: 0 },
          ],
        }),
        voucher({
          id: "future-bank-to-mfs",
          voucherType: "contra",
          voucherDate: "2026-08-20",
          lines: [
            { id: "future-bank", ledger: "Brac Borenno", description: "Transfer", debit: 0, credit: 200_000 },
            { id: "future-mfs-bank", ledger: "Bkash 01711180802", description: "Transfer", debit: 200_000, credit: 0 },
          ],
        }),
      ],
    });

    const rows = getTrialBalanceRows(value, "workspace-1", undefined, "2026-07-03");
    expect(rows.find((row) => row.ledger === "Cash in Hand")?.closingBalance).toBe(1_327_500);
    expect(rows.find((row) => row.ledger === "Brac Borenno")?.closingBalance).toBe(2_905_000);
    expect(rows.find((row) => row.ledger === "Bkash 01711180802")?.closingBalance).toBe(-132_000);
  });
});

describe("inventory report moving weighted average", () => {
  it("uses authoritative movement value as of the selected date and retains inactive stock with a balance", () => {
    const value = dataset({
      stockItems: [{
        id: "item-1",
        workspaceId: "workspace-1",
        itemCode: "ITM-1",
        itemName: "Widget",
        category: "General",
        unit: "pcs",
        openingQty: 999,
        openingRate: 999,
        reorderLevel: 0,
        status: "inactive",
      }],
      inventoryMovements: [
        {
          id: "opening",
          workspaceId: "workspace-1",
          warehouseId: "warehouse-1",
          inventoryItemId: "item-1",
          itemName: "Widget",
          itemCode: "ITM-1",
          unit: "pcs",
          transactionType: "OPENING_STOCK",
          transactionId: "opening",
          transactionLineId: "opening-line",
          referenceNo: "OPENING",
          movementType: "IN",
          quantity: 10,
          unitCost: 100,
          movementValue: 1_000,
          balanceQuantity: 10,
          balanceValue: 1_000,
          averageCost: 100,
          transactionDate: "2026-01-01",
          createdAt: "2026-01-01T10:00:00.000Z",
        },
        {
          id: "purchase",
          workspaceId: "workspace-1",
          warehouseId: "warehouse-1",
          inventoryItemId: "item-1",
          itemName: "Widget",
          itemCode: "ITM-1",
          unit: "pcs",
          transactionType: "PURCHASE",
          transactionId: "purchase",
          transactionLineId: "purchase-line",
          referenceNo: "PB-1",
          movementType: "IN",
          quantity: 10,
          unitCost: 200,
          movementValue: 2_000,
          balanceQuantity: 20,
          balanceValue: 3_000,
          averageCost: 150,
          transactionDate: "2026-01-02",
          createdAt: "2026-01-02T10:00:00.000Z",
        },
        {
          id: "sale",
          workspaceId: "workspace-1",
          warehouseId: "warehouse-1",
          inventoryItemId: "item-1",
          itemName: "Widget",
          itemCode: "ITM-1",
          unit: "pcs",
          transactionType: "SALES",
          transactionId: "sale",
          transactionLineId: "sale-line",
          referenceNo: "SI-1",
          movementType: "OUT",
          quantity: 5,
          unitCost: 150,
          movementValue: 750,
          balanceQuantity: 15,
          balanceValue: 2_250,
          averageCost: 150,
          transactionDate: "2026-01-03",
          createdAt: "2026-01-03T10:00:00.000Z",
        },
      ],
    });

    expect(getInventoryOptionsAsOf(value, "workspace-1", "2026-01-02")).toEqual([
      expect.objectContaining({ itemName: "Widget", qty: 20, rate: 150, status: "inactive" }),
    ]);
    expect(getInventoryOptionsAsOf(value, "workspace-1", "2026-01-03")).toEqual([
      expect.objectContaining({ itemName: "Widget", qty: 15, rate: 150 }),
    ]);
    expect(getItemWiseMovementRows(value, "workspace-1", "2026-01-02", "2026-01-03")).toEqual([
      expect.objectContaining({ voucherNumber: "PB-1", rate: 200, balanceQty: 20, balanceValue: 3_000 }),
      expect.objectContaining({ voucherNumber: "SI-1", rate: 150, balanceQty: 15, balanceValue: 2_250 }),
    ]);
  });

  it("does not use a sale price or final purchase rate when the demo feed is replayed", () => {
    const value = dataset({
      stockItems: [{
        id: "item-1",
        workspaceId: "workspace-1",
        itemCode: "ITM-1",
        itemName: "Widget",
        category: "General",
        unit: "pcs",
        openingQty: 10,
        openingRate: 100,
        reorderLevel: 0,
        status: "active",
      }],
      vouchers: [
        voucher({
          id: "purchase",
          voucherType: "purchase",
          voucherDate: "2026-01-02",
          inventoryItems: [{ id: "purchase-line", inventoryItemId: "item-1", itemName: "Widget", quantity: 10, unitPrice: 200 }],
        }),
        voucher({
          id: "sale",
          voucherType: "sales",
          voucherDate: "2026-01-03",
          amount: 4_995,
          inventoryItems: [{ id: "sale-line", inventoryItemId: "item-1", itemName: "Widget", quantity: 5, unitPrice: 999 }],
        }),
      ],
    });

    expect(getInventoryOptionsAsOf(value, "workspace-1", "2026-01-03")).toEqual([
      expect.objectContaining({ qty: 15, rate: 150 }),
    ]);
    expect(getItemWiseMovementRows(value, "workspace-1", "2026-01-02", "2026-01-03")).toEqual([
      expect.objectContaining({ voucherNumber: "purchase", rate: 200, balanceValue: 3_000 }),
      expect.objectContaining({ voucherNumber: "sale", rate: 150, balanceValue: 2_250 }),
    ]);
  });
});
