import { apiRequest } from "@/services/api-client";
import type { DataMode } from "@/types/domain";

export interface AutoBackupSettingsPayload {
  settings: Record<string, unknown>;
  history: unknown[];
  taxRates: unknown[];
  taxGroups: unknown[];
  currencies: unknown[];
}

export interface AutoBackupSettingsRecord extends AutoBackupSettingsPayload {
  id?: string;
  workspaceId: string;
  namespace: "auto-backup";
  createdAt: string | null;
  updatedAt: string | null;
}

export function getWorkspaceAutoBackupSettings(workspaceId: string) {
  return apiRequest<AutoBackupSettingsRecord>(`/workspaces/${encodeURIComponent(workspaceId)}/app-settings/auto-backup`);
}

export function saveWorkspaceAutoBackupSettings(workspaceId: string, payload: AutoBackupSettingsPayload) {
  return apiRequest<AutoBackupSettingsRecord>(`/workspaces/${encodeURIComponent(workspaceId)}/app-settings/auto-backup`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function normalizeDeadStockMonths(value: unknown) {
  const months = Number(value);
  return Number.isSafeInteger(months) && months >= 1 ? months : 12;
}

export async function getWorkspaceDeadStockMonths(mode: DataMode, workspaceId: string) {
  if (mode === "api") {
    const record = await getWorkspaceAutoBackupSettings(workspaceId);
    return normalizeDeadStockMonths(record.settings.deadStockMonths);
  }
  if (typeof window === "undefined") return 12;
  const raw = window.localStorage.getItem(`bizovix:auto-backup:${mode}:${workspaceId}`);
  if (!raw) return 12;
  try {
    return normalizeDeadStockMonths((JSON.parse(raw) as Record<string, unknown>).deadStockMonths);
  } catch {
    return 12;
  }
}

export type CostingMethod = "MOVING_WEIGHTED_AVERAGE" | "PERIODIC_WEIGHTED_AVERAGE" | "FIFO" | "LIFO";

export interface CostingSettingsRecord {
  costingMethod: CostingMethod;
  supportedCostingMethods: CostingMethod[];
}

export function getWorkspaceCostingSettings(workspaceId: string) {
  return apiRequest<CostingSettingsRecord>(`/workspaces/${encodeURIComponent(workspaceId)}/app-settings/costing-method`);
}
