export interface DesktopRuntimeInfo {
  localApiUrl?: string;
  localCapability?: string;
}

interface DesktopBridge {
  localServiceEnabled?: boolean;
  getRuntimeInfo?: () => Promise<DesktopRuntimeInfo>;
  exportBackup?: (accessToken: string) => Promise<DesktopBackupExportResult>;
}

function bridge(): DesktopBridge | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as { bizovix?: DesktopBridge }).bizovix;
}

export function isLocalDesktop(): boolean {
  return bridge()?.localServiceEnabled === true;
}

export function canExportDesktopBackup(): boolean {
  return isLocalDesktop() && typeof bridge()?.exportBackup === "function";
}

export async function exportDesktopBackup(): Promise<DesktopBackupExportResult> {
  const desktop = bridge();
  const session = tokenStorage.snapshot();
  if (!isLocalDesktop() || !desktop?.exportBackup) throw new Error("Backup export requires the desktop app.");
  if (!session.accessToken) throw new Error("Sign in before exporting a backup.");
  const result = await desktop.exportBackup(session.accessToken);
  if (!tokenStorage.isSameSession(session)) throw new Error("Your sign-in changed during backup export.");
  return result;
}

let runtimePromise: Promise<DesktopRuntimeInfo | null> | undefined;

export async function getDesktopRuntime(): Promise<DesktopRuntimeInfo | null> {
  const desktop = bridge();
  if (!desktop?.getRuntimeInfo) return null;
  runtimePromise ??= desktop.getRuntimeInfo().then((runtime) => {
    if (!runtime.localApiUrl) return null;
    const url = new URL(runtime.localApiUrl);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.search || url.hash || !runtime.localCapability) {
      throw new Error("Invalid desktop runtime configuration");
    }
    return runtime;
  });
  return runtimePromise;
}
import { tokenStorage } from "./token-storage";

export interface DesktopBackupExportResult {
  cancelled?: boolean;
  directory?: string;
  createdAt?: string;
  pendingCount?: number;
  rejectedCount?: number;
  error?: string;
}
