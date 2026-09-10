"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Calculator,
  FileText,
  Landmark,
  Printer,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import {
  useCmsWorkOverview,
  useFinalProjectProfitability,
  useProjectClosing,
  useProjectCostingReport,
  useProjectExpenses,
  useReceipts,
} from "@bizovix/api-client";

type ProjectLifecycleReportProps = {
  workId: string;
};

const numberFormatter = new Intl.NumberFormat("en-BD", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(value: unknown, empty = "--") {
  if (value === null || value === undefined || value === "") return empty;
  const amount = Number(value);
  return Number.isFinite(amount) ? `BDT ${numberFormatter.format(amount)}` : empty;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function titleCase(value: string | null | undefined) {
  if (!value) return "--";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: string | null | undefined) {
  const value = status?.toUpperCase();
  if (["APPROVED", "RECEIVED", "COMPLETED", "CLOSED", "RELEASED"].includes(value ?? "")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["CANCELLED", "REJECTED", "EXPIRED"].includes(value ?? "")) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusTone(value)}`}>
      {titleCase(value)}
    </span>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  count,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
        </div>
      </div>
      {count !== undefined && (
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
          {count} {count === 1 ? "record" : "records"}
        </span>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <FileText className="mx-auto h-7 w-7 text-slate-300" />
      <p className="mt-2 text-xs font-medium text-slate-500">{message}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "blue" | "green" | "red" | "orange";
}) {
  const tones = {
    slate: "text-slate-900",
    blue: "text-blue-600",
    green: "text-emerald-600",
    red: "text-red-600",
    orange: "text-orange-600",
  };

  return (
    <div className="min-w-0 border-l border-slate-200 pl-4 first:border-l-0 first:pl-0">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-sm font-extrabold ${tones[tone]}`} title={value}>
        {value}
      </p>
    </div>
  );
}

function ReceiptPaymentDetails({
  receipt,
}: {
  receipt: {
    paymentMethod: string;
    chequeNo: string | null;
    chequeDate: string | null;
    chequeBankName: string | null;
    referenceNo: string | null;
    receivedInAccount: { accountName: string; accountNumber: string | null } | null;
  };
}) {
  const account = receipt.receivedInAccount
    ? `${receipt.receivedInAccount.accountName}${receipt.receivedInAccount.accountNumber ? ` (${receipt.receivedInAccount.accountNumber})` : ""}`
    : "--";

  if (receipt.paymentMethod === "CHEQUE") {
    return (
      <div className="space-y-1 text-[11px] text-slate-600">
        <p><strong className="text-slate-800">Cheque No:</strong> {receipt.chequeNo || "--"}</p>
        <p><strong className="text-slate-800">Cheque Bank:</strong> {receipt.chequeBankName || "--"}</p>
        <p><strong className="text-slate-800">Cheque Date:</strong> {formatDate(receipt.chequeDate)}</p>
        <p><strong className="text-slate-800">Deposit Account:</strong> {account}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-[11px] text-slate-600">
      <p><strong className="text-slate-800">Received In:</strong> {account}</p>
      <p><strong className="text-slate-800">Transaction Ref:</strong> {receipt.referenceNo || "--"}</p>
    </div>
  );
}

export function ProjectLifecycleReport({ workId }: ProjectLifecycleReportProps) {
  const overviewQuery = useCmsWorkOverview(workId);
  const costingQuery = useProjectCostingReport(workId);
  const expensesQuery = useProjectExpenses({ workId, page: 1, limit: 100 });
  const receiptsQuery = useReceipts({ workId, page: 1, limit: 100 });
  const closingQuery = useProjectClosing(workId);
  const profitabilityQuery = useFinalProjectProfitability(workId);

  const overview = overviewQuery.data;
  const costing = costingQuery.data;
  const expenses = expensesQuery.data?.items ?? [];
  const receipts = receiptsQuery.data?.items ?? [];
  const closing = closingQuery.data;
  const profitability = profitabilityQuery.data;

  if (overviewQuery.isLoading) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-2xl border border-slate-200 bg-white">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          <p className="mt-3 text-xs font-semibold text-slate-500">Loading complete project report...</p>
        </div>
      </div>
    );
  }

  if (!overview || !workId || workId === "undefined") {
    return (
      <div className="rounded-2xl border border-red-200 bg-white px-6 py-14 text-center shadow-sm">
        <p className="font-bold text-red-600">Unable to load this project report.</p>
        <Link
          href="/reports/projects/profit-loss"
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Profit/Loss
        </Link>
      </div>
    );
  }

  const project = overview.project;
  const financial = overview.financial;
  const summary = overview.summary;
  const contractValue = Number(financial.contractValue || project.contractValue || 0);
  const actualExpense = Number(summary.totalExpense || 0);
  const currentProfit = profitability?.grossProfitLoss ?? String(contractValue - actualExpense);
  const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const receivedTotal = receipts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const costingTotal = Number(costing?.totalPrice || 0);
  const profitTone = Number(currentProfit) < 0 ? "red" : "green";
  const expenseMeta = expensesQuery.data?.meta;
  const receiptMeta = receiptsQuery.data?.meta;

  return (
    <div className="space-y-4 pb-10 print:space-y-3 print:bg-white print:pb-0">
      <header className="rounded-2xl border border-blue-200 bg-[linear-gradient(125deg,#ffffff_0%,#f3f8ff_58%,#eefbf7_100%)] p-5 shadow-sm print:border-slate-300 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-600">Full Project Lifecycle Report</p>
            <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-950">{project.workName}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-600">
              <span className="rounded-full border border-blue-200 bg-white px-3 py-1 font-bold text-blue-600">
                Tender ID: {project.tenderNumber || costing?.tenderNumber || "--"}
              </span>
              <span><strong className="text-slate-800">Organization:</strong> {project.organizationMaster.fullName}</span>
              <span><strong className="text-slate-800">Category:</strong> {project.workCategory}</span>
              <StatusBadge value={project.status} />
            </div>
          </div>
          <div className="flex shrink-0 gap-2 print:hidden">
            <Link
              href="/reports/projects/profit-loss"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
            >
              <Printer className="h-4 w-4" /> Print / Save PDF
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-blue-100 pt-4 sm:grid-cols-3 xl:grid-cols-6">
          <Metric label="NOA Amount" value={money(financial.noaAmount)} tone="blue" />
          <Metric label="Costing Total" value={money(costingTotal)} />
          <Metric label="Actual Expense" value={money(summary.totalExpense)} tone="orange" />
          <Metric label="Total Received" value={money(summary.totalReceipt)} tone="green" />
          <Metric label="Receivable" value={money(summary.balanceReceivable)} tone="red" />
          <Metric label={profitability ? "Final Profit / Loss" : "Current Profit / Loss"} value={money(currentProfit)} tone={profitTone} />
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm print:shadow-none">
        <SectionHeader
          icon={Calculator}
          title="Costing Details"
          description="Every product or work item included in the project costing."
          count={costing?.rows.length ?? 0}
        />
        {!costing || costing.rows.length === 0 ? (
          <EmptyState message={costing?.emptyReason === "NO_COSTED_ITEMS" ? "Tender costing has not been completed for this project." : "No project costing items were found."} />
        ) : (
          <>
            <div className="hidden grid-cols-[44px_minmax(0,2.4fr)_80px_90px_130px_140px] bg-slate-50 px-5 py-3 text-[9px] font-bold uppercase tracking-wide text-slate-500 md:grid">
              <span>SL</span>
              <span>Product / Work</span>
              <span>Unit</span>
              <span className="text-right">Quantity</span>
              <span className="text-right">Unit Cost</span>
              <span className="text-right">Total Cost</span>
            </div>
            <div className="divide-y divide-slate-100">
              {costing.rows.map((item, index) => (
                <div key={item.id}>
                  <div className="hidden grid-cols-[44px_minmax(0,2.4fr)_80px_90px_130px_140px] items-center px-5 py-3 text-[11px] text-slate-700 md:grid">
                    <span className="font-semibold text-slate-400">{index + 1}</span>
                    <span className="pr-4 font-semibold leading-5 text-slate-800">{item.productName}</span>
                    <span>{item.unit || "--"}</span>
                    <span className="text-right tabular-nums">{numberFormatter.format(Number(item.quantity || 0))}</span>
                    <span className="text-right tabular-nums">{money(item.unitPrice)}</span>
                    <span className="text-right font-bold tabular-nums text-blue-700">{money(item.totalPrice)}</span>
                  </div>
                  <div className="p-4 md:hidden">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-bold leading-5 text-slate-800">{index + 1}. {item.productName}</p>
                      <strong className="shrink-0 text-xs text-blue-700">{money(item.totalPrice)}</strong>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
                      <span>Unit: <strong className="text-slate-700">{item.unit || "--"}</strong></span>
                      <span>Qty: <strong className="text-slate-700">{item.quantity}</strong></span>
                      <span>Unit Cost: <strong className="text-slate-700">{money(item.unitPrice)}</strong></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-2 border-t border-blue-100 bg-blue-50/60 px-5 py-3 text-xs">
              {costing.itemsTotalPrice && <span className="text-slate-600">Items: <strong className="text-slate-900">{money(costing.itemsTotalPrice)}</strong></span>}
              <span className="font-bold text-slate-700">Total Costing: <strong className="ml-2 text-blue-700">{money(costing.totalPrice)}</strong></span>
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm print:shadow-none">
        <SectionHeader
          icon={WalletCards}
          title="Expense Details"
          description="All project expenses with date, head, person and payment account."
          count={expenseMeta?.total ?? expenses.length}
        />
        {expenses.length === 0 ? (
          <EmptyState message="No project expenses have been recorded." />
        ) : (
          <>
            <div className="hidden grid-cols-[42px_105px_140px_minmax(0,1.4fr)_125px_150px_125px] bg-slate-50 px-5 py-3 text-[9px] font-bold uppercase tracking-wide text-slate-500 lg:grid">
              <span>SL</span>
              <span>Date</span>
              <span>Expense Head</span>
              <span>Description / Reference</span>
              <span>Expense By</span>
              <span>Paid From</span>
              <span className="text-right">Amount</span>
            </div>
            <div className="divide-y divide-slate-100">
              {expenses.map((expense, index) => {
                const referenceNo = (expense as typeof expense & { referenceNo?: string | null }).referenceNo;
                const paidFrom = `${expense.paidFromAccount.accountName}${expense.paidFromAccount.accountNumber ? ` (${expense.paidFromAccount.accountNumber})` : ""}`;
                return (
                  <div key={expense.id}>
                    <div className="hidden grid-cols-[42px_105px_140px_minmax(0,1.4fr)_125px_150px_125px] items-center px-5 py-3 text-[11px] text-slate-700 lg:grid">
                      <span className="font-semibold text-slate-400">{index + 1}</span>
                      <span>{formatDate(expense.expenseDate)}</span>
                      <span className="font-semibold text-slate-800">{expense.expenseHead.name}</span>
                      <div className="min-w-0 pr-3">
                        <p className="truncate" title={expense.description || ""}>{expense.description || "No remarks"}</p>
                        <p className="mt-0.5 text-[9px] font-semibold text-blue-600">{referenceNo || "--"}</p>
                      </div>
                      <span>{expense.expenseBy.name}</span>
                      <span className="truncate" title={paidFrom}>{paidFrom}</span>
                      <span className="text-right font-bold tabular-nums text-orange-600">{money(expense.amount)}</span>
                    </div>
                    <div className="p-4 lg:hidden">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{expense.expenseHead.name}</p>
                          <p className="mt-1 text-[10px] text-slate-500">{formatDate(expense.expenseDate)} | {referenceNo || "No reference"}</p>
                        </div>
                        <strong className="shrink-0 text-xs text-orange-600">{money(expense.amount)}</strong>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-600">{expense.description || "No remarks"}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
                        <span>By: <strong className="text-slate-700">{expense.expenseBy.name}</strong></span>
                        <span>Paid From: <strong className="text-slate-700">{paidFrom}</strong></span>
                        <StatusBadge value={expense.status} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-end border-t border-orange-100 bg-orange-50/60 px-5 py-3 text-xs font-bold text-slate-700">
              Total Project Expense <strong className="ml-3 text-orange-600">{money(summary.totalExpense || expenseTotal)}</strong>
            </div>
            {expenseMeta && expenseMeta.total > expenses.length && (
              <p className="border-t border-slate-100 px-5 py-2 text-right text-[10px] text-amber-600">Showing the latest {expenses.length} of {expenseMeta.total} expense records.</p>
            )}
          </>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm print:shadow-none">
        <SectionHeader
          icon={ReceiptText}
          title="Receipt History"
          description="When money was received, how it was received and every deduction."
          count={receiptMeta?.total ?? receipts.length}
        />
        {receipts.length === 0 ? (
          <EmptyState message="No money has been received for this project yet." />
        ) : (
          <div className="divide-y divide-slate-200">
            {receipts.map((receipt, index) => (
              <article key={receipt.id} className="p-5 print:break-inside-avoid">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-extrabold text-emerald-700">{index + 1}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">{receipt.receiptNo}</h3>
                        <StatusBadge value={receipt.status} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {formatDate(receipt.receiptDate)}</span>
                        <span><strong className="text-slate-700">Type:</strong> {titleCase(receipt.receiptType)}</span>
                        <span><strong className="text-slate-700">From:</strong> {receipt.receivedFrom || "--"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-right">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-700">Received Amount</p>
                    <p className="mt-0.5 text-base font-extrabold text-emerald-700">{money(receipt.amount)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {receipt.paymentMethod === "CASH" ? <Banknote className="h-4 w-4 text-emerald-600" /> : <Landmark className="h-4 w-4 text-blue-600" />}
                      {titleCase(receipt.paymentMethod)}
                    </p>
                    <ReceiptPaymentDetails receipt={receipt} />
                  </div>

                  <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 sm:grid-cols-3 xl:grid-cols-6">
                    {[
                      ["Gross Bill", receipt.grossAmount, "text-slate-900"],
                      ["VAT Deducted", receipt.vatDeductedAmount, "text-orange-600"],
                      ["Tax Deducted", receipt.taxDeductedAmount, "text-orange-600"],
                      ["SD / Retention", receipt.securityDepositDeductedAmount, "text-blue-600"],
                      ["Other Deduction", receipt.otherDeductionAmount, "text-slate-700"],
                      ["Net Received", receipt.amount, "text-emerald-600"],
                    ].map(([label, value, tone]) => (
                      <div key={label} className="border-b border-r border-slate-100 p-3 last:border-r-0 sm:border-b-0">
                        <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                        <p className={`mt-1 text-[11px] font-extrabold tabular-nums ${tone}`}>{money(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {(receipt.description || receipt.referenceNo) && (
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-600">
                    <strong className="text-slate-800">Remarks:</strong> {receipt.description || "--"}
                    {receipt.referenceNo && <span className="ml-4"><strong className="text-slate-800">Reference:</strong> {receipt.referenceNo}</span>}
                  </div>
                )}
              </article>
            ))}
            <div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-2 border-t border-emerald-100 bg-emerald-50/60 px-5 py-3 text-xs">
              <span className="text-slate-600">Gross Settlement: <strong className="text-slate-900">{money(receipts.reduce((sum, item) => sum + Number(item.grossAmount || 0), 0))}</strong></span>
              <span className="font-bold text-slate-700">Total Received: <strong className="ml-2 text-emerald-600">{money(summary.totalReceipt || receivedTotal)}</strong></span>
            </div>
            {receiptMeta && receiptMeta.total > receipts.length && (
              <p className="border-t border-slate-100 px-5 py-2 text-right text-[10px] text-amber-600">Showing the latest {receipts.length} of {receiptMeta.total} receipt records.</p>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm print:shadow-none">
          <SectionHeader icon={Landmark} title="Financial Reconciliation" description="Project value, deductions, collection and remaining receivable." />
          <div className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-3">
            {[
              ["Contract Value", financial.contractValue, "text-slate-900"],
              ["VAT Deducted", summary.totalVatDeducted, "text-orange-600"],
              ["Tax Deducted", summary.totalTaxDeducted, "text-orange-600"],
              ["SD Deducted", summary.totalSecurityDepositDeducted, "text-blue-600"],
              ["Other Deduction", summary.totalOtherDeduction, "text-slate-700"],
              ["Total Received", summary.totalReceipt, "text-emerald-600"],
              ["Actual Expense", summary.totalExpense, "text-red-600"],
              ["Receivable", summary.balanceReceivable, "text-red-600"],
              ["Current Margin", summary.currentMarginPct ? `${summary.currentMarginPct}%` : "--", "text-blue-600"],
            ].map(([label, value, tone]) => (
              <div key={label} className="bg-white p-4">
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                <p className={`mt-1 text-sm font-extrabold ${tone}`}>{label === "Current Margin" ? value : money(value)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm print:shadow-none">
          <SectionHeader icon={ShieldCheck} title="Project Lifecycle" description="Important project and closeout milestones." />
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 p-5 text-[11px]">
            <div><p className="text-slate-400">Start Date</p><p className="mt-1 font-bold text-slate-800">{formatDate(project.startDate)}</p></div>
            <div><p className="text-slate-400">Expected Completion</p><p className="mt-1 font-bold text-slate-800">{formatDate(project.expectedCompletionDate)}</p></div>
            <div><p className="text-slate-400">Actual Completion</p><p className="mt-1 font-bold text-slate-800">{formatDate(project.completionDate)}</p></div>
            <div><p className="text-slate-400">Current Status</p><div className="mt-1"><StatusBadge value={project.status} /></div></div>
            <div><p className="text-slate-400">Completion Certificates</p><p className="mt-1 font-bold text-slate-800">{closing?.certificates.length ?? 0}</p></div>
            <div><p className="text-slate-400">Handovers</p><p className="mt-1 font-bold text-slate-800">{closing?.handovers.length ?? 0}</p></div>
            <div><p className="text-slate-400">Retention Held</p><p className="mt-1 font-bold text-blue-600">{money(profitability?.retentionHeld ?? summary.securityDepositHeld)}</p></div>
            <div><p className="text-slate-400">Retention Released</p><p className="mt-1 font-bold text-emerald-600">{money(profitability?.retentionReleased)}</p></div>
          </div>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[10px] text-slate-500">
        <span>Report source: Project Costing, Project Expenses, Project Receipts and Project Closing records.</span>
        <span>Generated: {formatDate(new Date().toISOString())}</span>
      </footer>
    </div>
  );
}

export default ProjectLifecycleReport;
