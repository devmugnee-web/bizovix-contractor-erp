import { roundMoney } from "@/lib/money";
import type { DataMode } from "@/types/domain";

export type RoundOffDirection = "Nearest" | "Upward" | "Downward";

export interface RoundOffPreference {
  enabled: boolean;
  direction: RoundOffDirection;
  /** Rounding step in taka — 1, 5 or 10 in the settings screen. */
  step: number;
}

export const defaultRoundOffPreference: RoundOffPreference = {
  enabled: false,
  direction: "Nearest",
  step: 1,
};

/**
 * "Round Off Total" lives in Transaction Settings (auto-backup-screen.tsx), which
 * persists the whole settings object under this key. Document screens read it from
 * here so one preference drives every invoice instead of each screen guessing.
 */
export function getRoundOffStorageKey(mode: DataMode, workspaceId: string) {
  return `bizovix:auto-backup:${mode}:${workspaceId || "default"}`;
}

export function readRoundOffPreference(mode: DataMode, workspaceId: string): RoundOffPreference {
  if (typeof window === "undefined") return defaultRoundOffPreference;

  try {
    const raw = window.localStorage.getItem(getRoundOffStorageKey(mode, workspaceId));
    if (!raw) return defaultRoundOffPreference;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const direction = String(parsed.roundOffNearest ?? "Nearest");
    const step = Number(parsed.roundOffTo ?? 1);

    return {
      enabled: Boolean(parsed.roundOffTotal),
      direction: direction === "Upward" || direction === "Downward" ? direction : "Nearest",
      step: Number.isFinite(step) && step > 0 ? step : 1,
    };
  } catch {
    // A corrupt or half-written settings blob must never block a voucher screen.
    return defaultRoundOffPreference;
  }
}

/** Rounds `amount` to the nearest/next/previous multiple of the configured step. */
export function applyRoundOff(amount: number, preference: RoundOffPreference = defaultRoundOffPreference) {
  const step = preference.step > 0 ? preference.step : 1;
  const scaled = amount / step;
  const rounded =
    preference.direction === "Upward"
      ? Math.ceil(scaled)
      : preference.direction === "Downward"
        ? Math.floor(scaled)
        : Math.round(scaled);

  return roundMoney(rounded * step);
}
