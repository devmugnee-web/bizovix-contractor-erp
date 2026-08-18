import { calculateBillTotals, isBlockingMatchStatus, matchBillItem, overallMatchStatus } from "./bill-match-calculations";

describe("matchBillItem", () => {
  const base = { itemName: "Steel Rod", unit: "PCS", orderedQty: 100, acceptedQty: 60, previouslyBilledQty: 0, poRate: 100, invoiceRate: 100 };

  it("reports MATCHED when quantity and rate are both within the accepted/ordered ceiling", () => {
    const result = matchBillItem({ ...base, currentBilledQty: 60 });
    expect(result.matchStatus).toBe("MATCHED");
    expect(result.lineAmount.toFixed(2)).toBe("6000.00");
    expect(result.remainingBillableQty.toFixed(3)).toBe("0.000");
  });

  it("reports MATCHED for a partial bill that stays under the ceiling", () => {
    const result = matchBillItem({ ...base, currentBilledQty: 30 });
    expect(result.matchStatus).toBe("MATCHED");
    expect(result.remainingBillableQty.toFixed(3)).toBe("30.000");
  });

  it("reports MISSING_RECEIPT when nothing has been accepted yet", () => {
    const result = matchBillItem({ ...base, acceptedQty: 0, currentBilledQty: 10 });
    expect(result.matchStatus).toBe("MISSING_RECEIPT");
  });

  it("reports BLOCKED when billing beyond the accepted-minus-previously-billed ceiling", () => {
    const result = matchBillItem({ ...base, previouslyBilledQty: 40, currentBilledQty: 25 }); // remaining = 20
    expect(result.matchStatus).toBe("BLOCKED");
  });

  it("reports QUANTITY_VARIANCE when billing exceeds the PO's own ordered quantity despite an over-receipt allowing it", () => {
    const result = matchBillItem({ ...base, orderedQty: 50, acceptedQty: 70, currentBilledQty: 60 }); // remaining billable=70, but ordered-previouslyBilled=50
    expect(result.matchStatus).toBe("QUANTITY_VARIANCE");
  });

  it("reports RATE_VARIANCE when the invoice rate differs from the PO rate beyond tolerance", () => {
    const result = matchBillItem({ ...base, currentBilledQty: 60, invoiceRate: 110 });
    expect(result.matchStatus).toBe("RATE_VARIANCE");
  });

  it("does not flag a rate difference within a configured tolerance", () => {
    const result = matchBillItem({ ...base, currentBilledQty: 60, invoiceRate: 101, rateTolerancePct: 2 });
    expect(result.matchStatus).toBe("MATCHED");
  });

  it("reports AMOUNT_VARIANCE when the rate matches but a discount pushes the line total off the expected amount", () => {
    const result = matchBillItem({ ...base, currentBilledQty: 60, discountAmount: 1000 });
    expect(result.matchStatus).toBe("AMOUNT_VARIANCE");
    expect(result.lineAmount.toFixed(2)).toBe("5000.00");
  });

  it("rejects a negative current billed quantity", () => {
    expect(() => matchBillItem({ ...base, currentBilledQty: -5 })).toThrow(/cannot be negative/);
  });
});

describe("overallMatchStatus / isBlockingMatchStatus", () => {
  it("picks the most severe status among a mixed set of lines", () => {
    expect(overallMatchStatus(["MATCHED", "RATE_VARIANCE", "AMOUNT_VARIANCE"])).toBe("RATE_VARIANCE");
    expect(overallMatchStatus(["MATCHED", "QUANTITY_VARIANCE", "BLOCKED"])).toBe("BLOCKED");
    expect(overallMatchStatus(["BLOCKED", "MISSING_RECEIPT"])).toBe("MISSING_RECEIPT");
    expect(overallMatchStatus(["MATCHED"])).toBe("MATCHED");
  });

  it("only treats MISSING_RECEIPT and BLOCKED as blocking", () => {
    expect(isBlockingMatchStatus("MISSING_RECEIPT")).toBe(true);
    expect(isBlockingMatchStatus("BLOCKED")).toBe(true);
    expect(isBlockingMatchStatus("QUANTITY_VARIANCE")).toBe(false);
    expect(isBlockingMatchStatus("RATE_VARIANCE")).toBe(false);
    expect(isBlockingMatchStatus("AMOUNT_VARIANCE")).toBe(false);
    expect(isBlockingMatchStatus("MATCHED")).toBe(false);
  });
});

describe("calculateBillTotals", () => {
  it("computes taxable base, VAT, AIT and net payable from configured rates", () => {
    // gross 6000, discount 0 -> taxable 6000; VAT 15% = 900; AIT 5% = 300; other deduction 100
    const totals = calculateBillTotals([{ grossAmount: 6000, discountAmount: 0 }], 15, 5, 100);
    expect(totals.subtotal.toFixed(2)).toBe("6000.00");
    expect(totals.taxableBase.toFixed(2)).toBe("6000.00");
    expect(totals.vatAmount.toFixed(2)).toBe("900.00");
    expect(totals.aitAmount.toFixed(2)).toBe("300.00");
    expect(totals.netPayable.toFixed(2)).toBe("6500.00"); // 6000 + 900 - 300 - 100
  });

  it("defaults to zero tax when no deduction config is provided, matching the unconfigured-deduction convention", () => {
    const totals = calculateBillTotals([{ grossAmount: 1000, discountAmount: 200 }]);
    expect(totals.taxableBase.toFixed(2)).toBe("800.00");
    expect(totals.vatAmount.toFixed(2)).toBe("0.00");
    expect(totals.aitAmount.toFixed(2)).toBe("0.00");
    expect(totals.netPayable.toFixed(2)).toBe("800.00");
  });
});
