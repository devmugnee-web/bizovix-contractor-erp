"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AppDateInput } from "@/components/shared/app-date-input";
import { useMoneyAccountsQuery } from "@/hooks/use-accounts-query";
import {
  useAssetCategoriesQuery,
  useAssetSuppliersQuery,
  useCreateFixedAssetMutation,
} from "@/hooks/use-fixed-assets-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { moneyAmountsEqual, roundMoney, sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { AssetCondition, FundingMode } from "@/types/fixed-assets";
import type { MoneyAccountType } from "@/types/accounts";

const STEPS = ["Basic Info", "Purchase & Cost", "Funding", "Review"] as const;

const conditions: AssetCondition[] = ["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"];

const PAYMENT_METHODS = ["Cash", "Bank", "Cheque", "MFS"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// A cheque is drawn on a bank account, so it filters the same BANK ledgers as
// a direct bank transfer — the method label is just how the user thinks about
// the payment; both reduce the chosen bank ledger's balance identically.
function methodMoneyType(method: PaymentMethod): MoneyAccountType {
  if (method === "Cash") return "CASH";
  if (method === "MFS") return "MFS";
  return "BANK";
}

type FundingSplit = { method: PaymentMethod; accountId: string; amount: string };

const emptyForm = {
  name: "",
  categoryId: "",
  brand: "",
  model: "",
  manufacturer: "",
  serialNumber: "",
  registrationNumber: "",
  condition: "GOOD" as AssetCondition,
  location: "",
  department: "",
  assignedToName: "",
  purchaseDate: new Date().toISOString().slice(0, 10),
  purchaseCost: "",
  transportationCost: "0",
  installationCost: "0",
  importDuty: "0",
  registrationCost: "0",
  otherCapitalizedCost: "0",
  discountAmount: "0",
  salvageValue: "0",
  usefulLifeYears: "5",
  useManualDepreciation: false,
  manualDepreciationAmount: null as number | null,
  fundingMode: "CASH_BANK" as FundingMode,
  supplierId: "",
};

interface AddAssetWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: Partial<typeof emptyForm>;
}

export function AddAssetWizardDialog({ open, onOpenChange, initialValues }: AddAssetWizardDialogProps) {
  const { session } = useSessionContext();
  const categoriesQuery = useAssetCategoriesQuery(open);
  const createMutation = useCreateFixedAssetMutation();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [splits, setSplits] = useState<FundingSplit[]>([{ method: "Cash", accountId: "", amount: "" }]);
  const suppliersQuery = useAssetSuppliersQuery(session?.workspaceId, open && form.fundingMode === "CREDIT");
  const moneyQuery = useMoneyAccountsQuery(open && form.fundingMode === "CASH_BANK");

  const categories = categoriesQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];
  const moneyAccounts = useMemo(() => moneyQuery.data ?? [], [moneyQuery.data]);
  const selectedCategory = categories.find((category) => category.id === form.categoryId) ?? null;
  const ledgersForMethod = (method: PaymentMethod) => moneyAccounts.filter((account) => account.type === methodMoneyType(method));
  const allocated = sumMoney(splits.map((split) => Number(split.amount) || 0));

  const capitalizedCost = useMemo(() => {
    return Math.max(0, sumMoney([
      form.purchaseCost,
      form.transportationCost,
      form.installationCost,
      form.importDuty,
      form.registrationCost,
      form.otherCapitalizedCost,
      -(Number(form.discountAmount) || 0),
    ]));
  }, [form.purchaseCost, form.transportationCost, form.installationCost, form.importDuty, form.registrationCost, form.otherCapitalizedCost, form.discountAmount]);

  useEffect(() => {
    if (!open || !initialValues) return;
    setForm({ ...emptyForm, ...initialValues });
    setStep(0);
    setError(null);
    setSplits([{ method: "Cash", accountId: "", amount: "" }]);
  }, [initialValues, open]);

  // Prefill the first split's ledger once the money accounts load, so the
  // common single-payment case needs no manual ledger picking. Only touches a
  // still-empty first row, so it never clobbers what the user chose.
  useEffect(() => {
    if (!open || form.fundingMode !== "CASH_BANK" || !moneyAccounts.length) return;
    setSplits((current) => {
      if (current.length !== 1 || current[0]!.accountId) return current;
      const firstCash = ledgersForMethod("Cash")[0] ?? moneyAccounts[0]!;
      const method: PaymentMethod = firstCash.type === "MFS" ? "MFS" : firstCash.type === "BANK" ? "Bank" : "Cash";
      return [{ method, accountId: firstCash.id, amount: current[0]!.amount }];
    });
  }, [moneyAccounts, open, form.fundingMode]);

  function reset() {
    setStep(0);
    setForm(emptyForm);
    setError(null);
    setSplits([{ method: "Cash", accountId: "", amount: "" }]);
  }

  function updateSplit(index: number, patch: Partial<FundingSplit>) {
    setSplits((current) => current.map((split, splitIndex) => {
      if (splitIndex !== index) return split;
      const next = { ...split, ...patch };
      // Switching method invalidates the ledger — default to that method's first
      // ledger so the row is never left pointing at a ledger of the wrong type.
      if (patch.method && patch.method !== split.method) {
        next.accountId = ledgersForMethod(patch.method)[0]?.id ?? "";
      }
      return next;
    }));
  }

  function addSplit() {
    const remaining = Math.max(0, sumMoney([capitalizedCost, -allocated]));
    setSplits((current) => [...current, { method: "Cash", accountId: "", amount: remaining ? String(roundMoney(remaining)) : "" }]);
  }

  function removeSplit(index: number) {
    setSplits((current) => (current.length === 1 ? current : current.filter((_, splitIndex) => splitIndex !== index)));
  }

  function updateField<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleCategoryChange(categoryId: string) {
    const category = categories.find((entry) => entry.id === categoryId);
    setForm((current) => ({
      ...current,
      categoryId,
      usefulLifeYears:
        category?.defaultUsefulLifeMonths && (current.usefulLifeYears === "" || current.usefulLifeYears === emptyForm.usefulLifeYears)
          ? String(Math.round(category.defaultUsefulLifeMonths / 12))
          : current.usefulLifeYears,
      salvageValue:
        category?.defaultSalvageValue != null && (current.salvageValue === "" || current.salvageValue === emptyForm.salvageValue)
          ? String(category.defaultSalvageValue)
          : current.salvageValue,
    }));
  }

  function validateStep(currentStep: number): string | null {
    if (currentStep === 0) {
      if (!form.name.trim()) return "Asset name is required.";
    }
    if (currentStep === 1) {
      const purchaseCost = Number(form.purchaseCost);
      if (!purchaseCost || purchaseCost <= 0) return "Enter a valid purchase cost.";
      const usefulLifeMonths = Math.round(Number(form.usefulLifeYears || 0) * 12);
      if (!usefulLifeMonths || usefulLifeMonths <= 0) return "Enter a valid useful life.";
      if (Number(form.salvageValue || 0) >= capitalizedCost) return "Salvage value must be less than the capitalized cost.";
    }
    if (currentStep === 2) {
      if (form.fundingMode === "CASH_BANK") {
        if (splits.some((split) => !split.accountId || !(Number(split.amount) > 0))) {
          return "Every payment split needs a ledger and an amount greater than zero.";
        }
        if (!moneyAmountsEqual(allocated, capitalizedCost)) {
          return `Payment splits must total the capitalized cost (${formatCurrency(capitalizedCost)}).`;
        }
      }
      if (form.fundingMode === "CREDIT" && !form.supplierId) return "Select the supplier this asset is payable to.";
    }
    return null;
  }

  function goNext() {
    const validationError = validateStep(step);
    if (validationError) {
      setError(validationError);
      return;
    }
    // Entering the Funding step with a single, blank-amount split: prefill it
    // with the whole capitalized cost so the common one-payment case balances
    // out of the box.
    if (step === 1 && form.fundingMode === "CASH_BANK") {
      setSplits((current) => (current.length === 1 && !current[0]!.amount ? [{ ...current[0]!, amount: String(capitalizedCost) }] : current));
    }
    setError(null);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setStep((current) => Math.max(current - 1, 0));
  }

  async function handleSubmit() {
    if (!session?.workspaceId) return;
    const validationError = validateStep(2);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    try {
      await createMutation.mutateAsync({
        workspaceId: session.workspaceId,
        name: form.name.trim(),
        categoryId: form.categoryId || undefined,
        brand: form.brand.trim() || undefined,
        model: form.model.trim() || undefined,
        manufacturer: form.manufacturer.trim() || undefined,
        serialNumber: form.serialNumber.trim() || undefined,
        registrationNumber: form.registrationNumber.trim() || undefined,
        condition: form.condition,
        location: form.location.trim() || undefined,
        department: form.department.trim() || undefined,
        assignedToName: form.assignedToName.trim() || undefined,
        purchaseDate: form.purchaseDate,
        purchaseCost: Number(form.purchaseCost),
        transportationCost: Number(form.transportationCost || 0),
        installationCost: Number(form.installationCost || 0),
        importDuty: Number(form.importDuty || 0),
        registrationCost: Number(form.registrationCost || 0),
        otherCapitalizedCost: Number(form.otherCapitalizedCost || 0),
        discountAmount: Number(form.discountAmount || 0),
        salvageValue: Number(form.salvageValue || 0),
        usefulLifeMonths: Math.round(Number(form.usefulLifeYears || 0) * 12),
        useManualDepreciation: form.useManualDepreciation,
        manualDepreciationAmount: form.useManualDepreciation ? Number(form.manualDepreciationAmount || 0) : undefined,
        fundingMode: form.fundingMode,
        fundingSources: form.fundingMode === "CASH_BANK"
          ? splits.map((split) => ({ accountId: split.accountId, amount: Number(split.amount) }))
          : undefined,
        supplierId: form.fundingMode === "CREDIT" ? form.supplierId : undefined,
      });
      toast.success(`"${form.name.trim()}" added to Fixed Assets`);
      onOpenChange(false);
      reset();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Asset could not be created");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="w-[min(92vw,640px)] max-h-[90vh] overflow-y-auto">
        <div className="pr-8">
          <DialogTitle>Add Fixed Asset</DialogTitle>
          <DialogDescription className="mt-1">
            Creates a dedicated ledger under Chart of Accounts &gt; Assets &gt; Fixed Assets.
          </DialogDescription>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {STEPS.map((label, index) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  index === step ? "bg-[#0f6cf6] text-white" : index < step ? "bg-[#e7f7ee] text-[#08783d]" : "bg-[#f1f4f8] text-[#8994a6]",
                )}
              >
                {index + 1}
              </div>
              <span className={cn("text-xs font-medium", index === step ? "text-[#14233b]" : "text-[#8994a6]")}>{label}</span>
              {index < STEPS.length - 1 ? <div className="h-px flex-1 bg-[#e7edf5]" /> : null}
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3">
          {step === 0 ? (
            <>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium text-[#334155]">Asset Name *</span>
                <Input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="e.g. Delivery Van - DHK-1234" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Category</span>
                  <select
                    value={form.categoryId}
                    onChange={(event) => handleCategoryChange(event.target.value)}
                    className="h-10 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Condition</span>
                  <select
                    value={form.condition}
                    onChange={(event) => updateField("condition", event.target.value as AssetCondition)}
                    className="h-10 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm"
                  >
                    {conditions.map((condition) => (
                      <option key={condition} value={condition}>{condition.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Brand</span>
                  <Input value={form.brand} onChange={(event) => updateField("brand", event.target.value)} placeholder="Optional" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Model</span>
                  <Input value={form.model} onChange={(event) => updateField("model", event.target.value)} placeholder="Optional" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Manufacturer</span>
                  <Input value={form.manufacturer} onChange={(event) => updateField("manufacturer", event.target.value)} placeholder="Optional" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Serial Number</span>
                  <Input value={form.serialNumber} onChange={(event) => updateField("serialNumber", event.target.value)} placeholder="Optional" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Registration Number</span>
                  <Input value={form.registrationNumber} onChange={(event) => updateField("registrationNumber", event.target.value)} placeholder="Optional" />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Location</span>
                  <Input value={form.location} onChange={(event) => updateField("location", event.target.value)} placeholder="Optional" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Department</span>
                  <Input value={form.department} onChange={(event) => updateField("department", event.target.value)} placeholder="Optional" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Assigned To</span>
                  <Input value={form.assignedToName} onChange={(event) => updateField("assignedToName", event.target.value)} placeholder="Optional" />
                </label>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Purchase Date *</span>
                  <AppDateInput value={form.purchaseDate} onChange={(value) => updateField("purchaseDate", value)} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Purchase Cost *</span>
                  <Input money type="number" min="0" step="0.01" value={form.purchaseCost} onChange={(event) => updateField("purchaseCost", event.target.value)} placeholder="0.00" />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Transportation</span>
                  <Input money type="number" min="0" step="0.01" value={form.transportationCost} onChange={(event) => updateField("transportationCost", event.target.value)} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Installation</span>
                  <Input money type="number" min="0" step="0.01" value={form.installationCost} onChange={(event) => updateField("installationCost", event.target.value)} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Import Duty</span>
                  <Input money type="number" min="0" step="0.01" value={form.importDuty} onChange={(event) => updateField("importDuty", event.target.value)} />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Registration Cost</span>
                  <Input money type="number" min="0" step="0.01" value={form.registrationCost} onChange={(event) => updateField("registrationCost", event.target.value)} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Other Capitalized Cost</span>
                  <Input money type="number" min="0" step="0.01" value={form.otherCapitalizedCost} onChange={(event) => updateField("otherCapitalizedCost", event.target.value)} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Discount</span>
                  <Input money type="number" min="0" step="0.01" value={form.discountAmount} onChange={(event) => updateField("discountAmount", event.target.value)} />
                </label>
              </div>
              <div className="rounded-[6px] border border-[#d7e1ee] bg-[#fbfdff] px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#6f7d91]">Capitalized Cost (booked to Chart of Accounts)</span>
                  <span className="font-semibold text-[#14233b]">{formatCurrency(capitalizedCost)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Salvage Value</span>
                  <Input money type="number" min="0" step="0.01" value={form.salvageValue} onChange={(event) => updateField("salvageValue", event.target.value)} placeholder="0.00" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Useful Life (years) *</span>
                  <Input type="number" min="1" step="1" value={form.usefulLifeYears} onChange={(event) => updateField("usefulLifeYears", event.target.value)} />
                </label>
              </div>

              <label className="flex items-center gap-2.5">
                <input type="checkbox" checked={form.useManualDepreciation || false} onChange={(event) => updateField("useManualDepreciation", event.target.checked)} className="h-4 w-4 rounded border-[#c5d1dd] text-[#0f6cf6]" />
                <span className="text-sm font-medium text-[#334155]">Input Depreciation Amount Manually</span>
              </label>

              {form.useManualDepreciation ? (
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Annual Depreciation Amount</span>
                  <Input money type="number" min="0" step="0.01" value={form.manualDepreciationAmount || ""} onChange={(event) => updateField("manualDepreciationAmount", event.target.value ? Number(event.target.value) : null)} placeholder="0.00" />
                </label>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => updateField("fundingMode", "CASH_BANK")}
                  className={cn(
                    "rounded-[8px] border px-4 py-3 text-left text-sm",
                    form.fundingMode === "CASH_BANK" ? "border-[#0f6cf6] bg-[#eef5ff] text-[#0f3d91]" : "border-[#d7e1ee] text-[#3c4a60]",
                  )}
                >
                  <div className="font-semibold">Cash / Bank</div>
                  <div className="mt-0.5 text-xs text-[#6f7d91]">Pay now — split across Cash / Bank / Cheque / MFS</div>
                </button>
                <button
                  type="button"
                  onClick={() => updateField("fundingMode", "CREDIT")}
                  className={cn(
                    "rounded-[8px] border px-4 py-3 text-left text-sm",
                    form.fundingMode === "CREDIT" ? "border-[#0f6cf6] bg-[#eef5ff] text-[#0f3d91]" : "border-[#d7e1ee] text-[#3c4a60]",
                  )}
                >
                  <div className="font-semibold">On Credit</div>
                  <div className="mt-0.5 text-xs text-[#6f7d91]">Book as payable to a supplier</div>
                </button>
              </div>
              {form.fundingMode === "CASH_BANK" ? (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[#334155]">Paid From *</span>
                    <button type="button" onClick={addSplit} className="inline-flex items-center gap-1 text-xs font-semibold text-[#0f6cf6] hover:underline">
                      <Plus className="h-3.5 w-3.5" /> Add payment method
                    </button>
                  </div>
                  {splits.map((split, index) => {
                    const ledgers = ledgersForMethod(split.method);
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <select
                          value={split.method}
                          onChange={(event) => updateSplit(index, { method: event.target.value as PaymentMethod })}
                          className="h-10 w-24 shrink-0 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm"
                        >
                          {PAYMENT_METHODS.map((method) => (
                            <option key={method} value={method}>{method}</option>
                          ))}
                        </select>
                        <select
                          value={split.accountId}
                          onChange={(event) => updateSplit(index, { accountId: event.target.value })}
                          className="h-10 min-w-0 flex-1 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm"
                        >
                          <option value="">{moneyQuery.isLoading ? "Loading..." : ledgers.length ? "Select ledger" : `No ${split.method} ledger`}</option>
                          {ledgers.map((ledger) => (
                            <option key={ledger.id} value={ledger.id}>{ledger.name}</option>
                          ))}
                        </select>
                        <Input
                          money
                          type="number"
                          min="0"
                          step="0.01"
                          value={split.amount}
                          onChange={(event) => updateSplit(index, { amount: event.target.value })}
                          placeholder="0.00"
                          className="h-10 w-32 shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => removeSplit(index)}
                          disabled={splits.length === 1}
                          aria-label="Remove"
                          className="shrink-0 rounded-md p-2 text-[#8994a6] hover:bg-[#fee2e2] hover:text-[#dc2626] disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  <div className={cn(
                    "flex justify-between rounded-[6px] border px-3 py-2 text-sm",
                    moneyAmountsEqual(allocated, capitalizedCost) ? "border-[#8fd2ad] bg-[#e7f7ee]" : "border-[#edc16e] bg-[#fff5df]",
                  )}>
                    <span className="text-[#6f7d91]">Allocated {formatCurrency(allocated)} of {formatCurrency(capitalizedCost)}</span>
                    <span className={moneyAmountsEqual(allocated, capitalizedCost) ? "font-semibold text-[#08783d]" : "font-semibold text-[#995300]"}>
                      {moneyAmountsEqual(allocated, capitalizedCost) ? "Balanced" : `Remaining ${formatCurrency(sumMoney([capitalizedCost, -allocated]))}`}
                    </span>
                  </div>
                </div>
              ) : (
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Supplier *</span>
                  <select
                    value={form.supplierId}
                    onChange={(event) => updateField("supplierId", event.target.value)}
                    className="h-10 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm"
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                  {!suppliersQuery.isLoading && suppliers.length === 0 ? (
                    <p className="text-xs text-[#8994a6]">No suppliers found — add one from Parties master first.</p>
                  ) : null}
                </label>
              )}
            </>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-2 rounded-[8px] border border-[#e7edf5] bg-[#fbfdff] p-4 text-sm">
              <div className="flex justify-between"><span className="text-[#6f7d91]">Asset Name</span><span className="font-medium text-[#1f2f46]">{form.name || "—"}</span></div>
              <div className="flex justify-between"><span className="text-[#6f7d91]">Category</span><span className="text-[#3c4a60]">{selectedCategory?.name ?? "Uncategorized"}</span></div>
              <div className="flex justify-between"><span className="text-[#6f7d91]">Purchase Date</span><span className="text-[#3c4a60]">{formatDate(form.purchaseDate)}</span></div>
              <div className="flex justify-between"><span className="text-[#6f7d91]">Capitalized Cost</span><span className="font-semibold text-[#14233b]">{formatCurrency(capitalizedCost)}</span></div>
              <div className="flex justify-between"><span className="text-[#6f7d91]">Salvage Value</span><span className="text-[#3c4a60]">{formatCurrency(Number(form.salvageValue || 0))}</span></div>
              <div className="flex justify-between"><span className="text-[#6f7d91]">Useful Life</span><span className="text-[#3c4a60]">{form.usefulLifeYears} years</span></div>
              <div className="flex justify-between gap-4">
                <span className="text-[#6f7d91]">Funding</span>
                <span className="text-right text-[#3c4a60]">
                  {form.fundingMode === "CREDIT"
                    ? `On credit — ${suppliers.find((supplier) => supplier.id === form.supplierId)?.name ?? "supplier"}`
                    : splits.map((split, index) => {
                        const ledgerName = ledgersForMethod(split.method).find((ledger) => ledger.id === split.accountId)?.name ?? split.method;
                        return <span key={index} className="block">{split.method} · {ledgerName}: {formatCurrency(Number(split.amount) || 0)}</span>;
                      })}
                </span>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-[#c63c3c]">{error}</p> : null}
        </div>

        <div className="mt-5 flex justify-between gap-3 border-t border-[#e9edf3] pt-4">
          <Button type="button" variant="outline" onClick={step === 0 ? () => { onOpenChange(false); reset(); } : goBack}>
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={goNext}>Next</Button>
          ) : (
            <Button type="button" onClick={() => void handleSubmit()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Add Asset"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
