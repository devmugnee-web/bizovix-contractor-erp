"use client";
import * as React from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  FileSpreadsheet,
  Printer,
  RotateCcw,
  Search,
} from "lucide-react";
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
  const isProjectProfitLoss = category === "projects" && report === "profit-loss";
  const isTenderSecurity = category === "tenders" && report === "tender-security";
  const isPgBg = category === "tenders" && report === "pg-bg";
  const isSecurityDeposit = category === "tenders" && report === "security-deposit";
  const isCashFlow = category === "cash-bank" && report === "cash-flow";
  const usesLedgerAccounts = category === "financial";
  const isExpiryMonitoring = isTenderSecurity || isPgBg || isSecurityDeposit;
  const isCompactExpiryTable = isPgBg || isSecurityDeposit;
  useSetBreadcrumb([
    { label: "Reports", href: "/reports" },
    { label: parentTitle, href: `/reports/${category}` },
    { label: def?.title ?? report },
  ]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(5);
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
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters(draft);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft]);
  const query = { ...filters, page, limit: pageSize };
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
  const expiryKpiStatus: Record<string, string> = {
    "Total Securities": "",
    "Total Security Amount": "",
    "Total PG/BG": "",
    "Guarantee Amount": "",
    "Active Exposure": "",
    "Security Deposits": "",
    "SD Amount": "",
    Outstanding: "",
    Upcoming: "UPCOMING",
    "Within 15 Days": "DUE_WITHIN_15",
    "Within 7 Days": "DUE_WITHIN_7",
    Expired: "EXPIRED",
    "Needs Attention": "NEEDS_ATTENTION",
  };
  const firstVisiblePage = result
    ? Math.max(1, Math.min(page - 2, Math.max(1, result.meta.totalPages - 4)))
    : 1;
  const visiblePages = result
    ? Array.from(
        { length: Math.min(5, result.meta.totalPages) },
        (_, index) => firstVisiblePage + index,
      )
    : [];
  return (
    <div className="flex flex-col gap-4 print:block">
      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-blue-100 bg-gradient-to-r from-white via-blue-50/50 to-emerald-50/30 px-4 py-3 shadow-[0_8px_24px_rgba(15,48,92,0.06)] sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-page-title text-biz-text">
            {result?.title ?? def?.title ?? "Report"}
          </h1>
          <p className="mt-1 text-[13px] text-biz-muted">{result?.subtitle ?? def?.description}</p>
        </div>
        <div className={cn("flex flex-wrap gap-2 print:hidden", isCashFlow && "sm:flex-nowrap")}>
          <SecondaryButton onClick={() => router.push(`/reports/${category}`)}>
            <ArrowLeft className="h-4 w-4" />
            Back to {parentTitle}
          </SecondaryButton>
          <SecondaryButton onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </SecondaryButton>
          <PrimaryButton onClick={exportCsv} disabled={exporter.isPending}>
            <FileSpreadsheet className="h-4 w-4" />
            Export CSV
          </PrimaryButton>
        </div>
      </div>
      <div className="mb-5 hidden border-b-2 border-slate-800 pb-3 print:block">
        <p className="text-lg font-bold">BIZOVIX Contractor ERP</p>
        <p className="font-semibold">{result?.title ?? def?.title ?? "Report"}</p>
        <p className="text-xs">
          Date range: {filters.dateFrom || "Beginning"} to {filters.dateTo || "Today"}
        </p>
        <p className="text-xs">Generated: {new Date().toLocaleString("en-GB")}</p>
      </div>
      <section className="rounded-xl border border-biz-border bg-white p-3 shadow-[0_8px_24px_rgba(15,48,92,0.06)] print:hidden">
        <div
          className={cn(
            "grid items-end gap-2 sm:grid-cols-2",
            isCashFlow
              ? "xl:grid-cols-[140px_140px_180px_minmax(180px,1fr)_88px]"
              : isTenderSecurity || isPgBg
              ? "xl:grid-cols-[105px_105px_125px_130px_125px_125px_minmax(115px,1fr)_78px]"
              : isSecurityDeposit
                ? "xl:grid-cols-[115px_115px_150px_165px_145px_minmax(140px,1fr)_88px]"
              : "xl:grid-cols-[130px_130px_155px_165px_155px_minmax(130px,1fr)_88px]",
          )}
        >
          <label className="text-[10px] font-semibold">
            {isExpiryMonitoring ? "Expiry From" : "From"}
            <TextInput
              className="mt-1"
              type="date"
              value={draft.dateFrom}
              onChange={(e) => setDraft((v) => ({ ...v, dateFrom: e.target.value }))}
            />
          </label>
          <label className="text-[10px] font-semibold">
            {isExpiryMonitoring ? "Expiry To" : "To"}
            <TextInput
              className="mt-1"
              type="date"
              value={draft.dateTo}
              onChange={(e) => setDraft((v) => ({ ...v, dateTo: e.target.value }))}
            />
          </label>
          {!isCashFlow && <label className="text-[10px] font-semibold">
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
          </label>}
          {!isCashFlow && (
            category !== "expenses" || report !== "general" ? (
              <label className="text-[10px] font-semibold">
                Project
                <SelectInput
                  className="mt-1"
                  placeholder="All Projects"
                  value={draft.workId}
                  onChange={(e) => setDraft((v) => ({ ...v, workId: e.target.value }))}
                  options={(options.data?.works ?? []).map((x) => ({
                    value: x.id,
                    label: x.workName,
                  }))}
                />
              </label>
            ) : (
              <div />
            )
          )}
          {!isSecurityDeposit && <label className="text-[10px] font-semibold">
            {usesLedgerAccounts ? "Ledger Account" : "Account"}
            <SelectInput
              className="mt-1"
              placeholder={usesLedgerAccounts ? "All Ledger Accounts" : "All Accounts"}
              value={draft.accountId}
              onChange={(e) => setDraft((v) => ({ ...v, accountId: e.target.value }))}
              options={((usesLedgerAccounts ? options.data?.ledgerAccounts : options.data?.accounts) ?? []).map((x) => ({
                value: x.id,
                label: x.accountName,
              }))}
            />
          </label>}
          {isExpiryMonitoring && (
            <label className="text-[10px] font-semibold">
              Status
              <SelectInput
                className="mt-1"
                placeholder="All Statuses"
                value={draft.status}
                onChange={(e) => setDraft((v) => ({ ...v, status: e.target.value }))}
                options={isSecurityDeposit ? [
                  { value: "UPCOMING", label: "Upcoming (After 15 Days)" },
                  { value: "DUE_WITHIN_15", label: "Release Within 15 Days" },
                  { value: "DUE_WITHIN_7", label: "Release Within 7 Days" },
                  { value: "DUE_TODAY", label: "Release Due Today" },
                  { value: "EXPIRED", label: "Expired" },
                  { value: "NEEDS_ATTENTION", label: "Needs Attention" },
                  { value: "HELD", label: "Held — Date Not Set" },
                  { value: "PARTIALLY_RELEASED", label: "Partially Released" },
                  { value: "RELEASED", label: "Released" },
                  { value: "NOT_CONFIGURED", label: "Not Configured" },
                ] : [
                  { value: "UPCOMING", label: "Upcoming (After 15 Days)" },
                  { value: "DUE_WITHIN_15", label: "Release Within 15 Days" },
                  { value: "DUE_WITHIN_7", label: "Release Within 7 Days" },
                  { value: "DUE_TODAY", label: "Release Due Today" },
                  { value: "EXPIRED", label: "Expired" },
                  { value: "RELEASE_REQUESTED", label: "Release Requested" },
                  { value: "RELEASED", label: "Released" },
                  { value: "RETURNED", label: "Returned" },
                  { value: "ENCASHED", label: "Encashed" },
                  { value: "CANCELLED", label: "Cancelled" },
                ]}
              />
            </label>
          )}
          <TextInput
            icon={Search}
            placeholder="Search..."
            value={draft.search}
            onChange={(e) => setDraft((v) => ({ ...v, search: e.target.value }))}
          />
          <div className="flex justify-end">
            <SecondaryButton className="w-full px-2" onClick={clear} title="Clear all filters">
              <RotateCcw className="h-4 w-4" />
              Reset
            </SecondaryButton>
          </div>
        </div>
      </section>
      {result && (
        <div
          className={cn(
            "grid gap-3",
            result.kpis.length >= 8
              ? "sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"
              : result.kpis.length === 6
              ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
              : result.kpis.length >= 7
                ? "sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
              : result.kpis.length >= 4
                ? "sm:grid-cols-2 xl:grid-cols-4"
                : "sm:grid-cols-3",
          )}
        >
          {result.kpis.map((k) => {
            const kpiStatus = expiryKpiStatus[k.label];
            const isClickable = isExpiryMonitoring && kpiStatus !== undefined;
            const isActive = isClickable
              && draft.status === kpiStatus
              && (kpiStatus !== "" || ["Total Securities", "Total PG/BG", "Security Deposits"].includes(k.label));
            const kpiTone =
              k.label === "Active Exposure" || k.label === "Outstanding"
                ? "before:bg-emerald-500"
                : k.label === "Within 15 Days" || k.label === "Within 7 Days"
                  ? "before:bg-amber-500"
                : k.label === "Expired" || k.label === "Needs Attention"
                    ? "before:bg-red-500"
                    : "before:bg-biz-blue/70";
            return (
            <div
              key={k.label}
              onClick={() => {
                if (isClickable) setDraft((value) => ({ ...value, status: kpiStatus }));
              }}
              onKeyDown={(event) => {
                if (isClickable && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  setDraft((value) => ({ ...value, status: kpiStatus }));
                }
              }}
              role={isClickable ? "button" : undefined}
              tabIndex={isClickable ? 0 : undefined}
              className={cn(
                "relative min-w-0 overflow-hidden rounded-xl border bg-white p-2.5 text-left shadow-[0_6px_18px_rgba(15,48,92,0.06)] outline-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 focus-visible:ring-2 focus-visible:ring-blue-200",
                kpiTone,
                isClickable && "cursor-pointer transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md",
                isActive ? "border-biz-blue bg-blue-50/60 ring-2 ring-blue-100" : "border-biz-border",
                !isClickable && "cursor-default",
              )}
              aria-pressed={isClickable ? isActive : undefined}
              title={isClickable ? `Show ${k.label}` : undefined}
            >
              <p className="text-[11px] font-semibold text-biz-muted">{k.label}</p>
              <p
                className={cn(
                  "mt-1.5 font-bold",
                  result.kpis.length >= 8
                    ? "whitespace-nowrap text-[12px]"
                    : result.kpis.length >= 7
                      ? "whitespace-nowrap text-[13px] xl:text-[13px]"
                      : "text-[17px]",
                  k.kind === "money" ? "text-biz-blue" : "text-biz-text",
                )}
              >
                {k.kind === "money" ? money(k.value) : k.value}
              </p>
            </div>
          );})}
        </div>
      )}
      <section className="overflow-hidden rounded-xl border border-biz-border bg-white shadow-[0_8px_24px_rgba(15,48,92,0.06)]">
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
          <div className={cn(isCompactExpiryTable ? "overflow-hidden" : "overflow-x-auto")}>
              <table className={cn("w-full text-left", isCompactExpiryTable ? "table-fixed text-[9px]" : "min-w-[980px] text-[11px]")}>
               {isPgBg && (
                 <colgroup>
                   {[3, 17, 9, 4, 6, 9, 7, 8, 7, 7, 7, 7, 9].map((width, index) => (
                     <col key={index} style={{ width: `${width}%` }} />
                   ))}
                 </colgroup>
               )}
               {isSecurityDeposit && (
                 <colgroup>
                   {[3, 6, 16, 9, 6, 8, 8, 8, 7, 6, 7, 7, 9].map((width, index) => (
                     <col key={index} style={{ width: `${width}%` }} />
                   ))}
                 </colgroup>
               )}
               <thead className="border-b border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50/60 text-[10px] font-semibold text-biz-navy">
                <tr>
                  <th className={cn(isCompactExpiryTable ? "px-1.5 py-2" : "px-3 py-3")}>SL</th>
                  {result.columns.map((c) => (
                    <th key={c.key} className={cn(isCompactExpiryTable ? "px-1.5 py-2 leading-tight" : "px-3 py-3")}>
                      {c.label}
                    </th>
                  ))}
                  {isProjectProfitLoss && <th className="px-3 py-3 print:hidden">Full Report</th>}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr
                    key={String(row.workId ?? i)}
                    className={cn(
                       "border-t border-biz-border transition-colors hover:bg-blue-50/35",
                      isProjectProfitLoss && "transition-colors hover:bg-blue-50/40",
                    )}
                  >
                    <td className={cn("align-middle", isCompactExpiryTable ? "px-1.5 py-2" : "px-3 py-3")}>
                      {(result.meta.page - 1) * result.meta.limit + i + 1}
                    </td>
                    {result.columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          isCompactExpiryTable ? "px-1.5 py-2 align-middle leading-tight" : "px-3 py-3",
                          c.type === "money" && "text-right font-semibold tabular-nums",
                        )}
                      >
                        {isProjectProfitLoss &&
                        row.profitStatus === "NOT_CALCULATED" &&
                        (c.key === "profit" || c.key === "margin") ? (
                          <span className="whitespace-nowrap font-medium text-amber-700">
                            Not Calculated
                          </span>
                        ) : isExpiryMonitoring && ["status", "releaseStatus"].includes(c.key) ? (
                          <span
                            className={cn(
                              "inline-flex max-w-full rounded-full px-1.5 py-1 text-[8px] font-bold leading-none",
                              row[c.key] === "EXPIRED"
                                ? "bg-red-50 text-red-700"
                                : ["DATE_NOT_SET", "RELEASE_DATE_NOT_SET", "INVALID_RELEASE_DATE"].includes(String(row[c.key]))
                                  ? "bg-red-50 text-red-700"
                                : ["DUE_TODAY", "DUE_WITHIN_7", "DUE_WITHIN_15"].includes(String(row[c.key]))
                                  ? "bg-amber-50 text-amber-700"
                                  : row[c.key] === "UPCOMING"
                                    ? "bg-blue-50 text-blue-700"
                                    : row[c.key] === "RELEASED" || row[c.key] === "RETURNED"
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-slate-100 text-slate-600",
                            )}
                            title={String(row[c.key] ?? "-").replaceAll("_", " ")}
                          >
                            {String(row[c.key] ?? "-").replaceAll("_", " ")}
                          </span>
                        ) : isCompactExpiryTable && ["work", "project", "organization"].includes(c.key) ? (
                          <span
                            className="line-clamp-2 break-words"
                            title={String(row[c.key] ?? "-")}
                          >
                            {String(row[c.key] ?? "-")}
                          </span>
                        ) : isPgBg && ["reference", "releaseReference", "bankConfirmation"].includes(c.key) ? (
                          <span className="block truncate" title={String(row[c.key] ?? "-")}>
                            {String(row[c.key] ?? "-")}
                          </span>
                        ) : c.type === "money" ? (
                          <span className="whitespace-nowrap">{money(row[c.key])}</span>
                        ) : c.type === "date" ? (
                          date(row[c.key])
                        ) : (
                          String(row[c.key] ?? "-").replaceAll("_", " ")
                        )}
                      </td>
                    ))}
                    {isProjectProfitLoss && (
                      <td className="px-3 py-3 print:hidden">
                        <button
                          type="button"
                          onClick={() => {
                            const resolvedWorkId = String(
                              row.workId ??
                                options.data?.works.find((work) => work.workName === row.project)?.id ??
                                "",
                            );
                            if (resolvedWorkId) {
                              router.push(`/reports/projects/profit-loss/${resolvedWorkId}`);
                            }
                          }}
                          disabled={
                            !row.workId &&
                            !options.data?.works.some((work) => work.workName === row.project)
                          }
                          className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-blue-200 bg-blue-50 px-3 text-[10px] font-semibold text-biz-blue transition-colors hover:border-biz-blue hover:bg-blue-100"
                        >
                          View Full Report
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result && (
          <div className="flex flex-col gap-2 border-t px-4 py-3 text-[11px] text-biz-muted print:hidden sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span>
                Showing {result.meta.total ? (result.meta.page - 1) * result.meta.limit + 1 : 0} to{" "}
                {Math.min(result.meta.page * result.meta.limit, result.meta.total)} of{" "}
                {result.meta.total}
              </span>
              <label className="flex items-center gap-1.5 whitespace-nowrap">
                Show
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="h-8 rounded-md border border-biz-border bg-white px-2 font-semibold text-biz-navy outline-none focus:border-biz-blue"
                  aria-label="Rows per page"
                >
                  {[5, 10, 20, 50].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                rows
              </label>
            </div>
            {result.meta.total > pageSize && (
              <div className="flex gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  className="h-8 w-9 rounded-md border border-biz-border bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  &lt;
                </button>
                {visiblePages.map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={cn(
                      "h-8 min-w-9 rounded-md border border-biz-border bg-white px-2",
                      n === page && "border-biz-blue bg-biz-blue text-white",
                    )}
                  >
                    {n}
                  </button>
                ))}
                <button
                  disabled={page >= result.meta.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="h-8 w-9 rounded-md border border-biz-border bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
                >
                  &gt;
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
