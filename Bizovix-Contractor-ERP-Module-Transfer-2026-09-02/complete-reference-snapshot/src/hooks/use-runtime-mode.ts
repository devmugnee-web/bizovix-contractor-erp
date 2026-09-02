"use client";

import { usePathname } from "next/navigation";

import { getDefaultDataMode } from "@/services/data-provider";
import { normalizeMode } from "@/config/routes";
import { useSessionStore } from "@/stores/session-store";

export function useRuntimeMode() {
  const pathname = usePathname();
  const appSessionMode = useSessionStore((state) => state.appSession?.mode ?? null);
  return normalizeMode(pathname, getDefaultDataMode(), appSessionMode);
}
