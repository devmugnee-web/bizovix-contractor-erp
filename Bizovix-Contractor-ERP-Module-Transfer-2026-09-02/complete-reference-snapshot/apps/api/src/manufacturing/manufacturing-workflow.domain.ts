import {
  MANUFACTURING_MODES,
  MANUFACTURING_WORKFLOW_PERMISSION_KEYS,
  manufacturingStepDependencies,
  manufacturingWorkflowGroups,
  manufacturingWorkflowSteps,
  type ManufacturingStepDependencyCatalogEntry,
  type ManufacturingWorkflowGroupCatalogEntry,
  type ManufacturingWorkflowGroupCode,
  type ManufacturingWorkflowMode,
  type ManufacturingWorkflowStepCatalogEntry,
  type ManufacturingWorkflowTerminalStatus,
} from "./manufacturing-workflow.catalog.js";

export type ManufacturingWorkflowStepStatus =
  | "BLOCKED"
  | "READY"
  | "IN_PROGRESS"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "POSTING"
  | "POSTED"
  | "COMPLETED"
  | "ON_HOLD"
  | "REJECTED"
  | "FAILED"
  | "N_A"
  | "CANCELLED"
  | "CLOSED"
  | "LOCKED";

export type ManufacturingWorkflowGroupStatus =
  | "LOCKED"
  | "READY"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "COMPLETED_WITH_NA"
  | "BLOCKED";

export class ManufacturingWorkflowDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
    this.name = "ManufacturingWorkflowDomainError";
  }
}

export interface ManufacturingWorkflowCatalogValidationResult {
  groupCount: number;
  stepCount: number;
  dependencyCount: number;
  firstSerial: number;
  lastSerial: number;
}

export function validateManufacturingWorkflowCatalog(
  groups: readonly ManufacturingWorkflowGroupCatalogEntry[] = manufacturingWorkflowGroups,
  steps: readonly ManufacturingWorkflowStepCatalogEntry[] = manufacturingWorkflowSteps,
  dependencies: readonly ManufacturingStepDependencyCatalogEntry[] = manufacturingStepDependencies,
): ManufacturingWorkflowCatalogValidationResult {
  const issues: string[] = [];
  const expectedCodes = "ABCDEFGHIJK".split("");
  if (groups.length !== 11)
    issues.push(`Expected 11 workflow groups; found ${groups.length}.`);
  if (steps.length !== 159)
    issues.push(`Expected 159 workflow steps; found ${steps.length}.`);

  const orderedGroups = [...groups].sort(
    (left, right) => left.flowGroupOrder - right.flowGroupOrder,
  );
  orderedGroups.forEach((group, index) => {
    if (group.flowGroupCode !== expectedCodes[index])
      issues.push(
        `Group order ${index + 1} must be ${expectedCodes[index]}; found ${group.flowGroupCode}.`,
      );
    if (group.flowGroupOrder !== index + 1)
      issues.push(
        `Group ${group.flowGroupCode} has invalid order ${group.flowGroupOrder}.`,
      );
    const actualCount = steps.filter(
      (step) => step.flowGroupCode === group.flowGroupCode,
    ).length;
    if (actualCount !== group.expectedStepCount)
      issues.push(
        `Group ${group.flowGroupCode} expects ${group.expectedStepCount} steps; found ${actualCount}.`,
      );
    const displayOrders = steps
      .filter((step) => step.flowGroupCode === group.flowGroupCode)
      .map((step) => step.displayOrder)
      .sort((left, right) => left - right);
    displayOrders.forEach((displayOrder, displayIndex) => {
      if (displayOrder !== displayIndex + 1)
        issues.push(
          `Group ${group.flowGroupCode} display order ${displayIndex + 1} is missing or duplicated.`,
        );
    });
  });

  const serials = steps.map((step) => step.flowSerial).sort((a, b) => a - b);
  for (let expected = 1; expected <= 159; expected += 1) {
    if (serials[expected - 1] !== expected)
      issues.push(`Global serial ${expected} is missing or duplicated.`);
  }
  const duplicateValues = (values: readonly string[]) => [
    ...new Set(
      values.filter((value, index) => values.indexOf(value) !== index),
    ),
  ];
  const duplicateLegacyCodes = duplicateValues(
    steps.map((step) => step.legacyStepCode),
  );
  if (duplicateLegacyCodes.length)
    issues.push(
      `Duplicate legacy step code(s): ${duplicateLegacyCodes.join(", ")}.`,
    );
  const duplicateRoutes = duplicateValues(steps.map((step) => step.route));
  if (duplicateRoutes.length)
    issues.push(`Duplicate route(s): ${duplicateRoutes.join(", ")}.`);

  for (const step of steps) {
    const group = groups.find(
      (candidate) => candidate.flowGroupCode === step.flowGroupCode,
    );
    const expectedSlug = step.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const expectedRoute = group
      ? `/app/manufacturing/dashboard?section=${group.routeSegment}&view=${expectedSlug}`
      : null;
    if (!expectedRoute || step.route !== expectedRoute)
      issues.push(
        `Step ${step.flowSerial} route must use the manufacturing dashboard section/view contract.`,
      );
    if (
      !(MANUFACTURING_WORKFLOW_PERMISSION_KEYS as readonly string[]).includes(
        step.permissionKey,
      )
    )
      issues.push(`Step ${step.flowSerial} has an unknown permission key.`);
    if (!/^\d{2}\.\d{2}$/.test(step.legacyStepCode))
      issues.push(`Step ${step.flowSerial} has an invalid legacy step code.`);
    if (step.executionOrder !== step.flowSerial)
      issues.push(
        `Step ${step.flowSerial} execution order must equal its global serial.`,
      );
    if (!step.allowedModes.length)
      issues.push(`Step ${step.flowSerial} has no allowed manufacturing mode.`);
    if (
      step.allowedModes.some(
        (mode) => !(MANUFACTURING_MODES as readonly string[]).includes(mode),
      )
    )
      issues.push(`Step ${step.flowSerial} contains an unsupported mode.`);
    if (step.postingEffect !== "NONE" && step.idempotencyPolicy !== "REQUIRED")
      issues.push(
        `Posting step ${step.flowSerial} must require an idempotency policy.`,
      );
    if (step.postingEffect !== "NONE" && !step.postingDescription?.trim())
      issues.push(
        `Posting step ${step.flowSerial} has no posting description.`,
      );
  }

  const stepBySerial = new Map(steps.map((step) => [step.flowSerial, step]));
  const dependencyKeys = new Set<string>();
  const adjacency = new Map<number, number[]>();
  for (const dependency of dependencies) {
    const key = `${dependency.stepSerial}:${dependency.prerequisiteStepSerial}:${dependency.dependencyType}`;
    if (dependencyKeys.has(key)) issues.push(`Duplicate dependency ${key}.`);
    dependencyKeys.add(key);
    if (!stepBySerial.has(dependency.stepSerial))
      issues.push(`Dependency target ${dependency.stepSerial} does not exist.`);
    if (!stepBySerial.has(dependency.prerequisiteStepSerial))
      issues.push(
        `Dependency prerequisite ${dependency.prerequisiteStepSerial} does not exist.`,
      );
    const prerequisite = stepBySerial.get(dependency.prerequisiteStepSerial);
    if (
      prerequisite &&
      dependency.requiredStatus !== prerequisite.completionRule.requiredStatus
    )
      issues.push(
        `Dependency ${key} requires ${dependency.requiredStatus}, but prerequisite ${dependency.prerequisiteStepSerial} completes as ${prerequisite.completionRule.requiredStatus}.`,
      );
    if (
      dependency.dependencyType === "CONDITIONAL" &&
      !dependency.conditionExpression
    )
      issues.push(`Conditional dependency ${key} has no condition expression.`);
    if (dependency.stepSerial === dependency.prerequisiteStepSerial)
      issues.push(`Step ${dependency.stepSerial} depends on itself.`);
    const next = adjacency.get(dependency.prerequisiteStepSerial) ?? [];
    next.push(dependency.stepSerial);
    adjacency.set(dependency.prerequisiteStepSerial, next);
  }

  const visiting = new Set<number>();
  const visited = new Set<number>();
  const visit = (serial: number): boolean => {
    if (visiting.has(serial)) return true;
    if (visited.has(serial)) return false;
    visiting.add(serial);
    for (const target of adjacency.get(serial) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(serial);
    visited.add(serial);
    return false;
  };
  if (serials.some((serial) => visit(serial)))
    issues.push("Workflow dependencies contain a cycle.");

  if (issues.length)
    throw new ManufacturingWorkflowDomainError(
      "INVALID_MANUFACTURING_WORKFLOW_CATALOG",
      issues.join(" "),
      issues,
    );
  return {
    groupCount: groups.length,
    stepCount: steps.length,
    dependencyCount: dependencies.length,
    firstSerial: serials[0] ?? 0,
    lastSerial: serials.at(-1) ?? 0,
  };
}

export interface ManufacturingRunStepStateInput {
  flowSerial: number;
  occurrenceKey?: string;
  status: ManufacturingWorkflowStepStatus;
  applicable?: boolean;
  blockerReason?: string | null;
  naReason?: string | null;
  completedAt?: Date | string | null;
  transitionSequence?: number | null;
}

export interface ManufacturingRunResolutionInput {
  manufacturingMode: ManufacturingWorkflowMode;
  runSteps: readonly ManufacturingRunStepStateInput[];
  triggeredStepSerials?: readonly number[];
  approvedNaStepSerials?: readonly number[];
  applicableStepSerials?: readonly number[];
  selectedPrimaryOrderStepSerial?: 50 | 51 | 52 | null;
}

export interface ManufacturingWorkflowBlocker {
  flowSerial: number;
  title: string;
  route: string;
  requiredStatus: ManufacturingWorkflowTerminalStatus;
  actualStatus: ManufacturingWorkflowStepStatus;
  reason: string;
}

export interface ResolvedManufacturingRunStep extends ManufacturingWorkflowStepCatalogEntry {
  applicable: boolean;
  recordedStatus: ManufacturingWorkflowStepStatus;
  effectiveStatus: ManufacturingWorkflowStepStatus;
  blockerReason: string | null;
  blockers: readonly ManufacturingWorkflowBlocker[];
  complete: boolean;
}

export interface ResolvedManufacturingWorkflowGroup {
  flowGroupCode: ManufacturingWorkflowGroupCode;
  name: string;
  status: ManufacturingWorkflowGroupStatus;
  applicableCount: number;
  completedCount: number;
  naCount: number;
  blockedCount: number;
  pendingApprovalCount: number;
}

export interface ResolvedManufacturingRunState {
  steps: readonly ResolvedManufacturingRunStep[];
  groups: readonly ResolvedManufacturingWorkflowGroup[];
  progress: {
    completed: number;
    applicable: number;
    notApplicable: number;
    blocked: number;
    pendingApproval: number;
  };
  currentGroup: ManufacturingWorkflowGroupCode | null;
  currentStepSerial: number | null;
  complete: boolean;
}

const terminalStatuses = new Set<ManufacturingWorkflowStepStatus>([
  "APPROVED",
  "POSTED",
  "COMPLETED",
  "N_A",
  "CLOSED",
]);

function completionSatisfied(
  requiredStatus: ManufacturingWorkflowTerminalStatus,
  actualStatus: ManufacturingWorkflowStepStatus,
) {
  if (actualStatus === "N_A" || actualStatus === "CLOSED") return true;
  if (requiredStatus === "APPROVED")
    return ["APPROVED", "POSTED", "COMPLETED"].includes(actualStatus);
  if (requiredStatus === "POSTED")
    return ["POSTED", "COMPLETED"].includes(actualStatus);
  return actualStatus === "COMPLETED";
}

function applicability(
  step: ManufacturingWorkflowStepCatalogEntry,
  input: ManufacturingRunResolutionInput,
) {
  const triggered = new Set(input.triggeredStepSerials ?? []);
  const explicitlyApplicable = new Set(input.applicableStepSerials ?? []);
  const approvedNa = new Set(input.approvedNaStepSerials ?? []);
  if (approvedNa.has(step.flowSerial)) return false;
  if (
    input.selectedPrimaryOrderStepSerial &&
    [50, 51, 52].includes(step.flowSerial)
  )
    return step.flowSerial === input.selectedPrimaryOrderStepSerial;
  if (!step.allowedModes.includes(input.manufacturingMode)) return false;
  if (explicitlyApplicable.has(step.flowSerial)) return true;
  if (
    step.applicabilityType === "CONDITIONAL" ||
    step.applicabilityType === "PERIODIC"
  )
    return triggered.has(step.flowSerial);
  if (step.applicabilityType === "NOT_APPLICABLE") return false;
  return true;
}

function stepComplete(
  step: ManufacturingWorkflowStepCatalogEntry,
  status: ManufacturingWorkflowStepStatus,
) {
  return completionSatisfied(step.completionRule.requiredStatus, status);
}

function activeStatus(status: ManufacturingWorkflowStepStatus) {
  return [
    "IN_PROGRESS",
    "PENDING_APPROVAL",
    "APPROVED",
    "POSTING",
    "POSTED",
    "ON_HOLD",
    "REJECTED",
    "FAILED",
  ].includes(status);
}

export function resolveManufacturingRunState(
  input: ManufacturingRunResolutionInput,
): ResolvedManufacturingRunState {
  validateManufacturingWorkflowCatalog();
  if (
    !(MANUFACTURING_MODES as readonly string[]).includes(
      input.manufacturingMode,
    )
  )
    throw new ManufacturingWorkflowDomainError(
      "INVALID_MANUFACTURING_MODE",
      `Unsupported manufacturing mode ${input.manufacturingMode}.`,
    );
  const occurrenceKeys = new Set<string>();
  const duplicateRunSerials = new Set<number>();
  const occurrencesBySerial = new Map<number, number>();
  for (const runStep of input.runSteps) {
    const definition = manufacturingWorkflowSteps.find(
      (step) => step.flowSerial === runStep.flowSerial,
    );
    const count = (occurrencesBySerial.get(runStep.flowSerial) ?? 0) + 1;
    occurrencesBySerial.set(runStep.flowSerial, count);
    if (count > 1 && !definition?.repeatable)
      duplicateRunSerials.add(runStep.flowSerial);
    const occurrenceKey = `${runStep.flowSerial}:${runStep.occurrenceKey ?? "PRIMARY"}`;
    if (occurrenceKeys.has(occurrenceKey))
      duplicateRunSerials.add(runStep.flowSerial);
    occurrenceKeys.add(occurrenceKey);
  }
  if (duplicateRunSerials.size)
    throw new ManufacturingWorkflowDomainError(
      "DUPLICATE_RUN_STEP",
      `Duplicate non-repeatable run step serial(s): ${[...duplicateRunSerials].join(", ")}.`,
    );

  const recordedBySerial = new Map(
    input.runSteps.map((step) => [step.flowSerial, step]),
  );
  const dependenciesByStep = new Map<
    number,
    ManufacturingStepDependencyCatalogEntry[]
  >();
  for (const dependency of manufacturingStepDependencies) {
    const rows = dependenciesByStep.get(dependency.stepSerial) ?? [];
    rows.push(dependency);
    dependenciesByStep.set(dependency.stepSerial, rows);
  }
  const resolvedBySerial = new Map<number, ResolvedManufacturingRunStep>();
  const resolvedSteps: ResolvedManufacturingRunStep[] = [];
  const resolvedGroups: ResolvedManufacturingWorkflowGroup[] = [];

  for (const group of manufacturingWorkflowGroups) {
    const groupSteps = manufacturingWorkflowSteps.filter(
      (step) => step.flowGroupCode === group.flowGroupCode,
    );
    const resolvedGroupSteps: ResolvedManufacturingRunStep[] = [];
    for (const step of groupSteps) {
      const recorded = recordedBySerial.get(step.flowSerial);
      const stepApplicable =
        recorded?.applicable === false ? false : applicability(step, input);
      const recordedStatus = recorded?.status ?? "READY";
      let effectiveStatus: ManufacturingWorkflowStepStatus = [
        "LOCKED",
        "BLOCKED",
      ].includes(recordedStatus)
        ? "READY"
        : recordedStatus;
      const blockers: ManufacturingWorkflowBlocker[] = [];

      if (!stepApplicable) effectiveStatus = "N_A";
      else if (!stepComplete(step, recordedStatus)) {
        for (const dependency of dependenciesByStep.get(step.flowSerial) ??
          []) {
          const prerequisite = resolvedBySerial.get(
            dependency.prerequisiteStepSerial,
          );
          const prerequisiteStatus =
            prerequisite?.effectiveStatus ??
            recordedBySerial.get(dependency.prerequisiteStepSerial)?.status ??
            "READY";
          if (
            !completionSatisfied(dependency.requiredStatus, prerequisiteStatus)
          ) {
            const definition = manufacturingWorkflowSteps.find(
              (candidate) =>
                candidate.flowSerial === dependency.prerequisiteStepSerial,
            )!;
            blockers.push({
              flowSerial: definition.flowSerial,
              title: definition.title,
              route: definition.route,
              requiredStatus: dependency.requiredStatus,
              actualStatus: prerequisiteStatus,
              reason: `${definition.title} must be ${dependency.requiredStatus}.`,
            });
          }
        }
        if (recorded?.blockerReason?.trim()) {
          blockers.push({
            flowSerial: step.flowSerial,
            title: step.title,
            route: step.route,
            requiredStatus: step.completionRule.requiredStatus,
            actualStatus: recordedStatus,
            reason: recorded.blockerReason.trim(),
          });
        }
      }

      const resolved: ResolvedManufacturingRunStep = {
        ...step,
        applicable: stepApplicable,
        recordedStatus,
        effectiveStatus,
        blockerReason: blockers[0]?.reason ?? recorded?.blockerReason ?? null,
        blockers,
        complete: stepComplete(step, effectiveStatus),
      };
      resolvedBySerial.set(step.flowSerial, resolved);
      resolvedSteps.push(resolved);
      resolvedGroupSteps.push(resolved);
    }

    const blockingSteps = resolvedGroupSteps.filter(
      (step) => step.applicable && step.isBlocking,
    );
    const allBlockingComplete = blockingSteps.every((step) => step.complete);
    const naCount = resolvedGroupSteps.filter(
      (step) => step.effectiveStatus === "N_A",
    ).length;
    let status: ManufacturingWorkflowGroupStatus;
    if (group.flowGroupCode === "A") {
      status = resolvedGroupSteps.some((step) =>
        activeStatus(step.effectiveStatus),
      )
        ? "IN_PROGRESS"
        : "READY";
    } else if (allBlockingComplete)
      status = naCount ? "COMPLETED_WITH_NA" : "COMPLETED";
    else if (
      blockingSteps.some((step) =>
        ["ON_HOLD", "REJECTED", "FAILED"].includes(step.effectiveStatus),
      )
    )
      status = "BLOCKED";
    else if (blockingSteps.some((step) => activeStatus(step.effectiveStatus)))
      status = "IN_PROGRESS";
    else if (blockingSteps.some((step) => step.effectiveStatus === "READY"))
      status = blockingSteps.some((step) => step.complete)
        ? "IN_PROGRESS"
        : "READY";
    else status = "BLOCKED";

    resolvedGroups.push({
      flowGroupCode: group.flowGroupCode,
      name: group.name,
      status,
      applicableCount: resolvedGroupSteps.filter((step) => step.applicable)
        .length,
      completedCount: resolvedGroupSteps.filter(
        (step) => step.applicable && step.complete,
      ).length,
      naCount,
      blockedCount: resolvedGroupSteps.filter((step) =>
        ["ON_HOLD", "REJECTED", "FAILED"].includes(step.effectiveStatus),
      ).length,
      pendingApprovalCount: resolvedGroupSteps.filter(
        (step) => step.effectiveStatus === "PENDING_APPROVAL",
      ).length,
    });
  }

  const nextIncomplete = resolvedSteps.find(
    (step) =>
      step.flowGroupCode !== "A" &&
      step.applicable &&
      step.isBlocking &&
      !step.complete,
  );
  const progressSteps = resolvedSteps.filter(
    (step) => step.flowGroupCode !== "A",
  );
  return {
    steps: resolvedSteps,
    groups: resolvedGroups,
    progress: {
      completed: progressSteps.filter(
        (step) => step.applicable && step.complete,
      ).length,
      applicable: progressSteps.filter((step) => step.applicable).length,
      notApplicable: progressSteps.filter(
        (step) => step.effectiveStatus === "N_A",
      ).length,
      blocked: progressSteps.filter((step) =>
        ["ON_HOLD", "REJECTED", "FAILED"].includes(step.effectiveStatus),
      ).length,
      pendingApproval: progressSteps.filter(
        (step) => step.effectiveStatus === "PENDING_APPROVAL",
      ).length,
    },
    currentGroup: nextIncomplete?.flowGroupCode ?? null,
    currentStepSerial: nextIncomplete?.flowSerial ?? null,
    complete: !nextIncomplete,
  };
}

export type ManufacturingNextAction =
  | {
      kind: "READY";
      step: ResolvedManufacturingRunStep;
      blockers: readonly ManufacturingWorkflowBlocker[];
    }
  | {
      kind: "BLOCKED";
      step: ResolvedManufacturingRunStep;
      blockers: readonly ManufacturingWorkflowBlocker[];
    }
  | { kind: "COMPLETE"; step: null; blockers: readonly [] };

export function resolveManufacturingNextAction(
  input: ManufacturingRunResolutionInput,
): ManufacturingNextAction {
  const state = resolveManufacturingRunState(input);
  const triggered = new Set(input.triggeredStepSerials ?? []);
  const candidate = state.steps.find((step) => {
    if (step.flowGroupCode === "A" || !step.applicable || step.complete)
      return false;
    if (
      (step.stepType === "MONITORING" || step.stepType === "REPORT") &&
      !triggered.has(step.flowSerial) &&
      !activeStatus(step.recordedStatus)
    )
      return false;
    return step.isBlocking || triggered.has(step.flowSerial);
  });
  if (!candidate) return { kind: "COMPLETE", step: null, blockers: [] };
  if (
    candidate.blockers.length > 0 ||
    candidate.effectiveStatus === "ON_HOLD" ||
    candidate.effectiveStatus === "FAILED" ||
    candidate.effectiveStatus === "REJECTED"
  ) {
    return { kind: "BLOCKED", step: candidate, blockers: candidate.blockers };
  }
  return { kind: "READY", step: candidate, blockers: [] };
}

const allowedTransitions: Record<
  ManufacturingWorkflowStepStatus,
  readonly ManufacturingWorkflowStepStatus[]
> = {
  LOCKED: ["READY", "BLOCKED"],
  BLOCKED: ["READY", "LOCKED"],
  READY: [
    "IN_PROGRESS",
    "PENDING_APPROVAL",
    "POSTING",
    "COMPLETED",
    "N_A",
    "ON_HOLD",
  ],
  IN_PROGRESS: [
    "PENDING_APPROVAL",
    "APPROVED",
    "POSTING",
    "POSTED",
    "COMPLETED",
    "ON_HOLD",
    "REJECTED",
    "FAILED",
  ],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "ON_HOLD"],
  APPROVED: ["POSTING", "POSTED", "COMPLETED", "ON_HOLD"],
  POSTING: ["POSTED", "FAILED"],
  POSTED: ["COMPLETED", "CLOSED"],
  COMPLETED: ["CLOSED"],
  ON_HOLD: ["READY", "IN_PROGRESS"],
  REJECTED: ["READY", "N_A"],
  FAILED: ["READY", "POSTING"],
  N_A: [],
  CANCELLED: [],
  CLOSED: [],
};

export interface ManufacturingStepTransitionInput {
  fromStatus: ManufacturingWorkflowStepStatus;
  toStatus: ManufacturingWorkflowStepStatus;
  step?: Pick<
    ManufacturingWorkflowStepCatalogEntry,
    "flowSerial" | "applicabilityType" | "postingEffect" | "stepType"
  > | null;
  reason?: string | null;
  approvalRequired?: boolean;
  signatureReference?: string | null;
}

/**
 * A company may opt out of workflow activities that have no inventory or
 * ledger effect. Posting steps are never user-skippable: conditional posting
 * steps become N/A only when the workflow's applicability rules decide that
 * the underlying business event did not occur.
 */
export function canManufacturingStepBeMarkedNotApplicable(step: {
  postingEffect: string;
}) {
  return step.postingEffect === "NONE";
}

export function assertManufacturingStepTransition(
  fromStatus: ManufacturingWorkflowStepStatus,
  toStatus: ManufacturingWorkflowStepStatus,
  context?: Omit<ManufacturingStepTransitionInput, "fromStatus" | "toStatus">,
): void;
export function assertManufacturingStepTransition(
  input: ManufacturingStepTransitionInput,
): void;
export function assertManufacturingStepTransition(
  fromOrInput:
    ManufacturingWorkflowStepStatus | ManufacturingStepTransitionInput,
  maybeTo?: ManufacturingWorkflowStepStatus,
  context: Omit<
    ManufacturingStepTransitionInput,
    "fromStatus" | "toStatus"
  > = {},
) {
  const input: ManufacturingStepTransitionInput =
    typeof fromOrInput === "string"
      ? { fromStatus: fromOrInput, toStatus: maybeTo!, ...context }
      : fromOrInput;
  if (
    !input.toStatus ||
    !allowedTransitions[input.fromStatus].includes(input.toStatus)
  )
    throw new ManufacturingWorkflowDomainError(
      "INVALID_MANUFACTURING_STEP_TRANSITION",
      `Manufacturing step cannot move from ${input.fromStatus} to ${input.toStatus}.`,
    );
  if (
    ["N_A", "REJECTED", "ON_HOLD", "CANCELLED"].includes(input.toStatus) &&
    !input.reason?.trim()
  )
    throw new ManufacturingWorkflowDomainError(
      "MANUFACTURING_STEP_REASON_REQUIRED",
      `${input.toStatus} requires a non-empty reason.`,
    );
  if (
    input.toStatus === "N_A" &&
    input.step &&
    !canManufacturingStepBeMarkedNotApplicable(input.step)
  )
    throw new ManufacturingWorkflowDomainError(
      "MANUFACTURING_POSTING_STEP_CANNOT_BE_NA",
      `Posting step ${input.step.flowSerial} cannot be marked N/A.`,
    );
  if (
    input.toStatus === "N_A" &&
    input.approvalRequired &&
    !input.signatureReference?.trim()
  )
    throw new ManufacturingWorkflowDomainError(
      "MANUFACTURING_NA_APPROVAL_REQUIRED",
      "N/A approval requires an electronic-signature reference.",
    );
}

export function resolvePreviousManufacturingStep(
  runSteps: readonly ManufacturingRunStepStateInput[],
) {
  const previous = [...runSteps]
    .filter(
      (step) =>
        step.transitionSequence !== null &&
        step.transitionSequence !== undefined &&
        terminalStatuses.has(step.status),
    )
    .sort(
      (left, right) =>
        (right.transitionSequence ?? 0) - (left.transitionSequence ?? 0),
    )[0];
  return previous
    ? (manufacturingWorkflowSteps.find(
        (step) => step.flowSerial === previous.flowSerial,
      ) ?? null)
    : null;
}
