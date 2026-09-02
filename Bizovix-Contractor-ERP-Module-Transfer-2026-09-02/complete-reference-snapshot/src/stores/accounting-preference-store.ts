"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AccountingEntryMode } from "@/types/domain";

interface AccountingPreferenceState {
  entryMode: AccountingEntryMode;
  setEntryMode: (entryMode: AccountingEntryMode) => void;
  toggleEntryMode: () => void;
}

export const useAccountingPreferenceStore = create<AccountingPreferenceState>()(
  persist(
    (set) => ({
      entryMode: "simple",
      setEntryMode: (entryMode) => set({ entryMode }),
      toggleEntryMode: () =>
        set((state) => ({
          entryMode: state.entryMode === "simple" ? "double-entry" : "simple",
        })),
    }),
    {
      name: "bizovix-accounting-preferences-v1",
    },
  ),
);

