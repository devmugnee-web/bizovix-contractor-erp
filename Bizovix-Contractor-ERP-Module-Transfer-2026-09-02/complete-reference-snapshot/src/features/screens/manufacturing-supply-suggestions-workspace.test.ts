import { describe, expect, it } from "vitest";

import {
  collectRealMrpShortages,
  validateSupplySuggestionDraft,
} from "@/features/screens/manufacturing-supply-suggestions-workspace";
import type { ManufacturingMrpRunRecord } from "@/types/manufacturing";

function run(
  id: string,
  status: ManufacturingMrpRunRecord["status"],
  isWhatIfScenario: boolean,
  shortageQuantity: number,
  requiredDate = "2026-09-02",
): ManufacturingMrpRunRecord {
  return {
    id,
    workspaceId: "workspace-1",
    runNumber: `MRP-${id}`,
    planId: `plan-${id}`,
    planNumber: null,
    finishedProduct: null,
    status,
    asOfDate: "2026-08-30",
    horizonEndDate: "2026-09-30",
    startedAt: null,
    completedAt: status === "COMPLETED" ? "2026-08-30T10:00:00Z" : null,
    errorMessage: null,
    warehouseId: "warehouse-1",
    maxProducibleQuantity: null,
    planQuantity: 10,
    scenarioQuantity: null,
    isWhatIfScenario,
    canFulfillPlan: shortageQuantity === 0,
    shortageItemCount: shortageQuantity > 0 ? 1 : 0,
    requirements: [
      {
        id: `requirement-${id}`,
        inventoryItemId: `item-${id}`,
        itemCode: `RM-${id}`,
        itemName: `Raw material ${id}`,
        bomComponentId: null,
        warehouseId: "warehouse-1",
        locationId: null,
        requiredDate,
        unit: "pcs",
        grossRequirement: 20,
        onHandQuantity: 20 - shortageQuantity,
        activeReservationQty: 0,
        scheduledReceiptQty: 0,
        availableQuantity: 20 - shortageQuantity,
        netRequirement: shortageQuantity,
        shortageQuantity,
        snapshotUnitCost: 100,
      },
    ],
    createdAt: "2026-08-30T09:00:00Z",
    updatedAt: "2026-08-30T10:00:00Z",
  };
}

describe("manufacturing supply suggestion real-data rules", () => {
  it("uses only positive shortages from completed non-what-if MRP runs", () => {
    const result = collectRealMrpShortages([
      run("real-later", "COMPLETED", false, 3, "2026-09-05"),
      run("failed", "FAILED", false, 8),
      run("scenario", "COMPLETED", true, 7),
      run("covered", "COMPLETED", false, 0),
      run("real-first", "COMPLETED", false, 2, "2026-09-01"),
    ]);

    expect(result.map((row) => row.requirementId)).toEqual([
      "requirement-real-first",
      "requirement-real-later",
    ]);
    expect(result.every((row) => row.shortageQuantity > 0)).toBe(true);
  });

  it("rejects over-suggestion and invalid warehouse-transfer flows", () => {
    expect(
      validateSupplySuggestionDraft({
        type: "PURCHASE_REQUISITION",
        requirementId: "requirement-1",
        requestedQuantity: 11,
        remainingShortage: 10,
        requirementWarehouseId: "warehouse-destination",
        destinationWarehouseId: "warehouse-destination",
      }),
    ).toContain("cannot exceed");

    expect(
      validateSupplySuggestionDraft({
        type: "STOCK_TRANSFER",
        requirementId: "requirement-1",
        requestedQuantity: 5,
        remainingShortage: 10,
        requirementWarehouseId: "warehouse-destination",
        destinationWarehouseId: "warehouse-destination",
        sourceWarehouseId: "warehouse-destination",
      }),
    ).toBe("Source and destination warehouses must be different.");
  });

  it("accepts a bounded stock-transfer suggestion between real warehouses", () => {
    expect(
      validateSupplySuggestionDraft({
        type: "STOCK_TRANSFER",
        requirementId: "requirement-1",
        requestedQuantity: 5,
        remainingShortage: 10,
        requirementWarehouseId: "warehouse-destination",
        destinationWarehouseId: "warehouse-destination",
        sourceWarehouseId: "warehouse-source",
      }),
    ).toBeNull();
  });
});
