"use client";

import { Button } from "@/components/ui/button";
import { LcDetailPage } from "@/features/screens/lc-detail-page";
import { useLcListQuery } from "@/hooks/use-lc-query";
import { useSessionContext } from "@/hooks/use-session-context";

export function CurrentLcPage() {
  const { session, hasHydrated } = useSessionContext();
  const listQuery = useLcListQuery(session?.workspaceId, hasHydrated && Boolean(session?.workspaceId));
  const currentLc = listQuery.data?.[0];

  if (!hasHydrated || listQuery.isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-[#6f7d91]">Loading current LC workspace…</div>;
  }

  if (listQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="font-semibold text-[#14233b]">Current LC could not be loaded</div>
        <Button type="button" variant="outline" onClick={() => void listQuery.refetch()}>Retry</Button>
      </div>
    );
  }

  if (!currentLc) {
    return <div className="flex h-full items-center justify-center text-sm text-[#6f7d91]">No LC is available yet.</div>;
  }

  return <LcDetailPage lcId={currentLc.id} cleanRoute />;
}
