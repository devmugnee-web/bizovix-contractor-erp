"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, Save, Search, X } from "lucide-react";
import { useBankAccounts, useCmsWorkOverview, useCmsWorks, useCreateReceipt, useEligibleBills } from "@bizovix/api-client";
import type { SaveReceiptInput } from "@bizovix/types";
import { cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const today = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};
const money = (value?: string | number | null) => `BDT ${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const field = "h-12 w-full rounded-md border border-biz-border bg-white px-4 text-[13px] font-medium text-biz-navy outline-none focus:border-biz-blue";
const receiptTypes = [
  { value: "RUNNING_BILL_PAYMENT", label: "Running Bill" },
  { value: "PROGRESS_PAYMENT", label: "Progress Payment" },
  { value: "ADVANCE_PAYMENT", label: "Advance Payment" },
  { value: "RETENTION_RECEIVED", label: "Retention Received" },
];

export default function AddProjectReceiptPage() {
  useSetBreadcrumb([{ label: "Receipts", href: "/receipts" }, { label: "Project Receipt", href: "/receipts" }, { label: "Add Receipt" }]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const works = useCmsWorks({ status: "ONGOING", page: 1, limit: 100 });
  const accounts = useBankAccounts();
  const createReceipt = useCreateReceipt();
  const [projectSearch, setProjectSearch] = React.useState("");
  const [workId, setWorkId] = React.useState(searchParams.get("workId") ?? "");
  const [form, setForm] = React.useState({ receiptDate: today(), receiptType: "RUNNING_BILL_PAYMENT", receivableId: "", referenceNo: "", amount: "", destination: "BANK" as "BANK" | "CASH", accountId: "", remarks: "" });
  const [error, setError] = React.useState("");
  const submitting = React.useRef(false);
  const overview = useCmsWorkOverview(workId || undefined);
  const bills = useEligibleBills(workId || undefined);
  const project = works.data?.items.find((item) => item.id === workId);
  const bill = bills.data?.find((item) => item.id === form.receivableId);
  const activeAccounts = (accounts.data ?? []).filter((account) => account.isActive);
  const destinationAccounts = activeAccounts.filter((account) => account.accountType === form.destination);

  const filteredWorks = (works.data?.items ?? []).filter((item) => `${item.workName} ${item.organizationMaster.shortName}`.toLowerCase().includes(projectSearch.toLowerCase()));
  const runningBill = form.receiptType === "RUNNING_BILL_PAYMENT";
  const selected = overview.data;

  function selectWork(id: string) {
    setWorkId(id);
    setForm((value) => ({ ...value, receivableId: "", referenceNo: "", amount: "" }));
  }

  function selectBill(id: string) {
    const selectedBill = bills.data?.find((item) => item.id === id);
    setForm((value) => ({ ...value, receivableId: id, referenceNo: selectedBill?.billNo ?? "", amount: selectedBill?.outstanding ?? "" }));
  }

  async function submit(addAnother: boolean) {
    if (submitting.current) return;
    setError("");
    const amount = Number(form.amount);
    const receivingAccountId = form.destination === "CASH" ? activeAccounts.find((account) => account.accountType === "CASH")?.id ?? "" : form.accountId;
    if (!workId || !form.receiptDate || !form.receiptType || !amount || !receivingAccountId || (runningBill && !form.receivableId)) return setError("Complete all required receipt fields.");
    if (runningBill && bill && amount > Number(bill.outstanding)) return setError(`Received Amount cannot exceed ${money(bill.outstanding)} outstanding.`);
    const receivedFrom = project?.organizationMaster.shortName ?? selected?.project.organizationMaster.shortName;
    if (!receivedFrom) return setError("Selected project details are still loading.");
    const payload: SaveReceiptInput = { receiptDate: form.receiptDate, receiptCategory: "PROJECT", receiptType: form.receiptType, workId, receivableId: runningBill ? form.receivableId : undefined, receivedFrom, amount, receivedInAccountId: receivingAccountId, paymentMethod: form.destination === "CASH" ? "CASH" : "BANK", referenceNo: form.referenceNo || undefined, description: form.remarks || undefined, status: "RECEIVED" };
    submitting.current = true;
    try {
      await createReceipt.mutateAsync(payload);
      if (addAnother) setForm({ receiptDate: today(), receiptType: "RUNNING_BILL_PAYMENT", receivableId: "", referenceNo: "", amount: "", destination: "BANK", accountId: "", remarks: "" });
      else router.push(searchParams.get("returnTo") || "/receipts");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save receipt.");
    } finally {
      submitting.current = false;
    }
  }

  return <div className="space-y-5 text-biz-navy">
    <header className="flex items-start justify-between"><div><h1 className="text-[28px] font-bold">Add Project Receipt</h1><p className="mt-1 text-[14px] text-biz-muted">Record money received against a project.</p></div><Link href="/receipts" className="flex h-11 items-center gap-2 rounded-md border border-biz-border bg-white px-5 text-[13px] font-semibold"><ArrowLeft className="h-4 w-4" />Back to Receipts</Link></header>

    <section className="rounded-lg border border-biz-border bg-white p-6 shadow-card">
      <div className="flex gap-5"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-blue-50 text-biz-blue"><BriefcaseBusiness /></span><div className="min-w-0 flex-1"><p className="text-[11px] text-biz-muted">Selected Project</p><h2 className="mt-1 text-[18px] font-bold">{project?.workName ?? selected?.project.workName ?? "Select a project below"}</h2><div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-6">{[
        ["Organization", project?.organizationMaster.shortName ?? selected?.project.organizationMaster.shortName ?? "-", ""],
        ["Work Category", project?.workCategory ?? selected?.project.workCategory ?? "-", ""],
        ["Work Value (Including VAT & Tax)", money(selected?.financial.contractValue ?? project?.contractValue), ""],
        ["Total Received", money(selected?.summary.totalReceipt), "text-green-700"],
        ["Current Receivable", money(selected?.summary.balanceReceivable), "text-red-600"],
        ["SD Outstanding", money(selected?.summary.securityDepositHeld), "text-orange-600"],
      ].map(([label,value,tone]) => <div key={label} className="border-l border-biz-border pl-5 first:border-0 first:pl-0"><p className="text-[10px] text-biz-muted">{label}</p><p className={cn("mt-2 text-[14px] font-bold",tone)}>{value}</p></div>)}</div></div></div>
    </section>

    <section className="rounded-lg border border-biz-border bg-white shadow-card">
      <div className="grid gap-x-9 gap-y-8 p-6 lg:grid-cols-3">
        <label className="text-[13px] font-bold">1. Search Project <b className="text-red-600">*</b><div className="relative mt-3"><Search className="absolute right-4 top-4 h-4 w-4 text-biz-muted" /><input list="project-options" value={projectSearch || (project ? `${project.workName} (${project.organizationMaster.shortName})` : "")} onFocus={() => setProjectSearch("")} onChange={(e) => { setProjectSearch(e.target.value); const match=(works.data?.items??[]).find(w=>`${w.workName} (${w.organizationMaster.shortName})`===e.target.value); if(match) selectWork(match.id); }} className={cn(field,"pr-10")} placeholder="Search project..." /><datalist id="project-options">{filteredWorks.map(w=><option key={w.id} value={`${w.workName} (${w.organizationMaster.shortName})`}/>)}</datalist></div></label>
        <label className="text-[13px] font-bold">2. Receipt Date <b className="text-red-600">*</b><input type="date" value={form.receiptDate} onChange={e=>setForm(v=>({...v,receiptDate:e.target.value}))} className={cn(field,"mt-3")}/></label>
        <label className="text-[13px] font-bold">3. Receipt Type <b className="text-red-600">*</b><select value={form.receiptType} onChange={e=>setForm(v=>({...v,receiptType:e.target.value,receivableId:"",amount:""}))} className={cn(field,"mt-3")}>{receiptTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>

        <label className="text-[13px] font-bold">4. Bill / Reference No.{runningBill ? <select value={form.receivableId} onChange={e=>selectBill(e.target.value)} className={cn(field,"mt-3")}><option value="">Select Running Bill / IPC</option>{(bills.data??[]).map(b=><option key={b.id} value={b.id}>{b.billNo}</option>)}</select> : <input value={form.referenceNo} onChange={e=>setForm(v=>({...v,referenceNo:e.target.value}))} className={cn(field,"mt-3")} />}<span className="mt-2 block text-[11px] font-normal text-biz-muted">Running bill no / Invoice no / Reference (Optional)</span></label>
        <label className="text-[13px] font-bold">5. Bill Amount (BDT)<div className="mt-3 flex"><span className="flex h-12 items-center rounded-l-md border border-r-0 border-biz-border bg-biz-bg px-4">BDT</span><input readOnly value={bill ? Number(bill.netCertified).toLocaleString("en-US",{minimumFractionDigits:2}) : ""} className={cn(field,"rounded-l-none")}/></div></label>
        <label className="text-[13px] font-bold">6. Received Amount <b className="text-red-600">*</b><div className="mt-3 flex"><span className="flex h-12 items-center rounded-l-md border border-r-0 border-biz-border bg-biz-bg px-4">BDT</span><input type="number" min="0.01" max={bill?.outstanding} step="0.01" value={form.amount} onChange={e=>setForm(v=>({...v,amount:e.target.value}))} className={cn(field,"rounded-l-none")}/></div><span className="mt-2 block text-[11px] font-normal text-biz-muted">Enter the actual amount received</span></label>

        <div className="text-[13px] font-bold lg:col-span-1">7. Received To <b className="text-red-600">*</b><div className="mt-5 flex gap-8"><label className="flex items-center gap-2"><input type="radio" checked={form.destination==="CASH"} onChange={()=>setForm(v=>({...v,destination:"CASH",accountId:""}))}/>Cash</label><label className="flex items-center gap-2"><input type="radio" checked={form.destination==="BANK"} onChange={()=>setForm(v=>({...v,destination:"BANK",accountId:""}))}/>Bank Account</label></div>{form.destination === "BANK" && <div className="mt-5 rounded-md border border-blue-200 p-4"><label>Select Bank Account <b className="text-red-600">*</b><select value={form.accountId} onChange={e=>setForm(v=>({...v,accountId:e.target.value}))} className={cn(field,"mt-3")}><option value="">Select account</option>{destinationAccounts.map(a=><option key={a.id} value={a.id}>{a.bankName ? `${a.bankName} - ` : ""}{a.accountName}{a.accountNumber ? ` (${a.accountNumber})` : ""}</option>)}</select></label></div>}</div>
        <label className="text-[13px] font-bold lg:col-span-2">8. Remarks (Optional)<textarea maxLength={300} rows={6} value={form.remarks} onChange={e=>setForm(v=>({...v,remarks:e.target.value}))} className="mt-3 w-full resize-none rounded-md border border-biz-border p-4 text-[13px] outline-none focus:border-biz-blue"/><span className="block text-right text-[11px] font-normal text-biz-muted">{form.remarks.length} / 300</span></label>
        {error && <p className="text-[12px] font-semibold text-red-600 lg:col-span-3">{error}</p>}
      </div>
      <footer className="flex flex-col gap-4 border-t border-biz-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between"><span className="text-[12px]"><b className="text-red-600">*</b> Required Field</span><div className="flex justify-end gap-3"><button onClick={()=>router.push("/receipts")} className="flex h-11 items-center gap-2 rounded-md border border-biz-border px-5 text-[13px] font-semibold"><X className="h-4 w-4"/>Cancel</button><button disabled={createReceipt.isPending} onClick={()=>submit(false)} className="flex h-11 items-center gap-2 rounded-md border border-biz-blue px-5 text-[13px] font-semibold text-biz-blue"><Save className="h-4 w-4"/>Save Receipt</button><button disabled={createReceipt.isPending} onClick={()=>submit(true)} className="flex h-11 items-center gap-2 rounded-md bg-biz-blue px-5 text-[13px] font-semibold text-white"><Save className="h-4 w-4"/>Save &amp; Add Another</button></div></footer>
    </section>
  </div>;
}
