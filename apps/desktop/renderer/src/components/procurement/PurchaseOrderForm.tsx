"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import {
  useComparativeStatement,
  useCreatePurchaseOrder,
  useItems,
  useRfq,
  useSupplierQuotation,
  useUpdatePurchaseOrder,
} from "@bizovix/api-client";
import { DateInput, FormField, PageHeader, PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { PurchaseOrderRecord } from "@bizovix/types";

interface DraftItem {
  key: string;
  itemId: string;
  itemLabel: string;
  unit: string;
  sourceQuotationItemId?: string;
  orderedQty: string;
  unitRate: string;
  discountAmount: string;
  deliveryDate: string;
  remarks: string;
}

interface PurchaseOrderFormProps {
  mode: "create" | "edit";
  order?: PurchaseOrderRecord;
  /** Required to raise a new PO — a PO can only be created from an Approved Comparative Statement. */
  comparativeStatementId?: string;
}

let draftSeq = 0;
const nextKey = () => "po-draft-" + ++draftSeq;

function lineTotal(item: DraftItem): number {
  return Number(item.orderedQty || 0) * Number(item.unitRate || 0) - Number(item.discountAmount || 0);
}

export function PurchaseOrderForm({ mode, order, comparativeStatementId }: PurchaseOrderFormProps) {
  const router = useRouter();
  const createMutation = useCreatePurchaseOrder();
  const updateMutation = useUpdatePurchaseOrder();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const cs = useComparativeStatement(mode === "create" ? comparativeStatementId : undefined);
  const rfq = useRfq(mode === "create" ? cs.data?.rfqId : undefined);
  const selectedSupplier = cs.data?.suppliers.find((supplier) => supplier.isSelected);
  const quotation = useSupplierQuotation(mode === "create" ? selectedSupplier?.quotationId : undefined);
  const itemMasters = useItems({ status: "ACTIVE", limit: 200 });

  const [poNo, setPoNo] = React.useState(order?.poNo ?? "");
  const [poDate, setPoDate] = React.useState(order?.poDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [deliveryAddress, setDeliveryAddress] = React.useState(order?.deliveryAddress ?? "");
  const [paymentTerms, setPaymentTerms] = React.useState(order?.paymentTerms ?? selectedSupplier?.paymentTerms ?? "");
  const [deliveryTerms, setDeliveryTerms] = React.useState(order?.deliveryTerms ?? "");
  const [otherCharges, setOtherCharges] = React.useState(order?.otherCharges ?? "0");
  const [remarks, setRemarks] = React.useState(order?.remarks ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const [items, setItems] = React.useState<DraftItem[]>(
    () =>
      order?.items.map((item) => ({
        key: nextKey(),
        itemId: item.itemId,
        itemLabel: item.itemCodeSnapshot + " — " + item.itemNameSnapshot,
        unit: item.unitSnapshot,
        sourceQuotationItemId: item.sourceQuotationItemId ?? undefined,
        orderedQty: item.orderedQty,
        unitRate: item.unitRate,
        discountAmount: item.discountAmount,
        deliveryDate: item.deliveryDate?.slice(0, 10) ?? "",
        remarks: item.remarks ?? "",
      })) ?? [],
  );
  const prefilledFromQuotation = React.useRef(false);

  // Seed PO items from the selected supplier's quotation once the RFQ + quotation both load —
  // ordered qty/rate default to what was quoted, but remain editable before approval.
  React.useEffect(() => {
    if (mode !== "create" || prefilledFromQuotation.current || !rfq.data || !quotation.data) return;
    prefilledFromQuotation.current = true;
    const rfqItemsById = new Map(rfq.data.items.map((item) => [item.id, item]));
    setItems(
      quotation.data.items.map((line) => {
        const rfqItem = rfqItemsById.get(line.rfqItemId);
        return {
          key: nextKey(),
          itemId: rfqItem?.itemId ?? "",
          itemLabel: rfqItem?.itemNameSnapshot ?? line.rfqItem.itemNameSnapshot,
          unit: rfqItem?.unitSnapshot ?? line.rfqItem.unitSnapshot,
          sourceQuotationItemId: line.id,
          orderedQty: line.offeredQty,
          unitRate: line.unitRate,
          discountAmount: (Number(line.offeredQty) * Number(line.unitRate) * (Number(line.discountPct) / 100)).toFixed(2),
          deliveryDate: "",
          remarks: line.remarks ?? "",
        };
      }),
    );
  }, [mode, rfq.data, quotation.data]);

  function addItem(itemId: string) {
    const master = (itemMasters.data?.items ?? []).find((candidate) => candidate.id === itemId);
    if (!master) return;
    setItems((prev) => [...prev, { key: nextKey(), itemId: master.id, itemLabel: master.itemCode + " — " + master.itemName, unit: master.uom?.code ?? "PCS", orderedQty: "", unitRate: "", discountAmount: "0", deliveryDate: "", remarks: "" }]);
  }

  function patchItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  const subtotalPreview = items.reduce((sum, item) => sum + lineTotal(item), 0);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === "create" && !selectedSupplier) return setError("This Comparative Statement has no selected supplier yet.");
    if (!items.length) return setError("Add at least one item to the purchase order.");
    if (items.some((item) => Number(item.orderedQty || 0) <= 0)) return setError("Every item needs an ordered quantity greater than zero.");

    const payload = {
      poNo: poNo.trim() || undefined,
      poDate,
      supplierId: mode === "create" ? selectedSupplier!.supplierId : order!.supplierId,
      cmsWorkId: mode === "create" ? cs.data?.cmsWorkId ?? undefined : undefined,
      purchaseRequisitionId: mode === "create" ? rfq.data?.purchaseRequisitionId ?? undefined : undefined,
      rfqId: mode === "create" ? cs.data?.rfqId : undefined,
      comparativeStatementId: mode === "create" ? comparativeStatementId : undefined,
      deliveryAddress: deliveryAddress.trim() || undefined,
      paymentTerms: paymentTerms.trim() || undefined,
      deliveryTerms: deliveryTerms.trim() || undefined,
      otherCharges: Number(otherCharges || 0),
      remarks: remarks.trim() || undefined,
      items: items.map((item) => ({
        itemId: item.itemId,
        sourceQuotationItemId: item.sourceQuotationItemId,
        orderedQty: Number(item.orderedQty),
        unitRate: Number(item.unitRate),
        discountAmount: Number(item.discountAmount || 0),
        deliveryDate: item.deliveryDate || undefined,
        remarks: item.remarks.trim() || undefined,
      })),
    };

    const onError = (mutationError: unknown) => setError(mutationError instanceof Error ? mutationError.message : "Failed to save the purchase order.");

    if (mode === "create") {
      createMutation.mutate(payload, { onSuccess: (record) => router.push("/procurement/purchase-orders/" + record.id), onError });
    } else if (order) {
      updateMutation.mutate({ id: order.id, payload }, { onSuccess: () => router.push("/procurement/purchase-orders/" + order.id), onError });
    }
  }

  if (mode === "create" && (cs.isLoading || rfq.isLoading || quotation.isLoading)) {
    return <div className="h-96 animate-pulse rounded-lg bg-slate-100" />;
  }
  if (mode === "create" && cs.data && cs.data.status !== "APPROVED") {
    return <div className="p-12 text-center text-biz-muted">A Purchase Order can only be raised from an Approved Comparative Statement.</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={mode === "create" ? "New Purchase Order" : "Edit " + (order?.poNo ?? "Purchase Order")}
        subtitle={
          mode === "create"
            ? "Raised from Comparative Statement " + (cs.data?.csNo ?? "") + " — supplier " + (selectedSupplier?.supplier.name ?? "")
            : "Only Draft purchase orders may be edited — approved/issued orders preserve their commercial terms."
        }
      />

      <form onSubmit={submit} className="flex flex-col gap-6">
        <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <FormField label="PO No." helper="Leave blank to auto-generate">
              <TextInput placeholder="Auto (PO-####)" value={poNo} onChange={(event) => setPoNo(event.target.value)} disabled={mode === "edit"} />
            </FormField>
            <FormField label="PO Date" required>
              <DateInput value={poDate} onChange={(event) => setPoDate(event.target.value)} />
            </FormField>
            <FormField label="Supplier">
              <TextInput value={mode === "create" ? (selectedSupplier?.supplier.name ?? "") : order?.supplier.name ?? ""} disabled />
            </FormField>
            <FormField label="Delivery Address">
              <TextInput value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} />
            </FormField>
            <FormField label="Payment Terms">
              <TextInput value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} />
            </FormField>
            <FormField label="Delivery Terms">
              <TextInput value={deliveryTerms} onChange={(event) => setDeliveryTerms(event.target.value)} />
            </FormField>
            <FormField label="Other Charges">
              <TextInput type="number" step="0.01" min={0} value={otherCharges} onChange={(event) => setOtherCharges(event.target.value)} />
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

        <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-biz-border px-4 py-3">
            <h3 className="text-[15px] font-semibold text-biz-text">Order Items</h3>
            {mode === "edit" && (
              <div className="w-72">
                <SelectInput
                  placeholder="Add item from master..."
                  value=""
                  onChange={(event) => event.target.value && addItem(event.target.value)}
                  options={(itemMasters.data?.items ?? []).map((master) => ({ value: master.id, label: master.itemCode + " — " + master.itemName }))}
                />
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead>
                <tr className="bg-biz-bg">
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Item</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Ordered Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Unit Rate</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Discount</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Line Total</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Delivery Date</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Remarks</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-biz-muted">
                      No items yet.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.key} className="border-t border-biz-border align-top">
                      <td className="px-4 py-2 text-biz-text">
                        {item.itemLabel} <span className="text-[11px] text-biz-muted">({item.unit})</span>
                      </td>
                      <td className="px-4 py-2">
                        <TextInput className="h-9 w-24" type="number" step="0.001" min={0} value={item.orderedQty} onChange={(event) => patchItem(item.key, { orderedQty: event.target.value })} />
                      </td>
                      <td className="px-4 py-2">
                        <TextInput className="h-9 w-28" type="number" step="0.01" min={0} value={item.unitRate} onChange={(event) => patchItem(item.key, { unitRate: event.target.value })} />
                      </td>
                      <td className="px-4 py-2">
                        <TextInput className="h-9 w-24" type="number" step="0.01" min={0} value={item.discountAmount} onChange={(event) => patchItem(item.key, { discountAmount: event.target.value })} />
                      </td>
                      <td className="px-4 py-2 font-medium text-biz-text">{formatBDT(lineTotal(item))}</td>
                      <td className="px-4 py-2">
                        <DateInput className="h-9 w-40" value={item.deliveryDate} onChange={(event) => patchItem(item.key, { deliveryDate: event.target.value })} />
                      </td>
                      <td className="px-4 py-2">
                        <TextInput className="h-9 w-40" value={item.remarks} onChange={(event) => patchItem(item.key, { remarks: event.target.value })} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        {mode === "edit" && (
                          <button type="button" aria-label="Remove item" className="text-biz-danger hover:opacity-70" onClick={() => setItems((prev) => prev.filter((candidate) => candidate.key !== item.key))}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end border-t border-biz-border px-4 py-3 text-[13px] font-semibold text-biz-text">
            Subtotal (before tax): {formatBDT(subtotalPreview)} + Other Charges {formatBDT(Number(otherCharges || 0))}
          </div>
        </section>

        {error && <p className="rounded-sm border border-biz-danger bg-biz-danger-soft px-4 py-3 text-[13px] text-biz-danger">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          <SecondaryButton type="button" onClick={() => router.back()}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isPending}>
            <Save className="h-4 w-4" />
            {isPending ? "Saving..." : mode === "create" ? "Save Draft" : "Save Changes"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
