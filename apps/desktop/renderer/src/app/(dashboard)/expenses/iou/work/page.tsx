"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardList, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { useMe, useWorkIous } from "@bizovix/api-client";
import type { WorkIouStatus } from "@bizovix/types";
import { PageHeader, buttonVariants, cn } from "@bizovix/ui";
import { formatAmount } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const statusStyle: Record<WorkIouStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-red-50 text-red-700",
};

const settlementStyle = {
  PENDING: "bg-amber-50 text-amber-700",
  PARTIALLY_SETTLED: "bg-violet-50 text-violet-700",
  SETTLED: "bg-emerald-50 text-emerald-700",
} as const;

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function money(value: string) {
  return formatAmount(value);
}

export default function WorkIouPage() {
  useSetBreadcrumb([
    { label: "Expenses", href: "/expenses" },
    { label: "IOU", href: "/expenses/iou" },
    { label: "Work IOU" },
  ]);

  const me = useMe();
  const [page, setPage] = React.useState(1);
  const [searchDraft, setSearchDraft] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<WorkIouStatus | "">("");
  const query = useWorkIous({ page, limit: 10, search, status: status || undefined });
  const records = query.data?.items ?? [];
  const meta = query.data?.meta;
  const canCreate = me.data?.permissions.includes("work_iou.create") ?? false;
  const canUpdate = me.data?.permissions.includes("work_iou.update") ?? false;

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  function clearFilters() {
    setSearchDraft("");
    setSearch("");
    setStatus("");
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Work IOU"
        subtitle="Track work-related IOU drafts, submissions and settlement status."
        actions={canCreate ? (
          <Link href="/expenses/iou/work/create" className={buttonVariants({ variant: "primary", size: "md" })}>
            <Plus className="h-4 w-4" /> New Work IOU
          </Link>
        ) : null}
      />

      <form onSubmit={applySearch} className="grid gap-3 rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card sm:grid-cols-[minmax(0,1fr)_180px_auto_auto]">
        <label className="relative">
          <span className="sr-only">Search Work IOUs</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" />
          <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search IOU no., purpose, payee or work..." className="h-10 w-full rounded-md border border-biz-border bg-white pl-9 pr-3 text-[12px] outline-none focus:border-biz-blue" />
        </label>
        <select value={status} onChange={(event) => { setStatus(event.target.value as WorkIouStatus | ""); setPage(1); }} className="h-10 rounded-md border border-biz-border bg-white px-3 text-[12px] outline-none focus:border-biz-blue">
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <button type="submit" className={buttonVariants({ variant: "primary", size: "md" })}>Search</button>
        <button type="button" onClick={clearFilters} className={buttonVariants({ variant: "outline", size: "md" })}><RotateCcw className="h-4 w-4" /> Reset</button>
      </form>

      <section className="overflow-hidden rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
          <div>
            <h2 className="text-[13px] font-bold text-biz-text">Work IOU List</h2>
            <p className="mt-0.5 text-[10px] text-biz-muted">{meta ? `${meta.total} record${meta.total === 1 ? "" : "s"} found` : "Loading records..."}</p>
          </div>
          <ClipboardList className="h-5 w-5 text-biz-blue" />
        </div>

        {query.isError ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-[12px] font-semibold text-red-700">Could not load Work IOUs.</p>
            <button type="button" onClick={() => query.refetch()} className={buttonVariants({ variant: "outline", size: "sm" })}>Retry</button>
          </div>
        ) : query.isLoading ? (
          <div className="flex min-h-[260px] items-center justify-center text-[12px] text-biz-muted">Loading Work IOUs...</div>
        ) : records.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center p-6">
            <div className="max-w-md text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-biz-blue-soft text-biz-blue"><ClipboardList className="h-5 w-5" /></span>
              <h2 className="mt-4 text-[14px] font-bold text-biz-text">No Work IOUs found</h2>
              <p className="mt-2 text-[12px] leading-5 text-biz-muted">Create a Work IOU or change the current search filters.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-[11px]">
                <thead className="bg-biz-soft text-[10px] font-semibold text-biz-text">
                  <tr>
                    <th className="px-4 py-3">SL</th><th className="px-3 py-3">IOU No.</th><th className="px-3 py-3">IOU Date</th><th className="px-3 py-3">Tender / Project</th><th className="px-3 py-3">Paid By</th><th className="px-3 py-3">Paid To</th><th className="px-3 py-3 text-right">Total (BDT)</th><th className="px-3 py-3">IOU Status</th><th className="px-3 py-3">Settlement</th><th className="px-3 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record, index) => (
                    <tr key={record.id} className="border-t border-biz-border hover:bg-biz-soft/60">
                      <td className="px-4 py-3 text-biz-muted">{(page - 1) * 10 + index + 1}</td>
                      <td className="px-3 py-3 font-semibold text-biz-blue">{record.iouNo}</td>
                      <td className="px-3 py-3">{dateLabel(record.iouDate)}</td>
                      <td className="px-3 py-3"><span className="block font-medium">{record.tender?.workName ?? record.work?.workName ?? "—"}</span><span className="mt-0.5 block text-[9px] text-biz-muted">{record.expenseFor === "TENDER" ? "Tender" : "Project"}</span></td>
                      <td className="px-3 py-3">{record.paidBy.name}</td>
                      <td className="max-w-[170px] truncate px-3 py-3">{record.paidToName}</td>
                      <td className="px-3 py-3 text-right font-semibold">{money(record.totalAmount)}</td>
                      <td className="px-3 py-3"><span className={cn("rounded px-2 py-1 text-[9px] font-semibold", statusStyle[record.status])}>{record.status.replaceAll("_", " ")}</span></td>
                      <td className="px-3 py-3"><span className={cn("rounded px-2 py-1 text-[9px] font-semibold", settlementStyle[record.settlementStatus])}>{record.settlementStatus.replaceAll("_", " ")}</span></td>
                      <td className="px-3 py-3 text-center">
                        {record.status === "DRAFT" && canUpdate ? (
                          <Link href={`/expenses/iou/work/create?id=${encodeURIComponent(record.id)}`} className="inline-flex h-8 items-center gap-1 rounded border border-biz-border px-2.5 text-[9px] font-semibold text-biz-blue hover:bg-biz-blue-soft">
                            <Pencil className="h-3.5 w-3.5" /> Continue
                          </Link>
                        ) : <span className="text-biz-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-biz-border px-4 py-3 text-[10px] text-biz-muted">
              <span>Page {meta?.page ?? page} of {Math.max(meta?.totalPages ?? 1, 1)}</span>
              <div className="flex gap-2">
                <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="flex h-8 w-8 items-center justify-center rounded border border-biz-border disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" aria-label="Next page" disabled={page >= (meta?.totalPages ?? 1)} onClick={() => setPage((current) => current + 1)} className="flex h-8 w-8 items-center justify-center rounded border border-biz-border disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
