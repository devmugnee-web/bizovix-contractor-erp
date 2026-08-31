import { calculateTenderCostingTotals } from "./tender-costing-calculations";

describe("calculateTenderCostingTotals", () => {
  it("calculates server-authoritative item and header totals", () => {
    const result = calculateTenderCostingTotals({
      items: [{ quantity: 2, unitCost: 100, marginPercent: 10 }],
      freightCost: 20,
      installationCost: 10,
      otherCost: 0,
      contingencyPercent: 5,
    });

    expect(result.calculatedItems[0]?.totalCost.toFixed(2)).toBe("200.00");
    expect(result.calculatedItems[0]?.ourCost.toFixed(2)).toBe("180.00");
    expect(result.contingencyAmount.toFixed(2)).toBe("11.50");
    expect(result.estimatedCost.toFixed(2)).toBe("241.50");
    expect(result.ourCost.toFixed(2)).toBe("210.00");
    expect(result.marginPercent.toFixed(4)).toBe("13.0435");
  });

  it("rejects an out-of-range margin", () => {
    expect(() =>
      calculateTenderCostingTotals({
        items: [{ quantity: "1", unitCost: "100.00", marginPercent: "101" }],
        freightCost: "0",
        installationCost: "0",
        otherCost: "0",
        contingencyPercent: "0",
      }),
    ).toThrow("between 0 and 100");
  });
});
