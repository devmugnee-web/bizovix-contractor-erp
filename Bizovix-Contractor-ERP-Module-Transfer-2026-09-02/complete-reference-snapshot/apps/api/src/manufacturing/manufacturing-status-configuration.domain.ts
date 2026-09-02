export type ManufacturingStatusConfigurationCandidate = {
  id: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  payload: unknown;
};

export type ManufacturingStatusPolicyDecision =
  | { configured: false; allowed: true; permissionKey: null; recordId: null }
  | {
      configured: true;
      allowed: boolean;
      permissionKey: string | null;
      recordId: string;
    };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveManufacturingStatusPolicy(
  candidates: ManufacturingStatusConfigurationCandidate[],
  input: {
    workflowScope: string;
    fromStatus: string;
    toStatus: string;
    at: Date;
  },
): ManufacturingStatusPolicyDecision {
  const active = candidates.find((candidate) => {
    if (candidate.effectiveFrom && candidate.effectiveFrom > input.at)
      return false;
    if (candidate.effectiveTo && candidate.effectiveTo < input.at) return false;
    const details = object(object(candidate.payload).details);
    return text(details.workflowScope) === input.workflowScope;
  });
  if (!active) {
    return {
      configured: false,
      allowed: true,
      permissionKey: null,
      recordId: null,
    };
  }
  const details = object(object(active.payload).details);
  const transitions = Array.isArray(details.transitions)
    ? details.transitions.map(object)
    : [];
  const transition = transitions.find(
    (entry) =>
      text(entry.from) === input.fromStatus &&
      text(entry.to) === input.toStatus,
  );
  return {
    configured: true,
    allowed: Boolean(transition),
    permissionKey: transition ? text(transition.permissionKey) : null,
    recordId: active.id,
  };
}
