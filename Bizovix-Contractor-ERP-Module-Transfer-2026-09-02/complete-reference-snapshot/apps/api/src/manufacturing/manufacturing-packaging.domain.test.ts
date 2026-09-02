import { describe, expect, it } from "vitest";

import {
  allocateSerialRange,
  calculateOrderLevelPackagingLotRequirement,
  calculatePackagingMaterialRequirements,
  evaluatePackagingHierarchy,
  evaluatePackagingReconciliation,
  ManufacturingPackagingDomainError,
  packagingCoverageOverlaps,
} from "./manufacturing-packaging.domain.js";

describe("manufacturing serial and packaging invariants", () => {
  it("allocates a bounded, padded serial range", () => {
    expect(
      allocateSerialRange({
        prefix: "FR-",
        suffix: "-26",
        nextNumber: 1,
        endNumber: 10,
        padding: 3,
        quantity: 3,
      }),
    ).toEqual(["FR-001-26", "FR-002-26", "FR-003-26"]);
    expect(() =>
      allocateSerialRange({
        prefix: "FR-",
        nextNumber: 9,
        endNumber: 10,
        padding: 3,
        quantity: 3,
      }),
    ).toThrow(ManufacturingPackagingDomainError);
  });

  it("blocks overlapping order-level and lot-level packaging coverage while retaining distinct lot orders", () => {
    expect(packagingCoverageOverlaps(null, null)).toBe(true);
    expect(packagingCoverageOverlaps(null, "lot-1")).toBe(true);
    expect(packagingCoverageOverlaps("lot-1", null)).toBe(true);
    expect(packagingCoverageOverlaps("lot-1", "lot-1")).toBe(true);
    expect(packagingCoverageOverlaps("lot-1", "lot-2")).toBe(false);
  });

  it("requires exact four-decimal packaging reconciliation", () => {
    expect(
      evaluatePackagingReconciliation({
        issuedQuantity: "10",
        usedQuantity: "8.5",
        returnedQuantity: "1",
        rejectedQuantity: "0.5",
        destroyedQuantity: 0,
      }).ready,
    ).toBe(true);
    expect(
      evaluatePackagingReconciliation({
        issuedQuantity: "10",
        usedQuantity: "8",
        returnedQuantity: "1",
        rejectedQuantity: 0,
        destroyedQuantity: 0,
      }).ready,
    ).toBe(false);
  });

  it("aggregates approved packaging components across production lots without duplicate material rows", () => {
    const result = calculatePackagingMaterialRequirements([
      {
        sourceId: "pack-lot-01",
        plannedQuantity: "2.0000",
        components: [
          {
            inventoryItemId: "carton",
            quantityPerFinishedUnit: "1.2500",
            unit: "pcs",
          },
          {
            inventoryItemId: "label",
            quantityPerFinishedUnit: "2.0000",
            unit: "pcs",
          },
        ],
      },
      {
        sourceId: "pack-lot-02",
        plannedQuantity: "3.0000",
        components: [
          {
            inventoryItemId: "carton",
            quantityPerFinishedUnit: "1.2500",
            unit: "PCS",
          },
          {
            inventoryItemId: "label",
            quantityPerFinishedUnit: "2.0000",
            unit: "pcs",
          },
        ],
      },
    ]);

    expect(
      result.map((requirement) => ({
        inventoryItemId: requirement.inventoryItemId,
        requiredQuantity: requirement.requiredQuantity.toFixed(4),
        sourceIds: requirement.sourceIds,
      })),
    ).toEqual([
      {
        inventoryItemId: "carton",
        requiredQuantity: "6.2500",
        sourceIds: ["pack-lot-01", "pack-lot-02"],
      },
      {
        inventoryItemId: "label",
        requiredQuantity: "10.0000",
        sourceIds: ["pack-lot-01", "pack-lot-02"],
      },
    ]);
  });

  it("rounds once after exact Decimal aggregation instead of rounding each lot", () => {
    const [requirement] = calculatePackagingMaterialRequirements([
      {
        sourceId: "pack-lot-01",
        plannedQuantity: "0.5000",
        components: [
          {
            inventoryItemId: "ink",
            quantityPerFinishedUnit: "0.0001",
            unit: "kg",
          },
        ],
      },
      {
        sourceId: "pack-lot-02",
        plannedQuantity: "0.5000",
        components: [
          {
            inventoryItemId: "ink",
            quantityPerFinishedUnit: "0.0001",
            unit: "KG",
          },
        ],
      },
    ]);

    expect(requirement.requiredQuantity.toFixed(4)).toBe("0.0001");
  });

  it("allocates an order-level requirement proportionally and assigns rounding residual to the final lot", () => {
    const input = {
      componentQuantityPerFinishedUnit: "0.3333",
      packagingPlannedQuantity: "10",
      orderPlannedQuantity: "10",
      lots: [
        { id: "lot-1", plannedQuantity: "3" },
        { id: "lot-2", plannedQuantity: "3" },
        { id: "lot-3", plannedQuantity: "4" },
      ],
    };
    const shares = input.lots.map((lot) =>
      calculateOrderLevelPackagingLotRequirement({
        ...input,
        orderLotId: lot.id,
      }),
    );

    expect(shares.map((share) => share.toFixed(4))).toEqual([
      "0.9999",
      "0.9999",
      "1.3332",
    ]);
    expect(shares.reduce((total, share) => total.add(share)).toFixed(4)).toBe(
      "3.3330",
    );
  });

  it("blocks conflicting component units across packaging lots", () => {
    expect(() =>
      calculatePackagingMaterialRequirements([
        {
          sourceId: "pack-lot-01",
          plannedQuantity: "2",
          components: [
            {
              inventoryItemId: "film",
              quantityPerFinishedUnit: "1",
              unit: "m",
            },
          ],
        },
        {
          sourceId: "pack-lot-02",
          plannedQuantity: "3",
          components: [
            {
              inventoryItemId: "film",
              quantityPerFinishedUnit: "1",
              unit: "kg",
            },
          ],
        },
      ]),
    ).toThrow("conflicting units");
  });

  it("requires each serialized unit to have a used label and carton parent", () => {
    const result = evaluatePackagingHierarchy({
      serialIds: ["s1", "s2"],
      usedLabelSerialIds: ["s1", "s2"],
      units: [
        { id: "carton", level: "CARTON", parentId: null },
        { id: "u1", level: "UNIT", parentId: "carton", serialId: "s1" },
        { id: "u2", level: "UNIT", parentId: "carton", serialId: "s2" },
      ],
    });
    expect(result).toEqual({ ready: true, issues: [] });
    expect(
      evaluatePackagingHierarchy({
        serialIds: ["s1"],
        usedLabelSerialIds: ["s1", "s1"],
        units: [
          { id: "carton", level: "CARTON", parentId: null },
          { id: "u1", level: "UNIT", parentId: "carton", serialId: "s1" },
        ],
      }).ready,
    ).toBe(false);
  });
});
