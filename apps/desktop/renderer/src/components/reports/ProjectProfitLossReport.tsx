"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@bizovix/api-client";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Landmark,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

type ProfitLossRow = {
  workId: string;
  tenderId: string;
  project: string;
  organization: string;
  category: string;
  startDate: string | null;
  contract: string;
  received: string;
  expense: string;
  netContract: string;
  vatDeducted: string;
  taxDeducted: string;
  sdRetained: string;
  sdReleased: string;
  regularReceivable: string;
  sdReceivable: string;
  outstanding: string;
  cashProfit: string;
  profit: string | null;
  margin: string;
  profitStatus: "CALCULATED" | "NOT_CALCULATED";
  progress: string;
  completion: string | null;
};

type ProfitLossReport = {
  title: string;
  subtitle: string;
  rows: ProfitLossRow[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const currencyFormatter = new Intl.NumberFormat("en-BD", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return `BDT ${currencyFormatter.format(Number.isFinite(amount) ? amount : 0)}`;
}

function compactMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return currencyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value: string | null) {
  if (!value) return "Start date not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "blue" | "green" | "orange" | "red" | "slate";
}) {
  const styles = {
    blue: "bg-blue-50 text-blue-600 ring-blue-100",
    green: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    orange: "bg-orange-50 text-orange-600 ring-orange-100",
    red: "bg-red-50 text-red-600 ring-red-100",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
  };

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm print:shadow-none">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${styles[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-sm font-extrabold tabular-nums text-slate-900" title={value}>{value}</p>
      </div>
    </div>
  );
}

function FinancialCell({
  label,
  value,
  tone = "slate",
  secondary,
}: {
  label: string;
  value: string;
  tone?: "slate" | "blue" | "green" | "orange" | "red";
  secondary?: string;
}) {
  const tones = {
    slate: "text-slate-900",
    blue: "text-blue-600",
    green: "text-emerald-600",
    orange: "text-orange-600",
    red: "text-red-600",
  };

  return (
    <div className="min-w-0 border-r border-slate-100 px-3 py-2.5 last:border-r-0">
      <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 whitespace-nowrap text-[11px] font-extrabold tabular-nums ${tones[tone]}`}>{value}</p>
      {secondary && <p className="mt-0.5 text-[9px] font-semibold text-slate-400">{secondary}</p>}
    </div>
  );
}

export function ProjectProfitLossReport() {
  const [search, setSearch] = useState("");
  const [organization, setOrganization] = useState("");
  const [category, setCategory] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const reportQuery = useQuery({
    queryKey: ["reports", "projects", "profit-loss", "organized-list"],
    queryFn: () => apiRequest<ProfitLossReport>("/reports/projects/profit-loss", { params: { page: 1, limit: 100 } }),
  });

  const rows = useMemo(() => reportQuery.data?.rows ?? [], [reportQuery.data?.rows]);
  const organizations = useMemo(() => [...new Set(rows.map((row) => row.organization).filter(Boolean))].sort(), [rows]);
  const categories = useMemo(() => [...new Set(rows.map((row) => row.category).filter(Boolean))].sort(), [rows]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !needle || [row.tenderId, row.project, row.organization, row.category]
        .some((value) => value?.toLowerCase().includes(needle));
      const matchesOrganization = !organization || row.organization === organization;
      const matchesCategory = !category || row.category === category;
      const date = row.startDate ? row.startDate.slice(0, 10) : "";
      const matchesFrom = !fromDate || (!!date && date >= fromDate);
      const matchesTo = !toDate || (!!date && date <= toDate);
      return matchesSearch && matchesOrganization && matchesCategory && matchesFrom && matchesTo;
    });
  }, [rows, search, organization, category, fromDate, toDate]);

  const totals = useMemo(() => filteredRows.reduce((result, row) => ({
    contract: result.contract + Number(row.contract || 0),
    received: result.received + Number(row.received || 0),
    expense: result.expense + Number(row.expense || 0),
    sdReceivable: result.sdReceivable + Number(row.sdReceivable || 0),
    outstanding: result.outstanding + Number(row.outstanding || 0),
    cashProfit: result.cashProfit + Number(row.cashProfit || 0),
    profit: result.profit + (row.profitStatus === "CALCULATED" ? Number(row.profit || 0) : 0),
  }), { contract: 0, received: 0, expense: 0, sdReceivable: 0, outstanding: 0, cashProfit: 0, profit: 0 }), [filteredRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const startItem = filteredRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, filteredRows.length);

  const resetFilters = () => {
    setSearch("");
    setOrganization("");
    setCategory("");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  const exportCsv = () => {
    const headings = ["Tender ID", "Project", "Organization", "Category", "NOA Amount", "Net Contract After VAT & Tax", "Actual Cash Received", "Actual Expense", "VAT Deducted", "Tax Deducted", "SD Retained", "SD Released", "Regular Payment Receivable", "SD Receivable", "Total Outstanding", "Current Cash Profit", "Projected Final Profit", "Projected Margin"];
    const values = filteredRows.map((row) => [
      row.tenderId,
      row.project,
      row.organization,
      row.category,
      row.contract,
      row.netContract,
      row.received,
      row.expense,
      row.vatDeducted,
      row.taxDeducted,
      row.sdRetained,
      row.sdReleased,
      row.regularReceivable,
      row.sdReceivable,
      row.outstanding,
      row.cashProfit,
      row.profit ?? "Not Calculated",
      row.margin,
    ]);
    const csv = [headings, ...values]
      .map((record) => record.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "project-wise-profit-loss.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (reportQuery.isLoading) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-2xl border border-slate-200 bg-white">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          <p className="mt-3 text-xs font-semibold text-slate-500">Loading project profitability...</p>
        </div>
      </div>
    );
  }

  if (reportQuery.isError || !reportQuery.data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white px-6 py-14 text-center shadow-sm">
        <p className="font-bold text-red-600">Unable to load Project-wise Profit/Loss.</p>
        <button type="button" onClick={() => reportQuery.refetch()} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white">Try Again</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8 print:space-y-3 print:bg-white">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-600">Project Reports</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">Project-wise Profit/Loss</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Compare contract value, collections, actual expenses and profitability. Open any project for its complete lifecycle report.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Link href="/reports/projects" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
          <button type="button" onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm print:hidden">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(210px,1.4fr)_minmax(165px,1fr)_125px_135px_135px_42px]">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Search Project or Tender ID</span>
            <span className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search..." className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400" />
            </span>
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Organization</span>
            <select value={organization} onChange={(event) => { setOrganization(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
              <option value="">All Organizations</option>
              {organizations.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Category</span>
            <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
              <option value="">All Categories</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Start From</span>
            <input type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Start To</span>
            <input type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </label>
          <div className="flex items-end">
            <button type="button" onClick={resetFilters} title="Reset filters" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={BriefcaseBusiness} label="Projects" value={String(filteredRows.length)} tone="slate" />
        <KpiCard icon={Landmark} label="NOA Value" value={money(totals.contract)} tone="blue" />
        <KpiCard icon={ReceiptText} label="Cash Received" value={money(totals.received)} tone="green" />
        <KpiCard icon={WalletCards} label="Actual Expense" value={money(totals.expense)} tone="orange" />
        <KpiCard icon={CalendarDays} label="Total Outstanding" value={money(totals.outstanding)} tone="red" />
        <KpiCard icon={TrendingUp} label="Projected Final Profit" value={money(totals.profit)} tone={totals.profit < 0 ? "red" : "green"} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Project Profitability</h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-bold text-blue-600">{filteredRows.length} PROJECTS</span>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">Projects without recorded expenses remain Not Calculated.</p>
          </div>
          <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-500 print:hidden">
            Show
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none">
              {[5, 10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        </div>

        {visibleRows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Search className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-2 text-xs font-semibold text-slate-500">No projects match the selected filters.</p>
            <button type="button" onClick={resetFilters} className="mt-3 text-xs font-bold text-blue-600 hover:underline">Clear filters</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {visibleRows.map((row, index) => {
              const calculated = row.profitStatus !== "NOT_CALCULATED" && row.profit !== null;
              const profit = Number(row.profit || 0);
              return (
                <article key={row.workId} className="grid gap-4 px-4 py-4 transition-colors hover:bg-slate-50/70 xl:grid-cols-[minmax(250px,1.35fr)_minmax(510px,2.4fr)_112px] xl:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-extrabold text-slate-500">{(safePage - 1) * pageSize + index + 1}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-blue-50 px-2 py-1 text-[9px] font-extrabold text-blue-600">TENDER {row.tenderId || "--"}</span>
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">{row.category || "Uncategorized"}</span>
                      </div>
                      <h3 className="mt-2 line-clamp-2 text-xs font-bold leading-5 text-slate-900" title={row.project}>{row.project}</h3>
                      <p className="mt-1 truncate text-[10px] text-slate-500" title={row.organization}>{row.organization}</p>
                      <p className="mt-1 flex items-center gap-1 text-[9px] text-slate-400"><CalendarDays className="h-3 w-3" /> {formatDate(row.startDate)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-5">
                    <FinancialCell label="NOA Amount" value={compactMoney(row.contract)} tone="blue" />
                    <FinancialCell label="Cash Received" value={compactMoney(row.received)} tone="green" />
                    <FinancialCell label="Expense" value={compactMoney(row.expense)} tone="orange" />
                    <FinancialCell label="Outstanding" value={compactMoney(row.outstanding)} tone="red" secondary={`SD ${compactMoney(row.sdReceivable)}`} />
                    {calculated ? (
                      <FinancialCell label="Projected Profit" value={compactMoney(row.profit)} tone={profit < 0 ? "red" : "green"} secondary={`Cash ${compactMoney(row.cashProfit)} | ${row.margin}`} />
                    ) : (
                      <FinancialCell label="Projected Profit" value="Not Calculated" tone="orange" secondary="No expense recorded" />
                    )}
                  </div>

                  <Link href={`/reports/projects/profit-loss/${encodeURIComponent(row.workId)}`} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-[10px] font-bold text-blue-700 hover:border-blue-300 hover:bg-blue-600 hover:text-white print:hidden">
                    Full Report <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </article>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 print:hidden">
          <p className="text-[10px] text-slate-500">Showing <strong className="text-slate-700">{startItem}-{endItem}</strong> of <strong className="text-slate-700">{filteredRows.length}</strong> projects</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-16 text-center text-[10px] font-bold text-slate-600">{safePage} / {totalPages}</span>
            <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </section>
    </div>
  );
}
