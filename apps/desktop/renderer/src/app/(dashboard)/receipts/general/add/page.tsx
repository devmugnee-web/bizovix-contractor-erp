"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, X } from "lucide-react";
import { useBankAccounts, useChartOfAccounts, useCreateReceipt } from "@bizovix/api-client";
import type { SaveReceiptInput } from "@bizovix/types";
import { cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const field = "h-12 w-full rounded-md border border-biz-border bg-white px-4 text-[13px] font-medium text-biz-navy outline-none focus:border-biz-blue";

export default function AddGeneralReceiptPage() {
  useSetBreadcrumb([{ label: "Receipts", href: "/receipts" }, { label: "General Receipt", href: "/receipts" }, { label: "Add Receipt" }]);
  const router = useRouter();
  const accounts = useBankAccounts();
  const chart = useChartOfAccounts();
  const createReceipt = useCreateReceipt();
  const submitting = React.useRef(false);
  const [error, setError] = React.useState("");
  const [form, setForm] = React.useState({ receiptDate: localToday(), receiptHeadAccountId: "", receivedFrom: "", purpose: "", amount: "", destination: "BANK" as "BANK" | "CASH", accountId: "", remarks: "" });
  const activeAccounts = (accounts.data ?? []).filter((account) => account.isActive);
  const bankAccounts = activeAccounts.filter((account) => account.accountType === "BANK");
  const receiptHeads = (chart.data ?? []).filter((account) => account.isActive && account.accountType === "INCOME");

  async function submit(addAnother: boolean) {
    if (submitting.current) return;
    setError("");
    const receivingAccountId = form.destination === "CASH" ? activeAccounts.find((account) => account.accountType === "CASH")?.id ?? "" : form.accountId;
    const amount = Number(form.amount);
    if (!form.receiptDate || !form.receiptHeadAccountId || !form.receivedFrom.trim() || !form.purpose.trim() || !amount || !receivingAccountId) return setError("Complete all required receipt fields.");
    const payload: SaveReceiptInput = {
      receiptDate: form.receiptDate,
      receiptCategory: "GENERAL",
      receiptType: "GENERAL_RECEIPT",
      receiptHeadAccountId: form.receiptHeadAccountId,
      receivedFrom: form.receivedFrom.trim(),
      amount,
      receivedInAccountId: receivingAccountId,
      paymentMethod: form.destination === "CASH" ? "CASH" : "BANK",
      description: form.remarks.trim() ? `${form.purpose.trim()}\nRemarks: ${form.remarks.trim()}` : form.purpose.trim(),
      status: "RECEIVED",
    };
    submitting.current = true;
    try {
      await createReceipt.mutateAsync(payload);
      if (addAnother) setForm({ receiptDate: localToday(), receiptHeadAccountId: "", receivedFrom: "", purpose: "", amount: "", destination: "BANK", accountId: "", remarks: "" });
      else router.push("/receipts");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save receipt.");
    } finally {
      submitting.current = false;
    }
  }

  return <div className="space-y-5 text-biz-navy">
    <header className="flex items-start justify-between"><div><h1 className="text-[28px] font-bold">Add General Receipt</h1><p className="mt-1 text-[14px] text-biz-muted">Record non-project related income / money received.</p></div><Link href="/receipts" className="flex h-11 items-center gap-2 rounded-md border border-biz-border bg-white px-5 text-[13px] font-semibold"><ArrowLeft className="h-4 w-4"/>Back to Receipts</Link></header>
    <section className="rounded-lg border border-biz-border bg-white shadow-card">
      <div className="grid gap-x-12 gap-y-9 p-6 lg:grid-cols-2">
        <label className="text-[13px] font-bold">1. Receipt Date <b className="text-red-600">*</b><input type="date" value={form.receiptDate} onChange={e=>setForm(v=>({...v,receiptDate:e.target.value}))} className={cn(field,"mt-3")}/></label>
        <label className="text-[13px] font-bold">2. Receipt Head <b className="text-red-600">*</b><select value={form.receiptHeadAccountId} onChange={e=>setForm(v=>({...v,receiptHeadAccountId:e.target.value}))} className={cn(field,"mt-3")}><option value="">Select receipt head...</option>{receiptHeads.map(head=><option key={head.id} value={head.id}>{head.name}</option>)}</select><span className="mt-2 block text-[11px] font-normal text-biz-muted">Examples: Miscellaneous Income, Asset Sale, Refund, Other Income etc.</span></label>
        <label className="text-[13px] font-bold">3. Received From <b className="text-red-600">*</b><textarea rows={3} value={form.receivedFrom} onChange={e=>setForm(v=>({...v,receivedFrom:e.target.value}))} placeholder="Enter customer / organization / party name..." className="mt-3 w-full resize-none rounded-md border border-biz-border p-4 text-[13px] outline-none focus:border-biz-blue"/></label>
        <label className="text-[13px] font-bold">4. Purpose / Description <b className="text-red-600">*</b><textarea rows={3} value={form.purpose} onChange={e=>setForm(v=>({...v,purpose:e.target.value}))} placeholder="Enter purpose or description..." className="mt-3 w-full resize-none rounded-md border border-biz-border p-4 text-[13px] outline-none focus:border-biz-blue"/></label>
        <label className="text-[13px] font-bold">5. Amount (BDT) <b className="text-red-600">*</b><div className="mt-3 flex"><span className="flex h-12 items-center rounded-l-md border border-r-0 border-biz-border bg-biz-bg px-4">BDT</span><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm(v=>({...v,amount:e.target.value}))} placeholder="Enter amount" className={cn(field,"rounded-l-none")}/></div></label>
        <div className="text-[13px] font-bold">6. Received To <b className="text-red-600">*</b><div className="mt-5 flex gap-8"><label className="flex items-center gap-2"><input type="radio" checked={form.destination==="CASH"} onChange={()=>setForm(v=>({...v,destination:"CASH",accountId:""}))}/>Cash</label><label className="flex items-center gap-2"><input type="radio" checked={form.destination==="BANK"} onChange={()=>setForm(v=>({...v,destination:"BANK",accountId:""}))}/>Bank Account</label></div>{form.destination === "BANK" && <div className="mt-5 rounded-md border border-blue-200 p-4"><label>Select Bank Account <b className="text-red-600">*</b><select value={form.accountId} onChange={e=>setForm(v=>({...v,accountId:e.target.value}))} className={cn(field,"mt-3")}><option value="">Select account</option>{bankAccounts.map(a=><option key={a.id} value={a.id}>{a.bankName ? `${a.bankName} - ` : ""}{a.accountName}{a.accountNumber ? ` (${a.accountNumber})` : ""}</option>)}</select></label></div>}</div>
        <label className="text-[13px] font-bold lg:col-span-2">7. Remarks (Optional)<textarea maxLength={300} rows={4} value={form.remarks} onChange={e=>setForm(v=>({...v,remarks:e.target.value}))} placeholder="Enter any additional remarks..." className="mt-3 w-full resize-none rounded-md border border-biz-border p-4 text-[13px] outline-none focus:border-biz-blue"/><span className="block text-right text-[11px] font-normal text-biz-muted">{form.remarks.length} / 300</span></label>
        {error && <p className="text-[12px] font-semibold text-red-600 lg:col-span-2">{error}</p>}
      </div>
      <footer className="flex flex-col gap-4 border-t border-biz-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between"><span className="text-[12px]"><b className="text-red-600">*</b> Required Field</span><div className="flex justify-end gap-3"><button onClick={()=>router.push("/receipts")} className="flex h-11 items-center gap-2 rounded-md border border-biz-border px-5 text-[13px] font-semibold"><X className="h-4 w-4"/>Cancel</button><button disabled={createReceipt.isPending} onClick={()=>submit(false)} className="flex h-11 items-center gap-2 rounded-md border border-biz-blue px-5 text-[13px] font-semibold text-biz-blue"><Save className="h-4 w-4"/>Save Receipt</button><button disabled={createReceipt.isPending} onClick={()=>submit(true)} className="flex h-11 items-center gap-2 rounded-md bg-biz-blue px-5 text-[13px] font-semibold text-white"><Save className="h-4 w-4"/>Save &amp; Add Another</button></div></footer>
    </section>
  </div>;
}
