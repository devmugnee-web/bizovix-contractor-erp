"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildWorkspaceRoute, buildVoucherRoute } from "@/config/routes";
import { moduleRegistry } from "@/config/module-registry";
import { voucherShortcutOrder } from "@/config/navigation";
import { useSessionContext } from "@/hooks/use-session-context";
import { useUiStore } from "@/stores/ui-store";

export function SearchScreen() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const { mode } = useSessionContext();
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);

  const results = useMemo(() => {
    if (!query) {
      return [];
    }

    const needle = query.toLowerCase();
    const moduleMatches = Object.values(moduleRegistry)
      .filter((entry) => `${entry.title} ${entry.description}`.toLowerCase().includes(needle))
      .map((entry) => ({
        title: entry.title,
        description: entry.description,
        href: buildWorkspaceRoute(mode, `/${entry.section}/${entry.slug}`),
      }));
    const voucherMatches = voucherShortcutOrder
      .filter((entry) => entry.label.toLowerCase().includes(needle))
      .map((entry) => ({
        title: `${entry.label} Voucher`,
        description: `Open a new ${entry.label.toLowerCase()} workflow`,
        href: buildVoucherRoute(mode, entry.type),
      }));

    return [...voucherMatches, ...moduleMatches];
  }, [mode, query]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Search Results</h1>
        <p className="text-sm text-muted">
          {query ? `Showing matches for "${query}"` : "Type in the top search box to find vouchers, modules, and reports."}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Go To</CardTitle>
          <CardDescription>Fast navigation results from the ERP route registry.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {results.length ? (
            results.map((result) => (
              <Link key={result.href} href={result.href} className="block rounded-2xl border border-border p-4 transition-colors hover:bg-canvas">
                <div className="font-medium">{result.title}</div>
                <div className="mt-1 text-sm text-muted">{result.description}</div>
              </Link>
            ))
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted">
              <span>
                No results yet. Try terms like <span className="font-medium text-foreground">sales</span>, <span className="font-medium text-foreground">balance</span>, or <span className="font-medium text-foreground">inventory</span>.
              </span>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setCommandPaletteOpen(true)}>
                <Search className="h-4 w-4" />
                Open Search
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
