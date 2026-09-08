"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { SuccessPopup } from "@/components/layout/SuccessPopup";

type ChargeRow = PendingCreditCommitmentTender & {
  bankAccountId: string;
  chargeAmount: string;
  remarks: string;
};

const DEFAULT_QUERY: CreditCommitmentPendingQuery = { page: 1, limit: 5 };

function money(value: number | string) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

export default function CreditCommitmentPage() {
  const router = useRouter();
  useSetBreadcrumb([
    { label: "Bank Instruments" },
    { label: "Credit Commitment", href: "/bank-instruments/credit-commitment" },
    { label: "Add Credit Commitment Charge" },
  ]);

  const chargeSectionRef = React.useRef<HTMLElement>(null);
  const [query, setQuery] = React.useState<CreditCommitmentPendingQuery>(DEFAULT_QUERY);
  const pendingQuery = usePendingCreditCommitmentTenders(query);
  const completedQuery = useCreditCommitments({ page: 1, limit: 5 });
  const [historyOpen, setHistoryOpen] = React.useState(false);
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
  const meta = pendingQuery.data?.meta ?? { page: query.page ?? 1, limit: 5, total: 0, totalPages: 1 };
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
    window.setTimeout(() => chargeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function updateChargeRow(id: string, key: "chargeAmount" | "remarks", value: string) {
    setChargeRows((current) => current.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  }

  function removeChargeRow(id: string) {
    setChargeRows((current) => current.filter((row) => row.id !== id));
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
          setMessage({ type: "success", text: "Credit commitment charge saved successfully." });
          setSelectedTenders([]);
          setChargeRows([]);
          setChargeBankAccountId("");
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

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 overflow-x-hidden pb-4 text-biz-text">
      <SuccessPopup
        open={message?.type === "success"}
        title="Credit Commitment Charge Saved"
        message={message?.text ?? ""}
        onClose={() => setMessage(null)}
        primaryLabel="Go to PG / BG"
        onPrimary={() => {
          setMessage(null);
          router.push("/bank-instruments/pg-bg");
        }}
        secondaryLabel="Stay on This Page"
        onSecondary={() => setMessage(null)}
      />
      <div className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-r from-white via-blue-50/60 to-emerald-50/40 px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div className="absolute inset-y-0 left-0 w-1 bg-biz-blue" />
        <h1 className="text-[22px] font-bold leading-7 tracking-[-0.02em] text-biz-navy">Credit Commitment Charge</h1>
        <p className="mt-1 whitespace-normal break-words text-[12px] leading-5 text-biz-muted">Select tenders, then review the charge and payment details before saving.</p>
      </div>

      <div className="grid overflow-hidden rounded-2xl border border-blue-200/80 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.05)] sm:grid-cols-2">
        {[
          { number: 1, title: "Select Tenders", description: "Choose only the tenders you want to charge", active: true },
          { number: 2, title: "Charge & Payment", description: chargeRows.length > 0 ? `Review ${chargeRows.length} tender${chargeRows.length === 1 ? "" : "s"}, account and final total` : "Add selected tenders to continue", active: chargeRows.length > 0 },
        ].map((step, index) => (
          <div key={step.number} className={cn("flex items-center gap-3 px-5 py-3.5 transition-colors", index === 0 && "border-b border-blue-100 sm:border-b-0 sm:border-r", step.active ? "bg-gradient-to-r from-blue-50/80 to-white" : "bg-slate-50/70")}>
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", step.active ? "bg-biz-blue text-white shadow-[0_4px_10px_rgba(37,99,235,0.2)]" : "border border-biz-border bg-white text-biz-muted")}>{step.number}</span>
            <div className="min-w-0"><p className={cn("text-[12px] font-bold", step.active ? "text-biz-navy" : "text-biz-muted")}>{step.title}</p><p className="mt-1 whitespace-normal break-words text-[10px] leading-4 text-biz-muted">{step.description}</p></div>
          </div>
        ))}
      </div>

      {message?.type === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] font-medium text-biz-danger shadow-sm">
          {message.text}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-blue-200/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-blue-50/90 via-white to-white px-5 py-3.5">
          <h2 className="text-[15px] font-bold tracking-[-0.01em] text-biz-navy">1. Pending Tenders (Not Charged Yet) <span className="ml-2 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] text-biz-blue">{meta.total}</span></h2>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button type="button" onClick={() => pendingQuery.refetch()} className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-white text-biz-blue shadow-sm transition-colors hover:bg-blue-50" aria-label="Refresh" title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
            <label className="relative block flex-1 sm:w-[220px] sm:flex-none">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-biz-muted" />
              <input value={query.search ?? ""} onChange={(event) => setQuery({ ...query, page: 1, search: event.target.value })} placeholder="Search Tender ID, work or organization..." className="h-9 w-full rounded-lg border border-biz-border bg-white pl-8 pr-3 text-[11px] outline-none transition-shadow focus:border-biz-blue focus:ring-2 focus:ring-blue-100" />
            </label>
          </div>
        </div>

        {pendingQuery.isError && <div className="border-t border-red-100 bg-red-50 px-5 py-2.5 text-[11px] font-medium text-biz-danger">Failed to load pending tenders. Check the API connection and refresh.</div>}
        <div className="overflow-x-auto border-t border-blue-100">
          <table className="w-full min-w-[960px] text-[11px]">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-biz-muted">
              <tr className="border-b border-biz-border">
                <th className="w-10 px-4 py-2 text-left"><Checkbox checked={selectablePendingItems.length > 0 && selectablePendingItems.every((row) => selectedIds.has(row.id))} onChange={toggleAll} label="Select all available tenders on this page" disabled={selectablePendingItems.length === 0} /></th>
                <th className="w-12 px-3 py-2 text-left">SL</th><th className="px-3 py-2 text-left">Tender ID</th><th className="px-3 py-2 text-left">Organization</th><th className="px-3 py-2 text-left">Work / Tender Name</th><th className="px-3 py-2 text-left">Submission Deadline</th><th className="px-4 py-2 text-right">Estimated Tender Amount (৳)</th>
              </tr>
            </thead>
            <tbody>
              {pendingQuery.isLoading ? <TableSkeleton columns={7} /> : pendingItems.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-[12px] font-medium text-biz-muted">No pending tenders found.</td></tr>
              ) : pendingItems.map((row, index) => (
                <tr key={row.id} onClick={() => toggleRow(row)} className={cn("border-b border-biz-border transition-colors last:border-0", chargeRowIds.has(row.id) ? "bg-slate-50" : "cursor-pointer hover:bg-blue-50/50")}>
                  <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}><Checkbox checked={selectedIds.has(row.id)} onChange={() => toggleRow(row)} label={chargeRowIds.has(row.id) ? `${row.tenderId ?? row.tenderWorkName} is already in the charge list` : `Select ${row.tenderId ?? row.tenderWorkName}`} disabled={chargeRowIds.has(row.id)} /></td>
                  <td className="px-3 py-2">{(meta.page - 1) * meta.limit + index + 1}</td><td className="px-3 py-2 font-semibold text-biz-navy">{row.tenderId ?? "Manual"}</td><td className="px-3 py-2 font-semibold">{row.organizationMaster.shortName}</td><td className="max-w-[420px] px-3 py-2"><span className="line-clamp-2 leading-4" title={row.tenderWorkName}>{row.tenderWorkName}</span>{chargeRowIds.has(row.id) && <span className="ml-2 rounded bg-biz-success-soft px-2 py-0.5 text-[10px] font-semibold text-biz-success">Added</span>}</td><td className="px-3 py-2">{row.submissionDeadline ? displayDate(row.submissionDeadline) : "—"}</td><td className="px-4 py-2 text-right font-semibold">{money(row.estimatedTenderAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col items-stretch gap-3 border-t border-blue-100 bg-gradient-to-r from-blue-50/60 to-slate-50/60 px-5 py-3 text-[11px] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <span className="text-biz-muted">Showing {firstEntry} to {lastEntry} of {meta.total} entries</span>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <span className="flex h-8 items-center justify-center rounded-lg border border-blue-100 bg-white px-3 font-semibold text-biz-blue shadow-sm">{selectedIds.size} Selected</span>
            <button type="button" disabled={selectedIds.size === 0} onClick={() => setSelectedTenders([])} className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-biz-border bg-white px-3 font-semibold text-biz-navy transition-colors hover:bg-biz-bg disabled:cursor-not-allowed disabled:opacity-40"><CircleX className="h-3.5 w-3.5" />Clear Selection</button>
            <button type="button" disabled={selectedIds.size === 0} onClick={addSelected} className="col-span-2 flex h-8 items-center justify-center gap-1.5 rounded-lg bg-biz-blue px-3 font-semibold text-white shadow-[0_5px_12px_rgba(37,99,235,0.18)] transition-colors hover:bg-biz-blue-hover disabled:cursor-not-allowed disabled:opacity-50 sm:col-auto"><Plus className="h-3.5 w-3.5" />Charge Selected</button>
          </div>
          <div className="flex items-center justify-end gap-1">
            <button type="button" disabled={meta.page <= 1} onClick={() => setQuery({ ...query, page: meta.page - 1 })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-100 bg-white transition-colors hover:bg-blue-50 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
            {Array.from({ length: Math.min(meta.totalPages, 4) }, (_, index) => index + 1).map((page) => <button type="button" key={page} onClick={() => setQuery({ ...query, page })} className={cn("h-8 min-w-8 rounded-lg border px-2 font-semibold", page === meta.page ? "border-biz-blue bg-biz-blue text-white shadow-sm" : "border-blue-100 bg-white text-biz-navy hover:bg-blue-50")}>{page}</button>)}
            <button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setQuery({ ...query, page: meta.page + 1 })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-100 bg-white transition-colors hover:bg-blue-50 disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 bg-gradient-to-r from-emerald-50/80 via-white to-white px-5 py-3.5 text-left transition-colors hover:from-emerald-50"
        >
          <span className="text-[15px] font-bold tracking-[-0.01em] text-biz-navy">
            Completed Credit Commitment Charges
            <span className="ml-2 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] text-biz-success">
              {completedQuery.data?.meta.total ?? 0}
            </span>
          </span>
          <span className="text-[11px] font-semibold text-biz-blue">
            {historyOpen ? "Hide History" : "View History"}
          </span>
        </button>
        {historyOpen && (
          <div className="overflow-x-auto border-t border-emerald-100">
            <table className="w-full min-w-[620px] text-[11px]">
              <thead className="bg-emerald-50/40 text-[10px] font-bold uppercase tracking-wide text-biz-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Reference</th>
                  <th className="px-3 py-2 text-left">Payment Date</th>
                  <th className="px-3 py-2 text-center">Tenders</th>
                  <th className="px-3 py-2 text-right">Total Charge</th>
                  <th className="px-4 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {completedQuery.isLoading ? (
                  <tr><td colSpan={5} className="px-4 py-7 text-center text-biz-muted">Loading completed charges...</td></tr>
                ) : (completedQuery.data?.items.length ?? 0) === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-7 text-center text-biz-muted">No completed charges yet.</td></tr>
                ) : completedQuery.data?.items.map((charge) => (
                  <tr key={charge.id} className="border-t border-biz-border transition-colors hover:bg-emerald-50/30">
                    <td className="px-4 py-2 font-semibold text-biz-navy">{charge.id.slice(-8).toUpperCase()}</td>
                    <td className="px-3 py-2">{charge.paymentDate ? displayDate(charge.paymentDate) : "Not set"}</td>
                    <td className="px-3 py-2 text-center">{charge.items.length}</td>
                    <td className="px-3 py-2 text-right font-bold text-biz-navy">{money(charge.totalAmount)}</td>
                    <td className="px-4 py-2 text-center"><span className="rounded-full bg-biz-success-soft px-2.5 py-1 font-semibold text-biz-success">Completed</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section ref={chargeSectionRef} className="overflow-hidden rounded-2xl border border-blue-200/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="bg-gradient-to-r from-slate-50 via-white to-blue-50/50 px-5 py-3.5">
          <h2 className="text-[15px] font-bold tracking-[-0.01em] text-biz-navy">2. Charge &amp; Payment Details</h2>
          <p className="mt-1 text-[11px] leading-4 text-biz-muted">Choose one bank account, review each tender charge and confirm the payment details.</p>
        </div>

        {chargeRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center border-t border-blue-100 bg-gradient-to-b from-white to-slate-50/60 px-4 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-blue-100 bg-biz-blue-soft text-biz-blue shadow-sm"><Plus className="h-4 w-4" /></span>
            <p className="mt-2 text-[12px] font-semibold text-biz-navy">No tender added yet</p>
            <p className="mt-1 max-w-[430px] text-[11px] text-biz-muted">Select one or more pending tenders above, then click “Add Selected to Charge List”.</p>
          </div>
        ) : (
          <>
            <div className="border-t border-blue-100 bg-gradient-to-r from-blue-50/60 to-white px-5 py-4">
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

            <div className="overflow-x-auto border-t border-blue-100">
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
            {errors.items && <p className="px-4 pt-2 text-[11px] text-biz-danger">{errors.items.message}</p>}
            <div className="flex flex-col gap-3 border-t border-biz-border px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
              <div className="grid w-full min-w-0 grid-cols-[0.8fr_1.5fr] overflow-hidden rounded-md border border-biz-border bg-[#F7FAFF] text-center sm:w-auto sm:min-w-[390px]">
                <div className="border-r border-biz-border px-4 py-2.5"><p className="text-[10px] font-semibold text-biz-muted">Total Tenders</p><p className="mt-0.5 text-[16px] font-bold text-biz-navy">{chargeRows.length}</p></div>
                <div className="px-4 py-2.5"><p className="text-[10px] font-semibold text-biz-muted">Total Credit Commitment Charge (৳)</p><p className="mt-0.5 text-[16px] font-bold text-biz-success">{money(totalCharge)}</p></div>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-biz-border bg-[#fafbfd] px-4 py-2.5 sm:flex-row sm:justify-end">
              <button type="button" onClick={resetWorkspace} className="h-9 w-full rounded-md border border-biz-border bg-white px-5 text-[12px] font-semibold text-biz-navy hover:bg-biz-bg sm:w-auto">Reset</button>
              <button type="button" disabled={createCharge.isPending || !canSave} onClick={prepareSave} className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-biz-blue px-5 text-[12px] font-semibold text-white hover:bg-biz-blue-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"><Save className="h-4 w-4" />{createCharge.isPending ? "Saving..." : !selectedBankAccountId ? "Select a Bank Account to Continue" : hasInvalidChargeAmount ? "Enter Valid Charge Amounts" : `Save Charge for ${chargeRows.length} Tender${chargeRows.length === 1 ? "" : "s"} — ৳${money(totalCharge)}`}</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
