import { getDataProvider } from "@/services/data-provider";
import { apiRequest } from "@/services/api-client";
import type { DataMode } from "@/types/domain";

export function listWorkspaces(mode: DataMode) {
  return getDataProvider(mode).workspaces.list();
}

export async function selectWorkspace(mode: DataMode, workspaceId: string) {
  if (mode === "api") {
    await apiRequest(`/workspaces/${encodeURIComponent(workspaceId)}/select`, { method: "POST" });
    return;
  }

  return Promise.resolve();
}

/**
 * In api mode the sidebar and printed documents read the company name off the
 * backend record, so renaming the business has to be pushed there too — saving
 * it only in the local profile would leave the old name everywhere else.
 */
export async function updateCompanyName(mode: DataMode, workspaceId: string, name: string) {
  if (mode !== "api") {
    return;
  }

  await apiRequest(`/workspaces/${encodeURIComponent(workspaceId)}/company`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}
