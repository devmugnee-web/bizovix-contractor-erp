import { describe, expect, it } from "vitest";

import { buildInvoicedByDeliveryNote, computeInvoiceDue, derivePaymentMethod } from "@/features/screens/sales-workspace-screen";
import type { VoucherRecord } from "@/types/domain";

function record(overrides: Partial<VoucherRecord>): VoucherRecord {
  return {
    id: "record",
    workspaceId: "workspace",
    voucherType: "sales",
    documentKind: null,
    sourceVoucherId: null,
    voucherNumber: "DOC-1",
    voucherDate: "2026-07-13",
    createdAt: "2026-07-13T00:00:00.000Z",
    partyName: "Customer",
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

describe("sales delivery-to-invoice allocation", () => {
  it("counts duplicate product names by source line instead of collapsing different-rate rows", () => {
    const delivery = record({
      id: "delivery-1",
      documentKind: "delivery-note",
      voucherNumber: "DC-1",
      inventoryItems: [
        { id: "delivery-line-a", itemName: "LG 308L Inverter Refrigerator", quantity: 2, unitPrice: 85_000 },
        { id: "delivery-line-b", itemName: "LG 308L Inverter Refrigerator", quantity: 2, unitPrice: 82_000 },
        { id: "delivery-line-c", itemName: "Samsung 253L", quantity: 2, unitPrice: 65_000 },
        { id: "delivery-line-d", itemName: "LG 260L", quantity: 1, unitPrice: 68_000 },
      ],
    });
    const invoice = record({
      id: "invoice-1",
      sourceVoucherId: delivery.id,
      voucherNumber: "SINV-1",
      inventoryItems: delivery.inventoryItems?.map((item, index) => ({
        ...item,
        id: `invoice-line-${index}`,
        sourceInventoryLineId: item.id,
      })),
    });

    expect(buildInvoicedByDeliveryNote([delivery, invoice]).get(delivery.id)).toBe(7);
  });
});

describe("Delivery Note payment type", () => {
  it("shows the Cash/Credit choice inherited from the source Sales Order", () => {
    const creditOrder = record({ id: "order-credit", documentKind: "sale-order", settlementMode: "accounts-payable" });
    const cashOrder = record({ id: "order-cash", documentKind: "sale-order", settlementMode: "cash", paidAmount: 100 });
    const legacyCreditDelivery = record({ id: "delivery-credit", documentKind: "delivery-note", sourceVoucherId: creditOrder.id, settlementMode: null });
    const cashDelivery = record({ id: "delivery-cash", documentKind: "delivery-note", sourceVoucherId: cashOrder.id, settlementMode: "cash" });

    expect(derivePaymentMethod(legacyCreditDelivery, "delivery-challan", [creditOrder])).toBe("Due");
    expect(derivePaymentMethod(cashDelivery, "delivery-challan", [cashOrder])).toBe("Cash");
  });

  it("shows Due for a stale CASH flag when no payment was received", () => {
    const unpaidOrder = record({ id: "order-unpaid", documentKind: "sale-order", settlementMode: "cash", paidAmount: 0 });
    const delivery = record({
      id: "delivery-unpaid",
      documentKind: "delivery-note",
      sourceVoucherId: unpaidOrder.id,
      settlementMode: "cash",
      paidAmount: 218_000,
    });

    expect(derivePaymentMethod(unpaidOrder, "sale-order", [unpaidOrder, delivery])).toBe("Due");
    expect(derivePaymentMethod(delivery, "delivery-challan", [unpaidOrder, delivery])).toBe("Due");
  });

  it("shows the exact Cash/Bank/MFS ledgers actually received against the Sales Order", () => {
    const order = record({ id: "order-split", documentKind: "sale-order", settlementMode: "bank", paidAmount: 400_000 });
    const delivery = record({ id: "delivery-split", documentKind: "delivery-note", sourceVoucherId: order.id, settlementMode: "bank" });
    const advanceReceipt = record({
      id: "receipt-split",
      voucherType: "receipt",
      sourceVoucherId: order.id,
      amount: 400_000,
      lines: [
        { id: "cash", ledger: "Cash in Hand", description: "", debit: 200_000, credit: 0 },
        { id: "bank", ledger: "Brac Borenno", description: "", debit: 50_000, credit: 0 },
        { id: "mfs", ledger: "Bkash 01711180802", description: "", debit: 150_000, credit: 0 },
        { id: "party", ledger: "Customer", description: "", debit: 0, credit: 400_000 },
      ],
    });

    expect(derivePaymentMethod(order, "sale-order", [order, advanceReceipt])).toBe("Cash in Hand + Brac Borenno + Bkash 01711180802");
    expect(derivePaymentMethod(delivery, "delivery-challan", [order, delivery, advanceReceipt])).toBe("Cash in Hand + Brac Borenno + Bkash 01711180802");
  });
});

describe("Sales Invoice advance allocation", () => {
  it("uses a receipt linked to the source Sales Order when calculating invoice due", () => {
    const order = record({ id: "order-advance", documentKind: "sale-order", status: "pending", amount: 218_000, paidAmount: 218_000 });
    const delivery = record({ id: "delivery-advance", documentKind: "delivery-note", sourceVoucherId: order.id, amount: 218_000 });
    const advance = record({ id: "receipt-advance", voucherType: "receipt", sourceVoucherId: order.id, amount: 218_000 });
    const invoice = record({ id: "invoice-advance", documentKind: null, sourceVoucherId: delivery.id, amount: 218_000, settlementMode: "accounts-payable", paidAmount: 0 });

    expect(computeInvoiceDue(invoice, [order, delivery, advance, invoice])).toBe(0);
  });

  it("uses the Sales Order advance summary when a legacy receipt link is missing", () => {
    const order = record({ id: "order-legacy-advance", documentKind: "sale-order", status: "pending", amount: 255_000, paidAmount: 255_000 });
    const delivery = record({ id: "delivery-legacy-advance", documentKind: "delivery-note", sourceVoucherId: order.id, amount: 255_000 });
    const invoice = record({ id: "invoice-legacy-advance", documentKind: null, sourceVoucherId: delivery.id, amount: 255_000, settlementMode: "accounts-payable", paidAmount: 0 });

    expect(computeInvoiceDue(invoice, [order, delivery, invoice])).toBe(0);
  });

  it("shows the source Sales Order's actual receipt ledgers on the Sales Invoice", () => {
    const order = record({ id: "order-method", documentKind: "sale-order", status: "pending", amount: 218_000, paidAmount: 218_000 });
    const delivery = record({ id: "delivery-method", documentKind: "delivery-note", sourceVoucherId: order.id, amount: 218_000 });
    const advance = record({
      id: "receipt-method",
      voucherType: "receipt",
      sourceVoucherId: order.id,
      amount: 218_000,
      lines: [
        { id: "cash", ledger: "Cash in Hand", description: "", debit: 200_000, credit: 0 },
        { id: "mfs", ledger: "Bkash 01711180802", description: "", debit: 18_000, credit: 0 },
        { id: "party", ledger: "Color Aid", description: "", debit: 0, credit: 218_000 },
      ],
    });
    const invoice = record({ id: "invoice-method", partyName: "Color Aid", documentKind: null, sourceVoucherId: delivery.id, amount: 218_000, settlementMode: "accounts-payable", paidAmount: 0 });

    expect(derivePaymentMethod(invoice, "invoices", [order, delivery, advance, invoice])).toBe("Cash in Hand + Bkash 01711180802");
  });
});
