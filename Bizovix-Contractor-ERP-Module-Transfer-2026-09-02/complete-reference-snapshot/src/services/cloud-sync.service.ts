import { appConfig } from "@/config/app";
import type { WorkspaceBackupCounts } from "@/services/workspace-backup";

export interface CloudSyncConnection {
  connected: boolean;
  cloudUrl: string;
  accessToken: string;
  lastBackupAt: string | null;
  lastChecksumSha256: string | null;
  lastError: string | null;
}

export interface CloudBackupUploadInput {
  tenantId: string;
  companyId: string;
  workspaceId: string;
  workspaceName: string;
  sourceDeviceId: string;
  backupVersion: number;
  exportType: string;
  checksumSha256: string;
  sizeBytes: number;
  counts: WorkspaceBackupCounts;
  payload: Record<string, unknown>;
}

export interface CloudBackupRecord {
  id: string;
  tenantId: string;
  companyId: string;
  workspaceId: string;
  workspaceName: string;
  sourceDeviceId: string;
  backupVersion: number;
  exportType: string;
  checksumSha256: string;
  sizeBytes: number;
  counts: WorkspaceBackupCounts;
  createdAt: string;
}

export function buildDefaultCloudConnection(): CloudSyncConnection {
  return {
    connected: false,
    cloudUrl: appConfig.cloudSyncUrl,
    accessToken: "",
    lastBackupAt: null,
    lastChecksumSha256: null,
    lastError: null,
  };
}

export function normalizeCloudUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function buildCloudEndpoint(cloudUrl: string, path: string) {
  const normalizedBase = normalizeCloudUrl(cloudUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function parseCloudError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
  return payload?.error?.message ?? payload?.message ?? `Cloud request failed (${response.status})`;
}

async function cloudRequest<T>(connection: Pick<CloudSyncConnection, "cloudUrl" | "accessToken">, path: string, init?: RequestInit) {
  const response = await fetch(buildCloudEndpoint(connection.cloudUrl, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${connection.accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseCloudError(response));
  }

  return (await response.json()) as T;
}

export async function checkCloudSyncHealth(connection: Pick<CloudSyncConnection, "cloudUrl" | "accessToken">) {
  return cloudRequest<{ ok: boolean; service: string; checkedAt: string }>(connection, "/cloud-sync/health");
}

export async function uploadWorkspaceBackupToCloud(
  connection: Pick<CloudSyncConnection, "cloudUrl" | "accessToken">,
  input: CloudBackupUploadInput,
) {
  return cloudRequest<CloudBackupRecord>(connection, "/cloud-sync/workspace-backups", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listCloudWorkspaceBackups(connection: Pick<CloudSyncConnection, "cloudUrl" | "accessToken">, workspaceId: string) {
  return cloudRequest<CloudBackupRecord[]>(
    connection,
    `/cloud-sync/workspace-backups?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

