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
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        <tr key={index} className="border-b border-biz-border">
          <td colSpan={7} className="px-4 py-2.5">
            <div className="h-5 animate-pulse rounded-sm bg-slate-100" />
          </td>
        </tr>
      ))}
    </>
  );
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
  const tableScrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    tableScrollRef.current?.scrollTo({ top: 0 });
  }, [
    page,
    deferredSearch,
    organizationMasterId,
    workCategory,
    completionDateFrom,
    completionDateTo,
  ]);

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
    <div className="flex flex-col gap-2.5 pb-3 lg:h-full lg:min-h-0 lg:pb-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-0.5">
        <h1 className="text-page-title text-biz-text">Archived Works</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-100 bg-blue-50/70 px-2.5">
            <Archive className="h-4 w-4 text-biz-blue" aria-hidden="true" />
            <span className="text-[11px] font-medium text-biz-navy/70">Archived works</span>
            <strong className="border-l border-blue-200 pl-2 text-[14px] font-bold tabular-nums text-biz-blue">
              {stats.isLoading ? "--" : (stats.data?.archivedWorks ?? 0)}
            </strong>
          </div>
          <div className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50/70 px-2.5">
            <FileText className="h-4 w-4 text-biz-success" aria-hidden="true" />
            <span className="text-[11px] font-medium text-biz-navy/70">Total work value</span>
            <strong className="border-l border-emerald-200 pl-2 text-[14px] font-bold tabular-nums text-biz-success">
              {stats.isLoading ? "--" : formatCrore(stats.data?.totalWorkValue)}
            </strong>
          </div>
        </div>
        <SecondaryButton
          onClick={exportCsv}
          disabled={exportWorks.isPending}
          className="ml-auto h-9 rounded-md px-3"
        >
          <Download className="h-4 w-4" /> {exportWorks.isPending ? "Exporting..." : "Export"}
        </SecondaryButton>
      </div>

      <section className="flex min-h-0 flex-col overflow-visible rounded-lg border border-biz-border bg-biz-surface shadow-card lg:flex-1">
        <div className="grid grid-cols-1 items-center gap-2 border-b border-biz-border bg-slate-50/50 px-3 py-2 sm:grid-cols-2 xl:grid-cols-[minmax(230px,1fr)_160px_150px_190px_auto]">
          <div>
            <label htmlFor="archived-work-search" className="sr-only">
              Search archived works
            </label>
            <TextInput
              id="archived-work-search"
              icon={Search}
              className="h-9"
              value={search}
              placeholder="Search by work name or organization..."
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label htmlFor="archived-work-organization" className="sr-only">
              Organization
            </label>
            <SelectInput
              id="archived-work-organization"
              className="h-9"
              placeholder="All organizations"
              value={organizationMasterId}
              onChange={(event) => {
                setOrganizationMasterId(event.target.value);
                setPage(1);
              }}
              options={(organizations.data ?? []).map((org) => ({
                label: org.shortName,
                value: org.id,
              }))}
            />
          </div>
          <div>
            <label htmlFor="archived-work-category" className="sr-only">
              Work category
            </label>
            <SelectInput
              id="archived-work-category"
              className="h-9"
              placeholder="All categories"
              value={workCategory}
              onChange={(event) => {
                setWorkCategory(event.target.value);
                setPage(1);
              }}
              options={(categories.data ?? []).map((category) => ({
                label: category,
                value: category,
              }))}
            />
          </div>
          <div className="relative">
            <span className="sr-only">Completion date range</span>
            <button
              type="button"
              aria-label="Completion date range"
              aria-expanded={dateOpen}
              onClick={() => setDateOpen((value) => !value)}
              className="flex h-9 w-full items-center gap-2 rounded-md border border-biz-border bg-white px-3 text-left text-[12px] text-biz-text focus:ring-2 focus:ring-biz-blue/30"
            >
              <CalendarDays className="h-4 w-4 shrink-0 text-biz-muted" />
              <span className="truncate">
                {completionDateFrom || completionDateTo
                  ? `${completionDateFrom || "Start"} - ${completionDateTo || "End"}`
                  : "Completion date"}
              </span>
            </button>
            {dateOpen && (
              <div className="absolute right-0 top-10 z-30 w-[290px] rounded-md border border-biz-border bg-white p-3 shadow-lg">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="mb-1 block text-[11px] text-biz-muted">From</span>
                    <DateInput
                      value={completionDateFrom}
                      onChange={(event) => {
                        setCompletionDateFrom(event.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] text-biz-muted">To</span>
                    <DateInput
                      value={completionDateTo}
                      min={completionDateFrom}
                      onChange={(event) => {
                        setCompletionDateTo(event.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDateOpen(false)}
                  className="mt-3 h-8 w-full rounded-sm bg-biz-blue text-[12px] font-semibold text-white"
                >
                  Apply Date Range
                </button>
              </div>
            )}
          </div>
          <SecondaryButton onClick={resetFilters} className="h-9 whitespace-nowrap px-2.5">
            <RotateCcw className="h-3.5 w-3.5" /> Clear
          </SecondaryButton>
        </div>

        {(works.isError || stats.isError || exportWorks.isError) && (
          <div className="mx-4 mt-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-biz-danger">
            <span>Could not load or export archived works.</span>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                works.refetch();
                stats.refetch();
              }}
            >
              Retry
            </button>
          </div>
        )}

        <div className="min-h-0 divide-y divide-biz-border lg:flex-1 lg:overflow-y-auto xl:hidden">
          {works.isLoading ? (
            <div className="space-y-3 p-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-md bg-slate-100" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-12 text-center text-[13px] text-biz-muted">
              No archived works found.
            </p>
          ) : (
            items.map((work, index) => (
              <article key={work.id} className="p-3 hover:bg-[#f4f8ff]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-biz-muted">
                      #{(meta.page - 1) * meta.limit + index + 1} · {work.workCategory}
                    </p>
                    <Link
                      href={`/cms/archived-works/${work.id}`}
                      className="mt-1 block text-[13px] font-semibold leading-snug text-biz-navy hover:text-biz-blue hover:underline"
                    >
                      {work.workName}
                    </Link>
                  </div>
                  <strong className="shrink-0 text-right text-[12px] tabular-nums text-biz-navy">
                    BDT {formatValue(work.contractValue)}
                  </strong>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-biz-muted">
                  <span>{work.organizationMaster.shortName}</span>
                  <span>
                    Completed {work.completionDate ? formatDate(work.completionDate) : "--"}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <Link
                    href={`/cms/archived-works/${work.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-biz-border bg-white px-2.5 text-[11px] font-semibold text-biz-blue hover:border-biz-blue hover:bg-biz-blue-soft"
                  >
                    <Eye className="h-3.5 w-3.5" /> Details
                  </Link>
                  <button
                    type="button"
                    title="Restore to Ongoing"
                    disabled={restoreWork.isPending}
                    onClick={() => restore(work.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-biz-border bg-white px-2.5 text-[11px] font-semibold text-biz-blue hover:border-biz-blue hover:bg-biz-blue-soft disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restore
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        <div
          ref={tableScrollRef}
          className="hidden min-h-0 overflow-x-auto xl:flex-1 xl:overflow-auto xl:block"
        >
          <table className="w-full min-w-[1080px] table-fixed border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[#edf2f8] text-[11px] font-semibold text-biz-navy shadow-[0_1px_0_0_#dbe4ef]">
              <tr className="border-b border-biz-border">
                <th className="w-12 px-4 py-2.5">SL</th>
                <th className="px-4 py-2.5">Work / Project Name</th>
                <th className="w-40 px-4 py-2.5">Organization</th>
                <th className="w-32 px-4 py-2.5">Work Category</th>
                <th className="w-40 px-4 py-2.5 text-right">Work Value (BDT)</th>
                <th className="w-36 px-4 py-2.5">Completion Date</th>
                <th className="w-44 px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-[12px] text-biz-text">
              {works.isLoading ? (
                <TableSkeleton />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-biz-muted">
                    No archived works found.
                  </td>
                </tr>
              ) : (
                items.map((work, index) => (
                  <tr
                    key={work.id}
                    className="border-b border-biz-border last:border-0 hover:bg-[#f4f8ff]"
                  >
                    <td className="px-4 py-2.5 text-biz-muted">
                      {(meta.page - 1) * meta.limit + index + 1}
                    </td>
                    <td className="px-4 py-2.5 font-medium" title={work.workName}>
                      <Link
                        href={`/cms/archived-works/${work.id}`}
                        className="line-clamp-2 leading-[18px] hover:text-biz-blue hover:underline"
                      >
                        {work.workName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5" title={work.organizationMaster.shortName}>
                      <span className="line-clamp-2 leading-[18px]">
                        {work.organizationMaster.shortName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5" title={work.workCategory}>
                      <span className="block truncate">{work.workCategory}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatValue(work.contractValue)}
                    </td>
                    <td className="px-4 py-2.5">
                      {work.completionDate ? formatDate(work.completionDate) : "--"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          href={`/cms/archived-works/${work.id}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-biz-border bg-white px-2.5 text-[11px] font-semibold text-biz-blue hover:border-biz-blue hover:bg-biz-blue-soft"
                        >
                          <Eye className="h-3.5 w-3.5" /> Details
                        </Link>
                        <button
                          type="button"
                          aria-label={`Restore ${work.workName} to ongoing works`}
                          title="Restore to Ongoing"
                          disabled={restoreWork.isPending}
                          onClick={() => restore(work.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-biz-border bg-white text-biz-blue hover:border-biz-blue hover:bg-biz-blue-soft disabled:opacity-50"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 border-t border-biz-border px-3 py-1 text-[11px] text-biz-muted">
          <span className="tabular-nums">
            {meta.total === 0
              ? "0 archived works"
              : meta.total === 1
                ? "1 archived work"
                : `Showing ${(meta.page - 1) * meta.limit + 1}–${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total} archived works`}
          </span>
          {meta.totalPages > 1 && (
            <nav aria-label="Archived works pages" className="flex items-center gap-1">
              <button
                type="button"
                aria-label="First page"
                disabled={meta.page <= 1}
                onClick={() => setPage(1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-biz-border bg-white disabled:text-slate-300"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Previous page"
                disabled={meta.page <= 1}
                onClick={() => setPage(meta.page - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-biz-border bg-white disabled:text-slate-300"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[80px] text-center font-semibold text-biz-navy">
                Page {meta.page} of {meta.totalPages}
              </span>
              <button
                type="button"
                aria-label="Next page"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage(meta.page + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-biz-border bg-white disabled:text-slate-300"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Last page"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage(meta.totalPages)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-biz-border bg-white disabled:text-slate-300"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
            </nav>
          )}
        </div>
      </section>
    </div>
  );
}
