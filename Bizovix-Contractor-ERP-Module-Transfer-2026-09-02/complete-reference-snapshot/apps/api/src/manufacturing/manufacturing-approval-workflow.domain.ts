export type ManufacturingApprovalStage = {
  sequence: number;
  permissionKey: string;
  signatureMeaning: string;
};

export const MANUFACTURING_APPROVAL_WORKFLOW_SCOPES = [
  "BOM_VERSION",
  "ROUTING_VERSION",
  "PRODUCTION_PLAN",
  "SUPPLY_SUGGESTION",
  "PRODUCTION_ORDER",
  "MATERIAL_ISSUE",
  "PRODUCTION_COMPLETION",
  "QUALITY_RESULT",
  "FINAL_RELEASE",
] as const;

export type ManufacturingApprovalWorkflowScope =
  (typeof MANUFACTURING_APPROVAL_WORKFLOW_SCOPES)[number];

function approvalWorkflowDetails(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;
  const root = payload as Record<string, unknown>;
  const details = root.details;
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : root;
}

export function parseManufacturingApprovalWorkflow(
  payload: unknown,
  workflowScope: string,
) {
  const value = approvalWorkflowDetails(payload);
  if (!value) return null;
  if (
    String(value.workflowScope ?? "")
      .trim()
      .toUpperCase() !== workflowScope.toUpperCase()
  )
    return null;
  if (!Array.isArray(value.stages)) return null;
  const stages = value.stages.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return null;
    const stage = entry as Record<string, unknown>;
    const sequence = Number(stage.sequence);
    const permissionKey =
      typeof stage.permissionKey === "string" ? stage.permissionKey.trim() : "";
    const signatureMeaning =
      typeof stage.signatureMeaning === "string"
        ? stage.signatureMeaning.trim()
        : "";
    return Number.isInteger(sequence) &&
      sequence > 0 &&
      permissionKey &&
      signatureMeaning
      ? { sequence, permissionKey, signatureMeaning }
      : null;
  });
  if (stages.some((stage) => !stage)) return null;
  const ordered = (stages as ManufacturingApprovalStage[]).sort(
    (left, right) => left.sequence - right.sequence,
  );
  if (
    !ordered.length ||
    new Set(ordered.map((stage) => stage.sequence)).size !== ordered.length ||
    ordered.some((stage, index) => stage.sequence !== index + 1)
  )
    return null;
  return ordered;
}

export function approvalProgress(totalStages: number, completedStages: number) {
  const completed = Math.min(Math.max(0, completedStages), totalStages);
  return {
    totalStages,
    completedStages: completed,
    nextStage: completed < totalStages ? completed + 1 : null,
    complete: totalStages > 0 && completed === totalStages,
  };
}
