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
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useExportReport, useReport, useReportOptions } from "@bizovix/api-client";
import type { ReportQuery } from "@bizovix/types";
import { PrimaryButton, SecondaryButton, SelectInput, TextInput, cn } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { findReport, REPORT_CATEGORIES } from "@/config/reports";
import { ReportNavigation } from "./ReportNavigation";
import { AllTransactionsReport } from "./AllTransactionsReport";
const money = (v: unknown) => formatBDT(Number(v ?? 0));
const date = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString("en-GB") : "-");
function download(name: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
export function ReportWorkspace({ category, report }: { category: string; report: string }) {
  if (category === "transactions" && report === "all") return <ReportNavigation><AllTransactionsReport /></ReportNavigation>;
  return <ReportNavigation><React.Suspense fallback={null}><RoutedReportWorkspace category={category} report={report} /></React.Suspense></ReportNavigation>;
}
function RoutedReportWorkspace({ category, report }: { category: string; report: string }) {
  const params = useSearchParams();
  const initialFilters: ReportQuery = {};
  for (const key of ["accountId", "tenderSecurityItemId", "dateFrom", "dateTo", "search"] as const) {
    const value = params.get(key);
    if (value) initialFilters[key] = value;
  }
  return <StandardReportWorkspace key={`${category}/${report}?${params}`} category={category} report={report} initialFilters={initialFilters} />;
}
function StandardReportWorkspace({ category, report, initialFilters }: { category: string; report: string; initialFilters: ReportQuery }) {
  const router = useRouter(),
    def = findReport(category, report),
    group = REPORT_CATEGORIES.find((c) => c.slug === category),
    parentTitle = group?.shortTitle ?? "Reports";
  const isProjectProfitLoss = category === "projects" && report === "profit-loss";
  const isTenderSecurity = category === "tenders" && report === "tender-security";
  const isPgBg = category === "tenders" && report === "pg-bg";
  const isSecurityDeposit = category === "tenders" && report === "security-deposit";
  const isCashFlow = category === "cash-bank" && report === "cash-flow";
  const isBankCharges = category === "cash-bank" && report === "bank-charges";
  const isBankMargin = category === "cash-bank" && report === "bank-margin-amount";
  const usesBankFilters = isCashFlow || isBankCharges || isBankMargin;
  const isBillMaturity = category === "expiry-due" && report === "bill-maturity";
  const isExpenseCategory = category === "expenses" && report === "category";
  const isBalanceSheet = category === "financial" && report === "balance-sheet";
  const usesLedgerAccounts = category === "financial";
  const isExpiryMonitoring = isTenderSecurity || isPgBg || isSecurityDeposit || isBillMaturity;
  const isCompactExpiryTable = isPgBg || isSecurityDeposit || isBillMaturity;
  const isCompactTable = isCompactExpiryTable || isExpenseCategory || isBalanceSheet;
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
    ...initialFilters,
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
    "Total Outstanding": "",
    "Payable Outstanding": "PAYABLE",
    "Receivable Outstanding": "RECEIVABLE",
    Overdue: "OVERDUE",
    "Due in 1-7 Days": "DUE_WITHIN_7",
    "Due in 8-15 Days": "DUE_WITHIN_15",
    "Date Not Set": "DATE_NOT_SET",
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
      <div
        className={cn(
          "flex flex-col items-start justify-between gap-3 rounded-xl border border-blue-100 bg-gradient-to-r from-white via-blue-50/50 to-emerald-50/30 px-4 py-3 shadow-[0_8px_24px_rgba(15,48,92,0.06)] sm:gap-4",
          isBalanceSheet ? "xl:flex-row xl:items-center" : "sm:flex-row sm:items-center",
        )}
      >
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
          {isBalanceSheet
            ? `As of: ${filters.dateTo || "Today"}`
            : `Date range: ${filters.dateFrom || "Beginning"} to ${filters.dateTo || "Today"}`}
        </p>
        <p className="text-xs">Generated: {new Date().toLocaleString("en-GB")}</p>
      </div>
      <section className="rounded-xl border border-biz-border bg-white p-3 shadow-[0_8px_24px_rgba(15,48,92,0.06)] print:hidden">
        <div
          className={cn(
            "grid items-end gap-2 sm:grid-cols-2",
            isBalanceSheet
              ? "xl:grid-cols-[180px_220px_minmax(220px,1fr)_88px]"
              : usesBankFilters
              ? "xl:grid-cols-[140px_140px_180px_minmax(180px,1fr)_88px]"
              : isBillMaturity
                ? "xl:grid-cols-[120px_120px_155px_175px_155px_minmax(150px,1fr)_88px]"
              : isTenderSecurity || isPgBg
              ? "xl:grid-cols-[105px_105px_125px_130px_125px_125px_minmax(115px,1fr)_78px]"
              : isSecurityDeposit
                ? "xl:grid-cols-[115px_115px_150px_165px_145px_minmax(140px,1fr)_88px]"
              : "xl:grid-cols-[130px_130px_155px_165px_155px_minmax(130px,1fr)_88px]",
          )}
        >
          {!isBalanceSheet && <label className="text-[10px] font-semibold">
            {isBillMaturity ? "Due From" : isExpiryMonitoring ? "Expiry From" : "From"}
            <TextInput
              className="mt-1"
              type="date"
              value={draft.dateFrom}
              onChange={(e) => setDraft((v) => ({ ...v, dateFrom: e.target.value }))}
            />
          </label>}
          <label className="text-[10px] font-semibold">
            {isBalanceSheet
              ? "As of Date"
              : isBillMaturity
                ? "Due To"
                : isExpiryMonitoring
                  ? "Expiry To"
                  : "To"}
            <TextInput
              className="mt-1"
              type="date"
              value={draft.dateTo}
              onChange={(e) => setDraft((v) => ({ ...v, dateTo: e.target.value }))}
            />
          </label>
          {!usesBankFilters && !isBalanceSheet && <label className="text-[10px] font-semibold">
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
          {!usesBankFilters && !isBalanceSheet && (
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
          {!isSecurityDeposit && !isBillMaturity && <label className="text-[10px] font-semibold">
            {usesLedgerAccounts ? "Ledger Account" : isBankCharges ? "Bank / Cash Account" : "Account"}
            <SelectInput
              className="mt-1"
              placeholder={usesLedgerAccounts ? "All Ledger Accounts" : "All Accounts"}
              value={draft.accountId}
              onChange={(e) => setDraft((v) => ({ ...v, accountId: e.target.value, tenderSecurityItemId: undefined }))}
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
                options={isBillMaturity ? [
                  { value: "PAYABLE", label: "Payable Bills" },
                  { value: "RECEIVABLE", label: "Receivable Bills" },
                  { value: "OVERDUE", label: "Overdue" },
                  { value: "DUE_TODAY", label: "Due Today" },
                  { value: "DUE_WITHIN_7", label: "Due in 1-7 Days" },
                  { value: "DUE_WITHIN_15", label: "Due in 8-15 Days" },
                  { value: "UPCOMING", label: "Upcoming (After 15 Days)" },
                  { value: "DATE_NOT_SET", label: "Date Not Set" },
                ] : isSecurityDeposit ? [
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
            isBalanceSheet
              ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
              : result.kpis.length >= 8
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
              && (kpiStatus !== "" || ["Total Securities", "Total PG/BG", "Security Deposits", "Total Outstanding"].includes(k.label));
            const isBalanceDifference = isBalanceSheet && k.label === "Difference";
            const isBalanced = isBalanceDifference && Number(k.value) === 0;
            const kpiTone =
              isBalanceDifference
                ? isBalanced
                  ? "before:bg-emerald-500"
                  : "before:bg-red-500"
              : k.label === "Active Exposure" || k.label === "Outstanding"
                ? "before:bg-emerald-500"
                : k.label === "Within 15 Days" || k.label === "Within 7 Days" || k.label === "Due in 1-7 Days" || k.label === "Due in 8-15 Days"
                  ? "before:bg-amber-500"
                : k.label === "Expired" || k.label === "Overdue" || k.label === "Needs Attention" || k.label === "Date Not Set"
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
                  isBalanceDifference
                    ? isBalanced
                      ? "text-emerald-600"
                      : "text-red-600"
                    : k.kind === "money"
                      ? "text-biz-blue"
                      : "text-biz-text",
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
          <div className={cn(isCompactTable ? "overflow-hidden" : "overflow-x-auto")}>
              <table className={cn("w-full text-left", isCompactTable ? "table-fixed" : "min-w-[980px]", isCompactExpiryTable ? "text-[9px]" : "text-[11px]")}>
               {isExpenseCategory && (
                 <colgroup>
                   {[7, 43, 20, 15, 15].map((width, index) => (
                     <col key={index} style={{ width: `${width}%` }} />
                   ))}
                 </colgroup>
               )}
               {isBalanceSheet && (
                 <colgroup>
                   {[5, 14, 14, 39, 20, 8].map((width, index) => (
                     <col key={index} style={{ width: `${width}%` }} />
                   ))}
                 </colgroup>
               )}
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
               {isBillMaturity && (
                 <colgroup>
                   {[3, 6, 8, 10, 15, 12, 7, 7, 9, 12, 11].map((width, index) => (
                     <col key={index} style={{ width: `${width}%` }} />
                   ))}
                 </colgroup>
               )}
               <thead className="border-b border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50/60 text-[10px] font-semibold text-biz-navy">
                <tr>
                  <th className={cn(isCompactTable ? "px-2 py-2.5" : "px-3 py-3")}>SL</th>
                  {result.columns.map((c) => (
                    <th key={c.key} className={cn(isCompactTable ? "px-2 py-2.5 leading-tight" : "px-3 py-3")}>
                      {c.label}
                    </th>
                  ))}
                  {isProjectProfitLoss && <th className="px-3 py-3 print:hidden">Full Report</th>}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr
                    key={String(row.workId ?? row.accountId ?? i)}
                    className={cn(
                       "border-t border-biz-border transition-colors hover:bg-blue-50/35",
                      isProjectProfitLoss && "transition-colors hover:bg-blue-50/40",
                    )}
                  >
                    <td className={cn("align-middle", isCompactTable ? "px-2 py-2.5" : "px-3 py-3")}>
                      {(result.meta.page - 1) * result.meta.limit + i + 1}
                    </td>
                    {result.columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          isCompactTable ? "px-2 py-2.5 align-middle leading-tight" : "px-3 py-3",
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
                              row[c.key] === "EXPIRED" || row[c.key] === "OVERDUE"
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
                        ) : isBillMaturity && c.key === "type" ? (
                          <span
                            className={cn(
                              "inline-flex rounded-full px-1.5 py-1 text-[8px] font-bold leading-none",
                              row[c.key] === "RECEIVABLE"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-blue-50 text-blue-700",
                            )}
                          >
                            {String(row[c.key] ?? "-")}
                          </span>
                        ) : isCompactExpiryTable && ["work", "project", "organization", "party", "bill"].includes(c.key) ? (
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
                        ) : isBalanceSheet && c.key === "section" ? (
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-1 text-[9px] font-bold",
                              row[c.key] === "ASSET"
                                ? "bg-blue-50 text-blue-700"
                                : row[c.key] === "LIABILITY"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-violet-50 text-violet-700",
                            )}
                          >
                            {String(row[c.key] ?? "-")}
                          </span>
                        ) : isBalanceSheet && c.key === "balanceSide" ? (
                          <span className="font-bold text-biz-muted">
                            {String(row[c.key] ?? "-")}
                          </span>
                        ) : isExpenseCategory && c.key === "category" ? (
                          <span className="block truncate font-medium text-biz-navy" title={String(row[c.key] ?? "-")}>
                            {String(row[c.key] ?? "-")}
                          </span>
                        ) : isTenderSecurity && c.key === "margin" ? (
                          <Link className="whitespace-nowrap text-biz-blue underline underline-offset-2" href={`/reports/cash-bank/bank-margin-amount?${new URLSearchParams({ tenderSecurityItemId: String(row.tenderSecurityItemId) })}`} title="View bank margin deductions for this tender">
                            {money(row[c.key])}
                          </Link>
                        ) : isBankMargin && !filters.accountId && !filters.tenderSecurityItemId && ["margin", "released", "netMargin"].includes(c.key) && row.accountId ? (
                          <Link className="whitespace-nowrap text-biz-blue underline underline-offset-2" href={`/reports/cash-bank/bank-margin-amount?${new URLSearchParams({ accountId: String(row.accountId), dateFrom: filters.dateFrom ?? "", dateTo: filters.dateTo ?? "", search: filters.search ?? "" })}`} title="View this bank's margin transactions">
                            {money(row[c.key])}
                          </Link>
                        ) : category === "financial" && [row.name, row.account].includes("Margin Amount") && ["name", "account", "balance", "closingBalance"].includes(c.key) ? (
                          <Link className="text-biz-blue underline underline-offset-2" href={`/reports/cash-bank/bank-margin-amount?${new URLSearchParams({ dateTo: filters.dateTo ?? "" })}`}>
                            {c.type === "money" ? money(row[c.key]) : String(row[c.key])}
                          </Link>
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
