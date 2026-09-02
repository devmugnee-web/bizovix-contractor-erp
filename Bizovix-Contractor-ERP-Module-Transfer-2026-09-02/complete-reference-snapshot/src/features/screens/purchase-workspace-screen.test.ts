import { describe, expect, it } from "vitest";

import { buildPurchaseRows, getPurchaseSectionPostingMonthRange } from "@/features/screens/purchase-workspace-screen";
import { getPurchaseWorkspaceSection } from "@/config/purchase";
import type { VoucherRecord } from "@/types/domain";

function record(overrides: Partial<VoucherRecord>): VoucherRecord {
  return {
    id: "record",
    workspaceId: "workspace",
    voucherType: "purchase",
    documentKind: null,
    sourceVoucherId: null,
    voucherNumber: "DOC-1",
    voucherDate: "2026-07-13",
    createdAt: "2026-07-13T00:00:00.000Z",
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

describe("purchase workspace last-posting range", () => {
  it("anchors Purchase Orders to the latest Purchase Order, not a later unrelated posting", () => {
    const julyOrder = record({
      id: "order-july",
      documentKind: "purchase-order",
      voucherDate: "2026-07-03",
      status: "pending",
    });
    const augustTransfer = record({
      id: "transfer-august",
      voucherType: "contra",
      documentKind: null,
      voucherDate: "2026-08-20",
    });
    const augustBill = record({
      id: "bill-august",
      documentKind: "bill",
      voucherDate: "2026-08-18",
    });

    expect(getPurchaseSectionPostingMonthRange([julyOrder, augustTransfer, augustBill], "orders"))
      .toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("keeps each purchase workflow list anchored to its own document kind", () => {
    const order = record({ documentKind: "purchase-order", voucherDate: "2026-07-03", status: "pending" });
    const receipt = record({ documentKind: "receipt-note", voucherDate: "2026-07-05" });
    const bill = record({ documentKind: "bill", voucherDate: "2026-07-07" });

    expect(getPurchaseSectionPostingMonthRange([order, receipt, bill], "receipt-notes"))
      .toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(getPurchaseSectionPostingMonthRange([order, receipt, bill], "bills"))
      .toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });
});

describe("purchase Bills list carries an Order's advance forward", () => {
  it("nets an advance paid against the source Purchase Order out of the Bill's balance", () => {
    // Purchase Orders are pre-ledger documents — saved with status "pending",
    // never "posted" (see voucher-entry-screen.tsx's isPreLedgerDocument).
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
      sourceVoucherId: order.id,
      amount: 591_000,
    });
    const bill = record({
      id: "bill-1",
      documentKind: "bill",
      voucherNumber: "PB-20260813-4008",
      sourceVoucherId: receiptNote.id,
      amount: 591_000,
      settlementMode: "accounts-payable",
    });
    const returnNote = record({
      id: "return-1",
      voucherType: "debit-note",
      voucherNumber: "PR-1",
      amount: 159_000,
      lines: [{ id: "l3", ledger: "Walton", description: "Return", debit: 159_000, credit: 0, billReference: "PB-20260813-4008" }],
    });

    const rows = buildPurchaseRows(
      [order, advancePayment, receiptNote, bill, returnNote],
      getPurchaseWorkspaceSection("bills"),
    );
    const billRow = rows.find((row) => row.sourceId === "bill-1")!;

    expect(billRow.advancePaidAmount).toBe(200_000);
    // Bill 591,000 - Return 159,000 - Advance 200,000 = 232,000 still due.
    expect(billRow.balance).toBe(232_000);
  });
});

describe("Receipt Note item warehouse details", () => {
  it("keeps each received product mapped to its own destination warehouse", () => {
    const receiptNote = record({
      id: "receipt-multi-warehouse",
      documentKind: "receipt-note",
      voucherNumber: "GRN-MULTI-WH",
      amount: 354_500,
      inventoryItems: [
        {
          id: "redmi-line",
          itemName: "Redmi Note 14",
          quantity: 7,
          unitPrice: 21_500,
          warehouseId: "warehouse-mobile",
          warehouse: { id: "warehouse-mobile", name: "Mobile Warehouse", code: "MOBILE" },
        },
        {
          id: "samsung-line",
          itemName: "Samsung A16",
          quantity: 9,
          unitPrice: 19_500,
          warehouseId: "warehouse-showroom",
          warehouse: { id: "warehouse-showroom", name: "Dhaka Showroom", code: "DHK-SR" },
        },
      ],
    });

    const [row] = buildPurchaseRows([receiptNote], getPurchaseWorkspaceSection("receipt-notes"));

    expect(row.lineItems.map((item) => ({ item: item.itemName, warehouse: item.warehouseName, code: item.warehouseCode }))).toEqual([
      { item: "Redmi Note 14", warehouse: "Mobile Warehouse", code: "MOBILE" },
      { item: "Samsung A16", warehouse: "Dhaka Showroom", code: "DHK-SR" },
    ]);
  });
});

describe("Purchase Order payment method", () => {
  it("classifies Walton's BDT 527,000 mixed PO payment as advance and keeps its exact method amounts", () => {
    const order = record({
      id: "walton-order-527",
      documentKind: "purchase-order",
      voucherNumber: "PO-20260820-3737",
      reference: "PO-20260820-3737",
      status: "pending",
      amount: 527_000,
      settlementMode: "bank",
    });
    const advancePayment = record({
      id: "walton-advance-527",
      voucherType: "payment",
      voucherNumber: "PV-WALTON-527",
      sourceVoucherId: order.id,
      amount: 527_000,
      lines: [
        {
          id: "walton-bank",
          ledger: "BRAC Bank",
          description: "Bank Transfer payment (TXN-527-BANK)",
          debit: 0,
          credit: 327_000,
          moneyAccountType: "BANK",
        },
        {
          id: "walton-cash",
          ledger: "Cash in Hand",
          description: "Cash payment",
          debit: 0,
          credit: 200_000,
          moneyAccountType: "CASH",
        },
        {
          id: "walton-party",
          ledger: "Walton",
          description: "Advance payment to Walton against PO-20260820-3737",
          debit: 527_000,
          credit: 0,
          billReference: "PO-20260820-3737",
        },
      ],
    });

    const [orderRow] = buildPurchaseRows([order, advancePayment], getPurchaseWorkspaceSection("orders"));

    expect(orderRow.advancePaidAmount).toBe(527_000);
    expect(orderRow.financialDue).toBe(0);
    expect(orderRow.paymentMethod).toBe("Bank Transfer + Cash");
    expect(orderRow.paymentBreakdown).toEqual([
      { method: "Bank Transfer", account: "BRAC Bank", reference: "TXN-527-BANK", amount: 327_000 },
      { method: "Cash", account: "Cash in Hand", reference: "", amount: 200_000 },
    ]);
  });

  it("does not classify a normal payment allocated after Purchase Bill posting as PO advance", () => {
    const order = record({
      id: "order-normal-payment",
      documentKind: "purchase-order",
      voucherNumber: "PO-NORMAL-1",
      reference: "PO-NORMAL-1",
      status: "pending",
      amount: 527_000,
    });
    const receiptNote = record({
      id: "receipt-normal-payment",
      documentKind: "receipt-note",
      voucherNumber: "RN-NORMAL-1",
      reference: "RN-NORMAL-1",
      sourceVoucherId: order.id,
      amount: 527_000,
    });
    const bill = record({
      id: "bill-normal-payment",
      documentKind: "bill",
      voucherNumber: "PB-NORMAL-1",
      reference: "PB-NORMAL-1",
      sourceVoucherId: receiptNote.id,
      amount: 527_000,
      settlementMode: "accounts-payable",
    });
    const normalPayment = record({
      id: "payment-after-bill",
      voucherType: "payment",
      voucherNumber: "PV-NORMAL-1",
      reference: "PV-NORMAL-1",
      amount: 527_000,
      lines: [
        { id: "normal-bank", ledger: "BRAC Bank", description: "Bank Transfer payment", debit: 0, credit: 527_000 },
        { id: "normal-party", ledger: "Walton", description: "Payment to Walton against PB-NORMAL-1", debit: 527_000, credit: 0, billReference: "PB-NORMAL-1" },
      ],
    });
    const records = [order, receiptNote, bill, normalPayment];

    const [orderRow] = buildPurchaseRows(records, getPurchaseWorkspaceSection("orders"));
    const [billRow] = buildPurchaseRows(records, getPurchaseWorkspaceSection("bills"));

    expect(orderRow.advancePaidAmount).toBe(0);
    expect(orderRow.paymentBreakdown).toEqual([]);
    expect(billRow.advancePaidAmount).toBe(0);
    expect(billRow.paidAmount).toBe(527_000);
    expect(billRow.balance).toBe(0);
    expect(billRow.paymentMethod).toBe("Bank Transfer");
    expect(billRow.paymentAccount).toBe("BRAC Bank");
    expect(billRow.paymentBreakdown).toEqual([
      { method: "Bank Transfer", account: "BRAC Bank", reference: "PV-NORMAL-1", amount: 527_000 },
    ]);
  });

  it("shows every method used by a mixed advance payment", () => {
    const order = record({
      id: "order-mixed",
      documentKind: "purchase-order",
      voucherNumber: "PO-2001",
      reference: "PO-2001",
      status: "pending",
      amount: 434_000,
      settlementMode: "bank",
    });
    const advancePayment = record({
      id: "advance-mixed",
      voucherType: "payment",
      voucherNumber: "PV-2001",
      sourceVoucherId: order.id,
      amount: 400_000,
      lines: [
        { id: "cash", ledger: "Cash in Hand", description: "Cash payment", debit: 0, credit: 200_000, moneyAccountType: "CASH" },
        { id: "bank", ledger: "Brac Borrenno", description: "Bank Transfer payment", debit: 0, credit: 50_000, moneyAccountType: "BANK" },
        { id: "mfs", ledger: "Bkash 01711180802", description: "MFS payment", debit: 0, credit: 150_000, moneyAccountType: "MFS" },
        { id: "party", ledger: "Shahida", description: "Advance payment to Shahida", debit: 400_000, credit: 0 },
      ],
    });

    const rows = buildPurchaseRows([order, advancePayment], getPurchaseWorkspaceSection("orders"));
    const orderRow = rows.find((row) => row.sourceId === order.id)!;

    expect(orderRow.paymentMethod).toBe("Bank Transfer + Cash + MFS");
  });

  it("carries the source order's mixed advance methods into its Receipt Note row", () => {
    const order = record({ id: "order-mixed", documentKind: "purchase-order", status: "pending", amount: 434_000 });
    const advancePayment = record({
      id: "advance-mixed",
      voucherType: "payment",
      sourceVoucherId: order.id,
      amount: 400_000,
      lines: [
        { id: "cash", ledger: "Cash in Hand", description: "Cash payment", debit: 0, credit: 200_000, moneyAccountType: "CASH" },
        { id: "bank", ledger: "Brac Borenno", description: "Bank Transfer payment", debit: 0, credit: 50_000, moneyAccountType: "BANK" },
        { id: "mfs", ledger: "Bkash", description: "MFS payment", debit: 0, credit: 150_000, moneyAccountType: "MFS" },
      ],
    });
    const receiptNote = record({ id: "receipt", documentKind: "receipt-note", sourceVoucherId: order.id, amount: 434_000, settlementMode: "bank" });

    const rows = buildPurchaseRows([order, advancePayment, receiptNote], getPurchaseWorkspaceSection("receipt-notes"));

    expect(rows[0]?.paymentMethod).toBe("Bank Transfer + Cash + MFS");
  });
});

/* The Purchase Bills toolbar shows Paid + Unpaid + Return Adjusted = Total. A purchase
 * return is not a payment, so the row builder takes it off `balance` rather than adding
 * it to `paidAmount` — which is exactly why the first two boxes alone cannot reach the
 * gross Total. These pin down the residual the third box is derived from. */
describe("purchase bill summary identity", () => {
  function buildBillRow(extra: VoucherRecord[]) {
    const bill = record({
      id: "bill-1",
      documentKind: "bill",
      voucherNumber: "PB-20260713-0001",
      amount: 500_000,
      settlementMode: "accounts-payable",
    });
    const rows = buildPurchaseRows([bill, ...extra], getPurchaseWorkspaceSection("bills"));
    return rows.find((row) => row.sourceId === "bill-1")!;
  }

  it("leaves no residual when nothing was returned", () => {
    const row = buildBillRow([]);
    expect(row.amount - row.paidAmount - row.balance).toBe(0);
  });

  it("reports the applied purchase return as the gap between Paid + Unpaid and Total", () => {
    const returnNote = record({
      id: "return-1",
      voucherType: "debit-note",
      voucherNumber: "PR-1",
      amount: 120_000,
      lines: [{ id: "l1", ledger: "Walton", description: "Return", debit: 120_000, credit: 0, billReference: "PB-20260713-0001" }],
    });
    const row = buildBillRow([returnNote]);

    expect(row.balance).toBe(380_000);
    expect(row.amount - row.paidAmount - row.balance).toBe(120_000);
  });

  it("never reports a negative residual when a return exceeds what was still owed", () => {
    const payment = record({
      id: "payment-1",
      voucherType: "payment",
      voucherNumber: "PV-1",
      amount: 450_000,
      lines: [
        { id: "l1", ledger: "Cash", description: "Cash payment", debit: 0, credit: 450_000, moneyAccountType: "CASH" },
        { id: "l2", ledger: "Walton", description: "Payment", debit: 450_000, credit: 0, billReference: "PB-20260713-0001" },
      ],
    });
    const returnNote = record({
      id: "return-1",
      voucherType: "debit-note",
      voucherNumber: "PR-1",
      amount: 200_000,
      lines: [{ id: "l3", ledger: "Walton", description: "Return", debit: 200_000, credit: 0, billReference: "PB-20260713-0001" }],
    });
    const row = buildBillRow([payment, returnNote]);

    // Balance clamps at zero, so the residual is capped at what was left owing (50,000)
    // rather than the full 200,000 return — the toolbar must still add up.
    expect(row.balance).toBe(0);
    expect(row.amount - row.paidAmount - row.balance).toBe(50_000);
  });
});
