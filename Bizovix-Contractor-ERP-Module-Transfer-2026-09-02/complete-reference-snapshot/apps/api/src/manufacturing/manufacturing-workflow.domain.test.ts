import { describe, expect, it } from "vitest";

import {
  manufacturingStepDependencies,
  manufacturingWorkflowGroups,
  manufacturingWorkflowSteps,
} from "./manufacturing-workflow.catalog.js";
import {
  ManufacturingWorkflowDomainError,
  assertManufacturingStepTransition,
  resolveManufacturingNextAction,
  resolveManufacturingRunState,
  validateManufacturingWorkflowCatalog,
  type ManufacturingRunStepStateInput,
} from "./manufacturing-workflow.domain.js";

const legacyLockedRun = (): ManufacturingRunStepStateInput[] =>
  manufacturingWorkflowSteps.map((step) => ({
    flowSerial: step.flowSerial,
    status: "LOCKED",
  }));

function withStatuses(
  statuses: Readonly<Record<number, ManufacturingRunStepStateInput["status"]>>,
  blockers: Readonly<Record<number, string>> = {},
) {
  return legacyLockedRun().map((step) => ({
    ...step,
    status: statuses[step.flowSerial] ?? step.status,
    blockerReason: blockers[step.flowSerial] ?? null,
  }));
}

describe("A-to-K manufacturing workflow catalog", () => {
  it("contains exactly 11 groups, 159 gap-free steps and the requested counts", () => {
    expect(validateManufacturingWorkflowCatalog()).toMatchObject({
      groupCount: 11,
      stepCount: 159,
      dependencyCount: 207,
      firstSerial: 1,
      lastSerial: 159,
    });
    expect(
      Object.fromEntries(
        manufacturingWorkflowGroups.map((group) => [
          group.flowGroupCode,
          manufacturingWorkflowSteps.filter(
            (step) => step.flowGroupCode === group.flowGroupCode,
          ).length,
        ]),
      ),
    ).toEqual({
      A: 7,
      B: 9,
      C: 20,
      D: 12,
      E: 10,
      F: 20,
      G: 18,
      H: 11,
      I: 20,
      J: 16,
      K: 16,
    });
  });

  it("preserves safety-critical legacy mappings and real dashboard routes", () => {
    const step = (serial: number) =>
      manufacturingWorkflowSteps.find(
        (candidate) => candidate.flowSerial === serial,
      );
    expect(step(8)).toMatchObject({
      legacyStepCode: "11.01",
      title: "Manufacturing Settings",
      flowGroupCode: "B",
    });
    expect(step(63)).toMatchObject({
      legacyStepCode: "05.02",
      title: "Material Requisition",
    });
    expect(step(66)).toMatchObject({
      legacyStepCode: "05.01",
      title: "Material Reservation",
    });
    expect(step(97)).toMatchObject({
      legacyStepCode: "08.09",
      title: "Serialisation — Preallocation",
    });
    expect(step(121)).toMatchObject({
      legacyStepCode: "08.13",
      postingEffect: "INVENTORY_AND_GL",
    });
    expect(step(113)).toMatchObject({
      legacyStepCode: "08.04",
      postingEffect: "INVENTORY_AND_GL",
      applicabilityType: "CONDITIONAL",
      repeatable: true,
    });
    expect(step(54)).toMatchObject({
      title: "Production Order Amendments",
      applicabilityType: "CONDITIONAL",
    });
    expect(step(126)).toMatchObject({
      legacyStepCode: "08.15",
      postingEffect: "INVENTORY_ONLY",
    });
    expect(step(159)).toMatchObject({
      legacyStepCode: "11.13",
      title: "Data Retention and Archive",
    });
    expect(
      manufacturingWorkflowSteps.every((candidate) =>
        candidate.route.startsWith("/app/manufacturing/dashboard?section="),
      ),
    ).toBe(true);
  });

  it("requires idempotency for every stock or accounting effect", () => {
    const postingSteps = manufacturingWorkflowSteps.filter(
      (step) => step.postingEffect !== "NONE",
    );
    expect(postingSteps.length).toBeGreaterThan(0);
    expect(
      postingSteps.every((step) => step.idempotencyPolicy === "REQUIRED"),
    ).toBe(true);
    expect(
      postingSteps.find((step) => step.flowSerial === 70)?.postingDescription,
    ).toContain("Dr Work in Process");
  });

  it("keeps generated report screens observed and non-blocking", () => {
    const reports = manufacturingWorkflowSteps.filter(
      (step) => step.stepType === "REPORT",
    );
    expect(reports).toHaveLength(11);
    expect(
      reports.every(
        (step) => step.applicabilityType === "MONITORING" && !step.isBlocking,
      ),
    ).toBe(true);
  });

  it("keeps regulated pharmaceutical controls out of GENERAL mode without removing shared posting controls", () => {
    const step = (serial: number) =>
      manufacturingWorkflowSteps.find(
        (candidate) => candidate.flowSerial === serial,
      )!;
    for (const serial of [7, 55, 59, 80, 111, 124, 155]) {
      expect(step(serial).allowedModes).toEqual(["PHARMACEUTICAL", "HYBRID"]);
    }
    for (const serial of [11, 70, 97, 99, 104, 121, 126, 139]) {
      expect(step(serial).allowedModes).toEqual([
        "GENERAL",
        "PHARMACEUTICAL",
        "HYBRID",
      ]);
    }
    expect(step(11).applicabilityType).toBe("CONDITIONAL");
    expect(step(99).applicabilityType).toBe("CONDITIONAL");
    expect(step(104).applicabilityType).toBe("PERIODIC");
  });

  it("keeps reports observational without making validation depend on them", () => {
    expect(
      manufacturingStepDependencies.filter(
        (dependency) =>
          dependency.stepSerial === 155 &&
          dependency.prerequisiteStepSerial >= 144 &&
          dependency.prerequisiteStepSerial <= 154,
      ),
    ).toEqual([]);
    expect(manufacturingStepDependencies).toContainEqual(
      expect.objectContaining({
        stepSerial: 155,
        prerequisiteStepSerial: 143,
        dependencyType: "HARD",
      }),
    );
    expect(manufacturingStepDependencies).not.toContainEqual(
      expect.objectContaining({
        stepSerial: 156,
        prerequisiteStepSerial: 154,
      }),
    );
  });

  it("rejects a dependency cycle", () => {
    expect(() =>
      validateManufacturingWorkflowCatalog(
        manufacturingWorkflowGroups,
        manufacturingWorkflowSteps,
        [
          ...manufacturingStepDependencies,
          {
            stepSerial: 8,
            prerequisiteStepSerial: 9,
            requiredStatus: "COMPLETED",
            dependencyType: "HARD",
            conditionExpression: null,
          },
        ],
      ),
    ).toThrowError(ManufacturingWorkflowDomainError);
  });
});

describe("manufacturing run orchestration", () => {
  it("starts at Manufacturing Settings while every group remains navigable", () => {
    const input = {
      manufacturingMode: "GENERAL" as const,
      runSteps: legacyLockedRun(),
    };
    const state = resolveManufacturingRunState(input);
    const next = resolveManufacturingNextAction(input);
    expect(next.kind).toBe("READY");
    expect(next.step?.flowSerial).toBe(8);
    expect(
      state.groups.find((group) => group.flowGroupCode === "B")?.status,
    ).toBe("READY");
    expect(
      state.groups.find((group) => group.flowGroupCode === "C")?.status,
    ).toBe("READY");
  });

  it("advances to Group C after all blocking Group B steps complete", () => {
    const statuses = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [index + 8, "COMPLETED"]),
    ) as Record<number, "COMPLETED">;
    const input = {
      manufacturingMode: "GENERAL" as const,
      runSteps: withStatuses(statuses),
    };
    const state = resolveManufacturingRunState(input);
    expect(
      state.groups.find((group) => group.flowGroupCode === "B")?.status,
    ).toBe("COMPLETED_WITH_NA");
    expect(
      state.groups.find((group) => group.flowGroupCode === "C")?.status,
    ).toBe("READY");
    expect(resolveManufacturingNextAction(input).step?.flowSerial).toBe(17);
  });

  it("keeps named release gates as exact notifications without locking groups", () => {
    const completedGateSerials = [
      ...Array.from({ length: 9 }, (_, index) => index + 8),
      17,
      18,
      19,
      ...Array.from({ length: 16 }, (_, index) => index + 21),
      48,
      53,
      58,
    ];
    const beforeIssue = resolveManufacturingRunState({
      manufacturingMode: "GENERAL",
      runSteps: withStatuses(
        Object.fromEntries(
          completedGateSerials.map((serial) => [serial, "COMPLETED"]),
        ) as Record<number, "COMPLETED">,
      ),
    });
    expect(
      beforeIssue.groups.find((group) => group.flowGroupCode === "G")?.status,
    ).toBe("READY");
    expect(
      beforeIssue.steps.find((step) => step.flowSerial === 79)?.blockers,
    ).toEqual([
      expect.objectContaining({
        flowSerial: 70,
        requiredStatus: "POSTED",
      }),
    ]);

    const afterIssue = resolveManufacturingRunState({
      manufacturingMode: "GENERAL",
      runSteps: withStatuses({
        ...(Object.fromEntries(
          completedGateSerials.map((serial) => [serial, "COMPLETED"]),
        ) as Record<number, "COMPLETED">),
        70: "POSTED",
      }),
    });
    expect(
      afterIssue.groups.find((group) => group.flowGroupCode === "G")?.status,
    ).toBe("READY");
    expect(
      afterIssue.groups.find((group) => group.flowGroupCode === "H")?.status,
    ).toBe("READY");
    expect(
      afterIssue.steps.find((step) => step.flowSerial === 79)?.blockers,
    ).toEqual([]);
  });

  it("returns an exact blocker and fixing route without jumping ahead", () => {
    const next = resolveManufacturingNextAction({
      manufacturingMode: "GENERAL",
      runSteps: withStatuses(
        { 8: "BLOCKED" },
        { 8: "Configure approved warehouse and ledger mappings." },
      ),
    });
    expect(next.kind).toBe("BLOCKED");
    expect(next.step?.flowSerial).toBe(8);
    expect(next.blockers[0]).toMatchObject({
      flowSerial: 8,
      route:
        "/app/manufacturing/dashboard?section=setup&view=manufacturing-settings",
      reason: "Configure approved warehouse and ledger mappings.",
    });
  });

  it("skips untriggered conditional/periodic steps and approved N/A steps", () => {
    const state = resolveManufacturingRunState({
      manufacturingMode: "GENERAL",
      runSteps: legacyLockedRun(),
      approvedNaStepSerials: [20],
    });
    expect(state.steps.find((step) => step.flowSerial === 20)).toMatchObject({
      applicable: false,
      effectiveStatus: "N_A",
    });
    expect(state.steps.find((step) => step.flowSerial === 39)).toMatchObject({
      applicable: false,
      effectiveStatus: "N_A",
    });
    expect(state.steps.find((step) => step.flowSerial === 51)).toMatchObject({
      applicable: false,
      effectiveStatus: "N_A",
    });
  });

  it("resolves pharma-only controls as N/A for GENERAL and available for PHARMACEUTICAL/HYBRID", () => {
    const general = resolveManufacturingRunState({
      manufacturingMode: "GENERAL",
      runSteps: legacyLockedRun(),
      triggeredStepSerials: [55, 99, 104],
    });
    const pharmaceutical = resolveManufacturingRunState({
      manufacturingMode: "PHARMACEUTICAL",
      runSteps: legacyLockedRun(),
      triggeredStepSerials: [55, 99, 104],
    });
    const hybrid = resolveManufacturingRunState({
      manufacturingMode: "HYBRID",
      runSteps: legacyLockedRun(),
      triggeredStepSerials: [55, 99, 104],
    });

    for (const serial of [55, 59, 80, 111, 124, 155]) {
      expect(
        general.steps.find((step) => step.flowSerial === serial),
      ).toMatchObject({ applicable: false, effectiveStatus: "N_A" });
      expect(
        pharmaceutical.steps.find((step) => step.flowSerial === serial)
          ?.applicable,
      ).toBe(true);
      expect(
        hybrid.steps.find((step) => step.flowSerial === serial)?.applicable,
      ).toBe(true);
    }
    for (const serial of [97, 99, 104]) {
      expect(
        general.steps.find((step) => step.flowSerial === serial)?.applicable,
      ).toBe(true);
    }
  });
});

describe("manufacturing run-step status transitions", () => {
  it("accepts controlled forward transitions", () => {
    expect(() =>
      assertManufacturingStepTransition("LOCKED", "READY"),
    ).not.toThrow();
    expect(() =>
      assertManufacturingStepTransition("READY", "IN_PROGRESS"),
    ).not.toThrow();
    expect(() =>
      assertManufacturingStepTransition("POSTING", "POSTED"),
    ).not.toThrow();
  });

  it("rejects backward jumps and N/A on a posting step", () => {
    expect(() =>
      assertManufacturingStepTransition("COMPLETED", "IN_PROGRESS"),
    ).toThrowError(/cannot move/i);
    expect(() =>
      assertManufacturingStepTransition("READY", "CANCELLED"),
    ).toThrowError(/cannot move/i);
    expect(() =>
      assertManufacturingStepTransition({
        fromStatus: "READY",
        toStatus: "N_A",
        step: manufacturingWorkflowSteps.find((step) => step.flowSerial === 70),
        reason: "Hide an incomplete posting",
      }),
    ).toThrowError(/posting step .* cannot be marked N\/A/i);
  });

  it("allows a company to mark a required non-posting step N/A under controlled approval", () => {
    const requiredNonPosting = manufacturingWorkflowSteps.find(
      (step) => step.flowSerial === 8,
    )!;
    expect(requiredNonPosting).toMatchObject({
      applicabilityType: "REQUIRED",
      postingEffect: "NONE",
    });
    expect(() =>
      assertManufacturingStepTransition({
        fromStatus: "READY",
        toStatus: "N_A",
        step: requiredNonPosting,
        reason:
          "This company manages the configuration in its approved global policy.",
        approvalRequired: true,
        signatureReference: "sig-required-na-1",
      }),
    ).not.toThrow();
  });

  it("requires reason and configured signature approval for valid N/A", () => {
    const optional = manufacturingWorkflowSteps.find(
      (step) => step.flowSerial === 39,
    )!;
    expect(() =>
      assertManufacturingStepTransition({
        fromStatus: "READY",
        toStatus: "N_A",
        step: optional,
      }),
    ).toThrowError(/reason/i);
    expect(() =>
      assertManufacturingStepTransition({
        fromStatus: "READY",
        toStatus: "N_A",
        step: optional,
        reason: "No campaign is required for this run.",
        approvalRequired: true,
      }),
    ).toThrowError(/signature/i);
    expect(() =>
      assertManufacturingStepTransition({
        fromStatus: "READY",
        toStatus: "N_A",
        step: optional,
        reason: "No campaign is required for this run.",
        approvalRequired: true,
        signatureReference: "sig-1",
      }),
    ).not.toThrow();
  });
});
