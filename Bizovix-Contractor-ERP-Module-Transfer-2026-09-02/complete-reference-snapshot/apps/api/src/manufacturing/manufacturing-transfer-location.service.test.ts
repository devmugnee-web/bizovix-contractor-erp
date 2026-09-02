import { describe, expect, it, vi } from "vitest";

import { ManufacturingService } from "./manufacturing.service.js";

type Lot = {
  id: string;
  inventoryItemId: string;
  warehouseId: string;
  locationId: string | null;
  lotNumber: string;
};

function service() {
  return new ManufacturingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as {
    resolveTransferLocations: (
      tx: unknown,
      workspaceId: string,
      lines: Array<{
        inventoryItemId: string;
        inventoryLotId?: string | null;
      }>,
      fromWarehouseId: string,
      toWarehouseId: string,
      transactionType:
        | "MATERIAL_ISSUE"
        | "MATERIAL_RETURN"
        | "PACKAGING_ISSUE"
        | "PACKAGING_RETURN",
      defaultFromLocationId: string | null,
      defaultToLocationId: string | null,
    ) => Promise<{
      fromLocationId: string | null;
      toLocationId: string | null;
    }>;
  };
}

function transaction(lots: Lot[]) {
  return {
    manufacturingInventoryLot: {
      findMany: vi.fn().mockResolvedValue(lots),
    },
  };
}

describe("manufacturing material transfer location headers", () => {
  it("uses the persisted staged source location for an issue", async () => {
    const tx = transaction([
      {
        id: "lot-staged-1",
        inventoryItemId: "raw-1",
        warehouseId: "warehouse-rm",
        locationId: "location-staging",
        lotNumber: "RM-LOT-1-STAGED",
      },
    ]);

    await expect(
      service().resolveTransferLocations(
        tx,
        "workspace-1",
        [{ inventoryItemId: "raw-1", inventoryLotId: "lot-staged-1" }],
        "warehouse-rm",
        "warehouse-wip",
        "MATERIAL_ISSUE",
        "location-released",
        "location-wip",
      ),
    ).resolves.toEqual({
      fromLocationId: "location-staging",
      toLocationId: "location-wip",
    });
  });

  it("rejects a posting that mixes source locations", async () => {
    const tx = transaction([
      {
        id: "lot-a",
        inventoryItemId: "raw-1",
        warehouseId: "warehouse-rm",
        locationId: "location-a",
        lotNumber: "LOT-A",
      },
      {
        id: "lot-b",
        inventoryItemId: "raw-2",
        warehouseId: "warehouse-rm",
        locationId: "location-b",
        lotNumber: "LOT-B",
      },
    ]);

    await expect(
      service().resolveTransferLocations(
        tx,
        "workspace-1",
        [
          { inventoryItemId: "raw-1", inventoryLotId: "lot-a" },
          { inventoryItemId: "raw-2", inventoryLotId: "lot-b" },
        ],
        "warehouse-rm",
        "warehouse-wip",
        "MATERIAL_ISSUE",
        "location-released",
        "location-wip",
      ),
    ).rejects.toThrow("cannot mix inventory lots from different locations");
  });

  it("uses the receiving inventory lot location for a return", async () => {
    const tx = transaction([
      {
        id: "lot-return-1",
        inventoryItemId: "raw-1",
        warehouseId: "warehouse-rm",
        locationId: "location-released",
        lotNumber: "RM-LOT-1",
      },
    ]);

    await expect(
      service().resolveTransferLocations(
        tx,
        "workspace-1",
        [{ inventoryItemId: "raw-1", inventoryLotId: "lot-return-1" }],
        "warehouse-wip",
        "warehouse-rm",
        "MATERIAL_RETURN",
        "location-wip",
        "location-default-rm",
      ),
    ).resolves.toEqual({
      fromLocationId: "location-wip",
      toLocationId: "location-released",
    });
  });

  it("rejects missing or foreign-workspace lot references", async () => {
    const tx = transaction([]);

    await expect(
      service().resolveTransferLocations(
        tx,
        "workspace-1",
        [{ inventoryItemId: "raw-1", inventoryLotId: "foreign-lot" }],
        "warehouse-rm",
        "warehouse-wip",
        "MATERIAL_ISSUE",
        null,
        null,
      ),
    ).rejects.toThrow("do not exist in this workspace");
  });
});
