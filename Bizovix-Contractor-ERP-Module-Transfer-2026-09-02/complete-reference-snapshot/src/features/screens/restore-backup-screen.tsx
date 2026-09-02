"use client";

import { FileUp, RotateCcw, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { appConfig } from "@/config/app";
import { useSessionContext } from "@/hooks/use-session-context";
import { cn } from "@/lib/utils";
import { readDataset, writeDataset } from "@/services/browser-dataset";
import type { AppDataset, PartyRecord, StockItemRecord, VoucherRecord, Workspace } from "@/types/domain";

type WorkspaceBackupPayload = {
  appName?: string;
  softwareKey?: string;
  backupVersion?: number;
  exportType?: string;
  exportedAt?: string;
  scope?: {
    workspaceOnly?: boolean;
    workspaceId?: string;
    workspaceName?: string;
  };
  data?: {
    dataset?: {
      workspace?: Workspace | null;
      parties?: PartyRecord[];
      stockItems?: StockItemRecord[];
      vouchers?: VoucherRecord[];
    } | null;
    localStorage?: Record<string, unknown>;
  };
};

const BIZOVIX_BACKUP_KEY = "bizovix-erp-workspace-backup";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeLocalStorageValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

export function RestoreBackupScreen() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { mode, session } = useSessionContext();
  const activeWorkspaceId = session?.workspaceId ?? "";
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  function handleSelectFile(file: File | null) {
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith(".fyb")) {
      toast.error("Only Bizovix backup files (.fyb) are supported");
      return;
    }

    setSelectedFile(file);
  }

  async function handleRestoreBackup() {
    if (!selectedFile) {
      toast.error("Choose a backup file first");
      return;
    }

    if (!activeWorkspaceId) {
      toast.error("Active workspace not found");
      return;
    }

    setIsRestoring(true);

    try {
      const rawText = await selectedFile.text();
      const parsed = JSON.parse(rawText) as unknown;

      if (!isRecord(parsed)) {
        throw new Error("Invalid backup structure");
      }

      const payload = parsed as WorkspaceBackupPayload;
      const hasBizovixSignature =
        payload.softwareKey === BIZOVIX_BACKUP_KEY ||
        (payload.appName === appConfig.appName && selectedFile.name.toLowerCase().includes("bizovix-workspace-backup"));

      if (!hasBizovixSignature) {
        throw new Error("This backup file was not created by Bizovix ERP");
      }

      if (payload.exportType !== "workspace-slice-backup" || payload.scope?.workspaceOnly !== true) {
        throw new Error("Unsupported backup format");
      }

      if (!payload.scope?.workspaceId || payload.scope.workspaceId !== activeWorkspaceId) {
        throw new Error("This backup belongs to a different workspace. Switch to the correct workspace first.");
      }

      const backupLocalStorage = isRecord(payload.data?.localStorage) ? payload.data?.localStorage : {};
      Object.entries(backupLocalStorage).forEach(([key, value]) => {
        window.localStorage.setItem(key, normalizeLocalStorageValue(value));
      });

      if (mode !== "api" && payload.data?.dataset && isRecord(payload.data.dataset)) {
        const datasetSlice = payload.data.dataset;
        const currentDataset = readDataset(mode);

        const nextDataset: AppDataset = {
          ...currentDataset,
          workspaces: currentDataset.workspaces.map((workspace) =>
            workspace.id === activeWorkspaceId && datasetSlice.workspace ? datasetSlice.workspace : workspace,
          ),
          parties: [
            ...currentDataset.parties.filter((party) => party.workspaceId !== activeWorkspaceId),
            ...((Array.isArray(datasetSlice.parties) ? datasetSlice.parties : []) as PartyRecord[]),
          ],
          stockItems: [
            ...currentDataset.stockItems.filter((item) => item.workspaceId !== activeWorkspaceId),
            ...((Array.isArray(datasetSlice.stockItems) ? datasetSlice.stockItems : []) as StockItemRecord[]),
          ],
          vouchers: [
            ...currentDataset.vouchers.filter((voucher) => voucher.workspaceId !== activeWorkspaceId),
            ...((Array.isArray(datasetSlice.vouchers) ? datasetSlice.vouchers : []) as VoucherRecord[]),
          ],
        };

        writeDataset(mode, nextDataset);
      }

      window.dispatchEvent(new Event("bizovix-workspace-restored"));
      toast.success("Bizovix backup restored successfully");
      setSelectedFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Backup restore failed";
      toast.error(message);
    } finally {
      setIsRestoring(false);
    }
  }

  function handleClearFile() {
    setSelectedFile(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="flex h-full min-h-0 items-start justify-center overflow-y-auto px-4 py-6">
      <div className="w-full max-w-[660px]">
        <div className="flex items-center gap-4 pb-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#eef5ff] text-[#2477ff]">
            <RotateCcw className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[20px] font-semibold leading-tight text-[#132949]">Restore Backup</div>
            <div className="mt-0.5 text-[13px] leading-5 text-[#6d7d98]">
              Bring this workspace back from a Bizovix backup file.
            </div>
          </div>
        </div>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".fyb,application/json"
            className="hidden"
            onChange={(event) => handleSelectFile(event.target.files?.[0] ?? null)}
          />

          {selectedFile ? (
            <div className="flex items-center gap-3 rounded-[14px] border border-[#cfe3d6] bg-[#f4fbf6] px-4 py-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#1a8f51]">
                <FileUp className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[#132949]">{selectedFile.name}</div>
                <div className="mt-0.5 text-xs text-[#6d7d98]">{(selectedFile.size / 1024).toFixed(1)} KB · ready to restore</div>
              </div>
              <button
                type="button"
                aria-label="Remove selected backup file"
                title="Choose a different file"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#7d8aa2] transition hover:bg-white hover:text-[#132949]"
                onClick={handleClearFile}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed px-6 py-9 text-center transition",
                dragActive ? "border-[#2477ff] bg-[#eef5ff]" : "border-[#cbd7e7] bg-[#fafcff] hover:border-[#9dbdf0] hover:bg-[#f4f9ff]",
              )}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                handleSelectFile(event.dataTransfer.files?.[0] ?? null);
              }}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#2477ff] shadow-[0_6px_16px_rgba(36,119,255,0.12)]">
                <FileUp className="h-5 w-5" />
              </span>
              <span className="text-[15px] font-semibold text-[#132949]">Drop your backup file here</span>
              <span className="text-[13px] text-[#73819b]">or click to browse · only .fyb files made by Bizovix</span>
            </button>
          )}

          <div className="mt-4 flex items-start gap-2.5 rounded-[12px] border border-[#f6dfb8] bg-[#fffaf1] px-4 py-3 text-[13px] leading-5 text-[#8a5a1d]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Restoring replaces this workspace&apos;s saved data with whatever is inside the file. Take a fresh backup first if you
              are unsure.
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="rounded-full bg-primary px-7 text-white hover:bg-[#cf670f] disabled:cursor-not-allowed disabled:bg-[#c9d2de] disabled:text-[#5b6a80] disabled:opacity-100"
              disabled={!selectedFile || isRestoring}
              onClick={handleRestoreBackup}
            >
              {isRestoring ? "Restoring..." : "Restore Backup"}
            </Button>
            {selectedFile ? (
              <Button type="button" variant="outline" className="rounded-full border-[#d7dfeb] px-6 text-[#4a5e7d]" onClick={handleClearFile} disabled={isRestoring}>
                Choose Another File
              </Button>
            ) : null}
          </div>

          <div className="mt-5 flex items-center gap-2 border-t border-[#eef2f7] pt-4 text-[12px] text-[#1a8f51]">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Files from other software are checked and rejected automatically.
          </div>
        </div>
      </div>
    </div>
  );
}
