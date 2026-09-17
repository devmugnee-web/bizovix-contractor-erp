"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Archive,
  Eye,
  FileText,
  FolderKanban,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  useAllOrganizations,
  useArchiveCmsWork,
  useCmsWorkCategories,
  useCmsWorks,
  useCmsWorkStats,
} from "@bizovix/api-client";
import type { CmsWorkQuery } from "@bizovix/types";
import { PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const PAGE_SIZE = 12;

function formatCrore(value: string | undefined) {
  if (!value) return "BDT 0.00 Cr";
  return `BDT ${(Number(value) / 10_000_000).toFixed(2)} Cr`;
}

function formatValue(value: string) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        <tr key={index} className="border-b border-biz-border last:border-0">
          <td colSpan={7} className="px-4 py-2.5">
            <div className="h-5 animate-pulse rounded-sm bg-slate-100" />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function OngoingWorksPage() {
  useSetBreadcrumb([{ label: "CMS" }, { label: "Ongoing Works" }]);

  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search.trim());
  const [organizationMasterId, setOrganizationMasterId] = React.useState("");
  const [workCategory, setWorkCategory] = React.useState("");
  const [page, setPage] = React.useState(1);
  const tableScrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    tableScrollRef.current?.scrollTo({ top: 0 });
  }, [page, deferredSearch, organizationMasterId, workCategory]);

  const query: CmsWorkQuery = {
    page,
    limit: PAGE_SIZE,
    status: "ONGOING",
    search: deferredSearch || undefined,
    organizationMasterId: organizationMasterId || undefined,
    workCategory: workCategory || undefined,
  };
  const works = useCmsWorks(query);
  const stats = useCmsWorkStats();
  const organizations = useAllOrganizations();
  const categories = useCmsWorkCategories();
  const archiveWork = useArchiveCmsWork();

  const items = works.data?.items ?? [];
  const meta = works.data?.meta ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  function resetFilters() {
    setSearch("");
    setOrganizationMasterId("");
    setWorkCategory("");
    setPage(1);
  }

  function archive(id: string) {
    if (!window.confirm("Archive this work?")) return;
    archiveWork.mutate(id);
  }

  return (
    <div className="flex flex-col gap-2 pb-3 lg:h-full lg:min-h-0 lg:pb-0 print:h-auto print:overflow-visible">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-0.5">
        <h1 className="text-page-title text-biz-text">Ongoing Works</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-100 bg-blue-50/70 px-2.5">
            <FolderKanban className="h-4 w-4 text-biz-blue" aria-hidden="true" />
            <span className="text-[11px] font-medium text-biz-navy/70">Active works</span>
            <strong className="border-l border-blue-200 pl-2 text-[14px] font-bold text-biz-blue tabular-nums">{stats.isLoading ? "--" : stats.data?.ongoingWorks ?? 0}</strong>
          </div>
          <div className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50/70 px-2.5">
            <FileText className="h-4 w-4 text-biz-success" aria-hidden="true" />
            <span className="text-[11px] font-medium text-biz-navy/70">Total contract value</span>
            <strong className="border-l border-emerald-200 pl-2 text-[14px] font-bold text-biz-success tabular-nums">{stats.isLoading ? "--" : formatCrore(stats.data?.totalWorkValue)}</strong>
          </div>
        </div>
        <Link href="/cms/ongoing-works/create" className="ml-auto">
          <PrimaryButton className="h-9 rounded-md px-3">
            <Plus className="h-4 w-4" />
            Add Manual Work
          </PrimaryButton>
        </Link>
      </div>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-biz-border bg-biz-surface shadow-card lg:flex-1 print:overflow-visible">
        <div className="grid grid-cols-1 items-center gap-2 border-b border-biz-border bg-slate-50/50 px-3 py-2 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1fr)_170px_150px_auto]">
          <div>
            <label htmlFor="ongoing-work-search" className="sr-only">Search works</label>
            <TextInput
              id="ongoing-work-search"
              icon={Search}
              className="h-9"
              value={search}
              placeholder="Search by Tender ID, Work Name or Organization..."
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            />
          </div>
          <div>
            <label htmlFor="ongoing-work-organization" className="sr-only">Organization</label>
            <SelectInput
              id="ongoing-work-organization"
              className="h-9"
              placeholder="All organizations"
              value={organizationMasterId}
              onChange={(event) => { setOrganizationMasterId(event.target.value); setPage(1); }}
              options={(organizations.data ?? []).map((org) => ({ label: org.shortName, value: org.id }))}
            />
          </div>
          <div>
            <label htmlFor="ongoing-work-category" className="sr-only">Work category</label>
            <SelectInput
              id="ongoing-work-category"
              className="h-9"
              placeholder="All categories"
              value={workCategory}
              onChange={(event) => { setWorkCategory(event.target.value); setPage(1); }}
              options={(categories.data ?? []).map((category) => ({ label: category, value: category }))}
            />
          </div>
          <SecondaryButton onClick={resetFilters} className="h-9 whitespace-nowrap px-2.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Clear
          </SecondaryButton>
        </div>

        {(works.isError || stats.isError) && (
          <div className="mx-4 mt-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-biz-danger">
            <span>Could not load ongoing works.</span>
            <button type="button" className="font-semibold underline" onClick={() => { works.refetch(); stats.refetch(); }}>Retry</button>
          </div>
        )}

        <div ref={tableScrollRef} className="min-h-0 overflow-x-auto lg:flex-1 lg:overflow-auto print:overflow-visible">
          <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[#edf2f8] text-[11px] font-semibold text-biz-navy shadow-[0_1px_0_0_#dbe4ef]">
              <tr className="border-b border-biz-border">
                <th className="w-10 px-3 py-2.5">#</th>
                <th className="w-[88px] px-3 py-2.5">Tender ID</th>
                <th className="w-[35%] px-3 py-2.5">Work / Project Name</th>
                <th className="w-[18%] px-3 py-2.5">Organization</th>
                <th className="w-24 px-3 py-2.5">Category</th>
                <th className="w-32 px-3 py-2.5 text-right">Value (BDT)</th>
                <th className="w-[120px] px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-[12px] text-biz-text [&_tr:nth-child(even)]:bg-slate-50/50">
              {works.isLoading ? <TableSkeleton /> : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-[13px] text-biz-muted">No ongoing works found.</td></tr>
              ) : items.map((work, index) => (
                <tr key={work.id} className="border-b border-biz-border last:border-0 hover:bg-[#f4f8ff]">
                  <td className="px-3 py-2 text-biz-muted">{(meta.page - 1) * meta.limit + index + 1}</td>
                  <td className="px-3 py-2 font-semibold text-biz-blue">{work.tenderNumber ?? "Manual Work"}</td>
                  <td className="px-3 py-2 font-medium" title={work.workName}>
                    <Link href={`/cms/ongoing-works/${work.id}`} className="line-clamp-2 leading-[18px] hover:text-biz-blue hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-biz-blue">{work.workName}</Link>
                  </td>
                  <td className="px-3 py-2" title={work.organizationMaster.shortName}><span className="line-clamp-2 leading-[18px]">{work.organizationMaster.shortName}</span></td>
                  <td className="px-3 py-2" title={work.workCategory}><span className="block truncate">{work.workCategory}</span></td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatValue(work.contractValue)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Link href={`/cms/ongoing-works/${work.id}`} className="inline-flex h-7 items-center gap-1 rounded-md border border-biz-border bg-white px-2 text-[11px] font-semibold text-biz-blue hover:border-biz-blue hover:bg-biz-blue-soft">
                        <Eye className="h-3.5 w-3.5" /> Details
                      </Link>
                      <button type="button" aria-label={`Archive ${work.workName}`} title="Archive work" disabled={archiveWork.isPending} onClick={() => archive(work.id)} className="flex h-7 w-7 items-center justify-center rounded-md text-biz-muted hover:bg-red-50 hover:text-biz-danger disabled:opacity-50">
                        <Archive className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-biz-border px-3 py-1 text-[11px] text-biz-muted">
          <span className="tabular-nums">{meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}</span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="First page" disabled={meta.page <= 1} onClick={() => setPage(1)} className="flex h-7 w-7 items-center justify-center rounded-sm border border-biz-border disabled:text-slate-300"><ChevronsLeft className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="Previous page" disabled={meta.page <= 1} onClick={() => setPage(meta.page - 1)} className="flex h-7 w-7 items-center justify-center rounded-sm border border-biz-border disabled:text-slate-300"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <span className="flex h-7 min-w-7 items-center justify-center rounded-sm bg-biz-blue px-2 font-semibold text-white">{meta.page}</span>
            <button type="button" aria-label="Next page" disabled={meta.page >= meta.totalPages} onClick={() => setPage(meta.page + 1)} className="flex h-7 w-7 items-center justify-center rounded-sm border border-biz-border disabled:text-slate-300"><ChevronRight className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="Last page" disabled={meta.page >= meta.totalPages} onClick={() => setPage(meta.totalPages)} className="flex h-7 w-7 items-center justify-center rounded-sm border border-biz-border disabled:text-slate-300"><ChevronsRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </section>
    </div>
  );
}
