"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Boxes, PencilLine, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { ErrorPanel } from "@/components/shared/error-panel";
import { LoadingPanel } from "@/components/shared/loading-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LC_CURRENCIES } from "@/config/lc-currencies";
import { AllocationEditor } from "@/features/screens/lc-detail-dialog";
import { useMoneyAccountsQuery } from "@/hooks/use-accounts-query";
import { useLcDetailQuery, useUpdateLcCostEntryMutation } from "@/hooks/use-lc-query";
import { formatCurrency } from "@/lib/format";
import { moneyAmountsEqual, moneyToMinorUnits, roundMoney, sumMoney } from "@/lib/money";

type PaymentRow = { key: string; accountId: string; amount: string; reference: string };
const emptyPaymentRow = (): PaymentRow => ({ key: Math.random().toString(36), accountId: "", amount: "", reference: "" });

export function LcCostPostingEditScreen({ lcId, costEntryId }: { lcId: string; costEntryId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const detailQuery = useLcDetailQuery(lcId, true);
  const updateMutation = useUpdateLcCostEntryMutation();
  const moneyAccountsQuery = useMoneyAccountsQuery(true);
  const entry = detailQuery.data?.costEntries.find((item) => item.id === costEntryId) ?? null;
  const fallbackReturnHref = `/app/lc-management/${lcId}?tab=costs&costEntryId=${encodeURIComponent(costEntryId)}`;
  const requestedReturnHref = searchParams.get("returnTo");
  const returnHref = requestedReturnHref?.startsWith("/app/lc-management/") ? requestedReturnHref : fallbackReturnHref;
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
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([emptyPaymentRow()]);

  useEffect(() => {
    if (!entry) return;
    setVendorName(entry.vendorName ?? ""); setInvoiceNumber(entry.invoiceNumber ?? "");
    setInvoiceDate(entry.invoiceDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setCurrency(entry.currency); setForeignAmount(entry.foreignAmount === null ? "" : String(entry.foreignAmount));
    setExchangeRate(entry.exchangeRate === null ? "" : String(entry.exchangeRate)); setBdtAmount(String(entry.bdtAmount));
    setRemarks(entry.remarks ?? ""); setPaymentMethod(entry.paymentMethod ?? "CREDIT");
    setCreditPayeeName(entry.creditPayeeName ?? entry.vendorName ?? "");
    setPaymentRows(entry.paymentAllocations.length ? entry.paymentAllocations.map((row) => ({ key: Math.random().toString(36), accountId: row.accountId, amount: String(row.amount), reference: row.reference ?? "" })) : [emptyPaymentRow()]);
  }, [entry]);

  if (detailQuery.isLoading) return <LoadingPanel lines={6} />;
  if (detailQuery.error || !detailQuery.data || !entry) return <ErrorPanel title="Cost posting unavailable" description="The selected LC cost entry could not be loaded." onRetry={() => detailQuery.refetch()} />;

  const computedAmount = roundMoney(currency === "BDT" ? Number(bdtAmount || 0) : Number(foreignAmount || 0) * Number(exchangeRate || 0));

  async function save() {
    if (!Number.isFinite(computedAmount) || computedAmount <= 0) return void toast.error("Enter a valid cost amount.");
    if (paymentMethod === "CREDIT" && !creditPayeeName.trim()) return void toast.error("Enter who will receive the credit payment.");
    const paymentTotal = sumMoney(paymentRows.map((row) => Number(row.amount || 0)));
    if (paymentMethod === "CASH_BANK_MFS" && (paymentRows.some((row) => moneyToMinorUnits(Number(row.amount || 0)) > 0 && !row.accountId) || !moneyAmountsEqual(paymentTotal, computedAmount))) return void toast.error(`Payment allocations must total ${formatCurrency(computedAmount)}.`);
    try {
      await updateMutation.mutateAsync({ id: lcId, costEntryId, input: {
        vendorName: vendorName.trim(), invoiceNumber: invoiceNumber.trim(), invoiceDate, remarks: remarks.trim(),
        currency, foreignAmount: currency !== "BDT" ? Number(foreignAmount) : undefined, exchangeRate: currency !== "BDT" ? Number(exchangeRate) : undefined, bdtAmount: roundMoney(computedAmount), paymentMethod, creditPayeeName: paymentMethod === "CREDIT" ? creditPayeeName.trim() : undefined, paymentAllocations: paymentMethod === "CASH_BANK_MFS" ? paymentRows.filter((row) => moneyToMinorUnits(Number(row.amount || 0)) > 0).map((row) => ({ accountId: row.accountId, amount: roundMoney(Number(row.amount)), reference: row.reference.trim() || undefined })) : [],
      }});
      toast.success("Cost posting updated"); router.push(returnHref);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Cost posting could not be updated"); }
  }

  return <div className="h-full space-y-4">
    <div className="flex items-start gap-3"><button type="button" onClick={() => router.push(returnHref)} className="mt-1 rounded-lg border border-[#d7e1ee] p-2 text-[#5f7189] hover:bg-[#f7faff]" aria-label="Back to LC costs"><ArrowLeft className="h-4 w-4" /></button><div><h1 className="text-2xl font-semibold text-[#14233b]">Edit Cost Posting</h1><p className="mt-1 text-sm text-[#6f7d91]">{detailQuery.data.lcNumber} · {entry.costHeadName}</p></div></div>
    <section className="rounded-[12px] border border-[#dfe7f2] bg-white p-4"><div className="mb-3 flex items-center gap-2"><PencilLine className="h-4 w-4 text-[#d97706]" /><h2 className="font-semibold text-[#14233b]">Cost Amount Posting</h2></div>
      <div className="grid gap-3 rounded-[8px] border border-[#d7e1ee] bg-[#fbfdff] p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs"><span>Cost Head</span><Input value={entry.costHeadName} disabled /></label>
          <label className="grid gap-1 text-xs"><span>Vendor</span><Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} /></label>
          <label className="grid gap-1 text-xs"><span>Invoice No</span><Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></label>
          <label className="grid gap-1 text-xs"><span>Posting / Invoice Date</span><AppDateInput value={invoiceDate} onChange={setInvoiceDate} /></label>
          <label className="grid gap-1 text-xs"><span>Currency</span><select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm">{LC_CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}</select></label>
          {currency === "BDT" ? <label className="grid gap-1 text-xs lg:col-span-2"><span>Cost Amount (BDT)</span><Input money value={bdtAmount} onChange={(e) => setBdtAmount(e.target.value)} /></label> : <><label className="grid gap-1 text-xs"><span>Foreign Amount</span><Input money value={foreignAmount} onChange={(e) => setForeignAmount(e.target.value)} /></label><label className="grid gap-1 text-xs"><span>Exchange Rate</span><Input type="number" step="0.0001" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} /></label></>}
          <div className="grid gap-1 text-xs"><span>Cost Amount (BDT computed)</span><div className="flex h-9 items-center rounded-[6px] border border-[#e7edf5] bg-white px-2 font-medium">{formatCurrency(computedAmount)}</div></div>
          <label className="grid gap-1 text-xs sm:col-span-2 lg:col-span-4"><span>Remarks</span><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
        </div>
        <div className="grid gap-3 rounded-[8px] border border-[#ead7b0] bg-[#fffaf0] p-3"><label className="grid max-w-sm gap-1 text-xs"><span>Payment Option *</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as "CREDIT" | "CASH_BANK_MFS")} className="h-9 rounded-[6px] border border-[#d9c69e] bg-white px-2 text-sm"><option value="CREDIT">Credit</option><option value="CASH_BANK_MFS">Cash / Bank / MFS</option></select></label>
          {paymentMethod === "CREDIT" ? <label className="grid gap-1 text-xs"><span>Who will receive the payment? *</span><Input value={creditPayeeName} onChange={(e) => setCreditPayeeName(e.target.value)} /></label> : <div className="grid gap-2">{paymentRows.map((row) => <div key={row.key} className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_minmax(180px,1fr)_36px]"><select value={row.accountId} onChange={(e) => setPaymentRows((rows) => rows.map((item) => item.key === row.key ? { ...item, accountId: e.target.value } : item))} className="h-9 rounded-[6px] border border-[#d9c69e] bg-white px-2 text-sm"><option value="">Select Cash / Bank / MFS ledger</option>{(moneyAccountsQuery.data ?? []).map((account) => <option key={account.id} value={account.id}>{account.type} — {account.name} — {formatCurrency(account.currentBalance)}</option>)}</select><Input money value={row.amount} onChange={(e) => setPaymentRows((rows) => rows.map((item) => item.key === row.key ? { ...item, amount: e.target.value } : item))} /><Input value={row.reference} onChange={(e) => setPaymentRows((rows) => rows.map((item) => item.key === row.key ? { ...item, reference: e.target.value } : item))} /><button type="button" disabled={paymentRows.length === 1} onClick={() => setPaymentRows((rows) => rows.filter((item) => item.key !== row.key))}><Trash2 className="h-4 w-4 text-[#c63c3c] disabled:opacity-30" /></button></div>)}<Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setPaymentRows((rows) => [...rows, emptyPaymentRow()])}>+ Add Payment Method</Button>{entry.paymentGlVoucherId ? <p className="text-xs text-[#8a6a32]">Changing the amount or payment source will automatically reverse the previous posting and post the corrected entry.</p> : null}</div>}
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => router.push(returnHref)}>Cancel</Button><Button onClick={() => void save()} disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving..." : "Save Changes"}</Button></div>
      </div>
    </section>
    <section className="rounded-[12px] border border-[#dfe7f2] bg-white p-4">
      <div className="mb-3 flex items-center gap-2"><Boxes className="h-4 w-4 text-[#5273a8]" /><h2 className="font-semibold text-[#14233b]">Item-wise Cost Allocation</h2></div>
      {!entry.includeInLandedCost ? <p className="mb-2 rounded-lg border border-[#cfe0f5] bg-[#f4f8fd] px-3 py-2 text-sm text-[#52657d]">This posting can be allocated item-wise for tracking, but it remains excluded from the Landed Cost total.</p> : null}
      <AllocationEditor lcId={lcId} entry={entry} onSaved={() => router.push(returnHref)} />
    </section>
  </div>;
}
