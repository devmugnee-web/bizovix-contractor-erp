import { calculateCapitalizedCost, calculateDepreciationAmount } from "./fixed-assets.calculations";

describe("fixed asset calculations", () => {
  it("capitalizes purchase and directly attributable costs net of discount", () => {
    expect(calculateCapitalizedCost({ purchaseCost: 1_000_000, transportationCost: 20_000, installationCost: 30_000, importDuty: 50_000, registrationCost: 5_000, otherCapitalizedCost: 10_000, discountAmount: 15_000 }).toFixed(4)).toBe("1100000.0000");
  });

  it("caps final straight-line depreciation at the remaining depreciable amount", () => {
    const regular = calculateDepreciationAmount({ capitalizedCost: 120_000, salvageValue: 12_000, usefulLifeMonths: 36 });
    expect(regular.nextAmount.toFixed(4)).toBe("3000.0000");
    const final = calculateDepreciationAmount({ capitalizedCost: 120_000, salvageValue: 12_000, usefulLifeMonths: 36, priorDepreciation: 107_000 });
    expect(final.nextAmount.toFixed(4)).toBe("1000.0000");
  });

  it("supports a configured annual manual depreciation amount", () => {
    expect(calculateDepreciationAmount({ capitalizedCost: 200_000, salvageValue: 20_000, usefulLifeMonths: 60, manualAnnualDepreciation: 24_000 }).nextAmount.toFixed(4)).toBe("2000.0000");
  });
});
