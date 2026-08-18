import { Prisma } from "@bizovix/database";
import { calculateQuotationLineAmount, calculateQuotationTotal } from "./quotation-calculations";

const D = (v: number) => new Prisma.Decimal(v);

describe("calculateQuotationLineAmount (master task test case G — backend-authoritative quotation totals)", () => {
  it("computes qty * rate with no discount or tax", () => {
    expect(calculateQuotationLineAmount(10, 1000).toNumber()).toBe(10_000);
  });

  it("applies a percentage discount before tax", () => {
    // 10 * 1000 = 10,000 gross; 5% discount = 500 -> 9,500 after discount.
    expect(calculateQuotationLineAmount(10, 1000, 5).toNumber()).toBe(9_500);
  });

  it("applies tax on the discounted base, not the gross", () => {
    // 9,500 after discount; 7.5% tax = 712.5 -> 10,212.5
    expect(calculateQuotationLineAmount(10, 1000, 5, 7.5).toNumber()).toBe(10_212.5);
  });

  it("handles zero discount and zero tax explicitly passed", () => {
    expect(calculateQuotationLineAmount(3, 500, 0, 0).toNumber()).toBe(1_500);
  });
});

describe("calculateQuotationTotal", () => {
  it("sums multiple line amounts", () => {
    const total = calculateQuotationTotal([D(10_212.5), D(1_500), D(2_000)]);
    expect(total.toNumber()).toBe(13_712.5);
  });

  it("returns zero for an empty line list", () => {
    expect(calculateQuotationTotal([]).toNumber()).toBe(0);
  });
});
