"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { LcDetailDialog, type LcDetailTab } from "@/features/screens/lc-detail-dialog";

const LC_DETAIL_TABS: LcDetailTab[] = ["overview", "products", "shipments", "costs", "grn", "landed-cost", "timeline", "history"];

export function LcDetailPage({ lcId, cleanRoute = false }: { lcId: string; cleanRoute?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") as LcDetailTab | null;
  const initialTab: LcDetailTab = requestedTab && LC_DETAIL_TABS.includes(requestedTab) ? requestedTab : "overview";
  const requestedReturnTo = searchParams.get("returnTo");
  const returnTo = requestedReturnTo?.startsWith("/app/lc-management/dashboard")
    ? requestedReturnTo
    : "/app/lc-management/dashboard";

  function handleTabChange(tab: LcDetailTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    const basePath = cleanRoute ? "/app/lc-management" : `/app/lc-management/${lcId}`;
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <LcDetailDialog lcId={lcId} variant="page" initialTab={initialTab} onTabChange={handleTabChange} onOpenChange={(open) => { if (!open) router.push(returnTo); }} />
      </div>
    </div>
  );
}
