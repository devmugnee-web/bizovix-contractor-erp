"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useGoodsReceipt } from "@bizovix/api-client";
import { StatusBadge } from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { LinkedDocumentsCard } from "@/components/procurement/LinkedDocumentsCard";
import { GRN_INSPECTION_META, formatQty } from "@/lib/procurement";

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-biz-text">{value}</p>
    </div>
  );
}

export default function GrnDetailPage() {
  const params = useParams<{ id: string }>();
  const grn = useGoodsReceipt(params.id);

  useSetBreadcrumb([{ label: "Procurement" }, { label: "Goods Receipts", href: "/procurement/grns" }, { label: grn.data?.grnNo ?? "GRN" }]);

  if (grn.isLoading) return <div className="p-12 text-center text-biz-muted">Loading goods receipt...</div>;
  if (!grn.data) return <div className="p-12 text-center text-biz-muted">Goods Receipt not found.</div>;

  const record = grn.data;
  const statusMeta = GRN_INSPECTION_META[record.inspectionStatus];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title text-biz-text">{record.grnNo}</h1>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          </div>
          <p className="mt-1 text-[13px] text-biz-muted">
            {record.supplier.name} · {record.cmsWork?.workName ?? "General procurement"} · Received {formatDate(record.receiptDate)}
          </p>
        </div>
        <Link href={"/procurement/purchase-orders/" + record.purchaseOrder.id} className="text-[13px] font-medium text-biz-blue hover:underline">
          View Purchase Order {record.purchaseOrder.poNo}
        </Link>
      </div>

      <div className="flex flex-wrap gap-4">
        <InfoCard label="Purchase Order" value={record.purchaseOrder.poNo} />
        <InfoCard label="Delivery Challan" value={record.deliveryChallanNo ?? "—"} />
        <InfoCard label="Warehouse" value={record.warehouseLocation ?? "—"} />
        <InfoCard label="Received By" value={record.receivedById ?? "—"} />
      </div>

      <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">Received Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-[13px]">
            <thead>
              <tr className="bg-biz-bg">
                <th className="px-3 py-2.5 font-medium text-biz-muted">Item</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Ordered</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Prev. Received</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">This Receipt</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Cumulative</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Remaining</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Accepted</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Rejected</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Damaged</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Inspection Remarks</th>
              </tr>
            </thead>
            <tbody>
              {record.items.map((item) => (
                <tr key={item.id} className="border-t border-biz-border">
                  <td className="px-3 py-2.5 text-biz-text">
                    {item.descriptionSnapshot} <span className="text-[11px] text-biz-muted">({item.unitSnapshot})</span>
                  </td>
                  <td className="px-3 py-2.5 text-biz-muted">{formatQty(item.orderedQty)}</td>
                  <td className="px-3 py-2.5 text-biz-muted">{formatQty(item.previouslyReceivedQty)}</td>
                  <td className="px-3 py-2.5 font-medium text-biz-text">{formatQty(item.currentReceivedQty)}</td>
                  <td className="px-3 py-2.5 text-biz-text">{formatQty(item.cumulativeReceivedQty)}</td>
                  <td className="px-3 py-2.5 text-biz-muted">{formatQty(item.remainingQty)}</td>
                  <td className="px-3 py-2.5 text-biz-success">{formatQty(item.acceptedQty)}</td>
                  <td className="px-3 py-2.5 text-biz-danger">{formatQty(item.rejectedQty)}</td>
                  <td className="px-3 py-2.5 text-biz-warning">{formatQty(item.damagedQty)}</td>
                  <td className="px-3 py-2.5 text-biz-muted">{item.inspectionRemarks ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {record.remarks && (
        <section className="rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
          <p className="text-[13px] text-biz-text">
            <span className="font-semibold">Remarks:</span> {record.remarks}
          </p>
        </section>
      )}

      <LinkedDocumentsCard filter={{ goodsReceiptNoteId: record.id }} />
    </div>
  );
}
