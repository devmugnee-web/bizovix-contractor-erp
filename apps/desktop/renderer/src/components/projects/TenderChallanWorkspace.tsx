"use client";

import * as React from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { downloadTenderChallanPdf, downloadTenderChallanWord, useCostedTendersForChallans, useTenderChallanReport } from "@bizovix/api-client";
import type { CostedTenderChallanSummary } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { ChallanPdfActions } from "./ChallanPdfActions";

const PAGE_SIZE = 12;
// Match the delivery-only formatting used by the PDF/Word exporters.
function deliveryAddress(value?: string | null) {
  return (value ?? "").trim().replace(/^(?:address\s*[:：]\s*)+/i, "").trim();
}
function quantity(value: string) {
  const [whole = "", fraction] = value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "").split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? `.${fraction}` : "");
}

function TenderGoods({ tender, onBack }: { tender: CostedTenderChallanSummary; onBack: () => void }) {
  const report = useTenderChallanReport(tender.id);
  const data = report.data;
  const [reference, setReference] = React.useState("");
  const [date, setDate] = React.useState("");
  const [deliveryPlaceOverride, setDeliveryPlace] = React.useState<string | null>(null);
  const paAddress = deliveryAddress(data?.pa.address);
  const deliveryPlace = deliveryAddress(deliveryPlaceOverride) || paAddress;
  const control = "mt-1 h-10 w-full min-w-0 rounded-lg border border-biz-border bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-biz-blue/20";
  return <section className="overflow-hidden rounded-xl border border-biz-border bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-biz-border p-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-semibold text-biz-blue"><ArrowLeft className="h-4 w-4" />All Tenders</button>
      <ChallanPdfActions disabled={report.isError || !data?.rows.length}
        preparePdf={() => downloadTenderChallanPdf(tender.id, { reference: reference.trim() || undefined, date: date || undefined, deliveryPlace: deliveryPlaceOverride?.trim() || undefined })}
        prepareWord={() => downloadTenderChallanWord(tender.id, { reference: reference.trim() || undefined, date: date || undefined, deliveryPlace: deliveryPlaceOverride?.trim() || undefined })} />
    </div>
    <div className="space-y-1 p-4">
      <h2 className="break-words text-base font-semibold">{data?.workName || tender.workName}</h2>
      <p className="text-xs text-biz-muted">Tender ID: {data?.tenderNumber || tender.tenderNumber || "—"}{data?.costingDate ? ` · Costing Date: ${data.costingDate.slice(0, 10)}` : ""}</p>
    </div>
    {report.isLoading ? <p className="p-10 text-center text-sm text-biz-muted">Loading products…</p>
      : report.isError ? <div role="alert" className="p-6 text-center text-sm text-biz-danger"><p>{report.error.message || "Could not load this tender."}</p><button type="button" onClick={() => void report.refetch()} className="mt-3 underline">Retry</button></div>
      : data && <>
        <section aria-labelledby="challan-pa-heading" className="mx-4 mb-4 rounded-lg border border-biz-border bg-slate-50/60 p-4">
          <h3 id="challan-pa-heading" className="mb-3 text-sm font-semibold">PA Information</h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {[["PA Name", data.pa.name], ["Designation", data.pa.designation], ["Phone Number", data.pa.phone], ["Organization", data.organizationName], ["Address", data.pa.address]].map(([label, value]) => <div key={label} className={`min-w-0 ${label === "Address" ? "sm:col-span-2" : ""}`}>
              <dt className="mb-1 text-[11px] text-biz-muted">{label}</dt><dd className="whitespace-pre-line break-words text-xs font-medium [overflow-wrap:anywhere]">{value || "—"}</dd>
            </div>)}
          </dl>
        </section>
        <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-[1fr_1fr_2fr]" aria-label="Challan document information">
          <label className="min-w-0 text-[11px] text-biz-muted">Ref<input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="Reference (optional)" className={control} /></label>
          <label className="min-w-0 text-[11px] text-biz-muted">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={control} /></label>
          <label className="min-w-0 text-[11px] text-biz-muted">Place of Delivery<input value={deliveryPlaceOverride ?? paAddress} onChange={(e) => setDeliveryPlace(e.target.value)} onBlur={() => setDeliveryPlace(deliveryAddress(deliveryPlaceOverride) || null)} maxLength={1000} placeholder="Delivery location" className={control} /></label>
        </div>
        <div className="flex items-center justify-between border-t border-biz-border px-4 py-3"><h3 className="text-sm font-semibold">Product Details</h3><span className="text-xs text-biz-muted">{data.rows.length} products</span></div>
        {!data.rows.length ? <p className="p-8 text-center text-sm text-biz-muted">No saved costing items are available for this tender.</p> : <table aria-label="Challan products" className="w-full table-fixed text-left text-[10px] sm:text-xs">
          <colgroup><col className="w-[6%]" /><col className="w-[39%]" /><col className="w-[10%]" /><col className="w-[15%]" /><col className="w-[30%]" /></colgroup>
          <thead className="bg-[#245cb7] text-white"><tr>{["SL", "Product Name", "Unit", "Quantity", "Place of Delivery"].map((title) => <th key={title} scope="col" className="px-1.5 py-3 font-semibold sm:px-3">{title}</th>)}</tr></thead>
          <tbody>{data.rows.map((row, index) => <tr key={row.id} className="border-t border-biz-border align-top even:bg-slate-50/70">
            <td className="px-1.5 py-3 sm:px-3">{index + 1}</td>
            <td className="whitespace-pre-line break-words px-1.5 py-3 sm:px-3"><span className="font-medium">{row.productName}</span>{row.details && !row.productName.includes(row.details) && <span className="mt-1 block text-biz-muted">{row.details}</span>}</td>
            <td className="break-words px-1.5 py-3 sm:px-3">{row.unit}</td>
            <td className="px-1.5 py-3 tabular-nums [overflow-wrap:anywhere] sm:px-3">{quantity(row.quantity)}</td>
            <td className="whitespace-pre-line break-words px-1.5 py-3 sm:px-3">{deliveryPlace.trim() || "—"}</td>
          </tr>)}</tbody>
        </table>}
      </>}
  </section>;
}

export function TenderChallanWorkspace() {
  useSetBreadcrumb([{ label: "Projects", href: "/cms/ongoing-works" }, { label: "Project Documentation", href: "/cms/documentation" }, { label: "Challan Submission" }]);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<CostedTenderChallanSummary | null>(null);
  const deferredSearch = React.useDeferredValue(search.trim());
  const tenders = useCostedTendersForChallans({ page, limit: PAGE_SIZE, search: deferredSearch || undefined });
  const rows = tenders.data?.items ?? [];
  const totalPages = Math.max(1, tenders.data?.meta.totalPages ?? 1);
  return <div className="space-y-4 text-biz-text">
    <h1 className="text-page-title">Challan Submission</h1>
    {selected ? <TenderGoods key={selected.id} tender={selected} onBack={() => setSelected(null)} /> : <section className="overflow-hidden rounded-xl border border-biz-border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-biz-border p-4">
        <h2 className="text-sm font-semibold">Costed Tenders <span className="ml-1 rounded-full bg-blue-50 px-2 py-1 text-xs text-biz-blue">{tenders.data?.meta.total ?? 0}</span></h2>
        <label className="relative w-full sm:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" /><input aria-label="Search costed tenders" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Tender ID / Work Name / PA Name" className="h-10 w-full rounded-lg border border-biz-border pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-biz-blue/20" /></label>
      </div>
      {tenders.isError ? <div role="alert" className="p-8 text-center text-sm text-biz-danger">Could not load costed tenders. <button type="button" className="underline" onClick={() => void tenders.refetch()}>Retry</button></div>
        : tenders.isLoading ? <p className="p-10 text-center text-sm text-biz-muted">Loading tenders…</p>
        : !rows.length ? <p className="p-10 text-center text-sm text-biz-muted">No completed tender costings found.</p>
        : <table aria-label="Costed tenders" className="w-full table-fixed text-left text-[10px] sm:text-xs">
          <colgroup><col className="w-[5%]" /><col className="w-[17%] sm:w-[12%]" /><col className="w-[35%] sm:w-[43%]" /><col className="w-[25%]" /><col className="w-[18%] sm:w-[15%]" /></colgroup>
          <thead className="bg-[#245cb7] text-white"><tr>{["SL", "Tender ID", "Work Name", "PA Name", "Products"].map((title) => <th key={title} scope="col" className="px-1 py-3 font-semibold sm:px-3">{title}</th>)}</tr></thead>
          <tbody>{rows.map((tender, index) => <tr key={tender.id} data-costing-id={tender.id} className="border-t border-biz-border align-top even:bg-slate-50/60 hover:bg-blue-50/60">
            <td className="px-1 py-4 text-biz-muted sm:px-3">{(page - 1) * PAGE_SIZE + index + 1}</td>
            <td className="px-1 py-4 sm:px-3"><button type="button" onClick={() => setSelected(tender)} className="text-left font-semibold text-biz-blue [overflow-wrap:anywhere] hover:underline">{tender.tenderNumber || "—"}</button></td>
            <td className="px-1 py-4 sm:px-3"><button type="button" onClick={() => setSelected(tender)} title={tender.workName} className="text-left font-medium [overflow-wrap:anywhere] hover:text-biz-blue"><span className="line-clamp-2">{tender.workName}</span></button></td>
            <td className="px-1 py-4 [overflow-wrap:anywhere] sm:px-3">{tender.paName || "—"}</td>
            <td className="px-1 py-4 sm:px-3"><button type="button" onClick={() => setSelected(tender)} className="text-left text-biz-blue hover:underline">View ({tender.itemCount})</button></td>
          </tr>)}</tbody>
        </table>}
      <div className="flex items-center justify-between gap-3 border-t border-biz-border px-4 py-3 text-xs text-biz-muted"><span>{tenders.data?.meta.total ?? 0} tenders</span><div className="flex items-center gap-3"><button type="button" aria-label="Previous page" disabled={page <= 1 || tenders.isFetching} onClick={() => setPage(page - 1)} className="disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><span>{page} / {totalPages}</span><button type="button" aria-label="Next page" disabled={page >= totalPages || tenders.isFetching} onClick={() => setPage(page + 1)} className="disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button></div></div>
    </section>}
  </div>;
}
