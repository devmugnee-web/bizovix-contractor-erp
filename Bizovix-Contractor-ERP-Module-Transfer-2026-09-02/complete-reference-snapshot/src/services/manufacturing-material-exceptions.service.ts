import { apiRequest } from "@/services/api-client";
import type {
  CreateMaterialExceptionInput,
  DecideMaterialExceptionInput,
  MaterialControlView,
  RetestManufacturingInventoryLotInput,
} from "@/types/manufacturing-material-exceptions";

export function getMaterialControlView(input: {
  workspaceId: string;
  orderId?: string;
}) {
  const params = new URLSearchParams({ workspaceId: input.workspaceId });
  if (input.orderId) params.set("orderId", input.orderId);
  return apiRequest<MaterialControlView>(
    `/manufacturing/material-controls?${params.toString()}`,
  );
}

export function createMaterialException(input: CreateMaterialExceptionInput) {
  return apiRequest<{ request: { id: string }; replayed: boolean }>(
    "/manufacturing/material-controls",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function decideMaterialException(
  requestId: string,
  input: DecideMaterialExceptionInput,
) {
  return apiRequest<{ decision: { id: string }; replayed: boolean }>(
    `/manufacturing/material-controls/${encodeURIComponent(requestId)}/decision`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function retestManufacturingInventoryLot(
  lotId: string,
  input: RetestManufacturingInventoryLotInput,
) {
  return apiRequest<{
    action: { id: string };
    lot: { id: string; retestDueAt: string | null };
    replayed: boolean;
  }>(
    `/manufacturing/material-controls/lots/${encodeURIComponent(lotId)}/retest`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
