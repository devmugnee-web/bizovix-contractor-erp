"use client";

import * as React from "react";
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  ClipboardCheck,
  Clock3,
  Download,
  Info,
  MoreVertical,
  RotateCcw,
  Search,
  TrendingUp,
} from "lucide-react";
import { cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import {
  useExportSalesQuotationResults,
  useSalesQuotationOptions,
  useSalesQuotationResults,
  useSalesQuotationResultSummary,
} from "@bizovix/api-client";
import type { SalesQuotationDecision, SalesQuotationResultRow } from "@bizovix/types";
import {
  QuotationDecisionDialog,
  QuotationDetailDialog,
  QuotationFollowUpDialog,
  downloadSalesQuotationExport,
} from "../_components/quotation-dialogs";

const CONTROL =
  "h-[32px] w-full rounded-[4px] border border-[#dbe3ef] bg-white px-2.5 text-[8px] font-medium text-[#10244c] outline-none focus:border-[#1769e8] focus:ring-1 focus:ring-[#1769e8]/10";
const BORDER = "border-[#dfe6f1]";

type ResultSection = "Accepted" | "Rejected" | "Pending";
type DecisionStatus = ResultSection;

interface FilterState {
  search: string;
  dateFrom: string;
  dateTo: string;
  status: "" | ResultSection;
  decision: "" | ResultSection;
  salesPerson: string;
  workName: string;
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  dateFrom: "",
  dateTo: "",
  status: "",
  decision: "",
  salesPerson: "",
  workName: "",
};
function adapt(row: SalesQuotationResultRow) {
  return {
    id: row.id,
    quotationNo: row.quotationNo,
    customer: row.customer.name,
    project: row.workName,
    quotationDate: row.quotationDate,
    quotationDateLabel: row.quotationDate.slice(0, 10),
    value: Number(row.grandTotal),
    decisionDateLabel: row.decisionDate?.slice(0, 10) ?? "—",
    decisionBy: row.decisionBy?.name ?? "—",
    acceptedAmount: Number(row.acceptedAmount ?? 0),
    customerOrderNo: row.customerPoWoNo ?? "—",
    reason: row.rejectionReason ?? "—",
    lastFollowUp: row.lastFollowUpAt?.slice(0, 10) ?? "—",
    nextFollowUp: row.nextFollowUpAt?.slice(0, 10) ?? "—",
    salesPerson: row.salesPerson?.name ?? "Unassigned",
    source: row,
  };
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFilterDate(value: string) {
  if (!value) return "Select date";
  const [year, month, day] = value.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${day} ${months[Number(month) - 1] ?? ""} ${year}`;
}

function KpiCard({
  label,
  value,
  trend,
  helper,
  tone,
  trendTone = "green",
  icon: Icon,
}: {
  label: string;
  value: string;
  trend: string;
  helper: string;
  tone: "blue" | "green" | "red" | "orange" | "purple";
  trendTone?: "green" | "red";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tones = {
    blue: "bg-[#e8f2ff] text-[#1169e8]",
    green: "bg-[#e5f8ee] text-[#2caf67]",
    red: "bg-[#ffeded] text-[#e94750]",
    orange: "bg-[#fff2df] text-[#e99b25]",
    purple: "bg-[#f1e9ff] text-[#8b4cdb]",
  };

  return (
    <section
      className={cn(
        "flex h-[99px] min-w-0 items-center rounded-[7px] border bg-white px-3 shadow-[0_1px_2px_rgba(15,34,70,0.025)]",
        BORDER,
      )}
    >
      <span
        className={cn(
          "flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full",
          tones[tone],
        )}
      >
        <Icon className="h-[19px] w-[19px]" />
      </span>
      <span className="ml-2.5 min-w-0">
        <span className="block truncate text-[7.4px] font-semibold text-[#3b5278]" title={label}>
          {label}
        </span>
        <strong
          className={cn(
            "mt-1.5 block whitespace-nowrap text-[18px] leading-none text-[#071b49]",
            value.length > 9 && "text-[15px]",
          )}
        >
          {value}
        </strong>
        <span
          className={cn(
            "mt-1.5 flex items-center gap-1 text-[7px] font-semibold",
            trendTone === "green" ? "text-[#31a967]" : "text-[#e14d57]",
          )}
        >
          <TrendingUp className="h-2.5 w-2.5" />
          {trend}
        </span>
        <span className="mt-0.5 block whitespace-nowrap text-[6.5px] text-[#6d7d95]">{helper}</span>
      </span>
    </section>
  );
}

function TinyButton({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[21px] items-center justify-center whitespace-nowrap rounded-[3px] border border-[#cfe0f7] bg-white px-1.5 text-[6.6px] font-semibold text-[#1169e8]"
    >
      {label}
    </button>
  );
}
function ExportButton({ onClick, pending }: { onClick: () => void; pending: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-[26px] items-center justify-center gap-1.5 rounded-[4px] border border-[#dbe3ef] bg-white px-3 text-[7.5px] font-semibold text-[#173058] disabled:opacity-50"
    >
      <Download className="h-3 w-3" /> {pending ? "Exporting..." : "Export"}
    </button>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (value: number) => void;
}) {
  const button =
    "inline-flex h-[24px] min-w-[24px] items-center justify-center rounded-[4px] border text-[7px] font-semibold";
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className={cn(button, "border-[#e0e6ef] bg-white text-[#6c7e98] disabled:opacity-40")}
      >
        <ChevronLeft className="h-3 w-3" />
      </button>
      <span className={cn(button, "border-[#0867e8] bg-[#0867e8] px-2 text-white")}>
        {page} / {Math.max(totalPages, 1)}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className={cn(button, "border-[#e0e6ef] bg-white text-[#6c7e98] disabled:opacity-40")}
      >
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

function DecisionOverview({
  total,
  accepted,
  rejected,
  pending,
}: {
  total: number;
  accepted: number;
  rejected: number;
  pending: number;
}) {
  const stats = [
    { label: "Accepted", value: accepted, color: "#2bad63" },
    { label: "Rejected", value: rejected, color: "#e7424e" },
    { label: "Pending", value: pending, color: "#e99b25" },
  ];
  const gradient = stats
    .map((segment, index) => {
      const prior = stats.slice(0, index).reduce((sum, item) => sum + item.value, 0);
      return `${segment.color} ${(prior / Math.max(total, 1)) * 100}% ${((prior + segment.value) / Math.max(total, 1)) * 100}%`;
    })
    .join(", ");

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)] xl:h-[158px]",
        BORDER,
      )}
    >
      <div className="flex h-[36px] items-center justify-between px-3">
        <h2 className="text-[9px] font-bold text-[#10244c]">Decision Overview</h2>
      </div>
      <div className="flex min-h-[120px] items-center gap-4 px-4 pb-3">
        <div
          className="relative h-[104px] w-[104px] shrink-0 rounded-full"
          style={{ background: `conic-gradient(${gradient})` }}
          role="img"
          aria-label={`${total} total quotation decisions`}
        >
          <span className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(219,227,239,0.65)]">
            <strong className="text-[17px] leading-none text-[#071b49]">{total}</strong>
            <span className="mt-1 text-[8px] font-semibold text-[#52627d]">Total</span>
          </span>
        </div>
        <ul className="min-w-0 flex-1 space-y-3">
          {stats.map((item) => (
            <li
              key={item.label}
              className="grid grid-cols-[8px_minmax(0,1fr)_22px_46px] items-center gap-2 text-[7.5px]"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="font-medium text-[#263e65]">{item.label}</span>
              <strong className="text-right text-[#10244c]">{item.value}</strong>
              <span className="text-right text-[#63738d]">
                ({total ? `${((item.value / total) * 100).toFixed(1)}%` : "0%"})
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function QuotationResultsPage() {
  useSetBreadcrumb([
    { label: "Home", href: "/dashboard" },
    { label: "Quotation / Sales" },
    { label: "Quotation Results" },
  ]);

  const [draftFilters, setDraftFilters] = React.useState<FilterState>(DEFAULT_FILTERS);
  const [filters, setFilters] = React.useState<FilterState>(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = React.useState<"All" | ResultSection>("Accepted");
  const [pages, setPages] = React.useState({ Accepted: 1, Rejected: 1, Pending: 1 });
  const [viewId, setViewId] = React.useState<string>();
  const [decisionRow, setDecisionRow] = React.useState<SalesQuotationResultRow>();
  const [followUpRow, setFollowUpRow] = React.useState<SalesQuotationResultRow>();
  const [exportError, setExportError] = React.useState("");
  const options = useSalesQuotationOptions();
  const common = {
    limit: 5,
    search: filters.search || undefined,
    fromDate: filters.dateFrom || undefined,
    toDate: filters.dateTo || undefined,
    salesPersonId: filters.salesPerson || undefined,
    workName: filters.workName || undefined,
  };
  const accepted = useSalesQuotationResults({
    ...common,
    page: pages.Accepted,
    decision: "ACCEPTED",
  });
  const rejected = useSalesQuotationResults({
    ...common,
    page: pages.Rejected,
    decision: "REJECTED",
  });
  const pending = useSalesQuotationResults({ ...common, page: pages.Pending, decision: "PENDING" });
  const summary = useSalesQuotationResultSummary(common);
  const exporter = useExportSalesQuotationResults();
  const acceptedRef = React.useRef<HTMLElement>(null);
  const rejectedRef = React.useRef<HTMLElement>(null);
  const pendingRef = React.useRef<HTMLElement>(null);

  const showSection = (section: ResultSection) =>
    (!filters.status || filters.status === section) &&
    (!filters.decision || filters.decision === section);
  const acceptedRows = showSection("Accepted") ? (accepted.data?.items ?? []).map(adapt) : [];
  const rejectedRows = showSection("Rejected") ? (rejected.data?.items ?? []).map(adapt) : [];
  const pendingRows = showSection("Pending") ? (pending.data?.items ?? []).map(adapt) : [];
  async function exportRows(decision?: SalesQuotationDecision) {
    setExportError("");
    try {
      const data = await exporter.mutateAsync({ ...common, decision });
      downloadSalesQuotationExport(data);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Could not export quotation results.",
      );
    }
  }

  function resetFilters() {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setPages({ Accepted: 1, Rejected: 1, Pending: 1 });
  }

  function selectTab(tab: "All" | ResultSection) {
    setActiveTab(tab);
    const target =
      tab === "Rejected"
        ? rejectedRef.current
        : tab === "Pending"
          ? pendingRef.current
          : acceptedRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="min-h-full bg-[#f8faff] text-[#0b1f4b]">
      <header className="flex min-h-[57px] flex-col justify-between gap-2 pb-2 sm:flex-row sm:items-start">
        <div className="pt-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-[#071b49]">
            Quotation Results
          </h1>
          <p className="mt-1 text-[9.5px] text-[#40577f]">
            Track and manage quotation results, decisions and follow-ups.
          </p>
        </div>
        <label className="relative block h-[44px] w-full rounded-[6px] border border-[#dce4ef] bg-white px-3 pt-[5px] sm:w-[220px]">
          <span className="block text-[7.5px] font-medium text-[#60718e]">Select Project</span>
          <select
            aria-label="Select Project"
            value={draftFilters.workName}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, workName: event.target.value }))
            }
            className="absolute inset-0 h-full w-full appearance-none bg-transparent px-3 pb-1 pt-[16px] text-[10px] font-bold text-[#10244c] outline-none"
          >
            <option value="">All Project / Work Names</option>
            {[...(options.data?.workNames ?? []), ...(options.data?.projectNames ?? [])]
              .filter((value, index, all) => all.indexOf(value) === index)
              .map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#071b49]" />
        </label>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard
          label="Total Quotations"
          value={String(summary.data?.total ?? 0)}
          trend="Live"
          helper="current filters"
          tone="blue"
          icon={ClipboardCheck}
        />
        <KpiCard
          label="Accepted"
          value={String(summary.data?.accepted ?? 0)}
          trend="Live"
          helper="current filters"
          tone="green"
          icon={CheckCircle2}
        />
        <KpiCard
          label="Rejected"
          value={String(summary.data?.rejected ?? 0)}
          trend="Live"
          helper="current filters"
          tone="red"
          trendTone="red"
          icon={CircleX}
        />
        <KpiCard
          label="Pending"
          value={String(summary.data?.pending ?? 0)}
          trend="Live"
          helper="current filters"
          tone="orange"
          icon={Clock3}
        />
        <KpiCard
          label="Accepted Value (BDT)"
          value={formatMoney(Number(summary.data?.acceptedValue ?? 0))}
          trend="Live"
          helper="current filters"
          tone="purple"
          icon={Banknote}
        />
        <KpiCard
          label="Rejected Value (BDT)"
          value={formatMoney(Number(summary.data?.rejectedValue ?? 0))}
          trend="Live"
          helper="current filters"
          tone="red"
          trendTone="red"
          icon={Banknote}
        />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFilters(draftFilters);
          setPages({ Accepted: 1, Rejected: 1, Pending: 1 });
        }}
        className={cn(
          "mt-2.5 flex min-h-[72px] items-center rounded-[7px] border bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,34,70,0.02)]",
          BORDER,
        )}
      >
        <div className="grid w-full grid-cols-1 items-end gap-2 sm:grid-cols-2 xl:grid-cols-[1.45fr_1.75fr_.7fr_.75fr_.92fr_80px_72px]">
          <label className="relative block min-w-0">
            <span className="mb-1.5 block text-[7.5px] font-semibold text-[#33496f]">Search</span>
            <input
              value={draftFilters.search}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, search: event.target.value }))
              }
              placeholder="Search by Quotation No, Customer, Project..."
              className={cn(CONTROL, "pr-8")}
            />
            <Search className="pointer-events-none absolute bottom-[9px] right-2.5 h-3.5 w-3.5 text-[#4a6386]" />
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[7.5px] font-semibold text-[#33496f]">
              Date Range
            </span>
            <span className="grid h-[32px] grid-cols-[1fr_auto_1fr] items-center overflow-hidden rounded-[4px] border border-[#dbe3ef] bg-white">
              <span className="relative flex h-full items-center pl-7 pr-1 text-[7.5px] font-semibold text-[#10244c]">
                <CalendarDays className="absolute left-2 h-3.5 w-3.5 text-[#3f5a80]" />
                <span className="truncate">{formatFilterDate(draftFilters.dateFrom)}</span>
                <input
                  type="date"
                  aria-label="Date from"
                  value={draftFilters.dateFrom}
                  onChange={(event) =>
                    setDraftFilters((current) => ({ ...current, dateFrom: event.target.value }))
                  }
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </span>
              <span className="text-[11px] text-[#52627d]">→</span>
              <span className="relative flex h-full items-center pl-2 pr-7 text-[7.5px] font-semibold text-[#10244c]">
                <span className="truncate">{formatFilterDate(draftFilters.dateTo)}</span>
                <CalendarDays className="absolute right-2 h-3.5 w-3.5 text-[#3f5a80]" />
                <input
                  type="date"
                  aria-label="Date to"
                  min={draftFilters.dateFrom}
                  value={draftFilters.dateTo}
                  onChange={(event) =>
                    setDraftFilters((current) => ({ ...current, dateTo: event.target.value }))
                  }
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </span>
            </span>
          </label>
          <label className="relative block min-w-0">
            <span className="mb-1.5 block text-[7.5px] font-semibold text-[#33496f]">Status</span>
            <select
              value={draftFilters.status}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  status: event.target.value as FilterState["status"],
                }))
              }
              className={cn(CONTROL, "appearance-none pr-7")}
            >
              <option value="">All Status</option>
              <option>Accepted</option>
              <option>Rejected</option>
              <option>Pending</option>
            </select>
            <ChevronDown className="pointer-events-none absolute bottom-[10px] right-2 h-3 w-3 text-[#4b6385]" />
          </label>
          <label className="relative block min-w-0">
            <span className="mb-1.5 block text-[7.5px] font-semibold text-[#33496f]">Decision</span>
            <select
              value={draftFilters.decision}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  decision: event.target.value as FilterState["decision"],
                }))
              }
              className={cn(CONTROL, "appearance-none pr-7")}
            >
              <option value="">All</option>
              <option>Accepted</option>
              <option>Rejected</option>
              <option>Pending</option>
            </select>
            <ChevronDown className="pointer-events-none absolute bottom-[10px] right-2 h-3 w-3 text-[#4b6385]" />
          </label>
          <label className="relative block min-w-0">
            <span className="mb-1.5 block text-[7.5px] font-semibold text-[#33496f]">
              Sales Person
            </span>
            <select
              value={draftFilters.salesPerson}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, salesPerson: event.target.value }))
              }
              className={cn(CONTROL, "appearance-none pr-7")}
            >
              <option value="">All Sales Person</option>
              {options.data?.salesPeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute bottom-[10px] right-2 h-3 w-3 text-[#4b6385]" />
          </label>
          <button
            type="submit"
            className="inline-flex h-[32px] items-center justify-center gap-1.5 rounded-[4px] bg-[#0867e8] px-3 text-[8px] font-semibold text-white"
          >
            <Search className="h-3.5 w-3.5" /> Search
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-[32px] items-center justify-center gap-1.5 rounded-[4px] border border-[#dbe3ef] bg-white px-2.5 text-[8px] font-semibold text-[#173058]"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </form>
      {exportError && (
        <div
          role="alert"
          className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[8px] text-red-700"
        >
          {exportError}
        </div>
      )}

      <div className="mt-2.5 grid grid-cols-1 items-start gap-2.5 xl:grid-cols-[minmax(0,3.15fr)_minmax(290px,1fr)]">
        <div className="min-w-0 space-y-2.5">
          <section
            ref={acceptedRef}
            className={cn(
              "overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]",
              BORDER,
            )}
          >
            <div className="flex h-[37px] items-end justify-between border-b border-[#dfe6f1] px-3">
              <div className="flex h-full items-end gap-6 overflow-x-auto">
                {(["All", "Accepted", "Rejected", "Pending"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => selectTab(tab)}
                    className={cn(
                      "relative h-full shrink-0 whitespace-nowrap px-1 text-[7.5px] font-semibold",
                      activeTab === tab
                        ? "text-[#0867e8] after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#0867e8]"
                        : "text-[#334b70]",
                    )}
                  >
                    {tab} (
                    {tab === "All"
                      ? (summary.data?.total ?? 0)
                      : tab === "Accepted"
                        ? (summary.data?.accepted ?? 0)
                        : tab === "Rejected"
                          ? (summary.data?.rejected ?? 0)
                          : (summary.data?.pending ?? 0)}
                    )
                  </button>
                ))}
              </div>
              <span className="mb-1 shrink-0">
                <ExportButton pending={exporter.isPending} onClick={() => exportRows("ACCEPTED")} />
              </span>
            </div>
            <div className="flex h-[34px] items-center border-b border-[#edf1f6] px-3">
              <h2 className="text-[8.5px] font-bold text-[#10244c]">Accepted Quotations</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] table-fixed border-collapse text-[6.7px] text-[#173058]">
                <colgroup>
                  <col className="w-[28px]" />
                  <col className="w-[83px]" />
                  <col className="w-[110px]" />
                  <col className="w-[120px]" />
                  <col className="w-[82px]" />
                  <col className="w-[82px]" />
                  <col className="w-[86px]" />
                  <col className="w-[75px]" />
                  <col className="w-[100px]" />
                  <col className="w-[92px]" />
                  <col className="w-[115px]" />
                </colgroup>
                <thead className="bg-[#f7f9fc] text-[6.5px] font-semibold text-[#21385e]">
                  <tr className="h-[25px] border-b border-[#e3e9f2]">
                    {[
                      "SL",
                      "Quotation No",
                      "Customer",
                      "Project / Work Name",
                      "Quotation Date",
                      "Value (BDT)",
                      "Decision Date",
                      "Decision By",
                      "Accepted Amount (BDT)",
                      "Customer PO / WO No.",
                      "Action",
                    ].map((label) => (
                      <th
                        key={label}
                        className={cn(
                          "px-1.5 text-left",
                          label.includes("BDT") && "text-right",
                          label === "Action" && "text-center",
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f6]">
                  {acceptedRows.map((row, index) => (
                    <tr key={row.id} className="h-[28px]">
                      <td className="px-1.5">{index + 1}</td>
                      <td className="px-1.5 font-semibold">{row.quotationNo}</td>
                      <td className="truncate px-1.5" title={row.customer}>
                        {row.customer}
                      </td>
                      <td className="truncate px-1.5" title={row.project}>
                        {row.project}
                      </td>
                      <td className="px-1.5">{row.quotationDateLabel}</td>
                      <td className="px-1.5 text-right">{formatMoney(row.value)}</td>
                      <td className="px-1.5">{row.decisionDateLabel}</td>
                      <td className="px-1.5">{row.decisionBy}</td>
                      <td className="px-1.5 text-right">{formatMoney(row.acceptedAmount)}</td>
                      <td className="px-1.5">{row.customerOrderNo}</td>
                      <td className="px-1.5">
                        <span className="flex items-center justify-center gap-1">
                          <TinyButton label="View" onClick={() => setViewId(row.id)} />
                        </span>
                      </td>
                    </tr>
                  ))}
                  {acceptedRows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="h-[70px] text-center text-[8px] text-[#687893]">
                        {accepted.isLoading
                          ? "Loading accepted quotations..."
                          : accepted.isError
                            ? "Could not load accepted quotations."
                            : "No accepted quotations match the filters."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex min-h-[36px] items-center justify-between gap-3 border-t border-[#edf1f6] px-3 text-[6.8px] text-[#52627d]">
              <span>
                Showing {acceptedRows.length > 0 ? (pages.Accepted - 1) * 5 + 1 : 0} to{" "}
                {(pages.Accepted - 1) * 5 + acceptedRows.length} of {accepted.data?.meta.total ?? 0}{" "}
                entries
              </span>
              <Pagination
                page={pages.Accepted}
                totalPages={accepted.data?.meta.totalPages ?? 1}
                onChange={(value) => setPages((current) => ({ ...current, Accepted: value }))}
              />
            </div>
          </section>

          <section
            ref={rejectedRef}
            className={cn(
              "overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]",
              BORDER,
            )}
          >
            <div className="flex h-[34px] items-center justify-between border-b border-[#edf1f6] px-3">
              <h2 className="text-[8.5px] font-bold text-[#10244c]">Rejected Quotations</h2>
              <ExportButton pending={exporter.isPending} onClick={() => exportRows("REJECTED")} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] table-fixed border-collapse text-[6.7px] text-[#173058]">
                <colgroup>
                  <col className="w-[28px]" />
                  <col className="w-[90px]" />
                  <col className="w-[115px]" />
                  <col className="w-[130px]" />
                  <col className="w-[85px]" />
                  <col className="w-[90px]" />
                  <col className="w-[88px]" />
                  <col className="w-[78px]" />
                  <col className="w-[145px]" />
                  <col className="w-[65px]" />
                </colgroup>
                <thead className="bg-[#f7f9fc] text-[6.5px] font-semibold text-[#21385e]">
                  <tr className="h-[25px] border-b border-[#e3e9f2]">
                    {[
                      "SL",
                      "Quotation No",
                      "Customer",
                      "Project / Work Name",
                      "Quotation Date",
                      "Value (BDT)",
                      "Decision Date",
                      "Decision By",
                      "Reason",
                      "Action",
                    ].map((label) => (
                      <th
                        key={label}
                        className={cn(
                          "px-1.5 text-left",
                          label === "Value (BDT)" && "text-right",
                          label === "Action" && "text-center",
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f6]">
                  {rejectedRows.map((row, index) => (
                    <tr key={row.id} className="h-[26px]">
                      <td className="px-1.5">{index + 1}</td>
                      <td className="px-1.5 font-semibold">{row.quotationNo}</td>
                      <td className="truncate px-1.5">{row.customer}</td>
                      <td className="truncate px-1.5">{row.project}</td>
                      <td className="px-1.5">{row.quotationDateLabel}</td>
                      <td className="px-1.5 text-right">{formatMoney(row.value)}</td>
                      <td className="px-1.5">{row.decisionDateLabel}</td>
                      <td className="px-1.5">{row.decisionBy}</td>
                      <td className="truncate px-1.5">{row.reason}</td>
                      <td className="px-1.5">
                        <span className="flex items-center justify-center gap-1.5">
                          <TinyButton label="View" onClick={() => setViewId(row.id)} />
                        </span>
                      </td>
                    </tr>
                  ))}
                  {rejectedRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="h-[60px] text-center text-[8px] text-[#687893]">
                        {rejected.isLoading
                          ? "Loading rejected quotations..."
                          : rejected.isError
                            ? "Could not load rejected quotations."
                            : "No rejected quotations match the filters."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex min-h-[35px] items-center justify-between gap-3 border-t border-[#edf1f6] px-3 text-[6.8px] text-[#52627d]">
              <span>
                Showing {rejectedRows.length > 0 ? (pages.Rejected - 1) * 5 + 1 : 0} to{" "}
                {(pages.Rejected - 1) * 5 + rejectedRows.length} of {rejected.data?.meta.total ?? 0}{" "}
                entries
              </span>
              <Pagination
                page={pages.Rejected}
                totalPages={rejected.data?.meta.totalPages ?? 1}
                onChange={(value) => setPages((current) => ({ ...current, Rejected: value }))}
              />
            </div>
          </section>

          <section
            ref={pendingRef}
            className={cn(
              "overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]",
              BORDER,
            )}
          >
            <div className="flex h-[34px] items-center border-b border-[#f2dfd5] bg-[#fff8f5] px-3">
              <h2 className="text-[8.5px] font-bold text-[#10244c]">
                Pending Quotations (Follow-up Required)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] table-fixed border-collapse text-[6.7px] text-[#173058]">
                <colgroup>
                  <col className="w-[28px]" />
                  <col className="w-[95px]" />
                  <col className="w-[120px]" />
                  <col className="w-[135px]" />
                  <col className="w-[86px]" />
                  <col className="w-[92px]" />
                  <col className="w-[90px]" />
                  <col className="w-[92px]" />
                  <col className="w-[82px]" />
                  <col className="w-[80px]" />
                </colgroup>
                <thead className="bg-[#fffaf7] text-[6.5px] font-semibold text-[#21385e]">
                  <tr className="h-[25px] border-b border-[#f0e2d9]">
                    {[
                      "SL",
                      "Quotation No",
                      "Customer",
                      "Project / Work Name",
                      "Quotation Date",
                      "Value (BDT)",
                      "Last Follow-up",
                      "Next Follow-up",
                      "Sales Person",
                      "Action",
                    ].map((label) => (
                      <th
                        key={label}
                        className={cn(
                          "px-1.5 text-left",
                          label === "Value (BDT)" && "text-right",
                          label === "Action" && "text-center",
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ece8]">
                  {pendingRows.map((row, index) => (
                    <tr key={row.id} className="h-[26px]">
                      <td className="px-1.5">{index + 1}</td>
                      <td className="px-1.5 font-semibold">{row.quotationNo}</td>
                      <td className="truncate px-1.5">{row.customer}</td>
                      <td className="truncate px-1.5">{row.project}</td>
                      <td className="px-1.5">{row.quotationDateLabel}</td>
                      <td className="px-1.5 text-right">{formatMoney(row.value)}</td>
                      <td className="px-1.5">{row.lastFollowUp}</td>
                      <td className="px-1.5 font-semibold text-[#ed8c21]">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-2.5 w-2.5" />
                          {row.nextFollowUp}
                        </span>
                      </td>
                      <td className="px-1.5">{row.salesPerson}</td>
                      <td className="px-1.5">
                        <span className="flex items-center justify-center gap-2">
                          <TinyButton label="View" onClick={() => setViewId(row.id)} />
                          {row.source.status === "SENT" && (
                            <button
                              type="button"
                              onClick={() => setFollowUpRow(row.source)}
                              aria-label="Schedule follow-up"
                              className="text-[#0867e8]"
                            >
                              <CalendarDays className="h-3 w-3" />
                            </button>
                          )}
                          {row.source.status === "SENT" && (
                            <button
                              type="button"
                              onClick={() => setDecisionRow(row.source)}
                              aria-label="Record decision"
                              className="text-[#173058]"
                            >
                              <MoreVertical className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {pendingRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="h-[60px] text-center text-[8px] text-[#687893]">
                        {pending.isLoading
                          ? "Loading pending quotations..."
                          : pending.isError
                            ? "Could not load pending quotations."
                            : "No pending quotations match the filters."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex min-h-[35px] items-center justify-between gap-3 border-t border-[#edf1f6] px-3 text-[6.8px] text-[#52627d]">
              <span>
                Showing {pendingRows.length > 0 ? (pages.Pending - 1) * 5 + 1 : 0} to{" "}
                {(pages.Pending - 1) * 5 + pendingRows.length} of {pending.data?.meta.total ?? 0}{" "}
                entries
              </span>
              <Pagination
                page={pages.Pending}
                totalPages={pending.data?.meta.totalPages ?? 1}
                onChange={(value) => setPages((current) => ({ ...current, Pending: value }))}
              />
            </div>
          </section>
        </div>

        <aside className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
          <DecisionOverview
            total={summary.data?.total ?? 0}
            accepted={summary.data?.accepted ?? 0}
            rejected={summary.data?.rejected ?? 0}
            pending={summary.data?.pending ?? 0}
          />
        </aside>
      </div>

      <div className="mt-2.5 flex min-h-[44px] items-center gap-3 rounded-[5px] border border-[#dce8f8] bg-[#eef5ff] px-4 py-2 text-[8px] text-[#29456e]">
        <Info className="h-4 w-4 shrink-0 text-[#0867e8]" />
        <span>Record decisions and SENT-only follow-ups using the row actions.</span>
      </div>
      <QuotationDetailDialog
        open={!!viewId}
        quotationId={viewId}
        onClose={() => setViewId(undefined)}
      />
      <QuotationDecisionDialog
        open={!!decisionRow}
        quotation={decisionRow}
        onClose={() => setDecisionRow(undefined)}
        onSaved={() => setDecisionRow(undefined)}
      />
      <QuotationFollowUpDialog
        open={!!followUpRow}
        quotation={followUpRow}
        onClose={() => setFollowUpRow(undefined)}
        onSaved={() => setFollowUpRow(undefined)}
      />
    </div>
  );
}
