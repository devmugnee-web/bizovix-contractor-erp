"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Banknote, CheckCircle2, FileEdit, Send, ThumbsDown, Undo2, XCircle } from "lucide-react";
import {
  useApproveSupplierBill,
  useBankAccounts,
  useCancelSupplierBill,
  useCancelSupplierPayment,
  useCreateSupplierPayment,
  useRejectSupplierBill,
  useSubmitSupplierBill,
  useSupplierBill,
  useSupplierPayments,
} from "@bizovix/api-client";
import { DateInput, PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { LinkedDocumentsCard } from "@/components/procurement/LinkedDocumentsCard";
import { formatQty } from "@/lib/procurement";
import { BILL_MATCH_STATUS_META, PAYMENT_METHOD_OPTIONS, SUPPLIER_BILL_STATUS_META, SUPPLIER_PAYMENT_STATUS_META } from "@/lib/supplier-bills";

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-biz-text">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value, emphasis, negative }: { label: string; value: string; emphasis?: boolean; negative?: boolean }) {
  return (
    <div className={`flex items-center justify-between border-b border-biz-border py-2 last:border-0 ${emphasis ? "text-[14px] font-semibold" : "text-[13px]"}`}>
      <span className={emphasis ? "text-biz-text" : "text-biz-muted"}>{label}</span>
      <span className={negative ? "text-biz-danger" : "text-biz-text"}>
        {negative ? "− " : ""}
        {value}
      </span>
    </div>
  );
}

export default function SupplierBillDetailPage() {
  const params = useParams<{ id: string }>();
  const bill = useSupplierBill(params.id);
  const payments = useSupplierPayments({ supplierBillId: params.id, limit: 50 });
  const bankAccounts = useBankAccounts();

  const submitMutation = useSubmitSupplierBill();
  const approveMutation = useApproveSupplierBill();
  const rejectMutation = useRejectSupplierBill();
  const cancelMutation = useCancelSupplierBill();
  const payMutation = useCreateSupplierPayment();
  const cancelPaymentMutation = useCancelSupplierPayment();

  const [error, setError] = React.useState<string | null>(null);
  const [showReject, setShowReject] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [showPayment, setShowPayment] = React.useState(false);
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("BANK_TRANSFER");
  const [paymentReference, setPaymentReference] = React.useState("");

  useSetBreadcrumb([{ label: "Procurement" }, { label: "Supplier Bills", href: "/procurement/supplier-bills" }, { label: bill.data?.billNo ?? "Supplier Bill" }]);

  if (bill.isLoading) return <div className="p-12 text-center text-biz-muted">Loading supplier bill...</div>;
  if (!bill.data) return <div className="p-12 text-center text-biz-muted">Supplier Bill not found.</div>;

  const record = bill.data;
  const statusMeta = SUPPLIER_BILL_STATUS_META[record.status];
  const matchMeta = BILL_MATCH_STATUS_META[record.matchStatus];
  const paid = Number(record.payable?.paidAmount ?? 0);
  const outstanding = Number(record.netPayable) - paid;
  const onError = (mutationError: unknown) => setError(mutationError instanceof Error ? mutationError.message : "The action could not be completed.");
  const isMutating = submitMutation.isPending || approveMutation.isPending || rejectMutation.isPending || cancelMutation.isPending;
  const canPay = ["APPROVED", "PARTIALLY_PAID"].includes(record.status) && outstanding > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-page-title text-biz-text">{record.billNo}</h1>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            <StatusBadge label={matchMeta.label} tone={matchMeta.tone} />
          </div>
          <p className="mt-1 text-[13px] text-biz-muted">
            {record.supplier.name} · Invoice {record.supplierInvoiceNo} · {formatDate(record.supplierInvoiceDate)} ·{" "}
            <Link href={"/procurement/purchase-orders/" + record.purchaseOrderId} className="text-biz-blue hover:underline">
              {record.purchaseOrder.poNo}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {record.status === "DRAFT" && (
            <>
              <Link href={"/procurement/supplier-bills/" + record.id + "/edit"}>
                <SecondaryButton>
                  <FileEdit className="h-4 w-4" />
                  Edit Draft
                </SecondaryButton>
              </Link>
              <PrimaryButton disabled={isMutating || matchMeta.blocking} onClick={() => submitMutation.mutate(record.id, { onError })}>
                <Send className="h-4 w-4" />
                {submitMutation.isPending ? "Submitting..." : "Submit for Approval"}
              </PrimaryButton>
            </>
          )}
          {record.status === "APPROVAL_PENDING" && (
            <>
              <SecondaryButton disabled={isMutating} onClick={() => setShowReject((current) => !current)}>
                <ThumbsDown className="h-4 w-4" />
                Reject
              </SecondaryButton>
              <PrimaryButton disabled={isMutating || matchMeta.blocking} onClick={() => approveMutation.mutate(record.id, { onError })}>
                <CheckCircle2 className="h-4 w-4" />
                {approveMutation.isPending ? "Approving..." : "Approve"}
              </PrimaryButton>
            </>
          )}
          {canPay && (
            <PrimaryButton onClick={() => setShowPayment((current) => !current)}>
              <Banknote className="h-4 w-4" />
              Record Payment
            </PrimaryButton>
          )}
          {["DRAFT", "APPROVAL_PENDING", "REJECTED"].includes(record.status) && (
            <SecondaryButton disabled={isMutating} onClick={() => cancelMutation.mutate(record.id, { onError })}>
              <XCircle className="h-4 w-4" />
              Cancel
            </SecondaryButton>
          )}
        </div>
      </div>

      {matchMeta.blocking && ["DRAFT", "APPROVAL_PENDING"].includes(record.status) && (
        <p className="rounded-sm border border-biz-danger bg-biz-danger-soft px-4 py-3 text-[13px] text-biz-danger">
          This bill is {matchMeta.label.toLowerCase()} — it cannot be submitted or approved until the receipt/quantity issue is resolved. Record the
          matching GRN, or edit the billed quantities down to what has been accepted.
        </p>
      )}

      {showReject && record.status === "APPROVAL_PENDING" && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-[12px] font-medium text-biz-muted">Rejection reason (required)</label>
            <TextInput value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Why is this invoice being rejected?" />
          </div>
          <PrimaryButton
            disabled={!rejectReason.trim() || rejectMutation.isPending}
            onClick={() =>
              rejectMutation.mutate(
                { id: record.id, reason: rejectReason.trim() },
                {
                  onSuccess: () => {
                    setShowReject(false);
                    setRejectReason("");
                  },
                  onError,
                },
              )
            }
          >
            Confirm Rejection
          </PrimaryButton>
          <SecondaryButton onClick={() => setShowReject(false)}>Dismiss</SecondaryButton>
        </div>
      )}

      {showPayment && canPay && (
        <div className="rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
          <h3 className="text-[14px] font-semibold text-biz-text">Record Payment</h3>
          <p className="mt-0.5 text-[11px] text-biz-muted">Outstanding on this bill: {formatBDT(outstanding)} — the backend rejects anything above it.</p>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Amount</label>
              <TextInput type="number" step="0.01" min={0} max={outstanding} value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Payment Date</label>
              <DateInput value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Cash / Bank Account</label>
              <SelectInput
                placeholder="Select account..."
                value={bankAccountId}
                onChange={(event) => setBankAccountId(event.target.value)}
                options={(bankAccounts.data ?? []).map((account) => ({ value: account.id, label: account.accountName }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Method</label>
              <SelectInput value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} options={PAYMENT_METHOD_OPTIONS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Reference</label>
              <TextInput placeholder="Auto (SPY-####)" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <SecondaryButton onClick={() => setShowPayment(false)}>Dismiss</SecondaryButton>
            <PrimaryButton
              disabled={!bankAccountId || Number(paymentAmount || 0) <= 0 || payMutation.isPending}
              onClick={() =>
                payMutation.mutate(
                  {
                    supplierBillId: record.id,
                    bankAccountId,
                    amount: Number(paymentAmount),
                    paymentDate,
                    paymentMethod,
                    referenceNo: paymentReference.trim() || undefined,
                  },
                  {
                    onSuccess: () => {
                      setShowPayment(false);
                      setPaymentAmount("");
                      setPaymentReference("");
                    },
                    onError,
                  },
                )
              }
            >
              {payMutation.isPending ? "Recording..." : "Record Payment"}
            </PrimaryButton>
          </div>
        </div>
      )}

      {error && <p className="rounded-sm border border-biz-danger bg-biz-danger-soft px-4 py-3 text-[13px] text-biz-danger">{error}</p>}
      {record.status === "REJECTED" && record.rejectedReason && (
        <p className="rounded-sm border border-biz-danger bg-biz-danger-soft px-4 py-3 text-[13px] text-biz-danger">Rejected: {record.rejectedReason}</p>
      )}

      <div className="flex flex-wrap gap-4">
        <InfoCard label="Taxable Base" value={formatBDT(record.taxableBase)} />
        <InfoCard label="Net Payable" value={formatBDT(record.netPayable)} />
        <InfoCard label="Paid" value={formatBDT(paid)} />
        <InfoCard label="Outstanding" value={formatBDT(Math.max(0, outstanding))} />
        <InfoCard label="Due Date" value={record.dueDate ? formatDate(record.dueDate) : "—"} />
      </div>

      <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">3-Way Match — PO vs Accepted Receipt vs Invoice</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-[13px]">
            <thead>
              <tr className="bg-biz-bg">
                <th className="px-3 py-2.5 font-medium text-biz-muted">Item</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Unit</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">PO Qty</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Accepted GRN Qty</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Previously Billed</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Current Billed</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Remaining Billable</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">PO Rate</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Invoice Rate</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Variance</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {record.items.map((item) => {
                const poRate = Number(item.poRate);
                const invoiceRate = Number(item.invoiceRate);
                const variance = invoiceRate - poRate;
                const variancePct = poRate === 0 ? null : (variance / poRate) * 100;
                const itemMatch = BILL_MATCH_STATUS_META[item.matchStatus];
                return (
                  <tr key={item.id} className="border-t border-biz-border">
                    <td className="px-3 py-3 text-biz-text">{item.itemNameSnapshot}</td>
                    <td className="px-3 py-3 text-biz-muted">{item.unitSnapshot}</td>
                    <td className="px-3 py-3 text-biz-muted">{formatQty(item.orderedQty)}</td>
                    <td className="px-3 py-3 text-biz-text">{formatQty(item.acceptedQty)}</td>
                    <td className="px-3 py-3 text-biz-muted">{formatQty(item.previouslyBilledQty)}</td>
                    <td className="px-3 py-3 font-medium text-biz-text">{formatQty(item.currentBilledQty)}</td>
                    <td className="px-3 py-3 text-biz-muted">{formatQty(item.remainingBillableQty)}</td>
                    <td className="px-3 py-3 text-biz-muted">{formatBDT(item.poRate)}</td>
                    <td className="px-3 py-3 text-biz-text">{formatBDT(item.invoiceRate)}</td>
                    <td className={`px-3 py-3 ${variance === 0 ? "text-biz-muted" : "font-medium text-biz-warning"}`}>
                      {variance === 0 ? "—" : `${variance > 0 ? "+" : ""}${formatBDT(variance)}${variancePct === null ? "" : ` (${variancePct.toFixed(2)}%)`}`}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge label={itemMatch.label} tone={itemMatch.tone} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card lg:col-span-2">
          <div className="border-b border-biz-border px-4 py-3">
            <h3 className="text-[15px] font-semibold text-biz-text">Invoice Lines</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead>
                <tr className="bg-biz-bg">
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Item Code</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Description</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Rate</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Discount</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {record.items.map((item) => (
                  <tr key={item.id} className="border-t border-biz-border">
                    <td className="px-4 py-3 text-biz-text">{item.itemCodeSnapshot}</td>
                    <td className="px-4 py-3 text-biz-text">{item.descriptionSnapshot ?? item.itemNameSnapshot}</td>
                    <td className="px-4 py-3 text-biz-text">
                      {formatQty(item.currentBilledQty)} {item.unitSnapshot}
                    </td>
                    <td className="px-4 py-3 text-biz-muted">{formatBDT(item.invoiceRate)}</td>
                    <td className="px-4 py-3 text-biz-muted">{formatBDT(item.discountAmount)}</td>
                    <td className="px-4 py-3 font-medium text-biz-text">{formatBDT(item.lineAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
          <div className="border-b border-biz-border px-4 py-3">
            <h3 className="text-[15px] font-semibold text-biz-text">Deductions &amp; Net Payable</h3>
          </div>
          <div className="px-4 py-2">
            <SummaryRow label="Subtotal" value={formatBDT(record.subtotal)} />
            <SummaryRow label="Discount" value={formatBDT(record.discountAmount)} negative />
            <SummaryRow label="Taxable Base" value={formatBDT(record.taxableBase)} />
            <SummaryRow label={`VAT${record.vatRate ? ` @ ${Number(record.vatRate).toFixed(2)}%` : ""}`} value={formatBDT(record.vatAmount)} />
            <SummaryRow label={`AIT${record.aitRate ? ` @ ${Number(record.aitRate).toFixed(2)}%` : ""}`} value={formatBDT(record.aitAmount)} negative />
            <SummaryRow label="Other Deductions" value={formatBDT(record.otherDeductionAmount)} negative />
            <SummaryRow label="Net Payable" value={formatBDT(record.netPayable)} emphasis />
          </div>
          {record.deductions.length > 0 && (
            <div className="border-t border-biz-border px-4 py-3">
              <p className="text-[11px] font-medium text-biz-muted">Snapshotted at save time — historical bills stay reproducible.</p>
              <ul className="mt-2 flex flex-col gap-1">
                {record.deductions.map((deduction) => (
                  <li key={deduction.id} className="flex items-center justify-between text-[12px]">
                    <span className="text-biz-muted">
                      {deduction.type}
                      {Number(deduction.rate) > 0 ? ` @ ${Number(deduction.rate).toFixed(2)}%` : ""}
                    </span>
                    <span className="text-biz-text">{formatBDT(deduction.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">Payments</h3>
          {record.payable && <span className="text-[12px] text-biz-muted">Payable {record.payable.billNo}</span>}
        </div>
        {payments.isLoading ? (
          <p className="px-4 py-6 text-center text-[13px] text-biz-muted">Loading payments...</p>
        ) : (payments.data?.items ?? []).length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-biz-muted">No payments recorded against this bill yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead>
                <tr className="bg-biz-bg">
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Reference</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Date</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Account</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Method</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Amount</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Status</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Action</th>
                </tr>
              </thead>
              <tbody>
                {(payments.data?.items ?? []).map((payment) => {
                  const paymentStatus = SUPPLIER_PAYMENT_STATUS_META[payment.status];
                  return (
                    <tr key={payment.id} className="border-t border-biz-border">
                      <td className="px-4 py-3 text-biz-text">{payment.referenceNo ?? "—"}</td>
                      <td className="px-4 py-3 text-biz-muted">{formatDate(payment.paymentDate)}</td>
                      <td className="px-4 py-3 text-biz-muted">{payment.bankAccount.accountName}</td>
                      <td className="px-4 py-3 text-biz-muted">{payment.paymentMethod ?? "—"}</td>
                      <td className="px-4 py-3 font-medium text-biz-text">{formatBDT(payment.amount)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge label={paymentStatus.label} tone={paymentStatus.tone} />
                      </td>
                      <td className="px-4 py-3">
                        {payment.status === "ACTIVE" && (
                          <SecondaryButton
                            size="sm"
                            disabled={cancelPaymentMutation.isPending}
                            onClick={() => {
                              const reason = window.prompt("Reason for cancelling this payment?");
                              if (reason?.trim()) cancelPaymentMutation.mutate({ id: payment.id, reason: reason.trim() }, { onError });
                            }}
                          >
                            <Undo2 className="h-4 w-4" />
                            Cancel
                          </SecondaryButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <LinkedDocumentsCard filter={{ supplierBillId: record.id }} />
    </div>
  );
}
