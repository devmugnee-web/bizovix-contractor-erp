import { describe, expect, it } from "vitest";

import { isZero, round2, sumDecimals, toDecimal, toNumber2 } from "./lc-money.util.js";

describe("lc-money.util", () => {
  it("converts USD to BDT without binary floating point drift", () => {
    // 5711.47 * 125 done via Decimal must be exact, unlike plain JS floats.
    const bdt = toDecimal(5711.47).mul(toDecimal(125));
    expect(toNumber2(bdt)).toBe(713933.75);
  });

  it("round2 rounds half-up to 2dp", () => {
    expect(toNumber2(round2(10.005))).toBe(10.01);
    expect(toNumber2(round2(10.004))).toBe(10.0);
  });

  it("sumDecimals reconciles the acceptance dataset's purchase-cost total exactly", () => {
    const unitTotals = [713933.91, 785232.35, 178910.0, 213000.0, 519645.0, 221200.0, 14880.0];
    expect(toNumber2(sumDecimals(unitTotals))).toBe(2646801.26);
  });

  it("isZero tolerates sub-cent rounding noise but not real differences", () => {
    expect(isZero(0.004)).toBe(true);
    expect(isZero(0.005)).toBe(false);
    expect(isZero(1.5)).toBe(false);
  });
});
