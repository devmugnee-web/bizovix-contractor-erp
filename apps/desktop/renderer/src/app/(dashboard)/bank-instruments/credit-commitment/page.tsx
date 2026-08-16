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
  Filter,
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

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onChange}
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded border transition-colors",
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
  useSetBreadcrumb([
    { label: "Bank Instruments" },
    { label: "Credit Commitment", href: "/bank-instruments/credit-commitment" },
    { label: "Add Credit Commitment Charge" },
  ]);

  const pendingSectionRef = React.useRef<HTMLElement>(null);
  const [query, setQuery] = React.useState<CreditCommitmentPendingQuery>(DEFAULT_QUERY);
  const pendingQuery = usePendingCreditCommitmentTenders(query);
  const bankAccounts = useBankAccounts();
  const tenderBankSettings = useTenderBankSettings();
  const createCharge = useCreateCreditCommitmentCharge();
  const defaultCharge = tenderBankSettings.data
    ? Number(tenderBankSettings.data.creditCommitmentDefaultCharge).toFixed(2)
    : "100.00";
  const [selectedState, setSelectedState] = React.useState<Set<string> | null>(null);
  const [chargeRowsState, setChargeRowsState] = React.useState<ChargeRow[] | null>(null);
  const [message, setMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const pendingItems = pendingQuery.data?.items ?? [];
  const meta = pendingQuery.data?.meta ?? { page: query.page ?? 1, limit: 5, total: 0, totalPages: 1 };
  const primeBank = bankAccounts.data?.find((account) => account.bankName?.toLowerCase().includes("prime"));
  const defaultBank = primeBank ?? bankAccounts.data?.find((account) => account.accountType === "BANK") ?? bankAccounts.data?.[0];
  const initialRows = pendingItems.slice(0, 3);
  const selectedIds = selectedState ?? new Set(initialRows.map((row) => row.id));
  const chargeRows = chargeRowsState ?? initialRows.map((row) => ({
    ...row,
    bankAccountId: defaultBank?.id ?? "",
    chargeAmount: defaultCharge,
    remarks: "",
  }));

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
      paymentDate: "2024-05-13",
      remarks: "Credit commitment charge for selected tenders.",
      items: [],
    },
  });

  function toggleRow(row: PendingCreditCommitmentTender) {
    setSelectedState((current) => {
      const next = new Set(current ?? selectedIds);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  function toggleAll() {
    const allSelected = pendingItems.length > 0 && pendingItems.every((row) => selectedIds.has(row.id));
    setSelectedState(allSelected ? new Set() : new Set(pendingItems.map((row) => row.id)));
  }

  function addSelected() {
    const additions = pendingItems.filter((row) => selectedIds.has(row.id));
    setChargeRowsState((current) => {
      const existing = current ?? chargeRows;
      const existingIds = new Set(existing.map((row) => row.id));
      return [
        ...existing,
        ...additions.filter((row) => !existingIds.has(row.id)).map((row) => ({
          ...row,
          bankAccountId: defaultBank?.id ?? "",
          chargeAmount: defaultCharge,
          remarks: "",
        })),
      ];
    });
  }

  function updateChargeRow(id: string, key: "bankAccountId" | "chargeAmount" | "remarks", value: string) {
    setChargeRowsState(chargeRows.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  }

  function removeChargeRow(id: string) {
    setChargeRowsState(chargeRows.filter((row) => row.id !== id));
  }

  const totalCharge = chargeRows.reduce((sum, row) => sum + Number(row.chargeAmount || 0), 0);

  async function prepareSave() {
    setMessage(null);
    setValue("items", chargeRows.map((row) => ({
      documentPurchaseId: row.id,
      bankAccountId: row.bankAccountId,
      chargeAmount: Number(row.chargeAmount),
      remarks: row.remarks,
    })), { shouldValidate: true });
    await handleSubmit(
      async (values) => {
        try {
          await createCharge.mutateAsync(values);
          setMessage({ type: "success", text: "Credit commitment charge saved successfully." });
          setSelectedState(new Set());
          setChargeRowsState([]);
          reset({ paymentFromAccountId: "", paymentDate: "2024-05-13", remarks: "", items: [] });
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
    <div className="flex flex-col gap-3 text-biz-text">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-[23px] font-bold leading-7 text-biz-navy">Credit Commitment Charge</h1>
          <p className="mt-0.5 text-[12px] text-biz-muted">Select one or more tenders to record credit commitment charge.</p>
        </div>
        <div className="flex max-w-[430px] items-start gap-2 rounded-md border border-biz-blue/10 bg-biz-blue-soft px-3 py-2.5 text-[11px] text-biz-navy">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-biz-blue" />
          <div><p className="font-semibold">Default charge is ৳100 per tender.</p><p className="mt-0.5 text-biz-muted">You can edit amount if bank charges more (e.g. ৳200).</p></div>
        </div>
      </div>

      {message && (
        <div className={cn("rounded-md border px-3 py-2 text-[12px] font-medium", message.type === "success" ? "border-biz-success/20 bg-biz-success-soft text-biz-success" : "border-biz-danger/20 bg-biz-danger-soft text-biz-danger")}>{message.text}</div>
      )}

      <section ref={pendingSectionRef} className="overflow-hidden rounded-md border border-biz-border bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-[14px] font-bold text-biz-navy">1. Pending Tenders (Not Charged Yet) <span className="ml-2 rounded bg-biz-blue-soft px-2 py-1 text-[11px] text-biz-blue">{meta.total}</span></h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => pendingQuery.refetch()} className="flex h-8 w-8 items-center justify-center rounded border border-biz-border bg-white text-biz-navy hover:bg-biz-bg" aria-label="Refresh" title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
            <button type="button" className="flex h-8 items-center gap-1.5 rounded border border-biz-border bg-white px-3 text-[11px] font-semibold text-biz-navy"><Filter className="h-3.5 w-3.5" />Filter</button>
            <label className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-biz-muted" />
              <input value={query.search ?? ""} onChange={(event) => setQuery({ ...query, page: 1, search: event.target.value })} placeholder="Search tender..." className="h-8 w-[190px] rounded border border-biz-border bg-white pl-8 pr-3 text-[11px] outline-none focus:border-biz-blue" />
            </label>
          </div>
        </div>

        {pendingQuery.isError && <div className="border-t border-biz-danger/15 bg-biz-danger-soft px-4 py-2 text-[11px] text-biz-danger">Failed to load pending tenders. Check the API connection and refresh.</div>}
        <div className="overflow-x-auto border-t border-biz-border">
          <table className="w-full min-w-[960px] text-[11px]">
            <thead className="bg-[#F7FAFF] font-semibold text-biz-navy">
              <tr className="border-b border-biz-border">
                <th className="w-10 px-4 py-2 text-left"><Checkbox checked={pendingItems.length > 0 && pendingItems.every((row) => selectedIds.has(row.id))} onChange={toggleAll} label="Select all current page" /></th>
                <th className="w-12 px-3 py-2 text-left">SL</th><th className="px-3 py-2 text-left">Tender ID</th><th className="px-3 py-2 text-left">Organization</th><th className="px-3 py-2 text-left">Work / Tender Name</th><th className="px-3 py-2 text-left">Document Purchase Date</th><th className="px-4 py-2 text-right">Estimated Tender Amount (৳)</th>
              </tr>
            </thead>
            <tbody>
              {pendingQuery.isLoading ? <TableSkeleton columns={7} /> : pendingItems.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[12px] text-biz-muted">No pending tenders found.</td></tr>
              ) : pendingItems.map((row, index) => (
                <tr key={row.id} className="border-b border-biz-border last:border-0">
                  <td className="px-4 py-2"><Checkbox checked={selectedIds.has(row.id)} onChange={() => toggleRow(row)} label={`Select ${row.tenderId ?? row.tenderWorkName}`} /></td>
                  <td className="px-3 py-2">{(meta.page - 1) * meta.limit + index + 1}</td><td className="px-3 py-2 font-semibold text-biz-navy">{row.tenderId ?? "Manual"}</td><td className="px-3 py-2 font-semibold">{row.organizationMaster.shortName}</td><td className="px-3 py-2">{row.tenderWorkName}</td><td className="px-3 py-2">{displayDate(row.purchaseDate)}</td><td className="px-4 py-2 text-right font-semibold">{money(row.estimatedTenderAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-biz-border px-4 py-3 text-[11px]">
          <span className="text-biz-muted">Showing {firstEntry} to {lastEntry} of {meta.total} entries</span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-biz-blue-soft px-3 py-2 font-semibold text-biz-blue">{selectedIds.size} Selected</span>
            <button type="button" onClick={() => setSelectedState(new Set())} className="flex h-8 items-center gap-1.5 rounded border border-biz-border bg-white px-3 font-semibold text-biz-navy hover:bg-biz-bg"><CircleX className="h-3.5 w-3.5" />Clear Selection</button>
            <button type="button" disabled={selectedIds.size === 0} onClick={addSelected} className="flex h-8 items-center gap-1.5 rounded bg-biz-blue px-3 font-semibold text-white hover:bg-biz-blue-hover disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Add Selected to Charge List</button>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" disabled={meta.page <= 1} onClick={() => setQuery({ ...query, page: meta.page - 1 })} className="flex h-8 w-8 items-center justify-center rounded border border-biz-border disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
            {Array.from({ length: Math.min(meta.totalPages, 4) }, (_, index) => index + 1).map((page) => <button type="button" key={page} onClick={() => setQuery({ ...query, page })} className={cn("h-8 min-w-8 rounded border px-2 font-semibold", page === meta.page ? "border-biz-blue bg-biz-blue text-white" : "border-biz-border bg-white text-biz-navy")}>{page}</button>)}
            <button type="button" disabled={meta.page >= meta.totalPages} onClick={() => setQuery({ ...query, page: meta.page + 1 })} className="flex h-8 w-8 items-center justify-center rounded border border-biz-border disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-biz-border bg-white shadow-card">
        <h2 className="px-4 py-3 text-[14px] font-bold text-biz-navy">2. Charge Details <span className="font-semibold">(For Selected Tenders)</span></h2>
        <div className="overflow-x-auto border-t border-biz-border">
          <table className="w-full min-w-[1120px] text-[11px]">
            <thead className="bg-[#F7FAFF] font-semibold text-biz-navy"><tr className="border-b border-biz-border">{["SL", "Tender ID", "Organization", "Work / Tender Name", "Bank", "Charge Amount (৳)", "Remarks (optional)", "Action"].map((header) => <th key={header} className={cn("px-3 py-2 text-left", header === "Action" && "text-center")}>{header}</th>)}</tr></thead>
            <tbody>
              {chargeRows.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-[12px] text-biz-muted">No selected tender. Select pending tenders and add them to the charge list.</td></tr> : chargeRows.map((row, index) => (
                <tr key={row.id} className="border-b border-biz-border last:border-0">
                  <td className="px-3 py-2">{index + 1}</td><td className="px-3 py-2 font-semibold text-biz-navy">{row.tenderId ?? "Manual"}</td><td className="px-3 py-2 font-semibold">{row.organizationMaster.shortName}</td><td className="px-3 py-2">{row.tenderWorkName}</td>
                  <td className="px-3 py-1.5"><select value={row.bankAccountId || defaultBank?.id || ""} onChange={(event) => updateChargeRow(row.id, "bankAccountId", event.target.value)} className="h-8 w-[155px] rounded border border-biz-border bg-white px-2 text-[11px] outline-none focus:border-biz-blue"><option value="">Select bank</option>{(bankAccounts.data ?? []).filter((account) => account.accountType === "BANK").map((account) => <option key={account.id} value={account.id}>{account.bankName ?? account.accountName}</option>)}</select></td>
                  <td className="px-3 py-1.5"><input type="number" min="0.01" step="0.01" value={row.chargeAmount} onChange={(event) => updateChargeRow(row.id, "chargeAmount", event.target.value)} className="h-8 w-28 rounded border border-biz-border px-2 text-right text-[11px] outline-none focus:border-biz-blue" /></td>
                  <td className="px-3 py-1.5"><input value={row.remarks} onChange={(event) => updateChargeRow(row.id, "remarks", event.target.value)} placeholder="Enter remarks" className="h-8 w-full min-w-[150px] rounded border border-biz-border px-2 text-[11px] outline-none focus:border-biz-blue" /></td>
                  <td className="px-3 py-1.5 text-center"><button type="button" onClick={() => removeChargeRow(row.id)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-biz-border bg-white text-biz-danger hover:bg-biz-danger-soft" aria-label={`Remove ${row.tenderId ?? row.tenderWorkName}`} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {errors.items && <p className="px-4 pt-2 text-[11px] text-biz-danger">{errors.items.message}</p>}
        <div className="flex flex-col justify-between gap-3 border-t border-biz-border px-4 py-3 sm:flex-row sm:items-center">
          <button type="button" onClick={() => pendingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="flex h-8 w-fit items-center gap-1.5 rounded bg-biz-blue-soft px-3 text-[11px] font-semibold text-biz-blue"><Plus className="h-3.5 w-3.5" />Add Another Tender</button>
          <div className="grid w-full min-w-0 grid-cols-[0.8fr_1.5fr] overflow-hidden rounded-md border border-biz-border bg-[#F7FAFF] text-center sm:w-auto sm:min-w-[390px]">
            <div className="border-r border-biz-border px-4 py-2.5"><p className="text-[10px] font-semibold text-biz-muted">Total Tenders</p><p className="mt-0.5 text-[16px] font-bold text-biz-navy">{chargeRows.length}</p></div>
            <div className="px-4 py-2.5"><p className="text-[10px] font-semibold text-biz-muted">Total Credit Commitment Charge (৳)</p><p className="mt-0.5 text-[16px] font-bold text-biz-success">{money(totalCharge)}</p></div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-biz-border bg-white p-4 shadow-card">
        <h2 className="mb-3 text-[14px] font-bold text-biz-navy">3. Payment Information</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_0.65fr_1fr]">
          <label className="block"><span className="mb-1 block text-[11px] font-semibold text-biz-navy">Payment From <span className="text-biz-danger">*</span></span><span className="relative block"><Landmark className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" /><select {...register("paymentFromAccountId")} className="h-10 w-full rounded-md border border-biz-border bg-white pl-9 pr-3 text-[12px] outline-none focus:border-biz-blue"><option value="">Select payment account</option>{(bankAccounts.data ?? []).map((account) => <option key={account.id} value={account.id}>{account.bankName ?? account.accountName}{account.accountNumber ? ` - ${account.accountNumber}` : ""}</option>)}</select></span>{errors.paymentFromAccountId && <span className="mt-1 block text-[10px] text-biz-danger">{errors.paymentFromAccountId.message}</span>}</label>
          <label className="block"><span className="mb-1 block text-[11px] font-semibold text-biz-navy">Payment Date <span className="text-biz-danger">*</span></span><span className="relative block"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" /><input type="date" {...register("paymentDate")} className="h-10 w-full rounded-md border border-biz-border bg-white pl-9 pr-3 text-[12px] outline-none focus:border-biz-blue" /></span>{errors.paymentDate && <span className="mt-1 block text-[10px] text-biz-danger">{errors.paymentDate.message}</span>}</label>
          <label className="block"><span className="mb-1 block text-[11px] font-semibold text-biz-navy">Remarks (optional)</span><input {...register("remarks")} placeholder="Credit commitment charge for selected tenders." className="h-10 w-full rounded-md border border-biz-border bg-white px-3 text-[12px] outline-none focus:border-biz-blue" /></label>
        </div>
      </section>

      <div className="flex justify-end gap-2 pb-2">
        <button type="button" onClick={() => { setSelectedState(new Set()); setChargeRowsState([]); setMessage(null); }} className="h-9 rounded-md border border-biz-border bg-white px-5 text-[12px] font-semibold text-biz-navy hover:bg-biz-bg">Cancel</button>
        <button type="button" disabled={createCharge.isPending || chargeRows.length === 0} onClick={prepareSave} className="flex h-9 items-center gap-2 rounded-md bg-biz-blue px-5 text-[12px] font-semibold text-white hover:bg-biz-blue-hover disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{createCharge.isPending ? "Saving..." : "Save Credit Commitment Charge"}</button>
      </div>
    </div>
  );
}
