import { apiRequest } from "@/services/api-client";
import type {
  CreateMaterialRequisitionInput,
  IncomingMaterialLotRecord,
  InspectIncomingMaterialLotInput,
  MaterialLotAllocationMethod,
  MaterialLotAllocationResult,
  MaterialHandlingEvidenceResult,
  MaterialHandlingVerifierRecord,
  MaterialRequisitionRecord,
  MaterialRequisitionTransitionInput,
  MaterialSourceMovementRecord,
  RecordMaterialHandlingEvidenceInput,
  RegisterIncomingMaterialLotInput,
} from "@/types/manufacturing-materials";

type QueryValue = string | number | null | undefined;

function query(path: string, values: Array<[string, QueryValue]>) {
  const params = new URLSearchParams();
  for (const [key, value] of values)
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function listMaterialSourceMovements(input: {
  workspaceId: string;
  inventoryItemId?: string;
  warehouseId?: string;
  search?: string;
}) {
  return apiRequest<MaterialSourceMovementRecord[]>(
    query("/manufacturing/materials/source-movements", Object.entries(input)),
  );
}

export function listIncomingMaterialLots(input: {
  workspaceId: string;
  inventoryItemId?: string;
  warehouseId?: string;
  status?: string;
  search?: string;
}) {
  return apiRequest<IncomingMaterialLotRecord[]>(
    query("/manufacturing/materials/incoming-lots", Object.entries(input)),
  );
}

export function registerIncomingMaterialLot(
  input: RegisterIncomingMaterialLotInput,
) {
  return apiRequest<{ lot: IncomingMaterialLotRecord; replayed: boolean }>(
    "/manufacturing/materials/incoming-lots",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function inspectIncomingMaterialLot(
  lotId: string,
  input: InspectIncomingMaterialLotInput,
) {
  return apiRequest<{
    lot: IncomingMaterialLotRecord;
    decision: string;
    replayed: boolean;
  }>(
    `/manufacturing/materials/incoming-lots/${encodeURIComponent(lotId)}/inspection`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function getMaterialLotAllocation(input: {
  workspaceId: string;
  inventoryItemId: string;
  warehouseId: string;
  method: MaterialLotAllocationMethod;
  requiredQuantity: number;
  asOf?: string;
}) {
  return apiRequest<MaterialLotAllocationResult>(
    query("/manufacturing/materials/allocation", Object.entries(input)),
  );
}

export function listMaterialRequisitions(input: {
  workspaceId: string;
  orderId?: string;
  status?: string;
}) {
  return apiRequest<MaterialRequisitionRecord[]>(
    query("/manufacturing/materials/requisitions", Object.entries(input)),
  );
}

export function listMaterialHandlingVerifiers(workspaceId: string) {
  return apiRequest<MaterialHandlingVerifierRecord[]>(
    query("/manufacturing/materials/verifiers", [["workspaceId", workspaceId]]),
  );
}

export function createMaterialRequisition(
  input: CreateMaterialRequisitionInput,
) {
  return apiRequest<{
    requisition: MaterialRequisitionRecord;
    replayed: boolean;
  }>("/manufacturing/materials/requisitions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function submitMaterialRequisition(
  requisitionId: string,
  input: MaterialRequisitionTransitionInput,
) {
  return apiRequest<{
    requisition: MaterialRequisitionRecord;
    replayed: boolean;
  }>(
    `/manufacturing/materials/requisitions/${encodeURIComponent(requisitionId)}/submit`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function approveMaterialRequisition(
  requisitionId: string,
  input: MaterialRequisitionTransitionInput,
) {
  return apiRequest<{
    requisition: MaterialRequisitionRecord;
    replayed: boolean;
  }>(
    `/manufacturing/materials/requisitions/${encodeURIComponent(requisitionId)}/approve`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function recordMaterialHandlingEvidence(
  input: RecordMaterialHandlingEvidenceInput,
) {
  return apiRequest<MaterialHandlingEvidenceResult>(
    "/manufacturing/materials/handling-evidence",
    { method: "POST", body: JSON.stringify(input) },
  );
}
