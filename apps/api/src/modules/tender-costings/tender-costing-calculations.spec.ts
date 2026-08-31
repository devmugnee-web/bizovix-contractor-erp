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

  it("calculates Local VAT, Tax and transport into the selected BDT cost", () => {
    const result = calculateTenderCostingTotals({
      items: [
        {
          quantity: 10,
          sourcingType: "LOCAL",
          costingStatus: "COSTED",
          localUnitPrice: 100,
          localVatPercent: 5,
          localTaxPercent: 2,
          localTransportCost: 30,
          marginPercent: 12.5,
        },
      ],
      freightCost: 0,
      installationCost: 0,
      otherCost: 0,
      contingencyPercent: 0,
      costingBudget: 2000,
    });
    expect(result.calculatedItems[0]?.localTotalCost.toFixed(2)).toBe("1100.00");
    expect(result.calculatedItems[0]?.marginPercent.toFixed(2)).toBe("12.50");
    expect(result.estimatedCost.toFixed(2)).toBe("1100.00");
    expect(result.marginPercent.toFixed(4)).toBe("45.0000");
  });

  it("converts Foreign unit price to BDT and calculates landed cost", () => {
    const result = calculateTenderCostingTotals({
      items: [
        {
          quantity: 2,
          sourcingType: "FOREIGN",
          costingStatus: "COSTED",
          foreignUnitPrice: 100,
          foreignExchangeRate: 120,
          foreignFreightCost: 1000,
          customsDutyPercent: 10,
          foreignVatPercent: 5,
          selectedSource: "FOREIGN",
        },
      ],
      freightCost: 0,
      installationCost: 0,
      otherCost: 0,
      contingencyPercent: 0,
      costingBudget: 50000,
    });
    expect(result.calculatedItems[0]?.foreignProductValueBdt.toFixed(2)).toBe("24000.00");
    expect(result.calculatedItems[0]?.foreignLandedCost.toFixed(2)).toBe("28875.00");
    expect(result.estimatedCost.toFixed(2)).toBe("28875.00");
  });
});
