import { apiRequest } from "@/services/api-client";
import type { DataMode } from "@/types/domain";

export type WorkflowPolicy = "DIRECT" | "ORDER_BASED" | "BOTH";
export type WorkflowRootKind = "DIRECT" | "ORDER_BASED";
export type WorkflowSettingsLoadState = "READY" | "PENDING" | "ERROR";

export type WorkflowRootAccess =
  | { allowed: true; reason: null }
  | { allowed: false; reason: "SETTINGS_PENDING" | "SETTINGS_ERROR" | "POLICY_MISMATCH" };

export interface WorkflowSettingsRecord {
  purchaseWorkflow: WorkflowPolicy;
  salesWorkflow: WorkflowPolicy;
  updatedAt: string | null;
}

export const defaultWorkflowSettings: WorkflowSettingsRecord = {
  // BOTH is the migration-safe default: existing workspaces keep every route
  // they could use before workflow preferences were introduced.
  purchaseWorkflow: "BOTH",
  salesWorkflow: "BOTH",
  updatedAt: null,
};

export function workflowSettingsQueryKey(mode: DataMode, workspaceId: string) {
  return [mode, "workflow-settings", workspaceId] as const;
}

export function isWorkflowSettingsQueryKeyForMode(
  queryKey: readonly unknown[],
  mode: DataMode,
) {
  return queryKey[0] === mode && queryKey[1] === "workflow-settings";
}

/**
 * New transaction roots fail closed until the company policy is known. Existing
 * documents and source-linked child documents deliberately do not use this
 * helper, so changing mode never strands an in-progress order chain.
 */
export function evaluateWorkflowRootAccess(
  policy: WorkflowPolicy,
  root: WorkflowRootKind,
  loadState: WorkflowSettingsLoadState,
): WorkflowRootAccess {
  if (loadState === "PENDING") {
    return { allowed: false, reason: "SETTINGS_PENDING" };
  }
  if (loadState === "ERROR") {
    return { allowed: false, reason: "SETTINGS_ERROR" };
  }
  if (policy !== "BOTH" && policy !== root) {
    return { allowed: false, reason: "POLICY_MISMATCH" };
  }
  return { allowed: true, reason: null };
}

function storageKey(mode: DataMode, workspaceId: string) {
  return `bizovix:workflow-settings:${mode}:${workspaceId}`;
}

function isWorkflowPolicy(value: unknown): value is WorkflowPolicy {
  return value === "DIRECT" || value === "ORDER_BASED" || value === "BOTH";
}

export function normalizeWorkflowSettings(value: unknown): WorkflowSettingsRecord {
  const input = value && typeof value === "object" ? value as Partial<WorkflowSettingsRecord> : {};
  return {
    purchaseWorkflow: isWorkflowPolicy(input.purchaseWorkflow)
      ? input.purchaseWorkflow
      : defaultWorkflowSettings.purchaseWorkflow,
    salesWorkflow: isWorkflowPolicy(input.salesWorkflow)
      ? input.salesWorkflow
      : defaultWorkflowSettings.salesWorkflow,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
  };
}

function readLocalWorkflowSettings(mode: DataMode, workspaceId: string) {
  if (typeof window === "undefined") return defaultWorkflowSettings;
  const raw = window.localStorage.getItem(storageKey(mode, workspaceId));
  if (!raw) return defaultWorkflowSettings;
  try {
    return normalizeWorkflowSettings(JSON.parse(raw));
  } catch {
    return defaultWorkflowSettings;
  }
}

export async function getWorkspaceWorkflowSettings(mode: DataMode, workspaceId: string) {
  if (mode === "api") {
    return normalizeWorkflowSettings(
      await apiRequest<WorkflowSettingsRecord>(
        `/workspaces/${encodeURIComponent(workspaceId)}/app-settings/workflow`,
      ),
    );
  }
  return readLocalWorkflowSettings(mode, workspaceId);
}

export async function saveWorkspaceWorkflowSettings(
  mode: DataMode,
  workspaceId: string,
  input: Pick<WorkflowSettingsRecord, "purchaseWorkflow" | "salesWorkflow">,
) {
  const normalized = normalizeWorkflowSettings(input);
  if (mode === "api") {
    return normalizeWorkflowSettings(
      await apiRequest<WorkflowSettingsRecord>(
        `/workspaces/${encodeURIComponent(workspaceId)}/app-settings/workflow`,
        {
          method: "PUT",
          body: JSON.stringify({
            purchaseWorkflow: normalized.purchaseWorkflow,
            salesWorkflow: normalized.salesWorkflow,
          }),
        },
      ),
    );
  }

  const record = { ...normalized, updatedAt: new Date().toISOString() };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey(mode, workspaceId), JSON.stringify(record));
  }
  return record;
}

export function workflowPreset(settings: Pick<WorkflowSettingsRecord, "purchaseWorkflow" | "salesWorkflow">) {
  if (settings.purchaseWorkflow === "DIRECT" && settings.salesWorkflow === "DIRECT") return "DIRECT" as const;
  if (settings.purchaseWorkflow === "ORDER_BASED" && settings.salesWorkflow === "ORDER_BASED") return "ADVANCED" as const;
  return "CUSTOM" as const;
}
