"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useBillSources, useBillPreparation, useBillCostingReference, useMe } from "@bizovix/api-client";
import type { BillSource } from "@bizovix/types";
import { formatBDT } from "@bizovix/utils";

const control = "h-9 min-w-0 rounded-lg border border-biz-border bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-biz-blue/20";

export function BillProjectReadiness({ workId }: { workId: string }) {
  const preparation = useBillPreparation(workId);
  const me = useMe();
  if (preparation.isLoading) return <p className="p-3 text-xs text-biz-muted">Checking Contract & BOQ…</p>;
  if (!preparation.data) return <p className="p-3 text-xs text-biz-danger">Could not load this project. <button onClick={() => void preparation.refetch()} className="underline">Retry</button></p>;
  const data = preparation.data;
  const active = data.contracts.filter((contract) => contract.status === "ACTIVE");
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-biz-border bg-slate-50 p-3">
    <div className="min-w-0 text-xs">
      <p className="font-semibold">{data.ready ? "Ready for Billing" : "Not Ready for Billing"}</p>
      <p className="mt-1 text-biz-muted">{data.reason ?? `${active.length} active contract · ${data.items.length} BOQ items`}</p>
      {active.length === 1 && <p className="mt-1 text-biz-muted">{active[0]!.contractNo} · {formatBDT(active[0]!.currentContractValue)}</p>}
    </div>
    <div className="flex flex-wrap gap-2 text-xs font-semibold">
      <Link className="rounded-lg border border-biz-border bg-white px-3 py-2" href={`/cms/ongoing-works/${workId}`}>Project Details</Link>
      <Link className="rounded-lg border border-biz-border bg-white px-3 py-2" href={`/cms/ongoing-works/${workId}/boq`}>Contract BOQ</Link>
      {!active.length && <Link className="rounded-lg border border-biz-border bg-white px-3 py-2" href={data.contracts[0] ? `/cms/contracts/${data.contracts[0].id}/edit` : `/cms/contracts/create?cmsWorkId=${workId}`}>Set Up Contract</Link>}
      {data.ready && me.data?.permissions.includes("project_bill.create") && <Link className="rounded-lg bg-biz-blue px-4 py-2 text-white" href={`/cms/bills/create?cmsWorkId=${workId}`}>New Bill Submission</Link>}
    </div>
  </div>;
}

function CostingReference({ tenderId }: { tenderId: string }) {
  const items = useBillCostingReference(tenderId);
  if (items.isLoading) return <p className="py-3 text-xs text-biz-muted">Loading products…</p>;
  if (items.isError) return <p className="py-3 text-xs text-biz-danger">Could not load costing products. <button className="underline" onClick={() => void items.refetch()}>Retry</button></p>;
  return <div className="mt-2 max-h-80 overflow-y-auto"><table className="w-full table-fixed text-left text-xs">
    <thead className="bg-slate-50 text-biz-muted"><tr><th className="w-10 p-2">SL</th><th className="p-2">Product / Work Name</th><th className="w-20 p-2 text-right">Quantity</th><th className="w-16 p-2">Unit</th></tr></thead>
    <tbody>{items.data?.map((item, index) => <tr key={item.id} className="border-t border-biz-border"><td className="p-2">{index + 1}</td><td className="break-words p-2">{item.description}</td><td className="p-2 text-right tabular-nums">{Number(item.quantity).toLocaleString()}</td><td className="p-2">{item.unit}</td></tr>)}</tbody>
  </table></div>;
}

export function BillSourcePicker({ onSelect }: { onSelect: (workId: string, selected: boolean) => void }) {
  const [kind, setKind] = React.useState<"tenders" | "projects">("tenders");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<BillSource | null>(null);
  const [workId, setWorkId] = React.useState("");
  const [showProducts, setShowProducts] = React.useState(false);
  const query = useBillSources({ kind, search: React.useDeferredValue(search), page, limit: 5 });

  function choose(source: BillSource) {
    const id = source.projects[0]?.id ?? "";
    setSelected(source); setWorkId(id); setShowProducts(false); onSelect(id, true);
  }
  function clear() { setSelected(null); setWorkId(""); onSelect("", false); }

  return <section className="mb-4 rounded-xl border border-biz-border bg-white p-4 shadow-sm">
    {selected ? <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-semibold text-biz-blue">Tender ID: {selected.tenderNumber ?? "—"}</p><h2 className="mt-1 break-words text-sm font-semibold">{selected.name}</h2></div>
        <button onClick={clear} className="shrink-0 rounded-lg border border-biz-border px-3 py-2 text-xs">Change Selection</button>
      </div>
      <dl className="my-4 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-biz-muted">Organization</dt><dd className="mt-1 break-words font-medium">{selected.organization}</dd></div>
        <div><dt className="text-biz-muted">PA Name / Designation</dt><dd className="mt-1">{[selected.pa?.name, selected.pa?.designation].filter(Boolean).join(" · ") || "Not set"}</dd></div>
        <div><dt className="text-biz-muted">PA Phone</dt><dd className="mt-1">{selected.pa?.mobile || "Not set"}</dd></div>
        <div><dt className="text-biz-muted">Address</dt><dd className="mt-1 break-words">{selected.pa?.address || "Not set"}</dd></div>
      </dl>
      {selected.costedItemCount > 0 && selected.tenderId && <div className="mb-3 border-t border-biz-border pt-3">
        <button onClick={() => setShowProducts(!showProducts)} aria-expanded={showProducts} className="text-xs font-semibold text-biz-blue">{showProducts ? "Hide" : "View"} Costed Products ({selected.costedItemCount})</button>
        {showProducts && <><p className="mt-2 text-xs text-biz-muted">Costing reference only. Bill quantities and rates come from the Contract BOQ.</p><CostingReference tenderId={selected.tenderId} /></>}
      </div>}
      {selected.projects.length > 1 && <label className="mb-3 flex items-center gap-3 text-xs">Project<select className={control} value={workId} onChange={(e) => { setWorkId(e.target.value); onSelect(e.target.value, true); }}>{selected.projects.map((project) => <option key={project.id} value={project.id}>{project.workName}</option>)}</select></label>}
      {workId ? <BillProjectReadiness workId={workId} /> : <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Saved costing is available. Billing will be available after this tender is awarded and linked to a Project with a Contract & BOQ.</div>}
    </> : <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">{(["tenders", "projects"] as const).map((value) => <button key={value} onClick={() => { setKind(value); setPage(1); setSearch(""); }} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${kind === value ? "bg-white text-biz-blue shadow-sm" : "text-biz-muted"}`}>{value === "tenders" ? "Costed Tenders" : "All Projects"}</button>)}</div>
        <label className="flex min-w-0 items-center gap-2"><Search className="h-4 w-4 text-biz-muted" /><input aria-label="Search tender or project" className={`${control} w-full sm:w-72`} placeholder="Search Tender ID / Work Name" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
      </div>
      {query.isError ? <p className="py-4 text-center text-xs text-biz-danger">Could not load tenders / projects. <button className="underline" onClick={() => void query.refetch()}>Retry</button></p> : query.isLoading ? <p className="py-4 text-center text-xs text-biz-muted">Loading…</p> : !query.data?.items.length ? <p className="py-4 text-center text-xs text-biz-muted">{kind === "tenders" ? "No saved, costed tenders found." : "No projects found."}</p> : <div className="divide-y divide-biz-border">{query.data.items.map((source) => <button key={source.id} onClick={() => choose(source)} className="flex w-full items-center gap-3 rounded-md px-2 py-3 text-left text-xs hover:bg-blue-50 focus-visible:outline-biz-blue">
        <span className="w-20 shrink-0 font-semibold text-biz-blue">{source.tenderNumber ?? "Project"}</span>
        <span className="min-w-0 flex-1"><span className="line-clamp-2 font-medium">{source.name}</span><span className="mt-1 block truncate text-[11px] text-biz-muted">{source.organization}</span></span>
        <span className={`hidden shrink-0 rounded-full px-2 py-1 text-[10px] sm:block ${source.projects.length ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>{source.projects.length ? "Project Linked" : "Costing Only"}</span><ChevronRight className="h-4 w-4 shrink-0 text-biz-muted" />
      </button>)}</div>}
      <div className="mt-2 flex items-center justify-between border-t border-biz-border pt-3 text-xs text-biz-muted"><span>{query.data?.meta.total ?? 0} {kind === "tenders" ? "costed tenders" : "projects"}</span><div className="flex items-center gap-3"><button aria-label="Previous sources" disabled={page === 1 || query.isFetching} onClick={() => setPage(page - 1)} className="disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><span>{page} / {query.data?.meta.totalPages || 1}</span><button aria-label="Next sources" disabled={page >= (query.data?.meta.totalPages || 1) || query.isFetching} onClick={() => setPage(page + 1)} className="disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button></div></div>
    </>}
  </section>;
}
