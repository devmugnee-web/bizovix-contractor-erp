"use client";

import * as React from "react";
import { Save } from "lucide-react";
import { useCreateSupplierQuotation, useReviseSupplierQuotation } from "@bizovix/api-client";
import { DateInput, FormField, PrimaryButton, SecondaryButton, TextInput } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { RfqRecord, SupplierQuotationRecord } from "@bizovix/types";

interface DraftLine {
  rfqItemId: string;
  itemLabel: string;
  unit: string;
  requestedQty: string;
  offeredQty: string;
  unitRate: string;
  discountPct: string;
  taxPct: string;
  deliveryDays: string;
  brandModel: string;
  specification: string;
  remarks: string;
}

interface SupplierQuotationFormProps {
  rfq: RfqRecord;
  supplierId: string;
  supplierLabel: string;
  /** When set, this submits as a revision of an existing active quotation instead of a new record. */
  existing?: SupplierQuotationRecord;
  onDone: () => void;
  onCancel: () => void;
}

function computeLineAmount(line: DraftLine): number {
  const gross = Number(line.offeredQty || 0) * Number(line.unitRate || 0);
  const afterDiscount = gross * (1 - Number(line.discountPct || 0) / 100);
  return afterDiscount * (1 + Number(line.taxPct || 0) / 100);
}

export function SupplierQuotationForm({ rfq, supplierId, supplierLabel, existing, onDone, onCancel }: SupplierQuotationFormProps) {
  const createMutation = useCreateSupplierQuotation();
  const reviseMutation = useReviseSupplierQuotation();
  const isPending = createMutation.isPending || reviseMutation.isPending;

  const existingByRfqItem = new Map((existing?.items ?? []).map((item) => [item.rfqItemId, item]));

  const [quotationRef, setQuotationRef] = React.useState(existing?.quotationRef ?? "");
  const [quotationDate, setQuotationDate] = React.useState(existing?.quotationDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [validityDate, setValidityDate] = React.useState(existing?.validityDate?.slice(0, 10) ?? "");
  const [deliveryDays, setDeliveryDays] = React.useState(existing?.deliveryDays != null ? String(existing.deliveryDays) : "");
  const [paymentTerms, setPaymentTerms] = React.useState(existing?.paymentTerms ?? "");
  const [warranty, setWarranty] = React.useState(existing?.warranty ?? "");
  const [remarks, setRemarks] = React.useState(existing?.remarks ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const [lines, setLines] = React.useState<DraftLine[]>(() =>
    rfq.items.map((rfqItem) => {
      const prior = existingByRfqItem.get(rfqItem.id);
      return {
        rfqItemId: rfqItem.id,
        itemLabel: rfqItem.itemNameSnapshot,
        unit: rfqItem.unitSnapshot,
        requestedQty: rfqItem.requestedQty,
        offeredQty: prior?.offeredQty ?? rfqItem.requestedQty,
        unitRate: prior?.unitRate ?? "",
        discountPct: prior?.discountPct ?? "0",
        taxPct: prior?.taxPct ?? "0",
        deliveryDays: prior?.deliveryDays != null ? String(prior.deliveryDays) : "",
        brandModel: prior?.brandModel ?? "",
        specification: prior?.specification ?? "",
        remarks: prior?.remarks ?? "",
      };
    }),
  );

  function patchLine(rfqItemId: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.rfqItemId === rfqItemId ? { ...line, ...patch } : line)));
  }

  const previewTotal = lines.reduce((sum, line) => sum + (Number(line.offeredQty || 0) > 0 && Number(line.unitRate || 0) > 0 ? computeLineAmount(line) : 0), 0);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!quotationRef.trim()) return setError("Enter the supplier's quotation reference.");
    const quotedLines = lines.filter((line) => Number(line.offeredQty || 0) > 0 && Number(line.unitRate || 0) > 0);
    if (!quotedLines.length) return setError("Quote at least one item with a quantity and rate.");

    const payload = {
      rfqId: rfq.id,
      supplierId,
      quotationRef: quotationRef.trim(),
      quotationDate,
      validityDate: validityDate || undefined,
      deliveryDays: deliveryDays === "" ? undefined : Number(deliveryDays),
      paymentTerms: paymentTerms.trim() || undefined,
      warranty: warranty.trim() || undefined,
      remarks: remarks.trim() || undefined,
      items: quotedLines.map((line) => ({
        rfqItemId: line.rfqItemId,
        offeredQty: Number(line.offeredQty),
        unitRate: Number(line.unitRate),
        discountPct: Number(line.discountPct || 0),
        taxPct: Number(line.taxPct || 0),
        deliveryDays: line.deliveryDays === "" ? undefined : Number(line.deliveryDays),
        brandModel: line.brandModel.trim() || undefined,
        specification: line.specification.trim() || undefined,
        remarks: line.remarks.trim() || undefined,
      })),
    };

    const onError = (mutationError: unknown) => setError(mutationError instanceof Error ? mutationError.message : "Failed to save the quotation.");

    if (existing) {
      reviseMutation.mutate({ id: existing.id, payload }, { onSuccess: onDone, onError });
    } else {
      createMutation.mutate(payload, { onSuccess: onDone, onError });
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-biz-border bg-biz-bg p-4">
      <h4 className="text-[13px] font-semibold text-biz-text">
        {existing ? "Revise Quotation — " : "Record Quotation — "}
        {supplierLabel}
      </h4>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <FormField label="Quotation Ref." required>
          <TextInput value={quotationRef} onChange={(event) => setQuotationRef(event.target.value)} />
        </FormField>
        <FormField label="Quotation Date" required>
          <DateInput value={quotationDate} onChange={(event) => setQuotationDate(event.target.value)} />
        </FormField>
        <FormField label="Validity Date">
          <DateInput value={validityDate} onChange={(event) => setValidityDate(event.target.value)} />
        </FormField>
        <FormField label="Delivery Days">
          <TextInput type="number" min={0} value={deliveryDays} onChange={(event) => setDeliveryDays(event.target.value)} />
        </FormField>
        <FormField label="Payment Terms">
          <TextInput value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} />
        </FormField>
        <FormField label="Warranty">
          <TextInput value={warranty} onChange={(event) => setWarranty(event.target.value)} />
        </FormField>
      </div>

      <div className="overflow-x-auto rounded-lg border border-biz-border bg-biz-surface">
        <table className="w-full min-w-[1000px] text-left text-[13px]">
          <thead>
            <tr className="bg-biz-bg">
              <th className="px-3 py-2 font-medium text-biz-muted">Item</th>
              <th className="px-3 py-2 font-medium text-biz-muted">Requested</th>
              <th className="px-3 py-2 font-medium text-biz-muted">Quoted Qty</th>
              <th className="px-3 py-2 font-medium text-biz-muted">Unit Rate</th>
              <th className="px-3 py-2 font-medium text-biz-muted">Disc %</th>
              <th className="px-3 py-2 font-medium text-biz-muted">Tax %</th>
              <th className="px-3 py-2 font-medium text-biz-muted">Line Total</th>
              <th className="px-3 py-2 font-medium text-biz-muted">Delivery</th>
              <th className="px-3 py-2 font-medium text-biz-muted">Brand/Model</th>
              <th className="px-3 py-2 font-medium text-biz-muted">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.rfqItemId} className="border-t border-biz-border align-top">
                <td className="px-3 py-2 text-biz-text">
                  {line.itemLabel} <span className="text-[11px] text-biz-muted">({line.unit})</span>
                </td>
                <td className="px-3 py-2 text-biz-muted">{line.requestedQty}</td>
                <td className="px-3 py-2">
                  <TextInput className="h-9 w-24" type="number" step="0.001" min={0} value={line.offeredQty} onChange={(event) => patchLine(line.rfqItemId, { offeredQty: event.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <TextInput className="h-9 w-24" type="number" step="0.01" min={0} value={line.unitRate} onChange={(event) => patchLine(line.rfqItemId, { unitRate: event.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <TextInput className="h-9 w-20" type="number" step="0.01" min={0} value={line.discountPct} onChange={(event) => patchLine(line.rfqItemId, { discountPct: event.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <TextInput className="h-9 w-20" type="number" step="0.01" min={0} value={line.taxPct} onChange={(event) => patchLine(line.rfqItemId, { taxPct: event.target.value })} />
                </td>
                <td className="px-3 py-2 font-medium text-biz-text">{formatBDT(computeLineAmount(line))}</td>
                <td className="px-3 py-2">
                  <TextInput className="h-9 w-20" type="number" min={0} value={line.deliveryDays} onChange={(event) => patchLine(line.rfqItemId, { deliveryDays: event.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <TextInput className="h-9 w-32" value={line.brandModel} onChange={(event) => patchLine(line.rfqItemId, { brandModel: event.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <TextInput className="h-9 w-32" value={line.remarks} onChange={(event) => patchLine(line.rfqItemId, { remarks: event.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FormField label="Remarks">
        <TextInput value={remarks} onChange={(event) => setRemarks(event.target.value)} />
      </FormField>

      <p className="text-[12px] text-biz-muted">
        Preview total (client-side estimate only — the saved total is always computed by the server):{" "}
        <span className="font-semibold text-biz-text">{formatBDT(previewTotal)}</span>
      </p>

      {error && <p className="rounded-sm border border-biz-danger bg-biz-danger-soft px-4 py-3 text-[13px] text-biz-danger">{error}</p>}

      <div className="flex items-center justify-end gap-3">
        <SecondaryButton type="button" onClick={onCancel}>
          Cancel
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={isPending}>
          <Save className="h-4 w-4" />
          {isPending ? "Saving..." : existing ? "Save Revision" : "Save Quotation"}
        </PrimaryButton>
      </div>
    </form>
  );
}
