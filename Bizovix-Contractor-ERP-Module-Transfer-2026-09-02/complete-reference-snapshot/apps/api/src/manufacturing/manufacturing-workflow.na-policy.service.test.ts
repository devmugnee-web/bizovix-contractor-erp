import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { PermissionsService } from "../common/services/permissions.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import { ManufacturingWorkflowService } from "./manufacturing-workflow.service.js";

const currentUser: AuthenticatedRequestUser = {
  id: "maker-1",
  email: "maker@example.com",
  name: "Maker",
  initials: "MK",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

const run = {
  id: "run-1",
  tenantId: currentUser.tenantId,
  companyId: currentUser.companyId,
  workspaceId: currentUser.workspaceId!,
  workflowDefinitionId: "mwf-a-k-v1",
  workflowDefinitionVersion: 1,
  productionPlanId: "plan-1",
  productionOrderId: "order-1",
  productId: "product-1",
  manufacturingMode: "GENERAL" as const,
  status: "PLANNED",
  currentGroup: "B",
  currentStepSerial: 8,
  version: 1,
  startedAt: new Date("2026-08-30T00:00:00.000Z"),
  completedAt: null,
  closedAt: null,
};

function requiredNonPostingStep() {
  return {
    id: "run-step-8",
    runId: run.id,
    stepDefinitionId: "mwfs-a-k-v1-008",
    occurrenceKey: "PRIMARY",
    status: "READY",
    applicable: true,
    blockerReason: null,
    naReason: null as string | null,
    sourceRecordType: null,
    sourceRecordId: null,
    startedAt: null,
    completedAt: null,
    completedBy: null,
    approvedBy: null,
    signatureReference: null,
    version: 1,
    flowSerial: 8,
    legacyStepCode: "11.01",
    flowGroupCode: "B",
    flowGroupName: "Setup, Workflow & Security",
    flowGroupOrder: 2,
    title: "Manufacturing Settings",
    route:
      "/app/manufacturing/dashboard?section=setup&view=manufacturing-settings",
    postingEffect: "NONE",
    permissionKey: "manufacturing.configure",
    completionRule: {
      kind: "DOMAIN_COMPLETION",
      requiredStatus: "COMPLETED",
    },
    applicabilityType: "REQUIRED",
    stepType: "CONTROL",
    repeatable: false,
    isBlocking: true,
  };
}

type WorkflowStep = ReturnType<typeof requiredNonPostingStep>;

type WorkflowTestHooks = {
  assertRunInScope(
    db: unknown,
    runId: string,
    workspaceId: string,
    lock?: boolean,
  ): Promise<typeof run>;
  hydrateRun(db: unknown, selectedRun: typeof run): Promise<unknown>;
  refreshRun(
    db: unknown,
    selectedRun: typeof run,
    performedByUserId: string,
  ): Promise<void>;
};

function sqlText(query: unknown) {
  const strings =
    (query as { strings?: readonly string[] } | null | undefined)?.strings ??
    [];
  return strings.join("?").replace(/\s+/g, " ").trim();
}

function sqlValues(query: unknown) {
  return (query as { values?: readonly unknown[] }).values ?? [];
}

function transitionHarness(
  step: WorkflowStep,
  settings = {
    approvalRequired: true,
    electronicSignatureRequired: true,
  },
  submitterUserId = "maker-other",
) {
  const queryRaw = vi
    .fn()
    .mockResolvedValueOnce([step])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([step])
    .mockResolvedValueOnce([{ performedByUserId: submitterUserId }]);
  const executeRaw = vi.fn().mockResolvedValue(1);
  const auditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
  const settingsFindUnique = vi.fn().mockResolvedValue(settings);
  const tx = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    auditLog: { create: auditCreate },
    manufacturingSettings: { findUnique: settingsFindUnique },
  };
  const transaction = vi.fn(
    async (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
      callback(tx),
  );
  const prisma = {
    workspace: {
      findFirst: vi.fn().mockResolvedValue({
        id: run.workspaceId,
        tenantId: run.tenantId,
        companyId: run.companyId,
      }),
    },
    $transaction: transaction,
  };
  const getGrantedKeys = vi
    .fn()
    .mockResolvedValue(new Set([step.permissionKey]));
  const enforce = vi.fn();
  const service = new ManufacturingWorkflowService(
    prisma as unknown as PrismaService,
    { getGrantedKeys } as unknown as PermissionsService,
    { enforce } as unknown as ManufacturingElectronicSignatureService,
  );
  const hooks = service as unknown as WorkflowTestHooks;
  const assertRunInScope = vi
    .spyOn(hooks, "assertRunInScope")
    .mockResolvedValue(run);
  const hydratedRun = { id: run.id, naPolicy: "hydrated" };
  const hydrateRun = vi
    .spyOn(hooks, "hydrateRun")
    .mockResolvedValue(hydratedRun);
  const refreshRun = vi.spyOn(hooks, "refreshRun").mockResolvedValue(undefined);

  return {
    service,
    tx,
    queryRaw,
    executeRaw,
    auditCreate,
    settingsFindUnique,
    transaction,
    getGrantedKeys,
    enforce,
    assertRunInScope,
    hydrateRun,
    refreshRun,
    hydratedRun,
  };
}

describe("ManufacturingWorkflowService required-step N/A policy", () => {
  it("accepts required non-posting MARK_N_A with a real reason and follows approval settings", async () => {
    const step = requiredNonPostingStep();
    const harness = transitionHarness(step);
    const reason =
      "This control is not applicable to the documented run scope.";

    await expect(
      harness.service.transitionStep(currentUser, run.id, step.id, {
        workspaceId: run.workspaceId,
        idempotencyKey: "na-required-non-posting",
        action: "MARK_N_A",
        reason,
      }),
    ).resolves.toBe(harness.hydratedRun);

    expect(harness.settingsFindUnique).toHaveBeenCalledWith({
      where: { workspaceId: run.workspaceId },
      select: {
        approvalRequired: true,
        electronicSignatureRequired: true,
      },
    });
    expect(harness.executeRaw).toHaveBeenCalledTimes(2);
    const update = harness.executeRaw.mock.calls[0]?.[0];
    expect(sqlText(update)).toMatch(/UPDATE "ManufacturingRunStep"/);
    expect(sqlValues(update)).toEqual(
      expect.arrayContaining(["PENDING_APPROVAL", "MARK_N_A", reason]),
    );
    const transition = harness.executeRaw.mock.calls[1]?.[0];
    expect(sqlText(transition)).toMatch(
      /INSERT INTO "ManufacturingRunStepTransition"/,
    );
    expect(sqlValues(transition)).toEqual(
      expect.arrayContaining(["READY", "PENDING_APPROVAL", "MARK_N_A", reason]),
    );
    expect(harness.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "MANUFACTURING_RUN_STEP_MARK_N_A",
        entityId: step.id,
        oldValues: { status: "READY" },
        newValues: expect.objectContaining({
          status: "PENDING_APPROVAL",
          reason,
        }),
      }),
    });
    expect(harness.enforce).not.toHaveBeenCalled();
    expect(harness.refreshRun).toHaveBeenCalledWith(
      harness.tx,
      run,
      currentUser.id,
    );
  });

  it("approves N/A for a non-posting APPROVAL step without inventing a source record", async () => {
    const step = {
      ...requiredNonPostingStep(),
      id: "run-step-53",
      stepDefinitionId: "mwfs-a-k-v1-053",
      status: "PENDING_APPROVAL",
      naReason:
        "This approval activity is outside the documented company scope.",
      flowSerial: 53,
      legacyStepCode: "04.08",
      flowGroupCode: "E",
      flowGroupName: "Production Orders & Pre-Production Readiness",
      flowGroupOrder: 5,
      title: "Production Order Approvals",
      route:
        "/app/manufacturing/dashboard?section=orders&view=production-order-approvals",
      permissionKey: "manufacturing.order.approve",
      completionRule: {
        kind: "APPROVAL",
        requiredStatus: "APPROVED",
      },
      stepType: "APPROVAL",
    };
    const harness = transitionHarness(step);
    harness.enforce.mockResolvedValue({
      policyRecordId: "signature-policy-1",
      policyVersion: 3,
    });

    await expect(
      harness.service.transitionStep(currentUser, run.id, step.id, {
        workspaceId: run.workspaceId,
        idempotencyKey: "approve-na-approval-step",
        action: "APPROVE",
        signatureMeaning: "Not applicable approval",
      }),
    ).resolves.toBe(harness.hydratedRun);

    expect(harness.executeRaw).toHaveBeenCalledTimes(2);
    const update = harness.executeRaw.mock.calls[0]?.[0];
    expect(sqlValues(update)).toEqual(
      expect.arrayContaining(["N_A", "APPROVE"]),
    );
    expect(sqlValues(update)).not.toEqual(
      expect.arrayContaining(["MANUFACTURING_ORDER", "order-1"]),
    );
    expect(harness.enforce).toHaveBeenCalledWith(
      harness.tx,
      expect.objectContaining({
        actionLabel: expect.stringContaining("APPROVE step 53"),
        required: true,
      }),
    );
    expect(harness.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "MANUFACTURING_RUN_STEP_APPROVE",
        entityId: step.id,
        newValues: expect.objectContaining({
          status: "N_A",
          signatureReference: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    });
  });

  it("enforces maker-checker separation for final N/A approval", async () => {
    const step = {
      ...requiredNonPostingStep(),
      status: "PENDING_APPROVAL",
      naReason: "This step is not applicable to the approved company scope.",
      completionRule: {
        kind: "APPROVAL",
        requiredStatus: "APPROVED",
      },
      stepType: "APPROVAL",
    };
    const harness = transitionHarness(step, undefined, currentUser.id);

    await expect(
      harness.service.transitionStep(currentUser, run.id, step.id, {
        workspaceId: run.workspaceId,
        idempotencyKey: "self-approve-na-rejected",
        action: "APPROVE",
      }),
    ).rejects.toThrow(/prevents approving your own workflow submission/i);

    expect(harness.enforce).not.toHaveBeenCalled();
    expect(harness.executeRaw).not.toHaveBeenCalled();
    expect(harness.auditCreate).not.toHaveBeenCalled();
  });

  it("finalizes N/A immediately under a no-checker policy while still recording the reason", async () => {
    const step = requiredNonPostingStep();
    const harness = transitionHarness(step, {
      approvalRequired: false,
      electronicSignatureRequired: false,
    });
    harness.enforce.mockResolvedValue(null);
    const reason = "The approved company process does not use this step.";

    await expect(
      harness.service.transitionStep(currentUser, run.id, step.id, {
        workspaceId: run.workspaceId,
        idempotencyKey: "na-no-checker-policy",
        action: "MARK_N_A",
        reason,
      }),
    ).resolves.toBe(harness.hydratedRun);

    const update = harness.executeRaw.mock.calls[0]?.[0];
    expect(sqlValues(update)).toEqual(
      expect.arrayContaining(["N_A", "MARK_N_A", reason]),
    );
    expect(harness.enforce).toHaveBeenCalledWith(
      harness.tx,
      expect.objectContaining({ required: false }),
    );
  });

  it("rejects MARK_N_A for a step with a posting effect", async () => {
    const step = {
      ...requiredNonPostingStep(),
      id: "run-step-70",
      stepDefinitionId: "mwfs-a-k-v1-070",
      flowSerial: 70,
      legacyStepCode: "05.12",
      flowGroupCode: "F",
      flowGroupName: "Raw Material Quality & Material Preparation",
      flowGroupOrder: 6,
      title: "Material Issue",
      route:
        "/app/manufacturing/dashboard?section=materials&view=material-issue",
      postingEffect: "INVENTORY_AND_GL",
      permissionKey: "manufacturing.material.issue",
      completionRule: {
        kind: "DOMAIN_POSTING",
        requiredStatus: "POSTED",
      },
      stepType: "POSTING",
      repeatable: true,
    };
    const harness = transitionHarness(step);

    await expect(
      harness.service.transitionStep(currentUser, run.id, step.id, {
        workspaceId: run.workspaceId,
        idempotencyKey: "na-posting-rejected",
        action: "MARK_N_A",
        reason: "Attempt to bypass a posting step.",
      }),
    ).rejects.toThrow(
      /step that can post inventory or ledger entries cannot be marked Not Applicable/i,
    );

    expect(harness.executeRaw).not.toHaveBeenCalled();
    expect(harness.auditCreate).not.toHaveBeenCalled();
    expect(harness.refreshRun).not.toHaveBeenCalled();
  });

  it("rejects required non-posting MARK_N_A when the reason is missing", async () => {
    const step = requiredNonPostingStep();
    const harness = transitionHarness(step);

    await expect(
      harness.service.transitionStep(currentUser, run.id, step.id, {
        workspaceId: run.workspaceId,
        idempotencyKey: "na-missing-reason",
        action: "MARK_N_A",
      }),
    ).rejects.toThrow(
      /real reason is required before requesting Not Applicable approval/i,
    );

    expect(harness.executeRaw).not.toHaveBeenCalled();
    expect(harness.auditCreate).not.toHaveBeenCalled();
    expect(harness.refreshRun).not.toHaveBeenCalled();
  });
});
