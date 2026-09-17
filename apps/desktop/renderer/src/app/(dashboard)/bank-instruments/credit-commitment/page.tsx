"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Info,
  Landmark,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import {
  useBankAccounts,
  useCreditCommitments,
  useCreateCreditCommitmentCharge,
  usePendingCreditCommitmentTenders,
  useTenderBankSettings,
} from "@bizovix/api-client";
import type { CreditCommitmentPendingQuery, PendingCreditCommitmentTender } from "@bizovix/types";
import {
  createCreditCommitmentSchema,
  type CreateCreditCommitmentFormValues,
} from "@bizovix/validation";
import { cn } from "@bizovix/ui";
import { formatAmount } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

type ChargeRow = PendingCreditCommitmentTender & {
  bankAccountId: string;
  chargeAmount: string;
  remarks: string;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const DEFAULT_QUERY: CreditCommitmentPendingQuery = { page: 1, limit: 10 };

function money(value: number | string) {
  return formatAmount(value || 0);
}

function displayDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function Checkbox({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "border-biz-blue bg-biz-blue text-white" : "border-[#C9D2E2] bg-white text-transparent",
      )}
    >
      <Check className="h-3 w-3" />
    </button>
  );
}

function TableSkeleton({ columns }: { columns: number }) {
  return Array.from({ length: 3 }, (_, row) => (
    <tr key={row} className="border-b border-biz-border last:border-0">
      {Array.from({ length: columns }, (_, column) => (
        <td key={column} className="px-3 py-3"><div className="h-3 animate-pulse rounded bg-biz-bg" /></td>
      ))}
    </tr>
  ));
}

function PaginationControls({ label, page, totalPages, limit, onPageChange, onLimitChange }: {
  label: string;
  page: number;
  totalPages: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}) {
  return (
    <nav aria-label={`${label} pagination`} className="flex items-center gap-2 text-[11px]">
      <label className="flex items-center gap-1.5 text-biz-muted">
        Rows
        <select aria-label={`${label} rows per page`} value={limit} onChange={(event) => onLimitChange(Number(event.target.value))} className="h-7 rounded-md border border-biz-border bg-white px-1.5 font-semibold text-biz-navy outline-none focus:border-biz-blue">
          {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <div className="flex h-7 items-center rounded-md border border-biz-border bg-white p-0.5">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="flex h-6 w-6 items-center justify-center rounded text-biz-navy transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300" aria-label={`Previous ${label} page`}><ChevronLeft className="h-3.5 w-3.5" /></button>
        <span className="min-w-[45px] px-1 text-center font-semibold tabular-nums text-biz-navy" aria-label={`Page ${page} of ${totalPages}`}>{page} / {totalPages}</span>
        <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="flex h-6 w-6 items-center justify-center rounded text-biz-navy transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300" aria-label={`Next ${label} page`}><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
    </nav>
  );
}

export default function CreditCommitmentPage() {
  useSetBreadcrumb([
    { label: "Bank Instruments" },
    { label: "Credit Commitment Charge" },
  ]);

  const [activeStep, setActiveStep] = React.useState<1 | 2>(1);
  const [activeView, setActiveView] = React.useState<"ready" | "completed">("ready");
  const [completedPage, setCompletedPage] = React.useState(1);
  const [completedLimit, setCompletedLimit] = React.useState(10);
  const [query, setQuery] = React.useState<CreditCommitmentPendingQuery>(DEFAULT_QUERY);
  const pendingQuery = usePendingCreditCommitmentTenders(query);
  const completedQuery = useCreditCommitments({ page: completedPage, limit: completedLimit });
  const bankAccounts = useBankAccounts();
  const tenderBankSettings = useTenderBankSettings();
  const createCharge = useCreateCreditCommitmentCharge();
  const defaultCharge = tenderBankSettings.data
    ? Number(tenderBankSettings.data.creditCommitmentDefaultCharge).toFixed(2)
    : "100.00";
  const [selectedTenders, setSelectedTenders] = React.useState<PendingCreditCommitmentTender[]>([]);
  const [chargeRows, setChargeRows] = React.useState<ChargeRow[]>([]);
  const [chargeBankAccountId, setChargeBankAccountId] = React.useState("");
  const [message, setMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const pendingItems = pendingQuery.data?.items ?? [];
  const meta = pendingQuery.data?.meta ?? { page: query.page ?? 1, limit: query.limit ?? 10, total: 0, totalPages: 1 };
  const availableBankAccounts = (bankAccounts.data ?? []).filter((account) => account.accountType === "BANK");
  const primeBank = availableBankAccounts.find((account) => account.bankName?.toLowerCase().includes("prime"));
  const defaultBank = primeBank ?? availableBankAccounts[0];
  const selectedBankAccountId = chargeBankAccountId || defaultBank?.id || "";
  const selectedIds = React.useMemo(() => new Set(selectedTenders.map((row) => row.id)), [selectedTenders]);
  const chargeRowIds = React.useMemo(() => new Set(chargeRows.map((row) => row.id)), [chargeRows]);
  const selectablePendingItems = pendingItems.filter((row) => !chargeRowIds.has(row.id));
  const hasInvalidChargeAmount = chargeRows.some((row) => !Number.isFinite(Number(row.chargeAmount)) || Number(row.chargeAmount) <= 0);
  const canSave = chargeRows.length > 0 && Boolean(selectedBankAccountId) && !hasInvalidChargeAmount;

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CreateCreditCommitmentFormValues>({
    resolver: zodResolver(createCreditCommitmentSchema),
    defaultValues: {
      paymentFromAccountId: "",
      paymentDate: new Date().toISOString().slice(0, 10),
      remarks: "Credit commitment charge for selected tenders.",
      items: [],
    },
  });

  function toggleRow(row: PendingCreditCommitmentTender) {
    if (chargeRowIds.has(row.id)) return;
    setSelectedTenders((current) => {
      if (current.some((item) => item.id === row.id)) return current.filter((item) => item.id !== row.id);
      return [...current, row];
    });
  }

  function toggleAll() {
    const allSelected = selectablePendingItems.length > 0 && selectablePendingItems.every((row) => selectedIds.has(row.id));
    setSelectedTenders((current) => {
      if (allSelected) {
        const currentPageIds = new Set(selectablePendingItems.map((row) => row.id));
        return current.filter((row) => !currentPageIds.has(row.id));
      }
      const existingIds = new Set(current.map((row) => row.id));
      return [...current, ...selectablePendingItems.filter((row) => !existingIds.has(row.id))];
    });
  }

  function addSelected() {
    setChargeRows((current) => {
      const existingIds = new Set(current.map((row) => row.id));
      return [
        ...current,
        ...selectedTenders.filter((row) => !existingIds.has(row.id)).map((row) => ({
          ...row,
          bankAccountId: selectedBankAccountId,
          chargeAmount: defaultCharge,
          remarks: "",
        })),
      ];
    });
    setValue("paymentFromAccountId", selectedBankAccountId, { shouldValidate: false });
    setSelectedTenders([]);
    setActiveStep(2);
  }

  function updateChargeRow(id: string, key: "chargeAmount" | "remarks", value: string) {
    setChargeRows((current) => current.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  }

  function removeChargeRow(id: string) {
    setChargeRows((current) => current.filter((row) => row.id !== id));
    if (chargeRows.length === 1) setActiveStep(1);
  }

  function changeChargeBank(bankAccountId: string) {
    setChargeBankAccountId(bankAccountId);
    setChargeRows((current) => current.map((row) => ({ ...row, bankAccountId })));
    setValue("paymentFromAccountId", bankAccountId, { shouldValidate: true });
  }

  function resetWorkspace() {
    setSelectedTenders([]);
    setChargeRows([]);
    setChargeBankAccountId("");
    setMessage(null);
    setActiveStep(1);
    setActiveView("ready");
    reset({
      paymentFromAccountId: "",
      paymentDate: new Date().toISOString().slice(0, 10),
      remarks: "Credit commitment charge for selected tenders.",
      items: [],
    });
  }

  const totalCharge = chargeRows.reduce((sum, row) => sum + Number(row.chargeAmount || 0), 0);

  async function prepareSave() {
    setMessage(null);
    setValue("paymentFromAccountId", selectedBankAccountId, { shouldValidate: true });
    setValue("items", chargeRows.map((row) => ({
      documentPurchaseId: row.id,
      bankAccountId: selectedBankAccountId,
      chargeAmount: Number(row.chargeAmount),
      remarks: row.remarks,
    })), { shouldValidate: true });
    await handleSubmit(
      async (values) => {
        try {
          await createCharge.mutateAsync(values);
          setSelectedTenders([]);
          setChargeRows([]);
          setChargeBankAccountId("");
          setActiveStep(1);
          setActiveView("completed");
          setCompletedPage(1);
          setMessage({ type: "success", text: "Credit commitment charge saved successfully." });
          reset({ paymentFromAccountId: "", paymentDate: new Date().toISOString().slice(0, 10), remarks: "Credit commitment charge for selected tenders.", items: [] });
        } catch (error) {
          setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to save credit commitment charge." });
        }
      },
      () => setMessage({ type: "error", text: "Please complete all required fields and add at least one valid charge item." }),
    )();
  }

  const firstEntry = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastEntry = Math.min(meta.page * meta.limit, meta.total);
  const completedTotal = completedQuery.data?.meta.total ?? 0;
  const completedFirstEntry = completedTotal === 0 ? 0 : (completedPage - 1) * completedLimit + 1;
  const completedLastEntry = Math.min(completedPage * completedLimit, completedTotal);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2.5 pb-3 text-biz-text xl:h-full xl:min-h-0 xl:overflow-hidden xl:pb-0">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold leading-7 tracking-tight text-biz-navy">Credit Commitment Charge</h1>
          <p className="text-[11px] text-biz-muted">Select tenders, then review and save the charge.</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-biz-border bg-white p-1 text-[11px]" aria-label="Charge workflow steps">
          <button type="button" onClick={() => setActiveStep(1)} className={cn("rounded-md px-2.5 py-1.5 font-semibold", activeStep === 1 ? "bg-biz-blue text-white" : "text-biz-muted hover:bg-slate-50")}>1 · Select tenders</button>
          <button type="button" disabled={chargeRows.length === 0} onClick={() => setActiveStep(2)} className={cn("rounded-md px-2.5 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50", activeStep === 2 ? "bg-biz-blue text-white" : "text-biz-muted hover:bg-slate-50")}>2 · Charge &amp; payment{chargeRows.length > 0 ? ` (${chargeRows.length})` : ""}</button>
        </div>
      </header>

      {message && (
        <div role="status" className={cn("shrink-0 rounded-lg border px-3 py-2 text-[12px] font-medium", message.type === "error" ? "border-red-200 bg-red-50 text-biz-danger" : "border-emerald-200 bg-emerald-50 text-biz-success")}>
          {message.text}
        </div>
      )}

      {activeStep === 1 && <section className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-xl border border-biz-border bg-white shadow-card xl:min-h-0 xl:flex-1">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-biz-border bg-slate-50/60 px-3 py-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Credit commitment records">
            <button type="button" role="tab" aria-selected={activeView === "ready"} onClick={() => setActiveView("ready")} className={cn("rounded-md px-3 py-1.5 text-[11px] font-semibold", activeView === "ready" ? "bg-white text-biz-blue shadow-sm" : "text-biz-muted hover:text-biz-navy")}>Ready to charge <span className="ml-1 rounded-full bg-blue-50 px-1.5 py-0.5">{meta.total}</span></button>
            <button type="button" role="tab" aria-selected={activeView === "completed"} onClick={() => setActiveView("completed")} className={cn("rounded-md px-3 py-1.5 text-[11px] font-semibold", activeView === "completed" ? "bg-white text-biz-blue shadow-sm" : "text-biz-muted hover:text-biz-navy")}>Completed <span className="ml-1 rounded-full bg-emerald-50 px-1.5 py-0.5">{completedQuery.data?.meta.total ?? 0}</span></button>
          </div>
          {chargeRows.length > 0 && <button type="button" onClick={() => setActiveStep(2)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-biz-blue hover:bg-blue-100">Review {chargeRows.length} prepared charge{chargeRows.length === 1 ? "" : "s"} →</button>}
        </div>

        {activeView === "ready" && <>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span className="text-[11px] text-biz-muted">Document-purchased tenders waiting for a charge</span>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button type="button" onClick={() => pendingQuery.refetch()} className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-white text-biz-blue shadow-sm transition-colors hover:bg-blue-50" aria-label="Refresh" title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
            <label className="relative block flex-1 sm:w-[220px] sm:flex-none">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-biz-muted" />
              <input value={query.search ?? ""} onChange={(event) => setQuery({ ...query, page: 1, search: event.target.value })} placeholder="Search Tender ID, work or organization..." className="h-9 w-full rounded-lg border border-biz-border bg-white pl-8 pr-3 text-[11px] outline-none transition-shadow focus:border-biz-blue focus:ring-2 focus:ring-blue-100" />
            </label>
          </div>
        </div>

        {pendingQuery.isError && <div className="border-t border-red-100 bg-red-50 px-5 py-2.5 text-[11px] font-medium text-biz-danger">Failed to load pending tenders. Check the API connection and refresh.</div>}
        <div className="hidden min-h-0 flex-1 overflow-auto border-t border-biz-border md:block">
          <table className="w-full min-w-[960px] text-[11px]">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-biz-muted">
              <tr className="border-b border-biz-border">
                <th className="w-10 px-4 py-2 text-left"><Checkbox checked={selectablePendingItems.length > 0 && selectablePendingItems.every((row) => selectedIds.has(row.id))} onChange={toggleAll} label="Select all available tenders on this page" disabled={selectablePendingItems.length === 0} /></th>
                <th className="w-12 px-3 py-2 text-left">SL</th><th className="px-3 py-2 text-left">Tender ID</th><th className="px-3 py-2 text-left">Organization</th><th className="px-3 py-2 text-left">Work / Tender Name</th><th className="px-3 py-2 text-left">Submission Deadline</th><th className="px-4 py-2 text-right">Estimated Tender Amount (৳)</th>
              </tr>
            </thead>
            <tbody>
              {pendingQuery.isLoading ? <TableSkeleton columns={7} /> : pendingItems.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-[12px] font-medium text-biz-muted"><p>{query.search ? "No tenders match your search." : "No tenders are ready to charge right now."}</p>{!query.search && <button type="button" onClick={() => setActiveView("completed")} className="mt-2 font-semibold text-biz-blue hover:underline">View completed charges</button>}</td></tr>
              ) : pendingItems.map((row, index) => (
                <tr key={row.id} onClick={() => toggleRow(row)} className={cn("border-b border-biz-border transition-colors last:border-0", chargeRowIds.has(row.id) ? "bg-slate-50" : "cursor-pointer hover:bg-blue-50/50")}>
                  <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}><Checkbox checked={selectedIds.has(row.id)} onChange={() => toggleRow(row)} label={chargeRowIds.has(row.id) ? `${row.tenderId ?? row.tenderWorkName} is already in the charge list` : `Select ${row.tenderId ?? row.tenderWorkName}`} disabled={chargeRowIds.has(row.id)} /></td>
                  <td className="px-3 py-2">{(meta.page - 1) * meta.limit + index + 1}</td><td className="px-3 py-2 font-semibold text-biz-navy">{row.tenderId ?? "Manual"}</td><td className="px-3 py-2 font-semibold">{row.organizationMaster.shortName}</td><td className="max-w-[420px] px-3 py-2"><span className="line-clamp-2 leading-4" title={row.tenderWorkName}>{row.tenderWorkName}</span>{chargeRowIds.has(row.id) && <span className="ml-2 rounded bg-biz-success-soft px-2 py-0.5 text-[10px] font-semibold text-biz-success">Added</span>}</td><td className="px-3 py-2">{row.submissionDeadline ? displayDate(row.submissionDeadline) : "—"}</td><td className="px-4 py-2 text-right font-semibold">{money(row.estimatedTenderAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-biz-border md:hidden">
          {pendingQuery.isLoading ? <p className="p-5 text-center text-[12px] text-biz-muted">Loading tenders...</p> : pendingItems.length === 0 ? <div className="flex flex-col items-center gap-2 p-8 text-center"><p className="text-[12px] font-medium text-biz-muted">{query.search ? "No tenders match your search." : "No tenders are ready to charge right now."}</p>{!query.search && <button type="button" onClick={() => setActiveView("completed")} className="text-[12px] font-semibold text-biz-blue hover:underline">View completed charges</button>}</div> : pendingItems.map((row) => <div key={row.id} className="flex gap-3 border-b border-biz-border p-3 last:border-0"><div className="pt-1"><Checkbox checked={selectedIds.has(row.id)} onChange={() => toggleRow(row)} label={`Select ${row.tenderId ?? row.tenderWorkName}`} disabled={chargeRowIds.has(row.id)} /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="font-semibold text-biz-navy">{row.tenderId ?? "Manual"}</span><span className="text-[11px] font-semibold tabular-nums">৳{money(row.estimatedTenderAmount)}</span></div><p className="mt-1 text-[12px] font-medium" title={row.tenderWorkName}>{row.tenderWorkName}</p><p className="mt-1 text-[11px] text-biz-muted">{row.organizationMaster.shortName} · {row.submissionDeadline ? displayDate(row.submissionDeadline) : "No deadline"}</p>{chargeRowIds.has(row.id) && <span className="mt-1 inline-block rounded bg-biz-success-soft px-2 py-0.5 text-[10px] font-semibold text-biz-success">Added to charge</span>}</div></div>)}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-biz-border bg-slate-50/40 px-3 py-1 text-[11px]">
          <span className="tabular-nums text-biz-muted">{firstEntry}–{lastEntry} of {meta.total} entries</span>
          {selectedIds.size > 0 && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <span className="flex h-7 items-center justify-center rounded-md border border-blue-100 bg-white px-2.5 font-semibold text-biz-blue">{selectedIds.size} Selected</span>
            <button type="button" onClick={() => setSelectedTenders([])} className="flex h-7 items-center justify-center gap-1 rounded-md border border-biz-border bg-white px-2.5 font-semibold text-biz-navy transition-colors hover:bg-biz-bg"><CircleX className="h-3 w-3" />Clear</button>
            <button type="button" onClick={addSelected} className="flex h-7 items-center justify-center gap-1 rounded-md bg-biz-blue px-2.5 font-semibold text-white transition-colors hover:bg-biz-blue-hover"><Plus className="h-3 w-3" />Charge selected</button>
          </div>}
          <PaginationControls label="Ready tenders" page={meta.page} totalPages={meta.totalPages} limit={query.limit ?? 10} onPageChange={(page) => setQuery((current) => ({ ...current, page }))} onLimitChange={(limit) => setQuery((current) => ({ ...current, page: 1, limit }))} />
        </div>
        </>}

        {activeView === "completed" && <>
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-[11px] text-biz-muted"><span>Saved credit commitment charges</span><button type="button" onClick={() => completedQuery.refetch()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-biz-border bg-white px-2.5 font-semibold text-biz-blue hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button></div>
          {completedQuery.isError && <div className="border-t border-red-100 bg-red-50 px-3 py-2 text-[11px] text-biz-danger">Failed to load completed charges. Please refresh.</div>}
          <div className="hidden min-h-0 flex-1 overflow-auto border-t border-biz-border md:block">
            <table className="w-full min-w-[760px] text-[11px]">
              <thead className="bg-emerald-50/40 text-[10px] font-bold uppercase tracking-wide text-biz-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Reference</th>
                  <th className="px-3 py-2 text-left">Payment Date</th>
                  <th className="px-3 py-2 text-left">Tender ID</th>
                  <th className="px-3 py-2 text-center">Tenders</th>
                  <th className="px-3 py-2 text-right">Total Charge</th>
                  <th className="px-4 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {completedQuery.isLoading ? (
                  <tr><td colSpan={6} className="px-4 py-7 text-center text-biz-muted">Loading completed charges...</td></tr>
                ) : (completedQuery.data?.items.length ?? 0) === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-7 text-center text-biz-muted">No completed charges yet.</td></tr>
                ) : completedQuery.data?.items.map((charge) => (
                  <tr key={charge.id} className="border-t border-biz-border transition-colors hover:bg-emerald-50/30">
                    <td className="px-4 py-2 font-semibold text-biz-navy">{charge.id.slice(-8).toUpperCase()}</td>
                    <td className="px-3 py-2">{charge.paymentDate ? displayDate(charge.paymentDate) : "Not set"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {charge.items.map((item) => (
                          <span key={item.id} className="whitespace-nowrap rounded-md bg-blue-50 px-2 py-1 font-semibold text-biz-blue">
                            {item.tenderId}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">{charge.items.length}</td>
                    <td className="px-3 py-2 text-right font-bold text-biz-navy">{money(charge.totalAmount)}</td>
                    <td className="px-4 py-2 text-center"><span className="rounded-full bg-biz-success-soft px-2.5 py-1 font-semibold text-biz-success">Completed</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-biz-border md:hidden">
            {completedQuery.isLoading ? <p className="p-5 text-center text-[12px] text-biz-muted">Loading completed charges...</p> : (completedQuery.data?.items.length ?? 0) === 0 ? <p className="p-8 text-center text-[12px] text-biz-muted">No completed charges yet.</p> : completedQuery.data?.items.map((charge) => <div key={charge.id} className="border-b border-biz-border p-3 text-[12px] last:border-0"><div className="flex justify-between gap-2"><span className="font-semibold text-biz-navy">#{charge.id.slice(-8).toUpperCase()}</span><span className="font-bold tabular-nums text-biz-navy">৳{money(charge.totalAmount)}</span></div><p className="mt-1 text-biz-muted">{charge.paymentDate ? displayDate(charge.paymentDate) : "No payment date"} · {charge.items.length} tender{charge.items.length === 1 ? "" : "s"}</p><div className="mt-2 flex flex-wrap gap-1">{charge.items.map((item) => <span key={item.id} className="rounded bg-blue-50 px-2 py-1 font-semibold text-biz-blue">{item.tenderId}</span>)}</div></div>)}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-biz-border bg-slate-50/40 px-3 py-1 text-[11px]">
            <span className="tabular-nums text-biz-muted">{completedFirstEntry}–{completedLastEntry} of {completedTotal} entries</span>
            <PaginationControls label="Completed charges" page={completedPage} totalPages={completedQuery.data?.meta.totalPages ?? 1} limit={completedLimit} onPageChange={setCompletedPage} onLimitChange={(limit) => { setCompletedLimit(limit); setCompletedPage(1); }} />
          </div>
        </>}
      </section>}

      {activeStep === 2 && <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-biz-border bg-white shadow-card xl:flex-1">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-biz-border bg-slate-50/60 px-3 py-2">
          <div><h2 className="text-[14px] font-bold text-biz-navy">Charge &amp; Payment Details</h2><p className="text-[11px] text-biz-muted">Review the account, payment date and tender charges before saving.</p></div>
          <button type="button" onClick={() => setActiveStep(1)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-biz-border bg-white px-3 text-[11px] font-semibold text-biz-navy hover:bg-slate-50"><ChevronLeft className="h-3.5 w-3.5" /> Back to tenders</button>
        </div>

        {chargeRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center border-t border-blue-100 bg-gradient-to-b from-white to-slate-50/60 px-4 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-blue-100 bg-biz-blue-soft text-biz-blue shadow-sm"><Plus className="h-4 w-4" /></span>
            <p className="mt-2 text-[12px] font-semibold text-biz-navy">No tender added yet</p>
            <p className="mt-1 max-w-[430px] text-[11px] text-biz-muted">Select one or more pending tenders above, then click “Add Selected to Charge List”.</p>
          </div>
        ) : (
          <>
            <div className="shrink-0 bg-white px-3 py-3">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.15fr_0.65fr_1fr]">
                <label className="block"><span className="mb-1 block text-[11px] font-semibold text-biz-navy">Bank Account <span className="text-biz-danger">*</span></span><span className="relative block"><Landmark className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" /><select value={selectedBankAccountId} onChange={(event) => changeChargeBank(event.target.value)} className="h-10 w-full rounded-md border border-biz-border bg-white pl-9 pr-3 text-[12px] outline-none focus:border-biz-blue"><option value="">Select bank account</option>{availableBankAccounts.map((account) => <option key={account.id} value={account.id}>{account.bankName ?? account.accountName}{account.accountNumber ? ` — ${account.accountNumber}` : ""}</option>)}</select></span>{errors.paymentFromAccountId && <span className="mt-1 block text-[10px] text-biz-danger">{errors.paymentFromAccountId.message}</span>}</label>
                <label className="block"><span className="mb-1 block text-[11px] font-semibold text-biz-navy">Payment Date <span className="text-biz-danger">*</span></span><span className="relative block"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" /><input type="date" {...register("paymentDate")} className="h-10 w-full rounded-md border border-biz-border bg-white pl-9 pr-3 text-[12px] outline-none focus:border-biz-blue" /></span>{errors.paymentDate && <span className="mt-1 block text-[10px] text-biz-danger">{errors.paymentDate.message}</span>}</label>
                <label className="block"><span className="mb-1 block text-[11px] font-semibold text-biz-navy">Overall Remarks (optional)</span><input {...register("remarks")} placeholder="Credit commitment charge for selected tenders." className="h-10 w-full rounded-md border border-biz-border bg-white px-3 text-[12px] outline-none focus:border-biz-blue" /></label>
              </div>
              <div className="mt-2 flex items-start gap-2 text-[10px] text-biz-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-biz-blue" />
                <p>This account will be recorded as both the charge bank and payment account. Each tender starts with the configured ৳{money(defaultCharge)} charge; edit only exceptions in its row.</p>
              </div>
            </div>

            <div className="hidden min-h-0 flex-1 overflow-auto border-t border-biz-border lg:block">
              <table className="w-full min-w-[900px] text-[11px]">
                <thead className="bg-[#f6f8fb] text-[10px] font-bold uppercase tracking-wide text-biz-muted"><tr className="border-b border-biz-border">{["SL", "Tender ID", "Organization", "Work / Tender Name", "Charge Amount (৳)", "Remarks (optional)", "Action"].map((header) => <th key={header} className={cn("px-3 py-2 text-left", header === "Action" && "text-center")}>{header}</th>)}</tr></thead>
                <tbody>
                  {chargeRows.map((row, index) => (
                    <tr key={row.id} className="border-b border-biz-border transition-colors last:border-0 hover:bg-blue-50/30">
                      <td className="px-3 py-2">{index + 1}</td><td className="px-3 py-2 font-semibold text-biz-navy">{row.tenderId ?? "Manual"}</td><td className="px-3 py-2 font-semibold">{row.organizationMaster.shortName}</td><td className="max-w-[360px] px-3 py-2"><p className="line-clamp-2 leading-4" title={row.tenderWorkName}>{row.tenderWorkName}</p></td>
                      <td className="px-3 py-1.5"><input type="number" min="0.01" step="0.01" value={row.chargeAmount} onChange={(event) => updateChargeRow(row.id, "chargeAmount", event.target.value)} className="h-8 w-28 rounded border border-biz-border px-2 text-right text-[11px] outline-none focus:border-biz-blue" /></td>
                      <td className="px-3 py-1.5"><input value={row.remarks} onChange={(event) => updateChargeRow(row.id, "remarks", event.target.value)} placeholder="Enter remarks" className="h-8 w-full min-w-[150px] rounded border border-biz-border px-2 text-[11px] outline-none focus:border-biz-blue" /></td>
                      <td className="px-3 py-1.5 text-center"><button type="button" onClick={() => removeChargeRow(row.id)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-biz-border bg-white text-biz-danger hover:bg-biz-danger-soft" aria-label={`Remove ${row.tenderId ?? row.tenderWorkName}`} title="Remove"><Trash2 className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-biz-border lg:hidden">
              {chargeRows.map((row, index) => <div key={row.id} className="border-b border-biz-border p-3 last:border-0"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[12px] font-semibold text-biz-navy">{index + 1}. {row.tenderId ?? "Manual"} · {row.organizationMaster.shortName}</p><p className="mt-1 text-[12px]" title={row.tenderWorkName}>{row.tenderWorkName}</p></div><button type="button" onClick={() => removeChargeRow(row.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-biz-border text-biz-danger" aria-label={`Remove ${row.tenderId ?? row.tenderWorkName}`}><Trash2 className="h-3.5 w-3.5" /></button></div><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><label className="text-[11px] font-semibold text-biz-muted">Charge amount (BDT)<input type="number" min="0.01" step="0.01" value={row.chargeAmount} onChange={(event) => updateChargeRow(row.id, "chargeAmount", event.target.value)} className="mt-1 h-9 w-full rounded border border-biz-border px-2 text-right text-[12px] text-biz-navy" /></label><label className="text-[11px] font-semibold text-biz-muted">Remarks (optional)<input value={row.remarks} onChange={(event) => updateChargeRow(row.id, "remarks", event.target.value)} placeholder="Enter remarks" className="mt-1 h-9 w-full rounded border border-biz-border px-2 text-[12px] text-biz-navy" /></label></div></div>)}
            </div>
            {errors.items && <p className="px-4 pt-2 text-[11px] text-biz-danger">{errors.items.message}</p>}
            <div className="flex shrink-0 flex-col gap-2 border-t border-biz-border bg-slate-50/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center justify-between gap-3 text-[12px] sm:justify-start"><span className="text-biz-muted">{chargeRows.length} tender{chargeRows.length === 1 ? "" : "s"} · Total charge</span><strong className="text-[15px] tabular-nums text-biz-success">৳{money(totalCharge)}</strong></div>
              <div className="flex gap-2"><button type="button" onClick={resetWorkspace} className="h-9 flex-1 rounded-md border border-biz-border bg-white px-4 text-[12px] font-semibold text-biz-navy hover:bg-biz-bg sm:flex-none">Reset</button><button type="button" disabled={createCharge.isPending || !canSave} onClick={prepareSave} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-biz-blue px-4 text-[12px] font-semibold text-white hover:bg-biz-blue-hover disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"><Save className="h-4 w-4" />{createCharge.isPending ? "Saving..." : !selectedBankAccountId ? "Select Bank Account" : hasInvalidChargeAmount ? "Check Amounts" : "Save charges"}</button></div>
            </div>
          </>
        )}
      </section>}
    </div>
  );
}
