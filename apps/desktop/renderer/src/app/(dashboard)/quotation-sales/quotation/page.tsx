"use client";
import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Coins,
  Download,
  Eye,
  FileText,
  Info,
  List,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
} from "lucide-react";
import {
  useExportSalesQuotations,
  useSalesQuotationCostingSummary,
  useSalesQuotationOptions,
  useSalesQuotationRecent,
  useSalesQuotationRecentDecisions,
  useSalesQuotations,
  useSalesQuotationSummary,
  useSendSalesQuotation,
} from "@bizovix/api-client";
import type {
  SalesQuotationCostingSummary,
  SalesQuotationListRecord,
  SalesQuotationQuery,
  SalesQuotationRecentRecord,
  SalesQuotationResultRow,
  SalesQuotationStatus,
} from "@bizovix/types";
import { cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { QuotationDetailDialog, QuotationFormDialog } from "../_components/quotation-dialogs";

const CONTROL =
  "h-[34px] w-full rounded-[5px] border border-[#dbe3ef] bg-white px-3 text-[9px] font-medium text-[#10244c] outline-none focus:border-[#1769e8] focus:ring-2 focus:ring-[#1769e8]/10";
const STATUS: Record<SalesQuotationStatus, string> = {
  DRAFT: "bg-[#eef1f6] text-[#53627b]",
  SENT: "bg-[#e7f1ff] text-[#1169e8]",
  ACCEPTED: "bg-[#e7f7ec] text-[#249950]",
  REJECTED: "bg-[#ffedef] text-[#dc394a]",
};
type Filters = {
  search: string;
  fromDate: string;
  toDate: string;
  status: "" | SalesQuotationStatus;
  salesPersonId: string;
  workName: string;
};
export type QuotationWorkspaceVariant = "dashboard" | "quotation";
const EMPTY: Filters = {
  search: "",
  fromDate: "",
  toDate: "",
  status: "",
  salesPersonId: "",
  workName: "",
};
const PAGE_SIZE = 10;
const label = (s: SalesQuotationStatus) => s[0] + s.slice(1).toLowerCase();
const money = (v: string | number | undefined | null) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (v: string) =>
  v
    ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(
        new Date(`${v.slice(0, 10)}T00:00:00`),
      )
    : "Select date";
const pct = (v: number | undefined, t: number | undefined) =>
  t ? `${(((v ?? 0) / t) * 100).toFixed(2)}%` : "0.00%";
function Badge({ status }: { status: SalesQuotationStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-[4px] px-2 py-1 text-[8px] font-semibold leading-none",
        STATUS[status],
      )}
    >
      {label(status)}
    </span>
  );
}
function Header({
  title,
  action,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-[44px] items-center justify-between border-b border-[#dfe6f1] px-3.5",
        className,
      )}
    >
      <h2 className="text-[11px] font-bold">{title}</h2>
      {action}
    </div>
  );
}
function Kpi({
  name,
  value,
  help,
  icon: Icon,
  tone,
}: {
  name: string;
  value: string;
  help: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className="flex h-[82px] min-w-0 items-center rounded-[7px] border border-[#dfe6f1] bg-white px-3.5 [@media(min-width:1280px)_and_(max-height:800px)]:h-[72px]">
      <span
        className={cn(
          "flex h-[43px] w-[43px] shrink-0 items-center justify-center rounded-full",
          tone,
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="ml-3 min-w-0">
        <span className="block truncate text-[9px] font-semibold text-[#38547f]">{name}</span>
        <strong
          className={cn(
            "mt-1.5 block truncate text-[18px] leading-none",
            value.length > 12 && "text-[14px]",
          )}
        >
          {value}
        </strong>
        <span className="mt-1.5 block text-[8px] text-[#62728d]">{help}</span>
      </span>
    </div>
  );
}
function Overview({
  data,
  loading,
  error,
  variant,
}: {
  data?: { total: number; draft: number; sent: number; accepted: number; rejected: number };
  loading: boolean;
  error: boolean;
  variant: QuotationWorkspaceVariant;
}) {
  const total = data?.total ?? 0;
  const parts = [
    { name: "Draft", v: data?.draft ?? 0, c: "#8490a6" },
    { name: "Sent", v: data?.sent ?? 0, c: "#1169e8" },
    { name: "Accepted", v: data?.accepted ?? 0, c: "#2daf65" },
    { name: "Rejected", v: data?.rejected ?? 0, c: "#e43f4f" },
  ];
  let used = 0;
  const gradient = total
    ? parts
        .map((x) => {
          const a = (used / total) * 100;
          used += x.v;
          return `${x.c} ${a}% ${(used / total) * 100}%`;
        })
        .join(",")
    : "#edf1f6 0 100%";
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white",
        variant === "dashboard"
          ? "xl:h-[175px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[135px]"
          : "xl:h-[205px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[170px]",
      )}
    >
      <Header
        title={variant === "dashboard" ? "Quotation Overview" : "Quotations Overview"}
        action={
          variant === "quotation" ? (
            <Link href="/quotation-sales/quotation" className="text-[8px] font-semibold text-[#1169e8]">
              View All
            </Link>
          ) : undefined
        }
        className="[@media(min-width:1280px)_and_(max-height:800px)]:h-[34px]"
      />
      {error ? (
        <p className="p-8 text-center text-[9px] text-red-600">Could not load overview.</p>
      ) : (
        <div className="flex min-h-[130px] items-center gap-4 px-4 [@media(min-width:1280px)_and_(max-height:800px)]:min-h-[101px]">
          <div
            className="relative h-[104px] w-[104px] shrink-0 rounded-full [@media(min-width:1280px)_and_(max-height:800px)]:h-[90px] [@media(min-width:1280px)_and_(max-height:800px)]:w-[90px]"
            style={{ background: `conic-gradient(${gradient})` }}
          >
            <span className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-white">
              <strong className="text-[20px]">{loading ? "—" : total}</strong>
              <span className="text-[9px]">Total</span>
            </span>
          </div>
          <ul className="min-w-0 flex-1 space-y-3">
            {parts.map((x) => (
              <li key={x.name} className="grid grid-cols-[8px_1fr_28px_54px] gap-2 text-[8.5px]">
                <i className="mt-0.5 h-2 w-2 rounded-full" style={{ background: x.c }} />
                <span>{x.name}</span>
                <strong className="text-right">{loading ? "—" : x.v}</strong>
                <span className="text-right">({pct(x.v, total)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
function Recent({
  rows,
  loading,
  error,
  view,
  variant,
}: {
  rows: SalesQuotationRecentRecord[];
  loading: boolean;
  error: boolean;
  view: (id: string) => void;
  variant: QuotationWorkspaceVariant;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white",
        variant === "dashboard"
          ? "xl:h-[218px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[203px]"
          : "xl:h-[268px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[235px]",
      )}
    >
      <Header
        title={variant === "dashboard" ? "Recent Activity" : "Recent Quotations"}
        action={
          <Link
            href={variant === "dashboard" ? "/quotation-sales/accepted-rejected" : "/quotation-sales/quotation"}
            className="text-[8px] font-semibold text-[#1169e8]"
          >
            View All
          </Link>
        }
        className="[@media(min-width:1280px)_and_(max-height:800px)]:h-[34px]"
      />
      <div className="divide-y px-3">
        {loading ? (
          <p className="p-8 text-center text-[9px]">Loading...</p>
        ) : error ? (
          <p className="p-8 text-center text-[9px] text-red-600">
            Could not load recent quotations.
          </p>
        ) : !rows.length ? (
          <p className="p-8 text-center text-[9px]">No recent quotations.</p>
        ) : (
          rows.slice(0, variant === "dashboard" ? 4 : 5).map((r, index) => (
            <button
              key={r.id}
              onClick={() => view(r.id)}
              className="grid min-h-[43px] w-full grid-cols-[25px_1fr_auto_72px] items-center gap-2 text-left [@media(min-width:1280px)_and_(max-height:800px)]:min-h-[39px]"
            >
              <FileText className="h-4 w-4 text-[#1169e8]" />
              <span className="min-w-0">
                <strong className="block truncate text-[8.5px]">{r.quotationNo}</strong>
                <span className="block truncate text-[7.5px]">
                  {r.customer.name}{variant === "dashboard" ? ` • ${r.workName}` : ""}
                </span>
              </span>
              {variant === "quotation" && index < 2 ? (
                <span className="rounded bg-[#f1f5fb] px-2 py-1 text-[7.5px] font-semibold text-[#38547f]">
                  {money(r.grandTotal)} BDT
                </span>
              ) : (
                <Badge status={r.status} />
              )}
              <span className="text-right text-[7.5px]">{date(r.activityAt)}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function QuickActions({ onNew }: { onNew: () => void }) {
  const tile =
    "flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-[5px] border border-[#dfe6f1] bg-white px-2 text-center text-[8px] font-semibold text-[#173563] transition hover:border-[#9fc2f5] hover:bg-[#f7faff]";
  const icon = "h-5 w-5 text-[#1169e8]";
  return (
    <section className="overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white">
      <Header title="Quick Actions" />
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 xl:grid-cols-4">
        <button type="button" onClick={onNew} className={tile}>
          <Plus className={icon} />
          New Quotation
        </button>
        <Link href="/quotation-sales/quotation" className={tile}>
          <List className={icon} />
          Quotation List
        </Link>
        <button
          type="button"
          disabled
          className={cn(tile, "cursor-not-allowed opacity-45")}
          title="Quotation template is not configured yet"
        >
          <FileText className={icon} />
          Quotation Template
        </button>
        <button
          type="button"
          disabled
          className={cn(tile, "cursor-not-allowed opacity-45")}
          title="Tender ID search is not available for sales quotations"
        >
          <Search className={icon} />
          Search by TID
        </button>
      </div>
    </section>
  );
}

function CostingSummary({
  data,
  loading,
  error,
  onExport,
}: {
  data?: SalesQuotationCostingSummary;
  loading: boolean;
  error: boolean;
  onExport: () => void;
}) {
  return (
    <section className="min-h-[230px] min-w-0 overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white">
      <Header
        title="Quotation Costing Summary"
        action={
          <button
            type="button"
            onClick={onExport}
            disabled={!data?.items.length}
            className="flex h-7 items-center gap-1 rounded border px-2.5 text-[8px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3 w-3" /> Export
          </button>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[7.5px]">
          <thead className="h-8 bg-[#f7f9fc]"><tr><th className="px-3">Item / Service</th><th>Qty</th><th>Unit</th><th className="text-right">Cost Price (BDT)</th><th className="text-right">Selling Price (BDT)</th><th className="text-right">Margin %</th><th className="text-right">Total Cost (BDT)</th><th className="text-right">Total Selling (BDT)</th><th className="px-3 text-right">Profit (BDT)</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="h-[150px] text-center">Loading costing summary...</td></tr> : error ? <tr><td colSpan={9} className="h-[150px] text-center text-red-600">Could not load costing summary.</td></tr> : !data?.items.length ? <tr><td colSpan={9} className="h-[150px] text-center">No costing data available for the selected filters.</td></tr> : <>
              {data.items.map((r, i) => <tr key={`${r.description}-${i}`} className="h-7 border-t"><td className="px-3 font-semibold">{r.description}</td><td>{money(r.quantity)}</td><td>{r.unit}</td><td className="text-right">{money(r.weightedUnitCost)}</td><td className="text-right">{money(r.weightedUnitPrice)}</td><td className="text-right">{money(r.marginPct)}%</td><td className="text-right">{money(r.totalCost)}</td><td className="text-right">{money(r.totalSelling)}</td><td className="px-3 text-right font-semibold text-[#249950]">{money(r.profit)}</td></tr>)}
              <tr className="h-7 border-t bg-[#fbfcfe] font-bold"><td className="px-3">Total</td><td>—</td><td>—</td><td /><td /><td className="text-right">{Number(data.totalSelling) ? money((Number(data.profit) / Number(data.totalSelling)) * 100) : "0.00"}%</td><td className="text-right">{money(data.totalCost)}</td><td className="text-right">{money(data.totalSelling)}</td><td className="px-3 text-right text-[#249950]">{money(data.profit)}</td></tr>
            </>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DecisionSummary({ rows, loading, error, view }: { rows: SalesQuotationResultRow[]; loading: boolean; error: boolean; view: (id: string) => void }) {
  return (
    <section className="min-h-[230px] min-w-0 overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white">
      <Header title="Accepted / Rejected Summary" action={<Link href="/quotation-sales/accepted-rejected" className="text-[8px] font-semibold text-[#1169e8]">View All</Link>} />
      <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-[8px]">
        <thead className="h-8 bg-[#f7f9fc]"><tr><th className="px-3">SL</th><th>Quotation No</th><th>Customer</th><th className="pr-2 text-right">Value (BDT)</th><th className="px-2">Status</th><th className="px-2">Decision Date</th><th className="px-3 text-center">Action</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={7} className="h-[150px] text-center">Loading decisions...</td></tr> : error ? <tr><td colSpan={7} className="h-[150px] text-center text-red-600">Could not load recent decisions.</td></tr> : !rows.length ? <tr><td colSpan={7} className="h-[150px] text-center">No accepted or rejected quotations.</td></tr> : rows.slice(0, 5).map((r, i) => <tr key={r.id} className="h-7 border-t"><td className="px-3">{i + 1}</td><td className="font-semibold text-[#174a9b]">{r.quotationNo}</td><td>{r.customer.name}</td><td className="pr-2 text-right">{money(r.grandTotal)}</td><td className="px-2"><Badge status={r.status} /></td><td className="px-2">{date(r.decisionDate ?? "")}</td><td className="px-3 text-center"><button onClick={() => view(r.id)} className="h-7 rounded border border-[#1769e8] px-3 font-semibold text-[#1769e8]">View Details</button></td></tr>)}</tbody>
      </table></div>
    </section>
  );
}
function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number) {
  const raw = String(value ?? "");
  const safe = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function QuotationWorkspace({ variant }: { variant: QuotationWorkspaceVariant }) {
  const isDashboard = variant === "dashboard";
  useSetBreadcrumb(
    isDashboard ? [{ label: "Quotation / Sales" }] : [{ label: "Quotation / Sales" }, { label: "Quotation" }],
  );
  const [draft, setDraft] = React.useState<Filters>(EMPTY),
    [filters, setFilters] = React.useState<Filters>(EMPTY),
    [page, setPage] = React.useState(1),
    [viewId, setViewId] = React.useState<string>(),
    [form, setForm] = React.useState(false),
    [edit, setEdit] = React.useState<SalesQuotationListRecord>(),
    [menuId, setMenuId] = React.useState<string>(),
    [error, setError] = React.useState<string>(),
    [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const query: SalesQuotationQuery = {
    page,
    limit: PAGE_SIZE,
    search: filters.search || undefined,
    fromDate: filters.fromDate || undefined,
    toDate: filters.toDate || undefined,
    status: filters.status || undefined,
    salesPersonId: filters.salesPersonId || undefined,
    workName: filters.workName || undefined,
  };
  const list = useSalesQuotations(query),
    summary = useSalesQuotationSummary({
      search: filters.search || undefined,
      fromDate: filters.fromDate || undefined,
      toDate: filters.toDate || undefined,
      status: filters.status || undefined,
      salesPersonId: filters.salesPersonId || undefined,
      workName: filters.workName || undefined,
    }),
    recent = useSalesQuotationRecent({ limit: isDashboard ? 4 : 5 }),
    costingSummary = useSalesQuotationCostingSummary({
      search: filters.search || undefined,
      fromDate: filters.fromDate || undefined,
      toDate: filters.toDate || undefined,
      status: filters.status || undefined,
      salesPersonId: filters.salesPersonId || undefined,
      workName: filters.workName || undefined,
    }),
    recentDecisions = useSalesQuotationRecentDecisions({
      limit: 5,
      search: filters.search || undefined,
      fromDate: filters.fromDate || undefined,
      toDate: filters.toDate || undefined,
      salesPersonId: filters.salesPersonId || undefined,
      workName: filters.workName || undefined,
    }),
    options = useSalesQuotationOptions(),
    sender = useSendSalesQuotation(),
    exporter = useExportSalesQuotations();
  const rows = list.data?.items ?? [],
    meta = list.data?.meta,
    total = summary.data?.total;
  const projectOptions = React.useMemo(
    () =>
      Array.from(
        new Set([...(options.data?.projectNames ?? []), ...(options.data?.workNames ?? [])]),
      ),
    [options.data?.projectNames, options.data?.workNames],
  );

  React.useEffect(() => {
    if (!menuId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuId(undefined);
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!(event.target as Element).closest("[data-quotation-menu]")) {
        setMenuId(undefined);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [menuId]);
  const apply = (e?: React.FormEvent) => {
    e?.preventDefault();
    setFilters(draft);
    setPage(1);
  };
  const reset = () => {
    setDraft(EMPTY);
    setFilters(EMPTY);
    setPage(1);
  };
  async function exportRows() {
    setError(undefined);
    try {
      const f = await exporter.mutateAsync(query);
      download(f.filename, f.content);
    } catch {
      setError("Could not export quotations.");
    }
  }
  async function send(r: SalesQuotationListRecord) {
    setError(undefined);
    try {
      await sender.mutateAsync({ id: r.id, body: { expectedVersion: r.version } });
    } catch {
      setError("Could not send this quotation. Confirm costing is complete and it is still valid.");
    }
  }
  function exportCostingSummary() {
    const data = costingSummary.data;
    if (!data?.items.length) return;
    const header = [
      "Item / Service",
      "Quantity",
      "Unit",
      "Cost Price (BDT)",
      "Selling Price (BDT)",
      "Margin %",
      "Total Cost (BDT)",
      "Total Selling (BDT)",
      "Profit (BDT)",
    ];
    const lines = data.items.map((item) => [
      item.description,
      item.quantity,
      item.unit,
      item.weightedUnitCost,
      item.weightedUnitPrice,
      item.marginPct,
      item.totalCost,
      item.totalSelling,
      item.profit,
    ]);
    lines.push([
      "Total",
      "",
      "",
      "",
      "",
      Number(data.totalSelling)
        ? ((Number(data.profit) / Number(data.totalSelling)) * 100).toFixed(2)
        : "0.00",
      data.totalCost,
      data.totalSelling,
      data.profit,
    ]);
    download(
      "quotation-costing-summary.csv",
      [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n"),
    );
  }
  const totalPages = Math.max(1, meta?.totalPages ?? 1);
  const firstPage = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, index) => firstPage + index);
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const toggleVisibleRows = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (rows.every((row) => next.has(row.id))) {
        rows.forEach((row) => next.delete(row.id));
      } else {
        rows.forEach((row) => next.add(row.id));
      }
      return next;
    });
  };
  const toggleRow = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <div className="min-h-full bg-[#f8faff] text-[#0b1f4b]">
      <div className={cn("relative sm:min-h-[62px]", isDashboard ? "min-h-[132px]" : "min-h-[95px]")}>
        <div className="pt-1">
          <h1 className="text-[23px] font-bold">{isDashboard ? "Quotation / Sales Dashboard" : "Quotation"}</h1>
          <p className="mt-1 text-[10px] text-[#40577f]">
            {isDashboard
              ? "Manage your quotations and sales pipeline efficiently"
              : "Create, manage and track quotations. Convert to sales orders seamlessly."}
          </p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-1.5 sm:absolute sm:-top-[23px] sm:right-0 sm:w-[230px] sm:items-end">
        <label className="relative mt-1 h-[43px] w-full rounded-[6px] border bg-white px-4 pt-1.5">
          <span className="block text-[8px]">Select Project</span>
          <select
            value={draft.workName}
            onChange={(e) => {
              const workName = e.target.value;
              setDraft((v) => ({ ...v, workName }));
              setFilters((v) => ({ ...v, workName }));
              setPage(1);
            }}
            className="absolute inset-0 h-full w-full appearance-none bg-transparent px-4 pt-4 text-[10px] font-bold"
          >
            <option value="">All Projects / Works</option>
            {projectOptions.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        </label>
        {isDashboard && (
          <button
            onClick={() => { setEdit(undefined); setForm(true); }}
            className="flex h-[32px] w-full items-center justify-center gap-1 rounded-[4px] bg-[#0867e8] px-4 text-[9px] font-semibold text-white sm:w-[132px]"
          >
            <Plus className="h-3.5 w-3.5" /> New Quotation
          </button>
        )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.25fr)]">
        <Kpi
          name="Total Quotations"
          value={summary.isLoading ? "—" : String(total ?? 0)}
          help={isDashboard ? "All Time" : "Live quotation total"}
          icon={FileText}
          tone="bg-[#e8f2ff] text-[#1169e8]"
        />
        <Kpi
          name="Draft"
          value={summary.isLoading ? "—" : String(summary.data?.draft ?? 0)}
          help={pct(summary.data?.draft, total)}
          icon={FileText}
          tone="bg-[#fff2de] text-[#e99a18]"
        />
        <Kpi
          name="Sent"
          value={summary.isLoading ? "—" : String(summary.data?.sent ?? 0)}
          help={pct(summary.data?.sent, total)}
          icon={Send}
          tone="bg-[#e8f2ff] text-[#1169e8]"
        />
        <Kpi
          name="Accepted"
          value={summary.isLoading ? "—" : String(summary.data?.accepted ?? 0)}
          help={pct(summary.data?.accepted, total)}
          icon={CheckCircle2}
          tone="bg-[#e7f7ed] text-[#27a95a]"
        />
        <Kpi
          name="Rejected"
          value={summary.isLoading ? "—" : String(summary.data?.rejected ?? 0)}
          help={pct(summary.data?.rejected, total)}
          icon={CircleX}
          tone="bg-[#ffedef] text-[#e43f4f]"
        />
        <Kpi
          name="Total Quotation Value (BDT)"
          value={summary.isLoading ? "—" : money(summary.data?.totalQuotationValue)}
          help={isDashboard ? "All Time" : "Live quotation value"}
          icon={Coins}
          tone="bg-[#f2eaff] text-[#8949db]"
        />
      </div>
      <form
        onSubmit={apply}
        className="mt-3 flex min-h-[70px] items-center rounded-[7px] border bg-white px-4 py-2"
      >
        <div className="grid w-full grid-cols-1 items-end gap-3 md:grid-cols-2 xl:grid-cols-[1.45fr_1.45fr_.82fr_1.05fr_100px_100px]">
          <label className="relative">
            <span className="mb-1.5 block text-[8.5px] font-semibold">Search</span>
            <input
              value={draft.search}
              onChange={(e) => setDraft((v) => ({ ...v, search: e.target.value }))}
              placeholder="Search by Quotation No, Customer, Project..."
              className={cn(CONTROL, "pr-9")}
            />
            <Search className="absolute bottom-[10px] right-3 h-3.5 w-3.5" />
          </label>
          <label>
            <span className="mb-1.5 block text-[8.5px] font-semibold">Date Range</span>
            <span className="grid h-[34px] grid-cols-[1fr_auto_1fr] items-center rounded border">
              <span className="relative pl-8 text-[8.5px]">
                <CalendarDays className="absolute left-2.5 h-3.5 w-3.5" />
                {date(draft.fromDate)}
                <input
                  type="date"
                  aria-label="Date from"
                  value={draft.fromDate}
                  onChange={(e) => setDraft((v) => ({ ...v, fromDate: e.target.value }))}
                  className="absolute inset-0 opacity-0"
                />
              </span>
              <span>→</span>
              <span className="relative px-2 pr-8 text-[8.5px]">
                {date(draft.toDate)}
                <CalendarDays className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                <input
                  type="date"
                  aria-label="Date to"
                  min={draft.fromDate}
                  value={draft.toDate}
                  onChange={(e) => setDraft((v) => ({ ...v, toDate: e.target.value }))}
                  className="absolute inset-0 opacity-0"
                />
              </span>
            </span>
          </label>
          <label>
            <span className="mb-1.5 block text-[8.5px] font-semibold">Status</span>
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft((v) => ({ ...v, status: e.target.value as Filters["status"] }))
              }
              className={CONTROL}
            >
              <option value="">All Status</option>
              {(["DRAFT", "SENT", "ACCEPTED", "REJECTED"] as const).map((x) => (
                <option key={x} value={x}>
                  {label(x)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[8.5px] font-semibold">Sales Person</span>
            <select
              value={draft.salesPersonId}
              onChange={(e) => setDraft((v) => ({ ...v, salesPersonId: e.target.value }))}
              className={CONTROL}
            >
              <option value="">All Sales Person</option>
              {options.data?.salesPeople.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <button className="flex h-[34px] items-center justify-center gap-1 rounded bg-[#0867e8] text-[9px] font-semibold text-white">
            <Search className="h-3.5 w-3.5" />
            Search
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex h-[34px] items-center justify-center gap-1 rounded border text-[9px] font-semibold text-[#1169e8]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </form>
      {(error || summary.isError) && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[9px] text-red-700">
          {error ?? (isDashboard ? "Could not load dashboard totals." : "Could not load quotation totals.")}
        </div>
      )}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2.65fr)_minmax(300px,1fr)]">
        <section
          className={cn(
            "min-w-0 overflow-hidden rounded-[7px] border bg-white",
            isDashboard
              ? "xl:h-[405px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[350px]"
              : "xl:h-[590px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[485px]",
          )}
        >
          <Header
            title="Quotation List"
            className="h-[50px]"
            action={
              isDashboard ? (
                <button
                  onClick={exportRows}
                  disabled={exporter.isPending}
                  className="flex h-[31px] items-center gap-1 rounded border px-3 text-[9px]"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exporter.isPending ? "Exporting..." : "Export"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setEdit(undefined); setForm(true); }}
                  className="flex h-[31px] items-center gap-1 rounded bg-[#0867e8] px-3 text-[9px] font-semibold text-white"
                >
                  <Plus className="h-3.5 w-3.5" /> New Quotation
                </button>
              )
            }
          />
          <div
            className={cn(
              "overflow-auto",
              isDashboard
                ? "xl:h-[297px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[242px]"
                : "xl:h-[482px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[377px]",
            )}
          >
            <table className={cn("w-full text-left", isDashboard ? "min-w-[760px]" : "min-w-[800px]")}>
              <thead className="sticky top-0 bg-[#f7f9fc] text-[8px]">
                <tr className="h-10 border-b">
                  {!isDashboard && (
                    <th className="w-9 px-3">
                      <input
                        type="checkbox"
                        aria-label="Select all visible quotations"
                        checked={allVisibleSelected}
                        onChange={toggleVisibleRows}
                        className="h-3.5 w-3.5 accent-[#0867e8]"
                      />
                    </th>
                  )}
                  <th className="px-3">SL</th>
                  <th>Quotation No</th>
                  <th>Customer</th>
                  <th>Project / Work Name</th>
                  <th>Quotation Date</th>
                  <th>Valid Until</th>
                  <th className="pr-3 text-right">Value (BDT)</th>
                  <th className="px-3">Status</th>
                  <th className="px-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="text-[8.5px]">
                {list.isLoading ? (
                  <tr>
                    <td colSpan={isDashboard ? 9 : 10} className="h-[180px] text-center">
                      Loading quotations...
                    </td>
                  </tr>
                ) : list.isError ? (
                  <tr>
                    <td colSpan={isDashboard ? 9 : 10} className="h-[180px] text-center text-red-600">
                      Could not load quotations.{" "}
                      <button onClick={() => list.refetch()} className="underline">
                        Retry
                      </button>
                    </td>
                  </tr>
                ) : !rows.length ? (
                  <tr>
                    <td colSpan={isDashboard ? 9 : 10} className="h-[180px] text-center">
                      No quotations match the selected filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={r.id} className="h-[41px] border-b">
                      {!isDashboard && (
                        <td className="w-9 px-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.quotationNo}`}
                            checked={selectedIds.has(r.id)}
                            onChange={() => toggleRow(r.id)}
                            className="h-3.5 w-3.5 accent-[#0867e8]"
                          />
                        </td>
                      )}
                      <td className="px-3">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="font-semibold text-[#174a9b]">{r.quotationNo}</td>
                      <td>{r.customer.name}</td>
                      <td>{r.workName}</td>
                      <td>{date(r.quotationDate)}</td>
                      <td>{date(r.validUntil)}</td>
                      <td className="pr-3 text-right">{money(r.grandTotal)}</td>
                      <td className="px-3">
                        <Badge status={r.status} />
                      </td>
                      <td>
                        <div data-quotation-menu className="relative flex justify-center gap-1">
                          <button aria-label={`View ${r.quotationNo}`} onClick={() => setViewId(r.id)} className="rounded border p-1.5">
                            <Eye className="h-3 w-3" />
                          </button>
                          <button
                            aria-label={`Edit ${r.quotationNo}`}
                            disabled={r.status !== "DRAFT"}
                            onClick={() => {
                              setEdit(r);
                              setForm(true);
                            }}
                            className="rounded border p-1.5 disabled:opacity-30"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            aria-label={`More actions for ${r.quotationNo}`}
                            aria-expanded={menuId === r.id}
                            onClick={() => setMenuId((id) => id === r.id ? undefined : r.id)}
                            className="rounded border p-1.5"
                          ><MoreVertical className="h-3 w-3" /></button>
                          {menuId === r.id && <div className={cn("absolute right-0 z-20 w-28 rounded border bg-white p-1 text-left text-[8px] shadow-lg", i >= rows.length - 2 ? "bottom-7" : "top-7")}>
                            {r.status === "DRAFT" && <button disabled={sender.isPending} onClick={() => { setMenuId(undefined); void send(r); }} className="flex h-7 w-full items-center gap-2 rounded px-2 hover:bg-[#f2f6fc] disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-3 w-3" />Send</button>}
                            <Link onClick={() => setMenuId(undefined)} href={`/quotation-sales/quotation-costing?quotationId=${r.id}`} className="flex h-7 items-center gap-2 rounded px-2 hover:bg-[#f2f6fc]"><Coins className="h-3 w-3" />Costing</Link>
                          </div>}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <footer className="flex min-h-[58px] flex-col items-start justify-between gap-2 border-t px-3 py-2 text-[8px] sm:flex-row sm:items-center sm:py-0">
            <span>
              Showing {rows.length ? (page - 1) * PAGE_SIZE + 1 : 0} to {(page - 1) * PAGE_SIZE + rows.length} of{" "}
              {meta?.total ?? 0} entries
            </span>
            <div className="flex max-w-full flex-wrap items-center justify-end gap-1 self-end">
              <button
                disabled={page <= 1}
                onClick={() => setPage((v) => v - 1)}
                className="h-7 w-7 rounded border disabled:opacity-30"
              >
                <ChevronLeft className="mx-auto h-3.5 w-3.5" />
              </button>
              {pageNumbers.map((number) => <button key={number} onClick={() => setPage(number)} className={cn("h-7 min-w-7 rounded border px-1", number === page && "border-[#0867e8] bg-[#0867e8] text-white")}>{number}</button>)}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((v) => v + 1)}
                className="h-7 w-7 rounded border disabled:opacity-30"
              >
                <ChevronRight className="mx-auto h-3.5 w-3.5" />
              </button>
            </div>
          </footer>
        </section>
        <aside className="grid gap-3">
          <Overview
            data={summary.data}
            loading={summary.isLoading}
            error={summary.isError}
            variant={variant}
          />
          <Recent
            rows={recent.data ?? []}
            loading={recent.isLoading}
            error={recent.isError}
            view={setViewId}
            variant={variant}
          />
          {!isDashboard && (
            <QuickActions onNew={() => { setEdit(undefined); setForm(true); }} />
          )}
        </aside>
      </div>
      {isDashboard && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(520px,1fr)]">
            <CostingSummary
              data={costingSummary.data}
              loading={costingSummary.isLoading}
              error={costingSummary.isError}
              onExport={exportCostingSummary}
            />
            <DecisionSummary
              rows={recentDecisions.data ?? []}
              loading={recentDecisions.isLoading}
              error={recentDecisions.isError}
              view={setViewId}
            />
          </div>
          <div className="mt-3 flex min-h-10 items-center gap-3 rounded-[5px] border border-[#dbe7f7] bg-[#f1f6fe] px-3 text-[9px] text-[#29466f]">
            <Info className="h-4 w-4 shrink-0 text-[#1169e8]" />
            <span>Create new quotations, manage item costing, send them for customer review, and track every result from draft to accepted or rejected.</span>
          </div>
        </>
      )}
      <QuotationFormDialog
        open={form}
        initial={edit}
        onClose={() => setForm(false)}
        onSaved={() => {
          setForm(false);
          setEdit(undefined);
        }}
      />
      <QuotationDetailDialog
        open={!!viewId}
        quotationId={viewId}
        onClose={() => setViewId(undefined)}
      />
    </div>
  );
}

export default function QuotationPage() {
  return <QuotationWorkspace variant="quotation" />;
}
