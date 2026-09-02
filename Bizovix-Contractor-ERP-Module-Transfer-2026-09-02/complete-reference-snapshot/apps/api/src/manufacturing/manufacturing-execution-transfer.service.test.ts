import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../inventory/moving-average.js", () => ({
  rebuildMovingAverageCosts: vi.fn(),
}));

import { rebuildMovingAverageCosts } from "../inventory/moving-average.js";
import { ManufacturingExecutionTransferService } from "./manufacturing-execution-transfer.service.js";

const user = {
  id: "user-1",
  sessionId: "session-1",
  tenantId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
} as never;

function persistedTransfer(input: {
  destinationLotId: string;
  toWarehouseId: string;
}) {
  return {
    id: "transfer-1",
    transactionNumber: "WLT-20260830-ABC",
    transactionDate: new Date("2026-08-30T00:00:00.000Z"),
    orderId: "order-1",
    orderLotId: "order-lot-1",
    operationExecutionId: "execution-1",
    fromWarehouseId: "warehouse-1",
    toWarehouseId: input.toWarehouseId,
    fromLocationId: "location-wip-1",
    toLocationId: "location-wip-2",
    notes: "Controlled move",
    postedAt: new Date("2026-08-30T00:00:00.000Z"),
    postedByUserId: "user-1",
    order: { orderNumber: "MO-001" },
    orderLot: { lotNumber: "BATCH-001" },
    operationExecution: { routingOperation: { code: "MIX" } },
    fromWarehouse: { name: "WIP A" },
    toWarehouse: {
      name: input.toWarehouseId === "warehouse-1" ? "WIP A" : "WIP B",
    },
    fromLocation: { name: "Mixing" },
    toLocation: { name: "Holding" },
    postedBy: { name: "Operator" },
    lines: [
      {
        inventoryItemId: "item-1",
        sourceInventoryLotId: "inventory-lot-1",
        destinationInventoryLotId: input.destinationLotId,
        quantity: 4,
        unit: "kg",
        unitCost: 12.5,
        totalCost: 50,
        inventoryItem: { itemCode: "BULK-1", itemName: "Bulk mix" },
        sourceInventoryLot: { lotNumber: "BATCH-001" },
        destinationInventoryLot: { lotNumber: "BATCH-001-WIP-CHILD" },
      },
    ],
  };
}

function createHarness(
  input: {
    interWarehouse?: boolean;
    kind?: "WIP_TRANSFER" | "BULK_PRODUCT_TRANSFER";
    controlLot?: boolean;
    sourceOperationExecutionId?: string | null;
    sourceRetestDueAt?: Date | null;
  } = {},
) {
  const interWarehouse = Boolean(input.interWarehouse);
  const kind = input.kind ?? "WIP_TRANSFER";
  const controlLot = input.controlLot ?? !interWarehouse;
  const review = {
    id: "review-1",
    workflowCode: kind,
    evidence: {
      stockMovementIds: interWarehouse ? ["movement-out", "movement-in"] : [],
    },
  };
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    manufacturingTransaction: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "transfer-1" }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(
        persistedTransfer({
          destinationLotId: "destination-lot-1",
          toWarehouseId: interWarehouse ? "warehouse-2" : "warehouse-1",
        }),
      ),
    },
    manufacturingWorkflowReview: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(review),
    },
    manufacturingPeriod: { findUnique: vi.fn().mockResolvedValue(null) },
    fiscalYear: { findFirst: vi.fn().mockResolvedValue({ id: "fy-1" }) },
    manufacturingSettings: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ electronicSignatureRequired: true }),
    },
    manufacturingOrder: {
      findFirst: vi.fn().mockResolvedValue({
        id: "order-1",
        orderNumber: "MO-001",
        status: kind === "WIP_TRANSFER" ? "IN_PRODUCTION" : "COMPLETED",
      }),
    },
    manufacturingOrderLot: {
      findFirst: vi.fn().mockResolvedValue({
        id: "order-lot-1",
        lotNumber: "BATCH-001",
        status: "IN_PRODUCTION",
      }),
    },
    manufacturingOperationExecution: {
      findFirst: vi.fn().mockResolvedValue({
        id: "execution-1",
        orderLotId: "order-lot-1",
        status: "COMPLETED",
        routingOperation: { code: "MIX", name: "Mixing", sequence: 1 },
      }),
    },
    manufacturingInventoryLot: {
      findFirst: vi.fn().mockResolvedValue({
        id: "inventory-lot-1",
        workspaceId: "workspace-1",
        inventoryItemId: "item-1",
        warehouseId: "warehouse-1",
        locationId: "location-wip-1",
        lotNumber: "BATCH-001",
        receivedQuantity: 10,
        availableQuantity: 10,
        reservedQuantity: 0,
        holdQuantity: 0,
        rejectedQuantity: 0,
        unit: "kg",
        unitCost: 12.5,
        manufacturedAt: new Date("2026-08-29T00:00:00.000Z"),
        expiresAt: null,
        retestDueAt:
          input.sourceRetestDueAt === undefined
            ? new Date("2026-09-30T00:00:00.000Z")
            : input.sourceRetestDueAt,
        inventoryItem: {
          itemCode: "BULK-1",
          itemName: "Bulk mix",
          manufacturingProfile: {
            role: kind === "BULK_PRODUCT_TRANSFER" ? "BULK" : "INTERMEDIATE",
          },
        },
        warehouse: { id: "warehouse-1", isActive: true, deletedAt: null },
        location: {
          id: "location-wip-1",
          code: "WIP-A",
          disposition: "WIP",
          isActive: true,
        },
        sourceTransactionLine: {
          transaction: {
            id: controlLot ? "operation-output-1" : "production-receipt-1",
            transactionType: controlLot
              ? "LOCATION_TRANSFER"
              : "PRODUCTION_RECEIPT",
            idempotencyKey: controlLot
              ? "MFG:OPERATION-WIP:execution-1"
              : "MFG:PRODUCTION-RECEIPT:1",
            operationExecutionId:
              input.sourceOperationExecutionId === undefined
                ? controlLot
                  ? "execution-1"
                  : null
                : input.sourceOperationExecutionId,
            orderId: "order-1",
            orderLotId: "order-lot-1",
          },
        },
        serials: [],
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: "destination-lot-1" }),
    },
    manufacturingLocation: {
      findFirst: vi.fn().mockResolvedValue({
        id: "location-wip-2",
        code: "WIP-B",
        disposition: "WIP",
        warehouseId: interWarehouse ? "warehouse-2" : "warehouse-1",
        warehouse: {
          id: interWarehouse ? "warehouse-2" : "warehouse-1",
          name: interWarehouse ? "WIP B" : "WIP A",
          isActive: true,
          deletedAt: null,
        },
      }),
    },
    manufacturingGenealogy: { create: vi.fn().mockResolvedValue({}) },
    manufacturingTransactionLine: { update: vi.fn().mockResolvedValue({}) },
    manufacturingSerial: { updateMany: vi.fn() },
    manufacturingSerialMovement: { createMany: vi.fn() },
    stockMovement: {
      create: vi
        .fn()
        .mockResolvedValueOnce({ id: "movement-out" })
        .mockResolvedValueOnce({ id: "movement-in" }),
    },
  };
  const prisma = {
    workspace: {
      findFirst: vi.fn().mockResolvedValue({
        id: "workspace-1",
        tenantId: "tenant-1",
        companyId: "company-1",
      }),
    },
    $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const permissions = {
    getGrantedKeys: vi
      .fn()
      .mockResolvedValue(new Set(["manufacturing.production.execute"])),
  };
  const electronicSignature = {
    enforce: vi.fn().mockResolvedValue({ policyRecordId: "policy-1" }),
  };
  const inventoryService = {
    reconcileMovingAverageLedger: vi.fn().mockResolvedValue(undefined),
  };
  const service = new ManufacturingExecutionTransferService(
    prisma as never,
    permissions as never,
    electronicSignature as never,
    inventoryService as never,
  );
  return {
    service,
    prisma,
    permissions,
    electronicSignature,
    inventoryService,
    tx,
  };
}

function dto(kind: "WIP_TRANSFER" | "BULK_PRODUCT_TRANSFER") {
  return {
    workspaceId: "workspace-1",
    kind,
    orderId: "order-1",
    orderLotId: "order-lot-1",
    operationExecutionId: "execution-1",
    sourceInventoryLotId: "inventory-lot-1",
    destinationLocationId: "location-wip-2",
    quantity: 4,
    transactionDate: "2026-08-30T00:00:00.000Z",
    idempotencyKey: `${kind.toLowerCase()}-1`,
    note: "Controlled move",
    signatureMeaning: "Transferred",
    reauthenticationPassword: "secret",
  };
}

function createContextHarness() {
  const prisma = {
    workspace: {
      findFirst: vi.fn().mockResolvedValue({
        id: "workspace-1",
        tenantId: "tenant-1",
        companyId: "company-1",
      }),
    },
    manufacturingOrder: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "order-1",
          orderNumber: "MO-001",
          status: "IN_PRODUCTION",
          type: "ASSEMBLY",
          finishedProductId: "item-1",
          plannedStartDate: new Date("2026-08-29T00:00:00.000Z"),
          createdAt: new Date("2026-08-29T00:00:00.000Z"),
          finishedProduct: {
            id: "item-1",
            itemCode: "INT-1",
            itemName: "Mixed intermediate",
          },
          lots: [
            {
              id: "order-lot-1",
              lotNumber: "BATCH-001",
              status: "IN_PRODUCTION",
              plannedQuantity: 10,
              completedQuantity: 0,
            },
          ],
          operationExecutions: [
            {
              id: "execution-1",
              orderLotId: "order-lot-1",
              status: "COMPLETED",
              routingOperationId: "routing-operation-1",
              goodQuantity: 9,
              completedAt: new Date("2026-08-30T00:00:00.000Z"),
              routingOperation: {
                id: "routing-operation-1",
                code: "MIX",
                name: "Mixing",
                sequence: 1,
              },
            },
          ],
        },
      ]),
    },
    manufacturingLocation: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "location-wip-1",
          code: "WIP-A",
          name: "Mixing output",
          disposition: "WIP",
          warehouseId: "warehouse-1",
          warehouse: { id: "warehouse-1", code: "WIP", name: "WIP" },
        },
        {
          id: "location-wip-2",
          code: "WIP-B",
          name: "Next operation",
          disposition: "WIP",
          warehouseId: "warehouse-1",
          warehouse: { id: "warehouse-1", code: "WIP", name: "WIP" },
        },
      ]),
    },
    manufacturingInventoryLot: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "operation-output-lot-1",
          inventoryItemId: "item-1",
          warehouseId: "warehouse-1",
          locationId: "location-wip-1",
          lotNumber: "BATCH-001-MIX-WIP",
          availableQuantity: 9,
          reservedQuantity: 0,
          holdQuantity: 0,
          rejectedQuantity: 0,
          unit: "kg",
          unitCost: 12.5,
          manufacturedAt: new Date("2026-08-30T00:00:00.000Z"),
          expiresAt: null,
          retestDueAt: new Date("2026-09-30T00:00:00.000Z"),
          createdAt: new Date("2026-08-30T00:00:00.000Z"),
          inventoryItem: {
            itemCode: "INT-1",
            itemName: "Mixed intermediate",
            manufacturingProfile: { role: "INTERMEDIATE" },
          },
          warehouse: {
            id: "warehouse-1",
            code: "WIP",
            name: "WIP",
            isActive: true,
            deletedAt: null,
          },
          location: {
            id: "location-wip-1",
            code: "WIP-A",
            name: "Mixing output",
            disposition: "WIP",
            isActive: true,
          },
          sourceTransactionLine: {
            transaction: {
              id: "operation-output-transaction-1",
              transactionType: "LOCATION_TRANSFER",
              idempotencyKey: "MFG:OPERATION-WIP:execution-1",
              operationExecutionId: "execution-1",
              orderId: "order-1",
              orderLotId: "order-lot-1",
              order: {
                id: "order-1",
                orderNumber: "MO-001",
                status: "IN_PRODUCTION",
              },
              orderLot: { id: "order-lot-1", lotNumber: "BATCH-001" },
            },
          },
          serials: [],
        },
      ]),
    },
    manufacturingSettings: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ electronicSignatureRequired: true }),
    },
    manufacturingControlRecord: { findFirst: vi.fn().mockResolvedValue(null) },
    manufacturingWorkflowReview: { findMany: vi.fn().mockResolvedValue([]) },
    manufacturingTransaction: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const permissions = {
    getGrantedKeys: vi
      .fn()
      .mockResolvedValue(new Set(["manufacturing.production.execute"])),
  };
  const service = new ManufacturingExecutionTransferService(
    prisma as never,
    permissions as never,
    {} as never,
  );
  return { service, prisma };
}

describe("ManufacturingExecutionTransferService", () => {
  beforeEach(() => {
    vi.mocked(rebuildMovingAverageCosts).mockReset();
  });

  it("posts a partial same-warehouse WIP move as a child lot with genealogy and no stock movement", async () => {
    const { service, tx, electronicSignature } = createHarness();
    const result = await service.post(user, dto("WIP_TRANSFER"));

    expect(result.replayed).toBe(false);
    expect(electronicSignature.enforce).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ required: true, actionLabel: "WIP transfer" }),
    );
    expect(tx.manufacturingInventoryLot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { availableQuantity: { decrement: expect.anything() } },
      }),
    );
    expect(tx.manufacturingInventoryLot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          warehouseId: "warehouse-1",
          locationId: "location-wip-2",
          availableQuantity: expect.anything(),
          unitCost: 12.5,
          retestDueAt: new Date("2026-09-30T00:00:00.000Z"),
        }),
      }),
    );
    expect(tx.manufacturingGenealogy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          relationshipType: "WIP_LOCATION_TRANSFER",
        }),
      }),
    );
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(rebuildMovingAverageCosts).not.toHaveBeenCalled();
    expect(tx.manufacturingWorkflowReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: expect.objectContaining({
            stockBacked: false,
            sourceOperationExecutionId: "execution-1",
            noGeneralLedgerEntry: true,
          }),
        }),
      }),
    );
  });

  it("posts balanced OUT/IN stock movements for an inter-warehouse bulk transfer", async () => {
    const { service, tx } = createHarness({
      interWarehouse: true,
      kind: "BULK_PRODUCT_TRANSFER",
    });
    // The production IDs are deterministic UUIDs, so the mocked costing rows
    // must use the line ID that the service passes to the movement create.
    tx.stockMovement.create.mockImplementation(
      async ({ data }: { data: { movementType: string } }) => ({
        id: data.movementType === "OUT" ? "movement-out" : "movement-in",
      }),
    );
    vi.mocked(rebuildMovingAverageCosts).mockImplementation(async () => {
      const lineId =
        tx.stockMovement.create.mock.calls[0][0].data.transactionLineId;
      return {
        movements: [
          {
            transactionId:
              tx.stockMovement.create.mock.calls[0][0].data.transactionId,
            transactionLineId: lineId,
            transactionType: "STOCK_TRANSFER_OUT",
            movementValue: 50,
          },
          {
            transactionId:
              tx.stockMovement.create.mock.calls[1][0].data.transactionId,
            transactionLineId: lineId,
            transactionType: "STOCK_TRANSFER_IN",
            movementValue: 50,
          },
        ],
        balances: new Map(),
      } as never;
    });

    const result = await service.post(user, dto("BULK_PRODUCT_TRANSFER"));

    expect(result.transfer.interWarehouse).toBe(true);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
    expect(
      tx.stockMovement.create.mock.calls.map(
        (call) => call[0].data.transactionType,
      ),
    ).toEqual(["STOCK_TRANSFER_OUT", "STOCK_TRANSFER_IN"]);
    expect(rebuildMovingAverageCosts).toHaveBeenCalledWith(tx, "workspace-1", [
      "item-1",
    ]);
    expect(tx.manufacturingWorkflowReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowCode: "BULK_PRODUCT_TRANSFER",
          evidence: expect.objectContaining({
            interWarehouse: true,
            stockMovementIds: ["movement-out", "movement-in"],
            noGeneralLedgerEntry: true,
          }),
        }),
      }),
    );
  });

  it("exposes a completed operation-output lot as a real exact-operation WIP transfer candidate", async () => {
    const { service } = createContextHarness();

    const context = await service.getContext(
      user,
      "workspace-1",
      "WIP_TRANSFER",
    );

    expect(context.orders[0].operationExecutions).toEqual([
      expect.objectContaining({ id: "execution-1", status: "COMPLETED" }),
    ]);
    expect(context.sourceLots).toEqual([
      expect.objectContaining({
        id: "operation-output-lot-1",
        orderId: "order-1",
        orderLotId: "order-lot-1",
        sourceOperationExecutionId: "execution-1",
        stockBacked: false,
        sourceClassification: "OPERATION_OUTPUT_CONTROL_LOT",
        transferableQuantity: 9,
        retestDueAt: new Date("2026-09-30T00:00:00.000Z"),
      }),
    ]);
  });

  it("blocks a control WIP lot from inter-warehouse stock movement", async () => {
    const { service, tx } = createHarness({
      interWarehouse: true,
      controlLot: true,
    });

    await expect(service.post(user, dto("WIP_TRANSFER"))).rejects.toThrow(
      "Operation-output WIP control lots can move only between locations in the same WIP warehouse",
    );
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(rebuildMovingAverageCosts).not.toHaveBeenCalled();
  });

  it("requires the selected completed operation to be the exact source operation for control WIP", async () => {
    const { service, tx } = createHarness({
      sourceOperationExecutionId: "execution-other",
    });

    await expect(service.post(user, dto("WIP_TRANSFER"))).rejects.toThrow(
      "Selected operation is not the exact source operation",
    );
    expect(tx.manufacturingTransaction.create).not.toHaveBeenCalled();
  });

  it("blocks a source lot that has passed its retest-due date", async () => {
    const { service, tx } = createHarness({
      sourceRetestDueAt: new Date("2026-08-29T00:00:00.000Z"),
    });

    await expect(service.post(user, dto("WIP_TRANSFER"))).rejects.toThrow(
      "has passed its retest-due date",
    );
    expect(tx.manufacturingTransaction.create).not.toHaveBeenCalled();
  });
});
