"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, Check, ChevronDown, Save, Search, X } from "lucide-react";
import {
  useBankAccounts,
  useCmsWorkOverview,
  useCmsWorks,
  useCreateReceipt,
} from "@bizovix/api-client";
import type { SaveReceiptInput } from "@bizovix/types";
import { cn } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const today = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};
const money = (value?: string | number | null) => formatBDT(value ?? 0);
const numberValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const percentage = (amount: number, gross: number) =>
  gross > 0 ? ((amount / gross) * 100).toFixed(2) : "0.00";
const field =
  "h-9 w-full min-w-0 rounded-sm border border-biz-border bg-white px-2 text-[11px] font-medium text-biz-navy outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-biz-blue focus:ring-2 focus:ring-blue-100";
const invalidField =
  "border-red-400 bg-red-50/70 ring-2 ring-red-100 focus:border-red-500 focus:ring-red-100";
const receiptTypes = [
  { value: "PROGRESS_PAYMENT", label: "Progress Payment" },
  { value: "ADVANCE_PAYMENT", label: "Advance Payment" },
  { value: "RETENTION_RECEIVED", label: "Retention Received" },
];

type PaymentMethod = "BANK_TRANSFER" | "CHEQUE" | "CASH";
type DeductionField =
  | "vatDeductedAmount"
  | "taxDeductedAmount"
  | "securityDepositDeductedAmount"
  | "otherDeductionAmount";

interface ReceiptFormState {
  receiptDate: string;
  receiptType: string;
  referenceNo: string;
  receivedAmount: string;
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
  receiptType: "PROGRESS_PAYMENT",
  referenceNo: "",
  receivedAmount: "",
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
  useSetBreadcrumb([
    { label: "Receipts", href: "/receipts" },
    { label: "Project Receipt", href: "/receipts" },
    { label: "Add Receipt" },
  ]);
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
  const [projectPickerOpen, setProjectPickerOpen] = React.useState(false);
  const [highlightedProjectIndex, setHighlightedProjectIndex] = React.useState(0);
  const submitting = React.useRef(false);
  const projectSearchInitialized = React.useRef(false);
  const projectPickerRef = React.useRef<HTMLDivElement>(null);
  const projectInputRef = React.useRef<HTMLInputElement>(null);
  const receiptDateRef = React.useRef<HTMLInputElement>(null);
  const overview = useCmsWorkOverview(workId || undefined);
  const project = works.data?.items.find((item) => item.id === workId);
  const activeAccounts = (accounts.data ?? []).filter((account) => account.isActive);
  const bankAccounts = activeAccounts.filter((account) => account.accountType === "BANK");
  const cashAccount = activeAccounts.find((account) => account.accountType === "CASH");
  const receivingAccountId =
    form.paymentMethod === "CASH" ? (cashAccount?.id ?? "") : form.accountId;
  const filteredWorks = (works.data?.items ?? [])
    .filter((item) => item.tenderNumber?.toLowerCase().includes(projectSearch.trim().toLowerCase()))
    .sort((left, right) =>
      (right.tenderNumber ?? "").localeCompare(left.tenderNumber ?? "", undefined, {
        numeric: true,
      }),
    );
  const selected = overview.data;

  const noaAmount = Number(selected?.financial.noaAmount ?? 0);
  const receivedAmount = numberValue(form.receivedAmount);
  const vatAmount = numberValue(form.vatDeductedAmount);
  const taxAmount = numberValue(form.taxDeductedAmount);
  const otherDeductionAmount = numberValue(form.otherDeductionAmount);
  const manuallyAllocatedAmount = roundMoney(
    receivedAmount + vatAmount + taxAmount + otherDeductionAmount,
  );
  const allocationRemainder = roundMoney(noaAmount - manuallyAllocatedAmount);
  const allocationExceedsNoa = noaAmount > 0 && allocationRemainder < 0;
  const securityDepositAmount = noaAmount > 0 ? Math.max(0, allocationRemainder) : 0;
  const calculatedBillAmount = noaAmount;
  const amountAfterVatTax = Math.max(0, roundMoney(noaAmount - vatAmount - taxAmount));

  const projectName = project?.workName ?? selected?.project.workName;
  const organizationName =
    project?.organizationMaster.shortName ?? selected?.project.organizationMaster.shortName;
  const workCategory = project?.workCategory ?? selected?.project.workCategory;
  const projectStatus = project?.status ?? selected?.project.status;
  const hasSelectedProject = Boolean(workId && projectName);
  const missing = {
    project: showValidation && !workId,
    receiptDate: showValidation && !form.receiptDate,
    receiptType: showValidation && !form.receiptType,
    receivedAmount: showValidation && receivedAmount <= 0,
    account: showValidation && !receivingAccountId,
    chequeNo: showValidation && form.paymentMethod === "CHEQUE" && !form.chequeNo.trim(),
    chequeDate: showValidation && form.paymentMethod === "CHEQUE" && !form.chequeDate,
    chequeBankName:
      showValidation && form.paymentMethod === "CHEQUE" && !form.chequeBankName.trim(),
  };

  const deductions: Array<{
    key: DeductionField;
    label: string;
    amount: number;
    showRate: boolean;
    rateBase: number;
  }> = [
    {
      key: "vatDeductedAmount",
      label: "VAT Deducted",
      amount: vatAmount,
      showRate: true,
      rateBase: noaAmount,
    },
    {
      key: "taxDeductedAmount",
      label: "Tax Deducted",
      amount: taxAmount,
      showRate: true,
      rateBase: noaAmount,
    },
    {
      key: "securityDepositDeductedAmount",
      label: "SD Retained (Auto)",
      amount: securityDepositAmount,
      showRate: true,
      rateBase: noaAmount,
    },
    {
      key: "otherDeductionAmount",
      label: "Other Deduction",
      amount: otherDeductionAmount,
      showRate: false,
      rateBase: noaAmount,
    },
  ];

  React.useEffect(() => {
    if (!projectSearchInitialized.current && project?.tenderNumber) {
      setProjectSearch(project.tenderNumber);
      projectSearchInitialized.current = true;
    }
  }, [project?.tenderNumber]);

  React.useEffect(() => {
    setHighlightedProjectIndex(0);
  }, [projectSearch]);

  React.useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!projectPickerRef.current?.contains(event.target as Node)) {
        setProjectPickerOpen(false);
        setProjectSearch(project?.tenderNumber ?? "");
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [project?.tenderNumber]);

  function clearSettlement(value: ReceiptFormState): ReceiptFormState {
    return {
      ...value,
      referenceNo: "",
      receivedAmount: "",
      vatDeductedAmount: "",
      taxDeductedAmount: "",
      securityDepositDeductedAmount: "",
      otherDeductionAmount: "",
    };
  }

  function selectWork(id: string) {
    const nextProject = works.data?.items.find((item) => item.id === id);
    setWorkId(id);
    setProjectSearch(nextProject?.tenderNumber ?? "");
    setProjectPickerOpen(false);
    setHighlightedProjectIndex(0);
    setError("");
    if (id !== workId) setForm((value) => clearSettlement(value));
    window.requestAnimationFrame(() => receiptDateRef.current?.focus());
  }

  function changeProject() {
    setWorkId("");
    setProjectSearch("");
    setProjectPickerOpen(true);
    setHighlightedProjectIndex(0);
    setShowValidation(false);
    setError("");
    setForm((value) => clearSettlement(value));
    window.requestAnimationFrame(() => projectInputRef.current?.focus());
  }

  function handleProjectKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setProjectPickerOpen(true);
      setHighlightedProjectIndex((index) =>
        Math.min(index + 1, Math.max(filteredWorks.length - 1, 0)),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedProjectIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && projectPickerOpen && filteredWorks[highlightedProjectIndex]) {
      event.preventDefault();
      selectWork(filteredWorks[highlightedProjectIndex].id);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setProjectPickerOpen(false);
      setProjectSearch(project?.tenderNumber ?? "");
    }
  }

  async function submit(addAnother: boolean) {
    if (submitting.current) return;
    setError("");
    setShowValidation(true);

    if (
      !workId ||
      !form.receiptDate ||
      !form.receiptType ||
      receivedAmount <= 0 ||
      !receivingAccountId
    ) {
      setError("Complete all required receipt cells.");
      return;
    }
    if (noaAmount <= 0) {
      setError("The selected project does not have a valid NOA amount.");
      return;
    }
    if ([vatAmount, taxAmount, otherDeductionAmount].some((value) => value < 0)) {
      setError("Deduction amounts cannot be negative.");
      return;
    }
    if (allocationExceedsNoa) {
      setError(
        `Amount Received, VAT, Tax and Other Deduction exceed the NOA amount by ${money(Math.abs(allocationRemainder))}.`,
      );
      return;
    }
    if (
      form.paymentMethod === "CHEQUE" &&
      (!form.chequeNo.trim() || !form.chequeDate || !form.chequeBankName.trim())
    ) {
      setError("Cheque number, cheque date and cheque bank are required.");
      return;
    }

    const receivedFrom =
      project?.organizationMaster.shortName ?? selected?.project.organizationMaster.shortName;
    if (!receivedFrom) {
      setError("Selected project details are still loading.");
      return;
    }

    const payload: SaveReceiptInput = {
      receiptDate: form.receiptDate,
      receiptCategory: "PROJECT",
      receiptType: form.receiptType,
      workId,
      receivedFrom,
      grossAmount: calculatedBillAmount,
      vatDeductedAmount: vatAmount,
      taxDeductedAmount: taxAmount,
      securityDepositDeductedAmount: securityDepositAmount,
      otherDeductionAmount,
      amount: receivedAmount,
      receivedInAccountId: receivingAccountId,
      paymentMethod: form.paymentMethod,
      referenceNo:
        form.paymentMethod === "CHEQUE"
          ? form.chequeNo.trim()
          : form.referenceNo.trim() || undefined,
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
      } else router.push(searchParams.get("returnTo") || "/receipts");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save receipt.");
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-2.5 text-biz-navy lg:h-full lg:min-h-0 lg:overflow-hidden">
      <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[24px] font-bold leading-tight">Add Project Receipt</h1>
          <p className="mt-1 text-[12px] text-biz-muted">
            Record the amount received and actual deductions against the selected project's NOA.
          </p>
        </div>
        <Link
          href="/receipts"
          className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-biz-border bg-white px-4 text-[12px] font-semibold transition-colors hover:border-blue-200 hover:bg-blue-50/50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Receipts
        </Link>
      </header>

      <section className="shrink-0 rounded-lg border border-blue-100 bg-gradient-to-r from-white via-white to-blue-50/60 px-3 py-2.5 shadow-sm">
        {!hasSelectedProject ? (
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex shrink-0 items-center gap-2.5 lg:w-[250px]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-biz-blue">
                <BriefcaseBusiness className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-biz-blue">
                  Step 1
                </p>
                <h2 className="text-[13px] font-bold text-biz-text">Select an ongoing project</h2>
              </div>
            </div>
            <div ref={projectPickerRef} className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-biz-muted" />
              <input
                ref={projectInputRef}
                role="combobox"
                aria-expanded={projectPickerOpen}
                aria-controls="tender-id-options"
                aria-autocomplete="list"
                aria-activedescendant={
                  projectPickerOpen && filteredWorks[highlightedProjectIndex]
                    ? `tender-option-${filteredWorks[highlightedProjectIndex].id}`
                    : undefined
                }
                value={projectSearch}
                onFocus={() => {
                  setProjectSearch("");
                  setProjectPickerOpen(true);
                }}
                onChange={(event) => {
                  setProjectSearch(event.target.value);
                  setProjectPickerOpen(true);
                }}
                onKeyDown={handleProjectKeyDown}
                className={cn(field, "h-10 pl-9 pr-9 text-[12px]", missing.project && invalidField)}
                placeholder={works.isLoading ? "Loading projects..." : "Search by Tender ID..."}
                aria-label="Tender ID"
                autoComplete="off"
              />
              <ChevronDown
                className={cn(
                  "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted transition-transform",
                  projectPickerOpen && "rotate-180",
                )}
              />
              {projectPickerOpen && (
                <div
                  id="tender-id-options"
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-blue-200 bg-white py-1 shadow-[0_12px_30px_rgba(15,35,75,0.18)]"
                >
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-blue-100 bg-blue-50 px-3 py-1.5 text-[10px] font-semibold text-biz-muted">
                    <span>Ongoing projects</span>
                    <span>{filteredWorks.length} found</span>
                  </div>
                  {filteredWorks.length > 0 ? (
                    filteredWorks.map((work, index) => (
                      <button
                        id={`tender-option-${work.id}`}
                        key={work.id}
                        type="button"
                        role="option"
                        aria-selected={work.id === workId}
                        onMouseEnter={() => setHighlightedProjectIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectWork(work.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors",
                          index === highlightedProjectIndex ? "bg-blue-50" : "hover:bg-slate-50",
                        )}
                      >
                        <span className="min-w-0">
                          <strong className="block text-[12px] text-biz-blue">
                            {work.tenderNumber}
                          </strong>
                          <span className="block truncate text-[11px] text-biz-muted">
                            {work.workName}
                          </span>
                        </span>
                        {work.id === workId && (
                          <Check className="h-4 w-4 shrink-0 text-green-600" />
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-5 text-center text-[11px] text-biz-muted">
                      No matching ongoing project found.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(300px,1.15fr)_minmax(420px,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-biz-blue">
                <BriefcaseBusiness className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-biz-blue">
                  Selected Project
                </p>
                <h2 className="truncate text-[14px] font-bold text-biz-text" title={projectName}>
                  {projectName}
                </h2>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-biz-muted">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-biz-blue">
                    TID <strong>{project?.tenderNumber ?? "-"}</strong>
                  </span>
                  <span>{organizationName ?? "-"}</span>
                  <span>
                    <strong className="text-biz-text">{workCategory ?? "-"}</strong>
                  </span>
                  <span>{projectStatus?.replaceAll("_", " ") ?? "-"}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 border-t border-blue-100 pt-2 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
              {[
                {
                  label: "NOA Amount",
                  value: selected?.financial.noaAmount ? money(selected.financial.noaAmount) : "--",
                  tone: "text-biz-blue",
                },
                {
                  label: "Net Received",
                  value: selected ? money(selected.summary.totalReceipt) : "--",
                  tone: "text-green-700",
                },
                {
                  label: "Receivable",
                  value: selected ? money(selected.summary.balanceReceivable) : "--",
                  tone: "text-red-600",
                },
                {
                  label: "VAT Deducted",
                  value: selected ? money(selected.summary.totalVatDeducted) : "--",
                  tone: "text-orange-600",
                },
                {
                  label: "Tax Deducted",
                  value: selected ? money(selected.summary.totalTaxDeducted) : "--",
                  tone: "text-orange-600",
                },
                {
                  label: "SD Deducted",
                  value: selected ? money(selected.summary.totalSecurityDepositDeducted) : "--",
                  tone: "text-biz-text",
                },
              ].map((item) => (
                <div key={item.label} className="min-w-0 rounded-md bg-white/80 px-2 py-1">
                  <p className="truncate text-[9px] text-biz-muted">{item.label}</p>
                  <p className={cn("truncate text-[11px] font-bold", item.tone)}>{item.value}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={changeProject}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-biz-blue bg-white px-3 text-[11px] font-semibold text-biz-blue hover:bg-blue-50"
            >
              <Search className="h-3.5 w-3.5" /> Change Project
            </button>
          </div>
        )}
      </section>

      {hasSelectedProject ? (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-biz-border border-t-2 border-t-biz-blue bg-white shadow-card">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50/70 px-4 py-2.5">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-biz-blue text-[10px] font-bold text-white">
                  2
                </span>
                <h2 className="text-[13px] font-bold text-biz-text">Receipt Details</h2>
              </div>
              <p className="mt-1 pl-8 text-[10px] text-biz-muted">
                Enter Amount Received, VAT and Tax. The remaining NOA balance moves to SD
                automatically.
              </p>
            </div>
            <span className="rounded-full border border-green-100 bg-green-50 px-2.5 py-1 text-[9px] font-semibold text-green-700">
              SD and percentages calculate automatically
            </span>
          </header>

          {error && (
            <div
              role="alert"
              className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-[11px] font-semibold text-red-700"
            >
              {error}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="overflow-hidden rounded-md border border-biz-border">
              <div className="hidden grid-cols-[minmax(130px,0.9fr)_minmax(150px,1fr)_minmax(130px,0.85fr)_minmax(150px,1fr)_minmax(190px,1.25fr)] divide-x divide-biz-border bg-slate-100 text-[8px] font-bold uppercase tracking-wide text-biz-muted lg:grid">
                <div className="px-2 py-2">
                  Receipt Date <b className="text-red-600">*</b>
                </div>
                <div className="px-2 py-2">
                  Receipt Type <b className="text-red-600">*</b>
                </div>
                <div className="px-2 py-2 text-right">
                  Amount Received <b className="text-red-600">*</b>
                </div>
                <div className="px-2 py-2">
                  Payment Method <b className="text-red-600">*</b>
                </div>
                <div className="px-2 py-2">
                  Receiving Account <b className="text-red-600">*</b>
                </div>
              </div>

              <div className="grid gap-3 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[minmax(130px,0.9fr)_minmax(150px,1fr)_minmax(130px,0.85fr)_minmax(150px,1fr)_minmax(190px,1.25fr)] lg:gap-0 lg:divide-x lg:divide-biz-border lg:p-0">
                <div className="min-w-0 lg:p-2">
                  <p className="mb-1 text-[10px] font-bold text-biz-text lg:hidden">
                    Receipt Date <b className="text-red-600">*</b>
                  </p>
                  <input
                    ref={receiptDateRef}
                    type="date"
                    aria-label="Receipt Date"
                    value={form.receiptDate}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, receiptDate: event.target.value }))
                    }
                    className={cn(field, missing.receiptDate && invalidField)}
                  />
                </div>

                <div className="min-w-0 lg:p-2">
                  <p className="mb-1 text-[10px] font-bold text-biz-text lg:hidden">
                    Receipt Type <b className="text-red-600">*</b>
                  </p>
                  <select
                    aria-label="Receipt Type"
                    value={form.receiptType}
                    onChange={(event) =>
                      setForm((value) =>
                        clearSettlement({ ...value, receiptType: event.target.value }),
                      )
                    }
                    className={cn(field, missing.receiptType && invalidField)}
                  >
                    {receiptTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0 lg:bg-amber-50/30 lg:p-2">
                  <p className="mb-1 text-[10px] font-bold text-biz-text lg:hidden">
                    Amount Received <b className="text-red-600">*</b>
                  </p>
                  <input
                    type="number"
                    aria-label="Amount Received"
                    min="0.01"
                    step="0.01"
                    value={form.receivedAmount}
                    onChange={(event) => {
                      setForm((value) => ({ ...value, receivedAmount: event.target.value }));
                      setError("");
                    }}
                    className={cn(
                      field,
                      "text-right font-bold",
                      (missing.receivedAmount || allocationExceedsNoa) && invalidField,
                    )}
                    placeholder="0.00"
                  />
                </div>

                <div className="min-w-0 lg:p-2">
                  <p className="mb-1 text-[10px] font-bold text-biz-text lg:hidden">
                    Payment Method <b className="text-red-600">*</b>
                  </p>
                  <select
                    aria-label="Payment Method"
                    value={form.paymentMethod}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        paymentMethod: event.target.value as PaymentMethod,
                        accountId: "",
                      }))
                    }
                    className={field}
                  >
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>

                <div className="min-w-0 sm:col-span-2 lg:col-span-1 lg:p-2">
                  <p className="mb-1 text-[10px] font-bold text-biz-text lg:hidden">
                    Receiving Account <b className="text-red-600">*</b>
                  </p>
                  {form.paymentMethod === "CASH" ? (
                    <div
                      className={cn(
                        "flex h-9 items-center truncate rounded-sm border border-green-200 bg-green-50 px-2 text-[10px] font-semibold text-green-700",
                        missing.account && invalidField,
                      )}
                    >
                      {cashAccount?.accountName ?? "No active cash account"}
                    </div>
                  ) : (
                    <select
                      aria-label="Receiving Bank Account"
                      value={form.accountId}
                      onChange={(event) =>
                        setForm((value) => ({ ...value, accountId: event.target.value }))
                      }
                      className={cn(field, missing.account && invalidField)}
                    >
                      <option value="">Select bank account</option>
                      {bankAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {(account.bankName ? account.bankName + " - " : "") + account.accountName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="border-t border-biz-border">
                <div className="hidden grid-cols-4 divide-x divide-biz-border bg-blue-50/70 text-[8px] font-bold uppercase tracking-wide text-biz-muted sm:grid">
                  {deductions.map((item) => (
                    <div key={item.key} className="px-3 py-2">
                      {item.label} (BDT)
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 divide-y divide-biz-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
                  {deductions.map((item) => {
                    const automaticSd = item.key === "securityDepositDeductedAmount";
                    return (
                      <div
                        key={item.key}
                        className={cn("min-w-0 p-2", automaticSd && "bg-emerald-50/70")}
                      >
                        <p className="mb-1 text-[10px] font-bold text-biz-text sm:hidden">
                          {item.label}
                        </p>
                        <div className="flex">
                          <input
                            type="number"
                            aria-label={item.label}
                            min="0"
                            step="0.01"
                            value={
                              automaticSd
                                ? noaAmount > 0
                                  ? securityDepositAmount.toFixed(2)
                                  : ""
                                : form[item.key]
                            }
                            readOnly={automaticSd}
                            tabIndex={automaticSd ? -1 : undefined}
                            onChange={
                              automaticSd
                                ? undefined
                                : (event) => {
                                    setForm((value) => ({
                                      ...value,
                                      [item.key]: event.target.value,
                                    }));
                                    setError("");
                                  }
                            }
                            className={cn(
                              field,
                              item.showRate ? "rounded-r-none text-right" : "text-right",
                              automaticSd &&
                                "cursor-not-allowed border-emerald-200 bg-emerald-50 font-bold text-emerald-700",
                              allocationExceedsNoa && invalidField,
                            )}
                            placeholder="0.00"
                          />
                          {item.showRate && (
                            <span
                              title={
                                automaticSd
                                  ? "NOA minus Amount Received, VAT, Tax and Other Deduction"
                                  : "Percentage of the selected project's NOA amount"
                              }
                              className={cn(
                                "flex h-9 min-w-14 items-center justify-center rounded-r-sm border border-l-0 border-biz-border bg-slate-50 px-2 text-[9px] font-bold text-biz-muted",
                                automaticSd &&
                                  "border-emerald-200 bg-emerald-100/70 text-emerald-700",
                              )}
                            >
                              {percentage(item.amount, item.rateBase)}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid border-t border-biz-border bg-white lg:grid-cols-[150px_minmax(0,1fr)]">
                <div className="border-b border-biz-border bg-slate-100 px-3 py-2 lg:border-b-0 lg:border-r">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-biz-muted">
                    Payment Details
                  </p>
                  <p className="mt-0.5 text-[9px] text-biz-muted">
                    {form.paymentMethod.replaceAll("_", " ")}
                  </p>
                </div>
                <div className="p-2">
                  {form.paymentMethod === "BANK_TRANSFER" && (
                    <input
                      value={form.referenceNo}
                      onChange={(event) =>
                        setForm((value) => ({ ...value, referenceNo: event.target.value }))
                      }
                      className={field}
                      placeholder="Bank transaction / transfer reference (optional)"
                    />
                  )}
                  {form.paymentMethod === "CHEQUE" && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={form.chequeNo}
                        onChange={(event) =>
                          setForm((value) => ({ ...value, chequeNo: event.target.value }))
                        }
                        className={cn(field, missing.chequeNo && invalidField)}
                        placeholder="Cheque number *"
                      />
                      <input
                        type="date"
                        value={form.chequeDate}
                        onChange={(event) =>
                          setForm((value) => ({ ...value, chequeDate: event.target.value }))
                        }
                        className={cn(field, missing.chequeDate && invalidField)}
                        aria-label="Cheque Date"
                      />
                      <input
                        value={form.chequeBankName}
                        onChange={(event) =>
                          setForm((value) => ({ ...value, chequeBankName: event.target.value }))
                        }
                        className={cn(field, missing.chequeBankName && invalidField)}
                        placeholder="Cheque bank *"
                      />
                    </div>
                  )}
                  {form.paymentMethod === "CASH" && (
                    <p className="rounded-sm bg-green-50 px-3 py-2 text-[10px] text-green-700">
                      The net received amount will be posted to the active cash account.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid border-t border-biz-border bg-white lg:grid-cols-[150px_minmax(0,1fr)]">
                <div className="border-b border-biz-border bg-slate-100 px-3 py-2 lg:border-b-0 lg:border-r">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-biz-muted">
                    Remarks
                  </p>
                  <p className="mt-0.5 text-[9px] text-biz-muted">Optional</p>
                </div>
                <div className="relative p-2">
                  <textarea
                    aria-label="Remarks"
                    maxLength={300}
                    rows={2}
                    value={form.remarks}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, remarks: event.target.value }))
                    }
                    className="min-h-[52px] w-full resize-none rounded-sm border border-biz-border px-3 py-2 pr-16 text-[11px] outline-none transition-colors focus:border-biz-blue focus:ring-2 focus:ring-blue-100"
                    placeholder="Add receipt notes or payment details..."
                  />
                  <span className="absolute bottom-4 right-4 text-[8px] text-biz-muted">
                    {form.remarks.length} / 300
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-2 grid overflow-hidden rounded-md border border-blue-100 bg-slate-50 sm:grid-cols-5 sm:divide-x sm:divide-blue-100">
              {[
                { label: "NOA Amount", value: calculatedBillAmount, tone: "text-biz-blue" },
                {
                  label: "VAT & Tax Deducted",
                  value: vatAmount + taxAmount,
                  tone: "text-orange-600",
                },
                { label: "After VAT & Tax", value: amountAfterVatTax, tone: "text-biz-text" },
                {
                  label: "SD Retained (Auto)",
                  value: securityDepositAmount,
                  tone: "text-orange-600",
                },
                {
                  label: "Amount Received",
                  value: receivedAmount,
                  tone: receivedAmount > 0 ? "text-green-700" : "text-red-600",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-3 border-b border-biz-border px-3 py-2 last:border-b-0 sm:block sm:border-b-0 sm:text-center"
                >
                  <p className="text-[8px] font-bold uppercase tracking-wide text-biz-muted">
                    {item.label}
                  </p>
                  <p className={cn("mt-0.5 text-[12px] font-bold", item.tone)}>
                    {item.value === null ? "--" : money(item.value)}
                  </p>
                </div>
              ))}
            </div>

            <div
              className={cn(
                "mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-[10px] font-semibold",
                allocationExceedsNoa
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-100 bg-emerald-50/70 text-emerald-700",
              )}
            >
              <span>NOA = Amount Received + VAT + Tax + Other Deduction + SD</span>
              <span>
                {allocationExceedsNoa
                  ? `Over allocated by ${money(Math.abs(allocationRemainder))}`
                  : `Balanced: ${money(receivedAmount + vatAmount + taxAmount + otherDeductionAmount + securityDepositAmount)}`}
              </span>
            </div>
          </div>

          <footer className="z-10 flex shrink-0 flex-col gap-2 border-t border-biz-border bg-white/95 px-4 py-2.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[10px] text-biz-muted">
              <b className="text-red-600">*</b> Complete required cells before saving.
            </span>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => router.push("/receipts")}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-biz-border px-3 text-[11px] font-semibold transition-colors hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                disabled={createReceipt.isPending}
                onClick={() => submit(false)}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-biz-blue px-3 text-[11px] font-semibold text-biz-blue transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                Save Receipt
              </button>
              <button
                disabled={createReceipt.isPending}
                onClick={() => submit(true)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-biz-blue px-3 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                Save &amp; Add Another
              </button>
            </div>
          </footer>
        </section>
      ) : (
        <section className="flex min-h-[300px] flex-1 items-center justify-center rounded-lg border border-dashed border-blue-200 bg-white/70 p-6 shadow-sm">
          <div className="w-full max-w-3xl text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-biz-blue">
              <BriefcaseBusiness className="h-6 w-6" />
            </span>
            <h2 className="mt-3 text-[15px] font-bold text-biz-text">Select a project to begin</h2>
            <p className="mx-auto mt-1 max-w-lg text-[11px] leading-5 text-biz-muted">
              Choose an ongoing Tender ID above. Its NOA and receipt position will load before any
              financial entry is shown.
            </p>
            <div className="mt-5 grid gap-2 text-left sm:grid-cols-3">
              {[
                {
                  step: "1",
                  title: "Select project",
                  detail: "Search by Tender ID and confirm the project.",
                },
                {
                  step: "2",
                  title: "Enter receipt",
                  detail: "Record the received amount and deductions.",
                },
                {
                  step: "3",
                  title: "Review & save",
                  detail: "Check the balanced total, then save safely.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-biz-blue">
                    {item.step}
                  </span>
                  <div>
                    <p className="text-[11px] font-bold text-biz-text">{item.title}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-biz-muted">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
