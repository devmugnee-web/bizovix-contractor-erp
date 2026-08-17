import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { calculateCurrentContractValue, calculateVariationItemAmount, signVariationAmount } from "./variation-calculations";

const D = (v: number) => new Prisma.Decimal(v);

describe("calculateVariationItemAmount", () => {
  it("computes the net delta for an existing BOQ item whose quantity increased", () => {
    // 5 additional Power Supply units at 45,000 each = +225,000, matching the seeded demo variation.
    const amount = calculateVariationItemAmount(10, 45_000, 15, 45_000);
    expect(amount.toNumber()).toBe(225_000);
  });

  it("computes a negative delta when quantity/rate decreases (omission-style item)", () => {
    const amount = calculateVariationItemAmount(10, 45_000, 6, 45_000);
    expect(amount.toNumber()).toBe(-180_000);
  });

  it("uses the full revised value for a brand-new BOQ item (no original)", () => {
    const amount = calculateVariationItemAmount(null, null, 20, 10_000);
    expect(amount.toNumber()).toBe(200_000);
  });
});

describe("calculateCurrentContractValue (master task test case 59 — variation contract value)", () => {
  it("adds an approved addition to the original contract value without mutating the original", () => {
    // Original: 12,500,000. Approved Variation: +500,000. Expected Current: 13,000,000.
    const current = calculateCurrentContractValue(12_500_000, [D(500_000)]);
    expect(current.toNumber()).toBe(13_000_000);
  });

  it("recomputes from scratch across multiple approved variations, including a later omission", () => {
    // Original 12,500,000; +500,000 addition, then -200,000 omission -> 12,800,000.
    const current = calculateCurrentContractValue(12_500_000, [D(500_000), D(-200_000)]);
    expect(current.toNumber()).toBe(12_800_000);
  });

  it("never changes when there are no approved variations", () => {
    const current = calculateCurrentContractValue(12_500_000, []);
    expect(current.toNumber()).toBe(12_500_000);
  });
});

describe("signVariationAmount", () => {
  it("normalizes a genuine reduction to negative for OMISSION type", () => {
    expect(signVariationAmount("OMISSION", D(-150_000)).toNumber()).toBe(-150_000);
  });

  it("rejects an OMISSION variation whose itemized math implies an increase", () => {
    expect(() => signVariationAmount("OMISSION", D(150_000))).toThrow(BadRequestException);
  });

  it("leaves an ADDITION amount untouched", () => {
    expect(signVariationAmount("ADDITION", D(225_000)).toNumber()).toBe(225_000);
  });
});
