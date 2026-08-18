import { calculatePoItemLine, calculatePoTotals } from "./po-calculations";

describe("calculatePoItemLine (master task test case K — backend-calculated PO totals)", () => {
  it("computes gross amount and line amount with no discount", () => {
    const line = calculatePoItemLine(10, 1_000);
    expect(line.grossAmount.toNumber()).toBe(10_000);
    expect(line.lineAmount.toNumber()).toBe(10_000);
    expect(line.netRate.toNumber()).toBe(1_000);
  });

  it("subtracts a flat discount amount and derives the net rate", () => {
    const line = calculatePoItemLine(10, 1_000, 500);
    expect(line.lineAmount.toNumber()).toBe(9_500);
    expect(line.netRate.toNumber()).toBe(950);
  });
});

describe("calculatePoTotals", () => {
  it("sums subtotal/discount across lines and never applies tax when the rate is zero", () => {
    const lines = [calculatePoItemLine(10, 1_000, 500), calculatePoItemLine(5, 2_000)];
    const totals = calculatePoTotals(lines);
    expect(totals.subtotal.toNumber()).toBe(20_000);
    expect(totals.discountAmount.toNumber()).toBe(500);
    expect(totals.taxAmount.toNumber()).toBe(0);
    expect(totals.grandTotal.toNumber()).toBe(19_500);
  });

  it("applies a configured VAT rate on the post-discount subtotal and adds other charges", () => {
    const lines = [calculatePoItemLine(10, 1_000, 500), calculatePoItemLine(5, 2_000)];
    // net after discount = 19,500; 7.5% VAT = 1,462.5; + 1,000 other charges.
    const totals = calculatePoTotals(lines, 7.5, 1_000);
    expect(totals.taxAmount.toNumber()).toBe(1_462.5);
    expect(totals.grandTotal.toNumber()).toBe(21_962.5);
  });

  it("returns zero totals for an empty line list", () => {
    const totals = calculatePoTotals([]);
    expect(totals.subtotal.toNumber()).toBe(0);
    expect(totals.grandTotal.toNumber()).toBe(0);
  });
});
