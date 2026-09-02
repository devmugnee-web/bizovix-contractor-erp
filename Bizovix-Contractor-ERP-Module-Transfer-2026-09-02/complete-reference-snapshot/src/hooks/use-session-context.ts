"use client";

import { useMemo } from "react";

import { useRuntimeMode } from "@/hooks/use-runtime-mode";
import { useSessionHydration } from "@/hooks/use-session-hydration";
import { useSessionStore } from "@/stores/session-store";

export function useSessionContext() {
  const mode = useRuntimeMode();
  const hasHydrated = useSessionHydration();
  const appSession = useSessionStore((state) => state.appSession);
  const demoSession = useSessionStore((state) => state.demoSession);

  return useMemo(() => {
    const session = mode === "demo" ? demoSession : appSession;
    return { mode, session, hasHydrated };
  }, [appSession, demoSession, hasHydrated, mode]);
}
