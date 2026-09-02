import { apiRequest } from "@/services/api-client";
import type {
  EndManufacturingDowntimeInput,
  ManufacturingDowntimeCandidate,
  ManufacturingDowntimeEvent,
  ManufacturingDowntimeReasonCode,
  StartManufacturingDowntimeInput,
} from "@/types/manufacturing-downtime";

function query(path: string, values: Record<string, string | undefined>) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) parameters.set(key, value);
  }
  const suffix = parameters.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function listManufacturingDowntimeCandidates(workspaceId: string) {
  return apiRequest<ManufacturingDowntimeCandidate[]>(
    query("/manufacturing/downtime/candidates", { workspaceId }),
  );
}

export function listManufacturingDowntimeReasonCodes(workspaceId: string) {
  return apiRequest<ManufacturingDowntimeReasonCode[]>(
    query("/manufacturing/downtime/reason-codes", { workspaceId }),
  );
}

export function listManufacturingDowntimeEvents(
  workspaceId: string,
  status?: "OPEN" | "ENDED",
) {
  return apiRequest<ManufacturingDowntimeEvent[]>(
    query("/manufacturing/downtime/events", { workspaceId, status }),
  );
}

export function startManufacturingDowntime(
  input: StartManufacturingDowntimeInput,
) {
  return apiRequest<ManufacturingDowntimeEvent>(
    "/manufacturing/downtime/events/start",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function endManufacturingDowntime(
  eventId: string,
  input: EndManufacturingDowntimeInput,
) {
  return apiRequest<ManufacturingDowntimeEvent>(
    `/manufacturing/downtime/events/${encodeURIComponent(eventId)}/end`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
