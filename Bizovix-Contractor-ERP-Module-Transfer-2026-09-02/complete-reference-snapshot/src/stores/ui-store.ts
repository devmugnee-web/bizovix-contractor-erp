"use client";

import { create } from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
  shortcutHelpOpen: boolean;
  createMenuOpen: boolean;
  notificationsOpen: boolean;
  settingsOpen: boolean;
  supportOpen: boolean;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setShortcutHelpOpen: (open: boolean) => void;
  setCreateMenuOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setSupportOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  commandPaletteOpen: false,
  shortcutHelpOpen: false,
  createMenuOpen: false,
  notificationsOpen: false,
  settingsOpen: false,
  supportOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setShortcutHelpOpen: (shortcutHelpOpen) => set({ shortcutHelpOpen }),
  setCreateMenuOpen: (createMenuOpen) => set({ createMenuOpen }),
  setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSupportOpen: (supportOpen) => set({ supportOpen }),
}));
