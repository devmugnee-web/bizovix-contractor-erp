"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, FileEdit, PackagePlus, Send, XCircle } from "lucide-react";
import { useApprovePurchaseOrder, useCancelPurchaseOrder, useClosePurchaseOrder, useGoodsReceipts, useIssuePurchaseOrder, usePurchaseOrder } from "@bizovix/api-client";
import { PrimaryButton, SecondaryButton, StatusBadge } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { LinkedDocumentsCard } from "@/components/procurement/LinkedDocumentsCard";
import { GRN_INSPECTION_META, PO_STATUS_META, formatQty } from "@/lib/procurement";

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-biz-text">{value}</p>
    </div>
  );
}

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const order = usePurchaseOrder(params.id);
  const grns = useGoodsReceipts({ purchaseOrderId: params.id, limit: 50 });

  const approveMutation = useApprovePurchaseOrder();
  const issueMutation = useIssuePurchaseOrder();
  const cancelMutation = useCancelPurchaseOrder();
  const closeMutation = useClosePurchaseOrder();
  const [error, setError] = React.useState<string | null>(null);

  useSetBreadcrumb([{ label: "Procurement" }, { label: "Purchase Orders", href: "/procurement/purchase-orders" }, { label: order.data?.poNo ?? "Purchase Order" }]);

  if (order.isLoading) return <div className="p-12 text-center text-biz-muted">Loading purchase order...</div>;
  if (!order.data) return <div className="p-12 text-center text-biz-muted">Purchase Order not found.</div>;

  const record = order.data;
  const statusMeta = PO_STATUS_META[record.status];
  const onError = (mutationError: unknown) => setError(mutationError instanceof Error ? mutationError.message : "The action could not be completed.");
  const isMutating = approveMutation.isPending || issueMutation.isPending || cancelMutation.isPending || closeMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title text-biz-text">{record.poNo}</h1>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          </div>
          <p className="mt-1 text-[13px] text-biz-muted">
            {record.supplier.name} · {record.cmsWork?.workName ?? "General procurement"} · {formatDate(record.poDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {record.status === "DRAFT" && (
            <>
              <Link href={"/procurement/purchase-orders/" + record.id + "/edit"}>
                <SecondaryButton>
                  <FileEdit className="h-4 w-4" />
                  Edit Draft
                </SecondaryButton>
              </Link>
              <PrimaryButton disabled={isMutating} onClick={() => approveMutation.mutate(record.id, { onError })}>
                <CheckCircle2 className="h-4 w-4" />
                {approveMutation.isPending ? "Approving..." : "Approve"}
              </PrimaryButton>
            </>
          )}
          {record.status === "APPROVED" && (
            <PrimaryButton disabled={isMutating} onClick={() => issueMutation.mutate(record.id, { onError })}>
              <Send className="h-4 w-4" />
              {issueMutation.isPending ? "Issuing..." : "Issue"}
            </PrimaryButton>
          )}
          {["ISSUED", "PARTIALLY_RECEIVED"].includes(record.status) && (
            <Link href={"/procurement/grns/create?purchaseOrderId=" + record.id}>
              <PrimaryButton>
                <PackagePlus className="h-4 w-4" />
                Create GRN
              </PrimaryButton>
            </Link>
          )}
          {record.status === "RECEIVED" && (
            <SecondaryButton disabled={isMutating} onClick={() => closeMutation.mutate(record.id, { onError })}>
              {closeMutation.isPending ? "Closing..." : "Close"}
            </SecondaryButton>
          )}
          {!["CANCELLED", "CLOSED"].includes(record.status) && (
            <SecondaryButton disabled={isMutating} onClick={() => cancelMutation.mutate(record.id, { onError })}>
              <XCircle className="h-4 w-4" />
              Cancel
            </SecondaryButton>
          )}
        </div>
      </div>

      {error && <p className="rounded-sm border border-biz-danger bg-biz-danger-soft px-4 py-3 text-[13px] text-biz-danger">{error}</p>}

      <div className="flex flex-wrap gap-4">
        <InfoCard label="Source PR" value={record.purchaseRequisition?.prNo ?? "—"} />
        <InfoCard label="Source RFQ" value={record.rfq?.rfqNo ?? "—"} />
        <InfoCard label="Source CS" value={record.comparativeStatement?.csNo ?? "—"} />
        <InfoCard label="Received" value={record.receivedPct + "%"} />
        <InfoCard label="Grand Total" value={formatBDT(record.grandTotal)} />
      </div>

      <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">Order Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead>
              <tr className="bg-biz-bg">
                <th className="px-4 py-2.5 font-medium text-biz-muted">Item</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Ordered</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Rate</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Discount</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Line Total</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Received</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Remaining</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Delivery Date</th>
              </tr>
            </thead>
            <tbody>
              {record.items.map((item) => (
                <tr key={item.id} className="border-t border-biz-border">
                  <td className="px-4 py-3 text-biz-text">{item.itemNameSnapshot}</td>
                  <td className="px-4 py-3 text-biz-text">
                    {formatQty(item.orderedQty)} {item.unitSnapshot}
                  </td>
                  <td className="px-4 py-3 text-biz-muted">{formatBDT(item.unitRate)}</td>
                  <td className="px-4 py-3 text-biz-muted">{formatBDT(item.discountAmount)}</td>
                  <td className="px-4 py-3 font-medium text-biz-text">{formatBDT(item.lineAmount)}</td>
                  <td className="px-4 py-3 text-biz-muted">{formatQty(item.receivedQty)}</td>
                  <td className="px-4 py-3 text-biz-muted">{formatQty(item.remainingQty)}</td>
                  <td className="px-4 py-3 text-biz-muted">{item.deliveryDate ? formatDate(item.deliveryDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col items-end gap-1 border-t border-biz-border px-4 py-3 text-[13px]">
          <span className="text-biz-muted">
            Subtotal: {formatBDT(record.subtotal)} · Discount: {formatBDT(record.discountAmount)} · Tax: {formatBDT(record.taxAmount)} · Other Charges: {formatBDT(record.otherCharges)}
          </span>
          <span className="font-semibold text-biz-text">Grand Total: {formatBDT(record.grandTotal)}</span>
        </div>
      </section>

      <section className="rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-medium text-biz-muted">Delivery Address</dt>
            <dd className="mt-1 text-[13px] text-biz-text">{record.deliveryAddress ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium text-biz-muted">Delivery Terms</dt>
            <dd className="mt-1 text-[13px] text-biz-text">{record.deliveryTerms ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium text-biz-muted">Payment Terms</dt>
            <dd className="mt-1 text-[13px] text-biz-text">{record.paymentTerms ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium text-biz-muted">Remarks</dt>
            <dd className="mt-1 text-[13px] text-biz-text">{record.remarks ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">Goods Receipts</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead>
              <tr className="bg-biz-bg">
                <th className="px-4 py-2.5 font-medium text-biz-muted">GRN No.</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Receipt Date</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Inspection</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Action</th>
              </tr>
            </thead>
            <tbody>
              {(grns.data?.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-biz-muted">
                    No goods received yet.
                  </td>
                </tr>
              ) : (
                (grns.data?.items ?? []).map((grn) => (
                  <tr key={grn.id} className="border-t border-biz-border">
                    <td className="px-4 py-3 text-biz-text">{grn.grnNo}</td>
                    <td className="px-4 py-3 text-biz-muted">{formatDate(grn.receiptDate)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge label={GRN_INSPECTION_META[grn.inspectionStatus].label} tone={GRN_INSPECTION_META[grn.inspectionStatus].tone} />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={"/procurement/grns/" + grn.id} className="font-medium text-biz-blue hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <LinkedDocumentsCard filter={{ purchaseOrderId: record.id }} />
    </div>
  );
}
