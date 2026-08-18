import { Prisma } from "@bizovix/database";
import { calculateEvaluatedTotal, isLowestEvaluatedTotal, rankByEvaluatedTotal } from "./cs-calculations";

const D = (v: number) => new Prisma.Decimal(v);

describe("calculateEvaluatedTotal", () => {
  it("adds a positive commercial adjustment on top of the quoted total", () => {
    expect(calculateEvaluatedTotal(100_000, 5_000).toNumber()).toBe(105_000);
  });

  it("subtracts a negative commercial adjustment", () => {
    expect(calculateEvaluatedTotal(100_000, -5_000).toNumber()).toBe(95_000);
  });

  it("defaults to the quoted total with no adjustment", () => {
    expect(calculateEvaluatedTotal(100_000).toNumber()).toBe(100_000);
  });
});

describe("rankByEvaluatedTotal (master task test case H — CS compares multiple quotations)", () => {
  it("ranks suppliers 1..n by ascending evaluated total", () => {
    const ranks = rankByEvaluatedTotal([
      { supplierId: "b", evaluatedTotal: D(120_000) },
      { supplierId: "a", evaluatedTotal: D(100_000) },
      { supplierId: "c", evaluatedTotal: D(110_000) },
    ]);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("c")).toBe(2);
    expect(ranks.get("b")).toBe(3);
  });
});

describe("isLowestEvaluatedTotal", () => {
  const entries = [
    { supplierId: "a", evaluatedTotal: D(100_000) },
    { supplierId: "b", evaluatedTotal: D(120_000) },
  ];

  it("is true for the cheapest evaluated supplier", () => {
    expect(isLowestEvaluatedTotal("a", entries)).toBe(true);
  });

  it("is false for a non-lowest supplier — the service must then require a decision note", () => {
    expect(isLowestEvaluatedTotal("b", entries)).toBe(false);
  });
});
