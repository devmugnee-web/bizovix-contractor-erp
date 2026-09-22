export const RUNTIME_INFO_CHANNEL = "bizovix:runtime-info";
export const STORAGE_STATUS_CHANNEL = "bizovix:storage-status";
export const BACKUP_EXPORT_CHANNEL = "bizovix:backup-export";

export interface DesktopRuntimeInfo {
  platform: string;
  appVersion: string;
  mode: "development" | "desktop-pilot";
  localApiUrl?: string;
  localCapability?: string;
  storageStatus: string;
  cloudConfigured: boolean;
  offlineScope: "categories-pilot" | "disabled";
}

export function isTrustedRendererUrl(candidate: string, expectedOrigin: string): boolean {
  try {
    const url = new URL(candidate);
    return !url.username && !url.password && url.origin === expectedOrigin && url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

export function validateReadyMessage(value: unknown, instanceId: string): { port: number; instanceId: string } | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (message.type !== "ready" || message.instanceId !== instanceId ||
      typeof message.port !== "number" || !Number.isInteger(message.port) || message.port < 1 || message.port > 65535) {
    return null;
  }
  return { port: message.port, instanceId };
}

export function isAllowedDocumentPopup(candidate: string, expectedOrigin: string): boolean {
  if (candidate === "about:blank" || candidate === "") return true;
  try {
    const url = new URL(candidate);
    return url.protocol === "blob:" && url.origin === expectedOrigin;
  } catch { return false; }
}
