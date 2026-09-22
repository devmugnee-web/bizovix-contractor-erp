import { contextBridge, ipcRenderer } from "electron";
import type { DesktopRuntimeInfo } from "./runtime/contracts";
import type { BackupExportResult } from "./runtime/backup-export";

// Sandboxed preload cannot require arbitrary local modules. Type imports erase.
contextBridge.exposeInMainWorld("bizovix", Object.freeze({
  platform: process.platform,
  appVersion: process.env.npm_package_version ?? "1.0.0",
  localServiceEnabled: process.argv.includes("--bizovix-local-service=1"),
  getRuntimeInfo: (): Promise<DesktopRuntimeInfo> => ipcRenderer.invoke("bizovix:runtime-info"),
  getLocalStorageStatus: (): Promise<{ status: string; storage: string }> => ipcRenderer.invoke("bizovix:storage-status"),
  exportBackup: (accessToken: string): Promise<BackupExportResult> => ipcRenderer.invoke("bizovix:backup-export", accessToken),
}));
