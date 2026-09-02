export const manufacturingGovernanceKinds = [
  "TOOLS_DIES_MOULDS",
  "APPROVAL_WORKFLOW",
  "USER_ACCESS_REVIEW",
  "ELECTRONIC_SIGNATURE_POLICY",
  "STATUS_CONFIGURATION",
  "ALERT_NOTIFICATION_RULE",
  "PRINT_TEMPLATE",
  "INTEGRATION_SETTING",
  "ENVIRONMENT_UTILITY_CHECK",
  "QUALITY_CASE",
  "COMPLIANCE_RECORD",
  "RECALL_DRILL",
  "DATA_RETENTION_POLICY",
  "VALIDATION_DOCUMENT",
  "AUDIT_EVIDENCE_PACK",
  "EXECUTION_EVIDENCE",
] as const;

export type ManufacturingGovernanceKind =
  (typeof manufacturingGovernanceKinds)[number];
export type ManufacturingGovernanceStatus =
  "DRAFT" | "APPROVED" | "RETIRED" | "CANCELLED";

export interface ManufacturingGovernancePayload {
  schemaVersion: number;
  details: Record<string, unknown>;
  evidenceHash: string;
  revisionReason?: string | null;
}

export interface ManufacturingGovernanceRecord {
  id: string;
  workspaceId: string;
  kind: ManufacturingGovernanceKind;
  code: string;
  name: string;
  versionNumber: number;
  status: ManufacturingGovernanceStatus;
  sourceRecordId: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  payload: ManufacturingGovernancePayload;
  createdByUserId: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateManufacturingGovernanceRecordInput {
  workspaceId: string;
  kind: ManufacturingGovernanceKind;
  code: string;
  name: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  details: Record<string, unknown>;
  idempotencyKey: string;
  transactionDate: string;
  note?: string | null;
}

export interface ReviseManufacturingGovernanceRecordInput {
  workspaceId: string;
  name: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  details: Record<string, unknown>;
  idempotencyKey: string;
  transactionDate: string;
  reason: string;
}

export interface TransitionManufacturingGovernanceRecordInput {
  workspaceId: string;
  action: "APPROVE" | "RETIRE" | "CANCEL";
  reason: string;
  signatureMeaning: string;
  reauthenticationPassword?: string | null;
  idempotencyKey: string;
  transactionDate: string;
}

export interface ManufacturingGovernanceAuditEvent {
  id: string;
  source: "AUDIT_LOG" | "WORKFLOW_REVIEW";
  occurredAt: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actor: { id: string; name: string; email?: string } | null;
  oldValues: unknown;
  newValues: unknown;
  signatureHash: string | null;
  reviewedBy?: { id: string; name: string } | null;
  approvedBy?: { id: string; name: string } | null;
}

export interface ManufacturingValidationReadiness {
  workspaceId: string;
  mode: "GENERAL" | "PHARMACEUTICAL" | "HYBRID" | null;
  ready: boolean;
  readyCount: number;
  requiredCount: number;
  checks: Array<{
    key: string;
    label: string;
    required: boolean;
    count: number;
    state: "READY" | "BLOCKED" | "NOT_REQUIRED";
  }>;
  evaluatedAt: string;
}
