"use client";

import * as React from "react";
import Link from "next/link";
import { Download, FileSpreadsheet, MoreVertical, Printer, ReceiptText, Search, Trash2 } from "lucide-react";
import { apiRequest, useExportReport, useReport } from "@bizovix/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReportResult } from "@bizovix/types";
import { formatBDT } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = () => localDate(new Date());
const monthStart = () => `${today().slice(0, 7)}-01`;

export function AllTransactionsReport() {
  useSetBreadcrumb([
    { label: "Reports", href: "/reports" },
    { label: "Transaction Reports", href: "/reports/transactions" },
    { label: "All Transactions" },
  ]);
  const [dateFrom, setDateFrom] = React.useState(monthStart);
  const [dateTo, setDateTo] = React.useState(today);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [quickFilter, setQuickFilter] = React.useState("this-month");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState("");
  const [selectingAll, setSelectingAll] = React.useState(false);
  const query = { dateFrom, dateTo, search, page, limit: pageSize };
  const queryClient = useQueryClient();
  const data = useReport("transactions", "all", query);
  const exporter = useExportReport("transactions", "all");
  const deleteSelected = useMutation({
    mutationFn: (ids: string[]) => apiRequest<{ hidden: number }>("/reports/transactions/hide", { method: "POST", body: { ids } }),
    onSuccess: async () => {
      setSelected([]);
      setConfirmDelete(false);
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["reports", "transactions", "all"] });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: async (error) => {
      setDeleteError(error.message);
      await queryClient.invalidateQueries({ queryKey: ["reports", "transactions", "all"] });
    },
  });
  const result = data.data;
  const pageIds = result?.rows.map((row) => String(row.journalId)) ?? [];
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  async function loadAllMatchingRows() {
    const rows: ReportResult["rows"] = [];
    for (let nextPage = 1; ; nextPage += 1) {
      const batch = await apiRequest<ReportResult>("/reports/transactions/all", { params: { dateFrom, dateTo, search, page: nextPage, limit: 100 } });
      rows.push(...batch.rows);
      if (nextPage >= batch.meta.totalPages) return rows;
    }
  }

  async function selectAllMatching() {
    setSelectingAll(true);
    try {
      setSelected((await loadAllMatchingRows()).map((row) => String(row.journalId)));
    } finally {
      setSelectingAll(false);
    }
  }

  async function downloadSelected() {
    const rows = (await loadAllMatchingRows()).filter((row) => selected.includes(String(row.journalId)));
    if (!rows.length || !result) return;
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const content = [
      result.columns.map((column) => escape(column.label)).join(","),
      ...rows.map((row) => result.columns.map((column) => escape(row[column.key])).join(",")),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "selected-transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function choosePeriod(value: string) {
    setQuickFilter(value);
    setPage(1);
    const now = new Date();
    let nextDateFrom = dateFrom;
    let nextDateTo = dateTo;
    if (value === "all") { nextDateFrom = ""; nextDateTo = ""; }
    if (value === "today") { nextDateFrom = today(); nextDateTo = today(); }
    if (value === "this-month") { nextDateFrom = monthStart(); nextDateTo = today(); }
    if (value === "last-month") {
      nextDateFrom = localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      nextDateTo = localDate(new Date(now.getFullYear(), now.getMonth(), 0));
    }
    if (nextDateFrom !== dateFrom || nextDateTo !== dateTo) setSelected([]);
    setDateFrom(nextDateFrom);
    setDateTo(nextDateTo);
  }
  async function exportCsv() {
    const file = await exporter.mutateAsync({ dateFrom, dateTo, search, page: 1, limit: 100 });
    const url = URL.createObjectURL(new Blob([file.content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="text-slate-800">
    <div className="flex flex-wrap items-center gap-1 border-b border-blue-100 pb-2 text-xs print:hidden">
      <Link href="/reports" className="font-semibold hover:text-blue-600">Reports</Link>
      <span className="text-slate-400">/</span>
      <Link href="/reports/transactions" className="hover:text-blue-600">Transaction Reports</Link>
      <span className="text-slate-400">/</span>
      <span className="text-orange-600">All Transactions</span>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 py-2">
      <h1 className="text-xl font-semibold text-slate-800 sm:text-2xl">All Transactions</h1>
      <div className="flex flex-wrap items-center gap-1.5">
        {result?.kpis.map((kpi, index) => <span key={kpi.label} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${index === 0 ? "bg-blue-50 text-blue-700" : index === 1 ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>
          {kpi.label}: {kpi.kind === "money" ? formatBDT(Number(kpi.value)) : kpi.value}
        </span>)}
        <button type="button" onClick={exportCsv} disabled={exporter.isPending} title="Download CSV" aria-label="Download CSV" className="rounded-full border p-2 hover:bg-blue-50 disabled:opacity-50 print:hidden"><Download className="h-4 w-4" /></button>
        <button type="button" onClick={() => window.print()} title="Print" aria-label="Print" className="rounded-full border p-2 hover:bg-blue-50 print:hidden"><Printer className="h-4 w-4" /></button>
      </div>
    </div>
    <div className="my-2 flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/40 p-2 text-xs print:hidden">
      <label className="flex items-center gap-2">Quick Filter
        <select value={quickFilter} onChange={(event) => choosePeriod(event.target.value)} className="h-8 rounded-full border border-blue-200 bg-white px-3">
          <option value="this-month">This Month</option><option value="last-month">Last Month</option><option value="today">Today</option><option value="all">All Dates</option><option value="custom">Custom</option>
        </select>
      </label>
      <label className="flex items-center gap-1">From <input aria-label="From date" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setQuickFilter("custom"); setPage(1); setSelected([]); }} className="h-8 rounded-full border border-blue-200 bg-white px-2" /></label>
      <label className="flex items-center gap-1">To <input aria-label="To date" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setQuickFilter("custom"); setPage(1); setSelected([]); }} className="h-8 rounded-full border border-blue-200 bg-white px-2" /></label>
      <label className="ml-auto flex h-8 min-w-44 items-center gap-2 rounded-full border border-slate-200 bg-white px-2"><Search className="h-3.5 w-3.5 text-slate-400" /><input aria-label="Search this report" placeholder="Search this report..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); setSelected([]); }} className="w-full bg-transparent outline-none" /></label>
      <div className="relative">
        <button type="button" aria-label="Transaction options" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)} className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-white hover:bg-blue-50"><MoreVertical className="h-4 w-4" /></button>
        {menuOpen && <div className="absolute right-0 top-10 z-20 w-48 rounded-lg border border-blue-100 bg-white p-2 shadow-lg">
          <p className="border-b border-blue-100 px-2 pb-2 text-[11px] text-slate-500">{selected.length ? `${selected.length} selected` : "Select rows first"}</p>
          <button type="button" disabled={!selected.length} onClick={() => { void downloadSelected(); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400"><FileSpreadsheet className="h-3.5 w-3.5" />Export selected</button>
          <button type="button" disabled={!selected.length || deleteSelected.isPending} onClick={() => { setMenuOpen(false); setDeleteError(""); setConfirmDelete(true); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400"><Trash2 className="h-3.5 w-3.5" />Delete selected</button>
        </div>}
      </div>
    </div>
    {allOnPageSelected && (result?.meta.total ?? 0) > pageIds.length && selected.length < (result?.meta.total ?? 0) && <div className="border-x border-t border-blue-100 bg-blue-50 px-3 py-2 text-center text-xs print:hidden">
      All {pageIds.length} rows on this page are selected. <button type="button" disabled={selectingAll} onClick={() => void selectAllMatching()} className="font-semibold text-blue-700 underline disabled:opacity-50">{selectingAll ? "Selecting..." : `Select all ${result?.meta.total} matching transactions`}</button>
    </div>}
    {!!result?.meta.total && selected.length === result.meta.total && result.meta.total > pageIds.length && <div className="border-x border-t border-blue-100 bg-blue-50 px-3 py-2 text-center text-xs print:hidden">All {selected.length} matching transactions selected.</div>}
    <div className="overflow-hidden rounded-lg border border-blue-100">
      <div className="min-h-[370px] overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-blue-100 bg-slate-50 text-slate-600"><tr>
            <th className="w-10 border-r border-blue-100 px-3 py-3 print:hidden"><input type="checkbox" aria-label="Select all transactions on this page" checked={allOnPageSelected} disabled={!pageIds.length} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, ...pageIds])] : current.filter((id) => !pageIds.includes(id)))} /></th>
            {result?.columns.map((column) => <th key={column.key} className="border-r border-blue-100 px-3 py-3 font-medium last:border-r-0">{column.label}</th>)}
          </tr></thead>
          <tbody>
            {result?.rows.map((row, index) => <tr key={`${row.voucher}-${index}`} className="border-b border-blue-50 hover:bg-blue-50/40">
              <td className="px-3 py-3 print:hidden"><input type="checkbox" aria-label={`Select ${row.voucher}`} checked={selected.includes(String(row.journalId))} onChange={(event) => setSelected((current) => event.target.checked ? [...current, String(row.journalId)] : current.filter((id) => id !== String(row.journalId)))} /></td>
              {result.columns.map((column) => <td key={column.key} className="px-3 py-3">{column.type === "money" ? formatBDT(Number(row[column.key] ?? 0)) : column.type === "date" ? new Date(String(row[column.key])).toLocaleDateString("en-GB") : String(row[column.key] ?? "-")}</td>)}
            </tr>)}
          </tbody>
        </table>
        {data.isLoading && <div className="p-10 text-center text-slate-500">Loading transactions...</div>}
        {data.isError && <div className="p-10 text-center text-red-600">Unable to load transactions. <button onClick={() => data.refetch()} className="underline">Retry</button></div>}
        {!data.isLoading && !data.isError && !result?.rows.length && <div className="flex flex-col items-center gap-3 pt-12 text-center text-slate-500">
          <span className="rounded-full border border-orange-200 bg-orange-50 p-5 text-orange-500"><ReceiptText className="h-8 w-8" /></span>
          <strong className="text-base font-medium text-slate-900">No transactions data yet</strong>
          <span>No transactions found for the selected period.</span>
        </div>}
      </div>
      {!!result?.meta.total && <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs print:hidden">
        <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, result.meta.total)} of {result.meta.total}</span>
        <div className="flex items-center gap-2"><select aria-label="Rows per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); setSelected([]); }} className="rounded border px-2 py-1"><option>20</option><option>50</option><option>100</option></select>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Previous</button><span>{page} / {result.meta.totalPages}</span><button disabled={page >= result.meta.totalPages} onClick={() => setPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>}
    </div>
    {confirmDelete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 print:hidden" role="presentation">
      <section role="dialog" aria-modal="true" aria-label="Confirm transaction deletion" className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Delete {selected.length} selected transaction{selected.length === 1 ? "" : "s"}?</h2>
        <p className="mt-2 text-sm text-slate-600">These transactions will be removed from this report. Their posted journals and original financial records will remain unchanged.</p>
        {deleteError && <p role="alert" className="mt-3 rounded bg-red-50 p-2 text-xs text-red-700">{deleteError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={deleteSelected.isPending} onClick={() => setConfirmDelete(false)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Cancel</button>
          <button type="button" disabled={deleteSelected.isPending} onClick={() => deleteSelected.mutate([...selected])} className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{deleteSelected.isPending ? "Deleting..." : `Delete ${selected.length}`}</button>
        </div>
      </section>
    </div>}
  </div>;
}
