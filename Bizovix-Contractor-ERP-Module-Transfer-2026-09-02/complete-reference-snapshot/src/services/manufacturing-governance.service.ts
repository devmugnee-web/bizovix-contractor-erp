import { apiRequest } from "@/services/api-client";
import type {
  CreateManufacturingGovernanceRecordInput,
  ManufacturingGovernanceAuditEvent,
  ManufacturingGovernanceKind,
  ManufacturingGovernanceRecord,
  ManufacturingGovernanceStatus,
  ManufacturingValidationReadiness,
  ReviseManufacturingGovernanceRecordInput,
  TransitionManufacturingGovernanceRecordInput,
} from "@/types/manufacturing-governance";

type QueryValue = string | number | boolean | null | undefined;

function query(path: string, values: Record<string, QueryValue>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

function post<T>(path: string, body: unknown) {
  return apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function listManufacturingGovernanceRecords(input: {
  workspaceId: string;
  kind?: ManufacturingGovernanceKind;
  status?: ManufacturingGovernanceStatus;
  search?: string;
}) {
  return apiRequest<ManufacturingGovernanceRecord[]>(
    query("/manufacturing/governance/records", input),
  );
}

export function createManufacturingGovernanceRecord(
  input: CreateManufacturingGovernanceRecordInput,
) {
  return post<{ record: ManufacturingGovernanceRecord; replayed: boolean }>(
    "/manufacturing/governance/records",
    input,
  );
}

export function reviseManufacturingGovernanceRecord(
  recordId: string,
  input: ReviseManufacturingGovernanceRecordInput,
) {
  return post<{ record: ManufacturingGovernanceRecord; replayed: boolean }>(
    `/manufacturing/governance/records/${encodeURIComponent(recordId)}/revisions`,
    input,
  );
}

export function transitionManufacturingGovernanceRecord(
  recordId: string,
  input: TransitionManufacturingGovernanceRecordInput,
) {
  return post<{ record: ManufacturingGovernanceRecord; replayed: boolean }>(
    `/manufacturing/governance/records/${encodeURIComponent(recordId)}/transitions`,
    input,
  );
}

export function recordManufacturingControlledPrint(input: {
  workspaceId: string;
  recordId: string;
  copyNumber: string;
  copyType: "CONTROLLED" | "UNCONTROLLED";
  idempotencyKey: string;
  transactionDate: string;
  signatureMeaning: string;
  reauthenticationPassword?: string | null;
  reason?: string | null;
}) {
  return post<{
    documentNumber: string;
    version: number;
    printedBy: string;
    printedAt: string;
    copyNumber: string;
    watermark: string;
    recordId: string;
  }>("/manufacturing/governance/controlled-prints", input);
}

export function listManufacturingGovernanceAudit(input: {
  workspaceId: string;
  action?: string;
  entityId?: string;
  take?: number;
}) {
  return apiRequest<{
    events: ManufacturingGovernanceAuditEvent[];
    returned: number;
    limit: number;
  }>(query("/manufacturing/governance/audit-trail", input));
}

export function getManufacturingValidationReadiness(workspaceId: string) {
  return apiRequest<ManufacturingValidationReadiness>(
    query("/manufacturing/governance/validation-readiness", { workspaceId }),
  );
}
