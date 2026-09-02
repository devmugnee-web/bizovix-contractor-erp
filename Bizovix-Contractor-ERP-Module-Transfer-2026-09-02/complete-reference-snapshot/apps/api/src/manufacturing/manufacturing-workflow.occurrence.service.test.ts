import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { PermissionsService } from "../common/services/permissions.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import type { CreateManufacturingRunStepOccurrenceDto } from "./manufacturing-workflow.dto.js";
import { ManufacturingWorkflowService } from "./manufacturing-workflow.service.js";

const currentUser: AuthenticatedRequestUser = {
  id: "user-1",
  email: "operator@example.com",
  name: "Operator",
  initials: "OP",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

const run = {
  id: "run-1",
  tenantId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  workflowDefinitionId: "mwf-a-k-v1",
  workflowDefinitionVersion: 1,
  productionPlanId: "plan-1",
  productionOrderId: "order-1",
  productId: "product-1",
  manufacturingMode: "GENERAL" as const,
  status: "MATERIAL_READY",
  currentGroup: "F",
  currentStepSerial: 62,
  version: 4,
  startedAt: new Date("2026-08-30T00:00:00.000Z"),
  completedAt: null,
  closedAt: null,
};

function workflowStep(
  overrides: Partial<ReturnType<typeof workflowStepBase>> = {},
) {
  return { ...workflowStepBase(), ...overrides };
}

function workflowStepBase() {
  return {
    id: "run-step-70-primary",
    runId: run.id,
    stepDefinitionId: "mwfs-a-k-v1-070",
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
    flowSerial: 70,
    legacyStepCode: "05.12",
    flowGroupCode: "F",
    flowGroupName: "Raw Material Quality & Material Preparation",
    title: "Material Issue",
    route: "/app/manufacturing/dashboard?view=material-issue",
    postingEffect: "INVENTORY_AND_GL",
    permissionKey: "manufacturing.inventory.post",
    completionRule: { kind: "DOMAIN_POSTING", requiredStatus: "POSTED" },
    applicabilityType: "REQUIRED",
    stepType: "POSTING",
    repeatable: true,
    isBlocking: true,
  };
}

type WorkflowStep = ReturnType<typeof workflowStep>;

type Dependency = {
  stepFlowSerial: number;
  prerequisiteFlowSerial: number;
  requiredStatus: string;
  dependencyType: string;
  conditionExpression: unknown;
};

type WorkflowTestHooks = {
  createStepOccurrence(
    user: AuthenticatedRequestUser,
    runId: string,
    stepId: string,
    dto: CreateManufacturingRunStepOccurrenceDto,
  ): Promise<unknown>;
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
  runStepSelector(stepId: string): unknown;
  runSteps(db: unknown, runId: string): Promise<WorkflowStep[]>;
  dependencies(
    db: unknown,
    workflowDefinitionId: string,
  ): Promise<Dependency[]>;
  missingDependencies(
    step: WorkflowStep,
    steps: WorkflowStep[],
    dependencies: Dependency[],
  ): Array<{
    flowSerial: number;
    occurrenceKey: string;
    actualStatus: string;
  }>;
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

function occurrenceHarness(grantedKeys = ["manufacturing.inventory.post"]) {
  const queryRaw = vi.fn();
  const executeRaw = vi.fn().mockResolvedValue(1);
  const auditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
  const tx = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    auditLog: { create: auditCreate },
  };
  const workspaceFindFirst = vi.fn().mockResolvedValue({
    id: run.workspaceId,
    tenantId: run.tenantId,
    companyId: run.companyId,
  });
  const transaction = vi.fn(
    async (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
      callback(tx),
  );
  const prisma = {
    workspace: { findFirst: workspaceFindFirst },
    $transaction: transaction,
  };
  const getGrantedKeys = vi.fn().mockResolvedValue(new Set(grantedKeys));
  const service = new ManufacturingWorkflowService(
    prisma as unknown as PrismaService,
    { getGrantedKeys } as unknown as PermissionsService,
    {} as ManufacturingElectronicSignatureService,
  );
  const subject = service as unknown as WorkflowTestHooks;
  const assertRunInScope = vi
    .spyOn(subject, "assertRunInScope")
    .mockResolvedValue(run);
  const hydratedRun = { id: run.id, occurrenceContract: "hydrated" };
  const hydrateRun = vi
    .spyOn(subject, "hydrateRun")
    .mockResolvedValue(hydratedRun);
  const refreshRun = vi
    .spyOn(subject, "refreshRun")
    .mockResolvedValue(undefined);

  return {
    subject,
    tx,
    queryRaw,
    executeRaw,
    auditCreate,
    transaction,
    workspaceFindFirst,
    getGrantedKeys,
    assertRunInScope,
    hydrateRun,
    refreshRun,
    hydratedRun,
  };
}

describe("ManufacturingWorkflowService repeatable occurrences", () => {
  it("rejects a cross-workspace request before opening a transaction", async () => {
    const harness = occurrenceHarness();

    await expect(
      harness.subject.createStepOccurrence(currentUser, run.id, "70", {
        workspaceId: "workspace-other",
        occurrenceKey: "LOT-02",
      }),
    ).rejects.toThrow(/cross-workspace manufacturing access/i);

    expect(harness.workspaceFindFirst).not.toHaveBeenCalled();
    expect(harness.transaction).not.toHaveBeenCalled();
    expect(harness.getGrantedKeys).not.toHaveBeenCalled();
  });

  it("requires the selected step's exact dynamic permission", async () => {
    const harness = occurrenceHarness(["manufacturing.view"]);
    const selectedStep = workflowStep({
      permissionKey: "manufacturing.inventory.post",
    });
    harness.queryRaw.mockResolvedValueOnce([selectedStep]);

    await expect(
      harness.subject.createStepOccurrence(currentUser, run.id, "70", {
        workspaceId: run.workspaceId,
        occurrenceKey: "LOT-02",
      }),
    ).rejects.toThrow(/permission required: manufacturing\.inventory\.post/i);

    expect(harness.getGrantedKeys).toHaveBeenCalledWith(currentUser);
    expect(harness.queryRaw).toHaveBeenCalledTimes(1);
    expect(harness.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects PRIMARY in any casing without opening an occurrence transaction", async () => {
    const harness = occurrenceHarness();

    await expect(
      harness.subject.createStepOccurrence(currentUser, run.id, "70", {
        workspaceId: run.workspaceId,
        occurrenceKey: "  primary  ",
      }),
    ).rejects.toThrow(/PRIMARY is reserved/i);

    expect(harness.transaction).not.toHaveBeenCalled();
    expect(harness.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-repeatable step", async () => {
    const harness = occurrenceHarness();
    harness.queryRaw.mockResolvedValueOnce([
      workflowStep({ flowSerial: 58, repeatable: false }),
    ]);

    await expect(
      harness.subject.createStepOccurrence(currentUser, run.id, "58", {
        workspaceId: run.workspaceId,
        occurrenceKey: "LOT-02",
      }),
    ).rejects.toThrow(/not repeatable/i);

    expect(harness.queryRaw).toHaveBeenCalledTimes(1);
    expect(harness.auditCreate).not.toHaveBeenCalled();
    expect(harness.refreshRun).not.toHaveBeenCalled();
  });

  it("rejects a repeatable step whose pinned PRIMARY occurrence is inapplicable", async () => {
    const harness = occurrenceHarness();
    harness.queryRaw
      .mockResolvedValueOnce([
        workflowStep({ applicable: false, status: "N_A" }),
      ])
      .mockResolvedValueOnce([]);

    await expect(
      harness.subject.createStepOccurrence(currentUser, run.id, "70", {
        workspaceId: run.workspaceId,
        occurrenceKey: "LOT-02",
      }),
    ).rejects.toThrow(/must be applicable and active/i);

    expect(harness.queryRaw).toHaveBeenCalledTimes(2);
    expect(harness.auditCreate).not.toHaveBeenCalled();
    expect(harness.refreshRun).not.toHaveBeenCalled();
  });

  it("creates a trimmed repeatable occurrence as READY, audits it, refreshes notifications, and returns the hydrated run", async () => {
    const harness = occurrenceHarness();
    const selectedStep = workflowStep();
    harness.queryRaw
      .mockResolvedValueOnce([selectedStep])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "run-step-70-lot-02" }]);

    await expect(
      harness.subject.createStepOccurrence(currentUser, run.id, "70", {
        workspaceId: run.workspaceId,
        occurrenceKey: "  LOT-02  ",
      }),
    ).resolves.toBe(harness.hydratedRun);

    expect(harness.queryRaw).toHaveBeenCalledTimes(3);
    const insert = harness.queryRaw.mock.calls[2]?.[0];
    expect(sqlText(insert)).toMatch(/INSERT INTO "ManufacturingRunStep"/);
    expect(sqlText(insert)).toContain(
      "'READY'::\"ManufacturingWorkflowStepStatus\"",
    );
    expect(sqlValues(insert)).toContain("LOT-02");
    expect(harness.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: run.tenantId,
        companyId: run.companyId,
        workspaceId: run.workspaceId,
        userId: currentUser.id,
        action: "MANUFACTURING_RUN_STEP_OCCURRENCE_CREATED",
        entityType: "MANUFACTURING_RUN_STEP",
        entityId: "run-step-70-lot-02",
        newValues: expect.objectContaining({
          runId: run.id,
          stepDefinitionId: selectedStep.stepDefinitionId,
          flowSerial: 70,
          occurrenceKey: "LOT-02",
          status: "READY",
        }),
      }),
    });
    expect(harness.refreshRun).toHaveBeenCalledWith(
      harness.tx,
      run,
      currentUser.id,
    );
    expect(harness.assertRunInScope).toHaveBeenNthCalledWith(
      2,
      harness.tx,
      run.id,
      run.workspaceId,
    );
    expect(harness.hydrateRun).toHaveBeenCalledWith(harness.tx, run);
  });

  it("returns the hydrated run idempotently for the same trimmed occurrence key without another insert, audit, or refresh", async () => {
    const harness = occurrenceHarness();
    harness.queryRaw
      .mockResolvedValueOnce([workflowStep()])
      .mockResolvedValueOnce([{ id: "run-step-70-lot-02" }]);

    await expect(
      harness.subject.createStepOccurrence(currentUser, run.id, "70", {
        workspaceId: run.workspaceId,
        occurrenceKey: "  LOT-02  ",
      }),
    ).resolves.toBe(harness.hydratedRun);

    expect(harness.queryRaw).toHaveBeenCalledTimes(2);
    expect(
      harness.queryRaw.mock.calls.some(([query]) =>
        /INSERT INTO "ManufacturingRunStep"/.test(sqlText(query)),
      ),
    ).toBe(false);
    expect(harness.auditCreate).not.toHaveBeenCalled();
    expect(harness.refreshRun).not.toHaveBeenCalled();
    expect(harness.assertRunInScope).toHaveBeenCalledTimes(1);
    expect(harness.hydrateRun).toHaveBeenCalledWith(harness.tx, run);
  });

  it("resolves serial and legacy selectors to PRIMARY, while a row ID selects that exact occurrence", () => {
    const harness = occurrenceHarness();

    const serial = harness.subject.runStepSelector("70");
    expect(sqlText(serial)).toContain('sd."flowSerial" =');
    expect(sqlText(serial)).toContain("rs.\"occurrenceKey\" = 'PRIMARY'");
    expect(sqlValues(serial)).toEqual([70]);

    const legacy = harness.subject.runStepSelector("05.12");
    expect(sqlText(legacy)).toContain('sd."legacyStepCode" =');
    expect(sqlText(legacy)).toContain("rs.\"occurrenceKey\" = 'PRIMARY'");
    expect(sqlValues(legacy)).toEqual(["05.12"]);

    const exact = harness.subject.runStepSelector("run-step-70-lot-02");
    expect(sqlText(exact)).toContain('rs."id" =');
    expect(sqlText(exact)).not.toContain("occurrenceKey");
    expect(sqlValues(exact)).toEqual(["run-step-70-lot-02"]);
  });

  it("reports every incomplete applicable prerequisite occurrence without locking navigation", () => {
    const harness = occurrenceHarness();
    const incompleteLot = workflowStep({
      id: "run-step-60-lot-02",
      stepDefinitionId: "mwfs-a-k-v1-060",
      occurrenceKey: "LOT-02",
      flowSerial: 60,
      status: "READY",
      postingEffect: "NONE",
      completionRule: {
        kind: "DOMAIN_COMPLETION",
        requiredStatus: "COMPLETED",
      },
    });
    const completedPrimary = workflowStep({
      id: "run-step-60-primary",
      stepDefinitionId: "mwfs-a-k-v1-060",
      occurrenceKey: "PRIMARY",
      flowSerial: 60,
      status: "COMPLETED",
      postingEffect: "NONE",
      completionRule: {
        kind: "DOMAIN_COMPLETION",
        requiredStatus: "COMPLETED",
      },
    });
    const dependent = workflowStep({
      id: "run-step-61-primary",
      stepDefinitionId: "mwfs-a-k-v1-061",
      occurrenceKey: "PRIMARY",
      flowSerial: 61,
      status: "BLOCKED",
      postingEffect: "NONE",
      completionRule: {
        kind: "DOMAIN_COMPLETION",
        requiredStatus: "COMPLETED",
      },
    });
    const dependencies: Dependency[] = [
      {
        stepFlowSerial: 61,
        prerequisiteFlowSerial: 60,
        requiredStatus: "COMPLETED",
        dependencyType: "HARD",
        conditionExpression: null,
      },
    ];

    expect(
      harness.subject.missingDependencies(
        dependent,
        [incompleteLot, completedPrimary, dependent],
        dependencies,
      ),
    ).toEqual([
      expect.objectContaining({
        flowSerial: 60,
        occurrenceKey: "LOT-02",
        actualStatus: "READY",
      }),
    ]);

    expect(
      harness.subject.missingDependencies(
        dependent,
        [
          { ...incompleteLot, applicable: false, status: "N_A" },
          completedPrimary,
          dependent,
        ],
        dependencies,
      ),
    ).toEqual([
      expect.objectContaining({
        flowSerial: 60,
        occurrenceKey: "LOT-02",
        actualStatus: "N_A",
      }),
    ]);

    expect(
      harness.subject.missingDependencies(
        dependent,
        [
          {
            ...incompleteLot,
            applicable: false,
            status: "N_A",
            naReason: "This lot occurrence is not applicable to the run.",
          },
          completedPrimary,
          dependent,
        ],
        dependencies,
      ),
    ).toEqual([]);
  });

  it("refreshes legacy dependency states to READY and records the exact prerequisite advisory", async () => {
    const harness = occurrenceHarness();
    harness.refreshRun.mockRestore();
    const prerequisite = workflowStep({
      id: "run-step-70-lot-02",
      occurrenceKey: "LOT-02",
      status: "READY",
    });
    const dependent = workflowStep({
      id: "run-step-71-primary",
      stepDefinitionId: "mwfs-a-k-v1-071",
      flowSerial: 71,
      legacyStepCode: "05.13",
      title: "Material Return",
      status: "BLOCKED",
      postingEffect: "NONE",
      completionRule: {
        kind: "DOMAIN_COMPLETION",
        requiredStatus: "COMPLETED",
      },
    });
    const steps = [prerequisite, dependent];
    const dependencies: Dependency[] = [
      {
        stepFlowSerial: 71,
        prerequisiteFlowSerial: 70,
        requiredStatus: "POSTED",
        dependencyType: "HARD",
        conditionExpression: null,
      },
    ];
    vi.spyOn(harness.subject, "runSteps").mockResolvedValue(steps);
    vi.spyOn(harness.subject, "dependencies").mockResolvedValue(dependencies);

    await harness.subject.refreshRun(harness.tx, run, currentUser.id);

    const stepUpdate = harness.executeRaw.mock.calls.find(([query]) =>
      /UPDATE "ManufacturingRunStep"/.test(sqlText(query)),
    )?.[0];
    expect(stepUpdate).toBeDefined();
    expect(sqlValues(stepUpdate)).toContain("READY");
    expect(sqlValues(stepUpdate)).toContain(
      "Before approval, completion or posting, finish 70. Material Issue [LOT-02].",
    );
    expect(sqlValues(stepUpdate)).not.toContain("LOCKED");
    expect(sqlValues(stepUpdate)).not.toContain("BLOCKED");
    expect(dependent).toMatchObject({
      status: "READY",
      blockerReason:
        "Before approval, completion or posting, finish 70. Material Issue [LOT-02].",
    });
  });

  it("does not advance the run milestone while another applicable occurrence of that milestone step is incomplete", async () => {
    const harness = occurrenceHarness();
    harness.refreshRun.mockRestore();
    const materialReady = workflowStep({
      id: "run-step-62-primary",
      stepDefinitionId: "mwfs-a-k-v1-062",
      occurrenceKey: "PRIMARY",
      flowSerial: 62,
      status: "COMPLETED",
      postingEffect: "NONE",
      completionRule: {
        kind: "DOMAIN_COMPLETION",
        requiredStatus: "COMPLETED",
      },
    });
    const postedPrimary = workflowStep({ status: "POSTED" });
    const incompleteLot = workflowStep({
      id: "run-step-70-lot-02",
      occurrenceKey: "LOT-02",
      status: "READY",
    });
    const steps = [materialReady, postedPrimary, incompleteLot];
    vi.spyOn(harness.subject, "runSteps").mockResolvedValue(steps);
    vi.spyOn(harness.subject, "dependencies").mockResolvedValue([]);
    harness.auditCreate.mockClear();

    await harness.subject.refreshRun(harness.tx, run, currentUser.id);

    const runUpdate = harness.executeRaw.mock.calls.at(-1)?.[0];
    expect(sqlText(runUpdate)).toMatch(/UPDATE "ManufacturingRun"/);
    expect(sqlValues(runUpdate)).toContain("MATERIAL_READY");
    expect(sqlValues(runUpdate)).not.toContain("ISSUED");
    expect(harness.auditCreate).not.toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "MANUFACTURING_RUN_STATUS_CHANGED",
        newValues: expect.objectContaining({ status: "ISSUED" }),
      }),
    });
  });
});
