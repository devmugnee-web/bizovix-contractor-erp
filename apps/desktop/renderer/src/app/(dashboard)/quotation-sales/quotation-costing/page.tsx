"use client";

import * as React from "react";
import Link from "next/link";
import {
  Calculator,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Columns3,
  Copy,
  GripVertical,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Table2,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import {
  REFERENCE_COSTING_ITEMS,
  REFERENCE_DISPLAY_TOTALS,
  REFERENCE_OVERHEADS,
  type QuotationCostingItem,
  type QuotationOverhead,
} from "./mock-data";

const BORDER = "border-[#dfe6f1]";
const FIELD = "h-[26px] rounded-[3px] border border-[#dbe3ef] bg-white px-1.5 text-right text-[7.5px] font-medium text-[#172f59] outline-none focus:border-[#1769e8] focus:ring-1 focus:ring-[#1769e8]/10";

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseMoney(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

const SMALL_NUMBERS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
] as const;

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"] as const;

function integerToWords(value: number): string {
  if (value < 20) return SMALL_NUMBERS[value] ?? "Zero";
  if (value < 100) return `${TENS[Math.floor(value / 10)] ?? ""}${value % 10 ? ` ${SMALL_NUMBERS[value % 10] ?? ""}` : ""}`;
  if (value < 1_000) return `${SMALL_NUMBERS[Math.floor(value / 100)] ?? ""} Hundred${value % 100 ? ` ${integerToWords(value % 100)}` : ""}`;

  const units = [
    { value: 1_000_000_000, label: "Billion" },
    { value: 1_000_000, label: "Million" },
    { value: 1_000, label: "Thousand" },
  ];

  for (const unit of units) {
    if (value >= unit.value) {
      const leading = Math.floor(value / unit.value);
      const remainder = value % unit.value;
      return `${integerToWords(leading)} ${unit.label}${remainder ? ` ${integerToWords(remainder)}` : ""}`;
    }
  }

  return "Zero";
}

function amountInWords(amount: number) {
  let whole = Math.floor(amount);
  let cents = Math.round((amount - whole) * 100);
  if (cents === 100) {
    whole += 1;
    cents = 0;
  }
  return `Taka ${integerToWords(whole)} and ${String(cents).padStart(2, "0")}/100 Only`;
}

function MoneyField({
  value,
  onCommit,
  label,
  readOnly = false,
  className,
}: {
  value: number;
  onCommit?: (value: number) => void;
  label: string;
  readOnly?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = React.useState(() => formatMoney(value));
  const [focused, setFocused] = React.useState(false);

  function commit() {
    const next = parseMoney(draft);
    onCommit?.(next);
    setFocused(false);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      readOnly={readOnly}
      value={focused ? draft : formatMoney(value)}
      onFocus={(event) => {
        if (readOnly) return;
        const input = event.currentTarget;
        setFocused(true);
        setDraft(String(value));
        requestAnimationFrame(() => input.select());
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={cn(FIELD, readOnly && "bg-[#f9fbfe] text-[#42577a]", className)}
    />
  );
}

function TinyAction({
  label,
  tone,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  tone: "blue" | "red";
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-[24px] w-[22px] items-center justify-center rounded-[4px] border bg-white disabled:cursor-default disabled:opacity-100",
        tone === "blue" ? "border-[#d8e7fb] text-[#0867e8]" : "border-[#ffe1e5] text-[#ef3f52]",
      )}
    >
      {children}
    </button>
  );
}

function SummaryRow({ label, value, info = false, strong = false }: { label: string; value: string; info?: boolean; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-2 text-[8.5px]", strong && "border-t border-dashed border-[#d8e1ee] pt-3")}>
      <span className={cn("flex items-center gap-1 text-[#31496f]", strong && "font-bold text-[#10244c]")}>{label}{info && <Info className="h-3 w-3 text-[#5d7393]" />}</span>
      <strong className={cn("whitespace-nowrap text-[#10244c]", strong && "text-[10px]")}>{value}</strong>
    </div>
  );
}

function QuotationSummary() {
  return (
    <section className={cn("overflow-x-auto rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]", BORDER)}>
      <div className="grid h-[82px] min-w-[900px] grid-cols-[.85fr_1.05fr_1.25fr_1fr_1fr_.68fr_.52fr] items-center gap-5 px-4">
        <div><span className="block text-[8px] font-medium text-[#476084]">Quotation No.</span><strong className="mt-2 block text-[11px] text-[#10244c]">QT-2025-0008</strong></div>
        <div><span className="block text-[8px] font-medium text-[#476084]">Customer</span><strong className="mt-2 block truncate text-[9px] text-[#10244c]">ABC Infrastructure Ltd.</strong></div>
        <div><span className="block text-[8px] font-medium text-[#476084]">Project / Work Name</span><strong className="mt-2 block truncate text-[9px] text-[#10244c]">Office Building Project</strong></div>
        <label className="block min-w-0"><span className="block text-[8px] font-medium text-[#476084]">Quotation Date</span><span className="relative mt-1.5 flex h-[33px] items-center rounded-[4px] border border-[#dbe3ef] bg-white px-2 text-[8.5px] font-semibold text-[#10244c]">15 May 2025<CalendarDays className="ml-auto h-3.5 w-3.5 text-[#3e5b82]" /></span></label>
        <label className="block min-w-0"><span className="block text-[8px] font-medium text-[#476084]">Valid Until</span><span className="relative mt-1.5 flex h-[33px] items-center rounded-[4px] border border-[#dbe3ef] bg-white px-2 text-[8.5px] font-semibold text-[#10244c]">14 Jun 2025<CalendarDays className="ml-auto h-3.5 w-3.5 text-[#3e5b82]" /></span></label>
        <label className="relative block min-w-0"><span className="block text-[8px] font-medium text-[#476084]">Currency</span><select aria-label="Currency" defaultValue="BDT" className="mt-1.5 h-[33px] w-full appearance-none rounded-[4px] border border-[#dbe3ef] bg-white px-2 text-[8.5px] font-semibold text-[#10244c] outline-none"><option>BDT</option></select><ChevronDown className="pointer-events-none absolute bottom-[10px] right-2 h-3 w-3 text-[#476084]" /></label>
        <div className="text-center"><span className="block text-[8px] font-medium text-[#476084]">Status</span><span className="mt-2 inline-flex rounded-full bg-[#dceeff] px-2.5 py-1 text-[8px] font-semibold text-[#0867e8]">Draft</span></div>
      </div>
    </section>
  );
}

export default function QuotationCostingPage() {
  useSetBreadcrumb([
    { label: "Home", href: "/dashboard" },
    { label: "Quotation / Sales" },
    { label: "Quotation Costing" },
  ]);

  const [items, setItems] = React.useState<QuotationCostingItem[]>(() => REFERENCE_COSTING_ITEMS.map((item) => ({ ...item })));
  const [overheads, setOverheads] = React.useState<QuotationOverhead[]>(() => REFERENCE_OVERHEADS.map((item) => ({ ...item })));
  const [search, setSearch] = React.useState("");
  const [vatApplicable, setVatApplicable] = React.useState(true);
  const [vatRate, setVatRate] = React.useState(7.5);
  const [editingItemId, setEditingItemId] = React.useState<string | null>(null);
  const [referenceState, setReferenceState] = React.useState(true);

  const filteredItems = React.useMemo(() => {
    const value = search.trim().toLowerCase();
    return value ? items.filter((item) => item.description.toLowerCase().includes(value)) : items;
  }, [items, search]);

  const calculated = React.useMemo(() => {
    const rows = items.map((item) => {
      const totalCost = item.quantity * item.unitCost;
      const taxAmount = totalCost * (item.taxRate / 100);
      const totalSelling = item.quantity * item.unitPrice;
      const profit = totalSelling - totalCost;
      const margin = totalSelling > 0 ? (profit / totalSelling) * 100 : 0;
      return { ...item, totalCost, taxAmount, totalSelling, profit, margin };
    });
    const totalCost = rows.reduce((sum, item) => sum + item.totalCost, 0);
    const itemTax = rows.reduce((sum, item) => sum + item.taxAmount, 0);
    const totalSelling = rows.reduce((sum, item) => sum + item.totalSelling, 0);
    const profit = rows.reduce((sum, item) => sum + item.profit, 0);
    const margin = totalSelling > 0 ? (profit / totalSelling) * 100 : 0;
    const totalOverheads = overheads.reduce((sum, item) => sum + item.amount, 0);
    const subtotalBeforeVat = totalSelling + itemTax + totalOverheads;
    const vatAmount = vatApplicable ? subtotalBeforeVat * (vatRate / 100) : 0;
    return { rows, totalCost, itemTax, totalSelling, profit, margin, totalOverheads, subtotalBeforeVat, vatAmount, grandAmount: subtotalBeforeVat + vatAmount };
  }, [items, overheads, vatApplicable, vatRate]);

  const totals = referenceState
    ? REFERENCE_DISPLAY_TOTALS
    : {
        totalCost: calculated.totalCost,
        itemTax: calculated.itemTax,
        totalSelling: calculated.totalSelling,
        margin: calculated.margin,
        profit: calculated.profit,
        overheads: calculated.totalOverheads,
        subtotalBeforeVat: calculated.subtotalBeforeVat,
        vatAmount: calculated.vatAmount,
        grandAmount: calculated.grandAmount,
      };

  function updateItem(id: string, values: Partial<QuotationCostingItem>) {
    setReferenceState(false);
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...values } : item));
  }

  function addItem() {
    const id = `item-local-${Date.now()}`;
    setReferenceState(false);
    setItems((current) => [...current, { id, description: "New Costing Item", unit: "LS", quantity: 1, unitCost: 0, taxRate: 0, unitPrice: 0, referenceMargin: 0 }]);
    setEditingItemId(id);
  }

  function deleteItem(id: string) {
    setReferenceState(false);
    setItems((current) => current.filter((item) => item.id !== id));
    setEditingItemId((current) => current === id ? null : current);
  }

  function addOverhead() {
    setReferenceState(false);
    setOverheads((current) => [...current, { id: `overhead-local-${Date.now()}`, description: "New Overhead", amount: 0 }]);
  }

  function updateOverhead(id: string, values: Partial<QuotationOverhead>) {
    setReferenceState(false);
    setOverheads((current) => current.map((item) => item.id === id ? { ...item, ...values } : item));
  }

  function deleteOverhead(id: string) {
    setReferenceState(false);
    setOverheads((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="min-h-full bg-[#f8faff] text-[#0b1f4b]">
      <header className="flex min-h-[80px] flex-col justify-between gap-3 pb-2 sm:flex-row sm:items-start">
        <div className="pt-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-[#071b49]">Quotation Costing</h1>
          <p className="mt-1 text-[9.5px] text-[#40577f]">Prepare and manage costing for accurate quotation and pricing</p>
        </div>

        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
          <label className="relative block h-[44px] w-full rounded-[6px] border border-[#dce4ef] bg-white px-3 pt-[5px] sm:w-[220px]">
            <span className="block text-[7.5px] font-medium text-[#60718e]">Select Project</span>
            <select aria-label="Select Project" defaultValue="nbr" className="absolute inset-0 h-full w-full appearance-none bg-transparent px-3 pb-1 pt-[16px] text-[10px] font-bold text-[#10244c] outline-none"><option value="nbr">NBR Building Construction</option></select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#071b49]" />
          </label>

          <div className="flex justify-end gap-2">
            <Link href="/quotation-sales/quotation" className="inline-flex h-[31px] items-center justify-center gap-1.5 rounded-[5px] border border-[#dbe3ef] bg-white px-3 text-[8.5px] font-semibold text-[#10244c]"><ChevronLeft className="h-3.5 w-3.5" /> Back to Quotation</Link>
            <span className="inline-flex h-[31px] overflow-hidden rounded-[5px] bg-[#0867e8] text-white">
              <button type="button" disabled className="inline-flex cursor-default items-center gap-1.5 px-3 text-[8.5px] font-semibold disabled:opacity-100"><Save className="h-3.5 w-3.5" /> Save Costing</button>
              <button type="button" disabled aria-label="Save costing options" className="inline-flex w-[29px] cursor-default items-center justify-center border-l border-white/25 disabled:opacity-100"><ChevronDown className="h-3.5 w-3.5" /></button>
            </span>
          </div>
        </div>
      </header>

      <QuotationSummary />

      <nav className="mt-2 flex h-[39px] w-full items-end gap-6 overflow-x-auto border-b border-[#dfe6f1] px-1" aria-label="Costing sections">
        {[
          { label: "Item Costing", active: true },
          { label: "Overheads & Others", active: false },
          { label: "Profit & Margin", active: false },
          { label: "Summary", active: false },
        ].map((tab) => (
          <button key={tab.label} type="button" disabled className={cn("relative h-full shrink-0 cursor-default whitespace-nowrap px-1 text-[8.5px] font-semibold disabled:opacity-100", tab.active ? "text-[#0867e8] after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#0867e8]" : "text-[#415878]")}>{tab.label}</button>
        ))}
      </nav>

      <div className="mt-2 grid grid-cols-1 items-start gap-2 xl:grid-cols-[minmax(0,1fr)_268px]">
        <div className="min-w-0">
          <section className={cn("overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]", BORDER)}>
            <div className="flex min-h-[52px] flex-col items-stretch justify-between gap-2 border-b border-[#e4eaf3] px-3 py-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <button type="button" onClick={addItem} className="inline-flex h-[31px] items-center justify-center gap-1.5 rounded-[4px] bg-[#0867e8] px-3 text-[8.5px] font-semibold text-white"><Plus className="h-3.5 w-3.5" /> Add Item</button>
                <button type="button" disabled className="inline-flex h-[31px] cursor-default items-center justify-center gap-1.5 rounded-[4px] border border-[#dbe3ef] bg-white px-3 text-[8.5px] font-semibold text-[#10244c] disabled:opacity-100"><Upload className="h-3.5 w-3.5" /> Import from BOQ</button>
              </div>
              <div className="flex items-center gap-2">
                <label className="relative block min-w-0 flex-1 sm:w-[235px] sm:flex-none"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Item / description..." className="h-[31px] w-full rounded-[4px] border border-[#dbe3ef] bg-white px-3 pr-9 text-[8px] text-[#10244c] outline-none focus:border-[#1769e8]" /><Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#4d6483]" /></label>
                <button type="button" disabled className="inline-flex h-[31px] cursor-default items-center justify-center gap-1.5 rounded-[4px] border border-[#dbe3ef] bg-white px-3 text-[8.5px] font-semibold text-[#10244c] disabled:opacity-100"><Columns3 className="h-3.5 w-3.5" /> Columns</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[990px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[22px]" /><col className="w-[25px]" /><col className="w-[118px]" /><col className="w-[44px]" /><col className="w-[63px]" />
                  <col className="w-[72px]" /><col className="w-[74px]" /><col className="w-[69px]" /><col className="w-[76px]" /><col className="w-[72px]" /><col className="w-[78px]" />
                  <col className="w-[57px]" /><col className="w-[72px]" /><col className="w-[47px]" />
                </colgroup>
                <thead className="bg-[#f7f9fc] text-[6.8px] font-bold uppercase tracking-[-0.01em] text-[#21385e]">
                  <tr className="h-[25px] border-b border-[#e4eaf3]">
                    <th rowSpan={2} aria-label="Reorder" />
                    <th rowSpan={2} className="px-1">SL</th>
                    <th rowSpan={2} className="px-1.5 normal-case">Item / Description</th>
                    <th rowSpan={2} className="px-1.5 normal-case">Unit</th>
                    <th rowSpan={2} className="px-1.5 normal-case">Quantity</th>
                    <th colSpan={2} className="border-l border-[#edf1f6] text-center">Cost Price (BDT)</th>
                    <th colSpan={2} className="border-l border-[#edf1f6] text-center">Item-wise Tax</th>
                    <th colSpan={2} className="border-l border-[#edf1f6] text-center">Selling Price (BDT)</th>
                    <th rowSpan={2} className="border-l border-[#edf1f6] px-1 text-center normal-case">Margin %</th>
                    <th rowSpan={2} className="px-1 text-right normal-case">Profit<br />(BDT)</th>
                    <th rowSpan={2} className="px-1 text-center normal-case">Action</th>
                  </tr>
                  <tr className="h-[24px] border-b border-[#dfe6f1] normal-case">
                    <th className="border-l border-[#edf1f6] px-1 text-right">Unit Cost</th><th className="px-1 text-right">Total Cost</th>
                    <th className="border-l border-[#edf1f6] px-1 text-center">Tax %</th><th className="px-1 text-right">Tax Amount</th>
                    <th className="border-l border-[#edf1f6] px-1 text-right">Unit Price</th><th className="px-1 text-right">Total Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f6] text-[7.4px] text-[#173058]">
                  {filteredItems.map((item, index) => {
                    const row = calculated.rows.find((candidate) => candidate.id === item.id)!;
                    const editing = editingItemId === item.id;
                    return (
                      <tr key={item.id} className="h-[38px] bg-white hover:bg-[#fbfcff]">
                        <td className="text-center text-[#6f829e]"><GripVertical className="mx-auto h-3.5 w-3.5 cursor-grab" /></td>
                        <td className="px-1 font-semibold">{index + 1}</td>
                        <td className="px-1.5 font-semibold text-[#10244c]">{editing ? <input autoFocus value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} className="h-[25px] w-full rounded-[3px] border border-[#aac8f3] px-1.5 text-[7.5px] outline-none" /> : <span className="block truncate" title={item.description}>{item.description}</span>}</td>
                        <td className="px-1.5">{editing ? <input value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} className="h-[25px] w-full rounded-[3px] border border-[#aac8f3] px-1 text-[7.5px] outline-none" /> : item.unit}</td>
                        <td className="px-1.5 text-right">{editing ? <MoneyField value={item.quantity} onCommit={(value) => updateItem(item.id, { quantity: value })} label={`${item.description} quantity`} className="w-full" /> : formatQuantity(item.quantity)}</td>
                        <td className="border-l border-[#f0f3f8] px-1"><MoneyField value={item.unitCost} onCommit={(value) => updateItem(item.id, { unitCost: value })} label={`${item.description} unit cost`} className="w-full" /></td>
                        <td className="px-1"><MoneyField value={row.totalCost} label={`${item.description} total cost`} readOnly className="w-full" /></td>
                        <td className="border-l border-[#f0f3f8] px-1"><select aria-label={`${item.description} tax rate`} value={item.taxRate} onChange={(event) => updateItem(item.id, { taxRate: Number(event.target.value) })} className="h-[26px] w-full rounded-[3px] border border-[#dbe3ef] bg-white px-1 text-[7.5px] text-[#173058] outline-none"><option value={0}>0%</option><option value={2.5}>2.5%</option><option value={5}>5%</option><option value={7.5}>7.5%</option><option value={10}>10%</option><option value={15}>15%</option></select></td>
                        <td className="px-1"><MoneyField value={row.taxAmount} label={`${item.description} tax amount`} readOnly className="w-full" /></td>
                        <td className="border-l border-[#f0f3f8] px-1"><MoneyField value={item.unitPrice} onCommit={(value) => updateItem(item.id, { unitPrice: value })} label={`${item.description} unit price`} className="w-full" /></td>
                        <td className="px-1"><MoneyField value={row.totalSelling} label={`${item.description} total selling`} readOnly className="w-full" /></td>
                        <td className="border-l border-[#f0f3f8] px-1 text-center font-semibold">{(referenceState ? item.referenceMargin : row.margin).toFixed(2)}%</td>
                        <td className="px-1 text-right font-semibold">{formatMoney(row.profit)}</td>
                        <td className="px-1"><span className="flex justify-center gap-1"><TinyAction label={editing ? "Finish editing" : `Edit ${item.description}`} tone="blue" onClick={() => setEditingItemId((current) => current === item.id ? null : item.id)}><Pencil className="h-3 w-3" /></TinyAction><TinyAction label={`Delete ${item.description}`} tone="red" onClick={() => deleteItem(item.id)}><Trash2 className="h-3 w-3" /></TinyAction></span></td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && <tr><td colSpan={14} className="h-[72px] text-center text-[8.5px] text-[#62728d]">No costing items match your search.</td></tr>}
                </tbody>
                <tfoot className="border-t border-[#dfe6f1] bg-[#fbfcfe] text-[7.2px] font-bold text-[#10244c]">
                  <tr className="h-[36px]">
                    <td colSpan={6} className="px-3 font-medium text-[#52627d]">Showing 1 to {filteredItems.length} of {items.length} items</td>
                    <td className="px-1 text-right">{formatMoney(totals.totalCost)}</td>
                    <td />
                    <td className="px-1 text-right">{formatMoney(totals.itemTax)}</td>
                    <td />
                    <td className="px-1 text-right">{formatMoney(totals.totalSelling)}</td>
                    <td className="px-1 text-center">{totals.margin.toFixed(2)}%</td>
                    <td className="px-1 text-right">{formatMoney(totals.profit)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className={cn("mt-2 overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]", BORDER)}>
            <div className="flex h-[38px] items-center justify-between border-b border-[#dfe6f1] px-3">
              <h2 className="flex items-center gap-1.5 text-[9px] font-bold text-[#10244c]">Overheads &amp; Other Charges <Info className="h-3 w-3 text-[#607493]" /></h2>
              <button type="button" onClick={addOverhead} className="inline-flex h-[27px] items-center justify-center gap-1 rounded-[4px] border border-[#cfe0f8] bg-white px-3 text-[8px] font-semibold text-[#0867e8]"><Plus className="h-3 w-3" /> Add Overhead</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] table-fixed border-collapse text-[7.5px] text-[#173058]">
                <colgroup><col className="w-[45px]" /><col /><col className="w-[190px]" /><col className="w-[70px]" /></colgroup>
                <thead className="bg-[#f7f9fc] text-[7px] font-semibold text-[#21385e]"><tr className="h-[27px] border-b border-[#e4eaf3]"><th className="px-3 text-left">SL</th><th className="px-3 text-left">Description</th><th className="px-3 text-right">Amount (BDT)</th><th className="px-3 text-center">Action</th></tr></thead>
                <tbody className="divide-y divide-[#edf1f6]">
                  {overheads.map((overhead, index) => <tr key={overhead.id} className="h-[29px]"><td className="px-3">{index + 1}</td><td className="px-3"><input aria-label={`Overhead ${index + 1} description`} value={overhead.description} onChange={(event) => updateOverhead(overhead.id, { description: event.target.value })} className="h-[25px] w-full border-0 bg-transparent px-0 text-[7.5px] font-medium text-[#173058] outline-none focus:border-b focus:border-[#1769e8]" /></td><td className="px-3"><MoneyField value={overhead.amount} onCommit={(value) => updateOverhead(overhead.id, { amount: value })} label={`${overhead.description} amount`} className="ml-auto w-[145px]" /></td><td className="px-3"><span className="flex justify-center gap-1"><TinyAction label={`Edit ${overhead.description}`} tone="blue" disabled><Pencil className="h-3 w-3" /></TinyAction><TinyAction label={`Delete ${overhead.description}`} tone="red" onClick={() => deleteOverhead(overhead.id)}><Trash2 className="h-3 w-3" /></TinyAction></span></td></tr>)}
                </tbody>
                <tfoot className="border-t border-[#dfe6f1] bg-[#fbfcfe] font-bold text-[#10244c]"><tr className="h-[29px]"><td /><td className="px-3">Total Overheads</td><td className="px-3 text-right">{formatMoney(totals.overheads)}</td><td /></tr></tfoot>
              </table>
            </div>
          </section>
        </div>

        <aside className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <section className={cn("rounded-[7px] border bg-white px-3.5 pb-2 shadow-[0_1px_2px_rgba(15,34,70,0.02)]", BORDER)}>
            <h2 className="flex h-[42px] items-center gap-2 border-b border-[#e5eaf2] text-[9px] font-bold text-[#10244c]"><Calculator className="h-3.5 w-3.5 text-[#0867e8]" /> Costing Summary</h2>
            <SummaryRow label="Total Cost (BDT)" value={formatMoney(totals.totalCost)} />
            <SummaryRow label="Total Item-wise Tax" value={formatMoney(totals.itemTax)} info />
            <SummaryRow label="Total Overheads & Others" value={formatMoney(totals.overheads)} />
            <SummaryRow label="Subtotal Before VAT" value={formatMoney(totals.subtotalBeforeVat)} strong />
            <p className="-mt-1 text-[6.8px] leading-4 text-[#687893]">(Selling Price + Item-wise Tax + Overheads)</p>
          </section>

          <section className={cn("rounded-[7px] border bg-white px-3.5 pb-2 shadow-[0_1px_2px_rgba(15,34,70,0.02)]", BORDER)}>
            <h2 className="flex h-[40px] items-center border-b border-[#e5eaf2] text-[9px] font-bold text-[#10244c]">VAT (On Total)</h2>
            <div className="flex h-[47px] items-center justify-between border-b border-[#edf1f6] text-[8px] text-[#31496f]"><span>VAT Applicable</span><span className="flex items-center gap-2"><button type="button" role="switch" aria-checked={vatApplicable} onClick={() => { setReferenceState(false); setVatApplicable((value) => !value); }} className={cn("relative h-[18px] w-[32px] rounded-full transition", vatApplicable ? "bg-[#27bd69]" : "bg-[#bdc7d5]")}><span className={cn("absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition", vatApplicable ? "left-[16px]" : "left-[2px]")} /></button><strong className="text-[#10244c]">{vatApplicable ? "Yes" : "No"}</strong></span></div>
            <div className="flex h-[47px] items-center justify-between border-b border-[#edf1f6] text-[8px] text-[#31496f]"><label htmlFor="vat-rate">VAT Rate (%)</label><input id="vat-rate" type="number" min="0" step="0.01" value={vatRate} onChange={(event) => { setReferenceState(false); setVatRate(Math.max(0, Number(event.target.value))); }} className="h-[27px] w-[65px] rounded-[3px] border border-[#dbe3ef] px-2 text-right text-[8px] font-semibold text-[#10244c] outline-none focus:border-[#1769e8]" /></div>
            <div className="flex h-[43px] items-center justify-between text-[8px] text-[#31496f]"><span>VAT Amount</span><strong className="text-[9px] text-[#25a95a]">{formatMoney(totals.vatAmount)}</strong></div>
          </section>

          <section className="flex min-h-[115px] flex-col items-center justify-center rounded-[7px] border border-[#dce6f2] bg-[#eef5ff] px-4 py-3 text-center shadow-[0_1px_2px_rgba(15,34,70,0.02)]">
            <h2 className="text-[8.5px] font-bold text-[#10244c]">GRAND QUOTATION AMOUNT (BDT)</h2>
            <strong className="mt-2 text-[21px] leading-none text-[#0c3d98]">{formatMoney(totals.grandAmount)}</strong>
            <p className="mt-2 max-w-[235px] text-[7px] leading-[12px] text-[#324c73]">(In Words): {amountInWords(totals.grandAmount)}</p>
          </section>

          <section className={cn("overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]", BORDER)}>
            <h2 className="flex h-[39px] items-center border-b border-[#e5eaf2] px-3.5 text-[9px] font-bold text-[#10244c]">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2 p-2.5">
              <button type="button" onClick={addItem} className="flex h-[65px] flex-col items-center justify-center gap-1.5 rounded-[5px] border border-[#dce4ef] bg-white text-[7.5px] font-semibold text-[#20385e]"><Plus className="h-5 w-5 text-[#0867e8]" /> Add Item</button>
              <button type="button" disabled className="flex h-[65px] cursor-default flex-col items-center justify-center gap-1.5 rounded-[5px] border border-[#dce4ef] bg-white text-[7.5px] font-semibold text-[#20385e] disabled:opacity-100"><Table2 className="h-5 w-5 text-[#0867e8]" /> Add Section</button>
              <button type="button" disabled className="flex h-[65px] cursor-default flex-col items-center justify-center gap-1.5 rounded-[5px] border border-[#dce4ef] bg-white text-[7.5px] font-semibold text-[#20385e] disabled:opacity-100"><Copy className="h-5 w-5 text-[#0867e8]" /> Duplicate Costing</button>
              <button type="button" onClick={() => setReferenceState(false)} className="flex h-[65px] flex-col items-center justify-center gap-1.5 rounded-[5px] border border-[#dce4ef] bg-white text-[7.5px] font-semibold text-[#20385e]"><RefreshCw className="h-5 w-5 text-[#0867e8]" /> Recalculate</button>
            </div>
          </section>
        </aside>
      </div>

      <div className="mt-2 flex min-h-[45px] items-center gap-3 rounded-[5px] border border-[#dce8f8] bg-[#eef5ff] px-4 py-2 text-[8px] text-[#29456e]"><Info className="h-4 w-4 shrink-0 text-[#0867e8]" /><span>Tax is calculated item-wise based on the selected rate. VAT is calculated on the subtotal (Selling Price + Item-wise Tax + Overheads).</span></div>
    </div>
  );
}
