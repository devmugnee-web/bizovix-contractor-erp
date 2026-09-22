"use client";

import { useSyncExternalStore } from "react";
import { isLocalDesktop } from "@bizovix/api-client";

const subscribe = () => () => undefined;
const clientSnapshot = () => isLocalDesktop() ? "desktop" as const : "web" as const;
const serverSnapshot = () => null;

/** The preload bridge exists before hydration; defer mode-dependent UI until hydration completes. */
export function useDesktopMode() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
