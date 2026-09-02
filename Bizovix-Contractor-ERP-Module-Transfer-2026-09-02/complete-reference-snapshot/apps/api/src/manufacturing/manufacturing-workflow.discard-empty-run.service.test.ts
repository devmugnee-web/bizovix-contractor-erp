import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { PermissionsService } from "../common/services/permissions.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
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

function run(
  overrides: Partial<{
    status: string;
    version: number;
    productionPlanId: string | null;
    productionOrderId: string | null;
    productId: string | null;
  }> = {},
) {
  return {
    id: "run-empty",
    tenantId: user.tenantId,
    companyId: user.companyId,
    workspaceId: user.workspaceId,
    workflowDefinitionId: "mwf-a-k-v1",
    workflowDefinitionVersion: 1,
    productionPlanId: null,
    productionOrderId: null,
    productId: null,
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

function harness(selectedRun = run()) {
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([selectedRun])
      .mockResolvedValueOnce([{ hasActivity: false }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    auditLog: { create: vi.fn() },
  };
  const prisma = {
    workspace: {
      findFirst: vi.fn().mockResolvedValue({
        id: user.workspaceId,
        tenantId: user.tenantId,
        companyId: user.companyId,
      }),
    },
    $transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };
  return {
    tx,
    service: new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
      {} as ManufacturingElectronicSignatureService,
    ),
  };
}

describe("ManufacturingWorkflowService.discardEmptyRun", () => {
  it("cancels only an untouched unbound draft and records an audit reason", async () => {
    const { service, tx } = harness();

    const result = await service.discardEmptyRun(user, "run-empty", {
      workspaceId: user.workspaceId!,
      expectedVersion: 1,
      reason: "Created before selecting a production document.",
    });

    expect(result).toMatchObject({
      id: "run-empty",
      status: "CANCELLED",
      version: 2,
      nextAction: {
        state: "COMPLETE",
        step: null,
        blockerReason: "This empty manufacturing run was discarded.",
      },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "MANUFACTURING_EMPTY_RUN_DISCARDED",
        entityId: "run-empty",
        newValues: expect.objectContaining({
          status: "CANCELLED",
          emptyRun: true,
          reason: "Created before selecting a production document.",
        }),
      }),
    });
  });

  it("does not discard a run that is bound to a product, plan, or order", async () => {
    const { service, tx } = harness(run({ productId: "product-1" }));

    await expect(
      service.discardEmptyRun(user, "run-empty", {
        workspaceId: user.workspaceId!,
        reason: "Discard bound run",
      }),
    ).rejects.toThrow(/only an unbound manufacturing run/i);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("does not discard an unbound run after any workflow or posting activity", async () => {
    const { service, tx } = harness();
    tx.$queryRaw.mockReset();
    tx.$queryRaw
      .mockResolvedValueOnce([run()])
      .mockResolvedValueOnce([{ hasActivity: true }]);

    await expect(
      service.discardEmptyRun(user, "run-empty", {
        workspaceId: user.workspaceId!,
        reason: "Discard active run",
      }),
    ).rejects.toThrow(/has workflow activity or posting evidence/i);

    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects a stale run version before cancellation", async () => {
    const { service, tx } = harness(run({ version: 3 }));

    await expect(
      service.discardEmptyRun(user, "run-empty", {
        workspaceId: user.workspaceId!,
        expectedVersion: 2,
        reason: "Discard stale run",
      }),
    ).rejects.toThrow(/changed after it was loaded/i);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
