"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import {
  downloadDocument,
  downloadTenderTax,
  useMe,
  useTenderTaxDetail,
  useTenderTaxList,
  useTenderTaxMutations,
} from "@bizovix/api-client";
import type {
  SaveTenderTaxInput,
  TenderTaxEntry,
  TenderTaxEntryKind,
  TenderTaxQuery,
  TenderTaxTotals,
  TenderTaxType,
} from "@bizovix/types";
import { formatAmount } from "@bizovix/utils";
import { Modal } from "@/components/layout/Modal";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { VatTaxCertificatesWorkspace } from "./VatTaxCertificatesWorkspace";

const route = "/cms/documentation/vat-tax-certificate";
const control =
  "h-9 w-full min-w-0 rounded-md border border-biz-border bg-white px-3 text-[13px] outline-none focus:border-biz-blue focus:ring-2 focus:ring-biz-blue/15 disabled:opacity-50";
const button =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-biz-border px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const blueButton = `${button} border-transparent bg-biz-blue text-white hover:bg-biz-blue-hover`;
const PAGE_SIZE = 10;
function saveRequestId() {
  // LAN HTTP pages do not expose randomUUID; getRandomValues still works there.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function money(value: string) {
  return formatAmount(value);
}
function compactText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
const method = (kind: TenderTaxEntryKind) =>
  kind === "SELF_DEPOSIT" ? "Self Deposit" : "Bill Deduction";
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Could not complete this action. Please try again.";
type Period = "FY" | "YEAR" | "MONTH" | "CUSTOM" | "ALL";
function periodRange(period: Period, year: number, month: number) {
  if (period === "FY") return { from: `${year}-07-01`, to: `${year + 1}-06-30` };
  if (period === "YEAR") return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (period === "MONTH")
    return {
      from: `${year}-${String(month).padStart(2, "0")}-01`,
      to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    };
  return { from: "", to: "" };
}
function saveDownload(
  { blob, fileName }: { blob: Blob; fileName: string | null },
  fallback: string,
) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = fileName || fallback;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Totals({ value, loading }: { value?: TenderTaxTotals; loading: boolean }) {
  return (
    <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3" aria-label="VAT and Tax totals">
      {[
        ["Total VAT", value?.vat, value?.depositedVat, value?.deductedVat],
        ["Total Tax", value?.tax, value?.depositedTax, value?.deductedTax],
        ["VAT + Tax", value?.total],
      ].map(([label, amount, deposited, deducted], i) => (
        <section
          key={label}
          className={`flex min-h-[72px] min-w-0 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2.5 shadow-sm ${i === 0 ? "border-l-4 border-l-biz-blue" : i === 1 ? "border-l-4 border-l-biz-purple" : "border-l-4 border-l-emerald-500"}`}
        >
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-biz-muted">{label}</p>
            <p
              className={`mt-0.5 truncate text-[20px] font-bold leading-6 tabular-nums ${i === 2 ? "text-biz-blue" : "text-biz-text"}`}
              data-total={i === 0 ? "vat" : i === 1 ? "tax" : "total"}
            >
              {loading ? "…" : amount ? money(amount) : "—"}
            </p>
          </div>
          <div className="shrink-0 text-right text-[11px] leading-4 text-biz-muted">
            {i === 2 ? (
              <>BDT · {value?.entryCount ?? "—"} entries</>
            ) : (
              <>
                <div>Deposited: {deposited ? money(deposited) : "—"}</div>
                <div>Deducted: {deducted ? money(deducted) : "—"}</div>
              </>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
function Pagination({
  page,
  pages,
  total,
  setPage,
}: {
  page: number;
  pages: number;
  total: number;
  setPage: (p: number) => void;
}) {
  const start = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-t border-biz-border px-3 text-[12px] text-biz-muted">
      <span>
        Showing {start} to {end} of {total}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-biz-border bg-white disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-14 text-center font-semibold text-biz-text">
            {page} / {Math.max(1, pages)}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-biz-border bg-white disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
function EntryEditor({
  tenderId,
  entry,
  onClose,
  onSaved,
}: {
  tenderId: string;
  entry: TenderTaxEntry | null;
  onClose: () => void;
  onSaved: (entry: TenderTaxEntry) => void;
}) {
  const mutations = useTenderTaxMutations();
  const [input, setInput] = React.useState<SaveTenderTaxInput>(() => ({
    taxType: entry?.taxType || "VAT",
    entryKind: entry?.entryKind || "SELF_DEPOSIT",
    entryDate: entry?.entryDate || today(),
    amount: entry?.amount || "",
    referenceNo: entry?.referenceNo || "",
    notes: entry?.notes || "",
  }));
  const [tried, setTried] = React.useState(false),
    [error, setError] = React.useState("");
  const requestId = React.useRef<string | null>(null),
    lock = React.useRef(false),
    form = React.useRef<HTMLFormElement>(null);
  const busy = mutations.create.isPending || mutations.update.isPending;
  const invalidAmount =
    !/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/.test(input.amount) || Number(input.amount) <= 0;
  const invalidDate = !/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate) || input.entryDate > today();
  const cls = (invalid: boolean) =>
    `${control} ${tried && invalid ? "border-red-500 bg-red-50 ring-1 ring-red-500" : ""}`;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    setTried(true);
    setError("");
    if (invalidAmount || invalidDate || !input.referenceNo.trim()) {
      setTimeout(
        () => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        0,
      );
      return;
    }
    lock.current = true;
    try {
      const saved = entry
        ? await mutations.update.mutateAsync({
            id: entry.id,
            input: { ...input, version: entry.version },
          })
        : await mutations.create.mutateAsync({
            tenderId,
            input: { ...input, requestId: (requestId.current ??= saveRequestId()) },
          });
      onSaved(saved);
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={entry ? "Edit VAT / Tax Entry" : "Add VAT / Tax Entry"}
      contentClassName="max-h-[90vh] overflow-y-auto"
    >
      <form
        ref={form}
        onSubmit={submit}
        noValidate
        aria-label="VAT Tax entry"
        className="space-y-4"
      >
        <fieldset disabled={busy} className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-biz-muted">
            Type
            <select
              aria-label="Tax type"
              className={control}
              value={input.taxType}
              onChange={(e) => setInput({ ...input, taxType: e.target.value as TenderTaxType })}
            >
              <option value="VAT">VAT</option>
              <option value="TAX">Tax / AIT</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-biz-muted">
            Method
            <select
              aria-label="Entry method"
              className={control}
              value={input.entryKind}
              onChange={(e) =>
                setInput({ ...input, entryKind: e.target.value as TenderTaxEntryKind })
              }
            >
              <option value="SELF_DEPOSIT">Self Deposit</option>
              <option value="BILL_DEDUCTION">Bill Deduction</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-biz-muted">
            {input.entryKind === "SELF_DEPOSIT" ? "Deposit" : "Deduction"} Date{" "}
            <span className="text-red-500">*</span>
            <input
              aria-label="Entry date"
              aria-invalid={tried && invalidDate}
              type="date"
              max={today()}
              value={input.entryDate}
              onChange={(e) => setInput({ ...input, entryDate: e.target.value })}
              className={cls(invalidDate)}
            />
          </label>
          <label className="space-y-1 text-xs text-biz-muted">
            Amount (BDT) <span className="text-red-500">*</span>
            <input
              aria-label="Amount (BDT)"
              aria-invalid={tried && invalidAmount}
              inputMode="decimal"
              value={input.amount}
              onChange={(e) => setInput({ ...input, amount: e.target.value })}
              className={cls(invalidAmount)}
              placeholder="0.00"
              autoFocus
            />
          </label>
          <label className="col-span-2 space-y-1 text-xs text-biz-muted">
            {input.entryKind === "SELF_DEPOSIT"
              ? "Challan / Payment Reference"
              : "Bill / Deduction Reference"}{" "}
            <span className="text-red-500">*</span>
            <input
              aria-label="Payment or bill reference"
              aria-invalid={tried && !input.referenceNo.trim()}
              maxLength={120}
              value={input.referenceNo}
              onChange={(e) => setInput({ ...input, referenceNo: e.target.value })}
              className={cls(!input.referenceNo.trim())}
            />
          </label>
          <label className="col-span-2 space-y-1 text-xs text-biz-muted">
            Notes
            <textarea
              aria-label="Notes"
              maxLength={1000}
              value={input.notes}
              onChange={(e) => setInput({ ...input, notes: e.target.value })}
              className={`${control} h-16 py-2`}
            />
          </label>
        </fieldset>
        <p className="text-[11px] text-biz-muted">
          Record an existing deposit or deduction. This does not make a payment.
        </p>
        {error && (
          <p role="alert" className="text-xs text-biz-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={button}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={blueButton}>
            {busy ? "Saving…" : "Save Entry"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Register() {
  useSetBreadcrumb([
    { label: "Projects", href: "/cms/ongoing-works" },
    { label: "Project Documentation", href: "/cms/documentation" },
    { label: "Tender VAT & Tax" },
  ]);
  const [initial] = React.useState(() => {
    const [year, month] = today().split("-").map(Number);
    const start = month! >= 7 ? year! : year! - 1;
    return { year: start, month: month!, ...periodRange("FY", start, month!) };
  });
  const [period, setPeriod] = React.useState<Period>("FY"),
    [year, setYear] = React.useState(initial.year),
    [month, setMonth] = React.useState(initial.month);
  const [yearText, setYearText] = React.useState(String(initial.year));
  const [dates, setDates] = React.useState({ from: initial.from, to: initial.to });
  const [search, setSearch] = React.useState(""),
    [entryKind, setKind] = React.useState<"" | TenderTaxEntryKind>("");
  const [taxType, setTaxType] = React.useState<"" | TenderTaxType>("");
  const [selected, setSelected] = React.useState<string>(),
    [page, setPage] = React.useState(1),
    [entryPage, setEntryPage] = React.useState(1);
  const [editor, setEditor] = React.useState<TenderTaxEntry | null | undefined>(),
    [voiding, setVoiding] = React.useState<TenderTaxEntry>(),
    [reason, setReason] = React.useState("");
  const [proofId, setProofId] = React.useState<string>(),
    [message, setMessage] = React.useState(""),
    [error, setError] = React.useState("");
  const [exporting, setExporting] = React.useState<"pdf" | "xlsx" | null>(null),
    [fileBusy, setFileBusy] = React.useState(false);
  const exportLock = React.useRef(false),
    mounted = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const me = useMe(),
    permissions = me.data?.permissions ?? [];
  const canRead = permissions.includes("vat_tax_certificate.read"),
    canCreate = permissions.includes("vat_tax_certificate.create"),
    canUpdate = permissions.includes("vat_tax_certificate.update"),
    canExport = permissions.includes("vat_tax_certificate.export");
  const canUpload = canUpdate && permissions.includes("documents.upload"),
    canDownload = permissions.includes("documents.download");
  const deferredSearch = React.useDeferredValue(search.trim());
  const validDates = !dates.from || !dates.to || dates.from <= dates.to;
  const filters: TenderTaxQuery = {
    dateFrom: dates.from || undefined,
    dateTo: dates.to || undefined,
    entryKind: entryKind || undefined,
    taxType: taxType || undefined,
  };
  const list = useTenderTaxList(
    { ...filters, search: deferredSearch || undefined, page, limit: PAGE_SIZE },
    canRead && validDates && !selected,
  );
  const detail = useTenderTaxDetail(canRead && validDates ? selected : undefined, {
    ...filters,
    page: entryPage,
    limit: PAGE_SIZE,
  });
  const mutations = useTenderTaxMutations();
  const active = selected ? detail : list;
  const totals = selected ? detail.data?.totals : list.data?.totals;
  const proof = detail.data?.rows.find((e) => e.id === proofId);
  function resetPages() {
    setPage(1);
    setEntryPage(1);
    setMessage("");
    setError("");
  }
  function changePeriod(next: Period, nextYear = year, nextMonth = month) {
    setPeriod(next);
    setYear(nextYear);
    setYearText(String(nextYear));
    setMonth(nextMonth);
    if (next !== "CUSTOM") setDates(periodRange(next, nextYear, nextMonth));
    resetPages();
  }
  async function download(format: "pdf" | "xlsx") {
    if (exportLock.current) return;
    exportLock.current = true;
    setExporting(format);
    setError("");
    try {
      const output = await downloadTenderTax(
        format,
        { ...filters, search: selected ? undefined : deferredSearch || undefined },
        selected,
      );
      if (mounted.current) saveDownload(output, `tender-vat-tax.${format}`);
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      exportLock.current = false;
      if (mounted.current) setExporting(null);
    }
  }
  async function upload(file: File | undefined) {
    if (!file || !proof || fileBusy) return;
    if (
      !/^(application\/pdf|image\/jpeg|image\/png)$/.test(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError("Choose a PDF, JPG or PNG up to 10 MB");
      return;
    }
    setFileBusy(true);
    setError("");
    try {
      await mutations.upload.mutateAsync({ id: proof.id, file });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setFileBusy(false);
    }
  }
  async function downloadProof(id: string) {
    if (fileBusy) return;
    setFileBusy(true);
    setError("");
    try {
      const file = proof?.documents.find((d) => d.id === id);
      saveDownload(await downloadDocument(id), file?.fileName || file?.name || "vat-tax-proof");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setFileBusy(false);
    }
  }
  const selectedError = active.error;
  return (
    <div className="flex min-h-full flex-col gap-2.5 text-biz-text xl:h-full xl:min-h-0 xl:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-page-title">Tender VAT &amp; Tax</h1>
          <p className="mt-0.5 text-[13px] text-biz-muted">
            Actual deposits and bill deductions in BDT
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${route}?view=certificates`} className={button}>
            <FileText className="h-4 w-4" />
            Certificates
          </Link>
          {canExport && (
            <>
              <button
                className={button}
                disabled={!!exporting || !validDates || active.isLoading || active.isError}
                onClick={() => void download("pdf")}
              >
                <Download className="h-4 w-4" />
                {exporting === "pdf" ? "Preparing…" : "PDF"}
              </button>
              <button
                className={button}
                disabled={!!exporting || !validDates || active.isLoading || active.isError}
                onClick={() => void download("xlsx")}
              >
                <Download className="h-4 w-4" />
                {exporting === "xlsx" ? "Preparing…" : "Excel"}
              </button>
            </>
          )}
        </div>
      </header>
      {me.isError ? (
        <p role="alert" className="text-sm text-biz-danger">
          Could not load your permissions. Refresh to try again.
        </p>
      ) : me.isLoading ? (
        <p className="p-8 text-center">Loading…</p>
      ) : !canRead ? (
        <p role="alert">You do not have permission to view VAT &amp; Tax records.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5">
          <section
            className="grid shrink-0 grid-cols-2 gap-2 rounded-lg border border-biz-border bg-white p-2.5 shadow-sm md:grid-cols-4 xl:grid-cols-8"
            aria-label="VAT Tax filters"
          >
            <label className="col-span-2 space-y-1 text-[12px] text-biz-muted">
              Tender ID / Work Name
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4" />
                <input
                  aria-label="Search tenders"
                  className={`${control} pl-9`}
                  value={search}
                  disabled={!!selected}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    resetPages();
                  }}
                  placeholder="Search tenders"
                />
              </div>
            </label>
            <label className="space-y-1 text-[12px] text-biz-muted">
              Period
              <select
                aria-label="Period"
                className={control}
                value={period}
                onChange={(e) => changePeriod(e.target.value as Period)}
              >
                <option value="FY">Financial Year</option>
                <option value="YEAR">Calendar Year</option>
                <option value="MONTH">Month</option>
                <option value="CUSTOM">Custom Dates</option>
                <option value="ALL">All Dates</option>
              </select>
            </label>
            <label className="space-y-1 text-[12px] text-biz-muted">
              {period === "FY" ? "Starting Year" : "Year"}
              <input
                aria-label="Year"
                type="number"
                min={1900}
                max={2100}
                disabled={period === "CUSTOM" || period === "ALL"}
                className={control}
                value={yearText}
                onChange={(e) => {
                  setYearText(e.target.value);
                  const value = Number(e.target.value);
                  if (value >= 1900 && value <= 2100) changePeriod(period, value);
                }}
                onBlur={() => setYearText(String(year))}
              />
            </label>
            {period === "MONTH" && (
              <label className="space-y-1 text-[12px] text-biz-muted">
                Month
                <select
                  aria-label="Month"
                  className={control}
                  value={month}
                  onChange={(e) => changePeriod(period, year, Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {new Date(2000, i, 1).toLocaleString("en", { month: "long" })}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="space-y-1 text-[12px] text-biz-muted">
              From
              <input
                aria-label="From date"
                type="date"
                className={`${control} ${!validDates ? "border-red-500" : ""}`}
                value={dates.from}
                onChange={(e) => {
                  setDates({ ...dates, from: e.target.value });
                  setPeriod("CUSTOM");
                  resetPages();
                }}
              />
            </label>
            <label className="space-y-1 text-[12px] text-biz-muted">
              To
              <input
                aria-label="To date"
                type="date"
                className={`${control} ${!validDates ? "border-red-500" : ""}`}
                value={dates.to}
                onChange={(e) => {
                  setDates({ ...dates, to: e.target.value });
                  setPeriod("CUSTOM");
                  resetPages();
                }}
              />
            </label>
            <label className="space-y-1 text-[12px] text-biz-muted">
              Method
              <select
                aria-label="Method filter"
                className={control}
                value={entryKind}
                onChange={(e) => {
                  setKind(e.target.value as typeof entryKind);
                  resetPages();
                }}
              >
                <option value="">All Methods</option>
                <option value="SELF_DEPOSIT">Self Deposits</option>
                <option value="BILL_DEDUCTION">Bill Deductions</option>
              </select>
            </label>
            <label className="space-y-1 text-[12px] text-biz-muted">
              Type
              <select
                aria-label="Type filter"
                className={control}
                value={taxType}
                onChange={(e) => {
                  setTaxType(e.target.value as typeof taxType);
                  resetPages();
                }}
              >
                <option value="">VAT &amp; Tax</option>
                <option value="VAT">VAT</option>
                <option value="TAX">Tax / AIT</option>
              </select>
            </label>
          </section>
          {!validDates && (
            <p role="alert" className="text-xs text-biz-danger">
              From date cannot be after To date.
            </p>
          )}
          <Totals
            value={validDates && !active.isError ? totals : undefined}
            loading={active.isLoading}
          />
          {message && (
            <p role="status" className="text-xs text-emerald-700">
              {message}
            </p>
          )}
          {error && !proof && !voiding && (
            <p role="alert" className="text-xs text-biz-danger">
              {error}
            </p>
          )}
          <section className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-xl border border-biz-border bg-white shadow-sm">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-biz-border bg-slate-50/45 px-3 py-2.5">
              <div>
                {selected ? (
                  <>
                    <button
                      className="mb-1 flex items-center gap-1 text-[12px] font-semibold text-biz-blue"
                      onClick={() => {
                        setSelected(undefined);
                        setEditor(undefined);
                        setMessage("");
                        setError("");
                      }}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      All Tenders
                    </button>
                    <h2 className="line-clamp-1 break-words text-[14px] font-semibold">
                      {detail.data?.tender.tenderNumber} {detail.data?.tender.workName}
                    </h2>
                  </>
                ) : (
                  <h2 className="text-[14px] font-semibold">Tender-wise VAT &amp; Tax</h2>
                )}
              </div>
              {selected && canCreate && (
                <button
                  className={blueButton}
                  disabled={!detail.data || detail.isError}
                  onClick={() => setEditor(null)}
                >
                  <Plus className="h-4 w-4" />
                  Add Entry
                </button>
              )}
            </header>
            {!validDates ? (
              <p className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-biz-muted">
                Select a valid date range.
              </p>
            ) : active.isLoading ? (
              <p className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-biz-muted">
                Loading records…
              </p>
            ) : active.isError ? (
              <div
                role="alert"
                className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-biz-danger"
              >
                {errorText(selectedError)}{" "}
                <button className="underline" onClick={() => void active.refetch()}>
                  Retry
                </button>
              </div>
            ) : selected ? (
              <>
                {!detail.data?.rows.length ? (
                  <p className="flex min-h-0 flex-1 items-center justify-center p-10 text-center text-sm text-biz-muted">
                    No VAT / Tax entries in this period.
                  </p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table
                      aria-label="VAT Tax entries"
                      className="w-full min-w-[820px] table-fixed text-left text-[13px] leading-[18px]"
                    >
                      <colgroup>
                        <col className="w-[13%]" />
                        <col className="w-[10%]" />
                        <col className="w-[16%]" />
                        <col className="w-[25%]" />
                        <col className="w-[18%]" />
                        <col className="w-[18%]" />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-slate-50 text-[12px] text-biz-muted">
                        <tr>
                          {[
                            "Date",
                            "Type",
                            "Method",
                            "Reference / Notes",
                            "Amount (BDT)",
                            "Action",
                          ].map((h) => (
                            <th
                              key={h}
                              className="border-b border-biz-border px-3 py-2.5 font-semibold"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.data.rows.map((e) => (
                          <tr
                            key={e.id}
                            data-tax-entry={e.id}
                            className={`border-b border-biz-border align-top last:border-0 ${e.voidedAt ? "bg-slate-50 text-biz-muted" : "even:bg-slate-50/45 hover:bg-biz-blue-soft/20"}`}
                          >
                            <td className="break-words px-3 py-2.5">{e.entryDate}</td>
                            <td className="px-3 py-2.5">{e.taxType}</td>
                            <td className="break-words px-3 py-2.5">{method(e.entryKind)}</td>
                            <td className="break-words px-3 py-2.5">
                              <div>{e.referenceNo}</div>
                              {e.notes && (
                                <p
                                  className="mt-0.5 line-clamp-1 text-[12px] text-biz-muted"
                                  title={compactText(e.notes)}
                                >
                                  {compactText(e.notes)}
                                </p>
                              )}
                              {e.voidedAt && (
                                <p className="mt-1 text-red-500">Voided: {e.voidReason}</p>
                              )}
                            </td>
                            <td
                              className={`break-words px-3 py-2.5 font-medium tabular-nums ${e.voidedAt ? "line-through" : ""}`}
                            >
                              {money(e.amount)}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                <button
                                  className="rounded border border-biz-border p-1.5 text-biz-blue"
                                  aria-label={`Files for ${e.referenceNo}`}
                                  title="Challan / Certificate"
                                  onClick={() => {
                                    setProofId(e.id);
                                    setError("");
                                  }}
                                >
                                  <Paperclip className="h-3.5 w-3.5" />
                                  <span className="text-[11px]">{e.documents.length}</span>
                                </button>
                                {canUpdate && !e.voidedAt && (
                                  <>
                                    <button
                                      className="rounded border border-biz-border p-1.5"
                                      aria-label={`Edit ${e.referenceNo}`}
                                      title="Edit entry"
                                      onClick={() => setEditor(e)}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      className="rounded border border-biz-border p-1.5 text-red-500"
                                      aria-label={`Void ${e.referenceNo}`}
                                      title="Void entry"
                                      onClick={() => {
                                        setVoiding(e);
                                        setReason("");
                                        setError("");
                                      }}
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {detail.data && (
                  <Pagination
                    page={entryPage}
                    pages={detail.data.meta.totalPages}
                    total={detail.data.meta.total}
                    setPage={setEntryPage}
                  />
                )}
              </>
            ) : (
              <>
                {!list.data?.rows.length ? (
                  <p className="flex min-h-0 flex-1 items-center justify-center p-10 text-center text-sm text-biz-muted">
                    No tenders found.
                  </p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table
                      aria-label="Tender VAT Tax summary"
                      className="w-full min-w-[860px] table-fixed text-left text-[13px] leading-[18px]"
                    >
                      <colgroup>
                        <col className="w-[5%]" />
                        <col className="w-[14%]" />
                        <col className="w-[33%]" />
                        <col className="w-[16%]" />
                        <col className="w-[16%]" />
                        <col className="w-[16%]" />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-slate-50 text-[12px] text-biz-muted">
                        <tr>
                          {[
                            "SL",
                            "Tender ID",
                            "Work Name",
                            "VAT (BDT)",
                            "Tax (BDT)",
                            "Total (BDT)",
                          ].map((h) => (
                            <th
                              key={h}
                              className="border-b border-biz-border px-3 py-2.5 font-semibold"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {list.data.rows.map((t, index) => (
                          <tr
                            key={t.id}
                            data-tax-tender={t.id}
                            className="border-b border-biz-border align-middle even:bg-slate-50/45 last:border-0 hover:bg-biz-blue-soft/25"
                          >
                            <td className="px-3 py-2.5 text-biz-muted">
                              {(page - 1) * PAGE_SIZE + index + 1}
                            </td>
                            <td className="break-words px-3 py-2.5">
                              <button
                                className="font-semibold text-biz-blue hover:underline"
                                onClick={() => {
                                  setSelected(t.id);
                                  setEntryPage(1);
                                  setMessage("");
                                  setError("");
                                }}
                              >
                                {t.tenderNumber || "View Details"}
                              </button>
                            </td>
                            <td className="break-words px-3 py-2.5">
                              <button
                                className="line-clamp-2 text-left font-medium leading-[18px] hover:text-biz-blue"
                                title={compactText(t.workName)}
                                onClick={() => {
                                  setSelected(t.id);
                                  setEntryPage(1);
                                  setMessage("");
                                  setError("");
                                }}
                              >
                                {compactText(t.workName)}
                              </button>
                            </td>
                            {[t.vat, t.tax, t.total].map((v, i) => (
                              <td
                                key={i}
                                className={`break-words px-3 py-2.5 tabular-nums ${i === 2 ? "font-semibold text-biz-blue" : ""}`}
                              >
                                {money(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {list.data && (
                  <Pagination
                    page={page}
                    pages={list.data.meta.totalPages}
                    total={list.data.meta.total}
                    setPage={setPage}
                  />
                )}
              </>
            )}
          </section>
        </div>
      )}
      {selected && editor !== undefined && (
        <EntryEditor
          key={editor?.id || "new"}
          tenderId={selected}
          entry={editor}
          onClose={() => setEditor(undefined)}
          onSaved={(entry) => {
            setEditor(undefined);
            setEntryPage(1);
            setMessage(
              (dates.from && entry.entryDate < dates.from) ||
                (dates.to && entry.entryDate > dates.to)
                ? "Entry saved. Select its date range to view it."
                : "Entry saved.",
            );
          }}
        />
      )}
      {voiding && (
        <Modal
          open
          title="Void Entry"
          onClose={() => {
            if (!mutations.voidEntry.isPending) setVoiding(undefined);
          }}
        >
          <form
            aria-label="Void tax entry"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reason.trim() || mutations.voidEntry.isPending) return;
              setError("");
              try {
                await mutations.voidEntry.mutateAsync({
                  id: voiding.id,
                  version: voiding.version,
                  reason,
                });
                setVoiding(undefined);
                setMessage("Entry voided. Totals updated; history retained.");
              } catch (e) {
                setError(errorText(e));
              }
            }}
            className="space-y-3"
          >
            <p className="text-xs text-biz-muted">
              Remove {voiding.taxType} {money(voiding.amount)} from totals. Its history will remain.
            </p>
            <label className="block space-y-1 text-xs">
              Reason <span className="text-red-500">*</span>
              <textarea
                aria-label="Void reason"
                required
                maxLength={500}
                className={`${control} h-20 py-2`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
            </label>
            {error && (
              <p role="alert" className="text-xs text-biz-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={button}
                disabled={mutations.voidEntry.isPending}
                onClick={() => setVoiding(undefined)}
              >
                Cancel
              </button>
              <button
                className={`${button} bg-red-600 text-white`}
                disabled={!reason.trim() || mutations.voidEntry.isPending}
              >
                {mutations.voidEntry.isPending ? "Voiding…" : "Void Entry"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {proof && (
        <Modal
          open
          title="Challan / Certificate"
          onClose={() => {
            if (!fileBusy) {
              setProofId(undefined);
              setError("");
            }
          }}
          contentClassName="max-h-[90vh] overflow-y-auto"
        >
          <div className="space-y-3">
            <p className="text-xs text-biz-muted">
              {proof.taxType} · {proof.referenceNo} · BDT {money(proof.amount)}
            </p>
            {proof.documents.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-biz-border p-3"
              >
                <span className="min-w-0 break-words text-xs">{d.fileName || d.name}</span>
                {canDownload && (
                  <button
                    title="Download file"
                    aria-label={`Download ${d.name}`}
                    className="shrink-0 text-biz-blue"
                    disabled={fileBusy}
                    onClick={() => void downloadProof(d.id)}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {!proof.documents.length && (
              <p className="py-4 text-center text-xs text-biz-muted">No files attached yet.</p>
            )}
            {canUpload && !proof.voidedAt && (
              <label className={`${button} w-full cursor-pointer text-biz-blue`}>
                <Paperclip className="h-4 w-4" />
                {fileBusy ? "Please wait…" : "Upload PDF / Image"}
                <input
                  aria-label="Upload payment proof"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="sr-only"
                  disabled={fileBusy}
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            <p className="text-[11px] text-biz-muted">
              Files support this entry; they do not add to the amount.
            </p>
            {error && (
              <p role="alert" className="text-xs text-biz-danger">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export function TenderVatTaxWorkspace() {
  const params = useSearchParams();
  // Keep all existing project/certificate deep links and workflows available.
  if (params.get("view") === "certificates" || params.has("workId") || params.get("create") === "1")
    return (
      <div className="space-y-3">
        <Link href={route} className="inline-flex items-center gap-1 text-xs text-biz-blue">
          <ArrowLeft className="h-4 w-4" />
          Tender VAT &amp; Tax
        </Link>
        <VatTaxCertificatesWorkspace />
      </div>
    );
  return <Register />;
}
