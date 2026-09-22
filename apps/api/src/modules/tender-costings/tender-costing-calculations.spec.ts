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

  it("preserves the legacy LC calculation for an existing detailed row", () => {
    const result = calculateTenderCostingTotals({
      items: [
        {
          quantity: 2,
          sourcingType: "FOREIGN",
          costingStatus: "COSTED",
          foreignUnitPrice: 100,
          foreignExchangeRate: 120,
          foreignFreightCost: 1000,
          domesticTransportCost: 300,
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
    expect(result.calculatedItems[0]?.foreignLandedCost.toFixed(2)).toBe("29190.00");
    expect(result.ourCost.toFixed(2)).toBe("27800.00");
    expect(result.estimatedCost.toFixed(2)).toBe("29190.00");
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
    expect(result.estimatedCost.toFixed(2)).toBe("12947.00");
  });

  it("calculates origin currency and Sea shipping BDT before quote profit, VAT and tax", () => {
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
          shippingWeightKg: 2.5,
          shippingRateBasis: "PER_KG",
          shippingRate: 400,
          foreignLocalTransportCost: 300,
          domesticTransportCost: 500,
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
    expect(item.foreignLandedCost.toFixed(2)).toBe("13800.00");
    expect(item.ourCost.toFixed(2)).toBe("13800.00");
    expect(item.profitAmount.toFixed(2)).toBe("1380.00");
    expect(result.estimatedCost.toFixed(2)).toBe("16242.60");
  });

  it("matches spreadsheet shipping from quantity, unit weight and BDT per KG", () => {
    const result = calculateTenderCostingTotals({
      items: [
        {
          quantity: 20,
          sourcingType: "FOREIGN",
          costingStatus: "COSTED",
          selectedSource: "FOREIGN",
          foreignUnitPrice: 254,
          foreignExchangeRate: 128,
          foreignShippingMethod: "DOOR_TO_DOOR_AIR",
          shippingWeightKg: 70,
          shippingRateBasis: "PER_KG",
          shippingRate: 800,
          marginPercent: 60,
          foreignVatPercent: 10,
          foreignTaxPercent: 5,
        },
      ],
      freightCost: 0,
      installationCost: 0,
      otherCost: 0,
      contingencyPercent: 0,
    });

    const item = result.calculatedItems[0]!;
    expect(item.foreignProductValueBdt.toFixed(2)).toBe("650240.00");
    expect(item.foreignLandedCost.toFixed(2)).toBe("1770240.00");
    expect(item.profitAmount.toFixed(2)).toBe("1062144.00");
    expect(item.totalCost.toFixed(2)).toBe("3257241.60");
  });

  it("uses submitted BDT per KG for simplified Air shipping", () => {
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
          shippingWeightKg: 10,
          shippingRateBasis: "PER_KG",
          shippingRate: 2,
        },
      ],
      freightCost: 0,
      installationCost: 0,
      otherCost: 0,
      contingencyPercent: 0,
    });

    expect(result.calculatedItems[0]?.ourCost.toFixed(2)).toBe("12020.00");
    expect(result.calculatedItems[0]?.foreignLandedCost.toFixed(2)).toBe("12020.00");
  });

  it.each(["DOOR_TO_DOOR_SEA", "DOOR_TO_DOOR_AIR"] as const)(
    "adds each simplified Door-to-Door logistics stage and optional other cost once for %s",
    (foreignShippingMethod) => {
      const result = calculateTenderCostingTotals({
        items: [
          {
            quantity: 1,
            sourcingType: "FOREIGN",
            costingStatus: "COSTED",
            selectedSource: "FOREIGN",
            foreignUnitPrice: 10,
            foreignExchangeRate: 100,
            foreignShippingMethod,
            shippingRateBasis: "PER_KG",
            foreignTransportCharge: 3,
            shippingWeightKg: 2,
            shippingRate: 500,
            foreignLocalTransportCost: 400,
            domesticTransportCost: 500,
            foreignOtherCost: 600,
          },
        ],
        freightCost: 0,
        installationCost: 0,
        otherCost: 0,
        contingencyPercent: 0,
      });

      expect(result.calculatedItems[0]?.foreignLandedCost.toFixed(2)).toBe("3800.00");
      expect(result.ourCost.toFixed(2)).toBe("3800.00");
      expect(result.estimatedCost.toFixed(2)).toBe("3800.00");
    },
  );

  it.each(["LC_SEA", "LC_AIR"] as const)(
    "includes origin and project transport with simplified LC fees and other cost for %s",
    (foreignShippingMethod) => {
      const result = calculateTenderCostingTotals({
        items: [
          {
            quantity: 2,
            sourcingType: "FOREIGN",
            costingStatus: "COSTED",
            selectedSource: "FOREIGN",
            foreignUnitPrice: 50,
            foreignExchangeRate: 100,
            foreignShippingMethod,
            shippingRateBasis: "FLAT",
            bankLcCharge: 100,
            portHandlingCharge: 200,
            foreignFreightCost: 300,
            cnfCharge: 400,
            foreignLocalTransportCost: 500,
            marginPercent: 10,
            foreignVatPercent: 5,
            foreignTaxPercent: 2,
            foreignTransportCharge: 3,
            foreignInsuranceCost: 90000,
            foreignOtherCost: 600,
            domesticTransportCost: 700,
            customsDutyPercent: 50,
            regulatoryDutyPercent: 50,
            supplementaryDutyPercent: 50,
          },
        ],
        freightCost: 0,
        installationCost: 0,
        otherCost: 0,
        contingencyPercent: 0,
      });

      const item = result.calculatedItems[0]!;
      expect(item.foreignProductValueBdt.toFixed(2)).toBe("10000.00");
      // Product 10,000 + origin transport (3 x 100 FX) + fixed LC fees 1,500
      // + project transport 700 + other cost 600 = 13,100 BDT. Legacy-only
      // insurance and duty percentages above must not enter the FLAT model.
      expect(item.foreignLandedCost.toFixed(2)).toBe("13100.00");
      expect(item.ourCost.toFixed(2)).toBe("13100.00");
      expect(item.profitAmount.toFixed(2)).toBe("1310.00");
      expect(result.estimatedCost.toFixed(2)).toBe("15418.70");
    },
  );

  it("keeps an existing PER_KG LC row on the legacy calculation", () => {
    const result = calculateTenderCostingTotals({
      items: [
        {
          quantity: 1,
          sourcingType: "FOREIGN",
          costingStatus: "COSTED",
          selectedSource: "FOREIGN",
          foreignUnitPrice: 100,
          foreignExchangeRate: 100,
          foreignShippingMethod: "LC_SEA",
          shippingRateBasis: "PER_KG",
          shippingWeightKg: 2,
          shippingRate: 500,
          foreignFreightCost: 1000,
          bankLcCharge: 500,
          foreignLocalTransportCost: 300,
          domesticTransportCost: 200,
        },
      ],
      freightCost: 0,
      installationCost: 0,
      otherCost: 0,
      contingencyPercent: 0,
    });

    expect(result.calculatedItems[0]?.foreignLandedCost.toFixed(2)).toBe("12000.00");
    expect(result.ourCost.toFixed(2)).toBe("12000.00");
  });

  it("allocates one LC container fee equally without changing Door-to-Door rows", () => {
    const result = calculateTenderCostingTotals({
      items: [
        ...[1, 2, 3].map((quantity) => ({
          quantity,
          sourcingType: "FOREIGN" as const,
          foreignShippingMethod: "LC_SEA" as const,
          shippingRateBasis: "FLAT" as const,
          foreignUnitPrice: 10,
          foreignExchangeRate: 10,
        })),
        {
          quantity: 1,
          sourcingType: "FOREIGN",
          foreignShippingMethod: "DOOR_TO_DOOR_SEA",
          shippingRateBasis: "PER_KG",
          foreignFreightCost: 25,
        } as const,
      ],
      lcContainerFee: 100,
      lcContainerAllocationMethod: "EQUAL",
      freightCost: 0,
      installationCost: 0,
      otherCost: 0,
      contingencyPercent: 0,
    });

    expect(result.calculatedItems.slice(0, 3).map((item) => item.foreignFreightCost.toFixed(2))).toEqual([
      "33.33",
      "33.33",
      "33.34",
    ]);
    expect(result.calculatedItems[3]?.foreignFreightCost.toFixed(2)).toBe("25.00");
  });

  it.each([
    ["WEIGHT", [1, 3], ["25.00", "75.00"]],
    ["VALUE", [1, 3], ["25.00", "75.00"]],
  ] as const)("allocates an LC container fee by %s", (method, bases, expected) => {
    const result = calculateTenderCostingTotals({
      items: bases.map((basis) => ({
        quantity: method === "VALUE" ? basis : 1,
        sourcingType: "FOREIGN",
        foreignShippingMethod: "LC_SEA",
        shippingRateBasis: "FLAT",
        shippingWeightKg: method === "WEIGHT" ? basis : 0,
        foreignUnitPrice: 10,
        foreignExchangeRate: 10,
      })),
      lcContainerFee: 100,
      lcContainerAllocationMethod: method,
      freightCost: 0,
      installationCost: 0,
      otherCost: 0,
      contingencyPercent: 0,
    });

    expect(result.calculatedItems.map((item) => item.foreignFreightCost.toFixed(2))).toEqual(expected);
  });
});
