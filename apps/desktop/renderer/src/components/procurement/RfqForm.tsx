"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2, X } from "lucide-react";
import { useCreateRfq, useItems, useParties, usePurchaseRequisition, useUpdateRfq } from "@bizovix/api-client";
import { DateInput, FormField, PageHeader, PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import type { RfqRecord } from "@bizovix/types";
import { SUPPLIER_ROLES_FILTER } from "@/lib/procurement";

interface DraftItem {
  key: string;
  itemId: string;
  itemLabel: string;
  purchaseRequisitionItemId?: string;
  requestedQty: string;
  remarks: string;
}

interface RfqFormProps {
  mode: "create" | "edit";
  rfq?: RfqRecord;
  /** Pre-fills items/project from an Approved PR when creating an RFQ from its detail page. */
  purchaseRequisitionId?: string;
}

let draftSeq = 0;
const nextKey = () => "rfq-draft-" + ++draftSeq;

export function RfqForm({ mode, rfq, purchaseRequisitionId }: RfqFormProps) {
  const router = useRouter();
  const createMutation = useCreateRfq();
  const updateMutation = useUpdateRfq();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const sourcePr = usePurchaseRequisition(mode === "create" ? purchaseRequisitionId : undefined);
  const itemMasters = useItems({ status: "ACTIVE", limit: 200 });
  const suppliers = useParties({ roles: SUPPLIER_ROLES_FILTER, status: "ACTIVE", limit: 200 });

  const [rfqNo, setRfqNo] = React.useState(rfq?.rfqNo ?? "");
  const [issueDate, setIssueDate] = React.useState(rfq?.issueDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [submissionDeadline, setSubmissionDeadline] = React.useState(rfq?.submissionDeadline?.slice(0, 10) ?? "");
  const [deliveryLocation, setDeliveryLocation] = React.useState(rfq?.deliveryLocation ?? "");
  const [termsConditions, setTermsConditions] = React.useState(rfq?.termsConditions ?? "");
  const [paymentTerms, setPaymentTerms] = React.useState(rfq?.paymentTerms ?? "");
  const [remarks, setRemarks] = React.useState(rfq?.remarks ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const [items, setItems] = React.useState<DraftItem[]>(
    () =>
      rfq?.items.map((item) => ({
        key: nextKey(),
        itemId: item.itemId,
        itemLabel: item.itemCodeSnapshot + " — " + item.itemNameSnapshot,
        purchaseRequisitionItemId: item.purchaseRequisitionItemId ?? undefined,
        requestedQty: item.requestedQty,
        remarks: item.remarks ?? "",
      })) ?? [],
  );
  const [supplierIds, setSupplierIds] = React.useState<string[]>(rfq?.suppliers.map((supplier) => supplier.supplierId) ?? []);
  const prefilledFromPr = React.useRef(false);

  // Once the source PR loads, seed the item list from its lines — the user can still add extras.
  React.useEffect(() => {
    if (mode !== "create" || prefilledFromPr.current || !sourcePr.data) return;
    prefilledFromPr.current = true;
    setItems(
      sourcePr.data.items.map((item) => ({
        key: nextKey(),
        itemId: item.itemId,
        itemLabel: item.item.itemCode + " — " + item.item.itemName,
        purchaseRequisitionItemId: item.id,
        requestedQty: item.requestedQty,
        remarks: item.remarks ?? "",
      })),
    );
  }, [mode, sourcePr.data]);

  function addItem(itemId: string) {
    const master = (itemMasters.data?.items ?? []).find((candidate) => candidate.id === itemId);
    if (!master) return;
    setItems((prev) => [...prev, { key: nextKey(), itemId: master.id, itemLabel: master.itemCode + " — " + master.itemName, requestedQty: "", remarks: "" }]);
  }

  function patchItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addSupplier(supplierId: string) {
    if (!supplierId || supplierIds.includes(supplierId)) return;
    setSupplierIds((prev) => [...prev, supplierId]);
  }

  const supplierById = new Map((suppliers.data?.items ?? []).map((supplier) => [supplier.id, supplier]));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!items.length) return setError("Add at least one item to the RFQ.");
    if (items.some((item) => Number(item.requestedQty || 0) <= 0)) return setError("Every item needs a requested quantity greater than zero.");
    if (!supplierIds.length) return setError("Invite at least one supplier.");
    if (!submissionDeadline) return setError("Set a submission deadline.");

    const payload = {
      rfqNo: rfqNo.trim() || undefined,
      purchaseRequisitionId: mode === "create" ? purchaseRequisitionId : undefined,
      cmsWorkId: mode === "create" ? sourcePr.data?.cmsWorkId ?? undefined : undefined,
      issueDate,
      submissionDeadline,
      deliveryLocation: deliveryLocation.trim() || undefined,
      termsConditions: termsConditions.trim() || undefined,
      paymentTerms: paymentTerms.trim() || undefined,
      remarks: remarks.trim() || undefined,
      supplierIds,
      items: items.map((item) => ({
        itemId: item.itemId,
        purchaseRequisitionItemId: item.purchaseRequisitionItemId,
        requestedQty: Number(item.requestedQty),
        remarks: item.remarks.trim() || undefined,
      })),
    };

    const onError = (mutationError: unknown) => setError(mutationError instanceof Error ? mutationError.message : "Failed to save the RFQ.");

    if (mode === "create") {
      createMutation.mutate(payload, { onSuccess: (record) => router.push("/procurement/rfqs/" + record.id), onError });
    } else if (rfq) {
      updateMutation.mutate({ id: rfq.id, payload }, { onSuccess: () => router.push("/procurement/rfqs/" + rfq.id), onError });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={mode === "create" ? "New RFQ" : "Edit " + (rfq?.rfqNo ?? "RFQ")}
        subtitle="Invite suppliers to quote on a set of items, with a submission deadline and terms."
      />

      <form onSubmit={submit} className="flex flex-col gap-6">
        <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <FormField label="RFQ No." helper="Leave blank to auto-generate">
              <TextInput placeholder="Auto (RFQ-####)" value={rfqNo} onChange={(event) => setRfqNo(event.target.value)} disabled={mode === "edit"} />
            </FormField>
            <FormField label="Issue Date" required>
              <DateInput value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
            </FormField>
            <FormField label="Submission Deadline" required>
              <DateInput value={submissionDeadline} onChange={(event) => setSubmissionDeadline(event.target.value)} />
            </FormField>
            <FormField label="Source Purchase Requisition">
              <TextInput value={rfq?.purchaseRequisition?.prNo ?? sourcePr.data?.prNo ?? "None"} disabled />
            </FormField>
            <FormField label="Delivery Location">
              <TextInput placeholder="Site / warehouse address" value={deliveryLocation} onChange={(event) => setDeliveryLocation(event.target.value)} />
            </FormField>
            <FormField label="Payment Terms">
              <TextInput placeholder="e.g. 30 days from delivery" value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} />
            </FormField>
            <div className="md:col-span-2 lg:col-span-3">
              <FormField label="Terms & Conditions">
                <textarea
                  rows={2}
                  className="w-full rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                  value={termsConditions}
                  onChange={(event) => setTermsConditions(event.target.value)}
                />
              </FormField>
            </div>
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
            <h3 className="text-[15px] font-semibold text-biz-text">Invited Suppliers</h3>
            <div className="w-72">
              <SelectInput
                placeholder="Invite supplier..."
                value=""
                onChange={(event) => event.target.value && addSupplier(event.target.value)}
                options={(suppliers.data?.items ?? [])
                  .filter((supplier) => !supplierIds.includes(supplier.id))
                  .map((supplier) => ({ value: supplier.id, label: supplier.code + " — " + supplier.name }))}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 p-4">
            {supplierIds.length === 0 && <p className="text-[13px] text-biz-muted">No suppliers invited yet.</p>}
            {supplierIds.map((supplierId) => (
              <span key={supplierId} className="flex items-center gap-2 rounded-full border border-biz-border bg-biz-bg px-3 py-1.5 text-[12px] text-biz-text">
                {supplierById.get(supplierId)?.name ?? supplierId}
                <button type="button" aria-label="Remove supplier" onClick={() => setSupplierIds((prev) => prev.filter((id) => id !== supplierId))}>
                  <X className="h-3.5 w-3.5 text-biz-muted hover:text-biz-danger" />
                </button>
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-biz-border px-4 py-3">
            <h3 className="text-[15px] font-semibold text-biz-text">RFQ Items</h3>
            <div className="w-72">
              <SelectInput
                placeholder="Add item from master..."
                value=""
                onChange={(event) => event.target.value && addItem(event.target.value)}
                options={(itemMasters.data?.items ?? []).map((master) => ({ value: master.id, label: master.itemCode + " — " + master.itemName }))}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead>
                <tr className="bg-biz-bg">
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Item</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Requested Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Remarks</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-biz-muted">
                      Add an item from the master to start the RFQ.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.key} className="border-t border-biz-border align-top">
                      <td className="px-4 py-2 text-biz-text">
                        {item.itemLabel}
                        {item.purchaseRequisitionItemId && <span className="ml-1.5 text-[11px] text-biz-muted">(from PR)</span>}
                      </td>
                      <td className="px-4 py-2">
                        <TextInput
                          className="h-9 w-28"
                          type="number"
                          step="0.001"
                          min={0}
                          value={item.requestedQty}
                          onChange={(event) => patchItem(item.key, { requestedQty: event.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <TextInput className="h-9 w-56" value={item.remarks} onChange={(event) => patchItem(item.key, { remarks: event.target.value })} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          type="button"
                          aria-label="Remove item"
                          className="text-biz-danger hover:opacity-70"
                          onClick={() => setItems((prev) => prev.filter((candidate) => candidate.key !== item.key))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
