import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type {
  ManufacturingRunStepRecord,
  ManufacturingWorkflowStepDefinitionRecord,
  ManufacturingWorkflowStepStatus,
} from "@/types/manufacturing";

import {
  manufacturingWorkflowGroupStatusLabel,
  manufacturingWorkflowNavigationStatusLabel,
  manufacturingWorkflowStepUiActions,
  selectManufacturingRunStepForView,
} from "./manufacturing-control-center";

function runStep(
  status: ManufacturingWorkflowStepStatus,
  overrides: Partial<ManufacturingRunStepRecord> = {},
): ManufacturingRunStepRecord {
  return {
    id: "run-step-42",
    occurrenceKey: "PRIMARY",
    flowSerial: 42,
    legacyStepCode: "03.06",
    flowGroupCode: "D",
    title: "Production Plan",
    route: "/app/manufacturing/dashboard?section=planning&view=production-plan",
    status,
    applicable: true,
    blockerReason: null,
    naReason: null,
    postingEffect: "NONE",
    permissionKey: "manufacturing.plan.manage",
    completionRule: {
      kind: "DOMAIN_COMPLETION",
      requiredStatus: "COMPLETED",
    },
    applicabilityType: "REQUIRED",
    stepType: "OPERATIONAL",
    repeatable: false,
    isBlocking: true,
    sourceRecordType: null,
    sourceRecordId: null,
    startedAt: null,
    completedAt: null,
    completedBy: null,
    approvedBy: null,
    signatureReference: null,
    version: 3,
    prerequisites: [],
    missingPrerequisites: [],
    ...overrides,
  };
}

function definition(
  kind: "APPROVAL" | "DOMAIN_COMPLETION" | "DOMAIN_POSTING" | "OBSERVED",
  overrides: Partial<ManufacturingWorkflowStepDefinitionRecord> = {},
): ManufacturingWorkflowStepDefinitionRecord {
  return {
    id: "definition-step-42",
    legacyGroupCode: "03",
    legacyStepCode: "03.06",
    flowGroupCode: "D",
    flowGroupName: "Planning, MRP & Scheduling",
    flowGroupOrder: 4,
    flowSerial: 42,
    title: "Production Plan",
    displayOrder: 10,
    executionOrder: 42,
    stepType: kind === "APPROVAL" ? "APPROVAL" : "OPERATIONAL",
    applicabilityType: "REQUIRED",
    repeatable: false,
    postingEffect: kind === "DOMAIN_POSTING" ? "INVENTORY_ONLY" : "NONE",
    postingDescription: null,
    permissionKey: "manufacturing.plan.manage",
    route: "/app/manufacturing/dashboard?section=planning&view=production-plan",
    completionRule: {
      kind,
      requiredStatus:
        kind === "APPROVAL"
          ? "APPROVED"
          : kind === "DOMAIN_POSTING"
            ? "POSTED"
            : "COMPLETED",
    },
    allowedModes: ["GENERAL", "PHARMACEUTICAL", "HYBRID"],
    isBlocking: true,
    isActive: true,
    dependencies: [],
    ...overrides,
  };
}

describe("Manufacturing active-step workflow actions", () => {
  it("presents dependency locks as advisory attention without hiding real statuses", () => {
    expect(manufacturingWorkflowNavigationStatusLabel("LOCKED")).toBe(
      "NEEDS ATTENTION",
    );
    expect(manufacturingWorkflowNavigationStatusLabel("BLOCKED")).toBe(
      "NEEDS ATTENTION",
    );
    expect(manufacturingWorkflowNavigationStatusLabel("PENDING_APPROVAL")).toBe(
      "PENDING APPROVAL",
    );
  });

  it("separates group availability from actual completion", () => {
    expect(manufacturingWorkflowGroupStatusLabel("READY")).toBe("NOT STARTED");
    expect(manufacturingWorkflowGroupStatusLabel("LOCKED")).toBe("NEEDS SETUP");
    expect(manufacturingWorkflowGroupStatusLabel("BLOCKED")).toBe("NEEDS SETUP");
    expect(manufacturingWorkflowGroupStatusLabel("COMPLETED_WITH_NA")).toBe(
      "COMPLETED WITH NA",
    );
  });

  it("never falls back to PRIMARY for an explicit missing occurrence", () => {
    const primary = runStep("READY");
    const lotOne = runStep("READY", {
      id: "run-step-42-lot-01",
      occurrenceKey: "LOT-01",
    });

    const staleSelection = selectManufacturingRunStepForView({
      steps: [primary, lotOne],
      section: "planning",
      view: "production-plan",
      requestedOccurrenceKey: "LOT-02",
      catalogFlowSerial: 42,
    });

    expect(staleSelection).toBeNull();
    expect(staleSelection?.id).not.toBe(primary.id);
    expect(
      selectManufacturingRunStepForView({
        steps: [primary, lotOne],
        section: "planning",
        view: "production-plan",
        requestedOccurrenceKey: "LOT-01",
        catalogFlowSerial: 42,
      }),
    ).toBe(lotOne);
    expect(
      selectManufacturingRunStepForView({
        steps: [lotOne, primary],
        section: "planning",
        view: "production-plan",
        catalogFlowSerial: 42,
      }),
    ).toBe(primary);
  });

  it("hides every transition when the user lacks the step permission", () => {
    expect(
      manufacturingWorkflowStepUiActions({
        step: runStep("READY"),
        definition: definition("DOMAIN_COMPLETION"),
        hasPermission: false,
      }),
    ).toEqual([]);
  });

  it("keeps monitoring and report screens read-only", () => {
    for (const stepType of ["MONITORING", "REPORT"] as const) {
      expect(
        manufacturingWorkflowStepUiActions({
          step: runStep("READY", { stepType }),
          definition: definition("OBSERVED", { stepType }),
          hasPermission: true,
        }),
      ).toEqual([]);
      expect(
        manufacturingWorkflowStepUiActions({
          step: runStep("ON_HOLD", { stepType }),
          definition: definition("OBSERVED", { stepType }),
          hasPermission: true,
        }),
      ).toEqual([]);
    }
  });

  it("uses the approval lifecycle without offering a second completion", () => {
    const approvalDefinition = definition("APPROVAL");
    const approvalStep = runStep("READY", {
      completionRule: approvalDefinition.completionRule,
      stepType: "APPROVAL",
    });

    expect(
      manufacturingWorkflowStepUiActions({
        step: approvalStep,
        definition: approvalDefinition,
        hasPermission: true,
      }),
    ).toEqual(["SAVE_DRAFT", "SUBMIT", "MARK_N_A", "HOLD"]);
    expect(
      manufacturingWorkflowStepUiActions({
        step: { ...approvalStep, status: "PENDING_APPROVAL" },
        definition: approvalDefinition,
        hasPermission: true,
      }),
    ).toEqual(["APPROVE"]);
    expect(
      manufacturingWorkflowStepUiActions({
        step: { ...approvalStep, status: "APPROVED" },
        definition: approvalDefinition,
        hasPermission: true,
      }),
    ).toEqual([]);
  });

  it("keeps domain actions available so the click can request a persisted record link", () => {
    const postingDefinition = definition("DOMAIN_POSTING");
    const linkedStep = runStep("IN_PROGRESS", {
      postingEffect: "INVENTORY_AND_GL",
      completionRule: postingDefinition.completionRule,
      stepType: "POSTING",
      sourceRecordType: "ManufacturingProductionOrder",
      sourceRecordId: "order-1001",
    });

    expect(
      manufacturingWorkflowStepUiActions({
        step: runStep("IN_PROGRESS", {
          postingEffect: "INVENTORY_AND_GL",
          completionRule: postingDefinition.completionRule,
          stepType: "POSTING",
        }),
        definition: postingDefinition,
        hasPermission: true,
      }),
    ).toEqual(["SAVE_DRAFT", "BEGIN_POSTING", "HOLD"]);
    expect(
      manufacturingWorkflowStepUiActions({
        step: linkedStep,
        definition: postingDefinition,
        hasPermission: true,
      }),
    ).toEqual(["SAVE_DRAFT", "BEGIN_POSTING", "HOLD"]);
    expect(
      manufacturingWorkflowStepUiActions({
        step: { ...linkedStep, status: "POSTING" },
        definition: postingDefinition,
        hasPermission: true,
      }),
    ).toEqual(["CONFIRM_POSTED"]);
    expect(
      manufacturingWorkflowStepUiActions({
        step: { ...linkedStep, status: "POSTED" },
        definition: postingDefinition,
        hasPermission: true,
      }),
    ).toEqual(["COMPLETE"]);
    expect(
      manufacturingWorkflowStepUiActions({
        step: runStep("POSTED", {
          postingEffect: "INVENTORY_AND_GL",
          completionRule: postingDefinition.completionRule,
          stepType: "POSTING",
        }),
        definition: postingDefinition,
        hasPermission: true,
      }),
    ).toEqual(["COMPLETE"]);

    expect(
      manufacturingWorkflowStepUiActions({
        step: runStep("READY"),
        definition: definition("DOMAIN_COMPLETION"),
        hasPermission: true,
      }),
    ).toEqual(["START", "SAVE_DRAFT", "COMPLETE", "MARK_N_A", "HOLD"]);
  });

  it("offers N/A for operational non-posting steps and never for stock or GL posting", () => {
    const conditional = definition("DOMAIN_COMPLETION", {
      applicabilityType: "CONDITIONAL",
    });
    const modeSpecific = definition("DOMAIN_COMPLETION", {
      applicabilityType: "MODE_SPECIFIC",
    });

    expect(
      manufacturingWorkflowStepUiActions({
        step: runStep("READY", { applicabilityType: "CONDITIONAL" }),
        definition: conditional,
        hasPermission: true,
      }),
    ).toContain("MARK_N_A");
    expect(
      manufacturingWorkflowStepUiActions({
        step: runStep("READY", { applicabilityType: "MODE_SPECIFIC" }),
        definition: modeSpecific,
        hasPermission: true,
      }),
    ).toContain("MARK_N_A");
    expect(
      manufacturingWorkflowStepUiActions({
        step: runStep("READY"),
        definition: definition("DOMAIN_COMPLETION"),
        hasPermission: true,
      }),
    ).toContain("MARK_N_A");
    expect(
      manufacturingWorkflowStepUiActions({
        step: runStep("READY", {
          applicabilityType: "CONDITIONAL",
          postingEffect: "INVENTORY_ONLY",
        }),
        definition: definition("DOMAIN_POSTING", {
          applicabilityType: "CONDITIONAL",
        }),
        hasPermission: true,
      }),
    ).not.toContain("MARK_N_A");
  });

  it("keeps reversible work available but withholds irreversible actions while advice is unresolved", () => {
    const missingPrerequisite = {
      flowSerial: 41,
      occurrenceKey: "PRIMARY",
      title: "Approved production plan",
      requiredStatus: "COMPLETED" as const,
      actualStatus: "READY" as const,
      route:
        "/app/manufacturing/dashboard?section=planning&view=production-plan",
    };

    expect(
      manufacturingWorkflowStepUiActions({
        step: runStep("READY", {
          missingPrerequisites: [missingPrerequisite],
        }),
        definition: definition("DOMAIN_COMPLETION"),
        hasPermission: true,
      }),
    ).toEqual(["START", "SAVE_DRAFT", "MARK_N_A", "HOLD"]);
    expect(
      manufacturingWorkflowStepUiActions({
        step: runStep("IN_PROGRESS", {
          postingEffect: "INVENTORY_AND_GL",
          missingPrerequisites: [missingPrerequisite],
        }),
        definition: definition("DOMAIN_POSTING"),
        hasPermission: true,
      }),
    ).toEqual(["SAVE_DRAFT", "HOLD"]);
  });

  it("offers Resume for held work and nothing for terminal or N/A work", () => {
    const operationalDefinition = definition("DOMAIN_COMPLETION");

    expect(
      manufacturingWorkflowStepUiActions({
        step: runStep("ON_HOLD"),
        definition: operationalDefinition,
        hasPermission: true,
      }),
    ).toEqual(["RESUME"]);
    for (const status of ["COMPLETED", "CANCELLED", "CLOSED"] as const) {
      expect(
        manufacturingWorkflowStepUiActions({
          step: runStep(status),
          definition: operationalDefinition,
          hasPermission: true,
        }),
      ).toEqual([]);
    }
    expect(
      manufacturingWorkflowStepUiActions({
        step: runStep("N_A", { applicable: false }),
        definition: operationalDefinition,
        hasPermission: true,
      }),
    ).toEqual([]);
  });

  it("only activates an unapproved conditional or periodic N/A branch", () => {
    const conditional = definition("DOMAIN_COMPLETION", {
      applicabilityType: "CONDITIONAL",
    });
    const periodic = definition("OBSERVED", {
      applicabilityType: "PERIODIC",
    });
    const autoNaStep = runStep("N_A", { applicable: false });

    expect(
      manufacturingWorkflowStepUiActions({
        step: { ...autoNaStep, applicabilityType: "CONDITIONAL" },
        definition: conditional,
        hasPermission: true,
      }),
    ).toEqual(["TRIGGER"]);
    expect(
      manufacturingWorkflowStepUiActions({
        step: { ...autoNaStep, applicabilityType: "PERIODIC" },
        definition: periodic,
        hasPermission: true,
      }),
    ).toEqual(["TRIGGER"]);
    expect(
      manufacturingWorkflowStepUiActions({
        step: {
          ...autoNaStep,
          applicabilityType: "CONDITIONAL",
          approvedBy: "approver-user",
        },
        definition: conditional,
        hasPermission: true,
      }),
    ).toEqual([]);
  });

  it("uses pinned run metadata after the active catalog changes", () => {
    expect(
      manufacturingWorkflowStepUiActions({
        step: runStep("READY", {
          completionRule: {
            kind: "APPROVAL",
            requiredStatus: "APPROVED",
          },
          applicabilityType: "CONDITIONAL",
          stepType: "APPROVAL",
        }),
        definition: definition("DOMAIN_COMPLETION", {
          applicabilityType: "REQUIRED",
        }),
        hasPermission: true,
      }),
    ).toEqual(["SAVE_DRAFT", "SUBMIT", "MARK_N_A", "HOLD"]);
  });
});

describe("Manufacturing workflow transition UI contract", () => {
  it("sends concurrency/idempotency controls and renders related audit data", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/features/screens/manufacturing-control-center.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("expectedVersion: activeRunStep.version");
    expect(source).toContain("workflowStepIdempotencyKey(");
    expect(source).toContain("let sourceRecordType =");
    expect(source).toContain("let sourceRecordId =");
    expect(source).toContain("actionRequiresPersistedSource");
    expect(source).toContain("sourceRecordType,");
    expect(source).toContain("sourceRecordId,");
    expect(source).toContain("useManufacturingWorkflowRunHistoryQuery(");
    expect(source).toContain("entry.flowSerial === activeGlobalSerial");
    expect(source).toContain("Active-step audit history");
    expect(source).toContain("Related record:");
    expect(source).toContain('activeStepCompletionKind === "APPROVAL"');
    expect(source).toContain('TRIGGER: "Activate branch"');
    expect(source).toContain('SAVE_DRAFT: "Save Draft"');
    expect(source).toContain("it does not create or post stock/GL");
    expect(source).toContain(
      "Submit must link an already-persisted Related record",
    );
    expect(source).toContain("Approve reuses that exact link");
    expect(source).toContain(
      "useManufacturingWorkflowElectronicSignatureQuery(",
    );
    expect(source).toContain('type="password"');
    expect(source).toContain("The server will validate the approved policy");
    expect(source).not.toContain(
      "Enter the electronic-signature reference for this controlled action",
    );
  });
});
