import { afterEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "../generated/prisma/index.js";
import {
  ManufacturingPlanningService,
  manufacturingPreflightLedgerReadiness,
} from "./manufacturing-planning.service.js";

const user = {
  id: "planner-1",
  tenantId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
} as never;

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function reviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "suggestion-1",
    tenantId: "tenant-1",
    companyId: "company-1",
    workspaceId: "workspace-1",
    planId: "plan-1",
    orderId: null,
    workflowGroup: "PLANNING_MRP",
    workflowCode: "SUGGESTED_PURCHASE_REQUISITION",
    entityType: "MANUFACTURING_SUPPLY_SUGGESTION",
    entityId: "suggestion-1",
    transactionDate: new Date("2026-09-05T00:00:00.000Z"),
    idempotencyKey: "create-suggestion-1",
    title: "MPR-0001",
    outcome: "EXECUTED",
    status: "PENDING",
    reason: "MRP shortage 10 pcs",
    note: null,
    evidence: {
      schemaVersion: 1,
      suggestionNumber: "MPR-0001",
      type: "PURCHASE_REQUISITION",
      mrpRunId: "mrp-1",
      mrpRunNumber: "MRP-0001",
      mrpRequirementId: "requirement-1",
      item: { id: "item-1", code: "RM-1", name: "Raw material" },
      requestedQuantity: "4",
      shortageQuantity: "10",
      unit: "pcs",
      requiredDate: "2026-09-10",
      sourceWarehouse: null,
      destinationWarehouse: {
        id: "warehouse-rm",
        code: "RM",
        name: "Raw Material Warehouse",
      },
      conversion: null,
    },
    signatureHash: null,
    reviewedByUserId: null,
    reviewedAt: null,
    approvedByUserId: null,
    approvedAt: null,
    createdByUserId: "planner-1",
    createdAt: new Date("2026-09-05T00:00:00.000Z"),
    updatedAt: new Date("2026-09-05T00:00:00.000Z"),
    createdBy: { id: "planner-1", name: "Planner" },
    approvedBy: null,
    ...overrides,
  };
}

function buildService(input?: {
  prisma?: Record<string, unknown>;
  approval?: Record<string, unknown>;
  inventory?: Record<string, unknown>;
}) {
  const prisma = {
    workspace: {
      findFirst: vi.fn().mockResolvedValue({
        id: "workspace-1",
        tenantId: "tenant-1",
        companyId: "company-1",
      }),
    },
    ...(input?.prisma ?? {}),
  };
  const permissions = {
    getGrantedKeys: vi
      .fn()
      .mockResolvedValue(
        new Set(["manufacturing.plan.manage", "warehouse.transfer"]),
      ),
  };
  const approval = input?.approval ?? { advance: vi.fn() };
  const inventory = input?.inventory ?? { createTransfer: vi.fn() };
  return {
    prisma,
    approval,
    inventory,
    service: new ManufacturingPlanningService(
      prisma as never,
      permissions as never,
      approval as never,
      inventory as never,
    ),
  };
}

describe("manufacturing preflight ledger ownership", () => {
  const settings = {
    rawMaterialInventoryAccountId: "inventory-control",
    packagingInventoryAccountId: "inventory-control",
    wipInventoryAccountId: "wip",
    finishedGoodsInventoryAccountId: "inventory-control",
    manufacturingVarianceAccountId: "variance",
    labourClearingAccountId: "labour",
    overheadAbsorptionAccountId: "overhead",
    scrapRecoveryAccountId: "inventory-control",
  };
  const ledger = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    code: id,
    level: "LEDGER",
    status: "ACTIVE",
    nature: "ASSET",
    isSystem: false,
    isControlAccount: false,
    ...overrides,
  });

  it("counts role mappings rather than requiring eight unique account rows", () => {
    const result = manufacturingPreflightLedgerReadiness(settings, [
      ledger("inventory-control", {
        code: "1210001",
        isSystem: true,
        isControlAccount: true,
      }),
      ledger("wip"),
      ledger("variance", { nature: "DIRECT_EXPENSE" }),
      ledger("labour", { nature: "DIRECT_EXPENSE" }),
      ledger("overhead", { nature: "INDIRECT_EXPENSE" }),
    ]);

    expect(result).toEqual({
      ready: true,
      validMappingCount: 8,
      requiredMappingCount: 8,
      message:
        "8/8 mappings are valid; server-owned stock roles use protected Inventory Control (1210001).",
    });
  });

  it("rejects a lookalike control account and a control-account WIP", () => {
    const lookalike = manufacturingPreflightLedgerReadiness(settings, [
      ledger("inventory-control", {
        code: "1210001",
        isSystem: false,
        isControlAccount: true,
      }),
    ]);
    expect(lookalike.ready).toBe(false);
    expect(lookalike.message).toContain("missing or inactive");

    const controlWip = manufacturingPreflightLedgerReadiness(settings, [
      ledger("inventory-control", {
        code: "1210001",
        isSystem: true,
        isControlAccount: true,
      }),
      ledger("wip", { isControlAccount: true }),
      ledger("variance"),
      ledger("labour"),
      ledger("overhead"),
    ]);
    expect(controlWip.ready).toBe(false);
    expect(controlWip.message).toContain("WIP must use a distinct");
  });

  it("rejects control accounts from manual manufacturing mappings", () => {
    const result = manufacturingPreflightLedgerReadiness(settings, [
      ledger("inventory-control", {
        code: "1210001",
        isSystem: true,
        isControlAccount: true,
      }),
      ledger("wip"),
      ledger("variance", { isControlAccount: true }),
      ledger("labour"),
      ledger("overhead"),
    ]);

    expect(result.ready).toBe(false);
    expect(result.message).toContain("must use active non-control ledgers");
  });
});

function routingVersionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "routing-version-2",
    routingId: "routing-1",
    versionNumber: 2,
    status: "DRAFT",
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
    changeReason: "Controlled routing update",
    approvedByUserId: null,
    approvedAt: null,
    retiredAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    approvedBy: null,
    routing: {
      id: "routing-1",
      code: "ROUTE-001",
      createdByUserId: "planner-1",
    },
    operations: [
      {
        id: "routing-operation-1",
        sequence: 1,
        code: "MIX",
        name: "Mix",
        workCenterCode: "WC-01",
        productionLineCode: null,
        setupMinutes: decimal(10),
        runMinutesPerUnit: decimal(2),
        queueMinutes: decimal(0),
        isSubcontracted: false,
        qcRequired: true,
        instructions: null,
        responsibleUserId: "planner-1",
        resourceRequirements: [
          {
            id: "resource-requirement-1",
            resourceId: "resource-1",
            requiredUnits: 1,
            capacityMultiplier: decimal(1),
            isMandatory: true,
            note: null,
            resource: {
              id: "resource-1",
              code: "MIXER-01",
              name: "Mixer 01",
              kind: "MACHINE",
              isActive: true,
              qualificationState: "QUALIFIED",
              calibrationState: "VALID",
              maintenanceState: "AVAILABLE",
              cleaningState: "CLEAN",
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

function buildRoutingApprovalService(
  version: ReturnType<typeof routingVersionRow>,
) {
  const approval = {
    advance: vi.fn().mockResolvedValue({
      complete: false,
      replayed: false,
      requiredApprovals: 2,
      completedApprovals: 1,
      remainingApprovals: 1,
      status: "PENDING",
    }),
  };
  const tx = {
    manufacturingRoutingVersion: {
      findFirst: vi.fn().mockResolvedValue(version),
      findUnique: vi.fn().mockResolvedValue(version),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    workspaceMember: { count: vi.fn().mockResolvedValue(1) },
  };
  const transaction = vi.fn(
    async (operation: (value: typeof tx) => Promise<unknown>) => operation(tx),
  );
  const built = buildService({
    prisma: {
      manufacturingWorkflowReview: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: transaction,
    },
    approval,
  });
  return { ...built, tx, transaction };
}

describe("manufacturing MRP supply suggestions", () => {
  it("creates a persisted purchase-requisition suggestion only from a real shortage", async () => {
    const created = reviewRow();
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      manufacturingWorkflowReview: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(created),
      },
      manufacturingMrpRequirement: {
        findFirst: vi.fn().mockResolvedValue({
          id: "requirement-1",
          inventoryItemId: "item-1",
          warehouseId: "warehouse-rm",
          requiredDate: new Date("2026-09-10T00:00:00.000Z"),
          unit: "pcs",
          shortageQuantity: decimal("10"),
          inventoryItem: {
            id: "item-1",
            itemCode: "RM-1",
            itemName: "Raw material",
            unit: "pcs",
            alternateUnit: null,
            alternateUnitConversion: null,
          },
          mrpRun: {
            id: "mrp-1",
            runNumber: "MRP-0001",
            planId: "plan-1",
            plan: { planNumber: "PLAN-0001" },
          },
        }),
      },
      warehouse: {
        findFirst: vi.fn().mockResolvedValue({
          id: "warehouse-rm",
          code: "RM",
          name: "Raw Material Warehouse",
          type: "RAW_MATERIAL",
          allowMaterialIssue: true,
        }),
      },
    };
    const { service } = buildService({
      prisma: {
        $transaction: vi.fn(
          async (operation: (value: typeof tx) => Promise<unknown>) =>
            operation(tx),
        ),
      },
    });

    const result = await service.createSupplySuggestion(user, {
      workspaceId: "workspace-1",
      mrpRequirementId: "requirement-1",
      type: "PURCHASE_REQUISITION",
      requestedQuantity: 4,
      destinationWarehouseId: "warehouse-rm",
      transactionDate: "2026-09-05",
      idempotencyKey: "create-suggestion-1",
      note: "Actual shortage hand-off",
    });

    expect(result).toMatchObject({
      type: "PURCHASE_REQUISITION",
      status: "PENDING",
      requestedQuantity: 4,
      shortageQuantity: 10,
    });
    expect(tx.manufacturingWorkflowReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "MANUFACTURING_SUPPLY_SUGGESTION",
          workflowCode: "SUGGESTED_PURCHASE_REQUISITION",
          status: "PENDING",
        }),
      }),
    );
  });

  it("does not let open suggestions exceed the persisted MRP shortage", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      manufacturingWorkflowReview: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([
          {
            evidence: {
              mrpRequirementId: "requirement-1",
              requestedQuantity: "8",
            },
          },
        ]),
      },
      manufacturingMrpRequirement: {
        findFirst: vi.fn().mockResolvedValue({
          id: "requirement-1",
          inventoryItemId: "item-1",
          warehouseId: "warehouse-rm",
          requiredDate: new Date("2026-09-10T00:00:00.000Z"),
          unit: "pcs",
          shortageQuantity: decimal("10"),
          inventoryItem: {
            id: "item-1",
            itemCode: "RM-1",
            itemName: "Raw material",
            unit: "pcs",
            alternateUnit: null,
            alternateUnitConversion: null,
          },
          mrpRun: {
            id: "mrp-1",
            runNumber: "MRP-0001",
            planId: "plan-1",
            plan: { planNumber: "PLAN-0001" },
          },
        }),
      },
    };
    const { service } = buildService({
      prisma: {
        $transaction: vi.fn(
          async (operation: (value: typeof tx) => Promise<unknown>) =>
            operation(tx),
        ),
      },
    });

    await expect(
      service.createSupplySuggestion(user, {
        workspaceId: "workspace-1",
        mrpRequirementId: "requirement-1",
        type: "PURCHASE_REQUISITION",
        requestedQuantity: 3,
        transactionDate: "2026-09-05",
        idempotencyKey: "over-suggest",
      }),
    ).rejects.toThrow("Remaining unsuggested quantity: 2 pcs");
  });

  it("maps converted suggestions and their real warehouse-transfer link", async () => {
    const converted = reviewRow({
      status: "APPROVED",
      workflowCode: "SUGGESTED_STOCK_TRANSFER",
      evidence: {
        ...reviewRow().evidence,
        type: "STOCK_TRANSFER",
        conversion: {
          convertedAt: "2026-09-06T00:00:00.000Z",
          warehouseTransferId: "transfer-1",
          externalReference: "MST-0001",
        },
      },
    });
    const { service } = buildService({
      prisma: {
        manufacturingWorkflowReview: {
          findMany: vi.fn().mockResolvedValue([converted]),
        },
        warehouseTransfer: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { id: "transfer-1", transferNo: "MST-0001", status: "POSTED" },
            ]),
        },
      },
    });

    await expect(
      service.listSupplySuggestions(user, {
        workspaceId: "workspace-1",
        status: "CONVERTED",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        status: "CONVERTED",
        warehouseTransfer: {
          id: "transfer-1",
          transferNo: "MST-0001",
          status: "POSTED",
        },
      }),
    ]);
  });

  it("uses the controlled maker-checker workflow before approving a suggestion", async () => {
    const pending = reviewRow();
    const approved = reviewRow({
      status: "APPROVED",
      approvedByUserId: "approver-1",
      approvedAt: new Date("2026-09-06T00:00:00.000Z"),
      approvedBy: { id: "approver-1", name: "Approver" },
    });
    const tx = {
      manufacturingWorkflowReview: {
        findFirst: vi.fn().mockResolvedValue(pending),
        update: vi.fn().mockResolvedValue(approved),
      },
    };
    const advance = vi.fn().mockResolvedValue({
      totalStages: 1,
      completedStages: 1,
      nextStage: null,
      complete: true,
      replayed: false,
    });
    const { service } = buildService({
      prisma: {
        $transaction: vi.fn(
          async (operation: (value: typeof tx) => Promise<unknown>) =>
            operation(tx),
        ),
      },
      approval: { advance },
    });

    const result = await service.approveSupplySuggestion(
      {
        id: "approver-1",
        tenantId: "tenant-1",
        companyId: "company-1",
        workspaceId: "workspace-1",
      } as never,
      "suggestion-1",
      {
        workspaceId: "workspace-1",
        transactionDate: "2026-09-06",
        idempotencyKey: "approve-suggestion-1",
        signatureMeaning: "Approved for purchasing",
      },
    );

    expect(result).toMatchObject({ status: "APPROVED", replayed: false });
    expect(advance).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        workflowScope: "SUPPLY_SUGGESTION",
        fallbackPermissionKey: "manufacturing.plan.manage",
        makerUserId: "planner-1",
      }),
    );
  });

  it("converts an approved purchase suggestion only with a real downstream reference", async () => {
    const approved = reviewRow({
      status: "APPROVED",
      approvedByUserId: "approver-1",
      approvedAt: new Date("2026-09-06T00:00:00.000Z"),
      approvedBy: { id: "approver-1", name: "Approver" },
    });
    const reviewStore = {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(approved),
      create: vi.fn().mockResolvedValue({ id: "conversion-review" }),
      update: vi
        .fn()
        .mockImplementation(
          ({ data }: { data: { evidence: Record<string, unknown> } }) =>
            Promise.resolve(
              reviewRow({
                status: "APPROVED",
                evidence: data.evidence,
                approvedByUserId: "approver-1",
                approvedAt: new Date("2026-09-06T00:00:00.000Z"),
                approvedBy: { id: "approver-1", name: "Approver" },
              }),
            ),
        ),
    };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      manufacturingWorkflowReview: reviewStore,
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    };
    const { service } = buildService({
      prisma: {
        manufacturingWorkflowReview: reviewStore,
        $transaction: vi.fn(
          async (operation: (value: typeof tx) => Promise<unknown>) =>
            operation(tx),
        ),
      },
    });

    await expect(
      service.convertSupplySuggestion(user, "suggestion-1", {
        workspaceId: "workspace-1",
        transactionDate: "2026-09-06",
        idempotencyKey: "convert-suggestion-without-reference",
      }),
    ).rejects.toThrow("real downstream purchase-requisition reference");

    const result = await service.convertSupplySuggestion(user, "suggestion-1", {
      workspaceId: "workspace-1",
      transactionDate: "2026-09-06",
      idempotencyKey: "convert-suggestion-1",
      externalReference: "PR-2026-0042",
      expectedReceiptDate: "2026-09-09",
    });

    expect(result).toMatchObject({
      status: "CONVERTED",
      externalReference: "PR-2026-0042",
      expectedReceiptDate: "2026-09-09",
      replayed: false,
    });
    expect(reviewStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowCode: "SUPPLY_SUGGESTION_CONVERT",
        }),
      }),
    );
  });

  it("counts only posted future inbound transfers as scheduled receipts", async () => {
    const { service } = buildService();
    const transferLines = {
      findMany: vi.fn().mockResolvedValue([
        { inventoryItemId: "item-1", quantity: decimal("2.5") },
        { inventoryItemId: "item-1", quantity: decimal("1.5") },
        { inventoryItemId: "item-2", quantity: decimal("3") },
      ]),
    };
    const receipts = await (
      service as unknown as {
        confirmedScheduledReceipts: (
          db: unknown,
          workspaceId: string,
          warehouseId: string,
          itemIds: string[],
          asOf: Date,
          requiredDate: Date,
        ) => Promise<Map<string, Prisma.Decimal>>;
      }
    ).confirmedScheduledReceipts(
      { warehouseTransferLine: transferLines },
      "workspace-1",
      "warehouse-rm",
      ["item-1", "item-2"],
      new Date("2026-09-05T00:00:00.000Z"),
      new Date("2026-09-10T00:00:00.000Z"),
    );

    expect(receipts.get("item-1")?.toString()).toBe("4");
    expect(receipts.get("item-2")?.toString()).toBe("3");
    expect(transferLines.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          transfer: expect.objectContaining({ status: "POSTED" }),
        }),
      }),
    );
  });
});

describe("manufacturing routing version approval effective dates", () => {
  afterEach(() => vi.useRealTimers());

  function approvalInput(transactionDate: string) {
    return {
      workspaceId: "workspace-1",
      idempotencyKey: `approve-routing-${transactionDate}`,
      transactionDate,
      note: "Approve controlled routing",
    };
  }

  it("rejects a future approval transaction date before opening a workflow", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T15:30:00.000Z"));
    const { service, approval, transaction } =
      buildRoutingApprovalService(routingVersionRow());

    await expect(
      service.approveRoutingVersion(
        user,
        "routing-version-2",
        approvalInput("2026-09-11"),
      ),
    ).rejects.toThrow("transaction date cannot be in the future");

    expect(transaction).not.toHaveBeenCalled();
    expect(approval.advance).not.toHaveBeenCalled();
  });

  it("rejects a future-effective version without retiring the usable routing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T15:30:00.000Z"));
    const { service, approval, tx } = buildRoutingApprovalService(
      routingVersionRow({
        effectiveFrom: new Date("2026-09-11T00:00:00.000Z"),
        effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
      }),
    );

    await expect(
      service.approveRoutingVersion(
        user,
        "routing-version-2",
        approvalInput("2026-09-10"),
      ),
    ).rejects.toThrow("Scheduled activation is not available");

    expect(approval.advance).not.toHaveBeenCalled();
    expect(tx.manufacturingRoutingVersion.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an expired version even when the transaction date was in range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T15:30:00.000Z"));
    const { service, approval, tx } = buildRoutingApprovalService(
      routingVersionRow({
        effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-09-09T00:00:00.000Z"),
      }),
    );

    await expect(
      service.approveRoutingVersion(
        user,
        "routing-version-2",
        approvalInput("2026-09-09"),
      ),
    ).rejects.toThrow("Scheduled activation is not available");

    expect(approval.advance).not.toHaveBeenCalled();
    expect(tx.manufacturingRoutingVersion.updateMany).not.toHaveBeenCalled();
  });

  it("requires the approval transaction business date to be inside the period", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T15:30:00.000Z"));
    const { service, approval, tx } = buildRoutingApprovalService(
      routingVersionRow({
        effectiveFrom: new Date("2026-09-05T00:00:00.000Z"),
        effectiveTo: new Date("2026-09-15T00:00:00.000Z"),
      }),
    );

    await expect(
      service.approveRoutingVersion(
        user,
        "routing-version-2",
        approvalInput("2026-09-04"),
      ),
    ).rejects.toThrow("must fall within the routing version effective period");

    expect(approval.advance).not.toHaveBeenCalled();
    expect(tx.manufacturingRoutingVersion.updateMany).not.toHaveBeenCalled();
  });

  it("treats the effective-to final UTC business day as inclusive", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T23:59:59.999Z"));
    const { service, approval, tx } = buildRoutingApprovalService(
      routingVersionRow({
        effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
      }),
    );

    const result = await service.approveRoutingVersion(
      user,
      "routing-version-2",
      approvalInput("2026-09-30T00:00:00.000Z"),
    );

    expect(result).toMatchObject({
      replayed: false,
      version: { id: "routing-version-2", status: "DRAFT" },
    });
    expect(approval.advance).toHaveBeenCalledOnce();
    expect(tx.manufacturingRoutingVersion.updateMany).not.toHaveBeenCalled();
  });
});

describe("manufacturing production-plan master validity", () => {
  const planInput = {
    workspaceId: "workspace-1",
    idempotencyKey: "create-plan-master-validity",
    finishedProductId: "finished-1",
    bomVersionId: "bom-version-1",
    routingVersionId: "routing-version-1",
    plannedQuantity: 10,
    unit: "pcs",
    plannedStartDate: "2026-09-10T23:59:59.999Z",
    plannedEndDate: "2026-09-11",
    lots: [
      {
        lotNumber: "LOT-1",
        sequence: 1,
        plannedQuantity: 10,
      },
    ],
  };

  function planService(options?: {
    bomEffectiveFrom?: Date | null;
    bomEffectiveTo?: Date | null;
    routingEffectiveFrom?: Date | null;
    routingEffectiveTo?: Date | null;
    routingOperations?: Array<{ id: string }>;
  }) {
    return buildService({
      prisma: {
        manufacturingPlan: { findFirst: vi.fn().mockResolvedValue(null) },
        inventoryItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: "finished-1",
            itemCode: "FG-1",
            itemName: "Finished product",
            unit: "pcs",
            kind: "PRODUCT",
            status: "ACTIVE",
          }),
        },
        manufacturingBomVersion: {
          findFirst: vi.fn().mockResolvedValue({
            id: "bom-version-1",
            outputUnit: "pcs",
            effectiveFrom: options?.bomEffectiveFrom ?? null,
            effectiveTo: options?.bomEffectiveTo ?? null,
          }),
        },
        manufacturingRoutingVersion: {
          findFirst: vi.fn().mockResolvedValue({
            id: "routing-version-1",
            effectiveFrom: options?.routingEffectiveFrom ?? null,
            effectiveTo: options?.routingEffectiveTo ?? null,
            operations: options?.routingOperations ?? [
              { id: "routing-operation-1" },
            ],
          }),
        },
      },
    });
  }

  it("requires the approved BOM to be effective on the plan start UTC day", async () => {
    const { service } = planService({
      bomEffectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      bomEffectiveTo: new Date("2026-09-09T00:00:00.000Z"),
    });

    await expect(service.createPlan(user, planInput)).rejects.toThrow(
      /BOM version must be effective on the production-plan start date/i,
    );
  });

  it("requires a selected routing to contain at least one operation", async () => {
    const { service } = planService({ routingOperations: [] });

    await expect(service.createPlan(user, planInput)).rejects.toThrow(
      /approved routing with at least one operation/i,
    );
  });

  it("requires the selected routing to be effective on the plan start UTC day", async () => {
    const { service } = planService({
      routingEffectiveFrom: new Date("2026-09-11T00:00:00.000Z"),
      routingEffectiveTo: new Date("2026-09-30T00:00:00.000Z"),
    });

    await expect(service.createPlan(user, planInput)).rejects.toThrow(
      /routing version must be effective on the production-plan start date/i,
    );
  });
});
