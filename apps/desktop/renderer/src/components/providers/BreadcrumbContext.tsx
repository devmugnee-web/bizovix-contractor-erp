"use client";

import * as React from "react";
import type { BreadcrumbItem } from "@bizovix/ui";

interface BreadcrumbContextValue {
  breadcrumb: BreadcrumbItem[] | null;
  setBreadcrumb: (items: BreadcrumbItem[] | null) => void;
}

const BreadcrumbContext = React.createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [breadcrumb, setBreadcrumb] = React.useState<BreadcrumbItem[] | null>(null);
  return <BreadcrumbContext.Provider value={{ breadcrumb, setBreadcrumb }}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbContext(): BreadcrumbContextValue {
  const ctx = React.useContext(BreadcrumbContext);
  if (!ctx) throw new Error("useBreadcrumbContext must be used within BreadcrumbProvider");
  return ctx;
}

export function useSetBreadcrumb(items: BreadcrumbItem[]): void {
  const { setBreadcrumb } = useBreadcrumbContext();
  React.useEffect(() => {
    setBreadcrumb(items);
    return () => setBreadcrumb(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items)]);
}
