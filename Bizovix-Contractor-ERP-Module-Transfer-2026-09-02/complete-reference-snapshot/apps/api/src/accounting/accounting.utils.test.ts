import { describe, expect, it } from "vitest";

import { VoucherEntryStatus, VoucherEntryType } from "../generated/prisma/index.js";
import {
  buildInventorySnapshot,
  buildTrialBalance,
  mapVoucherStatusInput,
  mapVoucherStatusOutput,
  mapVoucherTypeInput,
  mapVoucherTypeOutput,
  nextVoucherNumber,
} from "./accounting.utils.js";

describe("voucher type mapping", () => {
  it("round-trips every VoucherEntryType value through output then input", () => {
    for (const value of Object.values(VoucherEntryType)) {
      const output = mapVoucherTypeOutput(value);
      expect(output).toBeTypeOf("string");
      expect(mapVoucherTypeInput(output)).toBe(value);
    }
  });

  it("maps the new Phase 1 document-flow types", () => {
    expect(mapVoucherTypeOutput(VoucherEntryType.DELIVERY_NOTE)).toBe("delivery-note");
    expect(mapVoucherTypeInput("delivery-note")).toBe(VoucherEntryType.DELIVERY_NOTE);
    expect(mapVoucherTypeOutput(VoucherEntryType.RECEIPT_NOTE)).toBe("receipt-note");
    expect(mapVoucherTypeInput("receipt-note")).toBe(VoucherEntryType.RECEIPT_NOTE);
  });
});

describe("voucher status mapping", () => {
  it("round-trips every VoucherEntryStatus value through output then input", () => {
    for (const value of Object.values(VoucherEntryStatus)) {
      const output = mapVoucherStatusOutput(value);
      expect(output).toBeTypeOf("string");
      expect(mapVoucherStatusInput(output)).toBe(value);
    }
  });

  it("maps the new Phase 1 statuses", () => {
    expect(mapVoucherStatusOutput(VoucherEntryStatus.REJECTED)).toBe("rejected");
    expect(mapVoucherStatusOutput(VoucherEntryStatus.REVERSED)).toBe("reversed");
    expect(mapVoucherStatusOutput(VoucherEntryStatus.SUPERSEDED_BY_ALTERATION)).toBe("superseded-by-alteration");
  });
});

describe("nextVoucherNumber", () => {
  it("generates a numbered prefix for every voucher type, including new document flows", () => {
    const date = new Date("2026-07-26T00:00:00Z");
    for (const value of Object.values(VoucherEntryType)) {
      const voucherNumber = nextVoucherNumber(null, value, date);
      expect(voucherNumber).toMatch(/^[A-Z]{2,3}-2607-00101$/);
    }
  });

  it("increments the sequence based on the last voucher number", () => {
    const date = new Date("2026-07-26T00:00:00Z");
    const next = nextVoucherNumber("SI-2607-00105", VoucherEntryType.SALES, date);
    expect(next).toBe("SI-2607-00106");
  });

  it("ignores malformed and different-period numbers and increments the highest valid sequence", () => {
    const date = new Date("2026-07-26T00:00:00Z");
    const next = nextVoucherNumber(
      ["SR-2607-00NaN", "SR-2606-00999", "SR-2607-00104", "SR-2607-00109", "PR-2607-00200"],
      VoucherEntryType.CREDIT_NOTE,
      date,
    );

    expect(next).toBe("SR-2607-00110");
  });

  it("starts a safe sequence when only malformed numbers exist", () => {
    const date = new Date("2026-07-26T00:00:00Z");
    expect(nextVoucherNumber(["SR-2607-00NaN"], VoucherEntryType.CREDIT_NOTE, date)).toBe("SR-2607-00101");
  });

  it("uses distinct, readable numbers for each purchase document stage", () => {
    const date = new Date("2026-08-09T00:00:00Z");
    expect(nextVoucherNumber(null, VoucherEntryType.PURCHASE, date, "purchase-order")).toBe("PO-2608-00101");
    expect(nextVoucherNumber(null, VoucherEntryType.PURCHASE, date, "receipt-note")).toBe("GRN-2608-00101");
    expect(nextVoucherNumber(null, VoucherEntryType.PURCHASE, date, "bill")).toBe("PB-2608-00101");
  });

  it("uses distinct, readable numbers for each sales document stage", () => {
    const date = new Date("2026-08-09T00:00:00Z");
    expect(nextVoucherNumber(null, VoucherEntryType.SALES, date, "quotation")).toBe("QT-2608-00101");
    expect(nextVoucherNumber(null, VoucherEntryType.SALES, date, "proforma")).toBe("PF-2608-00101");
    expect(nextVoucherNumber(null, VoucherEntryType.SALES, date, "sale-order")).toBe("SO-2608-00101");
    expect(nextVoucherNumber(null, VoucherEntryType.SALES, date, "delivery-note")).toBe("DN-2608-00101");
    expect(nextVoucherNumber(null, VoucherEntryType.SALES, date)).toBe("SI-2608-00101");
  });

  it("uses the Purchase Return prefix for debit-note accounting records", () => {
    const date = new Date("2026-08-09T00:00:00Z");
    expect(nextVoucherNumber(null, VoucherEntryType.DEBIT_NOTE, date)).toBe("PR-2608-00101");
  });
});

describe("buildTrialBalance", () => {
  it("sums debit and credit per ledger across multiple entries and stays balanced", () => {
    const entries = [
      {
        voucherType: VoucherEntryType.SALES,
        lines: [
          { ledger: "Cash in Hand", debit: 1000, credit: 0 },
          { ledger: "Sales Account", debit: 0, credit: 1000 },
        ],
      },
      {
        voucherType: VoucherEntryType.SALES,
        lines: [
          { ledger: "Cash in Hand", debit: 500, credit: 0 },
          { ledger: "Sales Account", debit: 0, credit: 500 },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;

    const rows = buildTrialBalance(entries, [
      { id: "inventory", code: "1210001", name: "Inventory Control", nature: "ASSET", parentId: null, accountGroup: { code: "INVENTORY" } },
      { id: "grni", code: "2212001", name: "Purchase Bill Pending", nature: "LIABILITY", parentId: null, accountGroup: { code: "AP" } },
      { id: "cash", code: "1221001", name: "Cash in Hand", nature: "ASSET", parentId: null, accountGroup: { code: "CASH" } },
      { id: "bank", code: "1222101", name: "BRAC Bank", nature: "ASSET", parentId: null, accountGroup: { code: "BANK" } },
    ]);
    const cash = rows.find((row) => row.ledger === "Cash in Hand");
    const sales = rows.find((row) => row.ledger === "Sales Account");

    expect(cash?.debit).toBe(1500);
    expect(sales?.credit).toBe(1500);

    const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
    const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it("posts order -> receipt note -> bill only once and clears purchase bill pending", () => {
    const entries = [
      { id: "po", voucherType: VoucherEntryType.PURCHASE, documentKind: "purchase-order", totalAmount: 2_500_000, lines: [{ ledger: "Rahim Supplier", debit: 0, credit: 2_500_000 }] },
      { id: "rn", voucherType: VoucherEntryType.PURCHASE, documentKind: "receipt-note", totalAmount: 2_500_000, lines: [{ ledger: "Rahim Supplier", debit: 0, credit: 2_500_000 }] },
      { id: "bill", voucherType: VoucherEntryType.PURCHASE, documentKind: "bill", sourceVoucherId: "rn", partyName: "Rahim Supplier", settlementMode: "ACCOUNTS_PAYABLE", totalAmount: 2_500_000, lines: [{ ledger: "Rahim Supplier", debit: 0, credit: 2_500_000 }] },
      { id: "return", voucherType: VoucherEntryType.DEBIT_NOTE, partyName: "Rahim Supplier", totalAmount: 500_000, lines: [{ ledger: "Rahim Supplier", debit: 500_000, credit: 0 }, { ledger: "Purchase Return", debit: 0, credit: 500_000 }] },
      { id: "payment", voucherType: VoucherEntryType.PAYMENT, partyName: "Rahim Supplier", totalAmount: 500_000, lines: [{ ledger: "Rahim Supplier", debit: 500_000, credit: 0 }, { ledger: "Cash in Hand", debit: 0, credit: 500_000 }] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;

    const rows = buildTrialBalance(entries);
    expect(rows.find((row) => row.ledger === "Inventory Control")?.debit).toBe(2_500_000);
    expect(rows.find((row) => row.ledger === "Purchase Account")).toBeUndefined();
    expect(rows.find((row) => row.ledger === "Purchase Bill Pending")?.debit).toBe(2_500_000);
    expect(rows.find((row) => row.ledger === "Purchase Bill Pending")?.credit).toBe(2_500_000);
    expect(rows.find((row) => row.ledger === "Rahim Supplier")?.credit).toBe(2_500_000);
    expect(rows.find((row) => row.ledger === "Rahim Supplier")?.debit).toBe(1_000_000);
    expect(rows.find((row) => row.ledger === "Rahim Supplier")?.group).toBe("Sundry Creditors");
  });

  it("keeps the persisted Cash, Bank, and supplier split when a Receipt Note is billed", () => {
    const entries = [
      {
        id: "receipt-note",
        voucherType: VoucherEntryType.PURCHASE,
        documentKind: "receipt-note",
        totalAmount: 1_000,
        lines: [
          { accountId: "inventory", ledger: "Inventory Control", debit: 1_000, credit: 0 },
          { accountId: "grni", ledger: "Purchase Bill Pending", debit: 0, credit: 1_000 },
        ],
      },
      {
        id: "bill",
        voucherType: VoucherEntryType.PURCHASE,
        documentKind: "bill",
        sourceVoucherId: "receipt-note",
        partyName: "Supplier One",
        settlementMode: "BANK",
        totalAmount: 1_000,
        lines: [
          { accountId: "grni", ledger: "Purchase Bill Pending", debit: 1_000, credit: 0 },
          { accountId: "cash", ledger: "Cash in Hand", debit: 0, credit: 300, costCenter: "Cash-in-Hand" },
          { accountId: "bank", ledger: "BRAC Bank", debit: 0, credit: 200, costCenter: "Bank Accounts" },
          { ledger: "Supplier One", debit: 0, credit: 500 },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;

    const rows = buildTrialBalance(entries, [
      { id: "inventory", code: "1210001", name: "Inventory Control", nature: "ASSET" as const, parentId: null, accountGroup: { code: "INVENTORY" } },
      { id: "grni", code: "2212001", name: "Purchase Bill Pending", nature: "LIABILITY" as const, parentId: null, accountGroup: { code: "AP" } },
      { id: "cash", code: "1221001", name: "Cash in Hand", nature: "ASSET" as const, parentId: null, accountGroup: { code: "CASH" } },
      { id: "bank", code: "1222101", name: "BRAC Bank", nature: "ASSET" as const, parentId: null, accountGroup: { code: "BANK" } },
    ]);

    expect(rows.find((row) => row.ledger === "Cash in Hand")?.credit).toBe(300);
    expect(rows.find((row) => row.ledger === "BRAC Bank")?.credit).toBe(200);
    expect(rows.find((row) => row.ledger === "Supplier One")?.credit).toBe(500);
    expect(rows.find((row) => row.ledger === "Inventory Control")?.group).toBe("Current Assets");
    expect(rows.find((row) => row.ledger === "Purchase Bill Pending")?.group).toBe("Sundry Creditors");
    expect(rows.find((row) => row.ledger === "Purchase Bill Pending")?.debit).toBe(1_000);
    expect(rows.find((row) => row.ledger === "Purchase Bill Pending")?.credit).toBe(1_000);
    expect(rows.reduce((sum, row) => sum + row.debit, 0)).toBe(
      rows.reduce((sum, row) => sum + row.credit, 0),
    );
  });

  it("uses Account id/code/group metadata after protected and custom ledger captions are renamed", () => {
    const entries = [{
      id: "renamed-receipt-note",
      voucherType: VoucherEntryType.RECEIPT_NOTE,
      documentKind: "receipt-note",
      totalAmount: 1_000,
      lines: [
        { accountId: "inventory", ledger: "Old Inventory Caption", debit: 1_000, credit: 0 },
        { accountId: "grni", ledger: "Old Pending Caption", debit: 0, credit: 1_000 },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }] as any;
    const accounts = [
      { id: "inventory", code: "1210001", name: "Localized Stock Control", nature: "ASSET" as const, parentId: null, accountGroup: { code: "INVENTORY" } },
      { id: "grni", code: "2212001", name: "Localized Unbilled Receipts", nature: "LIABILITY" as const, parentId: null, accountGroup: { code: "AP" } },
    ];

    const rows = buildTrialBalance(entries, accounts);

    expect(rows.find((row) => row.accountId === "inventory")).toMatchObject({
      ledger: "Localized Stock Control",
      group: "Current Assets",
      debit: 1_000,
    });
    expect(rows.find((row) => row.accountId === "grni")).toMatchObject({
      ledger: "Localized Unbilled Receipts",
      group: "Sundry Creditors",
      credit: 1_000,
    });
  });

  it("never assigns legacy Receipt Note identity to non-null Account IDs with lookalike captions", () => {
    const entries = [{
      id: "wrong-id-receipt-note",
      voucherType: VoucherEntryType.RECEIPT_NOTE,
      documentKind: "receipt-note",
      totalAmount: 1_000,
      lines: [
        { accountId: "other-asset", ledger: "Inventory Control", debit: 1_000, credit: 0 },
        { accountId: "other-liability", ledger: "Purchase Bill Pending", debit: 0, credit: 1_000 },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }] as any;
    const rows = buildTrialBalance(entries, [
      { id: "other-asset", code: "9991001", name: "Unrelated Asset", nature: "ASSET" as const, parentId: null, accountGroup: null },
      { id: "other-liability", code: "9992001", name: "Unrelated Liability", nature: "LIABILITY" as const, parentId: null, accountGroup: null },
    ]);

    expect(rows.find((row) => row.accountId === "other-asset")).toMatchObject({ ledger: "Unrelated Asset", debit: 1_000 });
    expect(rows.find((row) => row.accountId === "other-liability")).toMatchObject({ ledger: "Unrelated Liability", credit: 1_000 });
    expect(rows.some((row) => !row.accountId && row.ledger === "Inventory Control")).toBe(false);
    expect(rows.some((row) => !row.accountId && row.ledger === "Purchase Bill Pending")).toBe(false);
  });

  it("nets a reversed Receipt Note from its persisted mirror lines", () => {
    const entries = [
      {
        id: "receipt-note",
        voucherType: VoucherEntryType.PURCHASE,
        documentKind: "receipt-note",
        totalAmount: 1_000,
        lines: [
          { accountId: "inventory", ledger: "Inventory Control", debit: 1_000, credit: 0 },
          { accountId: "grni", ledger: "Purchase Bill Pending", debit: 0, credit: 1_000 },
        ],
      },
      {
        id: "receipt-note-reversal",
        reversalOfId: "receipt-note",
        voucherType: VoucherEntryType.PURCHASE,
        documentKind: "receipt-note",
        totalAmount: 1_000,
        lines: [
          { accountId: "inventory", ledger: "Inventory Control", debit: 0, credit: 1_000 },
          { accountId: "grni", ledger: "Purchase Bill Pending", debit: 1_000, credit: 0 },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;

    const rows = buildTrialBalance(entries);
    const inventory = rows.find((row) => row.ledger === "Inventory Control");
    const grni = rows.find((row) => row.ledger === "Purchase Bill Pending");

    expect(inventory?.debit).toBe(1_000);
    expect(inventory?.credit).toBe(1_000);
    expect(grni?.debit).toBe(1_000);
    expect(grni?.credit).toBe(1_000);
  });

  it("classifies money and party ledgers under their accounting heads, not their cost centres", () => {
    const entries = [
      {
        voucherType: VoucherEntryType.PAYMENT,
        partyName: "Shahida",
        lines: [
          { ledger: "Shahida", debit: 400_000, credit: 0, costCenter: "Head Office" },
          { ledger: "Cash in Hand", debit: 0, credit: 200_000, costCenter: "Head Office" },
          { ledger: "City Bank", debit: 0, credit: 50_000, costCenter: "Bank Accounts" },
          { ledger: "Bkash 01711180802", debit: 0, credit: 150_000, costCenter: "Bank Accounts" },
        ],
      },
      {
        voucherType: VoucherEntryType.SALES,
        partyName: "Rahim Customer",
        lines: [
          { ledger: "Rahim Customer", debit: 25_000, credit: 0, costCenter: "Head Office" },
          { ledger: "Sales Account", debit: 0, credit: 25_000, costCenter: "Head Office" },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;

    const rows = buildTrialBalance(entries);
    expect(rows.find((row) => row.ledger === "Shahida")?.group).toBe("Sundry Creditors");
    expect(rows.find((row) => row.ledger === "Rahim Customer")?.group).toBe("Sundry Debtors");
    expect(rows.find((row) => row.ledger === "Cash in Hand")?.group).toBe("Cash-in-Hand");
    expect(rows.find((row) => row.ledger === "City Bank")?.group).toBe("Bank Accounts");
    expect(rows.find((row) => row.ledger === "Bkash 01711180802")?.group).toBe("Bank Accounts");
  });
});

describe("buildInventorySnapshot", () => {
  it("increases quantity on purchase and decreases on non-purchase movements", () => {
    const items = [{ id: "item-1", itemCode: "ITM-1", itemName: "Widget", category: "General", unit: "pcs", openingQty: 10, openingRate: 100, reorderLevel: 5 }];
    const entries = [
      {
        voucherType: VoucherEntryType.PURCHASE,
        inventoryItems: [{ id: "vi-1", inventoryItemId: "item-1", itemName: "Widget", quantity: 5, unitPrice: 110, inventoryItem: null }],
      },
      {
        voucherType: VoucherEntryType.SALES,
        inventoryItems: [{ id: "vi-2", inventoryItemId: "item-1", itemName: "Widget", quantity: 3, unitPrice: 150, inventoryItem: null }],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;

    const snapshot = buildInventorySnapshot(items, entries);
    const widget = snapshot.find((row) => row.itemName === "Widget");

    // 10 opening + 5 purchased - 3 sold = 12
    expect(widget?.quantity).toBe(12);
  });

  it("moves stock on receipt note but not again on its purchase bill", () => {
    const items = [{ id: "item-1", itemCode: "ITM-1", itemName: "Widget", category: "General", unit: "pcs", openingQty: 0, openingRate: 100, reorderLevel: 0 }];
    const inventoryItem = { id: "vi", inventoryItemId: "item-1", itemName: "Widget", quantity: 25, unitPrice: 100, inventoryItem: null };
    const entries = [
      { id: "po", voucherType: VoucherEntryType.PURCHASE, documentKind: "purchase-order", inventoryItems: [{ ...inventoryItem, id: "po-item" }] },
      { id: "rn", voucherType: VoucherEntryType.PURCHASE, documentKind: "receipt-note", inventoryItems: [{ ...inventoryItem, id: "rn-item" }] },
      { id: "bill", voucherType: VoucherEntryType.PURCHASE, documentKind: "bill", sourceVoucherId: "rn", inventoryItems: [{ ...inventoryItem, id: "bill-item" }] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;

    expect(buildInventorySnapshot(items, entries).find((row) => row.itemName === "Widget")?.quantity).toBe(25);
  });

  it("restores returned products without changing their cost rate", () => {
    const items = [{ id: "item-1", itemCode: "ITM-1", itemName: "Widget", kind: "PRODUCT" as const, category: "General", unit: "pcs", openingQty: 10, openingRate: 100, reorderLevel: 0 }];
    const entries = [
      { id: "sale", voucherType: VoucherEntryType.SALES, documentKind: null, sourceVoucherId: null, inventoryItems: [{ id: "sold", inventoryItemId: "item-1", itemName: "Widget", quantity: 4, unitPrice: 150, inventoryItem: { kind: "PRODUCT" } }] },
      { id: "return", voucherType: VoucherEntryType.CREDIT_NOTE, documentKind: null, sourceVoucherId: "sale", inventoryItems: [{ id: "returned", inventoryItemId: "item-1", itemName: "Widget", quantity: 2, unitPrice: 150, inventoryItem: { kind: "PRODUCT" } }] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;

    const widget = buildInventorySnapshot(items, entries).find((row) => row.itemName === "Widget");
    expect(widget?.quantity).toBe(8);
    expect(widget?.rate).toBe(100);
  });

  it("does not treat expense item details as inventory stock-out", () => {
    const items = [{ id: "item-1", itemCode: "ITM-1", itemName: "Widget", category: "General", unit: "pcs", openingQty: 10, openingRate: 100, reorderLevel: 0 }];
    const entries = [
      { id: "expense", voucherType: VoucherEntryType.EXPENSE, documentKind: null, sourceVoucherId: null, inventoryItems: [{ id: "detail", inventoryItemId: "item-1", itemName: "Widget", quantity: 3, unitPrice: 100 }] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;

    expect(buildInventorySnapshot(items, entries).find((row) => row.itemName === "Widget")?.quantity).toBe(10);
  });

  it("does not move stock for returned services", () => {
    const items = [{ id: "service-1", itemCode: "SRV-1", itemName: "Consulting", kind: "SERVICE" as const, category: "Services", unit: "job", openingQty: 0, openingRate: 0, reorderLevel: 0 }];
    const entries = [
      { id: "return", voucherType: VoucherEntryType.CREDIT_NOTE, documentKind: null, sourceVoucherId: "sale", inventoryItems: [{ id: "returned", inventoryItemId: "service-1", itemName: "Consulting", quantity: 1, unitPrice: 5000, inventoryItem: { kind: "SERVICE" } }] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;

    expect(buildInventorySnapshot(items, entries).find((row) => row.itemName === "Consulting")?.quantity).toBe(0);
  });
});
