import { normalizeManufacturingEvidenceAttachments } from "./manufacturing-evidence-attachment.domain.js";

export type ReadinessState = "READY" | "DUE_SOON" | "BLOCKED" | "NOT_REQUIRED";
export type CleaningState = "CLEAN" | "DUE" | "BLOCKED" | "NOT_REQUIRED";

export type ResourceReadinessInput = {
  resourceId: string;
  code: string;
  name: string;
  active: boolean;
  qualificationState: ReadinessState;
  qualificationValidUntil?: Date | null;
  calibrationState: ReadinessState;
  calibrationDueAt?: Date | null;
  maintenanceState: ReadinessState;
  maintenanceDueAt?: Date | null;
  cleaningState: CleaningState;
  readinessEvidenceReference?: string | null;
};

export type CapacityRequirementInput = {
  operationId: string;
  operationCode: string;
  resource: ResourceReadinessInput;
  setupMinutes: number;
  runMinutesPerUnit: number;
  queueMinutes: number;
  plannedQuantity: number;
  lotCount: number;
  requiredUnits: number;
  capacityMultiplier: number;
  mandatory: boolean;
  availableMinutes: number;
};

export type CapacityResourceResult = {
  operationId: string;
  operationCode: string;
  resourceId: string;
  resourceCode: string;
  requiredMinutes: number;
  availableMinutes: number;
  remainingMinutes: number;
  ready: boolean;
  warnings: string[];
  blockers: string[];
};

function expired(value: Date | null | undefined, asOf: Date): boolean {
  return Boolean(value && value.getTime() < asOf.getTime());
}

/**
 * Evaluates documented resource readiness on the requested business date.
 * DUE_SOON is visible as a warning; BLOCKED, expired evidence, missing READY
 * validity, and dirty equipment are hard blockers.
 */
export function evaluateResourceReadiness(
  resource: ResourceReadinessInput,
  asOf: Date,
) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!resource.active) blockers.push("Resource is inactive.");
  const checks: Array<{
    label: string;
    state: ReadinessState;
    due?: Date | null;
  }> = [
    {
      label: "Qualification",
      state: resource.qualificationState,
      due: resource.qualificationValidUntil,
    },
    {
      label: "Calibration",
      state: resource.calibrationState,
      due: resource.calibrationDueAt,
    },
    {
      label: "Maintenance",
      state: resource.maintenanceState,
      due: resource.maintenanceDueAt,
    },
  ];
  for (const check of checks) {
    if (check.state === "BLOCKED") blockers.push(`${check.label} is blocked.`);
    if (check.state === "DUE_SOON")
      warnings.push(`${check.label} is due soon.`);
    if (check.state === "READY" && !check.due)
      blockers.push(`${check.label} validity/due date is missing.`);
    if (
      (check.state === "READY" || check.state === "DUE_SOON") &&
      expired(check.due, asOf)
    ) {
      blockers.push(
        `${check.label} evidence expired before the capacity-check date.`,
      );
    }
  }
  if (
    resource.cleaningState === "BLOCKED" ||
    resource.cleaningState === "DUE"
  ) {
    blockers.push("Cleaning is not current.");
  }
  if (!resource.readinessEvidenceReference?.trim()) {
    blockers.push("Readiness evidence reference is missing.");
  }
  return { ready: blockers.length === 0, blockers, warnings };
}

/**
 * Required minutes include per-lot setup and queue time plus per-unit run
 * time. Parallel identical units divide, while an efficiency/load multiplier
 * increases or decreases the requirement. This makes the persisted result
 * reproducible instead of relying on UI totals.
 */
export function calculateResourceCapacity(
  requirement: CapacityRequirementInput,
  asOf: Date,
): CapacityResourceResult {
  const readiness = evaluateResourceReadiness(requirement.resource, asOf);
  const baseMinutes =
    (requirement.setupMinutes + requirement.queueMinutes) *
      requirement.lotCount +
    requirement.runMinutesPerUnit * requirement.plannedQuantity;
  const unitCount = Math.max(1, requirement.requiredUnits);
  const requiredMinutes =
    (baseMinutes * requirement.capacityMultiplier) / unitCount;
  const blockers = [...readiness.blockers];
  if (requirement.mandatory && requirement.availableMinutes < requiredMinutes) {
    blockers.push(
      `Capacity shortfall: ${requiredMinutes.toFixed(4)} required, ${requirement.availableMinutes.toFixed(4)} available.`,
    );
  }
  return {
    operationId: requirement.operationId,
    operationCode: requirement.operationCode,
    resourceId: requirement.resource.resourceId,
    resourceCode: requirement.resource.code,
    requiredMinutes,
    availableMinutes: requirement.availableMinutes,
    remainingMinutes: requirement.availableMinutes - requiredMinutes,
    ready: blockers.length === 0,
    warnings: readiness.warnings,
    blockers,
  };
}

export function summarizeCapacity(results: CapacityResourceResult[]) {
  const blockers = results.flatMap((row) =>
    row.blockers.map((message) => ({
      operationId: row.operationId,
      operationCode: row.operationCode,
      resourceId: row.resourceId,
      resourceCode: row.resourceCode,
      message,
    })),
  );
  const byResource = new Map<
    string,
    {
      resourceId: string;
      resourceCode: string;
      requiredMinutes: number;
      availableMinutes: number;
    }
  >();
  for (const row of results) {
    const current = byResource.get(row.resourceId) ?? {
      resourceId: row.resourceId,
      resourceCode: row.resourceCode,
      requiredMinutes: 0,
      availableMinutes: row.availableMinutes,
    };
    current.requiredMinutes += row.requiredMinutes;
    current.availableMinutes = Math.max(
      current.availableMinutes,
      row.availableMinutes,
    );
    byResource.set(row.resourceId, current);
  }
  const resourceTotals = [...byResource.values()].map((row) => ({
    ...row,
    remainingMinutes: row.availableMinutes - row.requiredMinutes,
  }));
  for (const row of resourceTotals) {
    if (row.requiredMinutes > row.availableMinutes) {
      blockers.push({
        operationId: "AGGREGATE",
        operationCode: "RESOURCE_TOTAL",
        resourceId: row.resourceId,
        resourceCode: row.resourceCode,
        message: `Aggregate capacity shortfall: ${row.requiredMinutes.toFixed(4)} required, ${row.availableMinutes.toFixed(4)} available.`,
      });
    }
  }
  return {
    status: blockers.length ? ("BLOCKED" as const) : ("READY" as const),
    requiredMinutes: results.reduce((sum, row) => sum + row.requiredMinutes, 0),
    availableMinutes: resourceTotals.reduce(
      (sum, row) => sum + row.availableMinutes,
      0,
    ),
    blockers,
    resources: results,
    resourceTotals,
  };
}

export function formatManufacturingDocumentNumber(input: {
  prefix: string;
  sequenceNumber: number;
  padding: number;
  year: number;
  includeYear: boolean;
  month?: number;
  resetPeriod?: "NEVER" | "ANNUAL" | "MONTHLY";
}) {
  const serial = String(input.sequenceNumber).padStart(input.padding, "0");
  const prefix = input.prefix.replace(/-+$/, "");
  const resetPeriod =
    input.resetPeriod ?? (input.includeYear ? "ANNUAL" : "NEVER");
  if (resetPeriod === "MONTHLY") {
    const month = String(input.month ?? 1).padStart(2, "0");
    return `${prefix}-${input.year}-${month}-${serial}`;
  }
  return resetPeriod === "ANNUAL"
    ? `${prefix}-${input.year}-${serial}`
    : `${prefix}-${serial}`;
}

export function manufacturingPeriodBounds(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200)
    throw new Error("Invalid manufacturing period year.");
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new Error("Invalid manufacturing period month.");
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}

type PeriodEvidencePackInput = { id: string; code: string; payload: unknown };

function evidenceDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim()))
    return null;
  const parsed = new Date(`${value.trim()}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
}

/** Re-checks persisted Day-29 evidence before a period can be locked. */
export function evaluatePeriodEvidencePack(input: {
  periodStart: Date;
  periodEnd: Date;
  validationReference?: string | null;
  packs: PeriodEvidencePackInput[];
}) {
  const validationReference = input.validationReference?.trim() ?? "";
  const start = input.periodStart.toISOString().slice(0, 10);
  const end = input.periodEnd.toISOString().slice(0, 10);
  const eligible = input.packs.flatMap((pack) => {
    if (
      !pack.payload ||
      typeof pack.payload !== "object" ||
      Array.isArray(pack.payload)
    )
      return [];
    const detailsValue = (pack.payload as Record<string, unknown>).details;
    if (
      !detailsValue ||
      typeof detailsValue !== "object" ||
      Array.isArray(detailsValue)
    )
      return [];
    const details = detailsValue as Record<string, unknown>;
    const periodFrom = evidenceDate(details.periodFrom);
    const periodTo = evidenceDate(details.periodTo);
    const evidenceReference =
      typeof details.evidenceReference === "string"
        ? details.evidenceReference.trim()
        : "";
    const attachments = Array.isArray(details.attachments)
      ? details.attachments
      : [];
    const attachmentsValid = (() => {
      try {
        return (
          attachments.length > 0 &&
          normalizeManufacturingEvidenceAttachments(attachments).length > 0
        );
      } catch {
        return false;
      }
    })();
    if (
      !periodFrom ||
      !periodTo ||
      periodFrom > start ||
      periodTo < end ||
      !evidenceReference ||
      !attachmentsValid
    )
      return [];
    return [
      {
        id: pack.id,
        code: pack.code,
        evidenceReference,
        periodFrom,
        periodTo,
        attachmentCount: attachments.length,
      },
    ];
  });
  const blockers: string[] = [];
  const normalizedReference = validationReference.toLowerCase();
  const linked =
    Boolean(validationReference) &&
    eligible.some((pack) =>
      [pack.id, pack.code, pack.evidenceReference].some(
        (candidate) => candidate.trim().toLowerCase() === normalizedReference,
      ),
    );
  if (!validationReference)
    blockers.push(
      "A validation reference linking the period review to its approved audit evidence pack is required.",
    );
  else if (!linked)
    blockers.push(
      "The validation reference must match the eligible audit evidence pack ID, code or evidence reference.",
    );
  if (!eligible.length)
    blockers.push(
      "An APPROVED AUDIT_EVIDENCE_PACK covering the full manufacturing period with at least one retrievable validated attachment is required.",
    );
  return {
    ready: blockers.length === 0,
    blockers,
    eligible,
    validationReference: validationReference || null,
  };
}
