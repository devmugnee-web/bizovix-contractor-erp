import { describe, expect, it } from "vitest";

import { allocateHybrid, allocateProportionally, basisValueFor } from "./lc-allocation.util.js";
import { sumDecimals, toNumber2 } from "./lc-money.util.js";

// The seven products from the spec's acceptance dataset, with their given
// "Total Purchase BDT" values (already reflecting the accepted/override unit
// price where it differs from USD x rate).
const PRODUCTS = [
  { id: "forklift", totalPurchaseCostBdt: 713933.91 },
  { id: "plate-processor", totalPurchaseCostBdt: 785232.35 },
  { id: "fishing-boat", totalPurchaseCostBdt: 178910.0 },
  { id: "flight-case", totalPurchaseCostBdt: 213000.0 },
  { id: "empty-cabinet", totalPurchaseCostBdt: 519645.0 },
  { id: "front-service-cabinet", totalPurchaseCostBdt: 221200.0 },
  { id: "controller-flight-case", totalPurchaseCostBdt: 14880.0 },
];

describe("allocateProportionally", () => {
  it("reconciles the CNF Bill (170,000) across all products by purchase value with zero residual", () => {
    const rows = allocateProportionally(
      170000,
      PRODUCTS.map((p) => ({ id: p.id, basisValue: p.totalPurchaseCostBdt })),
    );
    const total = sumDecimals(rows.map((row) => row.amount));
    expect(toNumber2(total)).toBe(170000);
    // Every row got a nonzero, proportional share.
    for (const row of rows) {
      expect(row.amount.greaterThan(0)).toBe(true);
    }
  });

  it("reconciles every acceptance-dataset expense to its exact total, regardless of size", () => {
    const expenses = [494879.0, 700000.0, 370545.04, 3450.0, 170000.0, 44505.15, 424116.0];
    for (const expense of expenses) {
      const rows = allocateProportionally(
        expense,
        PRODUCTS.map((p) => ({ id: p.id, basisValue: p.totalPurchaseCostBdt })),
      );
      expect(toNumber2(sumDecimals(rows.map((row) => row.amount)))).toBe(expense);
    }
  });

  it("falls back to an equal split when every basis value is zero (e.g. no weights entered yet)", () => {
    const rows = allocateProportionally(
      700000,
      PRODUCTS.map((p) => ({ id: p.id, basisValue: 0 })),
    );
    expect(toNumber2(sumDecimals(rows.map((row) => row.amount)))).toBe(700000);
    expect(toNumber2(rows[0].amount)).toBeCloseTo(700000 / PRODUCTS.length, 1);
  });

  it("splits Equal basis evenly and assigns rounding paisa without changing the total", () => {
    const rows = allocateProportionally(
      700000,
      PRODUCTS.map((p) => ({ id: p.id, basisValue: basisValueFor("EQUAL", { ...p, usdUnitPrice: 0, quantity: 0, weight: 0, cbm: 0 }) })),
    );
    expect(toNumber2(sumDecimals(rows.map((row) => row.amount)))).toBe(700000);
    expect(rows.map((row) => Number(row.basisPercentage.toFixed(6)))).toEqual(PRODUCTS.map(() => 14.285714));
    expect(Math.max(...rows.map((row) => row.amount.toNumber())) - Math.min(...rows.map((row) => row.amount.toNumber()))).toBeLessThanOrEqual(0.01);
  });

  it("supports the spec's manual-amount example totalling exactly 700,000", () => {
    // Manual amounts are a straight passthrough (no util needed), but the
    // service validates SUM === total the same way — verify the example sums.
    const manual = [250000, 170000, 80000, 50000, 80000, 60000, 10000];
    expect(manual.reduce((sum, value) => sum + value, 0)).toBe(700000);
  });
});

describe("allocateHybrid", () => {
  it("matches the spec's hybrid example: two fixed products, remainder auto-split among the rest", () => {
    const targets = PRODUCTS.map((p) => ({ id: p.id, basisValue: p.totalPurchaseCostBdt, manualAmount: undefined as number | undefined }));
    const forklift = targets.find((t) => t.id === "forklift")!;
    forklift.manualAmount = 250000;
    const fishingBoat = targets.find((t) => t.id === "fishing-boat")!;
    fishingBoat.manualAmount = 100000;

    const rows = allocateHybrid(700000, targets);
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(toNumber2(byId.get("forklift")!.amount)).toBe(250000);
    expect(toNumber2(byId.get("fishing-boat")!.amount)).toBe(100000);

    const remainderRows = rows.filter((row) => row.id !== "forklift" && row.id !== "fishing-boat");
    const remainderTotal = sumDecimals(remainderRows.map((row) => row.amount));
    expect(toNumber2(remainderTotal)).toBe(350000);

    // Grand total across fixed + auto-allocated rows still reconciles to 700,000.
    expect(toNumber2(sumDecimals(rows.map((row) => row.amount)))).toBe(700000);
  });
});

describe("basisValueFor", () => {
  const item = { totalPurchaseCostBdt: 100, usdUnitPrice: 10, quantity: 5, weight: 20, cbm: 2 };

  it("returns the requested metric per basis", () => {
    expect(toNumber2(basisValueFor("PURCHASE_VALUE", item))).toBe(100);
    expect(toNumber2(basisValueFor("USD_VALUE", item))).toBe(50);
    expect(toNumber2(basisValueFor("QUANTITY", item))).toBe(5);
    expect(toNumber2(basisValueFor("WEIGHT", item))).toBe(20);
    expect(toNumber2(basisValueFor("CBM", item))).toBe(2);
    expect(toNumber2(basisValueFor("EQUAL", item))).toBe(1);
  });
});
