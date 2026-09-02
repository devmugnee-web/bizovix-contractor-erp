"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Calculator,
  ChevronUp,
  Clock3,
  ClipboardList,
  FileClock,
  Eye,
  Package,
  Pencil,
  Ship,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AppDateInput } from "@/components/shared/app-date-input";
import { LcEmptyState } from "@/components/shared/lc-empty-state";
import { LC_CURRENCIES } from "@/config/lc-currencies";
import { buildWorkspaceRoute } from "@/config/routes";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { useMoneyAccountsQuery } from "@/hooks/use-accounts-query";
import {
  useCreateLcCostEntryMutation,
  useCreateLcCostHeadMutation,
  useCreateLcGrnMutation,
  useDeleteLcCostEntryMutation,
  useFinalizeLcLandedCostMutation,
  useLcAllocationPreviewQuery,
  useLcCostHeadsQuery,
  useLcDetailQuery,
  useLcInventoryItemsQuery,
  useLcLandedCostPreviewQuery,
  useLcWarehousesQuery,
  usePostLcInventoryMutation,
  useUpdateLcInventoryPostingMutation,
  useUpdateLcGrnMutation,
  useReopenLcLandedCostMutation,
  useSaveLcAllocationMutation,
  useSetLcStatusMutation,
  useUpdateLcCostEntryMutation,
  useUpdateLcLandedCostProfitMutation,
  useUpdateLcMutation,
} from "@/hooks/use-lc-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { useTransientScrollbar } from "@/hooks/use-transient-scrollbar";
import { formatAmount, formatCurrency, formatCurrencyUsd, formatDate, formatDateTime } from "@/lib/format";
import { moneyAmountsEqual, moneyToMinorUnits, roundMoney, sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { LcAllocationBasis, LcAllocationMode, LcCostEntryRecord, LcDetail, LcGrnRecord, LcLandedCostItemRecord, LcProfitMode, LcStatus } from "@/types/lc";

export type LcDetailTab = "overview" | "products" | "shipments" | "costs" | "grn" | "landed-cost" | "timeline" | "history";

const TABS: Array<{ id: LcDetailTab; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: ClipboardList },
  { id: "products", label: "Products", icon: Package },
  { id: "shipments", label: "Shipments", icon: Ship },
  { id: "costs", label: "Costs & Allocation", icon: Banknote },
  { id: "grn", label: "GRN", icon: Truck },
  { id: "landed-cost", label: "Landed Cost", icon: Calculator },
  { id: "timeline", label: "Timeline", icon: Clock3 },
  { id: "history", label: "Audit History", icon: FileClock },
];

function formatTimelineDateTime(value: string) {
  return formatDateTime(value);
}

function formatLandedAmount(value: number) {
  return formatAmount(value);
}

const STATUS_TONE: Record<LcStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "border-[#c7d1df] bg-[#f1f4f8] text-[#4d6078]" },
  ACTIVE: { label: "Active", className: "border-[#8fd2ad] bg-[#e7f7ee] text-[#08783d]" },
  COSTING_PENDING: { label: "Costing Pending", className: "border-[#edc16e] bg-[#fff5df] text-[#995300]" },
  ALLOCATION_PENDING: { label: "Allocation Pending", className: "border-[#edc16e] bg-[#fff5df] text-[#995300]" },
  READY_TO_FINALIZE: { label: "Ready to Finalize", className: "border-[#9fc4f6] bg-[#eef5ff] text-[#0f3d91]" },
  FINALIZED: { label: "Finalized", className: "border-[#8fd2ad] bg-[#e7f7ee] text-[#08783d]" },
  CLOSED: { label: "Closed", className: "border-[#c7d1df] bg-[#f1f4f8] text-[#4d6078]" },
  CANCELLED: { label: "Cancelled", className: "border-[#f3b7b0] bg-[#fdecec] text-[#c63c3c]" },
};

const ALLOCATION_MODES: Array<{ value: LcAllocationMode; label: string }> = [
  { value: "AUTO", label: "Auto" },
  { value: "MANUAL_AMOUNT", label: "Manual Amount" },
  { value: "MANUAL_PERCENTAGE", label: "Manual %" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "DIRECT_PRODUCT", label: "Direct Product" },
];

const ALLOCATION_BASES: Array<{ value: LcAllocationBasis; label: string }> = [
  { value: "PURCHASE_VALUE", label: "Purchase Value" },
  { value: "USD_VALUE", label: "USD Value" },
  { value: "QUANTITY", label: "Quantity" },
  { value: "WEIGHT", label: "Weight" },
  { value: "CBM", label: "CBM" },
  { value: "EQUAL", label: "Equal" },
];

function allocationBasisLabel(value: LcAllocationBasis | null) {
  return ALLOCATION_BASES.find((option) => option.value === value)?.label ?? "Not set";
}

function allocationModeLabel(value: LcAllocationMode) {
  return ALLOCATION_MODES.find((option) => option.value === value)?.label ?? value.replaceAll("_", " ");
}

const LANDED_COST_COLUMNS: Array<{ key: keyof LcLandedCostItemRecord; label: string }> = [
  { key: "purchaseCost", label: "Purchase" },
  { key: "lcBankingCost", label: "LC Cost" },
  { key: "originCost", label: "Foreign Transport" },
  { key: "freightCost", label: "Freight" },
  { key: "insuranceCost", label: "Insurance" },
  { key: "customsCost", label: "Custom Duty" },
  { key: "taxCost", label: "Tax" },
  { key: "cnfCost", label: "CNF" },
  { key: "portCost", label: "Port" },
  { key: "destinationTransportCost", label: "Transport" },
  { key: "localCost", label: "Local" },
  { key: "otherCost", label: "Other" },
  { key: "totalLandedCost", label: "Total Landed" },
];

function LcPaymentManager({ lc, onDone }: { lc: LcDetail; onDone: () => void }) {
  const moneyAccountsQuery = useMoneyAccountsQuery(true);
  const updateMutation = useUpdateLcMutation();
  const [rows, setRows] = useState(() => lc.paymentAllocations.length
    ? lc.paymentAllocations.map((row) => ({ key: `${row.accountId}-${Math.random()}`, accountId: row.accountId, amount: String(row.amount), reference: row.reference ?? "" }))
    : [{ key: Math.random().toString(36), accountId: "", amount: "", reference: "" }]);
  const total = sumMoney(rows.map((row) => Number(row.amount || 0)));

  async function save() {
    const totalPaisa = moneyToMinorUnits(total);
    if (totalPaisa <= moneyToMinorUnits(lc.purchasePaidAmount) || totalPaisa > moneyToMinorUnits(lc.purchaseCostTotal)) {
      toast.error(`Cumulative payment must be above ${formatCurrency(lc.purchasePaidAmount)} and no more than ${formatCurrency(lc.purchaseCostTotal)}.`);
      return;
    }
    if (rows.some((row) => Number(row.amount || 0) > 0 && !row.accountId)) {
      toast.error("Select a ledger for every payment amount.");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: lc.id,
        input: {
          purchasePaidAmount: roundMoney(total),
          purchasePaymentStatus: moneyAmountsEqual(total, lc.purchaseCostTotal) ? "PAID" : "PARTIAL",
          paymentAllocations: rows.filter((row) => row.accountId && moneyToMinorUnits(Number(row.amount || 0)) > 0).map((row) => ({ accountId: row.accountId, amount: roundMoney(Number(row.amount)), reference: row.reference.trim() || undefined })),
        },
      });
      toast.success("LC payment posted");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "LC payment could not be posted");
    }
  }

  return (
    <div className="col-span-full grid gap-2 rounded-[8px] border border-[#d9c69e] bg-[#fffaf0] p-3">
      <div className="font-medium text-[#47351d]">Record Additional / Final Payment</div>
      {rows.map((row) => (
        <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_160px_1fr_36px]">
          <select value={row.accountId} onChange={(event) => setRows((current) => current.map((entry) => entry.key === row.key ? { ...entry, accountId: event.target.value } : entry))} className="h-9 rounded-[6px] border border-[#d9c69e] bg-white px-2 text-sm">
            <option value="">Select payment ledger</option>
            {(moneyAccountsQuery.data ?? []).map((ledger) => <option key={ledger.id} value={ledger.id}>{ledger.type} — {ledger.code} — {ledger.name} — {formatCurrency(ledger.currentBalance)}</option>)}
          </select>
          <Input money type="number" min="0" value={row.amount} onChange={(event) => setRows((current) => current.map((entry) => entry.key === row.key ? { ...entry, amount: event.target.value } : entry))} className="h-9" />
          <Input value={row.reference} onChange={(event) => setRows((current) => current.map((entry) => entry.key === row.key ? { ...entry, reference: event.target.value } : entry))} placeholder="Reference (optional)" className="h-9" />
          <button type="button" aria-label="Remove payment row" onClick={() => setRows((current) => current.length === 1 ? current : current.filter((entry) => entry.key !== row.key))} className="text-[#c63c3c]"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((current) => [...current, { key: Math.random().toString(36), accountId: "", amount: "", reference: "" }])}>+ Add ledger</Button>
        <span className="text-sm">Cumulative paid: <strong>{formatCurrency(total)}</strong> · Due: <strong>{formatCurrency(roundMoney(Math.max(0, lc.purchaseCostTotal - total)))}</strong></span>
        <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={onDone}>Cancel</Button><Button type="button" size="sm" onClick={() => void save()} disabled={updateMutation.isPending}>{updateMutation.isPending ? "Posting..." : "Post Payment"}</Button></div>
      </div>
    </div>
  );
}

export function AllocationEditor({ lcId, entry, onSaved, readOnly = false }: { lcId: string; entry: LcCostEntryRecord; onSaved?: () => void; readOnly?: boolean }) {
  const [mode, setMode] = useState<LcAllocationMode>(entry.allocationMode);
  const [basis, setBasis] = useState<LcAllocationBasis>(entry.allocationBasis ?? "PURCHASE_VALUE");
  const previewQuery = useLcAllocationPreviewQuery(lcId, entry.id, basis, true);
  const saveMutation = useSaveLcAllocationMutation();
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const savedOverrideReason = entry.allocations.find((allocation) => allocation.overrideReason?.trim())?.overrideReason ?? "";
  const [overrideReason, setOverrideReason] = useState(savedOverrideReason);

  useEffect(() => {
    setOverrideReason(savedOverrideReason);
    setManualValues({});
  }, [entry.id, savedOverrideReason]);

  const preview = previewQuery.data;
  const rows = preview?.rows ?? [];

  function valueFor(lcItemId: string, fallback: number | null) {
    if (manualValues[lcItemId] !== undefined) return manualValues[lcItemId];
    return fallback !== null ? String(fallback) : "";
  }

  const finalTotal = sumMoney(rows.map((row) => {
    if (readOnly) return row.finalAmount;
    if (mode === "AUTO") return row.autoSuggestedAmount;
    const raw = manualValues[row.lcItemId];
    if (mode === "MANUAL_PERCENTAGE") {
      const percent = raw !== undefined ? Number(raw) || 0 : 0;
      return roundMoney((entry.bdtAmount * percent) / 100);
    }
    const amount = raw !== undefined && raw !== ""
      ? Number(raw) || 0
      : row.manualAmount !== null
        ? row.manualAmount
        : mode === "HYBRID"
          ? row.autoSuggestedAmount
          : 0;
    return roundMoney(amount);
  }));
  const remaining = roundMoney(entry.bdtAmount - finalTotal);
  const balanced = moneyAmountsEqual(finalTotal, entry.bdtAmount);

  async function handleSave() {
    if (!balanced) {
      toast.error(`Allocation must equal ${formatCurrency(entry.bdtAmount)}. Difference: ${formatCurrency(remaining)}.`);
      return;
    }
    if (mode !== "AUTO" && !overrideReason.trim()) {
      toast.error("Enter an override reason before saving a manual allocation.");
      return;
    }
    try {
      await saveMutation.mutateAsync({
        id: lcId,
        costEntryId: entry.id,
        input: {
          allocationMode: mode,
          allocationBasis: basis,
          rows: rows.map((row) => {
            const raw = manualValues[row.lcItemId];
            return {
              lcItemId: row.lcItemId,
              manualAmount: mode === "MANUAL_AMOUNT" || mode === "HYBRID" || mode === "DIRECT_PRODUCT" ? (raw !== undefined && raw !== "" ? roundMoney(Number(raw)) : row.manualAmount === null ? undefined : roundMoney(row.manualAmount)) : undefined,
              manualPercentage: mode === "MANUAL_PERCENTAGE" ? Number(raw || 0) : undefined,
              overrideReason: mode !== "AUTO" ? overrideReason : undefined,
            };
          }),
        },
      });
      toast.success(`Allocation saved for "${entry.costHeadName}"`);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Allocation could not be saved");
    }
  }

  return (
    <div className="mt-2 space-y-3 rounded-[8px] border border-[#d7e1ee] bg-[#fbfdff] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[#6f7d91]">Allocation Mode</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as LcAllocationMode)} disabled={entry.isLocked || readOnly} className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm">
            {ALLOCATION_MODES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {mode === "AUTO" || mode === "HYBRID" ? (
          <label className="grid gap-1 text-xs">
            <span className="font-medium text-[#6f7d91]">Allocation Basis</span>
            <select value={basis} onChange={(event) => { setBasis(event.target.value as LcAllocationBasis); setManualValues({}); }} disabled={entry.isLocked || readOnly} className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm">
              {ALLOCATION_BASES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        ) : null}
        {mode !== "AUTO" ? (
          <label className="grid min-w-[220px] flex-1 gap-1 text-xs">
            <span className="font-medium text-[#6f7d91]">Override Reason</span>
            <Input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} disabled={entry.isLocked || readOnly} className="h-9" placeholder="Required when overriding" />
          </label>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-[6px] border border-[#e7edf5]">
        <table className="min-w-[640px] w-full text-sm">
          <thead className="bg-white text-xs uppercase text-[#8994a6]">
            <tr>
              <th className="px-2 py-2 text-left">Product</th>
              <th className="px-2 py-2 text-right">Basis %</th>
              <th className="px-2 py-2 text-right">Auto Suggested</th>
              <th className="px-2 py-2 text-right">{mode === "MANUAL_PERCENTAGE" ? "Manual %" : "Manual"}</th>
              <th className="px-2 py-2 text-right">Final</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const raw = manualValues[row.lcItemId];
              const finalAmount =
                readOnly
                  ? row.finalAmount
                  : mode === "AUTO"
                  ? row.autoSuggestedAmount
                  : mode === "MANUAL_PERCENTAGE"
                    ? (entry.bdtAmount * (raw !== undefined ? Number(raw) || 0 : 0)) / 100
                    : raw !== undefined && raw !== ""
                      ? Number(raw) || 0
                      : row.manualAmount !== null
                        ? row.manualAmount
                        : mode === "HYBRID"
                          ? row.autoSuggestedAmount
                          : 0;
              return (
                <tr key={row.lcItemId} className="border-t border-[#eef2f7]">
                  <td className="px-2 py-1.5">{row.productName}</td>
                  <td className="px-2 py-1.5 text-right text-[#6f7d91]">{row.basisPercentage.toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right text-[#6f7d91]">{formatCurrency(row.autoSuggestedAmount)}</td>
                  <td className="px-2 py-1.5 text-right">
                    {mode === "AUTO" ? (
                      <span className="text-[#c3ccd8]">—</span>
                    ) : (
                      <Input
                        money={mode !== "MANUAL_PERCENTAGE"}
                        type="number"
                        min="0"
                        max={mode === "MANUAL_PERCENTAGE" ? 100 : undefined}
                        step="0.01"
                        value={valueFor(row.lcItemId, row.manualAmount)}
                        onChange={(event) => setManualValues((current) => ({ ...current, [row.lcItemId]: event.target.value }))}
                        disabled={entry.isLocked || readOnly}
                        className="h-8 w-28 text-right"
                        placeholder={mode === "HYBRID" || mode === "DIRECT_PRODUCT" ? "auto" : "0.00"}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium text-[#14233b]">{formatCurrency(finalAmount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={cn("flex flex-wrap justify-between gap-2 rounded-[6px] border px-3 py-2 text-sm", balanced ? "border-[#8fd2ad] bg-[#e7f7ee]" : "border-[#f3b7b0] bg-[#fdecec]")}>
        <span className="text-[#6f7d91]">Expense Total {formatCurrency(entry.bdtAmount)} · Allocated {formatCurrency(finalTotal)}</span>
        <span className={cn("font-semibold", balanced ? "text-[#08783d]" : "text-[#c63c3c]")}>
          {balanced ? "Balanced" : `Remaining ${formatCurrency(remaining)}`}
        </span>
      </div>

      {!entry.isLocked && !readOnly ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saveMutation.isPending || previewQuery.isFetching || !balanced || (mode !== "AUTO" && !overrideReason.trim())}>
            {saveMutation.isPending ? "Saving..." : "Save Allocation"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AddCostEntryForm({
  lcId,
  workspaceId,
  onDone,
  onCreated,
}: {
  lcId: string;
  workspaceId: string;
  onDone?: () => void;
  onCreated?: (detail: LcDetail) => void;
}) {
  const costHeadsQuery = useLcCostHeadsQuery(workspaceId, true);
  const moneyAccountsQuery = useMoneyAccountsQuery(true);
  const createMutation = useCreateLcCostEntryMutation();
  const createCostHeadMutation = useCreateLcCostHeadMutation();
  const costHeads = costHeadsQuery.data ?? [];
  const [costHeadId, setCostHeadId] = useState("");
  const [showCustomExpense, setShowCustomExpense] = useState(false);
  const [customExpenseName, setCustomExpenseName] = useState("");
  const [customExpenseBasis, setCustomExpenseBasis] = useState<LcAllocationBasis>("PURCHASE_VALUE");
  const [customExpenseError, setCustomExpenseError] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("BDT");
  const [foreignAmount, setForeignAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [bdtAmount, setBdtAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CREDIT" | "CASH_BANK_MFS">("CREDIT");
  const [creditPayeeName, setCreditPayeeName] = useState("");
  const [costPaymentRows, setCostPaymentRows] = useState([{ key: Math.random().toString(36), accountId: "", amount: "", reference: "" }]);
  const [error, setError] = useState<string | null>(null);

  async function handleAddCustomExpense() {
    const name = customExpenseName.trim();
    if (!name) {
      setCustomExpenseError("Expense name is required.");
      return;
    }

    setCustomExpenseError(null);
    try {
      const createdHead = await createCostHeadMutation.mutateAsync({
        workspaceId,
        name,
        category: "OTHER",
        defaultAllocationMethod: customExpenseBasis,
        includeInLandedCost: true,
        manualOverrideAllowed: true,
      });
      setCostHeadId(createdHead.id);
      setCustomExpenseName("");
      setCustomExpenseBasis("PURCHASE_VALUE");
      setShowCustomExpense(false);
      toast.success(`Custom expense "${createdHead.name}" added`);
    } catch (submissionError) {
      setCustomExpenseError(submissionError instanceof Error ? submissionError.message : "Custom expense could not be added");
    }
  }

  async function handleSubmit() {
    if (!costHeadId) {
      setError("Select a cost head.");
      return;
    }
    if (paymentMethod === "CREDIT" && !creditPayeeName.trim()) {
      setError("Enter who will receive the credit payment.");
      return;
    }
    const paymentTotal = sumMoney(costPaymentRows.map((row) => Number(row.amount || 0)));
    const expectedTotal = roundMoney(currency !== "BDT" ? Number(foreignAmount || 0) * Number(exchangeRate || 0) : Number(bdtAmount || 0));
    if (paymentMethod === "CASH_BANK_MFS" && (costPaymentRows.some((row) => moneyToMinorUnits(Number(row.amount || 0)) > 0 && !row.accountId) || !moneyAmountsEqual(paymentTotal, expectedTotal))) {
      setError(`Payment allocations must use a ledger and total ${formatCurrency(expectedTotal)}.`);
      return;
    }
    setError(null);
    try {
      const updatedDetail = await createMutation.mutateAsync({
        id: lcId,
        input: {
          costHeadId,
          vendorName: vendorName.trim() || undefined,
          invoiceNumber: invoiceNumber.trim() || undefined,
          invoiceDate,
          currency,
          foreignAmount: currency !== "BDT" ? Number(foreignAmount || 0) : undefined,
          exchangeRate: currency !== "BDT" ? Number(exchangeRate || 0) : undefined,
          bdtAmount: bdtAmount ? roundMoney(Number(bdtAmount)) : undefined,
          remarks: remarks.trim() || undefined,
          paymentMethod,
          creditPayeeName: paymentMethod === "CREDIT" ? creditPayeeName.trim() : undefined,
          paymentAllocations: paymentMethod === "CASH_BANK_MFS" ? costPaymentRows.filter((row) => moneyToMinorUnits(Number(row.amount || 0)) > 0).map((row) => ({ accountId: row.accountId, amount: roundMoney(Number(row.amount)), reference: row.reference.trim() || undefined })) : [],
        },
      });
      toast.success("Cost entry added");
      onCreated?.(updatedDetail);
      setCostHeadId("");
      setVendorName("");
      setInvoiceNumber("");
      setInvoiceDate(new Date().toISOString().slice(0, 10));
      setForeignAmount("");
      setExchangeRate("");
      setBdtAmount("");
      setRemarks("");
      setCreditPayeeName("");
      setCostPaymentRows([{ key: Math.random().toString(36), accountId: "", amount: "", reference: "" }]);
      onDone?.();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Cost entry could not be added");
    }
  }

  const computedBdt = roundMoney(currency !== "BDT" ? (Number(foreignAmount || 0) * Number(exchangeRate || 0)) : Number(bdtAmount || 0));

  return (
    <div className="grid gap-3 rounded-[8px] border border-[#d7e1ee] bg-[#fbfdff] p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[#6f7d91]">Cost Head *</span>
          <select
            value={costHeadId}
            onChange={(event) => {
              if (event.target.value === "__custom_expense__") {
                setShowCustomExpense(true);
                return;
              }
              setCostHeadId(event.target.value);
            }}
            className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm"
          >
            <option value="">Select cost head</option>
            {costHeads.filter((head) => head.isActive).map((head) => <option key={head.id} value={head.id}>{head.name}</option>)}
            <option value="__custom_expense__">+ Add Custom Expense</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[#6f7d91]">Vendor</span>
          <Input value={vendorName} onChange={(event) => setVendorName(event.target.value)} className="h-9" placeholder="Optional" />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[#6f7d91]">Invoice No</span>
          <Input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} className="h-9" placeholder="Optional" />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[#6f7d91]">Posting / Invoice Date *</span>
          <AppDateInput value={invoiceDate} onChange={setInvoiceDate} />
        </label>
      </div>
      {showCustomExpense ? (
        <div className="grid gap-2 rounded-[8px] border border-dashed border-[#f0b36b] bg-[#fffaf4] p-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end">
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[#6f7d91]">Custom Expense Name *</span>
              <Input
                autoFocus
                value={customExpenseName}
                onChange={(event) => setCustomExpenseName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleAddCustomExpense();
                  }
                }}
                className="h-9"
                placeholder="e.g. Survey Fee"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[#6f7d91]">Item-wise Allocation</span>
              <select
                value={customExpenseBasis}
                onChange={(event) => setCustomExpenseBasis(event.target.value as LcAllocationBasis)}
                className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm"
              >
                <option value="PURCHASE_VALUE">Purchase Value</option>
                <option value="USD_VALUE">USD Value</option>
                <option value="QUANTITY">Quantity</option>
                <option value="WEIGHT">Weight</option>
                <option value="CBM">CBM</option>
                <option value="EQUAL">Equal</option>
              </select>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCustomExpense(false);
                  setCustomExpenseName("");
                  setCustomExpenseError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => void handleAddCustomExpense()} disabled={createCostHeadMutation.isPending}>
                {createCostHeadMutation.isPending ? "Adding..." : "Add Expense"}
              </Button>
            </div>
          </div>
          {customExpenseError ? <p className="text-xs text-[#c63c3c]">{customExpenseError}</p> : null}
        </div>
      ) : null}
      <div className="grid grid-cols-4 gap-3">
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[#6f7d91]">Currency</span>
          <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm">
            {LC_CURRENCIES.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} — {entry.name}</option>)}
          </select>
        </label>
        {currency !== "BDT" ? (
          <>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[#6f7d91]">Foreign Amount</span>
              <Input money type="number" value={foreignAmount} onChange={(event) => setForeignAmount(event.target.value)} className="h-9" />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[#6f7d91]">Exchange Rate</span>
              <Input type="number" step="0.0001" value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} className="h-9" />
            </label>
          </>
        ) : (
          <label className="col-span-2 grid gap-1 text-xs">
            <span className="font-medium text-[#6f7d91]">Cost Amount (BDT)</span>
            <Input money type="number" value={bdtAmount} onChange={(event) => setBdtAmount(event.target.value)} className="h-9" />
          </label>
        )}
        <div className="grid gap-1 text-xs">
          <span className="font-medium text-[#6f7d91]">Cost Amount (BDT computed)</span>
          <div className="flex h-9 items-center rounded-[6px] border border-[#e7edf5] bg-white px-2 text-sm font-medium text-[#14233b]">{formatCurrency(computedBdt)}</div>
        </div>
      </div>
      <label className="grid gap-1 text-xs">
        <span className="font-medium text-[#6f7d91]">Remarks</span>
        <Input value={remarks} onChange={(event) => setRemarks(event.target.value)} className="h-9" placeholder="Optional" />
      </label>
      <div className="grid gap-3 rounded-[8px] border border-[#ead7b0] bg-[#fffaf0] p-3">
        <label className="grid max-w-sm gap-1 text-xs"><span className="font-medium text-[#6f7d91]">Payment Option *</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "CREDIT" | "CASH_BANK_MFS")} className="h-9 rounded-[6px] border border-[#d9c69e] bg-white px-2 text-sm"><option value="CREDIT">Credit</option><option value="CASH_BANK_MFS">Cash / Bank / MFS</option></select></label>
        {paymentMethod === "CREDIT" ? (
          <label className="grid gap-1 text-xs"><span className="font-medium text-[#6f7d91]">Who will receive the payment? *</span><Input value={creditPayeeName} onChange={(event) => setCreditPayeeName(event.target.value)} placeholder="Payee / creditor name" /></label>
        ) : (
          <div className="grid gap-2">
            {costPaymentRows.map((row) => <div key={row.key} className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_minmax(180px,1fr)_36px]"><select value={row.accountId} onChange={(event) => setCostPaymentRows((current) => current.map((item) => item.key === row.key ? { ...item, accountId: event.target.value } : item))} className="h-9 rounded-[6px] border border-[#d9c69e] bg-white px-2 text-sm"><option value="">Select Cash / Bank / MFS ledger</option>{(moneyAccountsQuery.data ?? []).map((account) => <option key={account.id} value={account.id}>{account.type} — {account.name} — {formatCurrency(account.currentBalance)}</option>)}</select><Input money type="number" min="0" value={row.amount} onChange={(event) => setCostPaymentRows((current) => current.map((item) => item.key === row.key ? { ...item, amount: event.target.value } : item))} placeholder="Amount" /><Input value={row.reference} onChange={(event) => setCostPaymentRows((current) => current.map((item) => item.key === row.key ? { ...item, reference: event.target.value } : item))} placeholder="Reference (optional)" /><button type="button" aria-label="Remove payment row" disabled={costPaymentRows.length === 1} onClick={() => setCostPaymentRows((current) => current.filter((item) => item.key !== row.key))} className="text-[#c63c3c] disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div>)}
            <div className="flex items-center justify-between"><Button type="button" variant="outline" size="sm" onClick={() => setCostPaymentRows((current) => [...current, { key: Math.random().toString(36), accountId: "", amount: "", reference: "" }])}>+ Add Payment Method</Button><span className="text-sm text-[#6f7d91]">Allocated: {formatCurrency(sumMoney(costPaymentRows.map((row) => Number(row.amount || 0))))} / {formatCurrency(computedBdt)}</span></div>
          </div>
        )}
      </div>
      {error ? <p className="text-xs text-[#c63c3c]">{error}</p> : null}
      <div className="flex justify-end gap-2">
        {onDone ? <Button type="button" variant="outline" size="sm" onClick={onDone}>Cancel</Button> : null}
        <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={createMutation.isPending}>
          {createMutation.isPending ? "Adding..." : "Add Cost Entry"}
        </Button>
      </div>
    </div>
  );
}

type EditableCostEntry = Pick<LcCostEntryRecord, "id" | "costHeadName" | "vendorName" | "invoiceNumber" | "invoiceDate" | "currency" | "foreignAmount" | "exchangeRate" | "bdtAmount" | "remarks" | "paymentMethod" | "creditPayeeName" | "paymentAllocations">;

export function EditCostEntryDialog({ lcId, entry, onOpenChange }: { lcId: string; entry: EditableCostEntry | null; onOpenChange: (open: boolean) => void }) {
  const updateMutation = useUpdateLcCostEntryMutation();
  const moneyAccountsQuery = useMoneyAccountsQuery(true);
  const [vendorName, setVendorName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [currency, setCurrency] = useState("BDT");
  const [foreignAmount, setForeignAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [bdtAmount, setBdtAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CREDIT" | "CASH_BANK_MFS">("CREDIT");
  const [creditPayeeName, setCreditPayeeName] = useState("");
  const [paymentRows, setPaymentRows] = useState([{ key: Math.random().toString(36), accountId: "", amount: "", reference: "" }]);

  useEffect(() => {
    if (!entry) return;
    setVendorName(entry.vendorName ?? "");
    setInvoiceNumber(entry.invoiceNumber ?? "");
    setInvoiceDate(entry.invoiceDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setCurrency(entry.currency);
    setForeignAmount(entry.foreignAmount !== null ? String(entry.foreignAmount) : "");
    setExchangeRate(entry.exchangeRate !== null ? String(entry.exchangeRate) : "");
    setBdtAmount(String(entry.bdtAmount));
    setRemarks(entry.remarks ?? "");
    setPaymentMethod(entry.paymentMethod ?? "CREDIT");
    setCreditPayeeName(entry.creditPayeeName ?? entry.vendorName ?? "");
    setPaymentRows(entry.paymentAllocations.length ? entry.paymentAllocations.map((row) => ({ key: Math.random().toString(36), accountId: row.accountId, amount: String(row.amount), reference: row.reference ?? "" })) : [{ key: Math.random().toString(36), accountId: "", amount: "", reference: "" }]);
  }, [entry]);

  async function save() {
    if (!entry) return;
    const computedAmount = roundMoney(currency === "BDT" ? Number(bdtAmount) : Number(foreignAmount) * Number(exchangeRate));
    if (!Number.isFinite(computedAmount) || computedAmount <= 0) {
      toast.error("Enter a valid cost amount.");
      return;
    }
    if (paymentMethod === "CREDIT" && !creditPayeeName.trim()) return void toast.error("Enter who will receive the credit payment.");
    const paymentTotal = sumMoney(paymentRows.map((row) => Number(row.amount || 0)));
    if (paymentMethod === "CASH_BANK_MFS" && (paymentRows.some((row) => moneyToMinorUnits(Number(row.amount || 0)) > 0 && !row.accountId) || !moneyAmountsEqual(paymentTotal, computedAmount))) return void toast.error(`Payment allocations must total ${formatCurrency(computedAmount)}.`);
    try {
      await updateMutation.mutateAsync({
        id: lcId,
        costEntryId: entry.id,
        input: {
          vendorName: vendorName.trim(),
          invoiceNumber: invoiceNumber.trim(),
          invoiceDate,
          currency,
          foreignAmount: currency !== "BDT" ? Number(foreignAmount) : undefined,
          exchangeRate: currency !== "BDT" ? Number(exchangeRate) : undefined,
          bdtAmount: roundMoney(computedAmount),
          remarks: remarks.trim(),
          paymentMethod,
          creditPayeeName: paymentMethod === "CREDIT" ? creditPayeeName.trim() : undefined,
          paymentAllocations: paymentMethod === "CASH_BANK_MFS" ? paymentRows.filter((row) => moneyToMinorUnits(Number(row.amount || 0)) > 0).map((row) => ({ accountId: row.accountId, amount: roundMoney(Number(row.amount)), reference: row.reference.trim() || undefined })) : [],
        },
      });
      toast.success("Cost posting updated");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cost posting could not be updated");
    }
  }

  return (
    <Dialog open={Boolean(entry)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Edit Cost Posting</DialogTitle>
        <DialogDescription>{entry?.costHeadName}</DialogDescription>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs"><span>Vendor</span><Input value={vendorName} onChange={(event) => setVendorName(event.target.value)} /></label>
          <label className="grid gap-1 text-xs"><span>Invoice No</span><Input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></label>
          <label className="grid gap-1 text-xs"><span>Posting / Invoice Date</span><AppDateInput value={invoiceDate} onChange={setInvoiceDate} /></label>
          <label className="grid gap-1 text-xs"><span>Currency</span><select value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm">{LC_CURRENCIES.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} — {entry.name}</option>)}</select></label>
          {currency === "BDT" ? (
            <label className="grid gap-1 text-xs sm:col-span-2"><span>Cost Amount (BDT)</span><Input money type="number" min="0" value={bdtAmount} onChange={(event) => setBdtAmount(event.target.value)} /></label>
          ) : (
            <><label className="grid gap-1 text-xs"><span>Foreign Amount</span><Input money type="number" min="0" value={foreignAmount} onChange={(event) => setForeignAmount(event.target.value)} /></label><label className="grid gap-1 text-xs"><span>Exchange Rate</span><Input type="number" min="0" step="0.0001" value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} /></label></>
          )}
          <label className="grid gap-1 text-xs sm:col-span-2"><span>Remarks</span><Input value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label>
          <label className="grid gap-1 text-xs"><span>Payment Option *</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "CREDIT" | "CASH_BANK_MFS")} className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm"><option value="CREDIT">Credit</option><option value="CASH_BANK_MFS">Cash / Bank / MFS</option></select></label>
          {paymentMethod === "CREDIT" ? <label className="grid gap-1 text-xs"><span>Who will receive the payment? *</span><Input value={creditPayeeName} onChange={(event) => setCreditPayeeName(event.target.value)} /></label> : <div className="grid gap-2 sm:col-span-2">{paymentRows.map((row) => <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_130px_1fr_32px]"><select value={row.accountId} onChange={(event) => setPaymentRows((current) => current.map((item) => item.key === row.key ? { ...item, accountId: event.target.value } : item))} className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm"><option value="">Select Cash / Bank / MFS ledger</option>{(moneyAccountsQuery.data ?? []).map((account) => <option key={account.id} value={account.id}>{account.type} — {account.name} — {formatCurrency(account.currentBalance)}</option>)}</select><Input money type="number" value={row.amount} onChange={(event) => setPaymentRows((current) => current.map((item) => item.key === row.key ? { ...item, amount: event.target.value } : item))} /><Input value={row.reference} onChange={(event) => setPaymentRows((current) => current.map((item) => item.key === row.key ? { ...item, reference: event.target.value } : item))} placeholder="Reference" /><button type="button" disabled={paymentRows.length === 1} onClick={() => setPaymentRows((current) => current.filter((item) => item.key !== row.key))}><Trash2 className="h-4 w-4 text-[#c63c3c]" /></button></div>)}<Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setPaymentRows((current) => [...current, { key: Math.random().toString(36), accountId: "", amount: "", reference: "" }])}>+ Add Payment Method</Button></div>}
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" onClick={() => void save()} disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving..." : "Save Changes"}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

interface LcDetailDialogProps {
  lcId: string | null;
  onOpenChange: (open: boolean) => void;
  initialTab?: LcDetailTab;
  onTabChange?: (tab: LcDetailTab) => void;
  variant?: "dialog" | "page";
}

export function LcDetailDialog({ lcId, onOpenChange, initialTab = "overview", onTabChange, variant = "dialog" }: LcDetailDialogProps) {
  const router = useRouter();
  const contentScrollRef = useTransientScrollbar<HTMLDivElement>();
  const { mode, session } = useSessionContext();
  const detailQuery = useLcDetailQuery(lcId, true);
  const landedCostPreviewQuery = useLcLandedCostPreviewQuery(lcId, true);
  const inventoryItemsQuery = useLcInventoryItemsQuery(session?.workspaceId, true);
  const warehousesQuery = useLcWarehousesQuery(session?.workspaceId, true);
  const deleteCostEntryMutation = useDeleteLcCostEntryMutation();
  const createGrnMutation = useCreateLcGrnMutation();
  const updateGrnMutation = useUpdateLcGrnMutation();
  const finalizeMutation = useFinalizeLcLandedCostMutation();
  const reopenMutation = useReopenLcLandedCostMutation();
  const setStatusMutation = useSetLcStatusMutation();
  const updateProfitMutation = useUpdateLcLandedCostProfitMutation();
  const postInventoryMutation = usePostLcInventoryMutation();
  const updateInventoryPostingMutation = useUpdateLcInventoryPostingMutation();

  const [tab, setTab] = useState<LcDetailTab>("overview");
  const [expandedCostEntry, setExpandedCostEntry] = useState<string | null>(null);
  const [grnFormOpen, setGrnFormOpen] = useState(false);
  const [grnDate, setGrnDate] = useState(new Date().toISOString().slice(0, 10));
  const [grnWarehouseId, setGrnWarehouseId] = useState("");
  const [grnQuantities, setGrnQuantities] = useState<Record<string, string>>({});
  const [grnDamagedQuantities, setGrnDamagedQuantities] = useState<Record<string, string>>({});
  const [grnRejectedQuantities, setGrnRejectedQuantities] = useState<Record<string, string>>({});
  const [grnRemarks, setGrnRemarks] = useState("");
  const [editingGrnId, setEditingGrnId] = useState<string | null>(null);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeNote, setCloseNote] = useState("");
  const [paymentManagerOpen, setPaymentManagerOpen] = useState(false);
  const [deleteCostEntry, setDeleteCostEntry] = useState<LcCostEntryRecord | null>(null);
  const [profitDraft, setProfitDraft] = useState<Record<string, { mode: LcProfitMode; value: string }>>({});
  const [inventoryPostingOpen, setInventoryPostingOpen] = useState(false);
  const [inventoryPostingDetailsOpen, setInventoryPostingDetailsOpen] = useState(false);
  const [inventoryPostingEditMode, setInventoryPostingEditMode] = useState(false);
  const [inventoryPostingItems, setInventoryPostingItems] = useState<Record<string, string>>({});
  const [inventoryPostingTypes, setInventoryPostingTypes] = useState<Record<string, "" | "EXISTING" | "NEW" | "ONE_TIME" | "ASSET">>({});
  const [inventoryPostingWarehouses, setInventoryPostingWarehouses] = useState<Record<string, string>>({});

  const lc = detailQuery.data;
  const warehouses = warehousesQuery.data ?? [];
  const landedCostPreview = landedCostPreviewQuery.data;
  const landedCostDisplayColumns = useMemo(() => {
    const expenseHeads = new Map<string, { key: string; label: string; costEntryIds: string[] }>();
    for (const entry of lc?.costEntries ?? []) {
      if (!entry.includeInLandedCost || moneyToMinorUnits(entry.bdtAmount) === 0) continue;
      const existing = expenseHeads.get(entry.costHeadId);
      if (existing) existing.costEntryIds.push(entry.id);
      else expenseHeads.set(entry.costHeadId, { key: `expense-${entry.costHeadId}`, label: entry.costHeadName, costEntryIds: [entry.id] });
    }
    return [
      { key: "purchase", label: "Purchase", source: "purchase" as const, costEntryIds: [] },
      ...Array.from(expenseHeads.values()).map((column) => ({ ...column, source: "expense" as const })),
      { key: "total-landed", label: "Total Landed", source: "total" as const, costEntryIds: [] },
    ];
  }, [lc?.costEntries]);
  const unpostedExpenseColumns = useMemo(() => {
    return LANDED_COST_COLUMNS.filter((column) => (
      column.key !== "purchaseCost"
      && column.key !== "totalLandedCost"
      && moneyToMinorUnits(sumMoney((landedCostPreview?.items ?? []).map((row) => Number(row[column.key] ?? 0)))) === 0
    ));
  }, [landedCostPreview?.items]);

  function landedCostColumnValue(row: LcLandedCostItemRecord, column: (typeof landedCostDisplayColumns)[number]) {
    if (column.source === "purchase") return row.purchaseCost;
    if (column.source === "total") return row.totalLandedCost;
    const entryIds = new Set(column.costEntryIds);
    return sumMoney((lc?.costEntries ?? []).filter((entry) => entryIds.has(entry.id)).map((entry) => entry.allocations.find((allocation) => allocation.lcItemId === row.lcItemId)?.finalAmount ?? 0));
  }

  function selectTab(nextTab: LcDetailTab) {
    setTab(nextTab);
    onTabChange?.(nextTab);
  }

  function openInventoryPosting() {
    if (!lc) return;
    const inventoryItems = inventoryItemsQuery.data ?? [];
    const eligibleWarehouses = warehouses.filter((warehouse) => warehouse.isActive && warehouse.allowGrn);
    const preferred = eligibleWarehouses.find((warehouse) => warehouse.type === "RAW_MATERIAL")
      ?? eligibleWarehouses.find((warehouse) => warehouse.id === lc.destinationWarehouseId)
      ?? eligibleWarehouses.find((warehouse) => warehouse.isDefault)
      ?? eligibleWarehouses[0];
    setInventoryPostingWarehouses(Object.fromEntries(
      lc.items.filter((item) => !item.inventoryPosting).map((item) => [item.id, preferred?.id ?? ""]),
    ));
    setInventoryPostingItems(Object.fromEntries(
      lc.items.filter((item) => !item.inventoryPosting).map((item) => {
        const matchedItem = inventoryItems.find((inventoryItem) => (
          inventoryItem.itemName.trim().toLocaleLowerCase() === item.productName.trim().toLocaleLowerCase()
        ));
        return [item.id, item.inventoryItemId ?? matchedItem?.id ?? ""];
      }),
    ));
    setInventoryPostingTypes(Object.fromEntries(
      lc.items.filter((item) => !item.inventoryPosting).map((item) => {
        const matchedItem = inventoryItems.find((inventoryItem) => (
          inventoryItem.itemName.trim().toLocaleLowerCase() === item.productName.trim().toLocaleLowerCase()
        ));
        return [item.id, item.inventoryItemId || matchedItem ? "EXISTING" : ""];
      }),
    ));
    setInventoryPostingOpen(true);
  }

  function openInventoryPostingEditor() {
    if (!lc) return;
    setInventoryPostingItems(Object.fromEntries(lc.items.filter((item) => item.inventoryPosting).map((item) => [item.id, item.inventoryItemId ?? ""])));
    setInventoryPostingTypes(Object.fromEntries(lc.items.filter((item) => item.inventoryPosting).map((item) => [item.id, "EXISTING"])));
    setInventoryPostingWarehouses(Object.fromEntries(lc.items.filter((item) => item.inventoryPosting).map((item) => [item.id, item.inventoryPosting?.warehouseId ?? ""])));
    setInventoryPostingEditMode(true);
    setInventoryPostingDetailsOpen(false);
    setInventoryPostingOpen(true);
  }

  function registerLcItemAsAsset(item: LcDetail["items"][number]) {
    if (!lc) return;
    const params = new URLSearchParams({
      create: "asset",
      name: item.productName,
      purchaseDate: lc.lcDate.slice(0, 10),
      purchaseCost: String(item.landedCostAmount ?? 0),
      source: `LC ${lc.lcNumber}`,
    });
    setInventoryPostingOpen(false);
    router.push(`${buildWorkspaceRoute(mode, "/assets-management")}?${params.toString()}`);
  }

  async function handlePostInventory() {
    if (!lc) return;
    if (inventoryPostingEditMode) {
      const items = lc.items.filter((item) => item.inventoryPosting).map((item) => ({
        lcItemId: item.id,
        inventoryItemId: inventoryPostingItems[item.id],
        warehouseId: inventoryPostingWarehouses[item.id],
      }));
      if (items.some((item) => !item.inventoryItemId || !item.warehouseId)) {
        toast.error("Select a product and warehouse for every row.");
        return;
      }
      try {
        await updateInventoryPostingMutation.mutateAsync({ id: lc.id, items });
        toast.success("Inventory posting updated");
        setInventoryPostingOpen(false);
        setInventoryPostingEditMode(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update inventory posting");
      }
      return;
    }
    const pendingItems = lc.items.filter((item) => !item.inventoryPosting);
    if (pendingItems.some((item) => !inventoryPostingTypes[item.id])) {
      toast.error("Choose how every LC item should be posted.");
      return;
    }
    const assetItem = pendingItems.find((item) => inventoryPostingTypes[item.id] === "ASSET");
    if (assetItem) {
      toast.error(`Complete fixed asset registration for ${assetItem.productName} first.`);
      return;
    }
    const items = lc.items
      .filter((item) => !item.inventoryPosting)
      .map((item) => ({
        lcItemId: item.id,
        inventoryItemId: inventoryPostingTypes[item.id] === "EXISTING" ? inventoryPostingItems[item.id] : undefined,
        postingType: inventoryPostingTypes[item.id] as "EXISTING" | "NEW" | "ONE_TIME",
        warehouseId: inventoryPostingWarehouses[item.id],
      }));
    if (items.some((item) => !item.warehouseId || (item.postingType === "EXISTING" && !item.inventoryItemId))) {
      toast.error("Complete the product and warehouse selection for every row.");
      return;
    }
    try {
      await postInventoryMutation.mutateAsync({ id: lc.id, items });
      toast.success("LC items posted to warehouse at finalized landed cost");
      setInventoryPostingOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post LC items to inventory");
    }
  }

  useEffect(() => {
    if (!lc) return;
    setProfitDraft((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const item of lc.items) {
        if (!next[item.id]) {
          next[item.id] = { mode: item.profitMode ?? "PERCENTAGE", value: item.profitValue != null ? String(item.profitValue) : "0" };
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [lc]);

  function updateProfitDraft(lcItemId: string, patch: Partial<{ mode: LcProfitMode; value: string }>) {
    setProfitDraft((previous) => ({
      ...previous,
      [lcItemId]: { mode: previous[lcItemId]?.mode ?? "PERCENTAGE", value: previous[lcItemId]?.value ?? "0", ...patch },
    }));
  }

  function sellingPriceFor(row: LcLandedCostItemRecord) {
    return roundMoney(row.unitLandedCost + profitAmountFor(row));
  }

  function profitAmountFor(row: LcLandedCostItemRecord) {
    const draft = profitDraft[row.lcItemId];
    if (!draft) return 0;
    const value = Number(draft.value) || 0;
    return roundMoney(draft.mode === "FIXED" ? value : row.unitLandedCost * value / 100);
  }

  function profitPercentageFor(row: LcLandedCostItemRecord) {
    const draft = profitDraft[row.lcItemId];
    if (!draft) return 0;
    const value = Number(draft.value) || 0;
    if (draft.mode === "PERCENTAGE") return value;
    return row.unitLandedCost > 0 ? value / row.unitLandedCost * 100 : 0;
  }

  function editableProfitNumber(value: number, mode: "PERCENTAGE" | "FIXED") {
    return mode === "FIXED" ? formatAmount(value).replace(/,/g, "") : String(Number(value.toFixed(4)));
  }

  async function handleSaveProfit() {
    if (!lc) return;
    const items = lc.items.map((item) => {
      const draft = profitDraft[item.id];
      const profitMode = draft?.mode ?? "PERCENTAGE";
      const profitValue = Number(draft?.value) || 0;
      return { lcItemId: item.id, profitMode, profitValue: profitMode === "FIXED" ? roundMoney(profitValue) : profitValue };
    });
    try {
      await updateProfitMutation.mutateAsync({ id: lc.id, items });
      toast.success("Product-wise profit saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save profit");
    }
  }

  useEffect(() => {
    if (!lcId) return;
    setTab(initialTab);
    setExpandedCostEntry(null);
  }, [initialTab, lcId]);

  const finalizationBlockers = useMemo(() => {
    if (!lc) return [];
    const blockers: string[] = [];
    if (lc.purchasePaymentStatus !== "PAID" || moneyToMinorUnits(lc.purchasePayableAmount) !== 0) {
      blockers.push(`Purchase payment due: ${formatCurrency(lc.purchasePayableAmount)}. Full payment is required before finalizing.`);
    }
    for (const item of lc.items) {
      if (item.receivedQuantity <= 0) blockers.push(`"${item.productName}" needs a GRN.`);
    }
    for (const entry of lc.costEntries.filter((e) => e.includeInLandedCost)) {
      if (!entry.isFullyAllocated) blockers.push(`"${entry.costHeadName}" is not fully allocated.`);
    }
    if (landedCostPreview && moneyToMinorUnits(landedCostPreview.allocationDifference) !== 0) {
      blockers.push(`Allocation difference is ${formatCurrency(landedCostPreview.allocationDifference)}.`);
    }
    return blockers;
  }, [lc, landedCostPreview]);

  const timelineEvents = useMemo(() => {
    if (!lc) return [];
    const events: Array<{ id: string; date: string; title: string; detail: string; tone: "blue" | "green" | "amber" | "slate"; costEntryId?: string }> = [
      { id: `created-${lc.id}`, date: lc.createdAt, title: "LC Created", detail: `${lc.lcNumber} created for ${lc.supplierName}.`, tone: "blue" },
      ...lc.statusHistory.map((entry) => ({
        id: `status-${entry.id}`,
        date: entry.changedAt,
        title: `Status: ${STATUS_TONE[entry.toStatus].label}`,
        detail: `${entry.fromStatus ? `${STATUS_TONE[entry.fromStatus].label} → ` : ""}${STATUS_TONE[entry.toStatus].label}${entry.reason ? ` · ${entry.reason}` : ""}`,
        tone: entry.toStatus === "FINALIZED" ? "green" as const : entry.toStatus.includes("PENDING") ? "amber" as const : "slate" as const,
      })),
      ...lc.shipments.map((shipment) => ({
        id: `shipment-${shipment.id}`,
        date: shipment.createdAt,
        title: "Shipment Recorded",
        detail: [shipment.shipmentNumber, shipment.blAwbNumber ? `BL/AWB ${shipment.blAwbNumber}` : null, shipment.transportMode ? `By ${shipment.transportMode}` : null].filter(Boolean).join(" · ") || "Shipment information added.",
        tone: "blue" as const,
      })),
      ...lc.costEntries.map((entry) => ({
        id: `cost-${entry.id}`,
        costEntryId: entry.id,
        date: entry.createdAt,
        title: "Import Cost Posted",
        detail: `${entry.costHeadName} · ${formatCurrency(entry.bdtAmount)}${entry.isFullyAllocated ? " · Fully allocated" : " · Allocation pending"}`,
        tone: entry.isFullyAllocated ? "green" as const : "amber" as const,
      })),
      ...lc.grns.map((grn) => ({
        id: `grn-${grn.id}`,
        date: grn.createdAt,
        title: "GRN Recorded",
        detail: `${grn.grnNumber}${grn.warehouseName ? ` · ${grn.warehouseName}` : ""} · ${grn.items.length} product${grn.items.length === 1 ? "" : "s"}`,
        tone: "green" as const,
      })),
      ...(lc.landedCost?.finalizedAt ? [{ id: `finalized-${lc.landedCost.id}`, date: lc.landedCost.finalizedAt, title: "Landed Cost Finalized", detail: `Final landed cost ${formatCurrency(lc.landedCost.landedCostTotal)}.`, tone: "green" as const }] : []),
      ...(lc.landedCost?.reopenedAt ? [{ id: `reopened-${lc.landedCost.id}`, date: lc.landedCost.reopenedAt, title: "Landed Cost Reopened", detail: lc.landedCost.reopenReason || "Landed cost was reopened.", tone: "amber" as const }] : []),
    ];
    return events.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  }, [lc]);

  async function confirmDeleteCostEntry() {
    if (!lc || !deleteCostEntry) return;
    try {
      await deleteCostEntryMutation.mutateAsync({ id: lc.id, costEntryId: deleteCostEntry.id });
      toast.success("Cost posting deleted");
      setDeleteCostEntry(null);
      setExpandedCostEntry(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cost posting could not be deleted");
    }
  }

  async function handleFinalize() {
    if (!lc) return;
    try {
      await finalizeMutation.mutateAsync(lc.id);
      toast.success("Landed cost finalized");
      setFinalizeConfirmOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not finalize landed cost");
    }
  }

  async function handleReopen() {
    if (!lc || !reopenReason.trim()) return;
    try {
      await reopenMutation.mutateAsync({ id: lc.id, reason: reopenReason.trim() });
      toast.success("Landed cost reopened");
      setReopenOpen(false);
      setReopenReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reopen landed cost");
    }
  }

  async function handleCloseLc() {
    if (!lc) return;
    try {
      await setStatusMutation.mutateAsync({
        id: lc.id,
        status: "CLOSED",
        reason: closeNote.trim() || "LC closed after inventory posting",
      });
      toast.success("LC closed successfully");
      setCloseOpen(false);
      setCloseNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not close LC");
    }
  }

  async function handleCreateGrn() {
    if (!lc) return;
    const items = lc.items
      .map((item) => ({
        lcItemId: item.id,
        receivedQuantity: Number(grnQuantities[item.id] || 0),
        damagedQuantity: Number(grnDamagedQuantities[item.id] || 0),
        rejectedQuantity: Number(grnRejectedQuantities[item.id] || 0),
      }))
      .filter((row) => row.receivedQuantity > 0);
    if (!items.length) {
      toast.error("Enter received quantity for at least one product.");
      return;
    }
    try {
      const input = { receivedDate: grnDate, warehouseId: grnWarehouseId || undefined, remarks: grnRemarks.trim() || undefined, items };
      if (editingGrnId) {
        await updateGrnMutation.mutateAsync({ id: lc.id, grnId: editingGrnId, input });
        toast.success("GRN updated");
      } else {
        await createGrnMutation.mutateAsync({ id: lc.id, input });
        toast.success("GRN recorded");
      }
      setGrnFormOpen(false);
      setEditingGrnId(null);
      setGrnQuantities({});
      setGrnDamagedQuantities({});
      setGrnRejectedQuantities({});
      setGrnRemarks("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "GRN could not be saved");
    }
  }

  function openNewGrnForm() {
    setEditingGrnId(null);
    setGrnDate(new Date().toISOString().slice(0, 10));
    setGrnWarehouseId("");
    setGrnQuantities({});
    setGrnDamagedQuantities({});
    setGrnRejectedQuantities({});
    setGrnRemarks("");
    setGrnFormOpen(true);
  }

  function openEditGrnForm(grn: LcGrnRecord) {
    setEditingGrnId(grn.id);
    setGrnDate(grn.receivedDate.slice(0, 10));
    setGrnWarehouseId(grn.warehouseId ?? "");
    setGrnQuantities(Object.fromEntries(grn.items.map((item) => [item.lcItemId, String(item.receivedQuantity)])));
    setGrnDamagedQuantities(Object.fromEntries(grn.items.map((item) => [item.lcItemId, item.damagedQuantity ? String(item.damagedQuantity) : ""])));
    setGrnRejectedQuantities(Object.fromEntries(grn.items.map((item) => [item.lcItemId, item.rejectedQuantity ? String(item.rejectedQuantity) : ""])));
    setGrnRemarks(grn.remarks ?? "");
    setGrnFormOpen(true);
  }

  function closeGrnForm() {
    setGrnFormOpen(false);
    setEditingGrnId(null);
  }

  const detailContent = (
    <>
        {!lc ? (
          <div className="p-8 text-sm text-[#8994a6]">Loading LC...</div>
        ) : (
          <div className={cn("flex flex-col", variant === "page" ? "h-full min-h-0" : "max-h-[92vh]")}>
            <div className="relative border-b border-[#e9edf3] px-5 pb-3 pt-5">
              {variant === "page" ? (
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close LC details"
                  title="Close and return to LC Dashboard"
                  className="!absolute right-5 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-[#cbd5e1] bg-white p-0 text-[#475569] shadow-sm transition-colors hover:border-[#ef9a9a] hover:bg-[#fff1f1] hover:text-[#c62828]"
                >
                  <X className="h-5 w-5 stroke-[2.5]" />
                </button>
              ) : null}
              <div className="pr-8">
                {variant === "page" ? (
                  <h1 className="flex items-center gap-2 text-xl font-semibold text-[#14233b]">
                    {lc.lcNumber}
                    <Badge tone="slate" className={cn("border", STATUS_TONE[lc.status].className)}>{STATUS_TONE[lc.status].label}</Badge>
                  </h1>
                ) : (
                  <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-[#14233b]">
                    {lc.lcNumber}
                    <Badge tone="slate" className={cn("border", STATUS_TONE[lc.status].className)}>{STATUS_TONE[lc.status].label}</Badge>
                  </DialogTitle>
                )}
                {variant === "page" ? (
                  <p className="mt-0.5 text-sm text-[#6f7d91]">{lc.supplierName}{lc.supplierCountry ? ` · ${lc.supplierCountry}` : ""}</p>
                ) : (
                  <DialogDescription className="mt-0.5 text-sm text-[#6f7d91]">{lc.supplierName}{lc.supplierCountry ? ` · ${lc.supplierCountry}` : ""}</DialogDescription>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div><div className="text-xs text-[#8994a6]">Exchange Rate</div><div className="font-medium text-[#14233b]">1 {lc.currency} = {formatCurrency(lc.exchangeRate)}</div></div>
                <div><div className="text-xs text-[#8994a6]">Purchase Value</div><div className="font-medium text-[#14233b]">{formatCurrency(lc.purchaseCostTotal)}</div></div>
                <div><div className="text-xs text-[#8994a6]">Import Cost</div><div className="font-medium text-[#14233b]">{formatCurrency(lc.importCostTotal)}</div></div>
                <div><div className="text-xs text-[#8994a6]">Total Landed Cost</div><div className="font-semibold text-[#0f6cf6]">{formatCurrency(lc.landedCost?.landedCostTotal ?? lc.landedCostTotalPreview)}</div></div>
              </div>
              <nav className="mt-4 flex gap-1 overflow-x-auto" aria-label="LC sections">
                {TABS.map((entry) => {
                  const Icon = entry.icon;
                  const active = entry.id === tab;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => selectTab(entry.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "border-[#0f6cf6] bg-[#eef5ff] text-[#0f6cf6]"
                          : "border-transparent text-[#6f7d91] hover:border-[#d7e1ee] hover:bg-[#f7faff] hover:text-[#334155]",
                      )}
                    >
                      <Icon className="h-4 w-4" /> {entry.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div ref={contentScrollRef} className="transient-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              {tab === "overview" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2 rounded-[8px] border border-[#e7edf5] p-4 text-sm">
                    <div className="font-semibold text-[#14233b]">LC Details</div>
                    <div className="flex justify-between"><span className="text-[#8994a6]">LC Date</span><span>{formatDate(lc.lcDate)}</span></div>
                    <div className="flex justify-between"><span className="text-[#8994a6]">Bank</span><span>{lc.bankName ?? "—"} {lc.bankBranch ? `(${lc.bankBranch})` : ""}</span></div>
                    <div className="flex justify-between"><span className="text-[#8994a6]">Incoterm</span><span>{lc.incoterm ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-[#8994a6]">Origin -&gt; Destination</span><span>{lc.originPort ?? "—"} -&gt; {lc.destinationPort ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-[#8994a6]">Destination Warehouse</span><span>{lc.destinationWarehouseName ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-[#8994a6]">PO / PI Reference</span><span>{lc.purchaseOrderRef ?? "—"} / {lc.piReference ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-[#8994a6]">Supplier Payment</span><span>{lc.purchasePaymentStatus === "PAID" ? "Fully Paid" : lc.purchasePaymentStatus === "PARTIAL" ? "Partially Paid" : "Unpaid / Payable"}</span></div>
                    <div className="flex justify-between"><span className="text-[#8994a6]">Paid / Payable</span><span>{formatCurrency(lc.purchasePaidAmount)} / {formatCurrency(lc.purchasePayableAmount)}</span></div>
                    {lc.paymentReference ? <div className="flex justify-between"><span className="text-[#8994a6]">Payment Reference</span><span>{lc.paymentReference}</span></div> : null}
                    {moneyToMinorUnits(lc.purchasePayableAmount) > 0 && !paymentManagerOpen ? <Button type="button" size="sm" onClick={() => setPaymentManagerOpen(true)}>Record Payment</Button> : null}
                    <div className="flex justify-between"><span className="text-[#8994a6]">Expiry Date</span><span>{lc.expiryDate ? formatDate(lc.expiryDate) : "—"}</span></div>
                  </div>
                  <div className="grid gap-2 rounded-[8px] border border-[#e7edf5] p-4 text-sm">
                    <div className="font-semibold text-[#14233b]">Finalization Checklist</div>
                    {finalizationBlockers.length === 0 ? (
                      <p className="text-[#08783d]">Ready to finalize.</p>
                    ) : (
                      <ul className="list-inside list-disc space-y-1 text-[#995300]">
                        {finalizationBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                      </ul>
                    )}
                  </div>
                  {paymentManagerOpen ? <LcPaymentManager lc={lc} onDone={() => setPaymentManagerOpen(false)} /> : null}
                </div>
              ) : null}

              {tab === "products" ? (
                <div className="overflow-x-auto rounded-[8px] border border-[#e7edf5]">
                  <table className="min-w-[900px] w-full text-sm">
                    <thead className="bg-[#f7faff] text-xs uppercase text-[#8994a6]">
                      <tr>
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">USD/Unit</th>
                        <th className="px-3 py-2 text-right">BDT/Unit</th>
                        <th className="px-3 py-2 text-right">Total Purchase</th>
                        <th className="px-3 py-2 text-right">Received</th>
                        <th className="px-3 py-2 text-right">Landed/Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lc.items.map((item) => (
                        <tr
                          key={item.id}
                          role={item.inventoryItemId ? "link" : undefined}
                          tabIndex={item.inventoryItemId ? 0 : undefined}
                          aria-label={item.inventoryItemId ? `Open product ${item.productName}` : undefined}
                          title={item.inventoryItemId ? `Open ${item.productName} in Products & Services` : "This LC item is not linked to Products & Services"}
                          onClick={() => { if (item.inventoryItemId) router.push(`${buildWorkspaceRoute(mode, "/masters/inventory")}?tab=products&item=${encodeURIComponent(item.inventoryItemId)}`); }}
                          onKeyDown={(event) => { if (item.inventoryItemId && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); router.push(`${buildWorkspaceRoute(mode, "/masters/inventory")}?tab=products&item=${encodeURIComponent(item.inventoryItemId)}`); } }}
                          className={cn("border-t border-[#eef2f7] transition-colors", item.inventoryItemId && "cursor-pointer hover:bg-[#f2f7ff] focus-visible:bg-[#f2f7ff] focus-visible:outline-none")}
                        >
                          <td className="px-3 py-2">{item.productName}<div className="text-xs text-[#8994a6]">{item.unit}{item.hsCode ? ` · HS ${item.hsCode}` : ""}</div></td>
                          <td className="px-3 py-2 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-right">{formatCurrencyUsd(item.usdUnitPrice)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(item.effectiveBdtUnitPrice)}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.totalPurchaseCostBdt)}</td>
                          <td className="px-3 py-2 text-right">{item.receivedQuantity} / {item.quantity}</td>
                          <td className="px-3 py-2 text-right">{item.landedCostPerUnit !== null ? formatCurrency(item.landedCostPerUnit) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {tab === "shipments" ? (
                <div className={cn("grid gap-2", variant === "page" && lc.shipments.length === 0 && "h-full")}>
                  {lc.shipments.length === 0 ? <LcEmptyState icon={Ship} title="No shipments recorded yet" description="Shipment details, ports and tracking information will appear here after the first shipment is added." compact={variant !== "page"} className={variant === "page" ? "h-full min-h-[420px]" : undefined} /> : null}
                  {lc.shipments.map((shipment) => (
                    <div key={shipment.id} className="grid grid-cols-2 gap-2 rounded-[8px] border border-[#e7edf5] p-3 text-sm sm:grid-cols-4">
                      <div><div className="text-xs text-[#8994a6]">Mode</div><div>{shipment.transportMode ? `By ${shipment.transportMode.charAt(0)}${shipment.transportMode.slice(1).toLowerCase()}` : "—"}</div></div>
                      <div><div className="text-xs text-[#8994a6]">Shipment No</div><div>{shipment.shipmentNumber ?? "—"}</div></div>
                      <div><div className="text-xs text-[#8994a6]">BL/AWB</div><div>{shipment.blAwbNumber ?? "—"}</div></div>
                      <div><div className="text-xs text-[#8994a6]">ETD / ETA</div><div>{shipment.etd ? formatDate(shipment.etd) : "—"} / {shipment.eta ? formatDate(shipment.eta) : "—"}</div></div>
                      <div><div className="text-xs text-[#8994a6]">Forwarder</div><div>{shipment.forwarderName ?? "—"}</div></div>
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === "costs" ? (
                <div className="grid gap-3">
                  <div className="flex justify-end">
                    <Button type="button" size="sm" onClick={() => router.push(`/app/lc-management/cost-posting/${lc.id}?returnTo=${encodeURIComponent(`/app/lc-management/${lc.id}?tab=costs`)}`)} disabled={lc.status === "FINALIZED"}>+ Add Cost</Button>
                  </div>
                  {lc.costEntries.length === 0 ? <LcEmptyState icon={Banknote} title="No import costs posted yet" description="Add banking, customs, freight or local charges to start building the landed cost." actionLabel={lc.status !== "FINALIZED" ? "Add Cost" : undefined} onAction={lc.status !== "FINALIZED" ? () => router.push(`/app/lc-management/cost-posting/${lc.id}?returnTo=${encodeURIComponent(`/app/lc-management/${lc.id}?tab=costs`)}`) : undefined} compact /> : null}
                  {lc && expandedCostEntry === "__legacy-disabled__" && lc.costEntries.map((entry) => (
                    <div key={entry.id} className="rounded-[8px] border border-[#e7edf5] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 font-medium text-[#14233b]">
                            {entry.costHeadName}
                            <Badge tone="slate">{entry.category.replace(/_/g, " ")}</Badge>
                            {entry.isFullyAllocated ? <Badge tone="green">Allocated</Badge> : <Badge tone="amber">Remaining {formatCurrency(entry.remainingAmount)}</Badge>}
                          </div>
                          <div className="text-xs text-[#8994a6]">{entry.vendorName ?? "No vendor"} {entry.invoiceNumber ? `· Inv ${entry.invoiceNumber}` : ""}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-[#14233b]">{formatCurrency(entry.bdtAmount)}</span>
                          <Button type="button" variant="outline" size="sm" onClick={() => setExpandedCostEntry((current) => (current === entry.id ? null : entry.id))}>
                            {expandedCostEntry === entry.id ? "Hide Details" : "View Details"}
                          </Button>
                          {!entry.isLocked ? (
                            <><Button type="button" variant="outline" size="sm" onClick={() => router.push(`/app/lc-management/cost-posting/${lc.id}/${entry.id}/edit?returnTo=${encodeURIComponent(`/app/lc-management/${lc.id}?tab=costs`)}`)}>Edit</Button><Button type="button" variant="outline" size="sm" className="text-[#c63c3c]" onClick={() => setDeleteCostEntry(entry)}>Delete</Button></>
                          ) : null}
                        </div>
                      </div>
                      {expandedCostEntry === entry.id ? <div className="grid gap-2">{!entry.includeInLandedCost ? <p className="mt-3 rounded-lg border border-[#cfe0f5] bg-[#f4f8fd] px-3 py-2 text-sm text-[#52657d]">Item-wise allocation is for tracking only; this posting is excluded from the Landed Cost total.</p> : null}<AllocationEditor lcId={lc.id} entry={entry} onSaved={() => setExpandedCostEntry(null)} /></div> : null}
                    </div>
                  ))}
                  {lc.costEntries.length ? <div className="overflow-x-auto rounded-[8px] border border-[#e7edf5]">
                    <table className="w-full min-w-[900px] text-sm">
                      <thead className="bg-[#f7f9fc] text-xs uppercase tracking-wide text-[#75849a]"><tr><th className="px-3 py-2.5 text-left">Date</th><th className="px-3 py-2.5 text-left">Expense Category</th><th className="px-3 py-2.5 text-left">Basis</th><th className="px-3 py-2.5 text-left">Narration</th><th className="px-3 py-2.5 text-right">Amount</th><th className="px-3 py-2.5 text-center">View Details</th><th className="px-3 py-2.5 text-center">Edit</th><th className="px-3 py-2.5 text-center">Delete</th></tr></thead>
                      <tbody>{[...lc.costEntries].sort((left, right) => String(right.invoiceDate ?? right.createdAt).localeCompare(String(left.invoiceDate ?? left.createdAt))).map((entry) => <Fragment key={entry.id}>
                        <tr className="border-t border-[#edf1f6] bg-white">
                          <td className="whitespace-nowrap px-3 py-2.5 text-[#53647b]">{formatDate(entry.invoiceDate ?? entry.createdAt)}</td>
                          <td className="px-3 py-2.5"><div className="font-medium text-[#14233b]">{entry.costHeadName}</div><div className="mt-0.5 text-[11px] text-[#8994a6]">{entry.category.replace(/_/g, " ")}</div></td>
                          <td className="whitespace-nowrap px-3 py-2.5"><div className="font-medium text-[#334155]">{allocationBasisLabel(entry.allocationBasis)}</div><div className={cn("mt-0.5 text-[11px]", entry.isFullyAllocated ? "text-[#8994a6]" : "font-medium text-[#d97706]")}>{entry.isFullyAllocated ? allocationModeLabel(entry.allocationMode) : "Pending save"}</div></td>
                          <td className="max-w-[360px] px-3 py-2.5 text-[#53647b]"><div className="truncate">{entry.remarks || entry.paymentAllocations[0]?.reference || entry.vendorName || "—"}</div></td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-[#14233b]">{formatCurrency(entry.bdtAmount)}</td>
                          <td className="px-3 py-2.5 text-center"><Button type="button" variant="outline" size="sm" onClick={() => setExpandedCostEntry((current) => current === entry.id ? null : entry.id)}>{expandedCostEntry === entry.id ? "Hide Details" : "View Details"}</Button></td>
                          <td className="px-3 py-2.5 text-center">{!entry.isLocked ? <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/app/lc-management/cost-posting/${lc.id}/${entry.id}/edit?returnTo=${encodeURIComponent(`/app/lc-management/${lc.id}?tab=costs`)}`)}>Edit</Button> : "—"}</td>
                          <td className="px-3 py-2.5 text-center">{!entry.isLocked ? <Button type="button" variant="outline" size="sm" className="text-[#c63c3c]" onClick={() => setDeleteCostEntry(entry)}>Delete</Button> : "—"}</td>
                        </tr>
                        {expandedCostEntry === entry.id ? <tr className="border-t border-[#edf1f6] bg-[#fbfdff]"><td colSpan={8} className="px-3 pb-3">{!entry.includeInLandedCost ? <p className="mt-3 rounded-lg border border-[#cfe0f5] bg-[#f4f8fd] px-3 py-2 text-sm text-[#52657d]">Item-wise allocation is for tracking only; this posting is excluded from the Landed Cost total.</p> : null}<AllocationEditor lcId={lc.id} entry={entry} readOnly /></td></tr> : null}
                      </Fragment>)}</tbody>
                    </table>
                  </div> : null}
                </div>
              ) : null}

              {tab === "grn" ? (
                <div className="grid gap-3">
                  <div className="flex justify-end">
                    {!grnFormOpen ? <Button type="button" size="sm" onClick={openNewGrnForm} disabled={lc.status === "FINALIZED" || lc.status === "CLOSED"}>+ Add GRN</Button> : null}
                  </div>
                  {grnFormOpen ? (
                    <div className="grid gap-3 rounded-[8px] border border-[#d7e1ee] bg-[#fbfdff] p-3">
                      <div className="flex items-center justify-between"><h3 className="font-semibold text-[#14233b]">{editingGrnId ? "Edit GRN" : "Add GRN"}</h3>{editingGrnId ? <span className="text-xs text-[#6f7d91]">Previously posted receipt correction</span> : null}</div>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="grid gap-1 text-xs">
                          <span className="font-medium text-[#6f7d91]">Received Date</span>
                          <AppDateInput value={grnDate} onChange={setGrnDate} />
                        </label>
                        <label className="grid gap-1 text-xs">
                          <span className="font-medium text-[#6f7d91]">Warehouse</span>
                          <select value={grnWarehouseId} onChange={(event) => setGrnWarehouseId(event.target.value)} className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm">
                            <option value="">{lc.destinationWarehouseName ?? "Select warehouse"}</option>
                            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className="overflow-x-auto rounded-[6px] border border-[#e7edf5]">
                        <table className="min-w-[500px] w-full text-sm">
                          <thead className="bg-white text-xs uppercase text-[#8994a6]">
                            <tr><th className="px-2 py-2 text-left">Product</th><th className="px-2 py-2 text-right">Expected</th><th className="px-2 py-2 text-right">Received</th><th className="px-2 py-2 text-right">Damaged</th><th className="px-2 py-2 text-right">Rejected</th></tr>
                          </thead>
                          <tbody>
                            {lc.items.map((item) => (
                              <tr key={item.id} className="border-t border-[#eef2f7]">
                                <td className="px-2 py-1.5">{item.productName}</td>
                                <td className="px-2 py-1.5 text-right text-[#6f7d91]">{Math.max(0, item.quantity - item.receivedQuantity + (editingGrnId ? Number(grnQuantities[item.id] || 0) : 0))}</td>
                                <td className="px-2 py-1.5 text-right">
                                  <Input type="number" value={grnQuantities[item.id] ?? ""} onChange={(event) => setGrnQuantities((current) => ({ ...current, [item.id]: event.target.value }))} className="h-8 w-24 text-right" />
                                </td>
                                <td className="px-2 py-1.5 text-right"><Input type="number" min="0" value={grnDamagedQuantities[item.id] ?? ""} onChange={(event) => setGrnDamagedQuantities((current) => ({ ...current, [item.id]: event.target.value }))} className="h-8 w-20 text-right" /></td>
                                <td className="px-2 py-1.5 text-right"><Input type="number" min="0" value={grnRejectedQuantities[item.id] ?? ""} onChange={(event) => setGrnRejectedQuantities((current) => ({ ...current, [item.id]: event.target.value }))} className="h-8 w-20 text-right" /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <label className="grid gap-1 text-xs"><span className="font-medium text-[#6f7d91]">Note</span><Input value={grnRemarks} onChange={(event) => setGrnRemarks(event.target.value)} placeholder="Shortage, damage or receiving note..." /></label>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={closeGrnForm}>Cancel</Button>
                        <Button type="button" size="sm" onClick={() => void handleCreateGrn()} disabled={createGrnMutation.isPending || updateGrnMutation.isPending}>
                          {createGrnMutation.isPending || updateGrnMutation.isPending ? "Saving..." : editingGrnId ? "Update GRN" : "Save GRN"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {lc.grns.length === 0 && !grnFormOpen ? <LcEmptyState icon={Truck} title="No GRN recorded yet" description="Record the first goods receipt when products arrive at the destination warehouse." actionLabel={lc.status !== "FINALIZED" && lc.status !== "CLOSED" ? "Add GRN" : undefined} onAction={lc.status !== "FINALIZED" && lc.status !== "CLOSED" ? openNewGrnForm : undefined} compact /> : null}
                  {lc.grns.map((grn) => (
                    <div key={grn.id} className="overflow-x-auto rounded-[8px] border border-[#e7edf5]">
                      <div className="flex items-center justify-between bg-[#f7faff] px-3 py-2 text-sm font-medium text-[#14233b]">
                        <span>{grn.grnNumber} · {formatDate(grn.receivedDate)}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#8994a6]">{grn.warehouseName ?? "—"}</span>
                          {lc.status !== "FINALIZED" && lc.status !== "CLOSED" ? <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2" onClick={() => openEditGrnForm(grn)}><Pencil className="h-3.5 w-3.5" /> Edit GRN</Button> : null}
                        </div>
                      </div>
                      <table className="min-w-[600px] w-full text-sm">
                        <thead className="text-xs uppercase text-[#8994a6]">
                          <tr><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-right">Expected</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Damaged</th><th className="px-3 py-2 text-right">Rejected</th><th className="px-3 py-2 text-right">Short</th><th className="px-3 py-2 text-right">Excess</th></tr>
                        </thead>
                        <tbody>
                          {grn.items.map((item) => {
                            const product = lc.items.find((entry) => entry.id === item.lcItemId);
                            return (
                              <tr key={item.id} className="border-t border-[#eef2f7]">
                                <td className="px-3 py-2">{product?.productName ?? "—"}</td>
                                <td className="px-3 py-2 text-right">{item.expectedQuantity}</td>
                                <td className="px-3 py-2 text-right">{item.receivedQuantity}</td>
                                <td className="px-3 py-2 text-right text-[#995300]">{item.damagedQuantity || "—"}</td>
                                <td className="px-3 py-2 text-right text-[#995300]">{item.rejectedQuantity || "—"}</td>
                                <td className="px-3 py-2 text-right text-[#c63c3c]">{item.shortQuantity || "—"}</td>
                                <td className="px-3 py-2 text-right text-[#995300]">{item.excessQuantity || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {grn.remarks ? <div className="border-t border-[#eef2f7] px-3 py-2 text-xs text-[#6f7d91]"><span className="font-medium text-[#14233b]">Note:</span> {grn.remarks}</div> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === "landed-cost" ? (
                <div className="flex h-full min-h-0 flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: "Purchase Cost", value: landedCostPreview?.purchaseCostTotal ?? lc.purchaseCostTotal },
                      { label: "Import / Additional Cost", value: landedCostPreview?.importCostTotal ?? lc.importCostTotal },
                      { label: "Total Landed Cost", value: landedCostPreview?.landedCostTotal ?? lc.landedCostTotalPreview },
                      { label: "Allocation Difference", value: landedCostPreview?.allocationDifference ?? 0 },
                    ].map((card) => (
                      <div key={card.label} className="rounded-[8px] border border-[#e7edf5] p-3">
                        <div className="text-xs text-[#8994a6]">{card.label}</div>
                        <div className={cn("mt-1 text-lg font-semibold", card.label === "Allocation Difference" && moneyToMinorUnits(card.value) !== 0 ? "text-[#c63c3c]" : "text-[#14233b]")}>{formatCurrency(card.value)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-[10px] border border-[#dbe4ef] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                    <div className="border-b border-[#e7edf5] bg-[#fbfdff] px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#74839a]">All amounts in BDT</div>
                    <table className="w-full table-fixed text-[11px] leading-normal">
                      <colgroup>
                        <col className="w-[4%]" />
                        <col className="w-[3%]" />
                        <col className="w-[11%]" />
                        <col className="w-[5%]" />
                        <col className="w-[6%]" />
                        {landedCostDisplayColumns.map((column) => <col key={column.key} style={{ width: `${39 / Math.max(landedCostDisplayColumns.length, 1)}%` }} />)}
                        <col className="w-[6%]" />
                        <col className="w-[7%]" />
                        <col className="w-[6%]" />
                        <col className="w-[7%]" />
                      </colgroup>
                      <thead className="border-b border-[#dbe4ef] bg-[#f4f7fb] text-[10px] font-semibold uppercase tracking-[0.02em] text-[#5f7088]">
                        <tr>
                          <th className="px-1.5 py-3 text-right">Order</th>
                          <th className="px-1 py-3 text-left">Unit</th>
                          <th className="px-2 py-3 text-left">Product</th>
                          <th className="border-l border-[#e2e8f0] px-1.5 py-3 text-right">Received</th>
                          <th className="px-1.5 py-3 text-right">Short / Damage</th>
                          {landedCostDisplayColumns.map((column) => <th key={column.key} title={column.label} className="border-l border-[#e2e8f0] px-1.5 py-3 text-right"><span className="block truncate">{column.label}</span></th>)}
                          <th className="border-l border-[#e2e8f0] px-1.5 py-3 text-right">Unit Cost</th>
                          <th className="px-1.5 py-3 text-right">Profit %</th>
                          <th className="px-1.5 py-3 text-right">Profit BDT</th>
                          <th className="px-1.5 py-3 text-right">Selling Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(landedCostPreview?.items ?? []).map((row) => {
                          const product = lc.items.find((item) => item.id === row.lcItemId);
                          const draft = profitDraft[row.lcItemId];
                          return (
                            <tr key={row.lcItemId} className="border-t border-[#e8edf4] transition-colors hover:bg-[#f8fbff]">
                              <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">{product?.quantity ?? row.receivedQuantity}</td>
                              <td className="whitespace-nowrap px-2 py-3 text-left text-[#52647d]">{product?.unit || "—"}</td>
                              <td className="truncate px-3 py-3 font-medium text-[#14233b]" title={product?.productName}>{product?.productName ?? "—"}</td>
                              <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">{row.receivedQuantity}</td>
                              <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums text-[#c2410c]">
                                {Math.max(0, (product?.quantity ?? row.receivedQuantity) - row.receivedQuantity)} / {(lc.grns ?? []).flatMap((grn) => grn.items).filter((item) => item.lcItemId === row.lcItemId).reduce((sum, item) => sum + item.damagedQuantity + item.rejectedQuantity, 0)}
                              </td>
                              {landedCostDisplayColumns.map((column) => (
                                <td key={column.key} className={cn("whitespace-nowrap border-l border-[#eef2f7] px-1.5 py-3 text-right tabular-nums", column.source === "total" ? "bg-[#fbfdff] font-semibold text-[#14233b]" : "")}>{formatLandedAmount(landedCostColumnValue(row, column))}</td>
                              ))}
                              <td className="whitespace-nowrap px-2 py-3 text-right font-medium tabular-nums">{formatLandedAmount(row.unitLandedCost)}</td>
                              <td className="px-2 py-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={draft?.mode === "PERCENTAGE" ? draft.value : editableProfitNumber(profitPercentageFor(row), "PERCENTAGE")}
                                  onChange={(event) => updateProfitDraft(row.lcItemId, { mode: "PERCENTAGE", value: event.target.value })}
                                  disabled={lc.landedCost?.status === "FINALIZED"}
                                  aria-label={`${product?.productName ?? "Product"} profit percentage`}
                                  className="h-8 w-full min-w-0 px-1.5 text-right text-[11px] disabled:bg-[#f1f5f9] disabled:text-[#64748b]"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <Input
                                  money
                                  type="number"
                                  step="0.01"
                                  value={draft?.mode === "FIXED" ? draft.value : editableProfitNumber(profitAmountFor(row), "FIXED")}
                                  onChange={(event) => updateProfitDraft(row.lcItemId, { mode: "FIXED", value: event.target.value })}
                                  disabled={lc.landedCost?.status === "FINALIZED"}
                                  aria-label={`${product?.productName ?? "Product"} profit BDT per unit`}
                                  className="h-8 w-full min-w-0 px-1.5 text-right text-[11px] text-[#08783d] disabled:bg-[#f1f5f9] disabled:text-[#64748b]"
                                />
                              </td>
                              <td className="whitespace-nowrap px-2 py-3 text-right font-semibold tabular-nums text-[#0f6cf6]">{formatLandedAmount(sellingPriceFor(row))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-[#d7e1ee] bg-[#f7faff] font-semibold text-[#14233b]">
                          <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{(landedCostPreview?.items ?? []).reduce((sum, row) => sum + (lc.items.find((item) => item.id === row.lcItemId)?.quantity ?? row.receivedQuantity), 0)}</td>
                          <td className="px-2 py-2.5 text-left text-[#64748b]">—</td>
                          <td className="px-3 py-2.5">Total</td>
                          <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{(landedCostPreview?.items ?? []).reduce((sum, row) => sum + row.receivedQuantity, 0)}</td>
                          <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-[#c2410c]">
                            {(landedCostPreview?.items ?? []).reduce((sum, row) => sum + Math.max(0, (lc.items.find((item) => item.id === row.lcItemId)?.quantity ?? row.receivedQuantity) - row.receivedQuantity), 0)} / {(lc.grns ?? []).flatMap((grn) => grn.items).reduce((sum, item) => sum + item.damagedQuantity + item.rejectedQuantity, 0)}
                          </td>
                          {landedCostDisplayColumns.map((column) => (
                            <td key={column.key} className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                              {formatLandedAmount(sumMoney((landedCostPreview?.items ?? []).map((row) => landedCostColumnValue(row, column))))}
                            </td>
                          ))}
                          <td className="whitespace-nowrap px-1 py-2 text-right tabular-nums">
                            {formatLandedAmount(sumMoney((landedCostPreview?.items ?? []).map((row) => row.unitLandedCost)))}
                          </td>
                          <td className="px-1 py-2 text-right text-xs text-[#64748b]">—</td>
                          <td className="whitespace-nowrap px-1 py-2 text-right tabular-nums text-[#08783d]">
                            {formatLandedAmount(sumMoney((landedCostPreview?.items ?? []).map(profitAmountFor)))}
                          </td>
                          <td className="whitespace-nowrap px-1 py-2 text-right tabular-nums text-[#0f6cf6]">
                            {formatLandedAmount(sumMoney((landedCostPreview?.items ?? []).map(sellingPriceFor)))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="-mx-5 -mb-4 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#e7edf5] bg-[#fbfdff] px-5 py-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                      <span className={cn("h-2 w-2 rounded-full", unpostedExpenseColumns.length ? "bg-[#c7d1df]" : "bg-[#22a06b]")} />
                      <span className="font-semibold text-[#60718a]">{unpostedExpenseColumns.length ? "Expenses Not Posted:" : "All expense categories posted"}</span>
                      {unpostedExpenseColumns.map((column) => (
                        <span key={column.key} className="rounded-full border border-[#e1e7f0] bg-white px-2.5 py-1 text-[11px] text-[#7b8799]">{column.label}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      {lc.status !== "CLOSED" && lc.landedCost?.status === "FINALIZED" && lc.items.some((item) => !item.inventoryPosting) ? (
                        <Button type="button" onClick={openInventoryPosting}>
                          <Package className="mr-1.5 h-4 w-4" /> Post to Warehouse
                        </Button>
                      ) : null}
                      {lc.items.length > 0 && lc.items.every((item) => Boolean(item.inventoryPosting)) ? (
                        <button type="button" onClick={() => setInventoryPostingDetailsOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#8fd2ad] bg-[#e7f7ee] px-3 text-xs font-semibold text-[#08783d] shadow-sm transition-colors hover:border-[#55b47f] hover:bg-[#d6f3e2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#63b98b] focus-visible:ring-offset-2" title="View inventory posting details">
                          <Eye className="h-4 w-4" /> Inventory Posted <span className="border-l border-[#8fd2ad] pl-2">View Details</span>
                        </button>
                      ) : null}
                      {lc.landedCost?.status !== "FINALIZED" ? (
                        <Button type="button" variant="outline" onClick={() => void handleSaveProfit()} disabled={updateProfitMutation.isPending}>
                          {updateProfitMutation.isPending ? "Saving..." : "Save Profit"}
                        </Button>
                      ) : null}
                      {lc.status === "CLOSED" ? (
                        <span className="inline-flex h-9 items-center rounded-md border border-[#c7d1df] bg-[#f1f4f8] px-3 text-xs font-semibold text-[#4d6078]">LC Closed</span>
                      ) : lc.landedCost?.status === "FINALIZED" ? (
                        lc.items.length > 0 && lc.items.every((item) => Boolean(item.inventoryPosting)) ? (
                          <Button type="button" onClick={() => setCloseOpen(true)}>Close LC</Button>
                        ) : (
                          <Button type="button" variant="outline" onClick={() => setReopenOpen(true)}>Reopen</Button>
                        )
                      ) : (
                        <Button type="button" onClick={() => setFinalizeConfirmOpen(true)} disabled={finalizationBlockers.length > 0}>
                          Finalize Landed Cost
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === "history" ? (
                <div className="grid gap-2">
                  {lc.statusHistory.length === 0 ? <LcEmptyState icon={FileClock} title="No audit history yet" description="Status changes and their reasons will be preserved here as this LC progresses." compact /> : null}
                  {lc.statusHistory.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between rounded-[8px] border border-[#e7edf5] px-3 py-2 text-sm">
                      <span>{entry.fromStatus ? `${entry.fromStatus} -> ` : ""}{entry.toStatus}{entry.reason ? ` · ${entry.reason}` : ""}</span>
                      <span className="text-xs text-[#8994a6]">{formatDateTime(entry.changedAt)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === "timeline" ? (
                <div className="mx-auto max-w-4xl py-1">
                  {timelineEvents.length === 0 ? <LcEmptyState icon={Clock3} title="No timeline events yet" description="LC activity will appear here in chronological order." compact /> : null}
                  {timelineEvents.length ? <ol className="relative ml-3 border-l border-[#d7e1ee]">
                    {timelineEvents.map((event, index) => (
                      <li key={event.id} className="relative pb-3 pl-7 last:pb-0">
                        {index > 0 ? (
                          <ChevronUp
                            aria-hidden="true"
                            className="absolute -left-[6px] -top-1 h-3 w-3 bg-white text-[#9aa9bc]"
                            strokeWidth={2}
                          />
                        ) : null}
                        <span className={cn(
                          "absolute -left-[7px] top-[18px] h-3.5 w-3.5 rounded-full border-2 border-white ring-1",
                          event.tone === "green" ? "bg-[#16a05d] ring-[#8fd2ad]" : event.tone === "amber" ? "bg-[#e78a11] ring-[#edc16e]" : event.tone === "blue" ? "bg-[#0f6cf6] ring-[#9fc4f6]" : "bg-[#718096] ring-[#c7d1df]",
                        )} />
                        <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 rounded-[8px] border border-[#e7edf5] bg-white px-3 py-2 shadow-sm">
                          <div className="min-w-0 flex-1 text-sm">
                            <span className="font-semibold text-[#14233b]">{event.title}</span>
                            <span className="mx-2 text-[#c0cad7]">·</span>
                            <span className="text-[#6f7d91]">{event.detail}</span>
                          </div>
                          <time className="shrink-0 text-xs text-[#8994a6]">{formatTimelineDateTime(event.date)}</time>
                          {event.costEntryId ? (() => {
                            const costEntry = lc.costEntries.find((entry) => entry.id === event.costEntryId);
                            if (!costEntry) return null;
                            return <div className="flex shrink-0 flex-wrap justify-end gap-1.5"><Button type="button" variant="outline" size="sm" onClick={() => { selectTab("costs"); setExpandedCostEntry(costEntry.id); }}>View Details</Button>{!costEntry.isLocked ? <><Button type="button" variant="outline" size="sm" onClick={() => router.push(`/app/lc-management/cost-posting/${lc.id}/${costEntry.id}/edit?returnTo=${encodeURIComponent(`/app/lc-management/${lc.id}?tab=timeline`)}`)}>Edit</Button><Button type="button" variant="outline" size="sm" className="text-[#c63c3c]" onClick={() => setDeleteCostEntry(costEntry)}>Delete</Button></> : null}</div>;
                          })() : null}
                        </div>
                      </li>
                    ))}
                  </ol> : null}
                </div>
              ) : null}
            </div>
          </div>
        )}
    </>
  );

  const confirmationDialogs = (
    <>
      {lc ? (
        <>
          <ConfirmationDialog
            open={finalizeConfirmOpen}
            onOpenChange={setFinalizeConfirmOpen}
            title="Finalize Landed Cost"
            description="This locks all cost entries and allocations, and posts a Chart of Accounts journal entry for the total landed cost. Use Reopen with a reason to make further changes afterwards."
            confirmLabel={finalizeMutation.isPending ? "Finalizing..." : "Finalize"}
            onConfirm={() => void handleFinalize()}
          />
          <ConfirmationDialog
            open={Boolean(deleteCostEntry)}
            onOpenChange={(open) => { if (!open) setDeleteCostEntry(null); }}
            title="Delete Cost Posting"
            description={`Are you sure you want to delete "${deleteCostEntry?.costHeadName ?? "this cost posting"}" for ${formatCurrency(deleteCostEntry?.bdtAmount ?? 0)}? Its item-wise allocations will also be removed. This action cannot be undone.`}
            confirmLabel={deleteCostEntryMutation.isPending ? "Deleting..." : "Delete"}
            tone="danger"
            onConfirm={() => void confirmDeleteCostEntry()}
          />
          <Dialog open={inventoryPostingOpen} onOpenChange={(open) => { setInventoryPostingOpen(open); if (!open) setInventoryPostingEditMode(false); }}>
            <DialogContent className="w-[min(94vw,820px)] max-h-[88vh] overflow-y-auto">
              <DialogTitle>{inventoryPostingEditMode ? "Edit Inventory Posting" : "Post Finalized LC to Warehouse"}</DialogTitle>
              <DialogDescription className="mt-1">
                {inventoryPostingEditMode ? "Update the linked product or destination warehouse for the complete posting." : "Choose a posting type for every LC item. All rows must be completed; stock items are received once at the finalized landed unit cost."}
              </DialogDescription>
              <div className="mt-4 overflow-hidden rounded-lg border border-[#dfe7f2]">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-[#f7f9fc] text-xs uppercase text-[#66758b]">
                    <tr><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5 text-right">Received</th><th className="px-3 py-2.5 text-right">Landed Unit Cost</th><th className="px-3 py-2.5">Destination Warehouse</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8edf4]">
                    {lc.items.map((item) => (
                      <tr key={item.id} className={item.inventoryPosting ? "bg-[#f0faf4]" : ""}>
                        <td className="px-3 py-3">
                          <div className="font-medium text-[#14233b]">{item.productName}</div>
                          {(!item.inventoryPosting || inventoryPostingEditMode) ? (
                            <div className="mt-1.5 grid gap-1.5">
                              {!inventoryPostingEditMode ? <select
                                aria-label={`Posting type for ${item.productName}`}
                                value={inventoryPostingTypes[item.id] ?? ""}
                                onChange={(event) => setInventoryPostingTypes((current) => ({ ...current, [item.id]: event.target.value as "" | "EXISTING" | "NEW" | "ONE_TIME" | "ASSET" }))}
                                className="h-9 w-full rounded-md border border-[#d7e1ee] bg-white px-2 text-xs"
                              >
                                <option value="">Choose posting type</option>
                                <option value="EXISTING">Existing Product</option>
                                <option value="NEW">Create New Product</option>
                                <option value="ONE_TIME">One-time Item</option>
                                <option value="ASSET">Register as Fixed Asset</option>
                              </select> : null}
                              {inventoryPostingTypes[item.id] === "EXISTING" ? (
                                <select value={inventoryPostingItems[item.id] ?? ""} onChange={(event) => setInventoryPostingItems((current) => ({ ...current, [item.id]: event.target.value }))} className="h-9 w-full rounded-md border border-[#d7e1ee] bg-white px-2 text-xs">
                                  <option value="">Select existing item</option>
                                  {(inventoryItemsQuery.data ?? []).map((inventoryItem) => <option key={inventoryItem.id} value={inventoryItem.id}>{inventoryItem.itemCode} — {inventoryItem.itemName}</option>)}
                                </select>
                              ) : null}
                              {inventoryPostingTypes[item.id] === "ASSET" ? <button type="button" onClick={() => registerLcItemAsAsset(item)} className="w-fit text-xs font-medium text-[#0f6cf6] hover:underline">Continue to Assets Management</button> : null}
                            </div>
                          ) : null}
                          {item.inventoryPosting ? <div className="mt-0.5 text-xs text-[#08783d]">Posted to {item.inventoryPosting.warehouseName}</div> : null}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{item.receivedQuantity} {item.unit}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(item.landedCostPerUnit ?? 0)}</td>
                        <td className="px-3 py-3">
                          {item.inventoryPosting && !inventoryPostingEditMode ? (
                            <span className="text-[#08783d]">Completed</span>
                          ) : (
                            <select
                              value={inventoryPostingWarehouses[item.id] ?? ""}
                              onChange={(event) => setInventoryPostingWarehouses((current) => ({ ...current, [item.id]: event.target.value }))}
                              disabled={!inventoryPostingTypes[item.id] || inventoryPostingTypes[item.id] === "ASSET" || (inventoryPostingTypes[item.id] === "EXISTING" && !inventoryPostingItems[item.id])}
                              className="h-10 w-full rounded-md border border-[#d7e1ee] bg-white px-3 disabled:bg-[#f1f5f9]"
                            >
                              <option value="">Select warehouse</option>
                              {warehouses.filter((warehouse) => warehouse.isActive && warehouse.allowGrn).map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name} ({warehouse.type.replaceAll("_", " ")})</option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 rounded-lg border border-[#f1d5a8] bg-[#fff9ed] px-3 py-2 text-xs text-[#8a5a13]">
                Existing and new products become regular inventory. One-time items are LC-specific and marked “Do not reorder”. Fixed assets continue through Assets Management and are not added to warehouse stock.
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setInventoryPostingOpen(false)}>Cancel</Button>
                <Button type="button" onClick={() => void handlePostInventory()} disabled={postInventoryMutation.isPending || updateInventoryPostingMutation.isPending}>
                  {inventoryPostingEditMode ? (updateInventoryPostingMutation.isPending ? "Saving..." : "Save Changes") : (postInventoryMutation.isPending ? "Posting..." : "Complete Posting")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={inventoryPostingDetailsOpen} onOpenChange={setInventoryPostingDetailsOpen}>
            <DialogContent className="w-[min(94vw,900px)] max-h-[86vh] overflow-y-auto">
              <div className="flex items-center justify-between gap-3 pr-8">
                <DialogTitle>Inventory Posting Details</DialogTitle>
                <Button type="button" size="sm" onClick={openInventoryPostingEditor}>Edit Posting</Button>
              </div>
              <DialogDescription className="mt-1">Products received from {lc.lcNumber} at finalized landed cost.</DialogDescription>
              <div className="mt-4 overflow-x-auto rounded-lg border border-[#dfe7f2]">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-[#f7f9fc] text-xs uppercase text-[#66758b]">
                    <tr>
                      <th className="px-3 py-2.5">Product</th>
                      <th className="px-3 py-2.5">Warehouse</th>
                      <th className="px-3 py-2.5 text-right">Quantity</th>
                      <th className="px-3 py-2.5 text-right">Unit Cost</th>
                      <th className="px-3 py-2.5 text-right">Total Value</th>
                      <th className="px-3 py-2.5 text-right">Posted At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8edf4]">
                    {lc.items.filter((item) => item.inventoryPosting).map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-3 font-medium text-[#14233b]">{item.productName}</td>
                        <td className="px-3 py-3">{item.inventoryPosting?.warehouseName}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{item.inventoryPosting?.quantity} {item.unit}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(item.inventoryPosting?.unitCost ?? 0)}</td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums">{formatCurrency(item.inventoryPosting?.totalCost ?? 0)}</td>
                        <td className="px-3 py-3 text-right text-xs text-[#6f7d91]">{item.inventoryPosting?.postedAt ? formatTimelineDateTime(item.inventoryPosting.postedAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-[#d7e1ee] bg-[#f7faff] font-semibold">
                    <tr>
                      <td colSpan={4} className="px-3 py-2.5">Total Posted Value</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(sumMoney(lc.items.map((item) => item.inventoryPosting?.totalCost ?? 0)))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="mt-4 flex justify-end"><Button type="button" variant="outline" onClick={() => setInventoryPostingDetailsOpen(false)}>Close</Button></div>
            </DialogContent>
          </Dialog>
          <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
            <DialogContent className="w-[min(92vw,480px)]">
              <DialogTitle>Reopen Landed Cost</DialogTitle>
              <DialogDescription className="mt-1">A reason is required and is preserved in the audit trail.</DialogDescription>
              <Input value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} className="mt-3" placeholder="Reason for reopening" />
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setReopenOpen(false)}>Cancel</Button>
                <Button type="button" onClick={() => void handleReopen()} disabled={!reopenReason.trim() || reopenMutation.isPending}>
                  {reopenMutation.isPending ? "Reopening..." : "Reopen"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
            <DialogContent className="w-[min(92vw,500px)]">
              <DialogTitle>Close LC</DialogTitle>
              <DialogDescription className="mt-1">
                Closing permanently locks the LC and its inventory posting. You can still view all details and audit history.
              </DialogDescription>
              <div className="mt-3 rounded-lg border border-[#dbe5f0] bg-[#f7faff] px-3 py-2 text-sm text-[#52657d]">
                All {lc.items.length} item(s) are posted to inventory and the allocation difference is {formatCurrency(lc.landedCost?.allocationDifference ?? 0)}.
              </div>
              <label className="mt-4 block text-sm font-medium text-[#334155]">
                Closing note (optional)
                <Input value={closeNote} onChange={(event) => setCloseNote(event.target.value)} className="mt-1.5" placeholder="Example: All import and warehouse activities completed" />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCloseOpen(false)}>Cancel</Button>
                <Button type="button" onClick={() => void handleCloseLc()} disabled={setStatusMutation.isPending}>
                  {setStatusMutation.isPending ? "Closing..." : "Confirm Close"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </>
  );

  if (variant === "page") {
    return (
      <div className="h-full min-h-0 overflow-hidden rounded-[14px] border border-[#dfe7f2] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
        {detailContent}
        {confirmationDialogs}
      </div>
    );
  }

  return (
    <Dialog open={Boolean(lcId)} onOpenChange={(next) => { if (!next) onOpenChange(false); }}>
      <DialogContent className="w-[min(96vw,1100px)] max-h-[92vh] overflow-hidden p-0">
        {detailContent}
      </DialogContent>
      {confirmationDialogs}
    </Dialog>
  );
}
