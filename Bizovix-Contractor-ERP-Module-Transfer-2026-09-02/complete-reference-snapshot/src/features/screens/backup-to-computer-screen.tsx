"use client";

import { Download } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { appConfig } from "@/config/app";
import { useSessionContext } from "@/hooks/use-session-context";
import { readDataset } from "@/services/browser-dataset";
import { readCompanyProfile } from "@/services/company-profile";

const BIZOVIX_BACKUP_KEY = "bizovix-erp-workspace-backup";

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

function downloadJson(filename: string, payload: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BackupToComputerScreen() {
  const { mode, session } = useSessionContext();
  const activeWorkspaceId = session?.workspaceId ?? "default";

  const activeWorkspaceName = useMemo(() => {
    if (!activeWorkspaceId) {
      return "Current Workspace";
    }

    if (mode === "api") {
      return activeWorkspaceId;
    }

    return readDataset(mode).workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? activeWorkspaceId;
  }, [activeWorkspaceId, mode]);

  function handleDownloadBackup() {
    if (!session?.workspaceId) {
      toast.error("Active workspace not found");
      return;
    }

    const now = new Date();
    const scopedStorageEntries =
      typeof window === "undefined"
        ? {}
        : Object.keys(window.localStorage)
            .sort()
            .reduce<Record<string, unknown>>((entries, key) => {
              if (!key.startsWith("bizovix:") || !key.includes(`:${mode}:${activeWorkspaceId}`)) {
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

    const datasetSlice =
      mode === "api"
        ? null
        : (() => {
            const dataset = readDataset(mode);
            return {
              workspace: dataset.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
              parties: dataset.parties.filter((party) => party.workspaceId === activeWorkspaceId),
              stockItems: dataset.stockItems.filter((item) => item.workspaceId === activeWorkspaceId),
              vouchers: dataset.vouchers.filter((voucher) => voucher.workspaceId === activeWorkspaceId),
            };
          })();

    const filename = `${formatBackupTimestampForFile(now)}_${slugifyFileSegment(activeWorkspaceName)}_bizovix-workspace-backup.fyb`;

    const savedCompanyName = readCompanyProfile(mode, activeWorkspaceId).companyName.trim();

    downloadJson(filename, {
      appName: appConfig.appName,
      softwareKey: BIZOVIX_BACKUP_KEY,
      backupVersion: 1,
      exportType: "workspace-slice-backup",
      exportedAt: now.toISOString(),
      companyName: savedCompanyName || activeWorkspaceName || appConfig.companyName,
      mode,
      scope: {
        workspaceOnly: true,
        workspaceId: activeWorkspaceId,
        workspaceName: activeWorkspaceName,
      },
      data: {
        dataset: datasetSlice,
        localStorage: scopedStorageEntries,
      },
    });

    toast.success(`${activeWorkspaceName} backup downloaded`);
  }

  return (
    <div className="flex min-h-[calc(100vh-13rem)] items-center justify-center px-4">
      <div className="w-full max-w-[620px] px-6 py-10 text-center">
        <div className="text-[36px] font-semibold text-[#132949]">Backup To Computer</div>
        <div className="mt-3 text-[15px] leading-7 text-[#6d7d98]">Download only the current workspace backup. Other workspaces will stay separate.</div>
        <Button type="button" className="mt-8 h-14 rounded-full bg-primary px-8 text-[16px] font-semibold hover:bg-[#cf670f]" onClick={handleDownloadBackup}>
          <Download className="mr-2 h-5 w-5" />
          Download Backup
        </Button>
      </div>
    </div>
  );
}
