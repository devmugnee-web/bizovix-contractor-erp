import { describe, expect, it, vi } from "vitest";

import { Prisma } from "../generated/prisma/index.js";
import { ManufacturingService } from "./manufacturing.service.js";

const scope = {
  id: "workspace-1",
  tenantId: "tenant-1",
  companyId: "company-1",
};
const user = { id: "checker-1" } as never;
const when = new Date("2026-09-10T00:00:00.000Z");

function operationOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "MO-2026-000001",
    status: "IN_PRODUCTION",
    createdByUserId: "maker-1",
    finishedProductId: "finished-1",
    finishedProduct: { manufacturingProfile: { serialTracked: false } },
    bomVersionId: "bom-original",
    routingVersionId: "routing-original",
    issueWarehouseId: "warehouse-rm",
    receiptWarehouseId: "warehouse-fgq",
    issueLocationId: "location-rm",
    receiptLocationId: "location-fgq",
    plannedQuantity: new Prisma.Decimal(10),
    completedQuantity: new Prisma.Decimal(0),
    rejectedQuantity: new Prisma.Decimal(0),
    unit: "pcs",
    materials: [],
    reservations: [],
    transactions: [],
    qualityInspections: [],
    serials: [],
    packagingOrders: [],
    costSnapshots: [],
    workflowReviews: [],
    lots: [
      {
        id: "lot-1",
        lotNumber: "LOT-001",
        plannedQuantity: new Prisma.Decimal(10),
        completedQuantity: new Prisma.Decimal(0),
        rejectedQuantity: new Prisma.Decimal(0),
        status: "IN_PRODUCTION",
        startedAt: when,
      },
    ],
    operationExecutions: [
      {
        id: "execution-1",
        orderLotId: "lot-1",
        status: "COMPLETED",
        inputQuantity: new Prisma.Decimal(10),
        goodQuantity: new Prisma.Decimal(7),
        rejectedQuantity: new Prisma.Decimal(0),
        scrapQuantity: new Prisma.Decimal(1),
        reworkQuantity: new Prisma.Decimal(2),
        routingOperation: { id: "operation-1", sequence: 1, code: "PACK" },
      },
    ],
    ...overrides,
  };
}

function settings() {
  return {
    mode: "GENERAL",
    approvalRequired: true,
    electronicSignatureRequired: true,
    allowPartialCompletion: true,
    currency: "BDT",
    defaultWipWarehouseId: "warehouse-wip",
    defaultWipLocationId: "location-wip",
    defaultScrapWarehouseId: "warehouse-scrap",
    scrapRecoveryAccountId: "ledger-scrap",
    wipInventoryAccountId: "ledger-wip",
  };
}

function review(id = "review-1") {
  return {
    id,
    orderId: "order-1",
    transactionDate: when,
    createdAt: when,
    createdBy: { name: "Checker" },
    evidence: {},
  };
}

function baseTransaction(order = operationOrder()) {
  return {
    manufacturingOrder: {
      findFirst: vi.fn().mockResolvedValue(order),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn(),
    },
    manufacturingSettings: {
      findUnique: vi.fn().mockResolvedValue(settings()),
    },
    manufacturingPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
    manufacturingControlRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    manufacturingWorkflowReview: {
      create: vi.fn().mockImplementation(({ data }) => ({
        ...review(),
        ...data,
        createdBy: { name: "Checker" },
      })),
      update: vi.fn().mockImplementation(({ data }) => ({
        ...review("approval-review"),
        evidence: data.evidence,
      })),
    },
    manufacturingOrderLot: {
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([
        {
          completedQuantity: new Prisma.Decimal(7),
          rejectedQuantity: new Prisma.Decimal(3),
        },
      ]),
    },
  };
}

function executable(service: ManufacturingService) {
  return service as unknown as {
    executeAction: (
      tx: Prisma.TransactionClient,
      scopeValue: typeof scope,
      currentUser: typeof user,
      orderId: string,
      dto: Record<string, unknown>,
    ) => Promise<unknown>;
  };
}

describe("controlled operation scrap/rework disposition", () => {
  it("posts exact scrap into the configured SCRAP location with recovery value and audit evidence", async () => {
    const order = operationOrder({
      operationExecutions: [
        {
          id: "execution-1",
          orderLotId: "lot-1",
          status: "COMPLETED",
          scrapQuantity: new Prisma.Decimal(2),
          reworkQuantity: new Prisma.Decimal(0),
          routingOperation: { id: "operation-1", sequence: 1, code: "PACK" },
        },
      ],
    });
    const tx = {
      ...baseTransaction(order),
      warehouse: {
        findFirst: vi.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            where.id === "warehouse-wip"
              ? {
                  id: "warehouse-wip",
                  type: "WIP",
                  allowMaterialIssue: true,
                }
              : {
                  id: "warehouse-scrap",
                  type: "SCRAP",
                  allowMaterialIssue: false,
                },
          ),
        ),
      },
      manufacturingLocation: {
        findFirst: vi.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            where.id === "location-wip"
              ? {
                  id: "location-wip",
                  warehouseId: "warehouse-wip",
                  disposition: "WIP",
                }
              : {
                  id: "location-scrap",
                  warehouseId: "warehouse-scrap",
                  disposition: "SCRAP",
                },
          ),
        ),
      },
      inventoryItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: "scrap-item",
          unit: "pcs",
          manufacturingProfile: { role: "BY_PRODUCT" },
        }),
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "scrap-item", openingRate: new Prisma.Decimal(0) },
          ]),
      },
      accountingSettings: {
        findUnique: vi.fn().mockResolvedValue({
          costingMethod: "MOVING_WEIGHTED_AVERAGE",
          negativeStockPolicy: "BLOCK_NEGATIVE",
        }),
      },
      workspace: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: scope.id, companyId: scope.companyId }),
      },
      account: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "ledger-scrap",
            name: "Scrap asset",
            nature: "ASSET",
            isControlAccount: false,
          })
          .mockResolvedValueOnce({
            id: "ledger-wip",
            name: "WIP",
            nature: "ASSET",
            isControlAccount: false,
          }),
      },
      fiscalYear: {
        findFirst: vi.fn().mockResolvedValue({ id: "fiscal-year-1" }),
      },
      manufacturingInventoryLot: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "scrap-lot-1" }),
      },
      manufacturingTransaction: {
        create: vi.fn().mockResolvedValue({
          id: "scrap-transaction-1",
          lines: [
            {
              id: "scrap-line-1",
              inventoryItemId: "scrap-item",
              quantity: new Prisma.Decimal(2),
              unit: "pcs",
            },
          ],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      manufacturingTransactionLine: { update: vi.fn().mockResolvedValue({}) },
      stockMovement: {
        create: vi.fn().mockResolvedValue({ id: "scrap-movement-1" }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "scrap-movement-1",
            workspaceId: scope.id,
            warehouseId: "warehouse-scrap",
            inventoryItemId: "scrap-item",
            transactionType: "SCRAP_RECEIPT",
            transactionId: "scrap-transaction-1",
            transactionLineId: "scrap-line-1",
            movementType: "IN",
            quantity: new Prisma.Decimal(2),
            inputUnitCost: new Prisma.Decimal(5),
            unitCost: new Prisma.Decimal(0),
            movementValue: new Prisma.Decimal(0),
            balanceQuantity: new Prisma.Decimal(0),
            balanceValue: new Prisma.Decimal(0),
            averageCost: new Prisma.Decimal(0),
            costingVersion: 0,
            transactionDate: when,
            createdAt: when,
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      voucherInventoryItem: { findMany: vi.fn().mockResolvedValue([]) },
      inventoryAdjustment: { findMany: vi.fn().mockResolvedValue([]) },
      inventoryCostRevaluation: { findMany: vi.fn().mockResolvedValue([]) },
      voucherEntry: {
        create: vi.fn().mockResolvedValue({ id: "scrap-voucher-1" }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const electronicSignature = {
      enforce: vi.fn().mockResolvedValue({ policyId: "policy-1" }),
    };
    const inventoryService = {
      reconcileMovingAverageLedger: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      {} as never,
      electronicSignature as never,
      inventoryService as never,
    );

    await executable(service).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      user,
      order.id,
      {
        kind: "POST_SCRAP_DISPOSITION",
        idempotencyKey: "scrap-disposition-1",
        transactionDate: when.toISOString(),
        signatureMeaning: "Approved scrap disposition",
        note: "Damaged during final packing and approved for salvage stock",
        payload: { operationExecutionId: "execution-1" },
        lines: [
          {
            inventoryItemId: "scrap-item",
            destinationLocationId: "location-scrap",
            lotNumber: "SCRAP-LOT-001",
            quantity: 2,
            unit: "pcs",
            unitCost: 5,
            reasonCode: "PACK_DAMAGE",
          },
        ],
      },
    );

    expect(tx.manufacturingTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionType: "SCRAP_RECEIPT",
          operationExecutionId: "execution-1",
          toWarehouseId: "warehouse-scrap",
          toLocationId: "location-scrap",
        }),
      }),
    );
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: "IN",
        warehouseId: "warehouse-scrap",
        inputUnitCost: new Prisma.Decimal(5),
      }),
    });
    expect(tx.voucherEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          debit: new Prisma.Decimal(10),
          credit: new Prisma.Decimal(10),
        }),
      }),
    );
    expect(tx.manufacturingWorkflowReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: expect.objectContaining({
            disposition: "SCRAP",
            operationExecutionId: "execution-1",
            disposedQuantity: "2",
            recoveryValue: "10",
          }),
        }),
      }),
    );
    expect(electronicSignature.enforce).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ required: true }),
    );
  });

  it("creates a linked executable draft rework order and a posted reconciliation transaction", async () => {
    const order = operationOrder({
      operationExecutions: [
        {
          id: "execution-1",
          orderLotId: "lot-1",
          status: "COMPLETED",
          scrapQuantity: new Prisma.Decimal(0),
          reworkQuantity: new Prisma.Decimal(2),
          routingOperation: { id: "operation-1", sequence: 1, code: "PACK" },
        },
      ],
    });
    const tx = {
      ...baseTransaction(order),
      manufacturingBomVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: "bom-rework",
          outputQuantity: new Prisma.Decimal(1),
          outputUnit: "pcs",
          bom: {
            finishedProduct: {
              itemName: "Finished",
              unit: "pcs",
              alternateUnit: null,
              alternateUnitConversion: null,
            },
          },
          components: [
            {
              id: "component-1",
              inventoryItemId: "raw-1",
              quantityPerOutput: new Prisma.Decimal("0.333333"),
              scrapPercent: new Prisma.Decimal(0),
              unit: "pcs",
              inventoryItem: {
                itemName: "Rework material",
                unit: "pcs",
                alternateUnit: null,
                alternateUnitConversion: null,
              },
            },
          ],
        }),
      },
      manufacturingRoutingVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: "routing-rework",
          operations: [
            { id: "rework-operation-1", sequence: 1 },
            { id: "rework-operation-2", sequence: 2 },
          ],
        }),
      },
      manufacturingDocumentNumber: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => data),
      },
      manufacturingDocumentSequence: {
        findUnique: vi.fn().mockResolvedValue({
          id: "sequence-1",
          isActive: true,
          prefix: "MO",
          padding: 4,
          nextNumber: 7,
          resetPeriod: "ANNUAL",
          resetAnnually: true,
          lastIssuedPeriod: "2026",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      manufacturingOrder: {
        ...baseTransaction(order).manufacturingOrder,
        create: vi.fn().mockImplementation(({ data }) => ({
          id: data.id,
          orderNumber: "MO-2026-0007",
          lots: [{ id: "rework-lot-1" }],
        })),
      },
      manufacturingOperationExecution: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      fiscalYear: {
        findFirst: vi.fn().mockResolvedValue({ id: "fiscal-year-1" }),
      },
      manufacturingTransaction: {
        create: vi.fn().mockResolvedValue({ id: "rework-transaction-1" }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([{ id: "sequence-1" }]),
    };
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      {} as never,
      { enforce: vi.fn().mockResolvedValue({ policyId: "policy-1" }) } as never,
    );

    await executable(service).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      user,
      order.id,
      {
        kind: "CREATE_REWORK_DISPOSITION",
        idempotencyKey: "rework-disposition-1",
        transactionDate: when.toISOString(),
        signatureMeaning: "Approved rework route",
        note: "Two units need controlled repacking",
        payload: {
          operationExecutionId: "execution-1",
          reworkType: "REWORK",
          bomVersionId: "bom-rework",
          routingVersionId: "routing-rework",
        },
        lines: [{ quantity: 2, reasonCode: "PACK_REWORK" }],
      },
    );

    expect(tx.manufacturingOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "REWORK",
          status: "DRAFT",
          plannedQuantity: new Prisma.Decimal(2),
          materials: {
            create: [
              expect.objectContaining({
                inventoryItemId: "raw-1",
                plannedQuantity: new Prisma.Decimal("0.6667"),
              }),
            ],
          },
        }),
      }),
    );
    expect(tx.manufacturingOperationExecution.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          orderId: expect.any(String),
          orderLotId: "rework-lot-1",
        }),
      ]),
    });
    expect(tx.manufacturingTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        transactionType: "REWORK_RECEIPT",
        operationExecutionId: "execution-1",
        referenceNo: "MO-2026-0007",
        status: "POSTED",
      }),
    });
    expect(tx.manufacturingWorkflowReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: expect.objectContaining({
            disposition: "REWORK",
            linkedOrderNumber: "MO-2026-0007",
            disposedQuantity: "2",
            quantityNormalization: expect.objectContaining({
              stockBaseUnitAuthoritative: true,
              calculatedMaterialRequirements: [
                expect.objectContaining({
                  inventoryItemId: "raw-1",
                  calculatedBaseQuantity: "0.666666",
                  storedBaseQuantity: "0.6667",
                  storageRoundingApplied: true,
                }),
              ],
            }),
          }),
        }),
      }),
    );
  });

  it("rejects a second disposition with a different idempotency key after the recorded quantity is fully posted", async () => {
    const order = operationOrder({
      operationExecutions: [
        {
          id: "execution-1",
          orderLotId: "lot-1",
          status: "COMPLETED",
          scrapQuantity: new Prisma.Decimal(1),
          reworkQuantity: new Prisma.Decimal(0),
          routingOperation: { id: "operation-1", sequence: 1, code: "PACK" },
        },
      ],
      transactions: [
        {
          id: "existing-scrap-transaction",
          status: "POSTED",
          transactionType: "SCRAP_RECEIPT",
          operationExecutionId: "execution-1",
          orderLotId: "lot-1",
          lines: [
            { inventoryItemId: "scrap-item", quantity: new Prisma.Decimal(1) },
          ],
        },
      ],
    });
    const tx = baseTransaction(order);
    const electronicSignature = {
      enforce: vi.fn().mockResolvedValue({ policyId: "policy-1" }),
    };
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      {} as never,
      electronicSignature as never,
    );

    await expect(
      executable(service).executeAction(
        tx as unknown as Prisma.TransactionClient,
        scope,
        user,
        order.id,
        {
          kind: "POST_SCRAP_DISPOSITION",
          idempotencyKey: "different-scrap-idempotency-key",
          transactionDate: when.toISOString(),
          signatureMeaning: "Approved duplicate check",
          note: "A second posting must never create duplicate scrap stock",
          payload: { operationExecutionId: "execution-1" },
          lines: [
            {
              inventoryItemId: "scrap-item",
              destinationLocationId: "location-scrap",
              lotNumber: "SCRAP-LOT-DUPLICATE",
              quantity: 1,
              unit: "pcs",
              unitCost: 5,
              reasonCode: "PACK_DAMAGE",
            },
          ],
        },
      ),
    ).rejects.toThrow("already fully disposed");
    expect(tx.manufacturingWorkflowReview.create).not.toHaveBeenCalled();
    expect(tx.manufacturingOrder.create).not.toHaveBeenCalled();
    expect(electronicSignature.enforce).toHaveBeenCalledTimes(1);
  });

  it("blocks production completion while any recorded operation disposition is still open", async () => {
    const tx = baseTransaction();
    const approvalWorkflow = {
      advance: vi.fn().mockResolvedValue({
        complete: true,
        totalStages: 1,
        completedStages: 1,
        nextStage: null,
        stageApprovers: [],
        review: review("approval-review"),
      }),
    };
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      approvalWorkflow as never,
      { enforce: vi.fn() } as never,
    );

    await expect(
      executable(service).executeAction(
        tx as unknown as Prisma.TransactionClient,
        scope,
        user,
        "order-1",
        {
          kind: "COMPLETE_PRODUCTION",
          idempotencyKey: "complete-open-disposition",
          transactionDate: when.toISOString(),
          lines: [
            {
              orderLotId: "lot-1",
              quantity: 7,
              payload: { rejectedQuantity: 3 },
            },
          ],
        },
      ),
    ).rejects.toThrow("unresolved operation dispositions");
    expect(tx.manufacturingOrderLot.update).not.toHaveBeenCalled();
  });

  it("allows completion after exact scrap and rework disposition, counting transferred rework as reconciled non-good output", async () => {
    const order = operationOrder({
      transactions: [
        {
          id: "scrap-transaction-1",
          status: "POSTED",
          transactionType: "SCRAP_RECEIPT",
          operationExecutionId: "execution-1",
          orderLotId: "lot-1",
          lines: [
            { inventoryItemId: "scrap-item", quantity: new Prisma.Decimal(1) },
          ],
        },
        {
          id: "rework-transaction-1",
          status: "POSTED",
          transactionType: "REWORK_RECEIPT",
          operationExecutionId: "execution-1",
          orderLotId: "lot-1",
          lines: [
            { inventoryItemId: "finished-1", quantity: new Prisma.Decimal(2) },
          ],
        },
      ],
    });
    const tx = baseTransaction(order);
    const approvalWorkflow = {
      advance: vi.fn().mockResolvedValue({
        complete: true,
        totalStages: 1,
        completedStages: 1,
        nextStage: null,
        stageApprovers: [],
        review: review("approval-review"),
      }),
    };
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      approvalWorkflow as never,
      { enforce: vi.fn() } as never,
    );

    await executable(service).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      user,
      "order-1",
      {
        kind: "COMPLETE_PRODUCTION",
        idempotencyKey: "complete-disposed",
        transactionDate: when.toISOString(),
        lines: [
          {
            orderLotId: "lot-1",
            quantity: 7,
            payload: { rejectedQuantity: 3 },
          },
        ],
      },
    );

    expect(tx.manufacturingOrderLot.update).toHaveBeenCalledWith({
      where: { id: "lot-1" },
      data: expect.objectContaining({
        completedQuantity: new Prisma.Decimal(7),
        rejectedQuantity: new Prisma.Decimal(3),
        status: "COMPLETED",
      }),
    });
    expect(tx.manufacturingOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        completedQuantity: new Prisma.Decimal(7),
        rejectedQuantity: new Prisma.Decimal(3),
      }),
    });
  });
});
