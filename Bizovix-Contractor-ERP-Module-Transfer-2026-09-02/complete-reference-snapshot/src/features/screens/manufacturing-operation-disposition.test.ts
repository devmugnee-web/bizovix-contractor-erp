import { describe, expect, it } from "vitest";

import { manufacturingDispositionCandidates } from "@/features/screens/manufacturing-operation-disposition";
import type { ManufacturingProductionOrderRecord } from "@/types/manufacturing";

function orderFixture(): Pick<
  ManufacturingProductionOrderRecord,
  "operationExecutions" | "transactions"
> {
  return {
    operationExecutions: [
      {
        id: "operation-complete",
        orderLotId: "lot-1",
        routingOperationId: "routing-operation-1",
        operationSequence: 10,
        operationCode: "PACK",
        operationName: "Packing",
        qcRequired: true,
        status: "COMPLETED",
        plannedQuantity: 10,
        inputQuantity: 10,
        goodQuantity: 7,
        rejectedQuantity: 0,
        scrapQuantity: 1.25,
        reworkQuantity: 1.75,
        startedAt: "2026-09-10T08:00:00.000Z",
        completedAt: "2026-09-10T09:00:00.000Z",
        pauseReason: null,
      },
      {
        id: "operation-open",
        orderLotId: "lot-1",
        routingOperationId: "routing-operation-2",
        operationSequence: 20,
        operationCode: "RELEASE",
        operationName: "Release",
        qcRequired: true,
        status: "IN_PROGRESS",
        plannedQuantity: 10,
        inputQuantity: 0,
        goodQuantity: 0,
        rejectedQuantity: 0,
        scrapQuantity: 5,
        reworkQuantity: 5,
        startedAt: null,
        completedAt: null,
        pauseReason: null,
      },
    ],
    transactions: [
      {
        id: "scrap-posting",
        transactionNumber: "MSD-001",
        transactionType: "SCRAP_RECEIPT",
        status: "POSTED",
        transactionDate: "2026-09-10T10:00:00.000Z",
        orderLotId: "lot-1",
        operationExecutionId: "operation-complete",
        fromWarehouseId: "wip",
        toWarehouseId: "scrap",
        fromLocationId: "wip-location",
        toLocationId: "scrap-location",
        voucherEntryId: "voucher-1",
        lines: [
          {
            id: "scrap-line",
            inventoryItemId: "scrap-item",
            orderMaterialId: null,
            reservationLineId: null,
            sourceInventoryLotId: null,
            destinationInventoryLotId: "scrap-lot",
            quantity: 0.25,
            unit: "pcs",
            unitCost: 0,
            totalCost: 0,
            stockMovements: [],
            sourceInventoryLot: null,
            destinationInventoryLot: null,
            serialNumbers: [],
          },
        ],
        journal: null,
      },
    ],
  };
}

describe("manufacturing operation disposition candidates", () => {
  it("offers only the exact undisposed scrap balance from completed operations", () => {
    const candidates = manufacturingDispositionCandidates(
      orderFixture(),
      "POST_SCRAP_DISPOSITION",
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      recordedQuantity: 1.25,
      postedQuantity: 0.25,
      remainingQuantity: 1,
      execution: { id: "operation-complete" },
    });
  });

  it("keeps scrap and rework postings isolated by transaction type", () => {
    const candidates = manufacturingDispositionCandidates(
      orderFixture(),
      "CREATE_REWORK_DISPOSITION",
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      recordedQuantity: 1.75,
      postedQuantity: 0,
      remainingQuantity: 1.75,
    });
  });
});
