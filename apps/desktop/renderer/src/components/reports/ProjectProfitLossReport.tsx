"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@bizovix/api-client";
import { formatAmount, formatBDT } from "@bizovix/utils";
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

function money(value: string | number | null | undefined) {
  return formatBDT(value ?? 0);
}

function compactMoney(value: string | number | null | undefined) {
  return formatAmount(value ?? 0);
}

function portfolioRatio(value: number, total: number) {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}% of NOA` : "No NOA value";
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
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
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
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm print:shadow-none">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ring-1 ${styles[tone]}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <p
          className="truncate text-[13px] font-extrabold tabular-nums text-slate-900"
          title={value}
        >
          {value}
        </p>
        {hint && (
          <p className="truncate text-[9px] font-medium text-slate-400" title={hint}>
            {hint}
          </p>
        )}
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
    <div className="min-w-0 border-r border-slate-100 px-2.5 py-2 last:border-r-0">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 lg:hidden">
        {label}
      </p>
      <p
        className={`mt-0.5 whitespace-nowrap text-[12px] font-extrabold tabular-nums lg:mt-0 ${tones[tone]}`}
      >
        {value}
      </p>
      {secondary && (
        <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-400" title={secondary}>
          {secondary}
        </p>
      )}
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
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CALCULATED" | "NEEDS_EXPENSE">("ALL");

  const reportQuery = useQuery({
    queryKey: ["reports", "projects", "profit-loss", "organized-list"],
    queryFn: () =>
      apiRequest<ProfitLossReport>("/reports/projects/profit-loss", {
        params: { page: 1, limit: 100 },
      }),
  });

  const rows = useMemo(() => reportQuery.data?.rows ?? [], [reportQuery.data?.rows]);
  const organizations = useMemo(
    () => [...new Set(rows.map((row) => row.organization).filter(Boolean))].sort(),
    [rows],
  );
  const categories = useMemo(
    () => [...new Set(rows.map((row) => row.category).filter(Boolean))].sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch =
        !needle ||
        [row.tenderId, row.project, row.organization, row.category].some((value) =>
          value?.toLowerCase().includes(needle),
        );
      const matchesOrganization = !organization || row.organization === organization;
      const matchesCategory = !category || row.category === category;
      const date = row.startDate ? row.startDate.slice(0, 10) : "";
      const matchesFrom = !fromDate || (!!date && date >= fromDate);
      const matchesTo = !toDate || (!!date && date <= toDate);
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "CALCULATED" && row.profitStatus === "CALCULATED") ||
        (statusFilter === "NEEDS_EXPENSE" && row.profitStatus === "NOT_CALCULATED");
      return (
        matchesSearch &&
        matchesOrganization &&
        matchesCategory &&
        matchesFrom &&
        matchesTo &&
        matchesStatus
      );
    });
  }, [rows, search, organization, category, fromDate, toDate, statusFilter]);

  const calculatedProjects = rows.filter((row) => row.profitStatus === "CALCULATED").length;
  const needsExpenseProjects = rows.length - calculatedProjects;
  const calculatedInView = filteredRows.filter((row) => row.profitStatus === "CALCULATED").length;

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (result, row) => ({
          contract: result.contract + Number(row.contract || 0),
          received: result.received + Number(row.received || 0),
          expense: result.expense + Number(row.expense || 0),
          sdReceivable: result.sdReceivable + Number(row.sdReceivable || 0),
          outstanding: result.outstanding + Number(row.outstanding || 0),
          cashProfit: result.cashProfit + Number(row.cashProfit || 0),
          profit: result.profit + (row.profitStatus === "CALCULATED" ? Number(row.profit || 0) : 0),
        }),
        {
          contract: 0,
          received: 0,
          expense: 0,
          sdReceivable: 0,
          outstanding: 0,
          cashProfit: 0,
          profit: 0,
        },
      ),
    [filteredRows],
  );

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
    setStatusFilter("ALL");
    setPage(1);
  };

  const exportCsv = () => {
    const headings = [
      "Tender ID",
      "Project",
      "Organization",
      "Category",
      "NOA Amount",
      "Net Contract After VAT & Tax",
      "Actual Cash Received",
      "Actual Expense",
      "VAT Deducted",
      "Tax Deducted",
      "SD Retained",
      "SD Released",
      "Regular Payment Receivable",
      "SD Receivable",
      "Total Outstanding",
      "Current Cash Profit",
      "Projected Final Profit",
      "Projected Margin",
    ];
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
      .map((record) =>
        record.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","),
      )
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
          <p className="mt-3 text-xs font-semibold text-slate-500">
            Loading project profitability...
          </p>
        </div>
      </div>
    );
  }

  if (reportQuery.isError || !reportQuery.data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white px-6 py-14 text-center shadow-sm">
        <p className="font-bold text-red-600">Unable to load Project-wise Profit/Loss.</p>
        <button
          type="button"
          onClick={() => reportQuery.refetch()}
          className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-2 print:block print:space-y-3 print:bg-white lg:h-full lg:min-h-0 lg:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-600">
            Project Reports
          </p>
          <h1 className="mt-0.5 text-[22px] font-extrabold leading-tight tracking-tight text-slate-950">
            Project-wise Profit/Loss
          </h1>
          <p className="mt-0.5 max-w-2xl text-[11px] text-slate-500">
            Compare contract value, collections, actual expenses and profitability.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Link
            href="/reports/projects"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3.5 text-[11px] font-bold text-white shadow-sm hover:bg-blue-700"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </header>

      <section className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 shadow-sm print:hidden">
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-[minmax(210px,1.4fr)_minmax(165px,1fr)_125px_135px_135px_38px]">
          <label className="block min-w-0">
            <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Search Project or Tender ID
            </span>
            <span className="flex h-8 items-center gap-2 rounded-md border border-slate-200 px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search..."
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
              />
            </span>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Organization
            </span>
            <select
              value={organization}
              onChange={(event) => {
                setOrganization(event.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All Organizations</option>
              {organizations.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Category
            </span>
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All Categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Start From
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-md border border-slate-200 px-2.5 text-[10px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Start To
            </span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-md border border-slate-200 px-2.5 text-[10px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={resetFilters}
              title="Reset filters"
              className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={BriefcaseBusiness}
          label="Projects"
          value={String(filteredRows.length)}
          hint={`${calculatedInView} calculated in view`}
          tone="slate"
        />
        <KpiCard
          icon={Landmark}
          label="NOA Value"
          value={money(totals.contract)}
          hint="Filtered portfolio"
          tone="blue"
        />
        <KpiCard
          icon={ReceiptText}
          label="Cash Received"
          value={money(totals.received)}
          hint={portfolioRatio(totals.received, totals.contract)}
          tone="green"
        />
        <KpiCard
          icon={WalletCards}
          label="Actual Expense"
          value={money(totals.expense)}
          hint={portfolioRatio(totals.expense, totals.contract)}
          tone="orange"
        />
        <KpiCard
          icon={CalendarDays}
          label="Total Outstanding"
          value={money(totals.outstanding)}
          hint={portfolioRatio(totals.outstanding, totals.contract)}
          tone="red"
        />
        <KpiCard
          icon={TrendingUp}
          label="Projected Final Profit"
          value={money(totals.profit)}
          hint={`${calculatedInView} of ${filteredRows.length} projects calculated`}
          tone={totals.profit < 0 ? "red" : "green"}
        />
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm print:block print:shadow-none">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3.5 py-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Project Profitability</h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-bold text-blue-600">
                {filteredRows.length} PROJECTS
              </span>
            </div>
            <p className="text-[10px] text-slate-500">
              Projected profit becomes available after the first expense is recorded.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div
              className="flex rounded-md border border-slate-200 bg-slate-100 p-0.5"
              aria-label="Profit calculation status"
            >
              {[
                { value: "ALL" as const, label: "All", count: rows.length },
                { value: "CALCULATED" as const, label: "Calculated", count: calculatedProjects },
                {
                  value: "NEEDS_EXPENSE" as const,
                  label: "Needs Expense",
                  count: needsExpenseProjects,
                },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setStatusFilter(item.value);
                    setPage(1);
                  }}
                  className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[10px] font-semibold transition-colors ${statusFilter === item.value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {item.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${statusFilter === item.value ? "bg-blue-50 text-blue-600" : "bg-slate-200 text-slate-500"}`}
                  >
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
              Rows
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 outline-none"
              >
                {[5, 10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="hidden shrink-0 grid-cols-[minmax(280px,1.4fr)_minmax(510px,2.4fr)_95px] items-center border-b border-slate-200 bg-slate-50 px-3 text-[9px] font-bold uppercase tracking-wide text-slate-500 lg:grid">
          <div className="px-2 py-2">Project / Tender</div>
          <div className="grid grid-cols-5">
            <div className="px-2.5 py-2">NOA Amount</div>
            <div className="px-2.5 py-2">Cash Received</div>
            <div className="px-2.5 py-2">Expense</div>
            <div className="px-2.5 py-2">Outstanding</div>
            <div className="px-2.5 py-2">Projected Profit</div>
          </div>
          <div className="px-2 py-2 text-center">Action</div>
        </div>

        {visibleRows.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <Search className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-2 text-xs font-semibold text-slate-500">
              No projects match the selected filters.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 text-xs font-bold text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="min-h-0 flex-1 divide-y divide-slate-200 overflow-auto">
            {visibleRows.map((row, index) => {
              const calculated = row.profitStatus !== "NOT_CALCULATED" && row.profit !== null;
              const profit = Number(row.profit || 0);
              return (
                <article
                  key={row.workId}
                  className="grid gap-3 px-3 py-2 transition-colors hover:bg-blue-50/30 lg:grid-cols-[minmax(280px,1.4fr)_minmax(510px,2.4fr)_95px] lg:items-center"
                >
                  <div className="flex min-w-0 items-start gap-2.5 px-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[9px] font-extrabold text-slate-500">
                      {(safePage - 1) * pageSize + index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-extrabold text-blue-600">
                          TENDER {row.tenderId || "--"}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                          {row.category || "Uncategorized"}
                        </span>
                      </div>
                      <h3
                        className="mt-1 line-clamp-1 text-[12px] font-bold leading-4 text-slate-900"
                        title={row.project}
                      >
                        {row.project}
                      </h3>
                      <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-slate-400">
                        <span className="truncate" title={row.organization}>
                          {row.organization}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <CalendarDays className="h-3 w-3" /> {formatDate(row.startDate)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-5 lg:rounded-none lg:border-0 lg:bg-transparent">
                    <FinancialCell
                      label="NOA Amount"
                      value={compactMoney(row.contract)}
                      tone="blue"
                    />
                    <FinancialCell
                      label="Cash Received"
                      value={compactMoney(row.received)}
                      tone="green"
                    />
                    <FinancialCell
                      label="Expense"
                      value={compactMoney(row.expense)}
                      tone="orange"
                    />
                    <FinancialCell
                      label="Outstanding"
                      value={compactMoney(row.outstanding)}
                      tone="red"
                      secondary={`SD ${compactMoney(row.sdReceivable)}`}
                    />
                    {calculated ? (
                      <FinancialCell
                        label="Projected Profit"
                        value={compactMoney(row.profit)}
                        tone={profit < 0 ? "red" : "green"}
                        secondary={`Cash ${compactMoney(row.cashProfit)} | ${row.margin}`}
                      />
                    ) : (
                      <FinancialCell
                        label="Projected Profit"
                        value="Needs Expense"
                        tone="orange"
                        secondary="Expense required"
                      />
                    )}
                  </div>

                  <Link
                    href={`/reports/projects/profit-loss/${encodeURIComponent(row.workId)}`}
                    className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[9px] font-bold text-blue-700 hover:border-blue-300 hover:bg-blue-600 hover:text-white print:hidden"
                  >
                    Full Report <ChevronRight className="h-3 w-3" />
                  </Link>
                </article>
              );
            })}
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3.5 py-1.5 print:hidden">
          <p className="text-[10px] text-slate-500">
            Showing{" "}
            <strong className="text-slate-700">
              {startItem}-{endItem}
            </strong>{" "}
            of <strong className="text-slate-700">{filteredRows.length}</strong> projects
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-16 text-center text-[10px] font-bold text-slate-600">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
