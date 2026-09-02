import { describe, expect, it, vi } from "vitest";

import { Prisma } from "../generated/prisma/index.js";
import { ManufacturingCostReportService } from "./manufacturing-cost-report.service.js";

const scope = {
  id: "workspace-1",
  tenantId: "tenant-1",
  companyId: "company-1",
};
const user = {
  id: "user-1",
  workspaceId: scope.id,
  tenantId: scope.tenantId,
  companyId: scope.companyId,
} as never;
const when = new Date("2026-08-30T10:00:00.000Z");
const releasedAt = new Date("2026-08-30T14:00:00.000Z");
const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

const rawItem = {
  id: "raw-item-1",
  itemCode: "RM-COMP",
  itemName: "Compressor",
};
const finishedItem = {
  id: "finished-item-1",
  itemCode: "FG-FRIDGE",
  itemName: "Finished Fridge",
};
const fgQWarehouse = { id: "warehouse-fgq", code: "FG-Q", name: "FG-Q" };
const fgRWarehouse = { id: "warehouse-fgr", code: "FG-R", name: "FG-R" };
const fgQLocation = {
  id: "location-fgq",
  code: "FG-Q-HOLD",
  name: "FG-Q Hold",
  disposition: "QUARANTINE",
};
const fgRLocation = {
  id: "location-fgr",
  code: "FG-R-RELEASED",
  name: "FG-R Released",
  disposition: "RELEASED",
};
const rawWarehouse = { id: "warehouse-rm", code: "RM", name: "Raw Material" };
const rawLocation = {
  id: "location-rm",
  code: "RM-RELEASED",
  name: "Raw Released",
  disposition: "RELEASED",
};

function inventoryLot(input: {
  id: string;
  lotNumber: string;
  inventoryItem: typeof rawItem | typeof finishedItem;
  sourceTransactionLineId?: string | null;
  serials?: Array<Record<string, unknown>>;
  finished?: boolean;
}) {
  const warehouse = input.finished ? fgRWarehouse : rawWarehouse;
  const location = input.finished ? fgRLocation : rawLocation;
  return {
    id: input.id,
    inventoryItemId: input.inventoryItem.id,
    lotNumber: input.lotNumber,
    sourceTransactionLineId: input.sourceTransactionLineId ?? null,
    inventoryItem: input.inventoryItem,
    warehouseId: warehouse.id,
    locationId: location.id,
    warehouse,
    location,
    serials: input.serials ?? [],
  };
}

function traceHarness(input: {
  serialState: "released" | "hold" | "missing";
  validFgR?: boolean;
  workflowStatus?: string;
  packaging?: boolean;
}) {
  const validFgR = input.validFgR ?? true;
  const serial =
    input.serialState === "missing"
      ? null
      : {
          id: "serial-1",
          serialNumber: "FR-2026-000001",
          orderId: "order-1",
          orderLotId: "order-lot-1",
          inventoryLotId: "finished-lot-1",
          status: input.serialState === "released" ? "RELEASED" : "QC_HOLD",
          releasedAt: input.serialState === "released" ? releasedAt : null,
          warehouseId:
            input.serialState === "released"
              ? fgRWarehouse.id
              : fgQWarehouse.id,
          locationId:
            input.serialState === "released" ? fgRLocation.id : fgQLocation.id,
          warehouse:
            input.serialState === "released" ? fgRWarehouse : fgQWarehouse,
          location:
            input.serialState === "released" ? fgRLocation : fgQLocation,
        };
  const rawLot = inventoryLot({
    id: "raw-lot-1",
    lotNumber: "RM-COMP-001",
    inventoryItem: rawItem,
  });
  const stagedLot = inventoryLot({
    id: "staged-lot-1",
    lotNumber: "STAGE-COMP-001",
    inventoryItem: rawItem,
    sourceTransactionLineId: "staging-line-1",
  });
  const finishedLot = inventoryLot({
    id: "finished-lot-1",
    lotNumber: "FG-FRIDGE-LOT-01",
    inventoryItem: finishedItem,
    sourceTransactionLineId: "fgr-line-1",
    serials: serial ? [serial] : [],
    finished: true,
  });
  const order = {
    id: "order-1",
    orderNumber: "MO-2026-0001",
    finishedProductId: finishedItem.id,
    finishedProduct: {
      ...finishedItem,
      manufacturingProfile: { serialTracked: true },
    },
  };
  const orderLot = { id: "order-lot-1", lotNumber: "LOT-01" };
  const fgrSerialMovements = serial
    ? [
        {
          id: "fgr-serial-movement-1",
          serialId: serial.id,
          role: "OUTPUT",
          serial,
          createdAt: when,
        },
      ]
    : [];
  const qaSerialMovements = serial
    ? [
        {
          id: "qa-serial-movement-1",
          serialId: serial.id,
          role: "OUTPUT",
          serial,
          createdAt: releasedAt,
        },
      ]
    : [];
  const receipt = {
    id: "fgr-transaction-1",
    orderId: order.id,
    orderLotId: orderLot.id,
    transactionNumber: "FGR-2026-000001",
    transactionDate: when,
    createdAt: when,
    toWarehouseId: fgQWarehouse.id,
    toLocationId: fgQLocation.id,
    order,
    orderLot,
    toWarehouse: fgQWarehouse,
    toLocation: fgQLocation,
    lines: [
      {
        id: "fgr-line-1",
        orderMaterialId: null,
        inventoryItemId: finishedItem.id,
        destinationInventoryLotId: finishedLot.id,
        destinationInventoryLot: finishedLot,
        inventoryItem: finishedItem,
        serialMovements: fgrSerialMovements,
        quantity: decimal(1),
        unit: "pcs",
        createdAt: when,
      },
    ],
  };
  const qaWarehouse = validFgR ? fgRWarehouse : fgQWarehouse;
  const qaLocation = validFgR ? fgRLocation : fgQLocation;
  const release = {
    id: "qa-transaction-1",
    orderId: order.id,
    orderLotId: orderLot.id,
    transactionNumber: "QAR-2026-000001",
    transactionDate: releasedAt,
    createdAt: releasedAt,
    status: "POSTED",
    fromWarehouseId: fgQWarehouse.id,
    toWarehouseId: qaWarehouse.id,
    fromLocationId: fgQLocation.id,
    toLocationId: qaLocation.id,
    order,
    orderLot,
    fromWarehouse: fgQWarehouse,
    toWarehouse: qaWarehouse,
    fromLocation: fgQLocation,
    toLocation: qaLocation,
    lines: [
      {
        id: "qa-line-1",
        sourceInventoryLotId: finishedLot.id,
        destinationInventoryLotId: finishedLot.id,
        sourceInventoryLot: finishedLot,
        destinationInventoryLot: finishedLot,
        serialMovements: qaSerialMovements,
        createdAt: releasedAt,
      },
    ],
  };
  const genealogyBase = {
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    workspaceId: scope.id,
    orderId: order.id,
    orderLotId: orderLot.id,
    order,
    orderLot,
    parentSerialId: null,
    childSerialId: null,
    parentSerial: null,
    childSerial: null,
    quantity: decimal(1),
    unit: "pcs",
    createdByUserId: "user-1",
    createdAt: when,
  };
  const finishedEdge = {
    ...genealogyBase,
    id: "genealogy-fgr-1",
    relationshipType: "CONSUMED_INTO_OUTPUT",
    transactionLineId: "fgr-input-line-1",
    transactionLine: { inventoryItem: rawItem },
    parentInventoryLotId: stagedLot.id,
    childInventoryLotId: finishedLot.id,
    parentInventoryLot: stagedLot,
    childInventoryLot: finishedLot,
  };
  const stagingEdge = {
    ...genealogyBase,
    id: "genealogy-stage-1",
    relationshipType: "LOCATION_STAGING_SPLIT",
    transactionLineId: "staging-line-1",
    transactionLine: { inventoryItem: rawItem },
    parentInventoryLotId: rawLot.id,
    childInventoryLotId: stagedLot.id,
    parentInventoryLot: rawLot,
    childInventoryLot: stagedLot,
  };
  const packagingOrder = {
    id: "packaging-order-1",
    orderId: order.id,
    orderLotId: orderLot.id,
    packagingOrderNumber: "PKG-2026-000001",
    status: "RELEASE_READY",
  };
  const packagingLabel = serial
    ? {
        id: "label-1",
        serialId: serial.id,
        packagingOrderId: packagingOrder.id,
        labelCode: "LBL-FR-000001",
        status: "USED",
        updatedAt: releasedAt,
        packagingOrder,
      }
    : null;
  const carton = {
    id: "carton-1",
    serialId: null,
    packagingOrderId: packagingOrder.id,
    level: "CARTON",
    code: "CARTON-001",
    parentId: null,
    createdAt: when,
    packagingOrder,
  };
  const packageUnit = serial
    ? {
        id: "package-unit-1",
        serialId: serial.id,
        packagingOrderId: packagingOrder.id,
        level: "UNIT",
        code: "UNIT-000001",
        parentId: carton.id,
        createdAt: when,
        packagingOrder,
      }
    : null;

  const genealogyFindMany = vi
    .fn()
    .mockResolvedValueOnce([finishedEdge])
    .mockResolvedValueOnce([stagingEdge])
    .mockResolvedValueOnce([]);
  const transactionFindMany = vi
    .fn()
    .mockResolvedValueOnce([receipt])
    .mockResolvedValueOnce([release]);
  const packagingLabelFindMany = vi
    .fn()
    .mockResolvedValue(
      input.packaging && packagingLabel ? [packagingLabel] : [],
    );
  const packageUnitFindMany = vi.fn();
  if (input.packaging && packageUnit) {
    packageUnitFindMany
      .mockResolvedValueOnce([packageUnit])
      .mockResolvedValueOnce([packageUnit, carton]);
  } else {
    packageUnitFindMany.mockResolvedValue([]);
  }
  const prisma = {
    workspace: { findFirst: vi.fn().mockResolvedValue(scope) },
    manufacturingSettings: {
      findUnique: vi.fn().mockResolvedValue({
        defaultFinishedGoodsReleasedWarehouseId: fgRWarehouse.id,
        defaultFinishedGoodsReleaseLocationId: fgRLocation.id,
      }),
    },
    manufacturingTransaction: { findMany: transactionFindMany },
    manufacturingGenealogy: { findMany: genealogyFindMany },
    manufacturingPackagingLabel: { findMany: packagingLabelFindMany },
    manufacturingPackageUnit: { findMany: packageUnitFindMany },
    manufacturingWorkflowReview: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "raw-registration-review-1",
          entityId: rawLot.id,
          transactionDate: when,
          evidence: {
            sourceStockMovementId: "stock-movement-raw-1",
            sourceTransactionType: "LC_INVENTORY_RECEIPT",
            sourceTransactionId: "lc-posting-1",
            sourceTransactionLineId: "lc-posting-line-1",
            sourceReference: "LC-2026-0001 / GRN-0001",
          },
        },
      ]),
    },
    stockMovement: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "stock-movement-raw-1",
          transactionType: "LC_INVENTORY_RECEIPT",
          transactionId: "lc-posting-1",
          transactionLineId: "lc-posting-line-1",
          referenceNo: "LC-2026-0001",
          voidedAt: null,
          inventoryItem: rawItem,
          warehouse: rawWarehouse,
          lcInventoryPosting: {
            lc: { id: "lc-1", lcNumber: "LC-2026-0001" },
            lcItem: {
              id: "lc-item-1",
              productName: rawItem.itemName,
              grnItems: [
                {
                  grn: {
                    id: "grn-1",
                    grnNumber: "GRN-0001",
                    receivedDate: when,
                  },
                },
              ],
            },
          },
        },
      ]),
    },
    $queryRaw: vi.fn().mockResolvedValue([
      {
        id: "workflow-run-1",
        productionOrderId: order.id,
        productId: finishedItem.id,
        status: input.workflowStatus ?? "FG_R",
        workflowDefinitionId: "workflow-definition-1",
        workflowDefinitionVersion: 1,
        createdAt: when,
      },
    ]),
  };
  const permissions = {
    getGrantedKeys: vi
      .fn()
      .mockResolvedValue(new Set(["manufacturing.reports.view"])),
  };
  const inventoryService = {
    reconcileMovingAverageLedger: vi.fn().mockResolvedValue(undefined),
  };
  const service = new ManufacturingCostReportService(
    prisma as never,
    permissions as never,
    inventoryService as never,
  );
  return {
    service,
    inventoryService,
    prisma,
    rawLot,
  };
}

async function report(
  harness: ReturnType<typeof traceHarness>,
): Promise<{ rows: Array<Record<string, unknown>>; truncated: boolean }> {
  return (await harness.service.getReport(user, "traceability", {
    workspaceId: scope.id,
    orderId: "order-1",
  })) as { rows: Array<Record<string, unknown>>; truncated: boolean };
}

describe("manufacturing cost posting account safety", () => {
  it("accepts only the exact protected Inventory Control ledger for finished-goods stock", async () => {
    const inventoryControl = {
      id: "inventory-control-1",
      code: "1210001",
      name: "Inventory Control",
      nature: "ASSET",
      isSystem: true,
    };
    const findFirst = vi.fn().mockResolvedValue(inventoryControl);
    const service = new ManufacturingCostReportService(
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      protectedInventoryControlLedger: (
        db: unknown,
        companyId: string,
        accountId: string,
        label: string,
      ) => Promise<typeof inventoryControl>;
    };

    await expect(
      service.protectedInventoryControlLedger(
        { account: { findFirst } },
        "company-1",
        inventoryControl.id,
        "Finished-goods inventory account",
      ),
    ).resolves.toEqual(inventoryControl);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: inventoryControl.id,
        companyId: "company-1",
        code: "1210001",
        status: "ACTIVE",
        level: "LEDGER",
        nature: "ASSET",
        isSystem: true,
        isControlAccount: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        nature: true,
        isSystem: true,
      },
    });
  });

  it("rejects a stale or arbitrary account instead of broadening control posting", async () => {
    const service = new ManufacturingCostReportService(
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      protectedInventoryControlLedger: (
        db: unknown,
        companyId: string,
        accountId: string,
        label: string,
      ) => Promise<unknown>;
    };

    await expect(
      service.protectedInventoryControlLedger(
        { account: { findFirst: vi.fn().mockResolvedValue(null) } },
        "company-1",
        "arbitrary-control-account",
        "Finished-goods inventory account",
      ),
    ).rejects.toThrow("protected Inventory Control ledger (1210001)");
  });
});

describe("manufacturing traceability report", () => {
  it("links a released finished serial through workflow, FGR, QA/FG-R, packaging and raw LC/GRN evidence", async () => {
    const harness = traceHarness({
      serialState: "released",
      packaging: true,
    });

    const result = await report(harness);

    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      outputSerial: "FR-2026-000001",
      serialStatus: "RELEASED",
      orderNumber: "MO-2026-0001",
      orderLotNumber: "LOT-01",
      workflowRunId: "workflow-run-1",
      workflowRunStatus: "FG_R",
      fgrTransactionId: "fgr-transaction-1",
      fgrTransactionNumber: "FGR-2026-000001",
      fgrSerialMovementId: "fgr-serial-movement-1",
      qaReleaseTransactionId: "qa-transaction-1",
      qaReleaseTransactionNumber: "QAR-2026-000001",
      qaSerialMovementId: "qa-serial-movement-1",
      fgRWarehouse: "FG-R",
      fgRDisposition: "RELEASED",
      packagingOrderNumber: "PKG-2026-000001",
      packagingLabelCode: "LBL-FR-000001",
      packagingLabelStatus: "USED",
      packageUnitCode: "UNIT-000001",
      packageHierarchy: "CARTON:CARTON-001 > UNIT:UNIT-000001",
      rawSourceLots: "RM-COMP-001",
      rawSourceStockMovementIds: "stock-movement-raw-1",
      rawLcNumbers: "LC-2026-0001",
      rawGrnNumbers: "GRN-0001",
      traceComplete: true,
      traceIssues: null,
    });
    expect(String(result.rows[0].genealogyPaths)).toContain(
      "RM-COMP-001 -> LOCATION_STAGING_SPLIT -> STAGE-COMP-001 -> CONSUMED_INTO_OUTPUT -> FG-FRIDGE-LOT-01",
    );
    expect(JSON.parse(String(result.rows[0].sourceEvidence))).toEqual([
      expect.objectContaining({
        inventoryLotId: harness.rawLot.id,
        registrationReviewId: "raw-registration-review-1",
        sourceStockMovementId: "stock-movement-raw-1",
        lcNumber: "LC-2026-0001",
        grns: [
          expect.objectContaining({
            id: "grn-1",
            grnNumber: "GRN-0001",
          }),
        ],
        genealogy: [
          expect.objectContaining({ id: "genealogy-stage-1" }),
          expect.objectContaining({ id: "genealogy-fgr-1" }),
        ],
      }),
    ]);
  });

  it("does not mark a tracked FGR complete when its required finished serial is absent", async () => {
    const result = await report(
      traceHarness({ serialState: "missing", packaging: false }),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      serialTrackingRequired: true,
      outputSerial: null,
      traceComplete: false,
    });
    expect(String(result.rows[0].traceIssues)).toContain(
      "SERIAL_REQUIRED_MISSING",
    );
    expect(String(result.rows[0].traceIssues)).toContain(
      "SERIAL_COUNT_MISMATCH",
    );
  });

  it("flags a non-released serial, stale workflow state, invalid FG-R destination and absent packaging links", async () => {
    const result = await report(
      traceHarness({
        serialState: "hold",
        validFgR: false,
        workflowStatus: "RELEASE_READY",
        packaging: false,
      }),
    );

    const row = result.rows[0];
    expect(row.traceComplete).toBe(false);
    expect(String(row.traceIssues)).toContain("SERIAL_NOT_RELEASED");
    expect(String(row.traceIssues)).toContain("WORKFLOW_RUN_NOT_FG_R");
    expect(String(row.traceIssues)).toContain("FG_R_DISPOSITION_INVALID");
    expect(String(row.traceIssues)).toContain("SERIAL_NOT_IN_FG_R");
    expect(String(row.traceIssues)).toContain("PACKAGING_LINK_MISSING");
    expect(String(row.packagingIssues)).toContain(
      "must have exactly one used label",
    );
    expect(String(row.packagingIssues)).toContain(
      "is not assigned to a unit package",
    );
  });
});
