"use client";

import { useEffect } from "react";

import { useSessionStore } from "@/stores/session-store";

export function useSessionHydration() {
  const hasHydrated = useSessionStore((state) => state.hasHydrated);

  useEffect(() => {
    if (!hasHydrated) {
      useSessionStore.persist.rehydrate();
    }
  }, [hasHydrated]);

  return hasHydrated;
}
