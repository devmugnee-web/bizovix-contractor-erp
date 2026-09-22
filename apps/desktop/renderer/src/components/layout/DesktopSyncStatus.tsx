"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, canExportDesktopBackup, exportDesktopBackup, useMe } from "@bizovix/api-client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useDesktopMode } from "@/hooks/use-desktop-mode";

interface SyncStatus {
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  storage?: { pendingCount: number; rejectedCount: number; projectionRevision?: string };
  backup?: { lastVerifiedAt: string | null; lastError: string | null; running: boolean };
  offlineAccessExpiresAt?: string;
  rollout?: string;
  offlineModules?: string[];
}

const OFFLINE_MODULES = {
  "master-categories": { label: "categories", href: "/masters/categories" },
  uoms: { label: "units", href: "/masters/units" },
  "payment-terms": { label: "payment terms", href: "/masters/payment-terms" },
  organizations: { label: "organizations", href: "/masters/organizations" },
};
const MASTER_QUERY_KEYS = [["master-categories"], ["uoms"], ["payment-terms"], ["organizations"]];

export function DesktopSyncStatus() {
  const queryClient = useQueryClient();
  const desktop = useDesktopMode() === "desktop";
  const me = useMe(desktop);
  const [syncing, setSyncing] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<{ error: boolean; message: string } | null>(null);
  const status = useQuery({
    queryKey: ["desktop-sync-status"],
    queryFn: () => apiRequest<SyncStatus>("/desktop/status"),
    enabled: desktop,
    refetchInterval: 15_000,
    retry: false,
  });
  const pending = status.data?.storage?.pendingCount ?? 0;
  const rejected = status.data?.storage?.rejectedCount ?? 0;
  const lastSyncedAt = status.data?.lastSyncedAt;
  const statusReady = !!status.data;
  const projectionRevision = status.data?.storage?.projectionRevision;
  // Older category-pilot services do not return offlineModules. New services
  // derive the list from signed permissions and initialized local snapshots.
  const offlineModules = status.data?.offlineModules ?? ["master-categories"];
  const moduleKey = offlineModules.join(",");
  const availableModules = Object.entries(OFFLINE_MODULES).filter(([name]) => offlineModules.includes(name));
  useEffect(() => {
    // One stream can commit before a later stream fails. Refresh those saved
    // projections even when the complete sync has never succeeded.
    if (desktop && statusReady) void Promise.all(MASTER_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  }, [desktop, statusReady, lastSyncedAt, pending, rejected, moduleKey, projectionRevision, queryClient]);
  if (!desktop) return null;

  async function sync() {
    setSyncing(true);
    try {
      await apiRequest("/desktop/sync", { method: "POST" });
      await Promise.all(MASTER_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      await status.refetch();
    } finally { setSyncing(false); }
  }

  async function backup() {
    setBackingUp(true);
    try { await apiRequest("/desktop/backup", { method: "POST" }); await status.refetch(); }
    finally { setBackingUp(false); }
  }

  async function exportBackup() {
    setExporting(true); setExportNotice(null);
    try {
      const result = await exportDesktopBackup();
      if (result.cancelled) return;
      setExportNotice(result.error
        ? { error: true, message: result.error }
        : { error: false, message: `Verified backup exported to ${result.directory}. Keep this folder together. Cloud-only records and attachments are not included.` });
      await status.refetch();
    } catch (error) {
      setExportNotice({ error: true, message: error instanceof Error ? error.message : "Backup export could not be completed." });
    } finally { setExporting(false); }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-biz-border bg-biz-surface px-4 py-2 text-[12px] text-biz-muted print:hidden" role="status">
      <span>{!status.data ? status.isError ? "Offline availability is currently unavailable." : "Checking offline availability…" : availableModules.length ? `Desktop preview: ${availableModules.map(([, module]) => module.label).join(", ")} work offline; other modules require a connection.` : "Offline master data is not available for this session."}</span>
      <span>{pending} waiting to sync{rejected ? ` · ${rejected} need review` : ""}</span>
      {rejected > 0 && availableModules.filter(([name]) => name !== "organizations" || me.data?.permissions.includes("masters.read")).map(([name, module]) => <Link key={name} href={module.href} className="font-semibold text-biz-blue">Review {module.label}</Link>)}
      {status.data?.lastSyncedAt && <span>Last sync: {new Date(status.data.lastSyncedAt).toLocaleTimeString()}</span>}
      {(status.data?.lastSyncError || status.isError) && <span className="text-biz-danger">{status.data?.lastSyncError ?? "Sync status is unavailable. Your saved work is preserved."}</span>}
      <button type="button" disabled={syncing} onClick={() => void sync().catch(() => status.refetch())} className="font-semibold text-biz-blue disabled:opacity-50">
        {syncing ? "Syncing…" : "Sync now"}
      </button>
      <span>{status.data?.backup?.lastVerifiedAt ? `Local backup: ${new Date(status.data.backup.lastVerifiedAt).toLocaleString()}` : "Local backup pending"}</span>
      <button type="button" disabled={backingUp || status.data?.backup?.running} onClick={() => void backup().catch(() => status.refetch())} className="font-semibold text-biz-blue disabled:opacity-50">{backingUp || status.data?.backup?.running ? "Backing up…" : "Back up now"}</button>
      {canExportDesktopBackup() && <button type="button" disabled={!statusReady || exporting || backingUp || status.data?.backup?.running} onClick={() => void exportBackup()} className="font-semibold text-biz-blue disabled:opacity-50">{exporting ? "Exporting backup…" : "Export backup"}</button>}
      {exportNotice && <span className={`min-w-0 break-all ${exportNotice.error ? "text-biz-danger" : "text-biz-muted"}`} role={exportNotice.error ? "alert" : undefined}>{exportNotice.message}</span>}
      {status.data?.backup?.lastError && <span className="text-biz-danger">{status.data.backup.lastError}</span>}
    </div>
  );
}
