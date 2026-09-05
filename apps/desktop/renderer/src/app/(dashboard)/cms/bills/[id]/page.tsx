"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, FileEdit, Printer, Receipt, Send, ThumbsDown, XCircle } from "lucide-react";
import {
  useCancelProjectBill,
  useCertifyProjectBill,
  useProjectBill,
  useRejectProjectBill,
  useStartReviewProjectBill,
  useSubmitProjectBill,
} from "@bizovix/api-client";
import { PrimaryButton, SecondaryButton, StatusBadge } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { BILL_STATUS_META, BILL_TYPE_META } from "@/lib/project-bills";
import { billPrintHtml } from "@/lib/bill-print";

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-biz-text">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`flex items-center justify-between border-b border-biz-border py-2 last:border-0 ${emphasis ? "text-[14px] font-semibold text-biz-text" : "text-[13px] text-biz-muted"}`}>
      <span>{label}</span>
      <span className={emphasis ? "text-biz-text" : "text-biz-text"}>{value}</span>
    </div>
  );
}

export default function BillDetailPage() {
  return <Suspense fallback={<p>Loading bill…</p>}><BillDetailContent /></Suspense>;
}

function BillDetailContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [printError, setPrintError] = useState("");
  const bill = useProjectBill(params.id);
  const submitMutation = useSubmitProjectBill();
  const reviewMutation = useStartReviewProjectBill();
  const certifyMutation = useCertifyProjectBill();
  const rejectMutation = useRejectProjectBill();
  const cancelMutation = useCancelProjectBill();

  useSetBreadcrumb([{ label: "CMS" }, { label: "Running Bills" }, { label: bill.data?.billNo ?? "Bill Details" }]);

  if (bill.isLoading) return <div className="p-12 text-center text-biz-muted">Loading bill...</div>;
  if (!bill.data) return <div className="p-12 text-center text-biz-muted">Running Bill not found.</div>;

  const b = bill.data;
  const statusMeta = BILL_STATUS_META[b.status];
  const outstanding = Number(b.netCertifiedAmount) - Number(b.receivedAmount);

  function printBill() {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) { setPrintError("Allow popups to print or save the bill as PDF."); return; }
    setPrintError("");
    printWindow.document.write(billPrintHtml(b));
    printWindow.document.close();
    printWindow.focus();
    printWindow.requestAnimationFrame(() => printWindow.print());
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/cms/documentation/bill-submission" className="text-xs font-semibold text-biz-blue">← Bill Submission</Link>
      {searchParams.get("submissionFailed") === "1" && b.status === "DRAFT" && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your bill was saved as a draft, but submission did not complete. Review it and use Submit to retry.</p>}
      {(printError || submitMutation.error) && <p role="alert" className="text-sm text-biz-danger">{printError || submitMutation.error?.message}</p>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title text-biz-text">{b.billNo}</h1>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          </div>
          <p className="mt-1 text-[13px] text-biz-muted">
            {b.cmsWork.workName} · {b.contract.contractNo} · {BILL_TYPE_META[b.billType]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SecondaryButton onClick={printBill}><Printer className="h-4 w-4" />Print / PDF</SecondaryButton>
          {b.status === "DRAFT" && (
            <>
              <Link href={`/cms/bills/${b.id}/edit`}>
                <SecondaryButton>
                  <FileEdit className="h-4 w-4" />
                  Edit
                </SecondaryButton>
              </Link>
              <PrimaryButton disabled={submitMutation.isPending} onClick={() => submitMutation.mutate(b.id)}>
                <Send className="h-4 w-4" />
                Submit
              </PrimaryButton>
            </>
          )}
          {b.status === "SUBMITTED" && (
            <SecondaryButton disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate(b.id)}>
              Start Review
            </SecondaryButton>
          )}
          {(b.status === "SUBMITTED" || b.status === "UNDER_REVIEW") && (
            <>
              <SecondaryButton disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate(b.id)}>
                <ThumbsDown className="h-4 w-4" />
                Reject
              </SecondaryButton>
              <PrimaryButton disabled={certifyMutation.isPending} onClick={() => certifyMutation.mutate(b.id)}>
                <CheckCircle2 className="h-4 w-4" />
                {certifyMutation.isPending ? "Certifying..." : "Certify"}
              </PrimaryButton>
            </>
          )}
          {["DRAFT", "SUBMITTED", "UNDER_REVIEW", "REJECTED"].includes(b.status) && (
            <SecondaryButton disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate(b.id)}>
              <XCircle className="h-4 w-4" />
              Cancel
            </SecondaryButton>
          )}
          {["CERTIFIED", "PARTIALLY_RECEIVED"].includes(b.status) && (
            <Link href={`/receipts?workId=${b.cmsWorkId}`}>
              <PrimaryButton>
                <Receipt className="h-4 w-4" />
                Record Receipt
              </PrimaryButton>
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <InfoCard label="Gross Bill Amount" value={formatBDT(b.grossBillAmount)} />
        <InfoCard label="Net Certified" value={formatBDT(b.netCertifiedAmount)} />
        <InfoCard label="Received" value={formatBDT(b.receivedAmount)} />
        <InfoCard label="Outstanding" value={formatBDT(Math.max(0, outstanding))} />
        <InfoCard label="Retention Held" value={formatBDT(Number(b.retentionAmount) - Number(b.retentionReleasedAmount))} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card lg:col-span-2">
          <div className="border-b border-biz-border px-4 py-3">
            <h3 className="text-[15px] font-semibold text-biz-text">BOQ Items</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead>
                <tr className="bg-biz-bg">
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Description</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Unit</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Previous Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Current Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Cumulative Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Current Value</th>
                </tr>
              </thead>
              <tbody>
                {b.items.map((item) => (
                  <tr key={item.id} className="border-t border-biz-border">
                    <td className="px-4 py-2 text-biz-text">{item.description}</td>
                    <td className="px-4 py-2 text-biz-muted">{item.unit}</td>
                    <td className="px-4 py-2 text-biz-muted">{item.previousQty}</td>
                    <td className="px-4 py-2 text-biz-text">{item.currentQty}</td>
                    <td className="px-4 py-2 text-biz-muted">{item.cumulativeQty}</td>
                    <td className="px-4 py-2 font-medium text-biz-text">{formatBDT(item.currentValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {b.adjustments.length > 0 && (
            <>
              <div className="border-y border-biz-border px-4 py-3">
                <h3 className="text-[15px] font-semibold text-biz-text">Adjustments</h3>
              </div>
              <div className="flex flex-col gap-2 px-4 py-3">
                {b.adjustments.map((adj) => (
                  <div key={adj.id} className="flex items-center justify-between text-[13px]">
                    <span className="text-biz-text">
                      {adj.type} {adj.direction === "DEDUCTION" ? "(Deduction)" : "(Addition)"}
                    </span>
                    <span className={adj.direction === "DEDUCTION" ? "text-biz-danger" : "text-biz-success"}>
                      {adj.direction === "DEDUCTION" ? "-" : "+"}
                      {formatBDT(adj.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
          <h3 className="mb-2 text-[14px] font-semibold text-biz-text">Bill Summary</h3>
          <SummaryRow label="Gross Work Value" value={formatBDT(b.grossWorkValue)} />
          <SummaryRow label="Approved Additions" value={formatBDT(b.approvedAdditions)} />
          <SummaryRow label="Gross Bill Amount" value={formatBDT(b.grossBillAmount)} emphasis />
          <SummaryRow label={`Retention (${b.retentionPct ?? "0"}%)`} value={`- ${formatBDT(b.retentionAmount)}`} />
          <SummaryRow label={`VAT (${b.vatRate ?? "0"}%)`} value={`- ${formatBDT(b.vatAmount)}`} />
          <SummaryRow label={`AIT (${b.aitRate ?? "0"}%)`} value={`- ${formatBDT(b.aitAmount)}`} />
          <SummaryRow label="Other Deductions" value={`- ${formatBDT(b.otherDeductionAmount)}`} />
          <SummaryRow label="Net Certified Amount" value={formatBDT(b.netCertifiedAmount)} emphasis />
          <SummaryRow label="Received" value={formatBDT(b.receivedAmount)} />
          <SummaryRow label="Outstanding" value={formatBDT(Math.max(0, outstanding))} emphasis />
        </section>
      </div>
    </div>
  );
}
