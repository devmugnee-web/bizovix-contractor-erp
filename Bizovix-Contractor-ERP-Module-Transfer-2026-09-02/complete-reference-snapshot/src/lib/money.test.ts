import { describe, expect, it } from "vitest";

import { moneyAmountsEqual, moneyToMinorUnits, normalizeBalancedMoneyLines, roundMoney, sumMoney } from "@/lib/money";

describe("money precision", () => {
  it.each([
    [1.005, 1.01],
    [1.004, 1],
    [-1.005, -1.01],
    [-1.004, -1],
    [10.075, 10.08],
    [-10.075, -10.08],
    ["10.075", 10.08],
    ["-10.075", -10.08],
    ["1.0075e1", 10.08],
    ["-1.0075E+1", -10.08],
    ["10075e-3", 10.08],
    [280_044.91999999998, 280_044.92],
  ] as const)("rounds %s to nearest paisa using half-away-from-zero as %s", (input, expected) => {
    expect(roundMoney(input)).toBe(expected);
  });

  it("normalizes zero and rejects non-decimal values without emitting NaN", () => {
    expect(Object.is(roundMoney(-0.004), -0)).toBe(false);
    expect(roundMoney("not-money")).toBe(0);
    expect(roundMoney(Number.NaN)).toBe(0);
    expect(moneyToMinorUnits("10.075")).toBe(1_008);
    expect(moneyToMinorUnits("-10.075")).toBe(-1_008);
  });

  it("sums each posted component as integer paisa", () => {
    expect(sumMoney([100.105, 200.105])).toBe(300.22);
    expect(moneyToMinorUnits("123.456")).toBe(12_346);
  });

  it("accepts floating residue but rejects a real one-paisa difference", () => {
    expect(moneyAmountsEqual(280_044.91999999998, 280_044.92)).toBe(true);
    expect(moneyAmountsEqual(280_044.91, 280_044.92)).toBe(false);
  });

  it("reconciles only the rounding residue of an otherwise-balanced split", () => {
    expect(normalizeBalancedMoneyLines([
      { debit: 33.335, credit: 0 },
      { debit: 33.335, credit: 0 },
      { debit: 0, credit: 66.67 },
    ])).toEqual([
      { debit: 33.34, credit: 0 },
      { debit: 33.33, credit: 0 },
      { debit: 0, credit: 66.67 },
    ]);
  });

  it("rounds an aggregate from exact decimal sources before reconciling split residue", () => {
    expect(normalizeBalancedMoneyLines([
      { debit: 1.005, credit: 0 },
      { debit: 2.01, credit: 0 },
      { debit: 0, credit: 3.005 },
      { debit: 0, credit: 0.01 },
    ])).toEqual([
      { debit: 1.01, credit: 0 },
      { debit: 2.01, credit: 0 },
      { debit: 0, credit: 3.01 },
      { debit: 0, credit: 0.01 },
    ]);
  });
});
