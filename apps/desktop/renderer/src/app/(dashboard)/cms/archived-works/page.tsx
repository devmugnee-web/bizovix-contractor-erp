"use client";

import * as React from "react";
import Link from "next/link";
import {
  Archive,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Eye,
  FileText,
  MoreVertical,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  useAllOrganizations,
  useCmsWorkCategories,
  useCmsWorks,
  useCmsWorkStats,
  useExportCmsWorks,
  useRestoreCmsWork,
} from "@bizovix/api-client";
import type { CmsWorkQuery } from "@bizovix/types";
import { DateInput, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const PAGE_SIZE = 12;

function formatCrore(value: string | undefined) {
  return `BDT ${(Number(value ?? 0) / 10_000_000).toFixed(2)} Cr`;
}

function formatValue(value: string) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TableSkeleton() {
  return <>{Array.from({ length: 6 }).map((_, index) => <tr key={index} className="border-b border-biz-border"><td colSpan={7} className="px-4 py-2.5"><div className="h-5 animate-pulse rounded-sm bg-slate-100" /></td></tr>)}</>;
}

export default function ArchivedWorksPage() {
  useSetBreadcrumb([{ label: "CMS" }, { label: "Archived Works" }]);
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search.trim());
  const [organizationMasterId, setOrganizationMasterId] = React.useState("");
  const [workCategory, setWorkCategory] = React.useState("");
  const [completionDateFrom, setCompletionDateFrom] = React.useState("");
  const [completionDateTo, setCompletionDateTo] = React.useState("");
  const [dateOpen, setDateOpen] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  const filters: CmsWorkQuery = {
    status: "ARCHIVED",
    search: deferredSearch || undefined,
    organizationMasterId: organizationMasterId || undefined,
    workCategory: workCategory || undefined,
    completionDateFrom: completionDateFrom || undefined,
    completionDateTo: completionDateTo || undefined,
  };
  const works = useCmsWorks({ ...filters, page, limit: PAGE_SIZE });
  const stats = useCmsWorkStats("ARCHIVED");
  const organizations = useAllOrganizations();
  const categories = useCmsWorkCategories();
  const restoreWork = useRestoreCmsWork();
  const exportWorks = useExportCmsWorks();
  const items = works.data?.items ?? [];
  const meta = works.data?.meta ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  function resetFilters() {
    setSearch("");
    setOrganizationMasterId("");
    setWorkCategory("");
    setCompletionDateFrom("");
    setCompletionDateTo("");
    setDateOpen(false);
    setPage(1);
  }

  function restore(id: string) {
    setOpenMenuId(null);
    if (!window.confirm("Restore this work to Ongoing Works?")) return;
    restoreWork.mutate(id);
  }

  function exportCsv() {
    exportWorks.mutate(filters, {
      onSuccess: ({ filename, content }) => {
        const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title text-biz-text">Archived Works</h1>
          <p className="mt-1 text-[13px] text-biz-muted">List of all completed works / projects.</p>
        </div>
        <SecondaryButton onClick={exportCsv} disabled={exportWorks.isPending} className="h-10 rounded-md px-4">
          <Download className="h-4 w-4" /> {exportWorks.isPending ? "Exporting..." : "Export"}
        </SecondaryButton>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex min-h-[116px] items-center gap-5 rounded-lg border border-blue-100 bg-blue-50/45 px-5 py-4 shadow-sm">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-biz-blue"><Archive className="h-8 w-8" /></div>
          <div><p className="text-[14px] font-semibold text-biz-text">Archived Works</p><p className="mt-1 text-[29px] font-bold leading-none text-biz-blue">{stats.isLoading ? "--" : stats.data?.archivedWorks ?? 0}</p><p className="mt-2 text-[12px] text-biz-muted">Total number of archived works</p></div>
        </div>
        <div className="flex min-h-[116px] items-center gap-5 rounded-lg border border-emerald-100 bg-emerald-50/45 px-5 py-4 shadow-sm">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-biz-success"><FileText className="h-8 w-8" /></div>
          <div><p className="text-[14px] font-semibold text-biz-text">Total Work Value</p><p className="mt-1 text-[29px] font-bold leading-none text-biz-success">{stats.isLoading ? "--" : formatCrore(stats.data?.totalWorkValue)}</p><p className="mt-2 text-[12px] text-biz-muted">Total contract value of archived works</p></div>
        </div>
      </div>

      <section className="overflow-visible rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="grid grid-cols-1 items-end gap-3 border-b border-biz-border p-4 lg:grid-cols-[minmax(240px,1fr)_150px_150px_190px_auto]">
          <div className="flex flex-col gap-1.5"><label className="text-[12px] font-medium text-biz-muted">Search</label><TextInput icon={Search} value={search} placeholder="Search by Work Name or Organization..." onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
          <div className="flex flex-col gap-1.5"><label className="text-[12px] font-medium text-biz-muted">Organization</label><SelectInput placeholder="All" value={organizationMasterId} onChange={(event) => { setOrganizationMasterId(event.target.value); setPage(1); }} options={(organizations.data ?? []).map((org) => ({ label: org.shortName, value: org.id }))} /></div>
          <div className="flex flex-col gap-1.5"><label className="text-[12px] font-medium text-biz-muted">Work Category</label><SelectInput placeholder="All" value={workCategory} onChange={(event) => { setWorkCategory(event.target.value); setPage(1); }} options={(categories.data ?? []).map((category) => ({ label: category, value: category }))} /></div>
          <div className="relative flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-biz-muted">Completion Date</label>
            <button type="button" onClick={() => setDateOpen((value) => !value)} className="flex h-11 items-center gap-2 rounded-sm border border-biz-border bg-white px-3 text-left text-[12px] text-biz-text focus:ring-2 focus:ring-biz-blue/30"><CalendarDays className="h-4 w-4 text-biz-muted" /><span className="truncate">{completionDateFrom || completionDateTo ? `${completionDateFrom || "Start"} - ${completionDateTo || "End"}` : "Select Date Range"}</span></button>
            {dateOpen && <div className="absolute right-0 top-[68px] z-30 w-[290px] rounded-md border border-biz-border bg-white p-3 shadow-lg"><div className="grid grid-cols-2 gap-2"><div><span className="mb-1 block text-[11px] text-biz-muted">From</span><DateInput value={completionDateFrom} onChange={(event) => { setCompletionDateFrom(event.target.value); setPage(1); }} /></div><div><span className="mb-1 block text-[11px] text-biz-muted">To</span><DateInput value={completionDateTo} min={completionDateFrom} onChange={(event) => { setCompletionDateTo(event.target.value); setPage(1); }} /></div></div><button type="button" onClick={() => setDateOpen(false)} className="mt-3 h-8 w-full rounded-sm bg-biz-blue text-[12px] font-semibold text-white">Apply Date Range</button></div>}
          </div>
          <SecondaryButton onClick={resetFilters} className="h-11"><RotateCcw className="h-4 w-4" /> Clear Filter</SecondaryButton>
        </div>

        {(works.isError || stats.isError || exportWorks.isError) && <div className="mx-4 mt-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-biz-danger"><span>Could not load or export archived works.</span><button type="button" className="font-semibold underline" onClick={() => { works.refetch(); stats.refetch(); }}>Retry</button></div>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left">
            <thead className="bg-[#f4f7fb] text-[11px] font-semibold text-biz-text"><tr className="border-b border-biz-border"><th className="w-12 px-4 py-2.5">SL</th><th className="px-4 py-2.5">Work / Project Name</th><th className="w-32 px-4 py-2.5">Organization</th><th className="w-36 px-4 py-2.5">Work Category</th><th className="w-40 px-4 py-2.5 text-right">Work Value (BDT)</th><th className="w-36 px-4 py-2.5">Completion Date</th><th className="w-48 px-4 py-2.5 text-center">Action</th></tr></thead>
            <tbody className="text-[12px] text-biz-text">
              {works.isLoading ? <TableSkeleton /> : items.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-[13px] text-biz-muted">No archived works found.</td></tr> : items.map((work, index) => (
                <tr key={work.id} className="border-b border-biz-border last:border-0 hover:bg-biz-bg/60"><td className="px-4 py-2.5 text-biz-muted">{(meta.page - 1) * meta.limit + index + 1}</td><td className="px-4 py-2.5 font-medium">{work.workName}</td><td className="px-4 py-2.5">{work.organizationMaster.shortName}</td><td className="px-4 py-2.5">{work.workCategory}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatValue(work.contractValue)}</td><td className="px-4 py-2.5">{work.completionDate ? formatDate(work.completionDate) : "--"}</td><td className="px-4 py-2 text-center"><div className="relative inline-flex items-center gap-2"><Link href={`/cms/archived-works/${work.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-biz-blue bg-white px-2.5 text-[11px] font-semibold text-biz-blue hover:bg-biz-blue-soft"><Eye className="h-3.5 w-3.5" /> View Details</Link><button type="button" aria-label="More actions" title="More actions" onClick={() => setOpenMenuId((current) => current === work.id ? null : work.id)} className="flex h-8 w-8 items-center justify-center rounded-sm text-biz-muted hover:bg-biz-bg"><MoreVertical className="h-4 w-4" /></button>{openMenuId === work.id && <div className="absolute right-0 top-9 z-20 w-40 rounded-md border border-biz-border bg-white p-1 text-left shadow-lg"><Link href={`/cms/archived-works/${work.id}`} className="block rounded-sm px-3 py-2 text-[12px] hover:bg-biz-bg">View Details</Link><button type="button" disabled={restoreWork.isPending} onClick={() => restore(work.id)} className="w-full rounded-sm px-3 py-2 text-left text-[12px] text-biz-blue hover:bg-biz-blue-soft disabled:opacity-50">Restore to Ongoing</button></div>}</div></td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-biz-border px-4 py-3 text-[11px] text-biz-muted">
          <span>Showing {meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1} to {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} entries</span>
          <div className="flex items-center gap-1"><button type="button" aria-label="First page" disabled={meta.page <= 1} onClick={() => setPage(1)} className="flex h-8 w-8 items-center justify-center rounded-sm border border-biz-border disabled:text-slate-300"><ChevronsLeft className="h-3.5 w-3.5" /></button><button type="button" aria-label="Previous page" disabled={meta.page <= 1} onClick={() => setPage(meta.page - 1)} className="flex h-8 w-8 items-center justify-center rounded-sm border border-biz-border disabled:text-slate-300"><ChevronLeft className="h-3.5 w-3.5" /></button>{Array.from({ length: meta.totalPages }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} className={`flex h-8 min-w-8 items-center justify-center rounded-sm border px-2 font-semibold ${number === meta.page ? "border-biz-blue bg-biz-blue text-white" : "border-biz-border bg-white text-biz-text"}`}>{number}</button>)}<button type="button" aria-label="Next page" disabled={meta.page >= meta.totalPages} onClick={() => setPage(meta.page + 1)} className="flex h-8 w-8 items-center justify-center rounded-sm border border-biz-border disabled:text-slate-300"><ChevronRight className="h-3.5 w-3.5" /></button><button type="button" aria-label="Last page" disabled={meta.page >= meta.totalPages} onClick={() => setPage(meta.totalPages)} className="flex h-8 w-8 items-center justify-center rounded-sm border border-biz-border disabled:text-slate-300"><ChevronsRight className="h-3.5 w-3.5" /></button></div>
        </div>
      </section>
    </div>
  );
}
