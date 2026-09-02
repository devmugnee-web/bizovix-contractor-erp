import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { PermissionsService } from "../common/services/permissions.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import type { ManufacturingService } from "./manufacturing.service.js";
import type { StartManufacturingRunDto } from "./manufacturing-workflow.dto.js";
import { ManufacturingWorkflowService } from "./manufacturing-workflow.service.js";

const user: AuthenticatedRequestUser = {
  id: "user-1",
  email: "maker@example.com",
  name: "Maker",
  initials: "M",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

type BomVersionBinding = {
  status: "DRAFT" | "APPROVED" | "RETIRED";
  components?: Array<{
    inventoryItem: {
      manufacturingProfile: {
        isActive: boolean;
        role: string;
      } | null;
    };
  }>;
};

type PlanBinding = {
  id: string;
  finishedProductId: string;
  status?: "DRAFT" | "APPROVED" | "RELEASED" | "IN_PROGRESS" | "COMPLETED";
  bomVersion?: BomVersionBinding;
};

type OrderBinding = {
  id: string;
  finishedProductId: string;
  planId: string | null;
  status?:
    | "DRAFT"
    | "SUBMITTED"
    | "APPROVED"
    | "RESERVED"
    | "ISSUED"
    | "IN_PRODUCTION"
    | "QC_HOLD"
    | "QA_RELEASED"
    | "COMPLETED"
    | "CLOSED"
    | "CANCELLED";
  bomVersion?: BomVersionBinding;
  routingVersion?: {
    status: "DRAFT" | "APPROVED" | "RETIRED";
    operations: Array<{ id: string }>;
  } | null;
  lots?: Array<{ id: string }>;
  operationExecutions?: Array<{
    id: string;
    orderLotId: string | null;
    routingOperationId: string;
  }>;
  type:
    | "ASSEMBLY"
    | "PHARMACEUTICAL"
    | "PACKAGING"
    | "REWORK"
    | "REPROCESSING"
    | "SUBCONTRACT";
};

function sqlText(query: unknown) {
  const strings =
    (query as { strings?: readonly string[] } | null | undefined)?.strings ??
    [];
  return strings.join("?").replace(/\s+/g, " ").trim();
}

function renderedSql(query: unknown) {
  const sql = query as {
    strings?: readonly string[];
    values?: readonly unknown[];
  };
  return (sql.strings ?? [])
    .map((part, index) => `${part}${String(sql.values?.[index] ?? "")}`)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function startDto(
  overrides: Partial<StartManufacturingRunDto>,
): StartManufacturingRunDto {
  return {
    workspaceId: "workspace-1",
    idempotencyKey: "start-run-binding-test",
    ...overrides,
  };
}

function persistedRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-created",
    tenantId: user.tenantId,
    companyId: user.companyId,
    workspaceId: user.workspaceId,
    workflowDefinitionId: "mwf-a-k-v2",
    workflowDefinitionVersion: 2,
    productionPlanId: null,
    productionOrderId: null,
    productId: "product-1",
    manufacturingMode: "GENERAL",
    status: "DRAFT",
    currentGroup: "B",
    currentStepSerial: 8,
    version: 1,
    startedAt: new Date("2026-08-31T00:00:00.000Z"),
    completedAt: null,
    closedAt: null,
    ...overrides,
  };
}

function harness(input: {
  plan?: PlanBinding | null;
  order?: OrderBinding | null;
  product?: Record<string, unknown> | null;
  settingsMode?: "GENERAL" | "PHARMACEUTICAL" | "HYBRID";
  electronicSignatureRequired?: boolean;
  packagingInventoryAccountId?: string | null;
  policy?: Record<string, unknown> | null;
  packagingLedger?: { id: string } | null;
  packagingSequence?: { id: string } | null;
  readiness?: {
    ready: boolean;
    checks: Array<{
      state: string;
      label: string;
      message: string | null;
    }>;
  };
}) {
  const plan = input.plan
    ? {
        status: "APPROVED",
        bomVersion: { status: "APPROVED", components: [] },
        ...input.plan,
      }
    : null;
  const order = input.order
    ? {
        status: "DRAFT",
        bomVersion: { status: "APPROVED", components: [] },
        routingVersion: {
          status: "APPROVED",
          operations: [{ id: "operation-1" }],
        },
        lots: [{ id: "lot-1" }],
        operationExecutions: [
          {
            id: "execution-1",
            orderLotId: "lot-1",
            routingOperationId: "operation-1",
          },
        ],
        ...input.order,
      }
    : null;
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn(),
    manufacturingPlan: {
      findFirst: vi.fn().mockResolvedValue(plan),
    },
    manufacturingOrder: {
      findFirst: vi.fn().mockResolvedValue(order),
    },
    inventoryItem: {
      findFirst: vi.fn().mockResolvedValue(
        input.product === null
          ? null
          : (input.product ?? {
              id: "product-1",
              kind: "PRODUCT",
              status: "ACTIVE",
              manufacturingProfile: {
                isActive: true,
                role: "FINISHED_GOOD",
                makeBuy: "MAKE",
              },
              manufacturingBoms: [
                {
                  versions: [{ id: "bom-version-approved", components: [] }],
                },
              ],
            }),
      ),
    },
    manufacturingSettings: {
      findUnique: vi.fn().mockResolvedValue({
        mode: input.settingsMode ?? "GENERAL",
        electronicSignatureRequired: input.electronicSignatureRequired ?? false,
        packagingInventoryAccountId:
          input.packagingInventoryAccountId ?? "packaging-ledger-1",
      }),
    },
    manufacturingControlRecord: {
      findFirst: vi.fn().mockResolvedValue(
        input.policy === undefined
          ? {
              payload: {
                signatureMeanings: ["Approved"],
                reauthenticationRequired: false,
                sessionTimeoutMinutes: 15,
                mfaRequired: false,
              },
            }
          : input.policy,
      ),
    },
    account: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          input.packagingLedger === undefined
            ? { id: "packaging-ledger-1" }
            : input.packagingLedger,
        ),
    },
    manufacturingDocumentSequence: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          input.packagingSequence === undefined
            ? { id: "packaging-sequence-1" }
            : input.packagingSequence,
        ),
    },
    auditLog: {
      create: vi.fn(),
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
    $transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };
  const manufacturing = {
    getReadiness: vi
      .fn()
      .mockResolvedValue(input.readiness ?? { ready: true, checks: [] }),
  };
  const service = new ManufacturingWorkflowService(
    prisma as unknown as PrismaService,
    {} as PermissionsService,
    {} as ManufacturingElectronicSignatureService,
    manufacturing as unknown as ManufacturingService,
  );

  return { service, tx, manufacturing };
}

function expectNoRunPersistence(tx: ReturnType<typeof harness>["tx"]) {
  expect(tx.$queryRaw).toHaveBeenCalled();
  expect(tx.$executeRaw).not.toHaveBeenCalled();
  expect(tx.auditLog.create).not.toHaveBeenCalled();
}

describe("ManufacturingWorkflowService.startRun binding validation", () => {
  it("persists every applicable new run step as READY rather than locking navigation", async () => {
    const { service, tx } = harness({ settingsMode: "GENERAL" });
    const createdRun = {
      id: "run-created",
      tenantId: user.tenantId,
      companyId: user.companyId,
      workspaceId: user.workspaceId,
      workflowDefinitionId: "mwf-a-k-v2",
      workflowDefinitionVersion: 2,
      productionPlanId: null,
      productionOrderId: null,
      productId: "product-1",
      manufacturingMode: "GENERAL",
      status: "DRAFT",
      currentGroup: "B",
      currentStepSerial: 8,
      version: 1,
      startedAt: new Date("2026-08-31T00:00:00.000Z"),
      completedAt: null,
      closedAt: null,
    };
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "mwf-a-k-v2", version: 2 }])
      .mockResolvedValueOnce([createdRun]);
    const hydrated = { id: createdRun.id, navigation: "READY" };
    const subject = service as unknown as {
      hydrateRun(db: unknown, selectedRun: unknown): Promise<unknown>;
    };
    const hydrateRun = vi
      .spyOn(subject, "hydrateRun")
      .mockResolvedValue(hydrated);

    await expect(
      service.startRun(
        user,
        startDto({
          productId: "product-1",
          startedAt: "2026-08-31T00:00:00.000Z",
        }),
      ),
    ).resolves.toBe(hydrated);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const stepInsert = tx.$executeRaw.mock.calls[1]?.[0];
    expect(sqlText(stepInsert)).toContain(
      "ELSE 'READY'::\"ManufacturingWorkflowStepStatus\"",
    );
    expect(sqlText(stepInsert)).not.toContain(
      "THEN 'LOCKED'::\"ManufacturingWorkflowStepStatus\"",
    );
    expect(sqlText(stepInsert)).not.toContain(
      "ELSE 'LOCKED'::\"ManufacturingWorkflowStepStatus\"",
    );
    expect(sqlText(stepInsert)).not.toContain('ANY(sd."allowedModes")');
    expect(renderedSql(stepInsert)).toContain(
      'WHEN sd."flowSerial" = 11 THEN CASE WHEN false THEN \'READY\'::"ManufacturingWorkflowStepStatus" ELSE \'N_A\'::"ManufacturingWorkflowStepStatus" END',
    );
    expect(renderedSql(stepInsert)).toContain(
      "Electronic signatures are disabled in manufacturing settings.",
    );
    expect(hydrateRun).toHaveBeenCalledWith(tx, createdRun);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "MANUFACTURING_RUN_STARTED",
        entityId: expect.any(String),
      }),
    });
  });

  it("rejects a new operational run without an order, approved plan, or configured product binding", async () => {
    const { service, tx } = harness({ settingsMode: "GENERAL" });

    await expect(service.startRun(user, startDto({}))).rejects.toThrow(
      /must be linked to a valid production order, approved production plan, or configured manufactured product/i,
    );

    expectNoRunPersistence(tx);
  });

  it("rejects a supplied plan that is not the production order's plan", async () => {
    const { service, tx } = harness({
      plan: { id: "plan-supplied", finishedProductId: "product-1" },
      order: {
        id: "order-1",
        finishedProductId: "product-1",
        planId: "plan-order",
        type: "ASSEMBLY",
      },
    });

    await expect(
      service.startRun(
        user,
        startDto({
          productionPlanId: "plan-supplied",
          productionOrderId: "order-1",
        }),
      ),
    ).rejects.toThrow(
      "The supplied production plan does not match the production order's plan.",
    );

    expect(tx.manufacturingSettings.findUnique).not.toHaveBeenCalled();
    expectNoRunPersistence(tx);
  });

  it("rejects a draft plan as the only operational binding", async () => {
    const { service, tx } = harness({
      plan: {
        id: "plan-draft",
        finishedProductId: "product-1",
        status: "DRAFT",
      },
    });

    await expect(
      service.startRun(user, startDto({ productionPlanId: "plan-draft" })),
    ).rejects.toThrow(/requires an approved, released, or in-progress plan/i);

    expect(tx.inventoryItem.findFirst).not.toHaveBeenCalled();
    expectNoRunPersistence(tx);
  });

  it("rejects a closed production order as a new run binding", async () => {
    const { service, tx } = harness({
      order: {
        id: "order-closed",
        finishedProductId: "product-1",
        planId: null,
        type: "ASSEMBLY",
        status: "CLOSED",
      },
    });

    await expect(
      service.startRun(user, startDto({ productionOrderId: "order-closed" })),
    ).rejects.toThrow(/completed, closed, and cancelled orders cannot start/i);

    expect(tx.inventoryItem.findFirst).not.toHaveBeenCalled();
    expectNoRunPersistence(tx);
  });

  it("rejects a product-only run until the product has an approved BOM", async () => {
    const { service, tx } = harness({
      product: {
        id: "product-1",
        kind: "PRODUCT",
        status: "ACTIVE",
        manufacturingProfile: {
          isActive: true,
          role: "FINISHED_GOOD",
          makeBuy: "MAKE",
        },
        manufacturingBoms: [],
      },
    });

    await expect(
      service.startRun(user, startDto({ productId: "product-1" })),
    ).rejects.toThrow(/requires an active approved BOM version/i);

    expectNoRunPersistence(tx);
  });

  it("compares product-only BOM effective dates with the UTC run day so effective-to is inclusive", async () => {
    const { service, tx } = harness({ settingsMode: "HYBRID" });

    await expect(
      service.startRun(
        user,
        startDto({
          productId: "product-1",
          startedAt: "2026-08-31T23:59:59.999-12:00",
        }),
      ),
    ).rejects.toThrow(
      /HYBRID manufacturing run must be linked to a production order/i,
    );

    const productQuery = tx.inventoryItem.findFirst.mock.calls[0]![0] as {
      select: {
        manufacturingBoms: {
          select: {
            versions: {
              where: {
                AND: [
                  { OR: [unknown, { effectiveFrom: { lte: Date } }] },
                  { OR: [unknown, { effectiveTo: { gte: Date } }] },
                ];
              };
            };
          };
        };
      };
    };
    const effectiveFilters =
      productQuery.select.manufacturingBoms.select.versions.where.AND;
    expect(effectiveFilters[0].OR[1].effectiveFrom.lte).toEqual(
      new Date("2026-08-31T00:00:00.000Z"),
    );
    expect(effectiveFilters[1].OR[1].effectiveTo.gte).toEqual(
      new Date("2026-08-31T00:00:00.000Z"),
    );
    expectNoRunPersistence(tx);
  });

  it("requires an order to select the operational branch in HYBRID mode", async () => {
    const { service, tx } = harness({ settingsMode: "HYBRID" });

    await expect(
      service.startRun(user, startDto({ productId: "product-1" })),
    ).rejects.toThrow(
      /HYBRID manufacturing run must be linked to a production order/i,
    );

    expect(tx.inventoryItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.manufacturingSettings.findUnique).toHaveBeenCalledTimes(1);
    expectNoRunPersistence(tx);
  });

  it("rejects an order and its plan when they reference different products", async () => {
    const { service, tx } = harness({
      plan: { id: "plan-order", finishedProductId: "product-from-plan" },
      order: {
        id: "order-1",
        finishedProductId: "product-from-order",
        planId: "plan-order",
        type: "ASSEMBLY",
      },
    });

    await expect(
      service.startRun(user, startDto({ productionOrderId: "order-1" })),
    ).rejects.toThrow(
      "The production order and production plan reference different finished products.",
    );

    expect(tx.inventoryItem.findFirst).not.toHaveBeenCalled();
    expect(tx.manufacturingSettings.findUnique).not.toHaveBeenCalled();
    expectNoRunPersistence(tx);
  });

  it("rejects a supplied product that does not match the production order", async () => {
    const { service, tx } = harness({
      order: {
        id: "order-1",
        finishedProductId: "product-from-order",
        planId: null,
        type: "ASSEMBLY",
      },
    });

    await expect(
      service.startRun(
        user,
        startDto({
          productionOrderId: "order-1",
          productId: "different-product",
        }),
      ),
    ).rejects.toThrow(
      "The supplied manufactured product does not match the production order.",
    );

    expect(tx.inventoryItem.findFirst).not.toHaveBeenCalled();
    expect(tx.manufacturingSettings.findUnique).not.toHaveBeenCalled();
    expectNoRunPersistence(tx);
  });

  it.each(["PACKAGING", "REWORK", "REPROCESSING"] as const)(
    "rejects %s as an unsupported primary production-order type",
    async (orderType) => {
      const { service, tx } = harness({
        order: {
          id: "order-1",
          finishedProductId: "product-1",
          planId: null,
          type: orderType,
        },
      });

      await expect(
        service.startRun(user, startDto({ productionOrderId: "order-1" })),
      ).rejects.toThrow(
        `Production order type ${orderType} cannot be the primary order of an A-to-K manufacturing run.`,
      );

      expect(tx.inventoryItem.findFirst).not.toHaveBeenCalled();
      expect(tx.manufacturingSettings.findUnique).not.toHaveBeenCalled();
      expectNoRunPersistence(tx);
    },
  );

  it("keeps the saved company mode authoritative for an order-bound run", async () => {
    const { service, tx, manufacturing } = harness({
      settingsMode: "GENERAL",
      order: {
        id: "order-1",
        finishedProductId: "product-1",
        planId: null,
        type: "ASSEMBLY",
      },
    });

    await expect(
      service.startRun(
        user,
        startDto({
          productionOrderId: "order-1",
          manufacturingMode: "HYBRID",
        }),
      ),
    ).rejects.toThrow(
      /requested HYBRID mode does not match the company's saved GENERAL manufacturing mode/i,
    );

    expect(manufacturing.getReadiness).not.toHaveBeenCalled();
    expectNoRunPersistence(tx);
  });

  it("rejects a product-only mode override when saved settings exist", async () => {
    const { service, tx } = harness({ settingsMode: "GENERAL" });

    await expect(
      service.startRun(
        user,
        startDto({
          productId: "product-1",
          manufacturingMode: "PHARMACEUTICAL",
        }),
      ),
    ).rejects.toThrow(
      /requested PHARMACEUTICAL mode does not match the company's saved GENERAL manufacturing mode/i,
    );

    expectNoRunPersistence(tx);
  });

  it.each([
    ["ASSEMBLY", "PHARMACEUTICAL"],
    ["PHARMACEUTICAL", "GENERAL"],
  ] as const)(
    "rejects a %s order in %s manufacturing mode",
    async (orderType, manufacturingMode) => {
      const { service, tx } = harness({
        settingsMode: manufacturingMode,
        order: {
          id: "order-1",
          finishedProductId: "product-1",
          planId: null,
          type: orderType,
        },
      });

      await expect(
        service.startRun(
          user,
          startDto({
            productionOrderId: "order-1",
            manufacturingMode,
          }),
        ),
      ).rejects.toThrow(
        `Production order type ${orderType} is incompatible with ${manufacturingMode} manufacturing mode.`,
      );

      expect(tx.inventoryItem.findFirst).toHaveBeenCalledTimes(1);
      expect(tx.manufacturingSettings.findUnique).toHaveBeenCalledTimes(1);
      expectNoRunPersistence(tx);
    },
  );

  it("rejects an order-bound run when overall manufacturing readiness is blocked", async () => {
    const { service, tx, manufacturing } = harness({
      order: {
        id: "order-1",
        finishedProductId: "product-1",
        planId: null,
        type: "ASSEMBLY",
      },
      readiness: {
        ready: false,
        checks: [
          {
            state: "BLOCKED",
            label: "Inventory ledgers",
            message: "Map the required inventory ledgers.",
          },
        ],
      },
    });

    await expect(
      service.startRun(user, startDto({ productionOrderId: "order-1" })),
    ).rejects.toThrow(
      /Manufacturing readiness is incomplete.*Map the required inventory ledgers/i,
    );

    expect(manufacturing.getReadiness).toHaveBeenCalledWith(
      user,
      "workspace-1",
    );
    expectNoRunPersistence(tx);
  });

  it("requires the pinned order routing and every lot-operation execution", async () => {
    const missingRouting = harness({
      order: {
        id: "order-no-routing",
        finishedProductId: "product-1",
        planId: null,
        type: "ASSEMBLY",
        routingVersion: null,
      },
    });
    await expect(
      missingRouting.service.startRun(
        user,
        startDto({ productionOrderId: "order-no-routing" }),
      ),
    ).rejects.toThrow(/pinned approved or retired routing version/i);
    expectNoRunPersistence(missingRouting.tx);

    const missingExecution = harness({
      order: {
        id: "order-no-execution",
        finishedProductId: "product-1",
        planId: null,
        type: "ASSEMBLY",
        operationExecutions: [],
      },
    });
    await expect(
      missingExecution.service.startRun(
        user,
        startDto({ productionOrderId: "order-no-execution" }),
      ),
    ).rejects.toThrow(
      /missing one or more lot-specific routing operation executions/i,
    );
    expectNoRunPersistence(missingExecution.tx);
  });

  it("materializes SUBCONTRACT as the READY and applicable primary order branch", async () => {
    const { service, tx } = harness({
      order: {
        id: "order-subcontract",
        finishedProductId: "product-1",
        planId: null,
        type: "SUBCONTRACT",
        routingVersion: {
          status: "RETIRED",
          operations: [{ id: "operation-1" }],
        },
      },
    });
    const createdRun = persistedRun({
      productionOrderId: "order-subcontract",
    });
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "mwf-a-k-v2", version: 2 }])
      .mockResolvedValueOnce([createdRun]);
    vi.spyOn(
      service as unknown as {
        hydrateRun(database: unknown, run: unknown): Promise<unknown>;
      },
      "hydrateRun",
    ).mockResolvedValue({ id: createdRun.id });

    await service.startRun(
      user,
      startDto({ productionOrderId: "order-subcontract" }),
    );

    const stepInsert = renderedSql(tx.$executeRaw.mock.calls[1]?.[0]);
    expect(stepInsert).toContain(
      'WHEN sd."flowSerial" = 52 THEN \'READY\'::"ManufacturingWorkflowStepStatus"',
    );
    expect(stepInsert).toContain('WHEN sd."flowSerial" = 52 THEN true');
  });

  it("prevents a second nonterminal workflow run for the same production order", async () => {
    const { service, tx } = harness({
      order: {
        id: "order-1",
        finishedProductId: "product-1",
        planId: null,
        type: "ASSEMBLY",
      },
    });
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "run-already-active", status: "PLANNED" }]);

    await expect(
      service.startRun(
        user,
        startDto({
          productionOrderId: "order-1",
          idempotencyKey: "different-request",
        }),
      ),
    ).rejects.toThrow(
      /already has active manufacturing workflow run run-already-active/i,
    );

    expect(sqlText(tx.$queryRaw.mock.calls[1]?.[0])).toContain(
      "NOT IN ('CLOSED', 'CANCELLED', 'PERIOD_LOCKED')",
    );
    expectNoRunPersistence(tx);
  });

  it("materializes electronic-signature control only when an effective policy is required", async () => {
    const { service, tx } = harness({ electronicSignatureRequired: true });
    const createdRun = persistedRun();
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "mwf-a-k-v2", version: 2 }])
      .mockResolvedValueOnce([createdRun]);
    vi.spyOn(
      service as unknown as {
        hydrateRun(database: unknown, run: unknown): Promise<unknown>;
      },
      "hydrateRun",
    ).mockResolvedValue({ id: createdRun.id });

    await service.startRun(
      user,
      startDto({
        productId: "product-1",
        startedAt: "2026-08-31T23:59:59.999-12:00",
      }),
    );

    const policyQuery = tx.manufacturingControlRecord.findFirst.mock
      .calls[0]![0] as {
      where: {
        AND: [
          { OR: [unknown, { effectiveFrom: { lte: Date } }] },
          { OR: [unknown, { effectiveTo: { gte: Date } }] },
        ];
      };
    };
    expect(policyQuery.where.AND[0].OR[1].effectiveFrom.lte).toEqual(
      new Date("2026-08-31T00:00:00.000Z"),
    );
    expect(policyQuery.where.AND[1].OR[1].effectiveTo.gte).toEqual(
      new Date("2026-08-31T00:00:00.000Z"),
    );
    const stepInsert = renderedSql(tx.$executeRaw.mock.calls[1]?.[0]);
    expect(stepInsert).toContain(
      "WHEN sd.\"flowSerial\" = 11 THEN CASE WHEN true THEN 'READY'",
    );
    expect(stepInsert).toContain('WHEN sd."flowSerial" = 11 THEN true');
  });

  it("auto-marks the packaging branch N/A without packaging components", async () => {
    const { service, tx } = harness({});
    const createdRun = persistedRun();
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "mwf-a-k-v2", version: 2 }])
      .mockResolvedValueOnce([createdRun]);
    vi.spyOn(
      service as unknown as {
        hydrateRun(database: unknown, run: unknown): Promise<unknown>;
      },
      "hydrateRun",
    ).mockResolvedValue({ id: createdRun.id });

    await service.startRun(user, startDto({ productId: "product-1" }));

    expect(tx.account.findFirst).not.toHaveBeenCalled();
    expect(tx.manufacturingDocumentSequence.findFirst).not.toHaveBeenCalled();
    const stepInsert = renderedSql(tx.$executeRaw.mock.calls[1]?.[0]);
    expect(stepInsert).toContain(
      "sd.\"flowSerial\" BETWEEN 108 AND 120 AND NOT false THEN 'N_A'",
    );
    expect(stepInsert).toContain(
      "The bound BOM has no required packaging-material component.",
    );
  });

  it("requires a valid packaging ledger and numbering sequence when the bound BOM has packaging material", async () => {
    const { service, tx } = harness({
      packagingLedger: null,
      product: {
        id: "product-1",
        kind: "PRODUCT",
        status: "ACTIVE",
        manufacturingProfile: {
          isActive: true,
          role: "FINISHED_GOOD",
          makeBuy: "MAKE",
        },
        manufacturingBoms: [
          {
            versions: [
              {
                id: "bom-version-approved",
                components: [
                  {
                    inventoryItem: {
                      manufacturingProfile: {
                        isActive: true,
                        role: "PACKAGING_MATERIAL",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    await expect(
      service.startRun(user, startDto({ productId: "product-1" })),
    ).rejects.toThrow(/active ASSET LEDGER account/i);

    expect(tx.account.findFirst).toHaveBeenCalledWith({
      where: {
        id: "packaging-ledger-1",
        companyId: "company-1",
        level: "LEDGER",
        status: "ACTIVE",
        nature: "ASSET",
      },
      select: { id: true },
    });
    expect(tx.manufacturingDocumentSequence.findFirst).not.toHaveBeenCalled();
    expectNoRunPersistence(tx);
  });

  it("requires active PACKAGING_ORDER numbering after the packaging ledger passes", async () => {
    const { service, tx } = harness({
      packagingSequence: null,
      product: {
        id: "product-1",
        kind: "PRODUCT",
        status: "ACTIVE",
        manufacturingProfile: {
          isActive: true,
          role: "FINISHED_GOOD",
          makeBuy: "MAKE",
        },
        manufacturingBoms: [
          {
            versions: [
              {
                id: "bom-version-approved",
                components: [
                  {
                    inventoryItem: {
                      manufacturingProfile: {
                        isActive: true,
                        role: "PACKAGING_MATERIAL",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    await expect(
      service.startRun(user, startDto({ productId: "product-1" })),
    ).rejects.toThrow(/active PACKAGING_ORDER document sequence/i);

    expect(tx.account.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.manufacturingDocumentSequence.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        documentKind: "PACKAGING_ORDER",
        isActive: true,
      },
      select: { id: true },
    });
    expectNoRunPersistence(tx);
  });
});
