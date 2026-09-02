import { describe, expect, it } from "vitest";

import { applyRoundOff, defaultRoundOffPreference, type RoundOffPreference } from "@/lib/round-off";

function preference(patch: Partial<RoundOffPreference>): RoundOffPreference {
  return { ...defaultRoundOffPreference, ...patch };
}

describe("applyRoundOff", () => {
  it("rounds to the nearest taka by default", () => {
    expect(applyRoundOff(4999.67)).toBe(5000);
    expect(applyRoundOff(5000.4)).toBe(5000);
    expect(applyRoundOff(192406.91)).toBe(192407);
  });

  it("always moves up or down when the direction says so", () => {
    expect(applyRoundOff(5000.01, preference({ direction: "Upward" }))).toBe(5001);
    expect(applyRoundOff(5000.99, preference({ direction: "Downward" }))).toBe(5000);
  });

  it("honours a 5 or 10 taka step", () => {
    expect(applyRoundOff(4997, preference({ step: 5 }))).toBe(4995);
    expect(applyRoundOff(4998, preference({ step: 5 }))).toBe(5000);
    expect(applyRoundOff(4994, preference({ step: 10, direction: "Upward" }))).toBe(5000);
    expect(applyRoundOff(4996, preference({ step: 10, direction: "Downward" }))).toBe(4990);
  });

  it("leaves an already-round amount untouched", () => {
    expect(applyRoundOff(5000)).toBe(5000);
    expect(applyRoundOff(5000, preference({ step: 10, direction: "Upward" }))).toBe(5000);
  });

  it("falls back to a 1 taka step when the stored value is unusable", () => {
    expect(applyRoundOff(4999.67, preference({ step: 0 }))).toBe(5000);
  });
});

describe("round off keeps a voucher balanced", () => {
  // The document screens post: party side = rounded, goods side = un-rounded, and
  // the Round Off ledger takes the difference. These are the four combinations.
  const cases = [
    { label: "sales rounded up", goods: 4999.67, partyOnDebitSide: true },
    { label: "sales rounded down", goods: 5000.4, partyOnDebitSide: true },
    { label: "purchase rounded up", goods: 4999.67, partyOnDebitSide: false },
    { label: "purchase rounded down", goods: 5000.4, partyOnDebitSide: false },
  ];

  for (const { label, goods, partyOnDebitSide } of cases) {
    it(label, () => {
      const settled = applyRoundOff(goods);
      const delta = Number((settled - goods).toFixed(2));
      const roundOffOnCreditSide = partyOnDebitSide ? delta > 0 : delta < 0;

      const debit = (partyOnDebitSide ? settled : goods) + (roundOffOnCreditSide ? 0 : Math.abs(delta));
      const credit = (partyOnDebitSide ? goods : settled) + (roundOffOnCreditSide ? Math.abs(delta) : 0);

      expect(Number(debit.toFixed(2))).toBe(Number(credit.toFixed(2)));
      expect(settled % 1).toBe(0);
    });
  }
});
