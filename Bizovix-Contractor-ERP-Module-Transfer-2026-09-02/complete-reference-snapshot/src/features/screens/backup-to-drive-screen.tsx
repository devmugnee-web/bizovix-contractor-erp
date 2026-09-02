"use client";

import { CheckCircle2, CloudUpload, Copy, DatabaseBackup, Link2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentSessionQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatDateTime } from "@/lib/format";
import {
  buildDefaultCloudConnection,
  checkCloudSyncHealth,
  listCloudWorkspaceBackups,
  normalizeCloudUrl,
  sha256Hex,
  uploadWorkspaceBackupToCloud,
  type CloudBackupRecord,
  type CloudSyncConnection,
} from "@/services/cloud-sync.service";
import {
  buildWorkspaceBackup,
  describeBackupCounts,
  formatBackupSize,
  WORKSPACE_BACKUP_EXPORT_TYPE,
} from "@/services/workspace-backup";

type ConnectionFormState = {
  cloudUrl: string;
  accessToken: string;
};

function getDeviceId() {
  if (typeof window === "undefined") {
    return "desktop-device";
  }

  const key = "bizovix:desktop-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

function formatCloudDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return formatDateTime(value);
}

function maskToken(value: string) {
  if (value.length <= 10) {
    return "Saved token";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function BackupToDriveScreen() {
  const { mode, session } = useSessionContext();
  const currentSessionQuery = useCurrentSessionQuery(mode);
  const workspaceId = session?.workspaceId ?? "default";
  const storageKey = `bizovix:cloud-sync:${mode}:${workspaceId}`;
  const [connection, setConnection] = useState<CloudSyncConnection>(buildDefaultCloudConnection);
  const [form, setForm] = useState<ConnectionFormState>(() => ({
    cloudUrl: buildDefaultCloudConnection().cloudUrl,
    accessToken: "",
  }));
  const [history, setHistory] = useState<CloudBackupRecord[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      const fallback = buildDefaultCloudConnection();
      setConnection(fallback);
      setForm({
        cloudUrl: fallback.cloudUrl,
        accessToken: fallback.cloudUrl.includes("localhost") || fallback.cloudUrl.includes("127.0.0.1") ? "local-cloud-dev-token" : "",
      });
      return;
    }

    try {
      const parsed = { ...buildDefaultCloudConnection(), ...(JSON.parse(raw) as Partial<CloudSyncConnection>) };
      setConnection(parsed);
      setForm({
        cloudUrl: parsed.cloudUrl,
        accessToken: parsed.accessToken,
      });
    } catch {
      window.localStorage.removeItem(storageKey);
      setConnection(buildDefaultCloudConnection());
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(connection));
  }, [connection, storageKey]);

  const activeSession = currentSessionQuery.data;
  const latestHistory = history[0] ?? null;
  const statusLabel = connection.connected ? "Connected" : "Not connected";
  const canUpload = connection.connected && Boolean(activeSession?.tenant.id && activeSession.company.id && session?.workspaceId);

  const connectionSummary = useMemo(() => {
    if (!connection.connected) {
      return "Connect this desktop install to your hosted Bizovix Cloud API.";
    }

    return `Cloud endpoint ${connection.cloudUrl} is ready for ${activeSession?.company.name ?? "this company"}.`;
  }, [activeSession?.company.name, connection.cloudUrl, connection.connected]);

  async function handleConnect() {
    const cloudUrl = normalizeCloudUrl(form.cloudUrl);
    const accessToken = form.accessToken.trim();

    if (!cloudUrl) {
      toast.error("Cloud API URL is required");
      return;
    }

    if (!accessToken) {
      toast.error("Cloud access token is required");
      return;
    }

    try {
      setIsConnecting(true);
      await checkCloudSyncHealth({ cloudUrl, accessToken });
      const connectedConnection = {
        connected: true,
        cloudUrl,
        accessToken,
        lastBackupAt: connection.lastBackupAt,
        lastChecksumSha256: connection.lastChecksumSha256,
        lastError: null,
      };
      setConnection(connectedConnection);
      toast.success("Bizovix Cloud connected");
      await refreshHistory(connectedConnection);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cloud connection failed";
      setConnection((current) => ({ ...current, connected: false, lastError: message }));
      toast.error(message);
    } finally {
      setIsConnecting(false);
    }
  }

  async function refreshHistory(targetConnection = connection) {
    if (!targetConnection.connected || !session?.workspaceId) {
      return;
    }

    try {
      setIsLoadingHistory(true);
      const records = await listCloudWorkspaceBackups(targetConnection, session.workspaceId);
      setHistory(records);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load cloud backup history");
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function handleUploadBackup() {
    if (mode !== "api") {
      toast.error("Real cloud backup needs API mode");
      return;
    }

    if (!activeSession || !session?.workspaceId) {
      toast.error("Active company session is not ready");
      return;
    }

    if (!connection.connected) {
      toast.error("Connect Bizovix Cloud first");
      return;
    }

    try {
      setIsUploading(true);
      const backup = await buildWorkspaceBackup(mode, session.workspaceId);
      const checksumSha256 = await sha256Hex(backup.text);
      const workspaceName = String((backup.payload.scope as { workspaceName?: string } | undefined)?.workspaceName ?? session.workspaceId);
      const record = await uploadWorkspaceBackupToCloud(connection, {
        tenantId: activeSession.tenant.id,
        companyId: activeSession.company.id,
        workspaceId: session.workspaceId,
        workspaceName,
        sourceDeviceId: getDeviceId(),
        backupVersion: Number(backup.payload.backupVersion ?? 2),
        exportType: WORKSPACE_BACKUP_EXPORT_TYPE,
        checksumSha256,
        sizeBytes: backup.sizeBytes,
        counts: backup.counts,
        payload: backup.payload,
      });

      setConnection((current) => ({
        ...current,
        lastBackupAt: record.createdAt,
        lastChecksumSha256: record.checksumSha256,
        lastError: null,
      }));
      setHistory((current) => [record, ...current.filter((entry) => entry.id !== record.id)].slice(0, 20));
      toast.success(`Cloud backup uploaded: ${describeBackupCounts(backup.counts)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cloud backup failed";
      setConnection((current) => ({ ...current, lastError: message }));
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  }

  async function copyCloudDetails() {
    try {
      await navigator.clipboard.writeText(
        `Cloud URL: ${connection.cloudUrl}\nToken: ${connection.accessToken ? maskToken(connection.accessToken) : "Not saved"}\nLast Backup: ${formatCloudDate(connection.lastBackupAt)}`,
      );
      toast.success("Cloud details copied");
    } catch {
      toast.error("Could not copy cloud details");
    }
  }

  function disconnect() {
    const fallback = buildDefaultCloudConnection();
    setConnection(fallback);
    setForm({ cloudUrl: fallback.cloudUrl, accessToken: "" });
    setHistory([]);
    toast.success("Cloud disconnected");
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d7dfeb] px-4 py-4">
        <div>
          <div className="text-[18px] font-semibold text-[#23365a]">Backup to Bizovix Cloud</div>
          <div className="mt-1 text-sm text-[#72819c]">{connectionSummary}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${connection.connected ? "bg-[#ecfdf5] text-[#0f9f63]" : "bg-[#fff8e7] text-[#b45309]"}`}>
            {connection.connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {statusLabel}
          </span>
          <Button type="button" variant="outline" className="rounded-full border-[#dbe4ef]" onClick={() => void refreshHistory()} disabled={!connection.connected || isLoadingHistory}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingHistory ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <div className="rounded-[8px] border border-[#dbe4ef] bg-[#fbfdff] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eef5ff] text-[#2477ff]">
                <Link2 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[#23365a]">Cloud Connection</div>
                <div className="text-xs text-[#7787a3]">Use the cloud URL and token issued for this customer.</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-sm font-medium text-[#52627d]">Cloud API URL</span>
                <Input
                  value={form.cloudUrl}
                  onChange={(event) => setForm((current) => ({ ...current, cloudUrl: event.target.value }))}
                  placeholder="https://cloud.bizovix.com/api/v1"
                  className="h-11 rounded-[8px] border-[#cfd8e6]"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm font-medium text-[#52627d]">Access Token</span>
                <Input
                  value={form.accessToken}
                  onChange={(event) => setForm((current) => ({ ...current, accessToken: event.target.value }))}
                  placeholder="Paste customer cloud token"
                  type="password"
                  className="h-11 rounded-[8px] border-[#cfd8e6]"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="button" className="rounded-full bg-primary px-6" onClick={() => void handleConnect()} disabled={isConnecting}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                {isConnecting ? "Connecting..." : "Connect Cloud"}
              </Button>
              {connection.connected ? (
                <>
                  <Button type="button" variant="outline" className="rounded-full border-[#dbe4ef]" onClick={() => void copyCloudDetails()}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                  <Button type="button" variant="outline" className="rounded-full border-[#fed7aa] text-[#b45309]" onClick={disconnect}>
                    Disconnect
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <div className="rounded-[8px] border border-[#dbe4ef] bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f0fdf4] text-[#16a34a]">
                <CloudUpload className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[#23365a]">Upload Current Workspace</div>
                <div className="text-xs text-[#7787a3]">Parties, items, vouchers, units, categories and workspace settings.</div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 rounded-[8px] bg-[#f8fbff] p-3 text-sm text-[#52627d]">
              <div className="flex justify-between gap-3">
                <span>Company</span>
                <span className="truncate font-semibold text-[#23365a]">{activeSession?.company.name ?? "Loading..."}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Workspace</span>
                <span className="truncate font-semibold text-[#23365a]">{workspaceId}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Last cloud backup</span>
                <span className="font-semibold text-[#23365a]">{formatCloudDate(connection.lastBackupAt)}</span>
              </div>
            </div>

            {connection.lastError ? (
              <div className="mt-3 rounded-[8px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#b91c1c]">
                {connection.lastError}
              </div>
            ) : null}

            <Button type="button" className="mt-4 h-12 rounded-full bg-primary px-7" onClick={() => void handleUploadBackup()} disabled={!canUpload || isUploading}>
              <DatabaseBackup className="mr-2 h-5 w-5" />
              {isUploading ? "Uploading..." : "Upload Backup Now"}
            </Button>
          </div>
        </div>

        <div className="flex min-h-[420px] flex-col overflow-hidden rounded-[8px] border border-[#dbe4ef]">
          <div className="flex items-center justify-between gap-3 border-b border-[#e6ecf5] bg-[#f8fbff] px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-[#23365a]">Cloud Backup History</div>
              <div className="text-xs text-[#7787a3]">{history.length ? `${history.length} remote snapshot${history.length === 1 ? "" : "s"}` : "No cloud backup uploaded yet"}</div>
            </div>
            {latestHistory ? (
              <div className="rounded-full bg-[#ecfdf5] px-3 py-1 text-xs font-semibold text-[#0f9f63]">
                Latest {formatBackupSize(latestHistory.sizeBytes)}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {history.length ? (
              history.map((entry) => (
                <div key={entry.id} className="grid gap-2 border-b border-[#eef2f7] px-4 py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-[#23365a]">{formatCloudDate(entry.createdAt)}</div>
                    <div className="rounded-full bg-[#eef5ff] px-3 py-1 text-xs font-semibold text-[#2477ff]">
                      {formatBackupSize(entry.sizeBytes)}
                    </div>
                  </div>
                  <div className="text-sm text-[#5f708e]">{describeBackupCounts(entry.counts)}</div>
                  <div className="truncate font-mono text-xs text-[#8a97b1]">SHA-256 {entry.checksumSha256}</div>
                </div>
              ))
            ) : (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#f5f7fb] text-[#9aa8bf]">
                  <CloudUpload className="h-9 w-9" />
                </div>
                <div className="mt-4 text-sm font-semibold text-[#23365a]">No remote backup yet</div>
                <div className="mt-1 max-w-[360px] text-sm leading-6 text-[#7787a3]">
                  Connect Bizovix Cloud, then upload the current workspace backup.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
