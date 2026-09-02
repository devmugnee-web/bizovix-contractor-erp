import { describe, expect, it } from "vitest";

import { calculateBomRequirements } from "./domain.js";
import {
  ManufacturingUnitConversionError,
  convertManufacturingQuantityFromBase,
  normalizeManufacturingQuantityToBase,
} from "./manufacturing-uom.domain.js";

const weightedMaterial = {
  id: "material-steel",
  itemCode: "RM-STEEL",
  itemName: "Steel",
  unit: "kg",
  alternateUnit: "g",
  alternateUnitConversion: "1000",
};

describe("manufacturing UOM conversion", () => {
  it("converts the stock/base unit to the configured alternate unit exactly", () => {
    const result = convertManufacturingQuantityFromBase(
      weightedMaterial,
      "2.5",
      "g",
    );

    expect(result.quantity.toString()).toBe("2500");
    expect(result.unit).toBe("g");
    expect(result.evidence).toMatchObject({
      sourceQuantity: "2.5",
      sourceUnit: "kg",
      targetQuantity: "2500",
      targetUnit: "g",
      baseQuantity: "2.5",
      baseUnit: "kg",
      conversionFactor: "1000",
      direction: "BASE_TO_ALTERNATE",
    });
  });

  it("converts the configured alternate unit back to stock/base exactly", () => {
    const result = normalizeManufacturingQuantityToBase(
      weightedMaterial,
      "2500",
      "G",
    );

    expect(result.quantity.toString()).toBe("2.5");
    expect(result.unit).toBe("kg");
    expect(result.evidence).toMatchObject({
      sourceQuantity: "2500",
      sourceUnit: "g",
      targetQuantity: "2.5",
      targetUnit: "kg",
      baseQuantity: "2.5",
      direction: "ALTERNATE_TO_BASE",
    });
  });

  it("rejects a missing or ambiguous alternate-unit conversion", () => {
    expect(() =>
      normalizeManufacturingQuantityToBase(
        { ...weightedMaterial, alternateUnitConversion: null },
        "2500",
        "g",
      ),
    ).toThrow(ManufacturingUnitConversionError);

    expect(() =>
      normalizeManufacturingQuantityToBase(
        { ...weightedMaterial, alternateUnit: "KG" },
        "1",
        "kg",
      ),
    ).toThrow(/ambiguous unit configuration/i);

    expect(() =>
      normalizeManufacturingQuantityToBase(weightedMaterial, "1", "lb"),
    ).toThrow(/not a configured unit/i);
  });

  it("keeps the 10-fridge base-unit BOM requirement path unchanged", () => {
    const finishedQuantity = normalizeManufacturingQuantityToBase(
      {
        id: "fridge",
        itemCode: "FG-FRIDGE",
        unit: "pcs",
        alternateUnit: null,
        alternateUnitConversion: null,
      },
      "10",
      "pcs",
    );
    const requirements = calculateBomRequirements(
      [
        {
          materialId: "body",
          quantityPerOutput: "1",
          unit: "pcs",
        },
        {
          materialId: "compressor",
          quantityPerOutput: "1",
          unit: "pcs",
        },
        {
          materialId: "power-supplier",
          quantityPerOutput: "1",
          unit: "pcs",
        },
      ],
      finishedQuantity.quantity,
    );

    expect(finishedQuantity.evidence.direction).toBe("BASE_TO_BASE");
    expect(finishedQuantity.quantity.toString()).toBe("10");
    expect(requirements.map((row) => row.requiredQuantity.toString())).toEqual([
      "10",
      "10",
      "10",
    ]);
  });
});
