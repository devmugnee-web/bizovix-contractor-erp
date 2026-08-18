"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useCreateGoodsReceipt, usePurchaseOrder, usePurchaseOrders } from "@bizovix/api-client";
import { DateInput, FormField, PageHeader, PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { formatQty } from "@/lib/procurement";

interface DraftLine {
  purchaseOrderItemId: string;
  itemLabel: string;
  unit: string;
  orderedQty: string;
  previouslyReceivedQty: string;
  remainingQty: string;
  currentReceivedQty: string;
  acceptedQty: string;
  rejectedQty: string;
  damagedQty: string;
  inspectionRemarks: string;
}

interface GrnFormProps {
  purchaseOrderId?: string;
}

export function GrnForm({ purchaseOrderId: initialPoId }: GrnFormProps) {
  const router = useRouter();
  const createMutation = useCreateGoodsReceipt();

  const [purchaseOrderId, setPurchaseOrderId] = React.useState(initialPoId ?? "");
  const eligiblePos = usePurchaseOrders({ limit: 100 });
  const po = usePurchaseOrder(purchaseOrderId || undefined);

  const [grnNo, setGrnNo] = React.useState("");
  const [receiptDate, setReceiptDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [deliveryChallanNo, setDeliveryChallanNo] = React.useState("");
  const [deliveryChallanDate, setDeliveryChallanDate] = React.useState("");
  const [receivedBy, setReceivedBy] = React.useState("");
  const [warehouseLocation, setWarehouseLocation] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const [lines, setLines] = React.useState<DraftLine[]>([]);
  const seededForPo = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!po.data || seededForPo.current === po.data.id) return;
    seededForPo.current = po.data.id;
    setLines(
      po.data.items
        .filter((item) => Number(item.remainingQty) > 0)
        .map((item) => ({
          purchaseOrderItemId: item.id,
          itemLabel: item.itemNameSnapshot,
          unit: item.unitSnapshot,
          orderedQty: item.orderedQty,
          previouslyReceivedQty: item.receivedQty,
          remainingQty: item.remainingQty,
          currentReceivedQty: item.remainingQty,
          acceptedQty: item.remainingQty,
          rejectedQty: "0",
          damagedQty: "0",
          inspectionRemarks: "",
        })),
    );
  }, [po.data]);

  function patchLine(purchaseOrderItemId: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.purchaseOrderItemId === purchaseOrderItemId ? { ...line, ...patch } : line)));
  }

  const eligiblePoOptions = (eligiblePos.data?.items ?? [])
    .filter((order) => ["ISSUED", "PARTIALLY_RECEIVED"].includes(order.status))
    .map((order) => ({ value: order.id, label: order.poNo + " — " + order.supplier.name }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!purchaseOrderId) return setError("Select a Purchase Order to receive against.");
    if (!receiptDate) return setError("Set a receipt date.");

    const quotedLines = lines.filter((line) => Number(line.currentReceivedQty || 0) > 0);
    if (!quotedLines.length) return setError("Enter a received quantity for at least one item.");
    for (const line of quotedLines) {
      const current = Number(line.currentReceivedQty || 0);
      const breakdown = Number(line.acceptedQty || 0) + Number(line.rejectedQty || 0) + Number(line.damagedQty || 0);
      if (Math.abs(breakdown - current) > 0.001) {
        setError(`For "${line.itemLabel}", Accepted + Rejected + Damaged must equal the Current Received quantity.`);
        return;
      }
    }

    const payload = {
      grnNo: grnNo.trim() || undefined,
      purchaseOrderId,
      receiptDate,
      deliveryChallanNo: deliveryChallanNo.trim() || undefined,
      deliveryChallanDate: deliveryChallanDate || undefined,
      receivedById: receivedBy.trim() || undefined,
      warehouseLocation: warehouseLocation.trim() || undefined,
      remarks: remarks.trim() || undefined,
      items: quotedLines.map((line) => ({
        purchaseOrderItemId: line.purchaseOrderItemId,
        currentReceivedQty: Number(line.currentReceivedQty),
        acceptedQty: Number(line.acceptedQty || 0),
        rejectedQty: Number(line.rejectedQty || 0),
        damagedQty: Number(line.damagedQty || 0),
        inspectionRemarks: line.inspectionRemarks.trim() || undefined,
      })),
    };

    createMutation.mutate(payload, {
      onSuccess: (record) => router.push("/procurement/grns/" + record.id),
      onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Failed to save the goods receipt."),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New Goods Receipt" subtitle="Record full or partial delivery against an Issued purchase order." />

      <form onSubmit={submit} className="flex flex-col gap-6">
        <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <FormField label="Purchase Order" required>
              <SelectInput
                placeholder="Select PO..."
                value={purchaseOrderId}
                onChange={(event) => setPurchaseOrderId(event.target.value)}
                options={eligiblePoOptions}
                disabled={!!initialPoId}
              />
            </FormField>
            <FormField label="GRN No." helper="Leave blank to auto-generate">
              <TextInput placeholder="Auto (GRN-####)" value={grnNo} onChange={(event) => setGrnNo(event.target.value)} />
            </FormField>
            <FormField label="Receipt Date" required>
              <DateInput value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} />
            </FormField>
            <FormField label="Delivery Challan No.">
              <TextInput value={deliveryChallanNo} onChange={(event) => setDeliveryChallanNo(event.target.value)} />
            </FormField>
            <FormField label="Delivery Challan Date">
              <DateInput value={deliveryChallanDate} onChange={(event) => setDeliveryChallanDate(event.target.value)} />
            </FormField>
            <FormField label="Received By">
              <TextInput value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)} />
            </FormField>
            <FormField label="Warehouse / Storage Location">
              <TextInput value={warehouseLocation} onChange={(event) => setWarehouseLocation(event.target.value)} />
            </FormField>
            <div className="md:col-span-2 lg:col-span-3">
              <FormField label="Remarks">
                <textarea
                  rows={2}
                  className="w-full rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                />
              </FormField>
            </div>
          </div>
        </div>

        {purchaseOrderId && (
          <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
            <div className="border-b border-biz-border px-4 py-3">
              <h3 className="text-[15px] font-semibold text-biz-text">Items</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-[13px]">
                <thead>
                  <tr className="bg-biz-bg">
                    <th className="px-3 py-2.5 font-medium text-biz-muted">Item</th>
                    <th className="px-3 py-2.5 font-medium text-biz-muted">Ordered</th>
                    <th className="px-3 py-2.5 font-medium text-biz-muted">Prev. Received</th>
                    <th className="px-3 py-2.5 font-medium text-biz-muted">Remaining</th>
                    <th className="px-3 py-2.5 font-medium text-biz-muted">Current Received</th>
                    <th className="px-3 py-2.5 font-medium text-biz-muted">Accepted</th>
                    <th className="px-3 py-2.5 font-medium text-biz-muted">Rejected</th>
                    <th className="px-3 py-2.5 font-medium text-biz-muted">Damaged</th>
                    <th className="px-3 py-2.5 font-medium text-biz-muted">Inspection Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-biz-muted">
                        This Purchase Order has no remaining quantity to receive.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => (
                      <tr key={line.purchaseOrderItemId} className="border-t border-biz-border align-top">
                        <td className="px-3 py-2.5 text-biz-text">
                          {line.itemLabel} <span className="text-[11px] text-biz-muted">({line.unit})</span>
                        </td>
                        <td className="px-3 py-2.5 text-biz-muted">{formatQty(line.orderedQty)}</td>
                        <td className="px-3 py-2.5 text-biz-muted">{formatQty(line.previouslyReceivedQty)}</td>
                        <td className="px-3 py-2.5 text-biz-muted">{formatQty(line.remainingQty)}</td>
                        <td className="px-3 py-2.5">
                          <TextInput
                            className="h-9 w-24"
                            type="number"
                            step="0.001"
                            min={0}
                            max={Number(line.remainingQty)}
                            value={line.currentReceivedQty}
                            onChange={(event) => patchLine(line.purchaseOrderItemId, { currentReceivedQty: event.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <TextInput className="h-9 w-24" type="number" step="0.001" min={0} value={line.acceptedQty} onChange={(event) => patchLine(line.purchaseOrderItemId, { acceptedQty: event.target.value })} />
                        </td>
                        <td className="px-3 py-2.5">
                          <TextInput className="h-9 w-24" type="number" step="0.001" min={0} value={line.rejectedQty} onChange={(event) => patchLine(line.purchaseOrderItemId, { rejectedQty: event.target.value })} />
                        </td>
                        <td className="px-3 py-2.5">
                          <TextInput className="h-9 w-24" type="number" step="0.001" min={0} value={line.damagedQty} onChange={(event) => patchLine(line.purchaseOrderItemId, { damagedQty: event.target.value })} />
                        </td>
                        <td className="px-3 py-2.5">
                          <TextInput className="h-9 w-40" value={line.inspectionRemarks} onChange={(event) => patchLine(line.purchaseOrderItemId, { inspectionRemarks: event.target.value })} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {error && <p className="rounded-sm border border-biz-danger bg-biz-danger-soft px-4 py-3 text-[13px] text-biz-danger">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          <SecondaryButton type="button" onClick={() => router.back()}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={createMutation.isPending}>
            <Save className="h-4 w-4" />
            {createMutation.isPending ? "Saving..." : "Save Goods Receipt"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
