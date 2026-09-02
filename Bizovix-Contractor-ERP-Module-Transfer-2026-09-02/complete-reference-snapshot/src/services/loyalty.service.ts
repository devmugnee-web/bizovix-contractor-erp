import { apiRequest } from "@/services/api-client";
import type { DataMode } from "@/types/domain";

export type LoyaltySettings = {
  workspaceId: string;
  enabled: boolean;
  rewardAmount: number;
  minimumInvoiceAmount: number;
  expiryDays: number;
  redeemPoints: number;
  redeemAmount: number;
  updatedAt: string | null;
};

const defaults = (workspaceId: string): LoyaltySettings => ({ workspaceId, enabled: false, rewardAmount: 0, minimumInvoiceAmount: 0, expiryDays: 0, redeemPoints: 0, redeemAmount: 0, updatedAt: null });
const storageKey = (workspaceId: string) => `bizovix:loyalty:${workspaceId}`;

export async function getLoyaltySettings(mode: DataMode, workspaceId: string) {
  if (mode === "api") return apiRequest<LoyaltySettings>(`/workspaces/${encodeURIComponent(workspaceId)}/app-settings/loyalty`);
  if (typeof window === "undefined") return defaults(workspaceId);
  const raw = window.localStorage.getItem(storageKey(workspaceId));
  return raw ? { ...defaults(workspaceId), ...(JSON.parse(raw) as LoyaltySettings) } : defaults(workspaceId);
}

export async function saveLoyaltySettings(mode: DataMode, workspaceId: string, input: Omit<LoyaltySettings, "workspaceId" | "enabled" | "updatedAt">) {
  if (mode === "api") return apiRequest<LoyaltySettings>(`/workspaces/${encodeURIComponent(workspaceId)}/app-settings/loyalty`, { method: "PUT", body: JSON.stringify(input) });
  const record = { ...input, workspaceId, enabled: true, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(record));
  return record;
}

export async function deleteLoyaltySettings(mode: DataMode, workspaceId: string) {
  if (mode === "api") {
    return apiRequest<{ success: true }>(`/workspaces/${encodeURIComponent(workspaceId)}/app-settings/loyalty`, { method: "DELETE" });
  }
  if (typeof window !== "undefined") window.localStorage.removeItem(storageKey(workspaceId));
  return { success: true as const };
}

export function getLoyaltyBalance(workspaceId: string, partyName: string) {
  return apiRequest<{ partyName: string; earned: number; redeemed: number; balance: number }>(`/workspaces/${encodeURIComponent(workspaceId)}/loyalty/balance?partyName=${encodeURIComponent(partyName)}`);
}
