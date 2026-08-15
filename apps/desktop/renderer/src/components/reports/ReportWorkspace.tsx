"use client";
import * as React from "react";
import { ArrowLeft, Download, Filter, Printer, RotateCcw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useExportReport, useReport, useReportOptions } from "@bizovix/api-client";
import type { ReportQuery } from "@bizovix/types";
import { PrimaryButton, SecondaryButton, SelectInput, TextInput, cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { findReport, REPORT_CATEGORIES } from "@/config/reports";
const money = (v: unknown) =>
  `BDT ${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString("en-GB") : "-");
function download(name: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
export function ReportWorkspace({ category, report }: { category: string; report: string }) {
  const router = useRouter(),
    def = findReport(category, report),
    group = REPORT_CATEGORIES.find((c) => c.slug === category),
    parentTitle = group?.shortTitle ?? "Reports";
  useSetBreadcrumb([
    { label: "Reports", href: "/reports" },
    { label: parentTitle, href: `/reports/${category}` },
    { label: def?.title ?? report },
  ]);
  const [page, setPage] = React.useState(1);
  const [draft, setDraft] = React.useState<ReportQuery>({
    dateFrom: "",
    dateTo: "",
    search: "",
    organizationMasterId: "",
    workId: "",
    category: "",
    status: "",
    accountId: "",
  });
  const [filters, setFilters] = React.useState<ReportQuery>(draft);
  const query = { ...filters, page, limit: 10 };
  const data = useReport(category, report, query),
    options = useReportOptions(),
    exporter = useExportReport(category, report);
  const clear = () => {
    const q = {
      dateFrom: "",
      dateTo: "",
      search: "",
      organizationMasterId: "",
      workId: "",
      category: "",
      status: "",
      accountId: "",
    };
    setDraft(q);
    setFilters(q);
    setPage(1);
  };
  async function exportCsv() {
    const r = await exporter.mutateAsync({ ...filters, page: 1, limit: 100 });
    download(r.filename, r.content);
  }
  const result = data.data;
  return (
    <div className="flex flex-col gap-4 print:block">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
        <div>
          <h1 className="text-page-title text-biz-text">
            {result?.title ?? def?.title ?? "Report"}
          </h1>
          <p className="mt-1 text-[13px] text-biz-muted">{result?.subtitle ?? def?.description}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <SecondaryButton onClick={() => router.push(`/reports/${category}`)}>
            <ArrowLeft className="h-4 w-4" />
            Back to {parentTitle}
          </SecondaryButton>
          <SecondaryButton onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </SecondaryButton>
          <PrimaryButton onClick={exportCsv} disabled={exporter.isPending}>
            <Download className="h-4 w-4" />
            Export CSV
          </PrimaryButton>
        </div>
      </div>
      <section className="rounded-lg border border-biz-border bg-white p-4 shadow-card print:hidden">
        <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <label className="text-[10px] font-semibold">
            From
            <TextInput
              className="mt-1"
              type="date"
              value={draft.dateFrom}
              onChange={(e) => setDraft((v) => ({ ...v, dateFrom: e.target.value }))}
            />
          </label>
          <label className="text-[10px] font-semibold">
            To
            <TextInput
              className="mt-1"
              type="date"
              value={draft.dateTo}
              onChange={(e) => setDraft((v) => ({ ...v, dateTo: e.target.value }))}
            />
          </label>
          <label className="text-[10px] font-semibold">
            Organization
            <SelectInput
              className="mt-1"
              placeholder="All Organizations"
              value={draft.organizationMasterId}
              onChange={(e) => setDraft((v) => ({ ...v, organizationMasterId: e.target.value }))}
              options={(options.data?.organizations ?? []).map((x) => ({
                value: x.id,
                label: x.shortName,
              }))}
            />
          </label>
          <label className="text-[10px] font-semibold">
            Project
            <SelectInput
              className="mt-1"
              placeholder="All Projects"
              value={draft.workId}
              onChange={(e) => setDraft((v) => ({ ...v, workId: e.target.value }))}
              options={(options.data?.works ?? []).map((x) => ({ value: x.id, label: x.workName }))}
            />
          </label>
          <label className="text-[10px] font-semibold">
            Account
            <SelectInput
              className="mt-1"
              placeholder="All Accounts"
              value={draft.accountId}
              onChange={(e) => setDraft((v) => ({ ...v, accountId: e.target.value }))}
              options={(options.data?.accounts ?? []).map((x) => ({
                value: x.id,
                label: x.accountName,
              }))}
            />
          </label>
          <TextInput
            icon={Search}
            placeholder="Search..."
            value={draft.search}
            onChange={(e) => setDraft((v) => ({ ...v, search: e.target.value }))}
          />
          <div className="flex gap-1">
            <SecondaryButton className="px-3" onClick={clear} title="Clear filters">
              <RotateCcw className="h-4 w-4" />
            </SecondaryButton>
            <PrimaryButton
              className="flex-1"
              onClick={() => {
                setFilters(draft);
                setPage(1);
              }}
            >
              <Filter className="h-4 w-4" />
              Filter
            </PrimaryButton>
          </div>
        </div>
      </section>
      {result && (
        <div
          className={cn(
            "grid gap-3",
            result.kpis.length >= 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3",
          )}
        >
          {result.kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-lg border border-biz-border bg-white p-4 shadow-card"
            >
              <p className="text-[11px] font-semibold text-biz-muted">{k.label}</p>
              <p
                className={cn(
                  "mt-2 text-[18px] font-bold",
                  k.kind === "money" ? "text-biz-blue" : "text-biz-text",
                )}
              >
                {k.kind === "money" ? money(k.value) : k.value}
              </p>
            </div>
          ))}
        </div>
      )}
      <section className="overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
        {data.isLoading ? (
          <>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="mx-4 my-3 h-8 animate-pulse bg-slate-100" />
            ))}
          </>
        ) : data.isError ? (
          <div className="p-12 text-center text-red-600">
            Unable to load this report.{" "}
            <button onClick={() => data.refetch()} className="font-semibold underline">
              Retry
            </button>
          </div>
        ) : !result?.rows.length ? (
          <div className="p-14 text-center text-biz-muted">
            No report data found for the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[11px]">
              <thead className="bg-[#f4f7fb] text-[10px] font-semibold">
                <tr>
                  <th className="px-3 py-3">SL</th>
                  {result.columns.map((c) => (
                    <th key={c.key} className="px-3 py-3">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="border-t border-biz-border">
                    <td className="px-3 py-3">
                      {(result.meta.page - 1) * result.meta.limit + i + 1}
                    </td>
                    {result.columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "px-3 py-3",
                          c.type === "money" && "text-right font-semibold tabular-nums",
                        )}
                      >
                        {c.type === "money"
                          ? money(row[c.key])
                          : c.type === "date"
                            ? date(row[c.key])
                            : String(row[c.key] ?? "-").replaceAll("_", " ")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-[11px] text-biz-muted print:hidden">
            <span>
              Showing {result.meta.total ? (result.meta.page - 1) * result.meta.limit + 1 : 0} to{" "}
              {Math.min(result.meta.page * result.meta.limit, result.meta.total)} of{" "}
              {result.meta.total}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-8 w-9 rounded border"
              >
                &lt;
              </button>
              {Array.from({ length: Math.min(5, result.meta.totalPages) }, (_, i) => i + 1).map(
                (n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={cn(
                      "h-8 min-w-9 rounded border",
                      n === page && "border-biz-blue bg-biz-blue text-white",
                    )}
                  >
                    {n}
                  </button>
                ),
              )}
              <button
                disabled={page >= result.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 w-9 rounded border"
              >
                &gt;
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
