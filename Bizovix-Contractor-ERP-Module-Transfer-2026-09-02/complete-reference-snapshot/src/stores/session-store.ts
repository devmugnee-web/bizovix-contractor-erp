"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { DataMode, SessionRecord, UserProfile } from "@/types/domain";

interface SessionState {
  appSession: SessionRecord | null;
  demoSession: SessionRecord | null;
  hasHydrated: boolean;
  setSession: (mode: DataMode, user: UserProfile, workspaceId: string) => void;
  clearSession: (mode: DataMode) => void;
  setWorkspace: (mode: DataMode, workspaceId: string) => void;
  setHasHydrated: (hydrated: boolean) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      appSession: null,
      demoSession: null,
      hasHydrated: false,
      setSession: (mode, user, workspaceId) =>
        set((state) => ({
          ...state,
          appSession: mode === "demo" ? state.appSession : { mode, user, workspaceId },
          demoSession: mode === "demo" ? { mode, user, workspaceId } : state.demoSession,
        })),
      clearSession: (mode) =>
        set((state) => ({
          ...state,
          appSession: mode === "demo" ? state.appSession : null,
          demoSession: mode === "demo" ? null : state.demoSession,
        })),
      setWorkspace: (mode, workspaceId) =>
        set((state) => ({
          ...state,
          appSession:
            mode === "demo" || !state.appSession
              ? state.appSession
              : { ...state.appSession, workspaceId },
          demoSession:
            mode === "demo" && state.demoSession
              ? { ...state.demoSession, workspaceId }
              : state.demoSession,
        })),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "bizovix-session-v1",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

