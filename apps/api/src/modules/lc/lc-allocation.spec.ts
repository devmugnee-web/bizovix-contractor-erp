import { Prisma } from "@bizovix/database";
import { allocateLcCost, type LcAllocationItem } from "./lc-allocation";

const D = (value: number) => new Prisma.Decimal(value);
const items: LcAllocationItem[] = [
  { id: "a", totalPurchaseCostBdt: D(100), foreignUnitPrice: D(10), quantity: D(5), weight: D(0), cbm: D(0) },
  { id: "b", totalPurchaseCostBdt: D(200), foreignUnitPrice: D(20), quantity: D(5), weight: D(0), cbm: D(0) },
  { id: "c", totalPurchaseCostBdt: D(300), foreignUnitPrice: D(30), quantity: D(5), weight: D(0), cbm: D(0) },
];

describe("LC landed-cost allocation", () => {
  it.each(["PURCHASE_VALUE", "USD_VALUE", "QUANTITY", "WEIGHT", "CBM", "EQUAL"])("reconciles %s allocation without residual", (basis) => {
    const rows = allocateLcCost(items, D(700000), { allocationMode: "AUTO", allocationBasis: basis, rows: items.map((item) => ({ lcItemId: item.id })) });
    expect(rows.reduce((sum, row) => sum.add(row.finalAmount), D(0)).toFixed(4)).toBe("700000.0000");
  });

  it("preserves fixed hybrid amounts and allocates the remainder", () => {
    const rows = allocateLcCost(items, D(700000), { allocationMode: "HYBRID", allocationBasis: "PURCHASE_VALUE", rows: [{ lcItemId: "a", manualAmount: 250000 }, { lcItemId: "b" }, { lcItemId: "c" }] });
    expect(rows.find((row) => row.lcItemId === "a")?.finalAmount.toFixed(4)).toBe("250000.0000");
    expect(rows.reduce((sum, row) => sum.add(row.finalAmount), D(0)).toFixed(4)).toBe("700000.0000");
  });

  it("rejects an incomplete product allocation", () => {
    expect(() => allocateLcCost(items, D(100), { allocationMode: "AUTO", rows: [{ lcItemId: "a" }] })).toThrow("every LC product");
  });
});
