"use client";

import * as React from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileText, Printer, Search } from "lucide-react";
import { downloadTenderBillCostingPdf, downloadTenderBillCostingWord, useCostedTendersForBills, useTenderBillCostingReport } from "@bizovix/api-client";
import type { CostedTenderBillSummary } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { createPdfPrintJob, type PdfPrintJob } from "@/lib/print-pdf";

const PAGE_SIZE = 12;
const money = (value: string, digits = 2) => Number(value).toLocaleString("en-US", { minimumFractionDigits: digits === 2 ? 2 : 0, maximumFractionDigits: digits });

function ProjectCosting({ project, onBack }: { project: CostedTenderBillSummary; onBack: () => void }) {
  const report = useTenderBillCostingReport(project.id);
  const [downloading, setDownloading] = React.useState<"pdf" | "word" | null>(null);
  const [printing, setPrinting] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState("");
  const downloadLock = React.useRef(false);
  const printJob = React.useRef<PdfPrintJob | null>(null);
  const mounted = React.useRef(true);
  const data = report.data;
  const pdfDisabled = !!downloading || printing || !data?.rows.length || report.isError;

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; printJob.current?.dispose(); };
  }, []);

  async function print() {
    if (downloadLock.current) return;
    downloadLock.current = true;
    setPrinting(true); setDownloadError("");
    try {
      const { blob } = await downloadTenderBillCostingPdf(project.id);
      if (!mounted.current) return;
      printJob.current?.dispose();
      const job = createPdfPrintJob(blob);
      printJob.current = job;
      await job.ready;
    } catch (error) {
      if (mounted.current && !(error instanceof DOMException && error.name === "AbortError")) {
        setDownloadError(error instanceof Error && error.message !== "Failed to download file" ? error.message : "Could not prepare the PDF for printing. Please try again.");
      }
    } finally { downloadLock.current = false; if (mounted.current) setPrinting(false); }
  }

  async function download(format: "pdf" | "word" = "pdf") {
    if (downloadLock.current) return;
    downloadLock.current = true;
    setDownloading(format); setDownloadError("");
    try {
      const { blob, fileName } = await (format === "word" ? downloadTenderBillCostingWord(project.id) : downloadTenderBillCostingPdf(project.id));
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = fileName || `tender-costing-${project.tenderNumber || project.id}.${format === "word" ? "docx" : "pdf"}`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { if (mounted.current) setDownloadError(error instanceof Error ? error.message : "Could not download the document. Please try again."); }
    finally { downloadLock.current = false; if (mounted.current) setDownloading(null); }
  }

  return <section className="overflow-hidden rounded-xl border border-biz-border bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-biz-border p-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-semibold text-biz-blue"><ArrowLeft className="h-4 w-4" />All Tenders</button>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void print()} disabled={pdfDisabled} className="inline-flex items-center gap-2 rounded-lg border border-biz-border bg-white px-4 py-2.5 text-xs font-semibold text-biz-text hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue/40 disabled:cursor-not-allowed disabled:opacity-40"><Printer className="h-4 w-4" />{printing ? "Preparing Print…" : "Print"}</button>
        <button type="button" onClick={() => void download()} disabled={pdfDisabled} className="inline-flex items-center gap-2 rounded-lg bg-biz-blue px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-4 w-4" />{downloading === "pdf" ? "Downloading…" : "Download PDF"}</button>
        <button type="button" onClick={() => void download("word")} disabled={pdfDisabled} className="inline-flex items-center gap-2 rounded-lg border border-biz-border bg-white px-4 py-2.5 text-xs font-semibold text-biz-blue disabled:cursor-not-allowed disabled:opacity-40"><FileText className="h-4 w-4" />{downloading === "word" ? "Downloading…" : "Download Word"}</button>
      </div>
    </div>
    <div className="space-y-1 p-4">
      <h2 className="break-words text-base font-semibold text-biz-text">{data?.project.workName || project.workName}</h2>
      {data && !report.isError && <p className="text-xs text-biz-muted">Tender ID: {data.tenderNumber} · {data.costingDate ? `Costing Date: ${data.costingDate.slice(0, 10)} · ` : ""}Currency: BDT</p>}
    </div>
    {data && !report.isError && <section aria-labelledby="project-pa-heading" className="mx-4 mb-4 rounded-lg border border-biz-border bg-slate-50/60 p-4">
      <h3 id="project-pa-heading" className="mb-3 text-sm font-semibold">PA Information</h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["PA Name", data.pa.name], ["Designation", data.pa.designation], ["Phone Number", data.pa.phone],
          ["Organization", data.project.organizationName], ["Address", data.pa.address],
          ...(data.pa.email ? [["Email", data.pa.email]] : []),
        ].map(([label, value]) => <div key={label} className={`min-w-0 ${label === "Address" ? "sm:col-span-2" : ""}`}>
          <dt className="mb-1 text-[11px] text-biz-muted">{label}</dt>
          <dd className="whitespace-pre-line break-words text-xs font-medium [overflow-wrap:anywhere]">{value || "—"}</dd>
        </div>)}
      </dl>
    </section>}
    {report.isLoading ? <p className="p-10 text-center text-sm text-biz-muted">Loading tender costing…</p>
      : report.isError ? <div role="alert" className="p-6 text-center text-sm text-biz-danger"><p>{report.error.message || "Could not load tender costing."}</p><button onClick={() => void report.refetch()} className="mt-3 underline">Retry</button></div>
      : !data?.rows.length ? <p className="border-t border-biz-border p-8 text-center text-sm text-biz-muted">No saved costing items are available for this tender.</p>
      : <>
        <div className="flex items-center justify-between border-t border-biz-border px-4 py-3"><h3 className="text-sm font-semibold">Tender Costing Details</h3><span className="text-xs text-biz-muted">{data.rows.length} products</span></div>
        <table className="w-full table-fixed text-left text-[10px] sm:text-xs" aria-label="Project costing">
          <colgroup><col className="w-[5%]" /><col className="w-[30%] sm:w-[36%]" /><col className="w-[9%] sm:w-[8%]" /><col className="w-[14%] sm:w-[11%]" /><col className="w-[21%] sm:w-[20%]" /><col className="w-[21%] sm:w-[20%]" /></colgroup>
          <thead className="bg-[#245cb7] text-white"><tr>{["SL", "Product Name", "Unit", "Quantity", "Unit Price", "Total Price"].map((title, index) => <th key={title} scope="col" className={`px-1.5 py-3 font-semibold sm:px-3 ${index >= 3 ? "text-right" : ""}`}>{title}</th>)}</tr></thead>
          <tbody>{data.rows.map((row, index) => <tr key={row.id} className="border-t border-biz-border even:bg-slate-50/70">
            <td className="px-1.5 py-3 align-top sm:px-3">{index + 1}</td>
            <td className="break-words px-1.5 py-3 align-top font-medium sm:px-3">{row.productName}</td>
            <td className="break-words px-1.5 py-3 align-top sm:px-3">{row.unit}</td>
            <td className="px-1.5 py-3 text-right align-top tabular-nums [overflow-wrap:anywhere] sm:px-3">{money(row.quantity, 3)}</td>
            <td className="px-1.5 py-3 text-right align-top tabular-nums [overflow-wrap:anywhere] sm:px-3">{money(row.unitPrice, 6)}</td>
            <td className="px-1.5 py-3 text-right align-top font-semibold tabular-nums [overflow-wrap:anywhere] sm:px-3">{money(row.totalPrice)}</td>
          </tr>)}</tbody>
          <tfoot className="border-t-2 border-biz-border bg-slate-50">
            {!!data.adjustments?.length && <tr><td colSpan={5} className="px-3 py-2 text-right">Items Total</td><td className="px-1.5 py-2 text-right tabular-nums [overflow-wrap:anywhere] sm:px-3">{money(data.itemsTotalPrice || "0")}</td></tr>}
            {data.adjustments?.map((entry) => <tr key={entry.label}><td colSpan={5} className="px-3 py-2 text-right">{entry.label}</td><td className="px-1.5 py-2 text-right tabular-nums [overflow-wrap:anywhere] sm:px-3">{money(entry.amount)}</td></tr>)}
            <tr><td colSpan={5} className="px-3 py-4 text-right font-semibold">Grand Total (BDT)</td><td className="px-1.5 py-4 text-right font-bold tabular-nums [overflow-wrap:anywhere] sm:px-3">{money(data.totalPrice)}</td></tr>
          </tfoot>
        </table>
      </>}
    {downloadError && <p role="alert" className="p-4 text-sm text-biz-danger">{downloadError}</p>}
  </section>;
}

export function ProjectCostingWorkspace() {
  useSetBreadcrumb([{ label: "Projects", href: "/cms/ongoing-works" }, { label: "Project Documentation", href: "/cms/documentation" }, { label: "Bill Submission" }]);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<CostedTenderBillSummary | null>(null);
  const deferredSearch = React.useDeferredValue(search.trim());
  const works = useCostedTendersForBills({ page, limit: PAGE_SIZE, search: deferredSearch || undefined });
  const rows = works.data?.items ?? [];
  const totalPages = Math.max(1, works.data?.meta.totalPages ?? 1);

  return <div className="space-y-4 text-biz-text">
    <h1 className="text-page-title">Bill Submission</h1>
    {selected ? <ProjectCosting key={selected.id} project={selected} onBack={() => setSelected(null)} /> : <section className="overflow-hidden rounded-xl border border-biz-border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-biz-border p-4">
        <h2 className="text-sm font-semibold">Costed Tenders <span className="ml-1 rounded-full bg-blue-50 px-2 py-1 text-xs text-biz-blue">{works.data?.meta.total ?? 0}</span></h2>
        <label className="relative w-full sm:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" /><input aria-label="Search costed tenders" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Tender ID / Work Name / PA Name" className="h-10 w-full rounded-lg border border-biz-border pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-biz-blue/20" /></label>
      </div>
      {works.isError ? <div role="alert" className="p-8 text-center text-sm text-biz-danger">Could not load costed tenders. <button className="underline" onClick={() => void works.refetch()}>Retry</button></div>
        : works.isLoading ? <p className="p-10 text-center text-sm text-biz-muted">Loading tenders…</p>
        : !rows.length ? <p className="p-10 text-center text-sm text-biz-muted">No completed tender costings found.</p>
        : <table aria-label="Costed tenders" className="w-full table-fixed text-left text-[10px] sm:text-xs">
          <colgroup><col className="w-[4%]" /><col className="w-[15%] sm:w-[10%]" /><col className="w-[26%] sm:w-[38%]" /><col className="w-[15%] sm:w-[16%]" /><col className="w-[17%] sm:w-[14%]" /><col className="w-[23%] sm:w-[18%]" /></colgroup>
          <thead className="bg-[#245cb7] text-white"><tr>{["SL", "Tender ID", "Work Name", "PA Name", "Unit Rate (BDT)", "Grand Total (BDT)"].map((title, index) => <th key={title} scope="col" className={`px-1 py-3 font-semibold sm:px-3 ${index >= 4 ? "text-right" : ""}`}>{title}</th>)}</tr></thead>
          <tbody>{rows.map((tender, index) => <tr key={tender.id} data-costing-id={tender.id} className="border-t border-biz-border align-top even:bg-slate-50/60 hover:bg-blue-50/60">
            <td className="px-1 py-4 text-biz-muted sm:px-3">{(page - 1) * PAGE_SIZE + index + 1}</td>
            <td className="px-1 py-4 sm:px-3"><button type="button" onClick={() => setSelected(tender)} className="text-left font-semibold text-biz-blue [overflow-wrap:anywhere] hover:underline">{tender.tenderNumber || "—"}</button></td>
            <td className="px-1 py-4 sm:px-3"><button type="button" onClick={() => setSelected(tender)} title={tender.workName} className="text-left font-medium text-biz-text [overflow-wrap:anywhere] hover:text-biz-blue"><span className="line-clamp-2">{tender.workName}</span></button></td>
            <td className="px-1 py-4 [overflow-wrap:anywhere] sm:px-3">{tender.paName || "—"}</td>
            <td className="px-1 py-4 text-right text-[9px] tabular-nums [overflow-wrap:anywhere] sm:px-3 sm:text-xs">{tender.unitRate !== null ? money(tender.unitRate, 6) : <button type="button" onClick={() => setSelected(tender)} className="text-biz-blue hover:underline">View Rates ({tender.itemCount})</button>}</td>
            <td className="px-1 py-4 text-right text-[9px] font-semibold tabular-nums [overflow-wrap:anywhere] sm:px-3 sm:text-xs">{money(tender.grandTotal)}</td>
          </tr>)}</tbody>
        </table>}
      <div className="flex items-center justify-between gap-3 border-t border-biz-border px-4 py-3 text-xs text-biz-muted"><span>{works.data?.meta.total ?? 0} tenders</span><div className="flex items-center gap-3"><button type="button" aria-label="Previous page" disabled={page <= 1 || works.isFetching} onClick={() => setPage(page - 1)} className="disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><span>{page} / {totalPages}</span><button type="button" aria-label="Next page" disabled={page >= totalPages || works.isFetching} onClick={() => setPage(page + 1)} className="disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button></div></div>
    </section>}
  </div>;
}
