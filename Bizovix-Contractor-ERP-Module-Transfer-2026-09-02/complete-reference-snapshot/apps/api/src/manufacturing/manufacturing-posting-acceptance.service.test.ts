import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ManufacturingDocumentNumberModule from "./manufacturing-document-number.js";

vi.mock("../inventory/moving-average.js", () => ({
  rebuildMovingAverageCosts: vi.fn(),
}));
vi.mock("./manufacturing-document-number.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof ManufacturingDocumentNumberModule>();
  return {
    ...actual,
    issueManufacturingDocumentNumberTx: vi.fn(),
  };
});

import { Prisma } from "../generated/prisma/index.js";
import { rebuildMovingAverageCosts } from "../inventory/moving-average.js";
import { issueManufacturingDocumentNumberTx } from "./manufacturing-document-number.js";
import {
  ManufacturingService,
  manufacturingActionApprovalEntityId,
} from "./manufacturing.service.js";

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
const when = new Date("2026-09-24T00:00:00.000Z");
const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const inventoryControlAccountId = "account-inventory-control";

type ManufacturingServiceInternals = {
  activeWarehouse: (...args: unknown[]) => Promise<Record<string, unknown>>;
  activeLocation: (
    ...args: unknown[]
  ) => Promise<Record<string, unknown> | null>;
  activeLedger: (...args: unknown[]) => Promise<Record<string, unknown>>;
  protectedInventoryControlLedger: (
    ...args: unknown[]
  ) => Promise<Record<string, unknown>>;
  openFiscalYear: (...args: unknown[]) => Promise<Record<string, unknown>>;
  packagingReleasePolicy: (
    ...args: unknown[]
  ) => Promise<Record<string, unknown>>;
  lotPackagingActuals: (...args: unknown[]) => Record<string, unknown>;
  postProductionReceipt: (
    ...args: unknown[]
  ) => Promise<{ transactionIds: string[] }>;
  postQaRelease: (...args: unknown[]) => Promise<{ allReleased: boolean }>;
  postTransferAndJournal: (
    ...args: unknown[]
  ) => Promise<{ transactionId: string; stockMovementIds: string[] }>;
};

function configuredService(prisma: Record<string, unknown> = {}) {
  const inventoryService = {
    reconcileMovingAverageLedger: vi.fn().mockResolvedValue(undefined),
  };
  const service = new ManufacturingService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    inventoryService as never,
  );
  const internals = service as unknown as ManufacturingServiceInternals;
  vi.spyOn(internals, "activeWarehouse").mockResolvedValue({});
  vi.spyOn(internals, "activeLocation").mockResolvedValue({});
  vi.spyOn(internals, "activeLedger").mockImplementation(
    async (...args: unknown[]) => {
      const accountId = String(args[2]);
      return {
        id: accountId,
        name: "Work in Process",
      };
    },
  );
  vi.spyOn(internals, "protectedInventoryControlLedger").mockResolvedValue({
    id: inventoryControlAccountId,
    name: "Inventory Control",
    code: "1210001",
    nature: "ASSET",
    isSystem: true,
    isControlAccount: true,
  });
  vi.spyOn(internals, "openFiscalYear").mockResolvedValue({
    id: "fiscal-year-1",
  });
  return internals;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("canonical 10-fridge posting acceptance", () => {
  it("accepts only the same-company protected Inventory Control 1210001 ledger", async () => {
    const accountFindFirst = vi.fn().mockResolvedValue({
      id: inventoryControlAccountId,
      name: "Inventory Control",
      code: "1210001",
      nature: "ASSET",
      isSystem: true,
      isControlAccount: true,
    });
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as ManufacturingServiceInternals;

    await expect(
      service.protectedInventoryControlLedger(
        { account: { findFirst: accountFindFirst } },
        scope.companyId,
        inventoryControlAccountId,
        "Finished-goods inventory account",
      ),
    ).resolves.toMatchObject({
      id: inventoryControlAccountId,
      code: "1210001",
      isSystem: true,
      isControlAccount: true,
    });
    expect(accountFindFirst).toHaveBeenCalledWith({
      where: {
        id: inventoryControlAccountId,
        companyId: scope.companyId,
        code: "1210001",
        level: "LEDGER",
        status: "ACTIVE",
        nature: "ASSET",
        isSystem: true,
        isControlAccount: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        nature: true,
        isSystem: true,
        isControlAccount: true,
      },
    });
  });

  it("rejects an active ASSET ledger when it is a control account", async () => {
    const accountFindFirst = vi.fn().mockResolvedValue({
      id: "control-account",
      name: "Inventory control group",
      code: "INV-CONTROL",
      nature: "ASSET",
      isControlAccount: true,
    });
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as ManufacturingServiceInternals;

    await expect(
      service.activeLedger(
        { account: { findFirst: accountFindFirst } },
        scope.companyId,
        "control-account",
        "Inventory account",
        "ASSET",
      ),
    ).rejects.toThrow("active, non-control LEDGER account");
  });

  it("fails closed before a material posting when an inventory mapping is not an ASSET ledger", async () => {
    const transactionCreate = vi.fn();
    const voucherCreate = vi.fn();
    const tx = {
      account: {
        findFirst: vi.fn().mockResolvedValue({
          id: "wip-account",
          name: "Work in Process",
          code: "WIP",
          nature: "DIRECT_EXPENSE",
        }),
      },
      manufacturingTransaction: { create: transactionCreate },
      voucherEntry: { create: voucherCreate },
    };
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as ManufacturingServiceInternals;
    vi.spyOn(service, "activeWarehouse").mockResolvedValue({});

    await expect(
      service.postTransferAndJournal(
        tx,
        scope,
        user,
        { issueLocationId: "location-rm", reservations: [] },
        {
          defaultRawMaterialWarehouseId: "warehouse-rm",
          defaultWipWarehouseId: "warehouse-wip",
          defaultRawMaterialLocationId: "location-rm",
          defaultWipLocationId: "location-wip",
          rawMaterialInventoryAccountId: inventoryControlAccountId,
          wipInventoryAccountId: "wip-account",
          blockNegativeStock: false,
        },
        {
          kind: "ISSUE_MATERIALS",
          idempotencyKey: "wrong-nature-material-issue",
        },
        [
          {
            orderMaterialId: "material-1",
            inventoryItemId: "item-1",
            quantity: decimal(1),
            unit: "pcs",
          },
        ],
        "warehouse-rm",
        "warehouse-wip",
        "MATERIAL_ISSUE",
        "wip-account",
        inventoryControlAccountId,
        when,
        "order-lot-1",
      ),
    ).rejects.toThrow("active ASSET LEDGER account in this company");

    expect(tx.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "wip-account",
          companyId: scope.companyId,
          level: "LEDGER",
          status: "ACTIVE",
        }),
      }),
    );
    expect(transactionCreate).not.toHaveBeenCalled();
    expect(voucherCreate).not.toHaveBeenCalled();
  });

  it("fails closed before a material posting when controlled locations are unavailable", async () => {
    const transactionCreate = vi.fn();
    const voucherCreate = vi.fn();
    const service = configuredService();
    vi.mocked(service.activeLocation).mockResolvedValue(null);

    await expect(
      service.postTransferAndJournal(
        {
          manufacturingTransaction: { create: transactionCreate },
          voucherEntry: { create: voucherCreate },
        },
        scope,
        user,
        { issueLocationId: "location-rm", reservations: [] },
        {
          defaultRawMaterialWarehouseId: "warehouse-rm",
          defaultWipWarehouseId: "warehouse-wip",
          defaultRawMaterialLocationId: "location-rm",
          defaultWipLocationId: "location-wip",
          rawMaterialInventoryAccountId: inventoryControlAccountId,
          wipInventoryAccountId: "wip-account",
          blockNegativeStock: false,
        },
        {
          kind: "ISSUE_MATERIALS",
          idempotencyKey: "stale-location-material-issue",
        },
        [
          {
            orderMaterialId: "material-1",
            inventoryItemId: "item-1",
            quantity: decimal(1),
            unit: "pcs",
          },
        ],
        "warehouse-rm",
        "warehouse-wip",
        "MATERIAL_ISSUE",
        "wip-account",
        inventoryControlAccountId,
        when,
        "order-lot-1",
      ),
    ).rejects.toThrow("active raw-material RELEASED and WIP locations");

    expect(service.activeWarehouse).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      scope.id,
      "warehouse-rm",
      "Source warehouse",
      { companyId: scope.companyId, role: "RAW_MATERIAL" },
    );
    expect(service.activeLocation).toHaveBeenCalledWith(
      expect.anything(),
      scope.id,
      "warehouse-rm",
      "location-rm",
      "Source manufacturing location",
      { companyId: scope.companyId, dispositions: ["RELEASED"] },
    );
    expect(transactionCreate).not.toHaveBeenCalled();
    expect(voucherCreate).not.toHaveBeenCalled();
  });

  it("posts the exact full-precision WIP value once to FG-Q without a duplicate consumption journal", async () => {
    vi.mocked(issueManufacturingDocumentNumberTx).mockResolvedValue({
      documentNumber: "FGR-2026-000001",
    } as never);

    const materialDefinitions = [
      {
        id: "material-body",
        inventoryItemId: "BODY",
        itemName: "Fridge Body",
        inventoryLotId: "rm-lot-body",
        unitCost: "252976.19144",
        totalCost: "2529761.91440",
      },
      {
        id: "material-power",
        inventoryItemId: "POWER",
        itemName: "Fridge Power Supplier",
        inventoryLotId: "rm-lot-power",
        unitCost: "108777.77734",
        totalCost: "1087777.77340",
      },
      {
        id: "material-compressor",
        inventoryItemId: "COMPRESSOR",
        itemName: "Compressor",
        inventoryLotId: "rm-lot-compressor",
        unitCost: "161777.77732",
        totalCost: "1617777.77320",
      },
    ];
    const orderMaterials = materialDefinitions.map((material) => ({
      id: material.id,
      inventoryItemId: material.inventoryItemId,
      unit: "pcs",
      issuedQuantity: decimal(10),
      consumedQuantity: decimal(0),
      returnedQuantity: decimal(0),
      scrappedQuantity: decimal(0),
      status: "ISSUED",
      inventoryItem: {
        itemName: material.itemName,
        manufacturingProfile: { role: "RAW_MATERIAL" },
      },
    }));
    const createdLines = [
      ...materialDefinitions.map((material) => ({
        id: `receipt-line-${material.inventoryItemId.toLowerCase()}`,
        orderMaterialId: material.id,
        inventoryItemId: material.inventoryItemId,
        sourceInventoryLotId: material.inventoryLotId,
        destinationInventoryLotId: null,
        quantity: decimal(10),
        unit: "pcs",
        unitCost: decimal(0),
        totalCost: decimal(0),
      })),
      {
        id: "receipt-line-fridge",
        orderMaterialId: null,
        inventoryItemId: "FG-FRIDGE-001",
        sourceInventoryLotId: null,
        destinationInventoryLotId: null,
        quantity: decimal(10),
        unit: "pcs",
        unitCost: decimal(0),
        totalCost: decimal(0),
      },
    ];
    const persistedReceiptLines = createdLines.map((line) => {
      const material = materialDefinitions.find(
        (entry) => entry.id === line.orderMaterialId,
      );
      return material
        ? {
            ...line,
            unitCost: decimal(material.unitCost),
            totalCost: decimal(material.totalCost),
          }
        : {
            ...line,
            unitCost: decimal("523531.7461"),
            totalCost: decimal("5235317.4610"),
          };
    });
    const voucherCreate = vi.fn().mockResolvedValue({ id: "fgr-voucher-1" });
    const transactionCreate = vi.fn().mockResolvedValue({
      id: "fgr-transaction-1",
      lines: createdLines,
    });
    const stockMovementCreate = vi
      .fn()
      .mockImplementation(async ({ data }) =>
        data.transactionType === "PRODUCTION_RECEIPT"
          ? { id: "fg-q-in-1" }
          : { id: `wip-out-${data.inventoryItemId}` },
      );
    const tx = {
      manufacturingInventoryLot: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "fg-q-lot-1" }),
      },
      manufacturingSerial: { findMany: vi.fn() },
      manufacturingSerialMovement: { create: vi.fn() },
      manufacturingTransaction: {
        create: transactionCreate,
        update: vi.fn(),
        findMany: vi.fn().mockImplementation(async ({ where }) =>
          where.transactionType === "PRODUCTION_RECEIPT"
            ? [
                {
                  id: "fgr-transaction-1",
                  voucherEntryId: "fgr-voucher-1",
                  lines: persistedReceiptLines,
                },
              ]
            : [],
        ),
      },
      manufacturingTransactionLine: { update: vi.fn() },
      manufacturingOrderMaterial: {
        findUnique: vi
          .fn()
          .mockImplementation(async ({ where }) =>
            orderMaterials.find((material) => material.id === where.id),
          ),
        update: vi.fn(),
      },
      manufacturingGenealogy: { create: vi.fn() },
      manufacturingCostSnapshot: { create: vi.fn() },
      stockMovement: { create: stockMovementCreate },
      voucherEntry: { create: voucherCreate },
    };
    vi.mocked(rebuildMovingAverageCosts)
      .mockResolvedValueOnce({
        movements: materialDefinitions.map((material) => ({
          transactionId: "fgr-transaction-1",
          transactionLineId: `receipt-line-${material.inventoryItemId.toLowerCase()}`,
          movementType: "OUT",
          unitCost: decimal(material.unitCost),
          movementValue: decimal(material.totalCost),
        })),
        balances: new Map(),
      } as never)
      .mockResolvedValueOnce({
        movements: [
          {
            id: "fg-q-in-1",
            unitCost: decimal("523531.7461"),
            movementValue: decimal("5235317.4610"),
          },
        ],
        balances: new Map(),
      } as never);

    const order = {
      id: "order-1",
      orderNumber: "MO-FRIDGE-001",
      plannedQuantity: decimal(10),
      completedQuantity: decimal(10),
      rejectedQuantity: decimal(0),
      unit: "pcs",
      finishedProductId: "FG-FRIDGE-001",
      finishedProduct: { manufacturingProfile: { serialTracked: false } },
      receiptWarehouseId: "warehouse-fg-q",
      receiptLocationId: "location-fg-q",
      lots: [
        {
          id: "lot-all",
          lotNumber: "LOT-ALL",
          plannedQuantity: decimal(10),
          completedQuantity: decimal(10),
          rejectedQuantity: decimal(0),
        },
      ],
      materials: orderMaterials,
      transactions: [
        {
          status: "POSTED",
          transactionType: "MATERIAL_ISSUE",
          orderLotId: "lot-all",
          lines: materialDefinitions.map((material) => ({
            orderMaterialId: material.id,
            inventoryItemId: material.inventoryItemId,
            sourceInventoryLotId: material.inventoryLotId,
            quantity: decimal(10),
          })),
        },
      ],
      qualityInspections: [],
      costSnapshots: [],
    };
    const settings = {
      defaultWipWarehouseId: "warehouse-wip",
      defaultWipLocationId: "location-wip",
      defaultFinishedGoodsWarehouseId: "warehouse-fg-q",
      defaultFinishedGoodsHoldLocationId: "location-fg-q",
      wipInventoryAccountId: "wip-account",
      finishedGoodsInventoryAccountId: inventoryControlAccountId,
      requireSerialBeforeRelease: false,
      requireQcBeforeRelease: false,
      currency: "BDT",
    };

    const service = configuredService();
    const result = await service.postProductionReceipt(
      tx,
      scope,
      user,
      order,
      settings,
      {
        kind: "POST_PRODUCTION_RECEIPT",
        idempotencyKey: "canonical-fgr-1",
        transactionDate: when.toISOString(),
        lines: [
          {
            orderLotId: "lot-all",
            lotNumber: "FG-FRIDGE-LOT-ALL",
            quantity: 10,
            unit: "pcs",
            serialNumbers: [],
            destinationWarehouseId: "warehouse-fg-q",
            destinationLocationId: "location-fg-q",
          },
        ],
      },
      when,
    );

    expect(result.transactionIds).toEqual(["fgr-transaction-1"]);
    expect(transactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionType: "PRODUCTION_RECEIPT",
          fromWarehouseId: "warehouse-wip",
          toWarehouseId: "warehouse-fg-q",
          toLocationId: "location-fg-q",
        }),
      }),
    );
    expect(stockMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey:
            "MFG:canonical-fgr-1:lot-all:receipt-line-fridge:FGQ-IN",
          warehouseId: "warehouse-fg-q",
          movementType: "IN",
          quantity: decimal(10),
        }),
      }),
    );
    // Consumption is represented by the FGR input stock legs; it must not
    // create a second GL entry in addition to the one Dr FG / Cr WIP voucher.
    expect(voucherCreate).toHaveBeenCalledTimes(1);
    expect(service.protectedInventoryControlLedger).toHaveBeenCalledWith(
      tx,
      scope.companyId,
      inventoryControlAccountId,
      "Finished-goods inventory account",
    );
    expect(service.activeLedger).toHaveBeenCalledWith(
      tx,
      scope.companyId,
      "wip-account",
      "WIP inventory account",
      "ASSET",
    );
    expect(service.activeWarehouse).toHaveBeenCalledWith(
      tx,
      scope.id,
      "warehouse-fg-q",
      "FG-Q warehouse",
      { companyId: scope.companyId, role: "FINISHED_GOODS" },
    );
    expect(service.activeLocation).toHaveBeenCalledWith(
      tx,
      scope.id,
      "warehouse-fg-q",
      "location-fg-q",
      "FG-Q receipt location",
      { companyId: scope.companyId, dispositions: ["QC_HOLD"] },
    );
    const voucher = voucherCreate.mock.calls[0][0].data;
    expect(voucher.documentKind).toBe("PRODUCTION_RECEIPT");
    expect(voucher.totalAmount.toFixed(2)).toBe("5235317.46");
    expect(voucher.debit.toFixed(2)).toBe("5235317.46");
    expect(voucher.credit.toFixed(2)).toBe("5235317.46");
    expect(voucher.lines.create).toEqual([
      expect.objectContaining({
        accountId: inventoryControlAccountId,
        debit: decimal("5235317.46"),
        credit: 0,
      }),
      expect.objectContaining({
        accountId: "wip-account",
        debit: 0,
        credit: decimal("5235317.46"),
      }),
    ]);
  });

  it("moves the full FG-Q lot to FG-R at carried value and creates no QA-release GL", async () => {
    vi.mocked(issueManufacturingDocumentNumberTx).mockResolvedValue({
      documentNumber: "QAR-2026-000001",
    } as never);
    vi.mocked(rebuildMovingAverageCosts).mockResolvedValue({
      movements: [
        {
          id: "fg-q-out-1",
          unitCost: decimal("523531.7461"),
          movementValue: decimal("5235317.4610"),
        },
        {
          id: "fg-r-in-1",
          unitCost: decimal("523531.7461"),
          movementValue: decimal("5235317.4610"),
        },
      ],
      balances: new Map(),
    } as never);

    const voucherCreate = vi.fn();
    const stockMovementCreate = vi
      .fn()
      .mockImplementation(async ({ data }) => ({
        id: data.movementType === "OUT" ? "fg-q-out-1" : "fg-r-in-1",
      }));
    const tx = {
      manufacturingInventoryLot: {
        findFirst: vi.fn().mockResolvedValue({
          id: "fg-q-lot-1",
          lotNumber: "FG-FRIDGE-LOT-ALL",
          warehouseId: "warehouse-fg-q",
          locationId: "location-fg-q",
          receivedQuantity: decimal(10),
          holdQuantity: decimal(10),
          availableQuantity: decimal(0),
          unit: "pcs",
          unitCost: decimal("523531.7461"),
          serials: [],
          sourceTransactionLine: {
            transaction: {
              orderId: "order-1",
              orderLotId: "lot-all",
              transactionType: "PRODUCTION_RECEIPT",
              status: "POSTED",
            },
          },
        }),
        update: vi.fn(),
      },
      manufacturingTransaction: {
        create: vi.fn().mockResolvedValue({
          id: "qa-release-transaction-1",
          lines: [
            {
              id: "qa-release-line-1",
              inventoryItemId: "FG-FRIDGE-001",
              quantity: decimal(10),
              unit: "pcs",
            },
          ],
        }),
      },
      manufacturingTransactionLine: { update: vi.fn() },
      manufacturingSerial: { findMany: vi.fn(), update: vi.fn() },
      manufacturingSerialMovement: { create: vi.fn() },
      manufacturingOrderLot: { update: vi.fn() },
      stockMovement: { create: stockMovementCreate },
      voucherEntry: { create: voucherCreate },
    };
    const service = configuredService();
    vi.spyOn(service, "packagingReleasePolicy").mockResolvedValue({
      required: false,
      ready: true,
      issues: [],
    });
    vi.spyOn(service, "lotPackagingActuals").mockReturnValue({
      ready: true,
      issues: [],
    });
    const order = {
      id: "order-1",
      orderNumber: "MO-FRIDGE-001",
      completedQuantity: decimal(10),
      finishedProductId: "FG-FRIDGE-001",
      finishedProduct: { manufacturingProfile: { serialTracked: false } },
      lots: [{ id: "lot-all", lotNumber: "LOT-ALL" }],
      transactions: [
        {
          status: "POSTED",
          transactionType: "PRODUCTION_RECEIPT",
          orderLotId: "lot-all",
          lines: [
            {
              inventoryItemId: "FG-FRIDGE-001",
              orderMaterialId: null,
              quantity: decimal(10),
            },
          ],
        },
      ],
      qualityInspections: [],
      packagingOrders: [],
    };

    const result = await service.postQaRelease(
      tx,
      scope,
      user,
      order,
      {
        mode: "GENERAL",
        requireQcBeforeRelease: false,
        requireSerialBeforeRelease: false,
        defaultFinishedGoodsWarehouseId: "warehouse-fg-q",
        defaultFinishedGoodsReleasedWarehouseId: "warehouse-fg-r",
        defaultFinishedGoodsReleaseLocationId: "location-fg-r",
        finishedGoodsInventoryAccountId: inventoryControlAccountId,
      },
      {
        kind: "QA_RELEASE",
        idempotencyKey: "canonical-qa-release-1",
        transactionDate: when.toISOString(),
        lines: [
          {
            inventoryLotId: "fg-q-lot-1",
            quantity: 10,
            serialNumbers: [],
            destinationWarehouseId: "warehouse-fg-r",
            destinationLocationId: "location-fg-r",
          },
        ],
      },
      when,
    );

    expect(result.allReleased).toBe(true);
    expect(
      stockMovementCreate.mock.calls.map((call) => ({
        warehouseId: call[0].data.warehouseId,
        movementType: call[0].data.movementType,
      })),
    ).toEqual([
      { warehouseId: "warehouse-fg-q", movementType: "OUT" },
      { warehouseId: "warehouse-fg-r", movementType: "IN" },
    ]);
    expect(tx.manufacturingInventoryLot.update).toHaveBeenCalledWith({
      where: { id: "fg-q-lot-1" },
      data: {
        warehouseId: "warehouse-fg-r",
        locationId: "location-fg-r",
        availableQuantity: decimal(10),
        holdQuantity: 0,
      },
    });
    expect(voucherCreate).not.toHaveBeenCalled();
    expect(service.protectedInventoryControlLedger).toHaveBeenCalledWith(
      tx,
      scope.companyId,
      inventoryControlAccountId,
      "Finished-goods inventory account",
    );
    expect(service.activeWarehouse).toHaveBeenCalledWith(
      tx,
      scope.id,
      "warehouse-fg-q",
      "FG-Q warehouse",
      { companyId: scope.companyId, role: "FINISHED_GOODS" },
    );
    expect(service.activeLocation).toHaveBeenCalledWith(
      tx,
      scope.id,
      "warehouse-fg-q",
      "location-fg-q",
      "FG-Q source location",
      { companyId: scope.companyId, dispositions: ["QC_HOLD"] },
    );
    expect(service.activeLocation).toHaveBeenCalledWith(
      tx,
      scope.id,
      "warehouse-fg-r",
      "location-fg-r",
      "FG-R release location",
      { companyId: scope.companyId, dispositions: ["RELEASED"] },
    );
  });

  it("returns an exact Material Issue replay without opening a second transaction or GL posting", async () => {
    const lines = [
      {
        orderLotId: "lot-a",
        orderMaterialId: "material-body",
        inventoryLotId: "rm-lot-body",
        quantity: 2,
      },
    ];
    const payload = { orderLotId: "lot-a" };
    const actionApprovalEntityId = manufacturingActionApprovalEntityId({
      orderId: "order-1",
      action: "ISSUE_MATERIALS",
      transactionDate: when,
      lines,
      payload,
    });
    const transaction = vi.fn();
    const voucherCreate = vi.fn();
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scope) },
      manufacturingWorkflowReview: {
        findUnique: vi.fn().mockResolvedValue({
          id: "material-issue-review-1",
          orderId: "order-1",
          workflowCode: "ORDER_ACTION",
          transactionDate: when,
          createdAt: when,
          note: null,
          createdBy: { name: "Material issuer" },
          evidence: {
            kind: "ISSUE_MATERIALS",
            actionApprovalEntityId,
            stagePermission: "manufacturing.material.issue",
            fromStatus: "RESERVED",
            toStatus: "ISSUED",
            transactionIds: ["material-issue-transaction-1"],
            stockMovementIds: ["rm-out-1", "wip-in-1"],
          },
        }),
      },
      voucherEntry: { create: voucherCreate },
      $transaction: transaction,
    };
    const permissions = {
      getGrantedKeys: vi
        .fn()
        .mockResolvedValue(new Set(["manufacturing.material.issue"])),
    };
    const service = new ManufacturingService(
      prisma as never,
      permissions as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(service, "getOrder").mockResolvedValue({ id: "order-1" } as never);

    const result = await service.performOrderAction(user, "order-1", {
      kind: "ISSUE_MATERIALS",
      idempotencyKey: "canonical-material-issue-1",
      transactionDate: when.toISOString(),
      lines,
      payload,
    });

    expect(result.replayed).toBe(true);
    expect(result.transactionIds).toEqual(["material-issue-transaction-1"]);
    expect(result.stockMovementIds).toEqual(["rm-out-1", "wip-in-1"]);
    expect(transaction).not.toHaveBeenCalled();
    expect(voucherCreate).not.toHaveBeenCalled();
  });
});
