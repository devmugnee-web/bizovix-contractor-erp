import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { calculateBillItem, CERTIFIED_BILL_HISTORY_STATUSES, summarizeBill } from "./bill-calculations";

const D = (v: number) => new Prisma.Decimal(v);

function boq(overrides: Partial<Parameters<typeof calculateBillItem>[0]> = {}) {
  return {
    id: "boq-1",
    description: "Test Item",
    unit: "Nos",
    contractQty: D(100),
    unitRate: D(5000),
    ...overrides,
  };
}

describe("calculateBillItem (master task test case 55 — BOQ billing)", () => {
  it("computes current/cumulative quantity and value from previous + current", () => {
    // BOQ: Qty=100, Rate=5000. Previous certified=30, current=20.
    const result = calculateBillItem(boq(), 30, 20);
    expect(result.currentValue.toString()).toBe("100000"); // 20 * 5000
    expect(result.cumulativeQty.toString()).toBe("50"); // 30 + 20
    expect(result.cumulativeValue.toString()).toBe("250000"); // 50 * 5000
    expect(result.previousValue.toString()).toBe("150000"); // 30 * 5000
  });

  it("test case 55 exact fixture: qty=100 rate=5000, previous=30, current=20 -> cumulative 50 / value 250000", () => {
    const result = calculateBillItem(boq({ contractQty: D(100), unitRate: D(5000) }), 30, 20);
    expect(result.currentValue.toNumber()).toBe(100_000);
    expect(result.cumulativeQty.toNumber()).toBe(50);
    expect(result.cumulativeValue.toNumber()).toBe(250_000);
  });
});

describe("calculateBillItem (master task test case 56 — over-billing rejection)", () => {
  it("rejects when cumulative quantity would exceed the approved BOQ ceiling", () => {
    // Contract Qty=100, previous certified=90, current attempt=20 -> cumulative 110 > 100.
    expect(() => calculateBillItem(boq({ contractQty: D(100) }), 90, 20)).toThrow(BadRequestException);
  });

  it("keeps collected certified bills in cumulative quantity history", () => {
    expect(CERTIFIED_BILL_HISTORY_STATUSES).toEqual(["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"]);
  });

  it("allows billing exactly up to the ceiling (no false rejection at the boundary)", () => {
    const result = calculateBillItem(boq({ contractQty: D(100) }), 90, 10);
    expect(result.cumulativeQty.toNumber()).toBe(100);
  });

  it("allows the increased ceiling after an approved Variation Order raised contractQty", () => {
    // Same previous/current as the rejected case, but contractQty raised to 120 by a Variation.
    const result = calculateBillItem(boq({ contractQty: D(120) }), 90, 20);
    expect(result.cumulativeQty.toNumber()).toBe(110);
  });

  it("rejects a negative current executed quantity", () => {
    expect(() => calculateBillItem(boq(), 0, -5)).toThrow(BadRequestException);
  });
});

describe("summarizeBill (master task test case 57 — bill summary/deductions)", () => {
  it("computes gross, retention, VAT, AIT and net certified amount using configured rates", () => {
    // Gross Bill: 1,000,000 (single item, no adjustments). Retention 5%, VAT 7.5%, AIT 6%.
    const items = [{ currentValue: D(1_000_000) }];
    const summary = summarizeBill(items, [], D(5), D(7.5), D(6));

    expect(summary.grossWorkValue.toNumber()).toBe(1_000_000);
    expect(summary.grossBillAmount.toNumber()).toBe(1_000_000);
    expect(summary.retentionAmount.toNumber()).toBe(50_000); // 5% of gross work value
    expect(summary.vatAmount.toNumber()).toBe(75_000); // 7.5% of gross bill amount
    expect(summary.aitAmount.toNumber()).toBe(60_000); // 6% of gross bill amount
    expect(summary.netCertifiedAmount.toNumber()).toBe(1_000_000 - 50_000 - 75_000 - 60_000);
  });

  it("adds approved additions to gross bill amount but excludes them from the retention base", () => {
    const items = [{ currentValue: D(1_000_000) }];
    const adjustments = [{ direction: "ADDITION" as const, amount: D(200_000) }];
    const summary = summarizeBill(items, adjustments, D(5), null, null);

    expect(summary.grossBillAmount.toNumber()).toBe(1_200_000);
    // Retention is on grossWorkValue (1,000,000), not grossBillAmount (1,200,000).
    expect(summary.retentionAmount.toNumber()).toBe(50_000);
  });

  it("subtracts deduction adjustments (e.g. advance recovery) from net certified amount", () => {
    const items = [{ currentValue: D(1_000_000) }];
    const adjustments = [{ direction: "DEDUCTION" as const, amount: D(100_000) }];
    const summary = summarizeBill(items, adjustments, null, null, null);

    expect(summary.otherDeductionAmount.toNumber()).toBe(100_000);
    expect(summary.netCertifiedAmount.toNumber()).toBe(900_000);
  });

  it("never applies a deduction rate that was not configured (no fabricated statutory rate)", () => {
    const items = [{ currentValue: D(1_000_000) }];
    const summary = summarizeBill(items, [], null, null, null);
    expect(summary.retentionAmount.toNumber()).toBe(0);
    expect(summary.vatAmount.toNumber()).toBe(0);
    expect(summary.aitAmount.toNumber()).toBe(0);
    expect(summary.netCertifiedAmount.toNumber()).toBe(1_000_000);
  });
});
