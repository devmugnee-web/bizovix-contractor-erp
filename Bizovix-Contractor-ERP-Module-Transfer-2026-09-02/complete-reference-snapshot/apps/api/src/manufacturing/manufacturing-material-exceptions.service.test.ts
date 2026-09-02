import { describe, expect, it, vi } from "vitest";

import { ManufacturingMaterialExceptionsService } from "./manufacturing-material-exceptions.service.js";

const user = {
  id: "qa-user-1",
  name: "QA User",
  sessionId: "session-1",
  organizationId: "organization-1",
  tenantId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
} as never;

function input(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: "workspace-1",
    qualityCaseId: "quality-case-1",
    retestDueAt: "2026-10-01T00:00:00.000Z",
    transactionDate: "2026-08-30T00:00:00.000Z",
    reason: "Approved QA retest passed",
    idempotencyKey: "lot-retest-1",
    ...overrides,
  } as never;
}

function createHarness() {
  const lot = {
    id: "inventory-lot-1",
    lotNumber: "LOT-001",
    inventoryItemId: "item-1",
    manufacturedAt: new Date("2026-01-01T00:00:00.000Z"),
    retestDueAt: new Date("2026-08-29T00:00:00.000Z"),
    expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    availableQuantity: 10,
    holdQuantity: 0,
    rejectedQuantity: 0,
    updatedAt: new Date("2026-08-29T12:00:00.000Z"),
  };
  const qualityCase = {
    id: "quality-case-1",
    code: "QCC-001",
    payload: {
      details: {
        caseType: "CHANGE_CONTROL",
        state: "CLOSED",
        inventoryItemId: "item-1",
        sourceReference: "LOT-001",
      },
    },
    inventoryItemId: "item-1",
    createdByUserId: "quality-maker-1",
    approvedByUserId: "quality-checker-1",
    approvedAt: new Date("2026-08-29T00:00:00.000Z"),
  };
  const caseApproval = {
    id: "case-approval-1",
    workflowCode: "GOVERNANCE_RECORD_APPROVE",
    entityId: qualityCase.id,
    status: "APPROVED",
    approvedByUserId: qualityCase.approvedByUserId,
    signatureHash: "signed-case-hash",
  };
  const persistedActions: Array<Record<string, unknown>> = [];
  const tx = {
    manufacturingPeriod: { findUnique: vi.fn().mockResolvedValue(null) },
    manufacturingInventoryLot: {
      findFirst: vi.fn().mockResolvedValue(lot),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    manufacturingControlRecord: {
      findFirst: vi.fn().mockResolvedValue(qualityCase),
    },
    manufacturingWorkflowReview: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        if (where.workflowCode === "GOVERNANCE_RECORD_APPROVE")
          return Promise.resolve(caseApproval);
        if (where.workflowCode === "MATERIAL_LOT_RETEST_EXTENSION")
          return Promise.resolve(null);
        return Promise.resolve(null);
      }),
      create: vi.fn().mockImplementation(({ data }) => {
        const action = { id: "retest-action-1", ...data };
        persistedActions.push(action);
        return Promise.resolve(action);
      }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const prisma = {
    workspace: {
      findFirst: vi.fn().mockResolvedValue({
        id: "workspace-1",
        tenantId: "tenant-1",
        companyId: "company-1",
      }),
    },
    manufacturingPeriod: { findUnique: vi.fn().mockResolvedValue(null) },
    manufacturingWorkflowReview: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn(
      async (callback: (database: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };
  const permissions = {
    getGrantedKeys: vi
      .fn()
      .mockResolvedValue(new Set(["manufacturing.quality.manage"])),
  };
  const inventoryService = {
    reconcileMovingAverageLedger: vi.fn().mockResolvedValue(undefined),
  };
  const service = new ManufacturingMaterialExceptionsService(
    prisma as never,
    permissions as never,
    {} as never,
    inventoryService as never,
  );
  return {
    service,
    inventoryService,
    prisma,
    permissions,
    tx,
    lot,
    qualityCase,
    caseApproval,
    persistedActions,
  };
}

describe("manufacturing material destruction account safety", () => {
  it("requires the exact protected Inventory Control ledger on the stock side", async () => {
    const inventoryControl = {
      id: "inventory-control-1",
      code: "1210001",
      name: "Inventory Control",
      nature: "ASSET",
      isSystem: true,
      isControlAccount: true,
    };
    const findFirst = vi.fn().mockResolvedValue(inventoryControl);
    const service = new ManufacturingMaterialExceptionsService(
      {} as never,
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
        "Material inventory account",
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
    });
  });

  it("rejects wrong-nature, non-system or arbitrary control stock mappings", async () => {
    const service = new ManufacturingMaterialExceptionsService(
      {} as never,
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
        "wrong-stock-ledger",
        "Material inventory account",
      ),
    ).rejects.toThrow("protected Inventory Control ledger (1210001)");
  });
});

describe("manufacturing material lot retest service", () => {
  it("rejects a status transfer from an inactive or cross-company source location before mutating lot buckets", async () => {
    const create = vi.fn();
    const updateMany = vi.fn();
    const service = new ManufacturingMaterialExceptionsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      executeStatusTransfer: (...args: unknown[]) => Promise<unknown>;
    };
    const tx = {
      manufacturingInventoryLot: {
        findFirst: vi.fn().mockResolvedValue({
          id: "source-lot-1",
          warehouseId: "warehouse-1",
          locationId: "location-1",
          location: {
            id: "location-1",
            isActive: false,
            companyId: "other-company",
            workspaceId: "workspace-1",
            warehouseId: "warehouse-1",
            disposition: "RELEASED",
          },
          warehouse: {
            id: "warehouse-1",
            isActive: true,
            deletedAt: null,
            companyId: "company-1",
            workspaceId: "workspace-1",
            type: "RAW_MATERIAL",
          },
        }),
        create,
        updateMany,
      },
    };

    await expect(
      service.executeStatusTransfer(
        tx,
        {
          id: "workspace-1",
          tenantId: "tenant-1",
          companyId: "company-1",
        },
        user,
        "review-1",
        {
          inventoryLotId: "source-lot-1",
          destinationLocationId: "location-2",
          quantity: 1,
          orderId: "order-1",
        },
        new Date("2026-08-30T00:00:00.000Z"),
      ),
    ).rejects.toThrow(
      "active same-company manufacturing warehouse and controlled location",
    );
    expect(create).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("updates only retestDueAt and persists signed workflow and audit evidence", async () => {
    const harness = createHarness();
    const result = await harness.service.retestInventoryLot(
      user,
      harness.lot.id,
      input(),
    );

    expect(result.replayed).toBe(false);
    expect(result.lot).toEqual({
      id: harness.lot.id,
      retestDueAt: "2026-10-01T00:00:00.000Z",
    });
    expect(
      harness.tx.manufacturingInventoryLot.updateMany,
    ).toHaveBeenCalledWith({
      where: { id: harness.lot.id, updatedAt: harness.lot.updatedAt },
      data: { retestDueAt: new Date("2026-10-01T00:00:00.000Z") },
    });
    const update =
      harness.tx.manufacturingInventoryLot.updateMany.mock.calls[0]?.[0];
    expect(Object.keys(update.data)).toEqual(["retestDueAt"]);
    expect(harness.tx.manufacturingWorkflowReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowCode: "MATERIAL_LOT_RETEST_EXTENSION",
          entityId: harness.lot.id,
          entityType: `MATERIAL_LOT_RETEST_CASE:${harness.qualityCase.id}`,
          status: "APPROVED",
          signatureHash: expect.any(String),
          evidence: expect.objectContaining({
            inventoryLotId: harness.lot.id,
            previousRetestDueAt: "2026-08-29T00:00:00.000Z",
            retestDueAt: "2026-10-01T00:00:00.000Z",
            qualityCaseId: harness.qualityCase.id,
            qualityCaseApprovalReviewId: harness.caseApproval.id,
            qualityCaseSignatureHash: harness.caseApproval.signatureHash,
          }),
        }),
      }),
    );
    expect(harness.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "MANUFACTURING_MATERIAL_LOT_RETEST_EXTENSION",
        entityType: "ManufacturingInventoryLot",
        entityId: harness.lot.id,
        oldValues: { retestDueAt: "2026-08-29T00:00:00.000Z" },
        newValues: expect.objectContaining({
          retestDueAt: "2026-10-01T00:00:00.000Z",
          qualityCaseId: harness.qualityCase.id,
        }),
      }),
    });
  });

  it("replays the exact idempotent action without a second update or audit", async () => {
    const harness = createHarness();
    const dto = input();
    await harness.service.retestInventoryLot(user, harness.lot.id, dto);
    harness.prisma.manufacturingWorkflowReview.findUnique.mockResolvedValue(
      harness.persistedActions[0],
    );

    const replay = await harness.service.retestInventoryLot(
      user,
      harness.lot.id,
      dto,
    );

    expect(replay.replayed).toBe(true);
    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(
      harness.tx.manufacturingInventoryLot.updateMany,
    ).toHaveBeenCalledTimes(1);
    expect(harness.tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a CHANGE_CONTROL case linked to a different item", async () => {
    const harness = createHarness();
    harness.qualityCase.inventoryItemId = "item-2";
    harness.qualityCase.payload.details.inventoryItemId = "item-2";
    await expect(
      harness.service.retestInventoryLot(user, harness.lot.id, input()),
    ).rejects.toThrow("exact inventory item");
    expect(
      harness.tx.manufacturingInventoryLot.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("rejects a CHANGE_CONTROL source reference that is not the exact lot", async () => {
    const harness = createHarness();
    harness.qualityCase.payload.details.sourceReference = "OTHER-LOT";
    await expect(
      harness.service.retestInventoryLot(user, harness.lot.id, input()),
    ).rejects.toThrow("exactly equal this inventory-lot ID or lot number");
    expect(
      harness.tx.manufacturingInventoryLot.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("rejects an unapproved CHANGE_CONTROL record", async () => {
    const harness = createHarness();
    harness.tx.manufacturingControlRecord.findFirst.mockResolvedValue(null);
    await expect(
      harness.service.retestInventoryLot(user, harness.lot.id, input()),
    ).rejects.toThrow("approved CHANGE_CONTROL");
  });

  it("rejects a CHANGE_CONTROL without independent maker-checker approval", async () => {
    const harness = createHarness();
    harness.qualityCase.approvedByUserId = harness.qualityCase.createdByUserId;
    await expect(
      harness.service.retestInventoryLot(user, harness.lot.id, input()),
    ).rejects.toThrow("maker-checker approval evidence");
  });

  it("rejects a CHANGE_CONTROL without signed approval evidence", async () => {
    const harness = createHarness();
    harness.tx.manufacturingWorkflowReview.findFirst.mockImplementation(
      ({ where }) =>
        Promise.resolve(
          where.workflowCode === "GOVERNANCE_RECORD_APPROVE" ? null : null,
        ),
    );
    await expect(
      harness.service.retestInventoryLot(user, harness.lot.id, input()),
    ).rejects.toThrow("electronic-signature approval evidence");
  });

  it("rejects reuse of a quality case already consumed by another retest", async () => {
    const harness = createHarness();
    harness.tx.manufacturingWorkflowReview.findFirst.mockImplementation(
      ({ where }) =>
        Promise.resolve(
          where.workflowCode === "GOVERNANCE_RECORD_APPROVE"
            ? harness.caseApproval
            : { id: "existing-retest-action" },
        ),
    );
    await expect(
      harness.service.retestInventoryLot(user, harness.lot.id, input()),
    ).rejects.toThrow("already been consumed");
    expect(
      harness.tx.manufacturingInventoryLot.updateMany,
    ).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "not after action date",
      target: "2026-08-30T00:00:00.000Z",
      lot: {},
      error: "after the controlled action date",
    },
    {
      name: "not after manufacture date",
      target: "2026-09-01T00:00:00.000Z",
      lot: { manufacturedAt: new Date("2026-09-01T00:00:00.000Z") },
      error: "after the lot manufacture date",
    },
    {
      name: "past expiry date",
      target: "2027-01-01T00:00:00.000Z",
      lot: {},
      error: "cannot extend beyond the lot expiry date",
    },
    {
      name: "unchanged",
      target: "2026-09-30T00:00:00.000Z",
      lot: { retestDueAt: new Date("2026-09-30T00:00:00.000Z") },
      error: "must change the current controlled date",
    },
  ])("rejects a retest date $name", async ({ target, lot, error }) => {
    const harness = createHarness();
    Object.assign(harness.lot, lot);
    await expect(
      harness.service.retestInventoryLot(
        user,
        harness.lot.id,
        input({ retestDueAt: target }),
      ),
    ).rejects.toThrow(error);
    expect(
      harness.tx.manufacturingControlRecord.findFirst,
    ).not.toHaveBeenCalled();
    expect(
      harness.tx.manufacturingInventoryLot.updateMany,
    ).not.toHaveBeenCalled();
  });

  it("fails atomically when the optimistic inventory-lot update loses a race", async () => {
    const harness = createHarness();
    harness.tx.manufacturingInventoryLot.updateMany.mockResolvedValue({
      count: 0,
    });
    await expect(
      harness.service.retestInventoryLot(user, harness.lot.id, input()),
    ).rejects.toThrow("changed concurrently");
    expect(
      harness.tx.manufacturingWorkflowReview.create,
    ).not.toHaveBeenCalled();
    expect(harness.tx.auditLog.create).not.toHaveBeenCalled();
  });
});
