import type {
  ManufacturingMode,
  ManufacturingOrderStatus,
  ManufacturingOrderType,
  ManufacturingProductionOrderRecord,
  ManufacturingRunRecord,
} from "@/types/manufacturing";

export type ManufacturingWorkflowStartOrderCandidate = Pick<
  ManufacturingProductionOrderRecord,
  "id" | "orderType" | "status" | "operationExecutions"
> & {
  // Keep the check defensive for legacy rows created before routing became
  // mandatory, even though new typed order records always carry a value.
  routingVersionId: string | null;
};

export type ManufacturingWorkflowStartOrderIneligibility =
  | "UNSUPPORTED_ORDER_TYPE"
  | "TERMINAL_ORDER"
  | "ACTIVE_RUN_EXISTS"
  | "MODE_MISMATCH"
  | "ROUTING_REQUIRED"
  | "ROUTING_OPERATIONS_REQUIRED";

const workflowStartOrderTypes = new Set<ManufacturingOrderType>([
  "ASSEMBLY",
  "PHARMACEUTICAL",
  "SUBCONTRACT",
]);

const workflowStartTerminalStatuses = new Set<ManufacturingOrderStatus>([
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
]);

export function manufacturingWorkflowStartOrderIneligibility(
  order: ManufacturingWorkflowStartOrderCandidate,
  context: {
    manufacturingMode?: ManufacturingMode;
    activeRunOrderIds: ReadonlySet<string>;
  },
): ManufacturingWorkflowStartOrderIneligibility | null {
  if (!workflowStartOrderTypes.has(order.orderType))
    return "UNSUPPORTED_ORDER_TYPE";
  if (workflowStartTerminalStatuses.has(order.status)) return "TERMINAL_ORDER";
  if (context.activeRunOrderIds.has(order.id)) return "ACTIVE_RUN_EXISTS";
  if (
    (context.manufacturingMode === "GENERAL" &&
      order.orderType === "PHARMACEUTICAL") ||
    (context.manufacturingMode === "PHARMACEUTICAL" &&
      order.orderType === "ASSEMBLY")
  )
    return "MODE_MISMATCH";
  if (!order.routingVersionId?.trim()) return "ROUTING_REQUIRED";
  if (order.operationExecutions.length === 0)
    return "ROUTING_OPERATIONS_REQUIRED";
  return null;
}

export function summarizeManufacturingWorkflowOrderIneligibility(
  reasons: readonly ManufacturingWorkflowStartOrderIneligibility[],
) {
  const counts = reasons.reduce<
    Partial<Record<ManufacturingWorkflowStartOrderIneligibility, number>>
  >((result, reason) => {
    result[reason] = (result[reason] ?? 0) + 1;
    return result;
  }, {});
  const parts = [
    counts.ROUTING_REQUIRED
      ? `${counts.ROUTING_REQUIRED} need an approved routing`
      : null,
    counts.ROUTING_OPERATIONS_REQUIRED
      ? `${counts.ROUTING_OPERATIONS_REQUIRED} have no routing operations`
      : null,
    counts.ACTIVE_RUN_EXISTS
      ? `${counts.ACTIVE_RUN_EXISTS} already have an active run`
      : null,
    counts.MODE_MISMATCH
      ? `${counts.MODE_MISMATCH} do not match the company mode`
      : null,
    counts.TERMINAL_ORDER
      ? `${counts.TERMINAL_ORDER} are already terminal`
      : null,
    counts.UNSUPPORTED_ORDER_TYPE
      ? `${counts.UNSUPPORTED_ORDER_TYPE} use a different order workflow`
      : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join("; ");
}

export function isLegacyUnboundDraftManufacturingRun(
  run: Pick<
    ManufacturingRunRecord,
    "status" | "productionOrderId" | "productionPlanId" | "productId"
  >,
) {
  return (
    run.status === "DRAFT" &&
    !run.productionOrderId &&
    !run.productionPlanId &&
    !run.productId
  );
}

export function isManufacturingRunVisiblyUntouched(run: {
  steps: ReadonlyArray<
    Pick<
      ManufacturingRunRecord["steps"][number],
      | "occurrenceKey"
      | "status"
      | "sourceRecordType"
      | "sourceRecordId"
      | "startedAt"
      | "completedAt"
      | "completedBy"
      | "approvedBy"
      | "signatureReference"
      | "version"
    >
  >;
}) {
  return run.steps.every(
    (step) =>
      step.occurrenceKey === "PRIMARY" &&
      ["READY", "N_A", "LOCKED", "BLOCKED"].includes(step.status) &&
      !step.sourceRecordType &&
      !step.sourceRecordId &&
      !step.startedAt &&
      !step.completedAt &&
      !step.completedBy &&
      !step.approvedBy &&
      !step.signatureReference &&
      step.version === 1,
  );
}
