import { appConfig } from "@/config/app";
import { apiRequest } from "@/services/api-client";
import { readDataset } from "@/services/browser-dataset";
import { listWorkspaces } from "@/services/workspace.service";
import type { DataMode } from "@/types/domain";

export const WORKSPACE_BACKUP_KEY = "bizovix-erp-workspace-backup";
export const WORKSPACE_BACKUP_EXPORT_TYPE = "workspace-slice-backup";

export type WorkspaceBackupCounts = {
  parties: number;
  items: number;
  categories: number;
  units: number;
  vouchers: number;
  settings: number;
};

export type WorkspaceBackupFile = {
  filename: string;
  payload: Record<string, unknown>;
  counts: WorkspaceBackupCounts;
  sizeBytes: number;
  text: string;
};

function slugifyFileSegment(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace"
  );
}

function formatBackupTimestampForFile(value: Date) {
  const pad = (input: number) => input.toString().padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}_${pad(value.getHours())}-${pad(value.getMinutes())}-${pad(value.getSeconds())}`;
}

/**
 * Every workspace-scoped browser setting (print themes, cheques, loans, bank
 * accounts, transfers, sync users...) lives under a `bizovix:<feature>:<mode>:<workspaceId>`
 * key, so the whole local side of a workspace can be captured by suffix match.
 */
function collectWorkspaceStorage(mode: DataMode, workspaceId: string) {
  if (typeof window === "undefined") {
    return {};
  }

  const suffix = `:${mode}:${workspaceId}`;
  return Object.keys(window.localStorage)
    .sort()
    .reduce<Record<string, unknown>>((entries, key) => {
      if (!key.startsWith("bizovix:") || !key.includes(suffix)) {
        return entries;
      }

      const raw = window.localStorage.getItem(key);
      if (raw === null) {
        return entries;
      }

      try {
        entries[key] = JSON.parse(raw) as unknown;
      } catch {
        entries[key] = raw;
      }

      return entries;
    }, {});
}

async function resolveWorkspaceName(mode: DataMode, workspaceId: string) {
  if (mode !== "api") {
    return readDataset(mode).workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? workspaceId;
  }

  try {
    const workspaces = await listWorkspaces("api");
    return workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? workspaceId;
  } catch {
    return workspaceId;
  }
}

async function loadApiWorkspaceData(workspaceId: string) {
  const query = `workspaceId=${encodeURIComponent(workspaceId)}`;
  const [parties, items, categories, units, vouchers] = await Promise.all([
    apiRequest<unknown[]>(`/parties?${query}`),
    apiRequest<unknown[]>(`/inventory/items?${query}`),
    apiRequest<unknown[]>(`/inventory/categories?${query}`),
    apiRequest<unknown[]>(`/inventory/units?${query}`),
    apiRequest<unknown[]>(`/vouchers/day-book?${query}`),
  ]);

  return { parties, items, categories, units, vouchers };
}

/**
 * Builds the complete, restorable snapshot of one workspace. In API mode this
 * reads the live database rather than the browser dataset, so a desktop backup
 * genuinely contains the business data and not just local UI settings.
 */
export async function buildWorkspaceBackup(mode: DataMode, workspaceId: string): Promise<WorkspaceBackupFile> {
  const now = new Date();
  const workspaceName = await resolveWorkspaceName(mode, workspaceId);
  const localStorageEntries = collectWorkspaceStorage(mode, workspaceId);

  let dataset: Record<string, unknown> | null = null;
  let counts: WorkspaceBackupCounts = {
    parties: 0,
    items: 0,
    categories: 0,
    units: 0,
    vouchers: 0,
    settings: Object.keys(localStorageEntries).length,
  };

  if (mode === "api") {
    const workspaceData = await loadApiWorkspaceData(workspaceId);
    dataset = {
      workspace: { id: workspaceId, name: workspaceName },
      parties: workspaceData.parties,
      stockItems: workspaceData.items,
      inventoryCategories: workspaceData.categories,
      inventoryUnits: workspaceData.units,
      vouchers: workspaceData.vouchers,
    };
    counts = {
      parties: workspaceData.parties.length,
      items: workspaceData.items.length,
      categories: workspaceData.categories.length,
      units: workspaceData.units.length,
      vouchers: workspaceData.vouchers.length,
      settings: Object.keys(localStorageEntries).length,
    };
  } else {
    const browserDataset = readDataset(mode);
    const parties = browserDataset.parties.filter((party) => party.workspaceId === workspaceId);
    const stockItems = browserDataset.stockItems.filter((item) => item.workspaceId === workspaceId);
    const vouchers = browserDataset.vouchers.filter((voucher) => voucher.workspaceId === workspaceId);

    dataset = {
      workspace: browserDataset.workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
      parties,
      stockItems,
      inventoryCategories: [],
      inventoryUnits: [],
      vouchers,
    };
    counts = {
      parties: parties.length,
      items: stockItems.length,
      categories: 0,
      units: 0,
      vouchers: vouchers.length,
      settings: Object.keys(localStorageEntries).length,
    };
  }

  const payload = {
    appName: appConfig.appName,
    softwareKey: WORKSPACE_BACKUP_KEY,
    backupVersion: 2,
    exportType: WORKSPACE_BACKUP_EXPORT_TYPE,
    exportedAt: now.toISOString(),
    companyName: workspaceName,
    mode,
    counts,
    scope: {
      workspaceOnly: true,
      workspaceId,
      workspaceName,
    },
    data: {
      dataset,
      localStorage: localStorageEntries,
    },
  };

  const text = JSON.stringify(payload, null, 2);

  return {
    filename: `${formatBackupTimestampForFile(now)}_${slugifyFileSegment(workspaceName)}_bizovix-workspace-backup.fyb`,
    payload,
    counts,
    sizeBytes: new Blob([text]).size,
    text,
  };
}

export function downloadWorkspaceBackup(backup: WorkspaceBackupFile) {
  if (typeof window === "undefined") {
    return;
  }

  const blob = new Blob([backup.text], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = backup.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function describeBackupCounts(counts: WorkspaceBackupCounts) {
  return [
    `${counts.parties} part${counts.parties === 1 ? "y" : "ies"}`,
    `${counts.items} item${counts.items === 1 ? "" : "s"}`,
    `${counts.vouchers} voucher${counts.vouchers === 1 ? "" : "s"}`,
    `${counts.settings} setting file${counts.settings === 1 ? "" : "s"}`,
  ].join(" · ");
}

export function formatBackupSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}
