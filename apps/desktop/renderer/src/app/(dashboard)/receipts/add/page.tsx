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
const numberValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const percentage = (amount: number, gross: number) => gross > 0 ? (amount / gross * 100).toFixed(2) : "0.00";
const field = "h-9 w-full min-w-0 rounded-sm border border-biz-border bg-white px-2 text-[11px] font-medium text-biz-navy outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-biz-blue focus:ring-2 focus:ring-blue-100";
const invalidField = "border-red-400 bg-red-50/70 ring-2 ring-red-100 focus:border-red-500 focus:ring-red-100";
const receiptTypes = [
  { value: "RUNNING_BILL_PAYMENT", label: "Running Bill" },
  { value: "PROGRESS_PAYMENT", label: "Progress Payment" },
  { value: "ADVANCE_PAYMENT", label: "Advance Payment" },
  { value: "RETENTION_RECEIVED", label: "Retention Received" },
];

type PaymentMethod = "BANK_TRANSFER" | "CHEQUE" | "CASH";
type DeductionField = "vatDeductedAmount" | "taxDeductedAmount" | "securityDepositDeductedAmount" | "otherDeductionAmount";

interface ReceiptFormState {
  receiptDate: string;
  receiptType: string;
  receivableId: string;
  referenceNo: string;
  grossAmount: string;
  vatDeductedAmount: string;
  taxDeductedAmount: string;
  securityDepositDeductedAmount: string;
  otherDeductionAmount: string;
  paymentMethod: PaymentMethod;
  accountId: string;
  chequeNo: string;
  chequeDate: string;
  chequeBankName: string;
  remarks: string;
}

const emptyForm = (): ReceiptFormState => ({
  receiptDate: today(),
  receiptType: "RUNNING_BILL_PAYMENT",
  receivableId: "",
  referenceNo: "",
  grossAmount: "",
  vatDeductedAmount: "",
  taxDeductedAmount: "",
  securityDepositDeductedAmount: "",
  otherDeductionAmount: "",
  paymentMethod: "BANK_TRANSFER",
  accountId: "",
  chequeNo: "",
  chequeDate: today(),
  chequeBankName: "",
  remarks: "",
});

export default function AddProjectReceiptPage() {
  useSetBreadcrumb([{ label: "Receipts", href: "/receipts" }, { label: "Project Receipt", href: "/receipts" }, { label: "Add Receipt" }]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const works = useCmsWorks({ status: "ONGOING", page: 1, limit: 100 });
  const accounts = useBankAccounts();
  const createReceipt = useCreateReceipt();
  const [projectSearch, setProjectSearch] = React.useState("");
  const [workId, setWorkId] = React.useState(searchParams.get("workId") ?? "");
  const [form, setForm] = React.useState<ReceiptFormState>(emptyForm);
  const [error, setError] = React.useState("");
  const [showValidation, setShowValidation] = React.useState(false);
  const submitting = React.useRef(false);
  const projectSearchInitialized = React.useRef(false);
  const overview = useCmsWorkOverview(workId || undefined);
  const bills = useEligibleBills(workId || undefined);
  const project = works.data?.items.find((item) => item.id === workId);
  const bill = bills.data?.find((item) => item.id === form.receivableId);
  const activeAccounts = (accounts.data ?? []).filter((account) => account.isActive);
  const bankAccounts = activeAccounts.filter((account) => account.accountType === "BANK");
  const cashAccount = activeAccounts.find((account) => account.accountType === "CASH");
  const receivingAccountId = form.paymentMethod === "CASH" ? cashAccount?.id ?? "" : form.accountId;
  const filteredWorks = (works.data?.items ?? []).filter((item) => item.tenderNumber?.toLowerCase().includes(projectSearch.trim().toLowerCase()));
  const runningBill = form.receiptType === "RUNNING_BILL_PAYMENT";
  const selected = overview.data;

  const grossAmount = numberValue(form.grossAmount);
  const vatAmount = numberValue(form.vatDeductedAmount);
  const taxAmount = numberValue(form.taxDeductedAmount);
  const securityDepositAmount = numberValue(form.securityDepositDeductedAmount);
  const otherDeductionAmount = numberValue(form.otherDeductionAmount);
  const totalDeductions = vatAmount + taxAmount + securityDepositAmount + otherDeductionAmount;
  const netReceived = grossAmount - totalDeductions;
  const remainingBill = bill ? Number(bill.outstanding) - netReceived : null;

  const projectName = project?.workName ?? selected?.project.workName;
  const organizationName = project?.organizationMaster.shortName ?? selected?.project.organizationMaster.shortName;
  const workCategory = project?.workCategory ?? selected?.project.workCategory;
  const projectStatus = project?.status ?? selected?.project.status;
  const hasSelectedProject = Boolean(projectName);
  const missing = {
    project: showValidation && !workId,
    receiptDate: showValidation && !form.receiptDate,
    receiptType: showValidation && !form.receiptType,
    bill: showValidation && runningBill && !form.receivableId,
    grossAmount: showValidation && grossAmount <= 0,
    account: showValidation && !receivingAccountId,
    chequeNo: showValidation && form.paymentMethod === "CHEQUE" && !form.chequeNo.trim(),
    chequeDate: showValidation && form.paymentMethod === "CHEQUE" && !form.chequeDate,
    chequeBankName: showValidation && form.paymentMethod === "CHEQUE" && !form.chequeBankName.trim(),
  };

  const deductions: Array<{ key: DeductionField; label: string; amount: number; showRate: boolean }> = [
    { key: "vatDeductedAmount", label: "VAT Deducted", amount: vatAmount, showRate: true },
    { key: "taxDeductedAmount", label: "Tax Deducted", amount: taxAmount, showRate: true },
    { key: "securityDepositDeductedAmount", label: "SD / Retention", amount: securityDepositAmount, showRate: true },
    { key: "otherDeductionAmount", label: "Other Deduction", amount: otherDeductionAmount, showRate: false },
  ];

  React.useEffect(() => {
    if (!projectSearchInitialized.current && project?.tenderNumber) {
      setProjectSearch(project.tenderNumber);
      projectSearchInitialized.current = true;
    }
  }, [project?.tenderNumber]);

  function clearSettlement(value: ReceiptFormState): ReceiptFormState {
    return {
      ...value,
      receivableId: "",
      referenceNo: "",
      grossAmount: "",
      vatDeductedAmount: "",
      taxDeductedAmount: "",
      securityDepositDeductedAmount: "",
      otherDeductionAmount: "",
    };
  }

  function selectWork(id: string) {
    setWorkId(id);
    setError("");
    setForm((value) => clearSettlement(value));
  }

  function selectBill(id: string) {
    const selectedBill = bills.data?.find((item) => item.id === id);
    if (!selectedBill) {
      setForm((value) => ({ ...clearSettlement(value), receivableId: "" }));
      return;
    }
    const firstAllocation = Number(selectedBill.alreadyReceived) <= 0;
    setForm((value) => ({
      ...value,
      receivableId: id,
      referenceNo: selectedBill.billNo,
      grossAmount: firstAllocation ? selectedBill.grossBillAmount : selectedBill.outstanding,
      vatDeductedAmount: firstAllocation ? selectedBill.vatAmount : "",
      taxDeductedAmount: firstAllocation ? selectedBill.taxAmount : "",
      securityDepositDeductedAmount: firstAllocation ? selectedBill.securityDepositAmount : "",
      otherDeductionAmount: firstAllocation ? selectedBill.otherDeductionAmount : "",
    }));
  }

  async function submit(addAnother: boolean) {
    if (submitting.current) return;
    setError("");
    setShowValidation(true);

    if (!workId || !form.receiptDate || !form.receiptType || !grossAmount || !receivingAccountId || (runningBill && !form.receivableId)) {
      setError("Complete all required receipt cells.");
      return;
    }
    if ([vatAmount, taxAmount, securityDepositAmount, otherDeductionAmount].some((value) => value < 0)) {
      setError("Deduction amounts cannot be negative.");
      return;
    }
    if (netReceived <= 0) {
      setError("Total deductions must be less than the gross amount.");
      return;
    }
    if (bill && netReceived > Number(bill.outstanding)) {
      setError(`Net received cannot exceed ${money(bill.outstanding)} outstanding for ${bill.billNo}.`);
      return;
    }
    if (form.paymentMethod === "CHEQUE" && (!form.chequeNo.trim() || !form.chequeDate || !form.chequeBankName.trim())) {
      setError("Cheque number, cheque date and cheque bank are required.");
      return;
    }

    const receivedFrom = project?.organizationMaster.shortName ?? selected?.project.organizationMaster.shortName;
    if (!receivedFrom) {
      setError("Selected project details are still loading.");
      return;
    }

    const payload: SaveReceiptInput = {
      receiptDate: form.receiptDate,
      receiptCategory: "PROJECT",
      receiptType: form.receiptType,
      workId,
      receivableId: runningBill ? form.receivableId : undefined,
      receivedFrom,
      grossAmount,
      vatDeductedAmount: vatAmount,
      taxDeductedAmount: taxAmount,
      securityDepositDeductedAmount: securityDepositAmount,
      otherDeductionAmount,
      amount: netReceived,
      receivedInAccountId: receivingAccountId,
      paymentMethod: form.paymentMethod,
      referenceNo: form.paymentMethod === "CHEQUE" ? form.chequeNo.trim() : form.referenceNo.trim() || undefined,
      chequeNo: form.paymentMethod === "CHEQUE" ? form.chequeNo.trim() : undefined,
      chequeDate: form.paymentMethod === "CHEQUE" ? form.chequeDate : undefined,
      chequeBankName: form.paymentMethod === "CHEQUE" ? form.chequeBankName.trim() : undefined,
      description: form.remarks.trim() || undefined,
      status: "RECEIVED",
    };

    submitting.current = true;
    try {
      await createReceipt.mutateAsync(payload);
      if (addAnother) {
        setForm(emptyForm());
        setShowValidation(false);
      }
      else router.push(searchParams.get("returnTo") || "/receipts");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save receipt.");
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-3 text-biz-navy">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[24px] font-bold leading-tight">Add Project Receipt</h1>
          <p className="mt-1 text-[12px] text-biz-muted">Record the gross settlement, deductions and actual money received.</p>
        </div>
        <Link href="/receipts" className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-biz-border bg-white px-4 text-[12px] font-semibold transition-colors hover:border-blue-200 hover:bg-blue-50/50">
          <ArrowLeft className="h-4 w-4" />
          Back to Receipts
        </Link>
      </header>

      <section className="rounded-lg border border-blue-100 border-l-4 border-l-biz-blue bg-gradient-to-r from-white via-white to-blue-50/60 px-4 py-3 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(620px,1.15fr)] xl:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-100 text-biz-blue">
              <BriefcaseBusiness className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-biz-blue">Selected Project</p>
              <h2 className="mt-1 whitespace-normal break-words text-[15px] font-bold leading-5 text-biz-text">{projectName ?? "Select a Tender ID"}</h2>
              {hasSelectedProject ? (
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-biz-muted">
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-biz-blue">Tender ID: <strong>{project?.tenderNumber ?? "-"}</strong></span>
                  <span>Organization: <strong className="text-biz-text">{organizationName ?? "-"}</strong></span>
                  <span>Category: <strong className="text-biz-text">{workCategory ?? "-"}</strong></span>
                  <span>Contract Value: <strong className="text-biz-text">{money(selected?.financial.contractValue ?? project?.contractValue)}</strong></span>
                  <span>Status: <strong className="text-biz-text">{projectStatus?.replaceAll("_", " ") ?? "-"}</strong></span>
                </div>
              ) : (
                <p className="mt-1 text-[10px] text-biz-muted">Choose a Tender ID below to load its project information.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-y-3 border-t border-blue-100 pt-3 sm:grid-cols-3 xl:grid-cols-6 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
            {[
              { label: "NOA Amount", value: selected?.financial.noaAmount ? money(selected.financial.noaAmount) : "--", tone: "text-biz-blue" },
              { label: "Net Received", value: selected ? money(selected.summary.totalReceipt) : "--", tone: "text-green-700" },
              { label: "VAT Deducted", value: selected ? money(selected.summary.totalVatDeducted) : "--", tone: "text-orange-600" },
              { label: "Tax Deducted", value: selected ? money(selected.summary.totalTaxDeducted) : "--", tone: "text-orange-600" },
              { label: "SD Deducted", value: selected ? money(selected.summary.totalSecurityDepositDeducted) : "--", tone: "text-biz-text" },
              { label: "Receivable", value: selected ? money(selected.summary.balanceReceivable) : "--", tone: "text-red-600" },
            ].map((item) => (
              <div key={item.label} className="border-l border-blue-100 px-2 first:border-l-0">
                <p className="text-[8px] font-medium leading-3 text-biz-muted">{item.label}</p>
                <p className={cn("mt-1 whitespace-nowrap text-[10px] font-bold", item.tone)}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-biz-border border-t-2 border-t-biz-blue bg-white shadow-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50/70 px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-biz-blue text-[10px] font-bold text-white">1</span>
              <h2 className="text-[13px] font-bold text-biz-text">Project Receipt Entry Sheet</h2>
            </div>
            <p className="mt-1 pl-8 text-[10px] text-biz-muted">Select a bill to load its certified deductions, then adjust only the actual receipt values.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-red-100 bg-white px-2.5 py-1 text-[9px] font-semibold text-biz-muted"><b className="text-red-600">*</b> Required cell</span>
            <span className="rounded-full border border-green-100 bg-green-50 px-2.5 py-1 text-[9px] font-semibold text-green-700">Green cells calculate automatically</span>
          </div>
        </header>

        {error && (
          <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-[11px] font-semibold text-red-700">
            {error} Missing cells are highlighted below.
          </div>
        )}

        <div className="p-3">
          <div className="overflow-hidden rounded-md border border-biz-border">
            <div className="hidden grid-cols-[42px_minmax(0,1.55fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.15fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.15fr)] divide-x divide-biz-border bg-slate-100 text-[8px] font-bold uppercase tracking-wide text-biz-muted xl:grid">
              <div className="px-2 py-2 text-center">SL</div>
              <div className="px-2 py-2">Tender ID <b className="text-red-600">*</b></div>
              <div className="px-2 py-2">Receipt Date <b className="text-red-600">*</b></div>
              <div className="px-2 py-2">Receipt Type <b className="text-red-600">*</b></div>
              <div className="px-2 py-2">Bill / Reference <b className="text-red-600">{runningBill ? "*" : ""}</b></div>
              <div className="px-2 py-2 text-right">Gross Amount <b className="text-red-600">*</b></div>
              <div className="px-2 py-2 text-right">Net Received</div>
              <div className="px-2 py-2">Payment Method <b className="text-red-600">*</b></div>
              <div className="px-2 py-2">Receiving Account <b className="text-red-600">*</b></div>
            </div>

            <div className="grid gap-3 bg-white p-3 sm:grid-cols-2 xl:grid-cols-[42px_minmax(0,1.55fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.15fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.15fr)] xl:gap-0 xl:divide-x xl:divide-biz-border xl:p-0">
              <div className="hidden items-start justify-center px-1 py-2.5 xl:flex">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-biz-blue">1</span>
              </div>

              <div className="min-w-0 sm:col-span-2 xl:col-span-1 xl:p-2">
                <p className="mb-1 text-[10px] font-bold text-biz-text xl:hidden">Tender ID <b className="text-red-600">*</b></p>
                <div className="relative">
                  <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-biz-muted" />
                  <input
                    list="project-options"
                    value={projectSearch}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const input = event.target.value;
                      setProjectSearch(input);
                      const normalizedInput = input.trim().toLowerCase();
                      const match = (works.data?.items ?? []).find((work) => work.tenderNumber?.toLowerCase() === normalizedInput);
                      if (match) {
                        selectWork(match.id);
                      } else if (workId) {
                        setWorkId("");
                        setError("");
                        setForm((value) => clearSettlement(value));
                      }
                    }}
                    className={cn(field, "pr-8", missing.project && invalidField)}
                    placeholder={works.isLoading ? "Loading Tender IDs..." : "Type or select Tender ID..."}
                    aria-label="Tender ID"
                    autoComplete="off"
                  />
                  <datalist id="project-options">
                    {filteredWorks.map((work) => work.tenderNumber ? <option key={work.id} value={work.tenderNumber} /> : null)}
                  </datalist>
                </div>
              </div>

              <div className="min-w-0 xl:p-2">
                <p className="mb-1 text-[10px] font-bold text-biz-text xl:hidden">Receipt Date <b className="text-red-600">*</b></p>
                <input type="date" aria-label="Receipt Date" value={form.receiptDate} onChange={(event) => setForm((value) => ({ ...value, receiptDate: event.target.value }))} className={cn(field, missing.receiptDate && invalidField)} />
              </div>

              <div className="min-w-0 xl:p-2">
                <p className="mb-1 text-[10px] font-bold text-biz-text xl:hidden">Receipt Type <b className="text-red-600">*</b></p>
                <select
                  aria-label="Receipt Type"
                  value={form.receiptType}
                  onChange={(event) => setForm((value) => clearSettlement({ ...value, receiptType: event.target.value }))}
                  className={cn(field, missing.receiptType && invalidField)}
                >
                  {receiptTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>

              <div className="min-w-0 xl:p-2">
                <p className="mb-1 text-[10px] font-bold text-biz-text xl:hidden">Bill / Reference {runningBill && <b className="text-red-600">*</b>}</p>
                {runningBill ? (
                  <select aria-label="Bill or Reference Number" value={form.receivableId} onChange={(event) => selectBill(event.target.value)} className={cn(field, missing.bill && invalidField)}>
                    <option value="">Select bill / IPC</option>
                    {(bills.data ?? []).map((eligibleBill) => <option key={eligibleBill.id} value={eligibleBill.id}>{eligibleBill.billNo}</option>)}
                  </select>
                ) : (
                  <input aria-label="Bill or Reference Number" value={form.referenceNo} onChange={(event) => setForm((value) => ({ ...value, referenceNo: event.target.value }))} className={field} placeholder="Reference no." />
                )}
              </div>

              <div className="min-w-0 xl:bg-amber-50/30 xl:p-2">
                <p className="mb-1 text-[10px] font-bold text-biz-text xl:hidden">Gross Amount <b className="text-red-600">*</b></p>
                <input type="number" aria-label="Gross Amount" min="0.01" step="0.01" value={form.grossAmount} onChange={(event) => setForm((value) => ({ ...value, grossAmount: event.target.value }))} className={cn(field, "text-right font-bold", missing.grossAmount && invalidField)} placeholder="0.00" />
              </div>

              <div className="min-w-0 xl:bg-green-50/40 xl:p-2">
                <p className="mb-1 text-[10px] font-bold text-biz-text xl:hidden">Net Received</p>
                <div className={cn("flex h-9 items-center justify-end rounded-sm border px-2 text-[11px] font-bold", netReceived > 0 ? "border-green-200 bg-green-50 text-green-700" : "border-red-100 bg-red-50/50 text-red-600")}>
                  {Number(netReceived || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="min-w-0 xl:p-2">
                <p className="mb-1 text-[10px] font-bold text-biz-text xl:hidden">Payment Method <b className="text-red-600">*</b></p>
                <select
                  aria-label="Payment Method"
                  value={form.paymentMethod}
                  onChange={(event) => setForm((value) => ({ ...value, paymentMethod: event.target.value as PaymentMethod, accountId: "" }))}
                  className={field}
                >
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>

              <div className="min-w-0 sm:col-span-2 xl:col-span-1 xl:p-2">
                <p className="mb-1 text-[10px] font-bold text-biz-text xl:hidden">Receiving Account <b className="text-red-600">*</b></p>
                {form.paymentMethod === "CASH" ? (
                  <div className={cn("flex h-9 items-center truncate rounded-sm border border-green-200 bg-green-50 px-2 text-[10px] font-semibold text-green-700", missing.account && invalidField)}>{cashAccount?.accountName ?? "No active cash account"}</div>
                ) : (
                  <select aria-label="Receiving Bank Account" value={form.accountId} onChange={(event) => setForm((value) => ({ ...value, accountId: event.target.value }))} className={cn(field, missing.account && invalidField)}>
                    <option value="">Select bank account</option>
                    {bankAccounts.map((account) => <option key={account.id} value={account.id}>{(account.bankName ? account.bankName + " - " : "") + account.accountName}</option>)}
                  </select>
                )}
              </div>
            </div>

            <div className="border-t border-biz-border">
              <div className="hidden grid-cols-4 divide-x divide-biz-border bg-blue-50/70 text-[8px] font-bold uppercase tracking-wide text-biz-muted sm:grid">
                {deductions.map((item) => <div key={item.key} className="px-3 py-2">{item.label} (BDT)</div>)}
              </div>
              <div className="grid grid-cols-1 divide-y divide-biz-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
                {deductions.map((item) => (
                  <div key={item.key} className="min-w-0 p-2">
                    <p className="mb-1 text-[10px] font-bold text-biz-text sm:hidden">{item.label}</p>
                    <div className="flex">
                      <input
                        type="number"
                        aria-label={item.label}
                        min="0"
                        step="0.01"
                        value={form[item.key]}
                        onChange={(event) => setForm((value) => ({ ...value, [item.key]: event.target.value }))}
                        className={cn(field, item.showRate ? "rounded-r-none text-right" : "text-right")}
                        placeholder="0.00"
                      />
                      {item.showRate && (
                        <span className="flex h-9 min-w-14 items-center justify-center rounded-r-sm border border-l-0 border-biz-border bg-slate-50 px-2 text-[9px] font-bold text-biz-muted">
                          {percentage(item.amount, grossAmount)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid border-t border-biz-border bg-white lg:grid-cols-[150px_minmax(0,1fr)]">
              <div className="border-b border-biz-border bg-slate-100 px-3 py-2 lg:border-b-0 lg:border-r">
                <p className="text-[9px] font-bold uppercase tracking-wide text-biz-muted">Payment Details</p>
                <p className="mt-0.5 text-[9px] text-biz-muted">{form.paymentMethod.replaceAll("_", " ")}</p>
              </div>
              <div className="p-2">
                {form.paymentMethod === "BANK_TRANSFER" && (
                  <input value={form.referenceNo} onChange={(event) => setForm((value) => ({ ...value, referenceNo: event.target.value }))} className={field} placeholder="Bank transaction / transfer reference (optional)" />
                )}
                {form.paymentMethod === "CHEQUE" && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input value={form.chequeNo} onChange={(event) => setForm((value) => ({ ...value, chequeNo: event.target.value }))} className={cn(field, missing.chequeNo && invalidField)} placeholder="Cheque number *" />
                    <input type="date" value={form.chequeDate} onChange={(event) => setForm((value) => ({ ...value, chequeDate: event.target.value }))} className={cn(field, missing.chequeDate && invalidField)} aria-label="Cheque Date" />
                    <input value={form.chequeBankName} onChange={(event) => setForm((value) => ({ ...value, chequeBankName: event.target.value }))} className={cn(field, missing.chequeBankName && invalidField)} placeholder="Cheque bank *" />
                  </div>
                )}
                {form.paymentMethod === "CASH" && <p className="rounded-sm bg-green-50 px-3 py-2 text-[10px] text-green-700">The net received amount will be posted to the active cash account.</p>}
              </div>
            </div>

            <div className="grid border-t border-biz-border bg-white lg:grid-cols-[150px_minmax(0,1fr)]">
              <div className="border-b border-biz-border bg-slate-100 px-3 py-2 lg:border-b-0 lg:border-r">
                <p className="text-[9px] font-bold uppercase tracking-wide text-biz-muted">Remarks</p>
                <p className="mt-0.5 text-[9px] text-biz-muted">Optional</p>
              </div>
              <div className="relative p-2">
                <textarea
                  aria-label="Remarks"
                  maxLength={300}
                  rows={2}
                  value={form.remarks}
                  onChange={(event) => setForm((value) => ({ ...value, remarks: event.target.value }))}
                  className="min-h-[52px] w-full resize-none rounded-sm border border-biz-border px-3 py-2 pr-16 text-[11px] outline-none transition-colors focus:border-biz-blue focus:ring-2 focus:ring-blue-100"
                  placeholder="Add receipt notes or payment details..."
                />
                <span className="absolute bottom-4 right-4 text-[8px] text-biz-muted">{form.remarks.length} / 300</span>
              </div>
            </div>
          </div>

          <div className="mt-2 grid overflow-hidden rounded-md border border-blue-100 bg-slate-50 sm:grid-cols-4 sm:divide-x sm:divide-blue-100">
            {[
              { label: "Gross Settlement", value: grossAmount, tone: "text-biz-blue" },
              { label: "Total Deductions", value: totalDeductions, tone: "text-orange-600" },
              { label: "Net Received", value: netReceived, tone: netReceived > 0 ? "text-green-700" : "text-red-600" },
              { label: "Bill Remaining", value: remainingBill, tone: remainingBill !== null && remainingBill < 0 ? "text-red-600" : "text-biz-text" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 border-b border-biz-border px-3 py-2 last:border-b-0 sm:block sm:border-b-0 sm:text-center">
                <p className="text-[8px] font-bold uppercase tracking-wide text-biz-muted">{item.label}</p>
                <p className={cn("mt-0.5 text-[12px] font-bold", item.tone)}>{item.value === null ? "--" : money(item.value)}</p>
              </div>
            ))}
          </div>

          {bill && <p className="mt-2 text-right text-[9px] text-biz-muted">Selected bill outstanding before this receipt: <strong className="text-biz-text">{money(bill.outstanding)}</strong></p>}

        </div>

        <footer className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-biz-border bg-white/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[10px] text-biz-muted"><b className="text-red-600">*</b> Complete required cells before saving.</span>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => router.push("/receipts")} className="inline-flex h-10 items-center gap-2 rounded-md border border-biz-border px-4 text-[12px] font-semibold transition-colors hover:bg-slate-50">
              <X className="h-4 w-4" />
              Cancel
            </button>
            <button disabled={createReceipt.isPending} onClick={() => submit(false)} className="inline-flex h-10 items-center gap-2 rounded-md border border-biz-blue px-4 text-[12px] font-semibold text-biz-blue transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60">
              <Save className="h-4 w-4" />
              Save Receipt
            </button>
            <button disabled={createReceipt.isPending} onClick={() => submit(true)} className="inline-flex h-10 items-center gap-2 rounded-md bg-biz-blue px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              <Save className="h-4 w-4" />
              Save &amp; Add Another
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
