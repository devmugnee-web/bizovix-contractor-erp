export const APPROVAL_SENSITIVE_ORDER_ACTIONS = [
  "APPROVE",
  "AMEND",
  "CANCEL",
  "POST_SCRAP_DISPOSITION",
  "CREATE_REWORK_DISPOSITION",
  "RECORD_IN_PROCESS_RESULT",
  "RECORD_QUALITY_RESULT",
  "QA_RELEASE",
  "CLOSE",
] as const;

export function isApprovalSensitiveOrderAction(action: string) {
  return (APPROVAL_SENSITIVE_ORDER_ACTIONS as readonly string[]).includes(
    action,
  );
}

export function evaluateOrderActionApprovalControls(input: {
  action: string;
  approvalRequired: boolean;
  electronicSignatureRequired: boolean;
  orderCreatorUserId: string;
  actingUserId: string;
  signatureMeaning?: string | null;
}) {
  const issues: Array<"MAKER_CHECKER_REQUIRED" | "SIGNATURE_MEANING_REQUIRED"> =
    [];
  if (
    input.action === "APPROVE" &&
    input.approvalRequired &&
    input.orderCreatorUserId === input.actingUserId
  ) {
    issues.push("MAKER_CHECKER_REQUIRED");
  }
  if (
    input.electronicSignatureRequired &&
    isApprovalSensitiveOrderAction(input.action) &&
    !clean(input.signatureMeaning)
  ) {
    issues.push("SIGNATURE_MEANING_REQUIRED");
  }
  return issues;
}

export type ManufacturingQualityMode = "GENERAL" | "PHARMACEUTICAL" | "HYBRID";

export function satisfiesPassedQualityInspectionIndependence(input: {
  mode: ManufacturingQualityMode;
  status: string;
  inspectedByUserId?: string | null;
  approvedByUserId?: string | null;
}) {
  if (input.status !== "PASSED") return false;
  if (input.mode === "GENERAL") return true;
  const inspectorId = clean(input.inspectedByUserId);
  const approverId = clean(input.approvedByUserId);
  return Boolean(inspectorId && approverId && inspectorId !== approverId);
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isOpenQualityCaseLinkedToOrder(
  record: {
    status: string;
    inventoryItemId?: string | null;
    payload?: unknown;
  },
  order: { id: string; finishedProductId: string },
) {
  if (["CANCELLED", "RETIRED"].includes(record.status)) return false;
  const payload =
    record.payload &&
    typeof record.payload === "object" &&
    !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>)
      : {};
  const wrappedDetails =
    payload.details &&
    typeof payload.details === "object" &&
    !Array.isArray(payload.details)
      ? (payload.details as Record<string, unknown>)
      : {};
  const detail = (key: string) => wrappedDetails[key] ?? payload[key];
  const state =
    clean(detail("state"))?.toUpperCase().replaceAll(" ", "_") ?? "";
  if (["CLOSED", "RESOLVED", "CANCELLED"].includes(state)) return false;
  const linkedOrderId =
    clean(detail("orderId")) ?? clean(detail("productionOrderId"));
  const linkedProductId =
    record.inventoryItemId ??
    clean(detail("inventoryItemId")) ??
    clean(detail("productId")) ??
    clean(detail("finishedProductId"));
  return (
    linkedOrderId === order.id || linkedProductId === order.finishedProductId
  );
}
