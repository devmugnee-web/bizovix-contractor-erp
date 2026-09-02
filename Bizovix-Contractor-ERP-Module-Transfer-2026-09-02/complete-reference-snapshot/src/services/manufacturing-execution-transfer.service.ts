import { apiRequest } from "@/services/api-client";
import type {
  ManufacturingExecutionTransferContext,
  ManufacturingExecutionTransferKind,
  ManufacturingExecutionTransferRecord,
  PostManufacturingExecutionTransferInput,
} from "@/types/manufacturing-execution-transfer";

export function getManufacturingExecutionTransferContext(input: {
  workspaceId: string;
  kind: ManufacturingExecutionTransferKind;
}) {
  const params = new URLSearchParams({
    workspaceId: input.workspaceId,
    kind: input.kind,
  });
  return apiRequest<ManufacturingExecutionTransferContext>(
    `/manufacturing/execution-transfers/context?${params.toString()}`,
  );
}

export function postManufacturingExecutionTransfer(
  input: PostManufacturingExecutionTransferInput,
) {
  return apiRequest<{
    transfer: ManufacturingExecutionTransferRecord;
    replayed: boolean;
  }>("/manufacturing/execution-transfers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
