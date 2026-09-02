import { Prisma } from "../generated/prisma/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ManufacturingService } from "./manufacturing.service.js";

const user = {
  id: "user-1",
  tenantId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
} as any;

const scopeRow = {
  id: "workspace-1",
  tenantId: "tenant-1",
  companyId: "company-1",
};

afterEach(() => vi.useRealTimers());

function service(prisma: any, approvalWorkflow: any = {}) {
  return new ManufacturingService(
    prisma,
    {} as any,
    approvalWorkflow,
    {} as any,
  );
}

function bomVersionRow(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-09-01T00:00:00.000Z");
  return {
    id: "bom-version-1",
    bomId: "bom-1",
    versionNumber: 1,
    status: "DRAFT",
    outputQuantity: new Prisma.Decimal(1),
    outputUnit: "pcs",
    effectiveFrom: null,
    effectiveTo: null,
    changeReason: null,
    approvedAt: null,
    approvedBy: null,
    createdAt: now,
    updatedAt: now,
    components: [],
    ...overrides,
  };
}

function approvableBomVersionRow(overrides: Record<string, unknown> = {}) {
  const base: any = bomVersionRow({
    bom: {
      createdByUserId: "maker-1",
      finishedProduct: {
        kind: "PRODUCT",
        status: "ACTIVE",
        manufacturingProfile: {
          isActive: true,
          role: "FINISHED_GOOD",
          makeBuy: "MAKE",
        },
      },
    },
    components: [
      {
        id: "component-required",
        inventoryItemId: "material-required",
        issueLocationId: null,
        quantityPerOutput: new Prisma.Decimal(1),
        scrapPercent: new Prisma.Decimal(0),
        unit: "kg",
        isOptional: false,
        allowSubstitute: false,
        notes: null,
        inventoryItem: {
          itemCode: "RM-REQ",
          itemName: "Required material",
          kind: "PRODUCT",
          status: "ACTIVE",
          manufacturingProfile: {
            isActive: true,
            role: "RAW_MATERIAL",
          },
        },
        issueLocation: null,
      },
    ],
  });
  return {
    ...base,
    ...overrides,
    bom: {
      ...base.bom,
      ...((overrides.bom as Record<string, unknown> | undefined) ?? {}),
    },
    components:
      (overrides.components as unknown[] | undefined) ?? base.components,
  };
}

describe("ManufacturingService BOM output controls", () => {
  it("rejects an existing non-output manufacturing role", async () => {
    const prisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
      manufacturingBom: { findFirst: vi.fn().mockResolvedValue(null) },
      inventoryItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: "material-1",
          manufacturingProfile: {
            role: "RAW_MATERIAL",
            makeBuy: "BUY",
          },
        }),
      },
    };

    await expect(
      service(prisma).createBom(user, {
        workspaceId: scopeRow.id,
        idempotencyKey: "invalid-output-role",
        name: "Invalid output",
        finishedProductId: "material-1",
        makeBuy: "MAKE",
      }),
    ).rejects.toThrow(/INTERMEDIATE, BULK or FINISHED GOOD role/i);
  });

  it("rejects BUY as a production BOM output policy", async () => {
    const prisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
      manufacturingBom: { findFirst: vi.fn().mockResolvedValue(null) },
      inventoryItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: "finished-1",
          manufacturingProfile: {
            role: "FINISHED_GOOD",
            makeBuy: "BUY",
          },
        }),
      },
    };

    await expect(
      service(prisma).createBom(user, {
        workspaceId: scopeRow.id,
        idempotencyKey: "invalid-output-policy",
        name: "Bought output",
        finishedProductId: "finished-1",
        makeBuy: "BUY",
      }),
    ).rejects.toThrow(/must use the MAKE or BOTH/i);
  });
});

describe("ManufacturingService BOM version controls", () => {
  const bom = {
    id: "bom-1",
    finishedProductId: "finished-1",
    finishedProduct: {
      id: "finished-1",
      itemCode: "FG-1",
      itemName: "Finished product",
      unit: "pcs",
      alternateUnit: null,
      alternateUnitConversion: null,
    },
  };

  it("rejects a version whose components are all optional", async () => {
    const prisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
      manufacturingBom: { findFirst: vi.fn().mockResolvedValue(bom) },
    };

    await expect(
      service(prisma).createBomVersion(user, bom.id, {
        workspaceId: scopeRow.id,
        outputQuantity: 1,
        outputUnit: "pcs",
        components: [
          {
            inventoryItemId: "optional-1",
            quantity: 1,
            unit: "pcs",
            isOptional: true,
          },
        ],
      }),
    ).rejects.toThrow(/at least one non-optional component/i);
  });

  it("rejects an inverted effective date range in the API", async () => {
    const prisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
      manufacturingBom: { findFirst: vi.fn().mockResolvedValue(bom) },
    };

    await expect(
      service(prisma).createBomVersion(user, bom.id, {
        workspaceId: scopeRow.id,
        outputQuantity: 1,
        outputUnit: "pcs",
        effectiveFrom: "2026-09-30",
        effectiveTo: "2026-09-01",
        components: [
          {
            inventoryItemId: "material-1",
            quantity: 1,
            unit: "pcs",
          },
        ],
      }),
    ).rejects.toThrow(/effectiveTo cannot be before effectiveFrom/i);
  });

  it("rejects duplicate component items instead of losing their BOM-line identity", async () => {
    const prisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
      manufacturingBom: { findFirst: vi.fn().mockResolvedValue(bom) },
    };

    await expect(
      service(prisma).createBomVersion(user, bom.id, {
        workspaceId: scopeRow.id,
        outputQuantity: 1,
        outputUnit: "pcs",
        components: [
          { inventoryItemId: "material-1", quantity: 1, unit: "kg" },
          { inventoryItemId: "material-1", quantity: 2, unit: "kg" },
        ],
      }),
    ).rejects.toThrow(/cannot contain duplicate component items/i);
  });

  it("stores no per-component warehouse override because orders use the configured RM source", async () => {
    const versionCreate = vi.fn(async ({ data }: any) =>
      bomVersionRow({
        outputQuantity: data.outputQuantity,
        outputUnit: data.outputUnit,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo,
        components: data.components.create.map(
          (component: any, index: number) => ({
            id: `component-${index + 1}`,
            ...component,
            inventoryItem: {
              itemCode: "RM-1",
              itemName: "Material",
              manufacturingProfile: { role: "RAW_MATERIAL" },
            },
            issueLocation: null,
          }),
        ),
      }),
    );
    const tx: any = {
      manufacturingItemProfile: { upsert: vi.fn() },
      manufacturingBomVersion: { create: versionCreate },
      manufacturingWorkflowReview: { create: vi.fn() },
    };
    const prisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
      manufacturingBom: { findFirst: vi.fn().mockResolvedValue(bom) },
      inventoryItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "material-1",
            itemCode: "RM-1",
            itemName: "Material",
            unit: "kg",
            alternateUnit: null,
            alternateUnitConversion: null,
          },
        ]),
      },
      manufacturingBomVersion: {
        aggregate: vi.fn().mockResolvedValue({ _max: { versionNumber: null } }),
      },
      $transaction: vi.fn(async (callback: any) => callback(tx)),
    };

    await service(prisma).createBomVersion(user, bom.id, {
      workspaceId: scopeRow.id,
      outputQuantity: 1,
      outputUnit: "pcs",
      components: [
        {
          inventoryItemId: "material-1",
          quantity: 2,
          unit: "kg",
        },
      ],
    });

    expect(
      versionCreate.mock.calls[0]![0].data.components.create[0].issueLocationId,
    ).toBeNull();
  });
});

describe("ManufacturingService BOM effective-date approval", () => {
  it.each([
    ["2026-08-31", /before the BOM effective-from date/i],
    ["2026-10-01", /after the BOM effective-to date/i],
  ])(
    "rejects approval on %s outside the effective window",
    async (date, error) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-12-31T12:00:00.000Z"));
      const advance = vi.fn();
      const tx: any = {
        manufacturingBomVersion: {
          findFirst: vi.fn().mockResolvedValue(
            bomVersionRow({
              effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
              effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
              bom: { createdByUserId: "maker-1" },
            }),
          ),
        },
      };
      const prisma: any = {
        workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
        $transaction: vi.fn(async (callback: any) => callback(tx)),
      };

      await expect(
        service(prisma, { advance }).approveBomVersion(user, "bom-version-1", {
          workspaceId: scopeRow.id,
          idempotencyKey: `approve-${date}`,
          transactionDate: date,
        }),
      ).rejects.toThrow(error);
      expect(advance).not.toHaveBeenCalled();
    },
  );

  it("rejects backdated approval after the BOM has expired on the current UTC day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));
    const advance = vi.fn();
    const pending = approvableBomVersionRow({
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-09-14T00:00:00.000Z"),
    });
    const prisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
      $transaction: vi.fn(async (callback: any) =>
        callback({
          manufacturingBomVersion: {
            findFirst: vi.fn().mockResolvedValue(pending),
          },
        }),
      ),
    };

    await expect(
      service(prisma, { advance }).approveBomVersion(user, "bom-version-1", {
        workspaceId: scopeRow.id,
        idempotencyKey: "approve-backdated-expired-version",
        transactionDate: "2026-09-14",
      }),
    ).rejects.toThrow(
      /current date cannot be after the BOM effective-to date/i,
    );
    expect(advance).not.toHaveBeenCalled();
  });

  it("allows approval at any time on the inclusive effective-to day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00.000Z"));
    const pending = approvableBomVersionRow({
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
    });
    const advance = vi.fn().mockResolvedValue({
      complete: false,
      totalStages: 2,
      completedStages: 1,
      nextStage: 2,
    });
    const tx: any = {
      manufacturingBomVersion: {
        findFirst: vi.fn().mockResolvedValue(pending),
        findUnique: vi.fn().mockResolvedValue(pending),
      },
    };
    const prisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
      $transaction: vi.fn(async (callback: any) => callback(tx)),
    };

    await expect(
      service(prisma, { advance }).approveBomVersion(user, "bom-version-1", {
        workspaceId: scopeRow.id,
        idempotencyKey: "approve-final-day",
        transactionDate: "2026-09-30T23:59:59.999Z",
      }),
    ).resolves.toMatchObject({ id: "bom-version-1" });
    expect(advance).toHaveBeenCalledOnce();
  });

  it("revalidates the output and component masters before approval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));
    const advance = vi.fn();
    const staleOutput = approvableBomVersionRow({
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
      bom: {
        finishedProduct: {
          kind: "PRODUCT",
          status: "INACTIVE",
          manufacturingProfile: {
            isActive: true,
            role: "FINISHED_GOOD",
            makeBuy: "MAKE",
          },
        },
      },
    });
    const outputPrisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
      $transaction: vi.fn(async (callback: any) =>
        callback({
          manufacturingBomVersion: {
            findFirst: vi.fn().mockResolvedValue(staleOutput),
          },
        }),
      ),
    };

    await expect(
      service(outputPrisma, { advance }).approveBomVersion(
        user,
        "bom-version-1",
        {
          workspaceId: scopeRow.id,
          idempotencyKey: "approve-stale-output",
          transactionDate: "2026-09-15",
        },
      ),
    ).rejects.toThrow(/active manufacturable output product/i);

    const staleComponent = approvableBomVersionRow({
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
    });
    staleComponent.components[0].inventoryItem.manufacturingProfile.isActive = false;
    const componentPrisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
      $transaction: vi.fn(async (callback: any) =>
        callback({
          manufacturingBomVersion: {
            findFirst: vi.fn().mockResolvedValue(staleComponent),
          },
        }),
      ),
    };

    await expect(
      service(componentPrisma, { advance }).approveBomVersion(
        user,
        "bom-version-1",
        {
          workspaceId: scopeRow.id,
          idempotencyKey: "approve-stale-component",
          transactionDate: "2026-09-15",
        },
      ),
    ).rejects.toThrow(/active inventory product/i);
    expect(advance).not.toHaveBeenCalled();
  });

  it("revalidates configured component issue locations before approval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));
    const pending = approvableBomVersionRow({
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
    });
    pending.components[0].issueLocationId = "location-rm";
    pending.components[0].issueLocation = {
      isActive: true,
      disposition: "QC_HOLD",
      workspaceId: scopeRow.id,
      warehouse: { isActive: true, deletedAt: null },
    };
    const advance = vi.fn();
    const prisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
      $transaction: vi.fn(async (callback: any) =>
        callback({
          manufacturingBomVersion: {
            findFirst: vi.fn().mockResolvedValue(pending),
          },
        }),
      ),
    };

    await expect(
      service(prisma, { advance }).approveBomVersion(user, "bom-version-1", {
        workspaceId: scopeRow.id,
        idempotencyKey: "approve-invalid-location",
        transactionDate: "2026-09-15",
      }),
    ).rejects.toThrow(/active RELEASED issue location/i);
    expect(advance).not.toHaveBeenCalled();
  });

  it("rejects a legacy draft with duplicate component items at approval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));
    const pending = approvableBomVersionRow({
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
    });
    pending.components.push({
      ...pending.components[0],
      id: "component-duplicate",
    });
    const advance = vi.fn();
    const prisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
      $transaction: vi.fn(async (callback: any) =>
        callback({
          manufacturingBomVersion: {
            findFirst: vi.fn().mockResolvedValue(pending),
          },
        }),
      ),
    };

    await expect(
      service(prisma, { advance }).approveBomVersion(user, "bom-version-1", {
        workspaceId: scopeRow.id,
        idempotencyKey: "approve-duplicate-components",
        transactionDate: "2026-09-15",
      }),
    ).rejects.toThrow(/duplicate component items/i);
    expect(advance).not.toHaveBeenCalled();
  });

  it("rejects a future-dated approval before it can retire the current approved version", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
    const advance = vi.fn();
    const prisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
    };

    await expect(
      service(prisma, { advance }).approveBomVersion(user, "bom-version-1", {
        workspaceId: scopeRow.id,
        idempotencyKey: "approve-future-version",
        transactionDate: "2026-09-02",
      }),
    ).rejects.toThrow(/cannot be in the future/i);
    expect(advance).not.toHaveBeenCalled();
  });
});

describe("ManufacturingService production-order BOM requirements", () => {
  const mandatory = {
    id: "component-required",
    inventoryItemId: "material-required",
    quantityPerOutput: new Prisma.Decimal(2),
    scrapPercent: new Prisma.Decimal(0),
    unit: "kg",
    issueLocationId: null,
    issueLocation: null,
    isOptional: false,
    inventoryItem: {
      id: "material-required",
      itemCode: "RM-REQ",
      itemName: "Required material",
      kind: "PRODUCT",
      status: "ACTIVE",
      unit: "kg",
      alternateUnit: null,
      alternateUnitConversion: null,
      manufacturingProfile: {
        isActive: true,
        role: "RAW_MATERIAL",
      },
    },
  };
  const optional = {
    id: "component-optional",
    inventoryItemId: "material-optional",
    quantityPerOutput: new Prisma.Decimal(9),
    scrapPercent: new Prisma.Decimal(0),
    unit: "kg",
    issueLocationId: null,
    issueLocation: null,
    isOptional: true,
    inventoryItem: {
      id: "material-optional",
      itemCode: "RM-OPT",
      itemName: "Optional material",
      kind: "PRODUCT",
      status: "ACTIVE",
      unit: "kg",
      alternateUnit: null,
      alternateUnitConversion: null,
      manufacturingProfile: {
        isActive: true,
        role: "RAW_MATERIAL",
      },
    },
  };

  function orderHarness() {
    const bomVersion: any = {
      id: "bom-version-1",
      status: "APPROVED",
      outputQuantity: new Prisma.Decimal(1),
      outputUnit: "pcs",
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
      bom: {
        finishedProduct: {
          id: "finished-1",
          itemCode: "FG-1",
          itemName: "Finished product",
          kind: "PRODUCT",
          status: "ACTIVE",
          unit: "pcs",
          alternateUnit: null,
          alternateUnitConversion: null,
          manufacturingProfile: {
            isActive: true,
            role: "FINISHED_GOOD",
            makeBuy: "MAKE",
          },
        },
      },
      components: [mandatory, optional].map((component) => ({
        ...component,
        inventoryItem: {
          ...component.inventoryItem,
          manufacturingProfile: {
            ...component.inventoryItem.manufacturingProfile,
          },
        },
      })),
    };
    const orderCreate = vi.fn(async ({ data }: any) => ({
      id: "order-1",
      lots: data.lots.create.map((lot: any, index: number) => ({
        id: `lot-${index + 1}`,
        ...lot,
      })),
    }));
    const reviewCreate = vi.fn();
    const planFind = vi.fn();
    const txPlanFind = vi.fn();
    const txPlanLotFind = vi.fn();
    const allocatedOrderFind = vi.fn().mockResolvedValue([]);
    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([{ id: "sequence-1" }]),
      manufacturingOrder: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: allocatedOrderFind,
        create: orderCreate,
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "order-1" }),
      },
      manufacturingPlan: { findFirst: txPlanFind },
      manufacturingPlanLot: { findFirst: txPlanLotFind },
      manufacturingDocumentNumber: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ documentNumber: "MO-0001" }),
      },
      manufacturingDocumentSequence: {
        findUnique: vi.fn().mockResolvedValue({
          id: "sequence-1",
          isActive: true,
          prefix: "MO",
          padding: 4,
          nextNumber: 1,
          resetPeriod: "NEVER",
          resetAnnually: false,
          lastIssuedPeriod: null,
        }),
        update: vi.fn(),
      },
      manufacturingWorkflowReview: { create: reviewCreate },
      manufacturingRoutingOperation: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "routing-operation-1", sequence: 10 }]),
      },
      manufacturingOperationExecution: { createMany: vi.fn() },
    };
    const prisma: any = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scopeRow) },
      manufacturingOrder: { findFirst: vi.fn().mockResolvedValue(null) },
      warehouse: {
        findFirst: vi.fn(async ({ where }: any) => ({
          id: where.id,
          name: where.id === "warehouse-rm" ? "RM" : "FG-Q",
          code: where.id,
          type: where.id.includes("fg") ? "FINISHED_GOODS" : "RAW_MATERIAL",
          allowMaterialIssue: !where.id.includes("fg"),
        })),
      },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue({
          defaultRawMaterialLocationId: "location-rm",
          defaultFinishedGoodsHoldLocationId: "location-fgq",
          defaultRawMaterialWarehouseId: "warehouse-rm",
          defaultFinishedGoodsWarehouseId: "warehouse-fgq",
        }),
      },
      manufacturingLocation: {
        findFirst: vi.fn(async ({ where }: any) => ({
          id: where.id,
          name: where.id,
          warehouseId: where.warehouseId,
          disposition: where.id === "location-rm" ? "RELEASED" : "QC_HOLD",
        })),
      },
      manufacturingBomVersion: {
        findFirst: vi.fn().mockResolvedValue(bomVersion),
      },
      manufacturingPlan: { findFirst: planFind },
      manufacturingRoutingVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: "routing-version-1",
          effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
          effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
          operations: [{ id: "routing-operation-1" }],
        }),
      },
      $transaction: vi.fn(async (callback: any) => callback(tx)),
    };
    return {
      prisma,
      tx,
      orderCreate,
      reviewCreate,
      bomVersion,
      planFind,
      txPlanFind,
      txPlanLotFind,
      allocatedOrderFind,
    };
  }

  const input = {
    workspaceId: scopeRow.id,
    idempotencyKey: "create-order-required-only",
    orderType: "ASSEMBLY" as const,
    finishedProductId: "finished-1",
    bomVersionId: "bom-version-1",
    routingVersionId: "routing-version-1",
    plannedQuantity: 10,
    unit: "pcs",
    sourceWarehouseId: "warehouse-rm",
    destinationWarehouseId: "warehouse-fgq",
    plannedStartDate: "2026-09-30T23:59:59.999Z",
    plannedEndDate: "2026-10-01",
  };

  function linkApprovedPlan(
    harness: ReturnType<typeof orderHarness>,
    overrides: Record<string, unknown> = {},
  ) {
    harness.planFind.mockResolvedValue({
      id: "plan-1",
      bomVersionId: "bom-version-1",
      routingVersionId: "routing-version-1",
    });
    harness.txPlanFind.mockResolvedValue({
      id: "plan-1",
      status: "APPROVED",
      finishedProductId: "finished-1",
      bomVersionId: "bom-version-1",
      routingVersionId: "routing-version-1",
      plannedQuantity: new Prisma.Decimal(100),
      unit: "pcs",
      plannedStartDate: new Date("2026-09-01T00:00:00.000Z"),
      plannedEndDate: new Date("2026-10-01T00:00:00.000Z"),
      ...overrides,
    });
  }

  it("creates material lines and conversion evidence only for non-optional components", async () => {
    const { prisma, orderCreate, reviewCreate } = orderHarness();
    const subject = service(prisma) as any;
    vi.spyOn(subject, "mapOrder").mockResolvedValue({ id: "order-1" });

    await expect(subject.createOrder(user, input)).resolves.toEqual({
      id: "order-1",
    });

    const created = orderCreate.mock.calls[0]![0].data;
    expect(created.materials.create).toHaveLength(1);
    expect(created.materials.create[0]).toMatchObject({
      bomComponentId: mandatory.id,
      inventoryItemId: mandatory.inventoryItemId,
    });
    expect(
      reviewCreate.mock.calls[0]![0].data.evidence.components,
    ).toHaveLength(1);
    expect(
      reviewCreate.mock.calls[0]![0].data.evidence
        .calculatedMaterialRequirements,
    ).toEqual([
      expect.objectContaining({ inventoryItemId: mandatory.inventoryItemId }),
    ]);
  });

  it("rejects a new order when the approved BOM output master is no longer manufacturable", async () => {
    const { prisma, tx, bomVersion } = orderHarness();
    bomVersion.bom.finishedProduct.manufacturingProfile.makeBuy = "BUY";

    await expect(
      service(prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-stale-output-master",
      }),
    ).rejects.toThrow(/output must remain an active manufacturable product/i);
    expect(tx.manufacturingOrder.create).not.toHaveBeenCalled();
  });

  it("rejects a new order when a required component master becomes inactive", async () => {
    const { prisma, tx, bomVersion } = orderHarness();
    bomVersion.components[0]!.inventoryItem.manufacturingProfile.isActive = false;

    await expect(
      service(prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-stale-required-component",
      }),
    ).rejects.toThrow(/required BOM component .* must remain an active/i);
    expect(tx.manufacturingOrder.create).not.toHaveBeenCalled();
  });

  it("rejects a legacy component override outside the configured RM warehouse", async () => {
    const { prisma, tx, bomVersion } = orderHarness();
    bomVersion.components[0]!.issueLocationId = "legacy-location";
    bomVersion.components[0]!.issueLocation = {
      warehouseId: "warehouse-other",
    };

    await expect(
      service(prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-legacy-component-warehouse",
      }),
    ).rejects.toThrow(/legacy issue location outside the configured/i);
    expect(tx.manufacturingOrder.create).not.toHaveBeenCalled();
  });

  it("rejects a legacy approved BOM with duplicate required material lines", async () => {
    const { prisma, tx, bomVersion } = orderHarness();
    bomVersion.components.push({
      ...bomVersion.components[0],
      id: "component-required-duplicate",
    });

    await expect(
      service(prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-duplicate-required-components",
      }),
    ).rejects.toThrow(/duplicate required component items/i);
    expect(tx.manufacturingOrder.create).not.toHaveBeenCalled();
  });

  it("rejects a planned start after the approved BOM effective-to day", async () => {
    const { prisma, tx } = orderHarness();

    await expect(
      service(prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-after-effective-window",
        plannedStartDate: "2026-10-01",
      }),
    ).rejects.toThrow(/after the BOM effective-to date/i);
    expect(tx.manufacturingOrder.create).not.toHaveBeenCalled();
  });

  it("rejects an inverted initial production-order date range", async () => {
    const { prisma, tx } = orderHarness();

    await expect(
      service(prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-inverted-dates",
        plannedStartDate: "2026-09-10",
        plannedEndDate: "2026-09-09",
      }),
    ).rejects.toThrow(/plannedEndDate cannot be earlier/i);
    expect(tx.manufacturingOrder.create).not.toHaveBeenCalled();
  });

  it("requires the configured RM and FG-Q warehouses", async () => {
    const { prisma, tx } = orderHarness();

    await expect(
      service(prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-wrong-rm-warehouse",
        sourceWarehouseId: "warehouse-other",
      }),
    ).rejects.toThrow(
      /must match the configured default raw-material warehouse/i,
    );
    expect(tx.manufacturingOrder.create).not.toHaveBeenCalled();
  });

  it("revalidates the configured warehouse roles at order creation", async () => {
    const { prisma, tx } = orderHarness();
    prisma.warehouse.findFirst.mockImplementation(({ where }: any) => ({
      id: where.id,
      name: where.id,
      code: where.id,
      type: where.id === "warehouse-rm" ? "WIP" : "FINISHED_GOODS",
      allowMaterialIssue: true,
    }));

    await expect(
      service(prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-invalid-configured-warehouse-role",
      }),
    ).rejects.toThrow(/must be a RAW MATERIAL or GENERAL warehouse/i);
    expect(prisma.warehouse.findFirst.mock.calls[0]![0].where).toMatchObject({
      companyId: scopeRow.companyId,
    });
    expect(tx.manufacturingOrder.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      "BOM",
      {
        bomVersionId: "bom-version-other",
        routingVersionId: "routing-version-1",
      },
      /BOM version must match .* pinned BOM/i,
    ],
    [
      "routing",
      {
        bomVersionId: "bom-version-1",
        routingVersionId: "routing-version-other",
      },
      /routing version must match .* pinned routing/i,
    ],
  ] as const)(
    "requires an order's %s version to match its selected production plan",
    async (_master, plan, error) => {
      const { prisma, tx, planFind } = orderHarness();
      planFind.mockResolvedValue({ id: "plan-1", ...plan });

      await expect(
        service(prisma).createOrder(user, {
          ...input,
          idempotencyKey: `order-plan-${_master}-mismatch`,
          planId: "plan-1",
        }),
      ).rejects.toThrow(error);
      expect(tx.manufacturingOrder.create).not.toHaveBeenCalled();
    },
  );

  it("rejects a plan lot when its parent production plan is not supplied", async () => {
    const { prisma, tx } = orderHarness();

    await expect(
      service(prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-orphan-plan-lot",
        planLotId: "plan-lot-1",
      }),
    ).rejects.toThrow(/planLotId requires its parent production plan/i);
    expect(tx.manufacturingOrder.create).not.toHaveBeenCalled();
  });

  it("allows a partial plan allocation and serializes it under a plan-level lock", async () => {
    const harness = orderHarness();
    linkApprovedPlan(harness);
    harness.allocatedOrderFind.mockResolvedValue([
      {
        id: "order-existing",
        plannedQuantity: new Prisma.Decimal(40),
        unit: "pcs",
      },
    ]);
    const subject = service(harness.prisma) as any;
    vi.spyOn(subject, "mapOrder").mockResolvedValue({ id: "order-1" });

    await expect(
      subject.createOrder(user, {
        ...input,
        idempotencyKey: "order-partial-plan-allocation",
        planId: "plan-1",
      }),
    ).resolves.toEqual({ id: "order-1" });

    expect(harness.allocatedOrderFind).toHaveBeenCalledWith({
      where: {
        workspaceId: scopeRow.id,
        planId: "plan-1",
        status: { not: "CANCELLED" },
      },
      select: { id: true, plannedQuantity: true, unit: true },
    });
    expect(harness.tx.$queryRaw.mock.calls[0]![0].values).toContain(
      "manufacturing-plan-allocation:workspace-1:plan-1",
    );
    expect(
      harness.reviewCreate.mock.calls[0]![0].data.evidence
        .productionPlanAllocation,
    ).toMatchObject({
      planId: "plan-1",
      planQuantity: "100",
      previouslyAllocatedQuantity: "40",
      orderAllocatedQuantity: "10",
      totalAllocatedQuantity: "50",
      unit: "pcs",
    });
  });

  it("rejects aggregate production-order quantity above the selected plan", async () => {
    const harness = orderHarness();
    linkApprovedPlan(harness);
    harness.allocatedOrderFind.mockResolvedValue([
      {
        id: "order-existing",
        plannedQuantity: new Prisma.Decimal(95),
        unit: "pcs",
      },
    ]);

    await expect(
      service(harness.prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-over-allocated-plan",
        planId: "plan-1",
      }),
    ).rejects.toThrow(/exceeds the production plan's remaining quantity \(5 pcs\)/i);
    expect(harness.tx.manufacturingOrder.create).not.toHaveBeenCalled();
  });

  it("rejects production-order dates outside the selected plan date range", async () => {
    const harness = orderHarness();
    linkApprovedPlan(harness, {
      plannedStartDate: new Date("2026-09-10T00:00:00.000Z"),
      plannedEndDate: new Date("2026-09-30T00:00:00.000Z"),
    });

    await expect(
      service(harness.prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-outside-plan-dates",
        planId: "plan-1",
        plannedStartDate: "2026-09-09",
        plannedEndDate: "2026-09-30",
      }),
    ).rejects.toThrow(/dates must stay within the selected production plan/i);
    expect(harness.tx.manufacturingOrder.create).not.toHaveBeenCalled();
  });

  it("rejects an incompatible production-plan unit", async () => {
    const harness = orderHarness();
    linkApprovedPlan(harness, { unit: "kg" });

    await expect(
      service(harness.prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-incompatible-plan-unit",
        planId: "plan-1",
      }),
    ).rejects.toThrow(/kg is not a configured unit/i);
    expect(harness.tx.manufacturingOrder.create).not.toHaveBeenCalled();
  });

  it("rejects a plan lot from another plan", async () => {
    const harness = orderHarness();
    linkApprovedPlan(harness);
    harness.txPlanLotFind.mockResolvedValue(null);

    await expect(
      service(harness.prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-cross-plan-lot",
        planId: "plan-1",
        planLotId: "other-plan-lot",
      }),
    ).rejects.toThrow(/does not belong to the selected production plan/i);
    expect(harness.txPlanLotFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "other-plan-lot", planId: "plan-1" },
      }),
    );
    expect(harness.tx.manufacturingOrder.create).not.toHaveBeenCalled();
  });

  it("requires a selected plan lot to be active, date-bound and exactly allocated", async () => {
    const inactive = orderHarness();
    linkApprovedPlan(inactive);
    inactive.txPlanLotFind.mockResolvedValue({
      id: "plan-lot-1",
      status: "COMPLETED",
      plannedQuantity: new Prisma.Decimal(10),
      plannedStartDate: null,
      plannedEndDate: null,
    });
    await expect(
      service(inactive.prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-completed-plan-lot",
        planId: "plan-1",
        planLotId: "plan-lot-1",
      }),
    ).rejects.toThrow(/must still be planned or released/i);

    const quantityMismatch = orderHarness();
    linkApprovedPlan(quantityMismatch);
    quantityMismatch.txPlanLotFind.mockResolvedValue({
      id: "plan-lot-1",
      status: "PLANNED",
      plannedQuantity: new Prisma.Decimal(20),
      plannedStartDate: null,
      plannedEndDate: null,
    });
    await expect(
      service(quantityMismatch.prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-partial-plan-lot",
        planId: "plan-1",
        planLotId: "plan-lot-1",
      }),
    ).rejects.toThrow(/must exactly allocate that lot's planned quantity/i);

    const dateMismatch = orderHarness();
    linkApprovedPlan(dateMismatch);
    dateMismatch.txPlanLotFind.mockResolvedValue({
      id: "plan-lot-1",
      status: "PLANNED",
      plannedQuantity: new Prisma.Decimal(10),
      plannedStartDate: new Date("2026-09-20T00:00:00.000Z"),
      plannedEndDate: new Date("2026-09-29T00:00:00.000Z"),
    });
    await expect(
      service(dateMismatch.prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-outside-plan-lot-dates",
        planId: "plan-1",
        planLotId: "plan-lot-1",
      }),
    ).rejects.toThrow(/dates must stay within the selected plan lot/i);
  });

  it("requires an approved routing with operations that is effective on planned start", async () => {
    const noOperations = orderHarness();
    noOperations.prisma.manufacturingRoutingVersion.findFirst.mockResolvedValueOnce(
      {
        id: "routing-version-1",
        effectiveFrom: null,
        effectiveTo: null,
        operations: [],
      },
    );
    await expect(
      service(noOperations.prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-routing-without-operations",
      }),
    ).rejects.toThrow(/routing with at least one operation/i);

    const expired = orderHarness();
    expired.prisma.manufacturingRoutingVersion.findFirst.mockResolvedValueOnce({
      id: "routing-version-1",
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-09-29T00:00:00.000Z"),
      operations: [{ id: "routing-operation-1" }],
    });
    await expect(
      service(expired.prisma).createOrder(user, {
        ...input,
        idempotencyKey: "order-expired-routing",
      }),
    ).rejects.toThrow(/after the routing effective-to date/i);
  });
});
