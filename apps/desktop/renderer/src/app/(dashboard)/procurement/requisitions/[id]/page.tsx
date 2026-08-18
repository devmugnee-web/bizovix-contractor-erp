"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, FileEdit, FileSearch, Send, ThumbsDown, XCircle } from "lucide-react";
import {
  useApprovePurchaseRequisition,
  useCancelPurchaseRequisition,
  usePurchaseRequisition,
  useRejectPurchaseRequisition,
  useSubmitPurchaseRequisition,
} from "@bizovix/api-client";
import { PrimaryButton, SecondaryButton, StatusBadge } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { LinkedDocumentsCard } from "@/components/procurement/LinkedDocumentsCard";
import { PR_PRIORITY_META, PR_STATUS_META, formatQty } from "@/lib/procurement";

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-biz-text">{value}</p>
    </div>
  );
}

export default function PurchaseRequisitionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const requisition = usePurchaseRequisition(params.id);

  const submitMutation = useSubmitPurchaseRequisition();
  const approveMutation = useApprovePurchaseRequisition();
  const rejectMutation = useRejectPurchaseRequisition();
  const cancelMutation = useCancelPurchaseRequisition();

  const [rejectReason, setRejectReason] = React.useState("");
  const [showReject, setShowReject] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  useSetBreadcrumb([
    { label: "Procurement" },
    { label: "Purchase Requisitions", href: "/procurement/requisitions" },
    { label: requisition.data?.prNo ?? "Requisition" },
  ]);

  if (requisition.isLoading) return <div className="p-12 text-center text-biz-muted">Loading requisition...</div>;
  if (!requisition.data) return <div className="p-12 text-center text-biz-muted">Purchase Requisition not found.</div>;

  const record = requisition.data;
  const statusMeta = PR_STATUS_META[record.status];
  const priorityMeta = PR_PRIORITY_META[record.priority];
  const estimatedTotal = record.items.reduce((sum, item) => sum + Number(item.estimatedAmount ?? 0), 0);
  const onError = (mutationError: unknown) => setError(mutationError instanceof Error ? mutationError.message : "The action could not be completed.");
  const isMutating = submitMutation.isPending || approveMutation.isPending || rejectMutation.isPending || cancelMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title text-biz-text">{record.prNo}</h1>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            <StatusBadge label={priorityMeta.label} tone={priorityMeta.tone} />
          </div>
          <p className="mt-1 text-[13px] text-biz-muted">
            {record.cmsWork?.workName ?? "General procurement"} · Requested {formatDate(record.requestDate)}
            {record.department ? " · " + record.department : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {record.status === "DRAFT" && (
            <>
              <Link href={"/procurement/requisitions/" + record.id + "/edit"}>
                <SecondaryButton>
                  <FileEdit className="h-4 w-4" />
                  Edit Draft
                </SecondaryButton>
              </Link>
              <PrimaryButton disabled={isMutating} onClick={() => submitMutation.mutate(record.id, { onError })}>
                <Send className="h-4 w-4" />
                {submitMutation.isPending ? "Submitting..." : "Submit"}
              </PrimaryButton>
            </>
          )}
          {record.status === "SUBMITTED" && (
            <>
              <SecondaryButton disabled={isMutating} onClick={() => setShowReject((current) => !current)}>
                <ThumbsDown className="h-4 w-4" />
                Reject
              </SecondaryButton>
              <PrimaryButton disabled={isMutating} onClick={() => approveMutation.mutate(record.id, { onError })}>
                <CheckCircle2 className="h-4 w-4" />
                {approveMutation.isPending ? "Approving..." : "Approve"}
              </PrimaryButton>
            </>
          )}
          {record.status === "APPROVED" && (
            <PrimaryButton onClick={() => router.push("/procurement/rfqs/create?purchaseRequisitionId=" + record.id)}>
              <FileSearch className="h-4 w-4" />
              Create RFQ
            </PrimaryButton>
          )}
          {record.status !== "CONVERTED" && record.status !== "CANCELLED" && (
            <SecondaryButton disabled={isMutating} onClick={() => cancelMutation.mutate(record.id, { onError })}>
              <XCircle className="h-4 w-4" />
              Cancel
            </SecondaryButton>
          )}
        </div>
      </div>

      {showReject && record.status === "SUBMITTED" && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-[12px] font-medium text-biz-muted">Rejection reason (required)</label>
            <input
              className="h-11 w-full rounded-sm border border-biz-border bg-biz-surface px-3 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Explain why this requisition is being rejected"
            />
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

      {error && <p className="rounded-sm border border-biz-danger bg-biz-danger-soft px-4 py-3 text-[13px] text-biz-danger">{error}</p>}
      {record.status === "REJECTED" && record.rejectedReason && (
        <p className="rounded-sm border border-biz-danger bg-biz-danger-soft px-4 py-3 text-[13px] text-biz-danger">Rejected: {record.rejectedReason}</p>
      )}

      <div className="flex flex-wrap gap-4">
        <InfoCard label="Items" value={String(record.items.length)} />
        <InfoCard label="Estimated Amount" value={formatBDT(estimatedTotal)} />
        <InfoCard label="Required By" value={record.requiredByDate ? formatDate(record.requiredByDate) : "—"} />
        <InfoCard label="Submitted" value={record.submittedAt ? formatDate(record.submittedAt) : "—"} />
        <InfoCard label="Approved" value={record.approvedAt ? formatDate(record.approvedAt) : "—"} />
      </div>

      <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">Requested Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead>
              <tr className="bg-biz-bg">
                <th className="px-4 py-2.5 font-medium text-biz-muted">Item</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Description</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Unit</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Qty</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Est. Rate</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Est. Amount</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Required</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">BOQ Reference</th>
              </tr>
            </thead>
            <tbody>
              {record.items.map((item) => (
                <tr key={item.id} className="border-t border-biz-border">
                  <td className="px-4 py-3 text-biz-text">{item.item.itemCode}</td>
                  <td className="px-4 py-3 text-biz-text">{item.descriptionSnapshot}</td>
                  <td className="px-4 py-3 text-biz-muted">{item.uom?.code ?? "—"}</td>
                  <td className="px-4 py-3 text-biz-text">{formatQty(item.requestedQty)}</td>
                  <td className="px-4 py-3 text-biz-muted">{item.estimatedRate ? formatBDT(item.estimatedRate) : "—"}</td>
                  <td className="px-4 py-3 font-medium text-biz-text">{item.estimatedAmount ? formatBDT(item.estimatedAmount) : "—"}</td>
                  <td className="px-4 py-3 text-biz-muted">{item.requiredDate ? formatDate(item.requiredDate) : "—"}</td>
                  <td className="px-4 py-3 text-biz-muted">{item.boqItem ? (item.boqItem.itemCode ?? item.boqItem.description) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end border-t border-biz-border px-4 py-3 text-[13px] font-semibold text-biz-text">
          Estimated Total: {formatBDT(estimatedTotal)}
        </div>
      </section>

      {(record.purpose || record.remarks) && (
        <section className="rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
          {record.purpose && (
            <p className="text-[13px] text-biz-text">
              <span className="font-semibold">Purpose:</span> {record.purpose}
            </p>
          )}
          {record.remarks && (
            <p className="mt-2 text-[13px] text-biz-text">
              <span className="font-semibold">Remarks:</span> {record.remarks}
            </p>
          )}
        </section>
      )}

      <LinkedDocumentsCard filter={{ purchaseRequisitionId: record.id }} />
    </div>
  );
}
