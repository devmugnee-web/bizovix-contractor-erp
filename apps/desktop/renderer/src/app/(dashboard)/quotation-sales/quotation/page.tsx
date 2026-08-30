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
  List,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
} from "lucide-react";
import {
  useExportSalesQuotations,
  useSalesQuotationOptions,
  useSalesQuotationRecent,
  useSalesQuotations,
  useSalesQuotationSummary,
  useSendSalesQuotation,
} from "@bizovix/api-client";
import type {
  SalesQuotationListRecord,
  SalesQuotationQuery,
  SalesQuotationRecord,
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
const EMPTY: Filters = {
  search: "",
  fromDate: "",
  toDate: "",
  status: "",
  salesPersonId: "",
  workName: "",
};
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
    <div className="flex h-[96px] min-w-0 items-center rounded-[7px] border border-[#dfe6f1] bg-white px-3.5 [@media(min-width:1280px)_and_(max-height:800px)]:h-[78px]">
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
}: {
  data?: { total: number; draft: number; sent: number; accepted: number; rejected: number };
  loading: boolean;
  error: boolean;
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
    <section className="overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white xl:h-[204px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[154px]">
      <Header
        title="Quotations Overview"
        className="[@media(min-width:1280px)_and_(max-height:800px)]:h-[34px]"
      />
      {error ? (
        <p className="p-8 text-center text-[9px] text-red-600">Could not load overview.</p>
      ) : (
        <div className="flex min-h-[159px] items-center gap-4 px-4 [@media(min-width:1280px)_and_(max-height:800px)]:min-h-[120px]">
          <div
            className="relative h-[126px] w-[126px] shrink-0 rounded-full [@media(min-width:1280px)_and_(max-height:800px)]:h-[108px] [@media(min-width:1280px)_and_(max-height:800px)]:w-[108px]"
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
}: {
  rows: SalesQuotationListRecord[];
  loading: boolean;
  error: boolean;
  view: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white xl:h-[289px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[194px]">
      <Header
        title="Recent Quotations"
        action={<span className="text-[8px] text-[#1169e8]">Latest activity</span>}
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
          rows.slice(0, 5).map((r) => (
            <button
              key={r.id}
              onClick={() => view(r.id)}
              className="grid min-h-[48px] w-full grid-cols-[25px_1fr_auto_72px] items-center gap-2 text-left [@media(min-width:1280px)_and_(max-height:800px)]:min-h-[32px]"
            >
              <FileText className="h-4 w-4 text-[#1169e8]" />
              <span className="min-w-0">
                <strong className="block truncate text-[8.5px]">{r.quotationNo}</strong>
                <span className="block truncate text-[7.5px]">{r.customer.name}</span>
              </span>
              <Badge status={r.status} />
              <span className="text-right text-[7.5px]">{date(r.quotationDate)}</span>
            </button>
          ))
        )}
      </div>
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

export default function QuotationPage() {
  useSetBreadcrumb([{ label: "Quotation / Sales" }, { label: "Quotation" }]);
  const [draft, setDraft] = React.useState<Filters>(EMPTY),
    [filters, setFilters] = React.useState<Filters>(EMPTY),
    [page, setPage] = React.useState(1),
    [viewId, setViewId] = React.useState<string>(),
    [form, setForm] = React.useState(false),
    [edit, setEdit] = React.useState<SalesQuotationRecord>(),
    [error, setError] = React.useState<string>();
  const query: SalesQuotationQuery = {
    page,
    limit: 10,
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
    recent = useSalesQuotationRecent({ limit: 5 }),
    options = useSalesQuotationOptions(),
    sender = useSendSalesQuotation(),
    exporter = useExportSalesQuotations();
  const rows = list.data?.items ?? [],
    meta = list.data?.meta,
    total = summary.data?.total;
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
  return (
    <div className="min-h-full bg-[#f8faff] text-[#0b1f4b]">
      <div className="flex min-h-[132px] flex-col justify-between gap-3 sm:h-[82px] sm:min-h-0 sm:flex-row [@media(min-width:1280px)_and_(max-height:800px)]:h-[61px]">
        <div className="pt-[17px] [@media(min-width:1280px)_and_(max-height:800px)]:pt-1">
          <h1 className="text-[23px] font-bold">Quotation</h1>
          <p className="mt-1 text-[10px] text-[#40577f]">
            Create, manage and track quotations with live workflow data.
          </p>
        </div>
        <label className="relative mt-1 h-[43px] w-full rounded-[6px] border bg-white px-4 pt-1.5 sm:w-[230px]">
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
            {(options.data?.projectNames ?? options.data?.workNames ?? []).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.25fr)]">
        <Kpi
          name="Total Quotations"
          value={summary.isLoading ? "—" : String(total ?? 0)}
          help="All matching quotations"
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
          help="Filtered quotation value"
          icon={Coins}
          tone="bg-[#f2eaff] text-[#8949db]"
        />
      </div>
      <form
        onSubmit={apply}
        className="mt-3 flex min-h-[80px] items-center rounded-[7px] border bg-white px-4 py-3"
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
              <span className="relative px-2 text-[8.5px]">
                {date(draft.toDate)}
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
          {error ?? "Could not load dashboard totals."}
        </div>
      )}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2.65fr)_minmax(300px,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-[7px] border bg-white xl:h-[565px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[474px]">
          <Header
            title="Quotation List"
            className="h-[50px]"
            action={
              <div className="flex gap-2">
                <button
                  onClick={exportRows}
                  disabled={exporter.isPending}
                  className="flex h-[31px] items-center gap-1 rounded border px-3 text-[9px]"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exporter.isPending ? "Exporting..." : "Export"}
                </button>
                <button
                  onClick={() => {
                    setEdit(undefined);
                    setForm(true);
                  }}
                  className="flex h-[31px] items-center gap-1 rounded bg-[#0867e8] px-4 text-[9px] text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Quotation
                </button>
              </div>
            }
          />
          <div className="overflow-auto xl:h-[450px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[391px]">
            <table className="w-full min-w-[960px] text-left">
              <thead className="sticky top-0 bg-[#f7f9fc] text-[8px]">
                <tr className="h-10 border-b">
                  <th className="px-3">SL</th>
                  <th>No</th>
                  <th>Customer</th>
                  <th>Project / Work Name</th>
                  <th>Date</th>
                  <th>Valid Until</th>
                  <th className="text-right">Value (BDT)</th>
                  <th>Status</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody className="text-[8.5px]">
                {list.isLoading ? (
                  <tr>
                    <td colSpan={9} className="h-[180px] text-center">
                      Loading quotations...
                    </td>
                  </tr>
                ) : list.isError ? (
                  <tr>
                    <td colSpan={9} className="h-[180px] text-center text-red-600">
                      Could not load quotations.{" "}
                      <button onClick={() => list.refetch()} className="underline">
                        Retry
                      </button>
                    </td>
                  </tr>
                ) : !rows.length ? (
                  <tr>
                    <td colSpan={9} className="h-[180px] text-center">
                      No quotations match the selected filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={r.id} className="h-[41px] border-b">
                      <td className="px-3">{(page - 1) * 10 + i + 1}</td>
                      <td className="font-semibold text-[#174a9b]">{r.quotationNo}</td>
                      <td>{r.customer.name}</td>
                      <td>{r.workName}</td>
                      <td>{date(r.quotationDate)}</td>
                      <td>{date(r.validUntil)}</td>
                      <td className="text-right">{money(r.grandTotal)}</td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                      <td>
                        <div className="flex justify-center gap-1">
                          <button onClick={() => setViewId(r.id)} className="rounded border p-1.5">
                            <Eye className="h-3 w-3" />
                          </button>
                          <button
                            disabled={r.status !== "DRAFT"}
                            onClick={() => {
                              setEdit(r as SalesQuotationRecord);
                              setForm(true);
                            }}
                            className="rounded border p-1.5 disabled:opacity-30"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          {r.status === "DRAFT" && (
                            <button
                              onClick={() => send(r)}
                              className="rounded border p-1.5 text-blue-600"
                            >
                              <Send className="h-3 w-3" />
                            </button>
                          )}
                          <Link
                            href={`/quotation-sales/quotation-costing?quotationId=${r.id}`}
                            className="rounded border px-2 py-1 text-[7.5px] text-blue-600"
                          >
                            Costing
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <footer className="flex min-h-[58px] items-center justify-between border-t px-3 text-[8px]">
            <span>
              Showing {rows.length ? (page - 1) * 10 + 1 : 0} to {(page - 1) * 10 + rows.length} of{" "}
              {meta?.total ?? 0} entries
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((v) => v - 1)}
                className="h-7 w-7 rounded border disabled:opacity-30"
              >
                <ChevronLeft className="mx-auto h-3.5 w-3.5" />
              </button>
              <span className="px-2">
                {page} / {meta?.totalPages ?? 1}
              </span>
              <button
                disabled={page >= (meta?.totalPages ?? 1)}
                onClick={() => setPage((v) => v + 1)}
                className="h-7 w-7 rounded border disabled:opacity-30"
              >
                <ChevronRight className="mx-auto h-3.5 w-3.5" />
              </button>
            </div>
          </footer>
        </section>
        <aside className="grid gap-3">
          <Overview data={summary.data} loading={summary.isLoading} error={summary.isError} />
          <Recent
            rows={recent.data ?? []}
            loading={recent.isLoading}
            error={recent.isError}
            view={setViewId}
          />
          <section className="overflow-hidden rounded border bg-white">
            <Header title="Quick Actions" className="h-[34px]" />
            <div className="grid grid-cols-2 gap-2 p-2">
              <button
                onClick={() => {
                  setEdit(undefined);
                  setForm(true);
                }}
                className="flex h-[58px] flex-col items-center justify-center text-[8px]"
              >
                <Plus className="h-5 w-5 text-blue-600" />
                New Quotation
              </button>
              <Link
                href="/quotation-sales/accepted-rejected"
                className="flex h-[58px] flex-col items-center justify-center text-[8px]"
              >
                <List className="h-5 w-5 text-blue-600" />
                Quotation Results
              </Link>
              <button
                onClick={exportRows}
                className="flex h-[58px] flex-col items-center justify-center text-[8px]"
              >
                <Download className="h-5 w-5 text-blue-600" />
                Export List
              </button>
              <Link
                href="/quotation-sales/quotation-costing"
                className="flex h-[58px] flex-col items-center justify-center text-[8px]"
              >
                <Coins className="h-5 w-5 text-blue-600" />
                Costing
              </Link>
            </div>
          </section>
        </aside>
      </div>
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
