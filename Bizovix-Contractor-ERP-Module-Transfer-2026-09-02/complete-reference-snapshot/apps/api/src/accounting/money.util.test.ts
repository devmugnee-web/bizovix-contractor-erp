import { describe, expect, it } from "vitest";

import { moneyEquals, normalizeBalancedMoneyLines, roundMoney, sumMoney, toPaisa } from "./money.util.js";

describe("accounting money precision", () => {
  it("rounds BDT values to two decimals using round-half-up", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(1.004)).toBe(1);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(-1.004)).toBe(-1);
    expect(roundMoney("280044.91999999998")).toBe(280044.92);
  });

  it("represents and sums money as integer paisa", () => {
    expect(toPaisa("123.456")).toBe(12346n);
    expect(sumMoney([100.105, 200.105])).toBe(300.22);
  });

  it("treats binary floating-point residue as the same posted amount", () => {
    expect(moneyEquals(280044.91999999998, 280044.92)).toBe(true);
    expect(moneyEquals(280044.91, 280044.92)).toBe(false);
  });

  it("absorbs only multi-line rounding residue while preserving a balanced aggregate", () => {
    expect(normalizeBalancedMoneyLines([
      { debit: 50.005, credit: 0 },
      { debit: 50.005, credit: 0 },
      { debit: 0, credit: 100.01 },
    ])).toEqual([
      { debit: 50.01, credit: 0 },
      { debit: 50, credit: 0 },
      { debit: 0, credit: 100.01 },
    ]);
  });
});
