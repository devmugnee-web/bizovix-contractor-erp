"use client";

import { useState } from "react";
import { ArrowLeft, Boxes, FileText, Wallet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { ErrorPanel } from "@/components/shared/error-panel";
import { LoadingPanel } from "@/components/shared/loading-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddCostEntryForm, AllocationEditor } from "@/features/screens/lc-detail-dialog";
import { useLcDetailQuery } from "@/hooks/use-lc-query";
import { formatCurrency } from "@/lib/format";
import type { LcCostEntryRecord } from "@/types/lc";

export function LcCostPostingScreen({ lcId }: { lcId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useLcDetailQuery(lcId, true);
  const lc = query.data;
  const [activeCostEntry, setActiveCostEntry] = useState<LcCostEntryRecord | null>(null);
  const requestedReturnTo = searchParams.get("returnTo");
  const returnHref = requestedReturnTo?.startsWith("/app/lc-management")
    ? requestedReturnTo
    : "/app/lc-management?section=cost-posting";

  if (query.isLoading) return <LoadingPanel lines={6} />;
  if (query.error || !lc) {
    return <ErrorPanel title="LC unavailable" description="The selected LC could not be loaded for cost posting." onRetry={() => query.refetch()} />;
  }

  const locked = lc.status === "FINALIZED" || lc.status === "CLOSED" || lc.status === "CANCELLED";
  return (
    <div className="h-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => router.push(returnHref)} className="mt-1 rounded-lg border border-[#d7e1ee] p-2 text-[#5f7189] hover:bg-[#f7faff]" aria-label="Back to cost posting">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-[#14233b]">Cost Posting</h1>
              <Badge tone={locked ? "slate" : "amber"}>{lc.status.replaceAll("_", " ")}</Badge>
            </div>
            <p className="mt-1 text-sm text-[#6f7d91]">Add cost, payment and product-wise allocation</p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => router.push(returnHref)}>Back to LC</Button>
      </div>

      <section className="relative overflow-hidden rounded-[12px] border border-[#efc46f] bg-gradient-to-r from-[#fff6df] via-[#fffaf0] to-white px-4 py-3 shadow-[0_3px_12px_rgba(180,112,20,0.10)]">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-[#e78a11]" />
        <div className="flex flex-wrap items-center gap-3 pl-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#e78a11] text-white shadow-sm">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#fff0c7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#9a5a00]">Posting Cost For</span>
              <span className="text-xs font-medium text-[#7a684e]">Selected LC</span>
            </div>
            <h2 className="mt-1 truncate text-lg font-bold text-[#14233b]" title={lc.lcNumber}>{lc.lcNumber}</h2>
            <p className="mt-0.5 text-sm text-[#66563f]"><span className="font-medium">Supplier:</span> {lc.supplierName}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-[10px] border border-[#e7edf5] bg-white p-3"><div className="text-xs text-[#8994a6]">Purchase Cost</div><div className="mt-1 font-semibold text-[#14233b]">{formatCurrency(lc.purchaseCostTotal)}</div></div>
        <div className="rounded-[10px] border border-[#e7edf5] bg-white p-3"><div className="text-xs text-[#8994a6]">Posted Import Cost</div><div className="mt-1 font-semibold text-[#14233b]">{formatCurrency(lc.importCostTotal)}</div></div>
        <div className="rounded-[10px] border border-[#e7edf5] bg-white p-3"><div className="text-xs text-[#8994a6]">Landed Cost</div><div className="mt-1 font-semibold text-[#14233b]">{formatCurrency(lc.landedCost?.landedCostTotal ?? lc.landedCostTotalPreview)}</div></div>
      </div>

      <section className="rounded-[12px] border border-[#dfe7f2] bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[#d97706]" />
          <h2 className="font-semibold text-[#14233b]">Cost Amount Posting</h2>
        </div>
        {locked ? (
          <p className="rounded-lg border border-[#ead7b0] bg-[#fff8e8] px-3 py-2 text-sm text-[#8a5a13]">This LC is locked. Reopen it before adding another cost posting.</p>
        ) : activeCostEntry ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#8fd2ad] bg-[#eefaf3] px-4 py-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[#08783d]">Cost entry saved</div>
              <div className="mt-1 font-semibold text-[#14233b]">{activeCostEntry.costHeadName}</div>
              <div className="mt-0.5 text-sm text-[#52657d]">
                {formatCurrency(activeCostEntry.bdtAmount)} · {activeCostEntry.paymentMethod === "CASH_BANK_MFS" ? "Cash / Bank / MFS" : `Credit${activeCostEntry.creditPayeeName ? ` — ${activeCostEntry.creditPayeeName}` : ""}`}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveCostEntry(null)}>+ Add Another Cost</Button>
          </div>
        ) : (
          <AddCostEntryForm
            lcId={lc.id}
            workspaceId={lc.workspaceId}
            onCreated={(updatedDetail) => {
              const createdEntry = updatedDetail.costEntries.find((entry) => !lc.costEntries.some((current) => current.id === entry.id))
                ?? updatedDetail.costEntries.at(-1)
                ?? null;
              setActiveCostEntry(createdEntry);
            }}
          />
        )}
      </section>

      <section className="rounded-[12px] border border-[#dfe7f2] bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Boxes className="h-4 w-4 text-[#5273a8]" />
          <h2 className="font-semibold text-[#14233b]">Item-wise Cost Allocation</h2>
        </div>
        {activeCostEntry ? (
          <div className="grid gap-2">
            {!activeCostEntry.includeInLandedCost ? <p className="rounded-lg border border-[#cfe0f5] bg-[#f4f8fd] px-3 py-2 text-sm text-[#52657d]">This posting can be allocated item-wise for tracking, but it remains excluded from the Landed Cost total.</p> : null}
            <AllocationEditor
              lcId={lc.id}
              entry={activeCostEntry}
              onSaved={() => router.push(returnHref)}
            />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-[#cfdbea] bg-[#f8fbff] px-4 py-8 text-center text-sm text-[#6f7d91]">Post a cost amount above. Its item-wise allocation table will appear here immediately.</p>
        )}
      </section>
    </div>
  );
}
