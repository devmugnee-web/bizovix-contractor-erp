"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AppDateInput } from "@/components/shared/app-date-input";
import { LC_CURRENCIES } from "@/config/lc-currencies";
import { useMoneyAccountsQuery } from "@/hooks/use-accounts-query";
import { useAddLcShipmentMutation, useCreateLcMutation, useLcInventoryItemsQuery, useLcSuppliersQuery } from "@/hooks/use-lc-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatAmount, formatCurrency, formatCurrencyUsd, formatDateTime } from "@/lib/format";
import { moneyAmountsEqual, moneyToMinorUnits, roundMoney, sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CreateLcItemInput } from "@/types/lc";

const STEPS = ["LC Info", "Product Details", "Shipment Info", "Payment", "Review"] as const;
const DEFAULT_LC_TYPES = ["LC", "LCL", "Door to Door"] as const;
const CURRENCIES = LC_CURRENCIES;

type ExchangeRateState = {
  status: "idle" | "loading" | "live" | "manual" | "error";
  updatedAt?: string;
  message?: string;
};

type DraftItem = CreateLcItemInput & {
  key: string;
  priceBasis: "unit" | "total";
  enteredTotalBdt?: number;
};

type DraftPaymentAllocation = { key: string; accountId: string; amount: string; reference: string };

function emptyPaymentAllocation(): DraftPaymentAllocation {
  return { key: Math.random().toString(36).slice(2), accountId: "", amount: "", reference: "" };
}

function emptyItem(): DraftItem {
  return { key: Math.random().toString(36).slice(2), priceBasis: "unit", productName: "", unit: "pcs", quantity: 1, usdUnitPrice: 0 };
}

const emptyForm = {
  lcNumber: "",
  lcDate: new Date().toISOString().slice(0, 10),
  supplierId: "",
  supplierName: "",
  supplierCountry: "",
  purchaseOrderRef: "",
  piReference: "",
  bankName: "",
  bankBranch: "",
  lcType: "",
  currency: "USD",
  exchangeRate: "",
  incoterm: "",
  originCountry: "",
  originPort: "",
  destinationPort: "",
  expiryDate: "",
  remarks: "",
  purchasePaymentStatus: "UNPAID" as "UNPAID" | "PARTIAL" | "PAID",
  purchasePaidAmount: "",
  paymentReference: "",
  transportMode: "SEA" as "SEA" | "AIR" | "ROAD" | "RAIL" | "COURIER" | "MULTIMODAL",
  shipmentNumber: "",
  blAwbNumber: "",
  etd: "",
  eta: "",
  containerNumber: "",
  forwarderName: "",
  shippingLine: "",
};

interface CreateLcWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: "dialog" | "page";
  onCreated?: (lcId: string) => void;
}

export function CreateLcWizardDialog({ open, onOpenChange, variant = "dialog", onCreated }: CreateLcWizardDialogProps) {
  const { session } = useSessionContext();
  const suppliersQuery = useLcSuppliersQuery(session?.workspaceId, open);
  const inventoryItemsQuery = useLcInventoryItemsQuery(session?.workspaceId, open);
  const moneyAccountsQuery = useMoneyAccountsQuery(open);
  const createMutation = useCreateLcMutation();
  const addShipmentMutation = useAddLcShipmentMutation();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [paymentAllocations, setPaymentAllocations] = useState<DraftPaymentAllocation[]>([emptyPaymentAllocation()]);
  const [customLcTypes, setCustomLcTypes] = useState<string[]>([]);
  const [showNewLcType, setShowNewLcType] = useState(false);
  const [newLcType, setNewLcType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exchangeRateState, setExchangeRateState] = useState<ExchangeRateState>({ status: "idle" });
  const [exchangeRateRefreshKey, setExchangeRateRefreshKey] = useState(0);
  const [currencySearch, setCurrencySearch] = useState("USD — US Dollar");
  const [currencyListOpen, setCurrencyListOpen] = useState(false);
  const [highlightedCurrencyIndex, setHighlightedCurrencyIndex] = useState(0);
  const exchangeRateManuallyEditedRef = useRef(false);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const suppliers = suppliersQuery.data ?? [];
  const inventoryItems = inventoryItemsQuery.data ?? [];
  const moneyAccounts = moneyAccountsQuery.data ?? [];
  const exchangeRate = Number(form.exchangeRate || 0);
  const selectedCurrencyName = CURRENCIES.find((currency) => currency.code === form.currency)?.name ?? form.currency;
  const displayCurrencyCode = form.currency === "CNY" ? "RMB" : form.currency;
  const allocatedPaymentTotal = sumMoney(paymentAllocations.map((row) => Number(row.amount || 0)));
  const filteredCurrencies = useMemo(() => {
    const query = currencySearch.trim().toLowerCase();
    if (!query || query === `${form.currency.toLowerCase()} — ${CURRENCIES.find((entry) => entry.code === form.currency)?.name.toLowerCase() ?? ""}`) {
      return CURRENCIES;
    }
    return CURRENCIES.filter((currency) => currency.code.toLowerCase().includes(query) || currency.name.toLowerCase().includes(query));
  }, [currencySearch, form.currency]);
  const shipmentLabels = {
    SEA: { shipment: "Voyage / Shipment No", document: "Bill of Lading (BL) No", carrier: "Shipping Line" },
    AIR: { shipment: "Flight / Shipment No", document: "Air Waybill (AWB) No", carrier: "Airline" },
    ROAD: { shipment: "Vehicle / Trip No", document: "Consignment Note No", carrier: "Transport Company" },
    RAIL: { shipment: "Train / Wagon No", document: "Railway Receipt No", carrier: "Rail Operator" },
    COURIER: { shipment: "Tracking No", document: "Courier Receipt No", carrier: "Courier Service" },
    MULTIMODAL: { shipment: "Shipment No", document: "Transport Document No", carrier: "Main Carrier" },
  }[form.transportMode];

  useEffect(() => {
    if (!open || !form.currency) return;

    const currency = form.currency;
    const controller = new AbortController();
    exchangeRateManuallyEditedRef.current = false;
    setExchangeRateState({ status: "loading" });

    async function loadLiveRate() {
      try {
        if (currency === "BDT") {
          updateField("exchangeRate", "1");
          setExchangeRateState({ status: "live", updatedAt: new Date().toISOString() });
          return;
        }

        const response = await fetch(`/api/exchange-rates?base=${encodeURIComponent(currency)}`, { signal: controller.signal });
        const payload = await response.json() as { rates?: Record<string, number>; updatedAt?: string; message?: string };
        const liveRate = payload.rates?.BDT;
        if (!response.ok || typeof liveRate !== "number" || !Number.isFinite(liveRate) || liveRate <= 0) {
          throw new Error(payload.message || "Live BDT rate is unavailable");
        }
        if (exchangeRateManuallyEditedRef.current) return;
        updateField("exchangeRate", String(Number(liveRate.toFixed(4))));
        setExchangeRateState({ status: "live", updatedAt: payload.updatedAt });
      } catch (rateError) {
        if (controller.signal.aborted || exchangeRateManuallyEditedRef.current) return;
        setExchangeRateState({
          status: "error",
          message: rateError instanceof Error ? rateError.message : "Could not load the live rate",
        });
      }
    }

    void loadLiveRate();
    return () => controller.abort();
  }, [exchangeRateRefreshKey, form.currency, open]);

  function updateField<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectCurrency(currency: (typeof CURRENCIES)[number]) {
    const isSameCurrency = form.currency === currency.code;
    exchangeRateManuallyEditedRef.current = false;
    updateField("currency", currency.code);
    updateField("exchangeRate", "");
    setCurrencySearch(`${currency.code} — ${currency.name}`);
    setCurrencyListOpen(false);
    setHighlightedCurrencyIndex(0);
    if (isSameCurrency) {
      setExchangeRateRefreshKey((current) => current + 1);
    }
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((current) => [...current, emptyItem()]);
  }

  async function downloadProductTemplate() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet([
      {
        "Product Name": "Example Product",
        Unit: "pcs",
        Qty: 1,
        [`${displayCurrencyCode} Per Unit`]: 10,
        "Unit Purchase in BDT": "",
        "Total Purchase in BDT": "",
        Weight: "",
        CBM: "",
        "HS Code": "",
        "Total BDT": "",
      },
    ]);
    sheet["!cols"] = [{ wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 22 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "LC Products");
    XLSX.writeFile(workbook, "lc-product-import-template.xlsx");
  }

  async function importProductsFromExcel(file: File) {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("The workbook has no worksheet.");
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
      const readCell = (row: Record<string, unknown>, aliases: string[]) => {
        const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
        for (const alias of aliases) {
          const value = normalized.get(normalizeKey(alias));
          if (value !== undefined && String(value).trim() !== "") return value;
        }
        return "";
      };
      const imported = rawRows.flatMap((row) => {
        const productName = String(readCell(row, ["Product", "Product Name", "Item", "Item Name"])).trim();
        const quantity = Number(readCell(row, ["Quantity", "Qty"]));
        if (!productName || !Number.isFinite(quantity) || quantity <= 0) return [];
        const unit = String(readCell(row, ["Unit", "UOM"])).trim() || "pcs";
        const usdUnitPrice = Number(readCell(row, [`${displayCurrencyCode} Per Unit`, `${displayCurrencyCode}/Unit`, `${displayCurrencyCode} Unit Price`, `${form.currency} Per Unit`, `${form.currency}/Unit`, `${form.currency} Unit Price`, "USD Unit Price", "USD/Unit", "USD Price"])) || 0;
        const acceptedValue = Number(readCell(row, ["Unit Purchase in BDT", "Accepted BDT Unit Price", "Accepted BDT/Unit", "BDT Unit Price"])) || 0;
        const totalValue = Number(readCell(row, ["Total BDT", "Total", "BDT Total"])) || 0;
        const acceptedBdtUnitPrice = acceptedValue > 0 ? acceptedValue : usdUnitPrice > 0 && exchangeRate > 0 ? usdUnitPrice * exchangeRate : undefined;
        const effectiveAccepted = totalValue > 0 ? totalValue / quantity : acceptedBdtUnitPrice;
        const matched = inventoryItems.find((entry) => entry.itemName.trim().toLowerCase() === productName.toLowerCase());
        return [{
          key: Math.random().toString(36).slice(2),
          priceBasis: totalValue > 0 ? "total" as const : "unit" as const,
          enteredTotalBdt: totalValue > 0 ? totalValue : undefined,
          inventoryItemId: matched?.id,
          productName,
          unit: matched?.unit ?? unit,
          quantity,
          usdUnitPrice: effectiveAccepted && exchangeRate > 0 ? effectiveAccepted / exchangeRate : usdUnitPrice,
          acceptedBdtUnitPrice: effectiveAccepted,
          weight: Number(readCell(row, ["Weight"])) || undefined,
          cbm: Number(readCell(row, ["CBM"])) || undefined,
          hsCode: String(readCell(row, ["HS Code", "HSCode"])).trim() || undefined,
        } satisfies DraftItem];
      });
      if (!imported.length) throw new Error("No valid product rows found. Product and positive Quantity are required.");
      setItems(imported);
      const skipped = rawRows.length - imported.length;
      toast.success(`${imported.length} product${imported.length === 1 ? "" : "s"} imported${skipped ? `; ${skipped} invalid row${skipped === 1 ? "" : "s"} skipped` : ""}.`);
    } catch (importError) {
      toast.error(importError instanceof Error ? importError.message : "Excel file could not be imported");
    } finally {
      if (excelInputRef.current) excelInputRef.current.value = "";
    }
  }

  function removeItem(key: string) {
    setItems((current) => (current.length === 1 ? current : current.filter((item) => item.key !== key)));
  }

  function reset() {
    setStep(0);
    setForm(emptyForm);
    setItems([emptyItem()]);
    setPaymentAllocations([emptyPaymentAllocation()]);
    setCustomLcTypes([]);
    setShowNewLcType(false);
    setNewLcType("");
    setError(null);
    setExchangeRateState({ status: "idle" });
    setExchangeRateRefreshKey(0);
    setCurrencySearch("USD — US Dollar");
    setCurrencyListOpen(false);
    setHighlightedCurrencyIndex(0);
    exchangeRateManuallyEditedRef.current = false;
  }

  function addLcType() {
    const name = newLcType.trim();
    if (!name) return;
    const existingType = [...DEFAULT_LC_TYPES, ...customLcTypes].find((type) => type.toLowerCase() === name.toLowerCase());
    if (!existingType) {
      setCustomLcTypes((current) => [...current, name]);
    }
    updateField("lcType", existingType ?? name);
    setNewLcType("");
    setShowNewLcType(false);
  }

  function itemCalculatedPurchaseTotalBdt(item: DraftItem) {
    const effectiveUnit = item.acceptedBdtUnitPrice && item.acceptedBdtUnitPrice > 0
      ? item.acceptedBdtUnitPrice
      : item.usdUnitPrice * exchangeRate;
    return roundMoney(effectiveUnit * item.quantity);
  }

  function itemTotalBdt(item: DraftItem) {
    if (item.priceBasis === "total" && item.enteredTotalBdt !== undefined) {
      return roundMoney(item.enteredTotalBdt);
    }
    return itemCalculatedPurchaseTotalBdt(item);
  }

  function updateItemQuantity(item: DraftItem, quantity: number) {
    if (item.priceBasis === "total" && item.enteredTotalBdt !== undefined) {
      const acceptedBdtUnitPrice = quantity > 0 ? item.enteredTotalBdt / quantity : 0;
      updateItem(item.key, {
        quantity,
        acceptedBdtUnitPrice,
        usdUnitPrice: exchangeRate > 0 ? acceptedBdtUnitPrice / exchangeRate : 0,
      });
      return;
    }

    updateItem(item.key, { quantity });
  }

  function updateItemUnitPrice(item: DraftItem, acceptedBdtUnitPrice?: number) {
    updateItem(item.key, {
      acceptedBdtUnitPrice,
      usdUnitPrice: acceptedBdtUnitPrice !== undefined && exchangeRate > 0 ? acceptedBdtUnitPrice / exchangeRate : 0,
      priceBasis: "unit",
      enteredTotalBdt: undefined,
    });
  }

  function updateItemTotalPrice(item: DraftItem, enteredTotalBdt: number) {
    const acceptedBdtUnitPrice = item.quantity > 0 ? enteredTotalBdt / item.quantity : 0;
    updateItem(item.key, {
      enteredTotalBdt,
      priceBasis: "total",
      acceptedBdtUnitPrice,
      usdUnitPrice: exchangeRate > 0 ? acceptedBdtUnitPrice / exchangeRate : 0,
    });
  }

  const grandTotalBdt = sumMoney(items.map(itemTotalBdt));

  function validateStep(currentStep: number): string | null {
    if (currentStep === 0) {
      if (!form.lcNumber.trim()) return "LC Number is required.";
      if (!form.supplierName.trim()) return "Supplier name is required.";
      if (!exchangeRate || exchangeRate <= 0) return "Enter a valid exchange rate.";
    }
    if (currentStep === 1) {
      if (!items.length) return "Add at least one product.";
      for (const item of items) {
        if (!item.productName.trim()) return "Every product needs a name.";
        if (!item.quantity || item.quantity <= 0) return "Every product needs a quantity greater than zero.";
        if (item.usdUnitPrice === undefined || item.usdUnitPrice < 0) return `Enter a valid ${displayCurrencyCode} unit price for every product.`;
      }
    }
    if (currentStep === 3 && form.purchasePaymentStatus === "PARTIAL") {
      const paidPaisa = moneyToMinorUnits(allocatedPaymentTotal);
      const totalPaisa = moneyToMinorUnits(grandTotalBdt);
      if (paidPaisa <= 0 || paidPaisa >= totalPaisa) return "Mixed payment total must be greater than zero and less than the purchase value.";
    }
    if (currentStep === 3 && form.purchasePaymentStatus === "PAID" && !moneyAmountsEqual(allocatedPaymentTotal, grandTotalBdt)) {
      return "Fully paid allocations must equal the full purchase value.";
    }
    if (currentStep === 3 && form.purchasePaymentStatus === "UNPAID" && moneyToMinorUnits(allocatedPaymentTotal) > 0) {
      return "Remove payment allocations or choose Partial/Fully Paid.";
    }
    if (currentStep === 3 && form.purchasePaymentStatus !== "UNPAID" && paymentAllocations.some((row) => Number(row.amount || 0) > 0 && !row.accountId)) {
      return "Select a Chart of Accounts ledger for every payment amount.";
    }
    return null;
  }

  function goNext() {
    const validationError = validateStep(step);
    if (validationError) {
      setError(validationError);
      return;
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
    const validationError = validateStep(1);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    try {
      const lc = await createMutation.mutateAsync({
        workspaceId: session.workspaceId,
        lcNumber: form.lcNumber.trim(),
        lcDate: form.lcDate,
        supplierId: form.supplierId || undefined,
        supplierName: form.supplierName.trim(),
        supplierCountry: form.supplierCountry.trim() || undefined,
        purchaseOrderRef: form.purchaseOrderRef.trim() || undefined,
        piReference: form.piReference.trim() || undefined,
        bankName: form.bankName.trim() || undefined,
        bankBranch: form.bankBranch.trim() || undefined,
        lcType: form.lcType.trim() || undefined,
        currency: form.currency.trim() || "USD",
        exchangeRate,
        incoterm: form.incoterm.trim() || undefined,
        originCountry: form.originCountry.trim() || undefined,
        originPort: form.originPort.trim() || undefined,
        destinationPort: form.destinationPort.trim() || undefined,
        expiryDate: form.expiryDate || undefined,
        remarks: form.remarks.trim() || undefined,
        purchasePaymentStatus: form.purchasePaymentStatus,
        purchasePaidAmount: roundMoney(allocatedPaymentTotal),
        paymentReference: form.paymentReference.trim() || undefined,
        paymentAllocations: paymentAllocations.filter((row) => row.accountId && moneyToMinorUnits(Number(row.amount || 0)) > 0).map((row) => ({
          accountId: row.accountId,
          amount: roundMoney(Number(row.amount)),
          reference: row.reference.trim() || undefined,
        })),
        items: items.map((item) => ({
          inventoryItemId: item.inventoryItemId || undefined,
          productName: item.productName.trim(),
          unit: item.unit || "pcs",
          quantity: item.quantity,
          usdUnitPrice: item.usdUnitPrice,
          acceptedBdtUnitPrice: item.acceptedBdtUnitPrice,
          weight: item.weight,
          cbm: item.cbm,
          hsCode: item.hsCode,
        })),
      });

      if (form.shipmentNumber.trim() || form.blAwbNumber.trim() || form.containerNumber.trim()) {
        await addShipmentMutation.mutateAsync({
          id: lc.id,
          input: {
            transportMode: form.transportMode,
            shipmentNumber: form.shipmentNumber.trim() || undefined,
            blAwbNumber: form.blAwbNumber.trim() || undefined,
            etd: form.etd || undefined,
            eta: form.eta || undefined,
            containerNumber: form.containerNumber.trim() || undefined,
            forwarderName: form.forwarderName.trim() || undefined,
            shippingLine: form.shippingLine.trim() || undefined,
          },
        });
      }

      toast.success(`LC "${lc.lcNumber}" created`);
      onCreated?.(lc.id);
      onOpenChange(false);
      reset();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "LC could not be created");
    }
  }

  const content = (
    <>
        <div className={variant === "dialog" ? "pr-8" : "flex items-start justify-between gap-4"}>
          <div>
          {variant === "dialog" ? <DialogTitle>Create LC</DialogTitle> : <h1 className="text-xl font-semibold text-[#14233b]">Create LC</h1>}
          {variant === "dialog" ? (
            <DialogDescription className="mt-1">Enter LC details, imported products, and shipment info.</DialogDescription>
          ) : (
            <p className="mt-1 text-sm text-[#6f7d91]">Enter LC details, imported products, and shipment info.</p>
          )}
          </div>
          {variant === "page" ? (
            <button
              type="button"
              aria-label="Close Create LC"
              title="Close"
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1f4f8] text-[#53647d] transition hover:bg-[#e4eaf2] hover:text-[#14233b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6cf6]"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
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
          {step > 0 && exchangeRate > 0 ? (
            <div className="mx-auto flex w-full max-w-2xl items-center justify-center rounded-[12px] border border-[#b9d4ff] bg-white px-5 py-3 text-center shadow-[0_6px_18px_rgba(15,108,246,0.08)]">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6f7d91]">Conversion Rate</div>
                <div className="mt-1 text-2xl font-bold text-[#14233b] sm:text-3xl">
                  1 {selectedCurrencyName} = {exchangeRate.toLocaleString("en-US", { maximumFractionDigits: 4 })} BDT
                </div>
              </div>
            </div>
          ) : null}
          {step === 0 ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">LC Number *</span>
                  <Input value={form.lcNumber} onChange={(event) => updateField("lcNumber", event.target.value)} placeholder="LC-2026-001" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">LC Date *</span>
                  <AppDateInput value={form.lcDate} onChange={(value) => updateField("lcDate", value)} />
                </label>
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">LC Type</span>
                  <select
                    value={form.lcType}
                    onChange={(event) => {
                      if (event.target.value === "__add_new__") {
                        setShowNewLcType(true);
                        return;
                      }
                      updateField("lcType", event.target.value);
                    }}
                    className="h-10 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm"
                  >
                    <option value="">Select LC type</option>
                    {DEFAULT_LC_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    {customLcTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    <option value="__add_new__">+ Add New Type</option>
                  </select>
                  {showNewLcType ? (
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        value={newLcType}
                        onChange={(event) => setNewLcType(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addLcType();
                          }
                        }}
                        placeholder="New LC type"
                        className="h-9"
                      />
                      <Button type="button" size="sm" onClick={addLcType}>Add</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => { setShowNewLcType(false); setNewLcType(""); }}>Cancel</Button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Supplier</span>
                  <select
                    value={form.supplierId}
                    onChange={(event) => {
                      const supplier = suppliers.find((entry) => entry.id === event.target.value);
                      setForm((current) => ({ ...current, supplierId: event.target.value, supplierName: supplier?.name ?? current.supplierName }));
                    }}
                    className="h-10 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm"
                  >
                    <option value="">Enter supplier name manually</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Supplier Name *</span>
                  <Input value={form.supplierName} onChange={(event) => updateField("supplierName", event.target.value)} placeholder="Supplier name" />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Supplier Country</span>
                  <Input value={form.supplierCountry} onChange={(event) => updateField("supplierCountry", event.target.value)} placeholder="Optional" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Purchase Order Ref</span>
                  <Input value={form.purchaseOrderRef} onChange={(event) => updateField("purchaseOrderRef", event.target.value)} placeholder="Optional" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">PI Reference</span>
                  <Input value={form.piReference} onChange={(event) => updateField("piReference", event.target.value)} placeholder="Optional" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Bank</span>
                  <Input value={form.bankName} onChange={(event) => updateField("bankName", event.target.value)} placeholder="Optional" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Bank Branch</span>
                  <Input value={form.bankBranch} onChange={(event) => updateField("bankBranch", event.target.value)} placeholder="Optional" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Currency</span>
                  <Input
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={currencyListOpen}
                    aria-controls="lc-currency-options"
                    value={currencySearch}
                    onFocus={(event) => {
                      event.currentTarget.select();
                      setCurrencyListOpen(true);
                      setHighlightedCurrencyIndex(0);
                    }}
                    onBlur={() => setCurrencyListOpen(false)}
                    onChange={(event) => {
                      setCurrencySearch(event.target.value);
                      setCurrencyListOpen(true);
                      setHighlightedCurrencyIndex(0);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setCurrencyListOpen(true);
                        setHighlightedCurrencyIndex((current) => Math.min(current + 1, filteredCurrencies.length - 1));
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setHighlightedCurrencyIndex((current) => Math.max(current - 1, 0));
                      } else if (event.key === "Enter" && currencyListOpen && filteredCurrencies.length) {
                        event.preventDefault();
                        selectCurrency(filteredCurrencies[highlightedCurrencyIndex] ?? filteredCurrencies[0]);
                      } else if (event.key === "Escape") {
                        setCurrencyListOpen(false);
                      }
                    }}
                    placeholder="Type a code or currency name"
                  />
                  {currencyListOpen ? (
                    <div id="lc-currency-options" role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-[8px] border border-[#d7e1ee] bg-white p-1 shadow-lg">
                      {filteredCurrencies.map((currency, index) => (
                        <button
                          key={currency.code}
                          type="button"
                          role="option"
                          aria-selected={currency.code === form.currency}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectCurrency(currency)}
                          onMouseEnter={() => setHighlightedCurrencyIndex(index)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-[5px] px-3 py-2 text-left text-sm",
                            index === highlightedCurrencyIndex ? "bg-[#eaf2ff] text-[#0f6cf6]" : "text-[#22324a] hover:bg-[#f7faff]",
                          )}
                        >
                          <span className="w-9 font-semibold">{currency.code}</span>
                          <span>{currency.name}</span>
                        </button>
                      ))}
                      {filteredCurrencies.length === 0 ? <p className="px-3 py-3 text-sm text-[#8994a6]">No matching currency.</p> : null}
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-[#334155]">Exchange Rate (1 {form.currency || "USD"} = ? BDT) *</span>
                    <button
                      type="button"
                      onClick={() => {
                        exchangeRateManuallyEditedRef.current = false;
                        setExchangeRateRefreshKey((current) => current + 1);
                      }}
                      disabled={exchangeRateState.status === "loading"}
                      className="flex items-center gap-1 text-xs font-medium text-[#0f6cf6] disabled:opacity-50"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", exchangeRateState.status === "loading" && "animate-spin")} />
                      Live rate
                    </button>
                  </div>
                          <Input
                            money
                            type="number"
                    min="0"
                    step="0.0001"
                    value={form.exchangeRate}
                    onChange={(event) => {
                      exchangeRateManuallyEditedRef.current = true;
                      updateField("exchangeRate", event.target.value);
                      setExchangeRateState({ status: "manual" });
                    }}
                    placeholder={exchangeRateState.status === "loading" ? "Loading live rate..." : "Enter exchange rate"}
                  />
                  <span className={cn("text-xs", exchangeRateState.status === "error" ? "text-[#dc2626]" : "text-[#6f7d91]")}>
                    {exchangeRateState.status === "loading" ? "Loading current BDT rate..." : null}
                    {exchangeRateState.status === "live" ? `Live rate${exchangeRateState.updatedAt ? ` · updated ${formatDateTime(exchangeRateState.updatedAt)}` : ""}. You can overwrite it manually.` : null}
                    {exchangeRateState.status === "manual" ? "Manual rate — click Live rate to restore the current market rate." : null}
                    {exchangeRateState.status === "error" ? `${exchangeRateState.message}. Enter a rate manually or try again.` : null}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Incoterm</span>
                  <Input value={form.incoterm} onChange={(event) => updateField("incoterm", event.target.value)} placeholder="CIF / FOB" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Origin Port</span>
                  <Input value={form.originPort} onChange={(event) => updateField("originPort", event.target.value)} placeholder="Optional" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Destination Port</span>
                  <Input value={form.destinationPort} onChange={(event) => updateField("destinationPort", event.target.value)} placeholder="Optional" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Expiry Date</span>
                  <AppDateInput value={form.expiryDate} onChange={(value) => updateField("expiryDate", value)} />
                </label>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-[#334155]">Products *</span>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProductsFromExcel(file); }} />
                  <Button type="button" variant="outline" size="sm" onClick={() => void downloadProductTemplate()}>
                    <Download className="mr-1 h-3.5 w-3.5" /> Template
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => excelInputRef.current?.click()}>
                    <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Import Excel
                  </Button>
                  <button type="button" onClick={addItem} className="inline-flex items-center gap-1 text-xs font-semibold text-[#0f6cf6] hover:underline">
                    <Plus className="h-3.5 w-3.5" /> Add product
                  </button>
                </div>
              </div>
              <div className="overflow-hidden rounded-[8px] border border-[#dbe5f0] bg-white">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[18%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[9%]" />
                    <col className="w-[11%]" />
                    <col className="w-[12%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[8%]" />
                    <col className="w-[12%]" />
                    <col className="w-[4%]" />
                  </colgroup>
                  <thead className="bg-[#f5f8fc] text-[11px] uppercase tracking-[0.02em] text-[#718096]">
                    <tr>
                      <th className="border-r border-[#e2e9f2] px-3 py-2.5 text-left">Product Name</th>
                      <th className="border-r border-[#e2e9f2] px-3 py-2.5 text-left">Unit</th>
                      <th className="border-r border-[#e2e9f2] px-3 py-2.5 text-right">Qty</th>
                      <th className="border-r border-[#e2e9f2] px-3 py-2.5 text-right">{displayCurrencyCode} / Unit</th>
                      <th className="border-r border-[#e2e9f2] px-3 py-2.5 text-right leading-4">Unit Purchase<br />BDT</th>
                      <th className="border-r border-[#e2e9f2] px-3 py-2.5 text-right leading-4">Calculated Total<br />BDT</th>
                      <th className="border-r border-[#e2e9f2] px-3 py-2.5 text-right">Weight</th>
                      <th className="border-r border-[#e2e9f2] px-3 py-2.5 text-right">CBM</th>
                      <th className="border-r border-[#e2e9f2] px-3 py-2.5 text-left">HS Code</th>
                      <th className="border-r border-[#e2e9f2] px-3 py-2.5 text-right leading-4">Final Total<br />BDT</th>
                      <th className="px-2 py-2.5 text-center" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.key} className="border-t border-[#eef2f7]">
                        <td className="px-2 py-1.5">
                          <Input
                            list={`lc-inventory-items-${item.key}`}
                            value={item.productName}
                            onChange={(event) => {
                              const matched = inventoryItems.find((entry) => entry.itemName === event.target.value);
                              updateItem(item.key, { productName: event.target.value, inventoryItemId: matched?.id, unit: matched?.unit ?? item.unit });
                            }}
                            className="h-9 w-full"
                            placeholder="Product name"
                          />
                          <datalist id={`lc-inventory-items-${item.key}`}>
                            {inventoryItems.map((entry) => <option key={entry.id} value={entry.itemName} />)}
                          </datalist>
                        </td>
                        <td className="px-2 py-1.5"><Input value={item.unit} onChange={(event) => updateItem(item.key, { unit: event.target.value })} className="h-9 w-full" /></td>
                        <td className="px-2 py-1.5"><Input type="number" value={item.quantity} onChange={(event) => updateItemQuantity(item, Number(event.target.value) || 0)} className="h-9 w-full text-right" /></td>
                        <td className="px-2 py-1.5"><Input money type="number" value={item.usdUnitPrice > 0 ? item.usdUnitPrice : ""} onChange={(event) => {
                          const usdUnitPrice = Number(event.target.value) || 0;
                          updateItem(item.key, {
                            usdUnitPrice,
                            acceptedBdtUnitPrice: exchangeRate > 0 ? usdUnitPrice * exchangeRate : undefined,
                            priceBasis: "unit",
                            enteredTotalBdt: undefined,
                          });
                        }} className="h-9 w-full text-right" /></td>
                        <td className="px-2 py-1.5">
                          <Input
                            money
                            type="number"
                            value={item.acceptedBdtUnitPrice && item.acceptedBdtUnitPrice > 0 ? item.acceptedBdtUnitPrice : ""}
                            onChange={(event) => updateItemUnitPrice(item, event.target.value ? Number(event.target.value) : undefined)}
                            className="h-9 w-full text-right"
                            placeholder={item.usdUnitPrice > 0 && exchangeRate > 0 ? formatAmount(roundMoney(item.usdUnitPrice * exchangeRate)) : ""}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex h-9 items-center justify-end rounded-[6px] border border-[#e7edf5] bg-[#f8fafc] px-3 font-medium text-[#334155]">
                            {itemCalculatedPurchaseTotalBdt(item) > 0
                              ? formatAmount(itemCalculatedPurchaseTotalBdt(item))
                              : ""}
                          </div>
                        </td>
                        <td className="px-2 py-1.5"><Input type="number" value={item.weight ?? ""} onChange={(event) => updateItem(item.key, { weight: event.target.value ? Number(event.target.value) : undefined })} className="h-9 w-full text-right" /></td>
                        <td className="px-2 py-1.5"><Input type="number" value={item.cbm ?? ""} onChange={(event) => updateItem(item.key, { cbm: event.target.value ? Number(event.target.value) : undefined })} className="h-9 w-full text-right" /></td>
                        <td className="px-2 py-1.5"><Input value={item.hsCode ?? ""} onChange={(event) => updateItem(item.key, { hsCode: event.target.value })} className="h-9 w-full" /></td>
                        <td className="px-2 py-1.5">
                          <Input
                            money
                            type="number"
                            min="0"
                            step="0.01"
                            value={itemTotalBdt(item) > 0 ? itemTotalBdt(item) : ""}
                            onChange={(event) => updateItemTotalPrice(item, Number(event.target.value) || 0)}
                            className="h-9 w-full text-right font-medium text-[#14233b]"
                            aria-label={`Total BDT for ${item.productName || "product"}`}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <button type="button" onClick={() => removeItem(item.key)} disabled={items.length === 1} className="rounded-md p-1.5 text-[#8994a6] hover:bg-[#fee2e2] hover:text-[#dc2626] disabled:opacity-40">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[#e7edf5] bg-[#fbfdff]">
                      <td colSpan={9} className="px-2 py-2 text-right text-sm font-medium text-[#6f7d91]">Total Purchase Cost</td>
                      <td className="px-2 py-2 text-right font-semibold text-[#14233b]">{formatCurrency(grandTotalBdt)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Transport Mode *</span>
                  <select
                    value={form.transportMode}
                    onChange={(event) => updateField("transportMode", event.target.value as typeof form.transportMode)}
                    className="h-10 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm"
                  >
                    <option value="SEA">By Sea</option>
                    <option value="AIR">By Air</option>
                    <option value="ROAD">By Road</option>
                    <option value="RAIL">By Rail</option>
                    <option value="COURIER">By Courier</option>
                    <option value="MULTIMODAL">Multimodal</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">{shipmentLabels.shipment}</span>
                  <Input value={form.shipmentNumber} onChange={(event) => updateField("shipmentNumber", event.target.value)} placeholder="Optional" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">{shipmentLabels.document}</span>
                  <Input value={form.blAwbNumber} onChange={(event) => updateField("blAwbNumber", event.target.value)} placeholder="Optional" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Container / Package No</span>
                  <Input value={form.containerNumber} onChange={(event) => updateField("containerNumber", event.target.value)} placeholder="Optional" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">ETD</span>
                  <AppDateInput value={form.etd} onChange={(value) => updateField("etd", value)} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">ETA</span>
                  <AppDateInput value={form.eta} onChange={(value) => updateField("eta", value)} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Forwarder</span>
                  <Input value={form.forwarderName} onChange={(event) => updateField("forwarderName", event.target.value)} placeholder="Optional" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">{shipmentLabels.carrier}</span>
                  <Input value={form.shippingLine} onChange={(event) => updateField("shippingLine", event.target.value)} placeholder="Optional" />
                </label>
              </div>
              <p className="text-xs text-[#8994a6]">Shipment info is optional here — you can add or edit shipments later from the LC's Shipments tab.</p>
            </>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-3 rounded-[8px] border border-[#ead7b0] bg-[#fffaf0] p-4">
              <div><div className="font-semibold text-[#47351d]">Supplier Payment Position</div><p className="mt-0.5 text-xs text-[#806b4e]">Use one or multiple Cash, Bank, or MFS ledgers under Cash & Cash Equivalents. Any unpaid balance posts to Import Cost Payable (LC).</p></div>
              <label className="grid max-w-sm gap-1 text-xs">
                <span className="font-medium text-[#6f5a3e]">Payment Status *</span>
                <select
                  value={form.purchasePaymentStatus}
                  onChange={(event) => {
                    const status = event.target.value as typeof form.purchasePaymentStatus;
                    updateField("purchasePaymentStatus", status);
                    if (status === "UNPAID") setPaymentAllocations([emptyPaymentAllocation()]);
                    if (status === "PAID") setPaymentAllocations((current) => [{ ...(current[0] ?? emptyPaymentAllocation()), amount: String(grandTotalBdt) }, ...current.slice(1).map((row) => ({ ...row, amount: "" }))]);
                  }}
                  className="h-10 rounded-[6px] border border-[#d9c69e] bg-white px-3 text-sm"
                >
                  <option value="UNPAID">Fully Payable</option><option value="PARTIAL">Partially Paid</option><option value="PAID">Fully Paid</option>
                </select>
              </label>
              {form.purchasePaymentStatus !== "UNPAID" ? (
                <div className="grid gap-2">
                  <div className="grid grid-cols-[minmax(220px,1fr)_180px_minmax(180px,0.8fr)_40px] gap-2 text-xs font-medium text-[#6f5a3e]"><span>Payment Ledger</span><span>Amount</span><span>Reference</span><span /></div>
                  {paymentAllocations.map((row) => (
                    <div key={row.key} className="grid grid-cols-[minmax(220px,1fr)_180px_minmax(180px,0.8fr)_40px] gap-2">
                      <select value={row.accountId} onChange={(event) => setPaymentAllocations((current) => current.map((entry) => entry.key === row.key ? { ...entry, accountId: event.target.value } : entry))} className="h-10 rounded-[6px] border border-[#d9c69e] bg-white px-2 text-sm">
                        <option value="">Select Cash, Bank or MFS account</option>
                        {moneyAccounts.map((ledger) => <option key={ledger.id} value={ledger.id}>{ledger.type} — {ledger.code} — {ledger.name} — {formatCurrency(ledger.currentBalance)}</option>)}
                      </select>
                      <Input money type="number" min="0" value={row.amount} onChange={(event) => setPaymentAllocations((current) => current.map((entry) => entry.key === row.key ? { ...entry, amount: event.target.value } : entry))} className="h-10" />
                      <Input value={row.reference} onChange={(event) => setPaymentAllocations((current) => current.map((entry) => entry.key === row.key ? { ...entry, reference: event.target.value } : entry))} placeholder="Optional" className="h-10" />
                      <button type="button" aria-label="Remove payment row" onClick={() => setPaymentAllocations((current) => current.length === 1 ? [emptyPaymentAllocation()] : current.filter((entry) => entry.key !== row.key))} className="flex h-10 items-center justify-center rounded-[6px] text-[#c63c3c] hover:bg-[#fee2e2]"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setPaymentAllocations((current) => [...current, emptyPaymentAllocation()])}><Plus className="mr-1 h-4 w-4" /> Add payment ledger</Button>
                </div>
              ) : null}
              <div className="flex flex-wrap justify-between gap-2 border-t border-[#ead7b0] pt-2 text-sm"><span>Paid: <strong>{formatCurrency(allocatedPaymentTotal)}</strong></span><span>Import Cost Payable (LC): <strong>{formatCurrency(roundMoney(Math.max(0, grandTotalBdt - allocatedPaymentTotal)))}</strong></span></div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-2 rounded-[8px] border border-[#e7edf5] bg-[#fbfdff] p-4 text-sm">
              <div className="flex justify-between"><span className="text-[#6f7d91]">LC Number</span><span className="font-medium text-[#1f2f46]">{form.lcNumber || "—"}</span></div>
              <div className="flex justify-between"><span className="text-[#6f7d91]">Supplier</span><span className="text-[#3c4a60]">{form.supplierName || "—"}</span></div>
              <div className="flex justify-between"><span className="text-[#6f7d91]">Exchange Rate</span><span className="text-[#3c4a60]">1 {form.currency} = {formatCurrency(exchangeRate)}</span></div>
              <div className="flex justify-between"><span className="text-[#6f7d91]">Products</span><span className="text-[#3c4a60]">{items.length}</span></div>
              <div className="flex justify-between"><span className="text-[#6f7d91]">Payment Status</span><span className="text-[#3c4a60]">{form.purchasePaymentStatus === "PAID" ? "Fully Paid" : form.purchasePaymentStatus === "PARTIAL" ? "Partially Paid" : "Unpaid / Payable"}</span></div>
              <div className="flex justify-between"><span className="text-[#6f7d91]">Purchase Value</span><span className="font-semibold text-[#14233b]">{formatCurrency(grandTotalBdt)}</span></div>
              {exchangeRate ? <div className="flex justify-between text-xs text-[#8994a6]"><span>Approx. USD value</span><span>{formatCurrencyUsd(grandTotalBdt / exchangeRate)}</span></div> : null}
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
              {createMutation.isPending ? "Saving..." : "Create LC"}
            </Button>
          )}
        </div>
    </>
  );

  if (variant === "page") {
    return (
      <section className="h-full rounded-[12px] border border-[#d7e1ee] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        {content}
      </section>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="w-[min(96vw,1440px)] max-h-[94vh] overflow-y-auto">
        {content}
      </DialogContent>
    </Dialog>
  );
}
