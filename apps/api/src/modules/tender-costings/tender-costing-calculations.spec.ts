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

  it("applies item profit before Local VAT and Tax", () => {
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
    expect(result.calculatedItems[0]?.ourCost.toFixed(2)).toBe("1030.00");
    expect(result.calculatedItems[0]?.profitAmount.toFixed(2)).toBe("128.75");
    expect(result.calculatedItems[0]?.localTotalCost.toFixed(2)).toBe("1239.86");
    expect(result.calculatedItems[0]?.marginPercent.toFixed(2)).toBe("12.50");
    expect(result.estimatedCost.toFixed(2)).toBe("1239.86");
    expect(result.ourCost.toFixed(2)).toBe("1030.00");
    expect(result.marginPercent.toFixed(4)).toBe("12.5000");
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

  it("uses the legacy door-to-door BDT charge when detailed shipping is empty", () => {
    const result = calculateTenderCostingTotals({
      items: [
        {
          quantity: 1,
          sourcingType: "FOREIGN",
          costingStatus: "COSTED",
          selectedSource: "FOREIGN",
          foreignUnitPrice: 100,
          foreignExchangeRate: 100,
          foreignShippingMethod: "DOOR_TO_DOOR_SEA",
          foreignDoorToDoorCharge: 1000,
          foreignImportDutyIncluded: true,
          customsDutyPercent: 10,
          marginPercent: 10,
          foreignVatPercent: 5,
          foreignTaxPercent: 2,
        },
      ],
      freightCost: 0,
      installationCost: 0,
      otherCost: 0,
      contingencyPercent: 0,
    });

    expect(result.calculatedItems[0]?.ourCost.toFixed(2)).toBe("11000.00");
    expect(result.calculatedItems[0]?.profitAmount.toFixed(2)).toBe("1100.00");
    expect(result.calculatedItems[0]?.foreignLandedCost.toFixed(2)).toBe("12947.00");
  });

  it("calculates detailed Door-to-Door Sea shipping in row currency before BDT duties", () => {
    const result = calculateTenderCostingTotals({
      items: [
        {
          quantity: 2,
          sourcingType: "FOREIGN",
          costingStatus: "COSTED",
          selectedSource: "FOREIGN",
          foreignUnitPrice: 50,
          foreignExchangeRate: 100,
          foreignShippingMethod: "DOOR_TO_DOOR_SEA",
          foreignTransportCharge: 10,
          customsDeclarationCharge: 5,
          shippingVolumeCbm: 2.5,
          shippingRateBasis: "PER_CBM",
          shippingRate: 20,
          domesticTransportCost: 500,
          foreignOtherCost: 25,
          customsDutyPercent: 10,
          regulatoryDutyPercent: 2,
          supplementaryDutyPercent: 3,
          marginPercent: 10,
          foreignVatPercent: 5,
          foreignTaxPercent: 2,
        },
      ],
      freightCost: 0,
      installationCost: 0,
      otherCost: 0,
      contingencyPercent: 0,
    });

    const item = result.calculatedItems[0]!;
    expect(item.foreignProductValueBdt.toFixed(2)).toBe("10000.00");
    expect(item.ourCost.toFixed(2)).toBe("19500.00");
    expect(item.profitAmount.toFixed(2)).toBe("1950.00");
    expect(item.foreignLandedCost.toFixed(2)).toBe("22951.50");
  });

  it("uses weight for a PER_KG Door-to-Door Air rate and skips included duties", () => {
    const result = calculateTenderCostingTotals({
      items: [
        {
          quantity: 1,
          sourcingType: "FOREIGN",
          costingStatus: "COSTED",
          selectedSource: "FOREIGN",
          foreignUnitPrice: 100,
          foreignExchangeRate: 120,
          foreignShippingMethod: "DOOR_TO_DOOR_AIR",
          foreignImportDutyIncluded: true,
          shippingWeightKg: 10,
          shippingVolumeCbm: 99,
          shippingRateBasis: "PER_KG",
          shippingRate: 2,
          customsDutyPercent: 25,
        },
      ],
      freightCost: 0,
      installationCost: 0,
      otherCost: 0,
      contingencyPercent: 0,
    });

    expect(result.calculatedItems[0]?.ourCost.toFixed(2)).toBe("14400.00");
    expect(result.calculatedItems[0]?.foreignLandedCost.toFixed(2)).toBe("14400.00");
  });
});
