"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Building2,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Landmark,
  Save,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { useBankAccounts, useChartOfAccounts, useCreateReceipt } from "@bizovix/api-client";
import type { SaveReceiptInput } from "@bizovix/types";
import { cn } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const field =
  "h-10 w-full min-w-0 rounded-md border border-biz-border bg-white px-3 text-[12px] font-medium text-biz-navy outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-biz-blue focus:ring-2 focus:ring-blue-100";
const textArea =
  "w-full resize-none rounded-md border border-biz-border bg-white px-3 py-2.5 text-[12px] font-medium text-biz-navy outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-biz-blue focus:ring-2 focus:ring-blue-100";

export default function AddGeneralReceiptPage() {
  useSetBreadcrumb([
    { label: "Receipts", href: "/receipts" },
    { label: "General Receipt", href: "/receipts" },
    { label: "Add Receipt" },
  ]);
  const router = useRouter();
  const accounts = useBankAccounts();
  const chart = useChartOfAccounts();
  const createReceipt = useCreateReceipt();
  const submitting = React.useRef(false);
  const [error, setError] = React.useState("");
  const [form, setForm] = React.useState({
    receiptDate: localToday(),
    receiptHeadAccountId: "",
    receivedFrom: "",
    purpose: "",
    amount: "",
    destination: "BANK" as "BANK" | "CASH",
    accountId: "",
    remarks: "",
  });
  const activeAccounts = (accounts.data ?? []).filter((account) => account.isActive);
  const bankAccounts = activeAccounts.filter((account) => account.accountType === "BANK");
  const cashAccount = activeAccounts.find((account) => account.cashRole === "MAIN_CASH");
  const receiptHeads = (chart.data ?? []).filter(
    (account) => account.isActive && account.accountType === "INCOME" && !account.isControlAccount,
  );
  const selectedReceiptHead = receiptHeads.find(
    (account) => account.id === form.receiptHeadAccountId,
  );
  const selectedBankAccount = bankAccounts.find((account) => account.id === form.accountId);
  const amount = Number(form.amount) || 0;

  async function submit(addAnother: boolean) {
    if (submitting.current) return;
    setError("");
    const receivingAccountId =
      form.destination === "CASH" ? (cashAccount?.id ?? "") : form.accountId;
    if (
      !form.receiptDate ||
      !form.receiptHeadAccountId ||
      !form.receivedFrom.trim() ||
      !form.purpose.trim() ||
      !amount ||
      !receivingAccountId
    )
      return setError("Complete all required receipt fields.");
    const payload: SaveReceiptInput = {
      receiptDate: form.receiptDate,
      receiptCategory: "GENERAL",
      receiptType: "GENERAL_RECEIPT",
      receiptHeadAccountId: form.receiptHeadAccountId,
      receivedFrom: form.receivedFrom.trim(),
      amount,
      receivedInAccountId: receivingAccountId,
      paymentMethod: form.destination === "CASH" ? "CASH" : "BANK",
      description: form.remarks.trim()
        ? `${form.purpose.trim()}\nRemarks: ${form.remarks.trim()}`
        : form.purpose.trim(),
      status: "RECEIVED",
    };
    submitting.current = true;
    try {
      await createReceipt.mutateAsync(payload);
      if (addAnother)
        setForm({
          receiptDate: localToday(),
          receiptHeadAccountId: "",
          receivedFrom: "",
          purpose: "",
          amount: "",
          destination: "BANK",
          accountId: "",
          remarks: "",
        });
      else router.push("/receipts");
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
          <h1 className="text-[24px] font-bold leading-tight">Add General Receipt</h1>
          <p className="mt-1 text-[12px] text-biz-muted">
            Record non-project income and post it directly to a cash or bank account.
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

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-biz-border border-t-2 border-t-biz-blue bg-white shadow-card">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-gradient-to-r from-slate-50 to-blue-50/70 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-biz-blue">
              <FileText className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[13px] font-bold text-biz-text">General Receipt Details</h2>
              <p className="mt-0.5 text-[10px] text-biz-muted">
                Complete the source, purpose and receiving account before saving.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[9px] font-semibold text-biz-blue">
            Non-project income
          </span>
        </header>

        {error && (
          <div
            role="alert"
            className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2.5 text-[11px] font-semibold text-red-700"
          >
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
            <div className="overflow-hidden rounded-lg border border-biz-border bg-white">
              <div className="flex items-center gap-2 border-b border-biz-border bg-slate-50 px-3 py-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-biz-blue text-[9px] font-bold text-white">
                  1
                </span>
                <h3 className="text-[12px] font-bold text-biz-text">Receipt information</h3>
              </div>

              <div className="grid gap-3 p-3 sm:grid-cols-2">
                <label className="text-[10px] font-bold text-biz-text">
                  <span className="mb-1.5 flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-biz-muted" /> Receipt Date{" "}
                    <b className="text-red-600">*</b>
                  </span>
                  <input
                    type="date"
                    value={form.receiptDate}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, receiptDate: event.target.value }))
                    }
                    className={field}
                  />
                </label>

                <label className="text-[10px] font-bold text-biz-text">
                  <span className="mb-1.5 flex items-center gap-1.5">
                    <CircleDollarSign className="h-3.5 w-3.5 text-biz-muted" /> Receipt Head{" "}
                    <b className="text-red-600">*</b>
                  </span>
                  <select
                    value={form.receiptHeadAccountId}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, receiptHeadAccountId: event.target.value }))
                    }
                    className={field}
                  >
                    <option value="">Select receipt head...</option>
                    {receiptHeads.map((head) => (
                      <option key={head.id} value={head.id}>
                        {head.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[9px] font-normal text-biz-muted">
                    Income category such as asset sale, refund or other income.
                  </span>
                </label>
              </div>

              <div className="border-t border-biz-border bg-slate-50/40 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-[9px] font-bold text-biz-blue">
                    2
                  </span>
                  <h3 className="text-[12px] font-bold text-biz-text">Source and purpose</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-[10px] font-bold text-biz-text">
                    <span className="mb-1.5 flex items-center gap-1.5">
                      <UserRound className="h-3.5 w-3.5 text-biz-muted" /> Received From{" "}
                      <b className="text-red-600">*</b>
                    </span>
                    <textarea
                      rows={2}
                      value={form.receivedFrom}
                      onChange={(event) =>
                        setForm((value) => ({ ...value, receivedFrom: event.target.value }))
                      }
                      placeholder="Customer, organization or party name..."
                      className={cn(textArea, "min-h-[68px]")}
                    />
                  </label>

                  <label className="text-[10px] font-bold text-biz-text">
                    <span className="mb-1.5 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-biz-muted" /> Purpose / Description{" "}
                      <b className="text-red-600">*</b>
                    </span>
                    <textarea
                      rows={2}
                      value={form.purpose}
                      onChange={(event) =>
                        setForm((value) => ({ ...value, purpose: event.target.value }))
                      }
                      placeholder="Why was this money received?"
                      className={cn(textArea, "min-h-[68px]")}
                    />
                  </label>
                </div>
              </div>

              <label className="block border-t border-biz-border p-3 text-[10px] font-bold text-biz-text">
                <span className="mb-1.5 flex items-center justify-between gap-3">
                  <span>
                    Remarks <span className="font-normal text-biz-muted">(Optional)</span>
                  </span>
                  <span className="font-normal text-biz-muted">{form.remarks.length} / 300</span>
                </span>
                <textarea
                  maxLength={300}
                  rows={2}
                  value={form.remarks}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, remarks: event.target.value }))
                  }
                  placeholder="Add reference or internal note..."
                  className={cn(textArea, "min-h-[62px]")}
                />
              </label>
            </div>

            <aside className="overflow-hidden rounded-lg border border-blue-100 bg-blue-50/30">
              <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50/70 px-3 py-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-biz-blue text-[9px] font-bold text-white">
                  3
                </span>
                <h3 className="text-[12px] font-bold text-biz-text">Amount and destination</h3>
              </div>

              <div className="space-y-3 p-3">
                <label className="block text-[10px] font-bold text-biz-text">
                  Amount (BDT) <b className="text-red-600">*</b>
                  <div className="mt-1.5 flex">
                    <span className="flex h-10 items-center rounded-l-md border border-r-0 border-blue-200 bg-blue-50 px-3 text-[11px] font-bold text-biz-blue">
                      BDT
                    </span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.amount}
                      onChange={(event) =>
                        setForm((value) => ({ ...value, amount: event.target.value }))
                      }
                      placeholder="0.00"
                      className={cn(
                        field,
                        "rounded-l-none border-blue-200 text-right text-[14px] font-bold",
                      )}
                    />
                  </div>
                </label>

                <fieldset>
                  <legend className="mb-1.5 text-[10px] font-bold text-biz-text">
                    Received To <b className="text-red-600">*</b>
                  </legend>
                  <div className="grid grid-cols-2 rounded-md border border-biz-border bg-white p-1">
                    <label
                      className={cn(
                        "flex h-9 cursor-pointer items-center justify-center gap-2 rounded text-[11px] font-semibold transition-colors",
                        form.destination === "CASH"
                          ? "bg-biz-blue text-white shadow-sm"
                          : "text-biz-muted hover:bg-slate-50",
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        checked={form.destination === "CASH"}
                        onChange={() =>
                          setForm((value) => ({ ...value, destination: "CASH", accountId: "" }))
                        }
                      />
                      <Banknote className="h-4 w-4" /> Cash
                    </label>
                    <label
                      className={cn(
                        "flex h-9 cursor-pointer items-center justify-center gap-2 rounded text-[11px] font-semibold transition-colors",
                        form.destination === "BANK"
                          ? "bg-biz-blue text-white shadow-sm"
                          : "text-biz-muted hover:bg-slate-50",
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        checked={form.destination === "BANK"}
                        onChange={() =>
                          setForm((value) => ({ ...value, destination: "BANK", accountId: "" }))
                        }
                      />
                      <Landmark className="h-4 w-4" /> Bank Account
                    </label>
                  </div>
                </fieldset>

                {form.destination === "BANK" ? (
                  <label className="block text-[10px] font-bold text-biz-text">
                    Receiving Bank Account <b className="text-red-600">*</b>
                    <select
                      value={form.accountId}
                      onChange={(event) =>
                        setForm((value) => ({ ...value, accountId: event.target.value }))
                      }
                      className={cn(field, "mt-1.5")}
                    >
                      <option value="">Select bank account...</option>
                      {bankAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {(account.bankName ? `${account.bankName} - ` : "") +
                            account.accountName +
                            (account.accountNumber ? ` (${account.accountNumber})` : "")}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div
                    className={cn(
                      "rounded-md border px-3 py-2.5",
                      cashAccount ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[10px] font-bold",
                        cashAccount ? "text-emerald-700" : "text-red-700",
                      )}
                    >
                      {cashAccount
                        ? "Active cash account selected automatically"
                        : "No active cash account available"}
                    </p>
                    {cashAccount && (
                      <p className="mt-0.5 text-[9px] text-emerald-700">
                        {cashAccount.accountName}
                      </p>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-biz-border bg-white p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <WalletCards className="h-4 w-4 text-biz-blue" />
                    <p className="text-[10px] font-bold uppercase tracking-wide text-biz-muted">
                      Receipt summary
                    </p>
                  </div>
                  <dl className="space-y-2 text-[10px]">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-biz-muted">Receipt Head</dt>
                      <dd className="max-w-[170px] text-right font-semibold text-biz-text">
                        {selectedReceiptHead?.name ?? "Not selected"}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-biz-muted">Received In</dt>
                      <dd className="max-w-[170px] text-right font-semibold text-biz-text">
                        {form.destination === "CASH"
                          ? (cashAccount?.accountName ?? "Cash account unavailable")
                          : (selectedBankAccount?.accountName ?? "Not selected")}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-biz-border pt-2">
                      <dt className="font-semibold text-biz-text">Amount</dt>
                      <dd
                        className={cn(
                          "text-[14px] font-bold",
                          amount > 0 ? "text-green-700" : "text-biz-blue",
                        )}
                      >
                        {formatBDT(amount)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </aside>
          </div>
        </div>

        <footer className="z-10 flex shrink-0 flex-col gap-2 border-t border-biz-border bg-white/95 px-4 py-2.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[10px] text-biz-muted">
            <b className="text-red-600">*</b> Complete all required fields before saving.
          </span>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={() => router.push("/receipts")}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-biz-border px-3 text-[11px] font-semibold transition-colors hover:bg-slate-50"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
            <button
              disabled={createReceipt.isPending}
              onClick={() => submit(false)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-biz-blue px-3 text-[11px] font-semibold text-biz-blue transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" /> Save Receipt
            </button>
            <button
              disabled={createReceipt.isPending}
              onClick={() => submit(true)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-biz-blue px-3 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" /> Save &amp; Add Another
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
