"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import {
  useBillableLines,
  useCreateSupplierBill,
  usePaymentTerms,
  usePurchaseOrders,
  useUpdateSupplierBill,
} from "@bizovix/api-client";
import { DateInput, FormField, PageHeader, PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { SupplierBillRecord } from "@bizovix/types";
import { formatQty } from "@/lib/procurement";

interface DraftLine {
  purchaseOrderItemId: string;
  itemName: string;
  unit: string;
  orderedQty: string;
  acceptedQty: string;
  previouslyBilledQty: string;
  remainingBillableQty: string;
  poRate: string;
  currentBilledQty: string;
  invoiceRate: string;
  discountAmount: string;
  remarks: string;
  include: boolean;
}

type EditableLine = Pick<DraftLine, "currentBilledQty" | "invoiceRate" | "discountAmount" | "remarks" | "include">;

interface DraftDeduction {
  key: string;
  type: string;
  code: string;
  amount: string;
  remarks: string;
}

interface SupplierBillFormProps {
  mode: "create" | "edit";
  bill?: SupplierBillRecord;
  /** Pre-selects the PO when the user arrived from a purchase order. */
  initialPurchaseOrderId?: string;
}

let deductionSeq = 0;

export function SupplierBillForm({ mode, bill, initialPurchaseOrderId }: SupplierBillFormProps) {
  const router = useRouter();
  const createMutation = useCreateSupplierBill();
  const updateMutation = useUpdateSupplierBill();
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Only POs that have actually been issued can carry a supplier invoice.
  const purchaseOrders = usePurchaseOrders({ limit: 100 });
  const paymentTerms = usePaymentTerms();

  const [purchaseOrderId, setPurchaseOrderId] = React.useState(bill?.purchaseOrderId ?? initialPurchaseOrderId ?? "");
  const billable = useBillableLines(purchaseOrderId || undefined);

  const [supplierInvoiceNo, setSupplierInvoiceNo] = React.useState(bill?.supplierInvoiceNo ?? "");
  const [supplierInvoiceDate, setSupplierInvoiceDate] = React.useState(bill?.supplierInvoiceDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [paymentTermId, setPaymentTermId] = React.useState(bill?.paymentTermId ?? "");
  const [dueDate, setDueDate] = React.useState(bill?.dueDate?.slice(0, 10) ?? "");
  const [remarks, setRemarks] = React.useState(bill?.remarks ?? "");
  const [error, setError] = React.useState<string | null>(null);

  /** Only the user-editable half of a row lives in state. The derived half (ordered/accepted/
   * billable/PO rate) is recomputed from the server payload during render, so the grid can never
   * hold a stale ceiling and no effect has to sync it. */
  const [edits, setEdits] = React.useState<Record<string, Partial<EditableLine>>>({});
  const [deductions, setDeductions] = React.useState<DraftDeduction[]>(
    () =>
      bill?.deductions
        .filter((deduction) => deduction.type !== "VAT" && deduction.type !== "AIT")
        .map((deduction) => ({
          key: `ded-${++deductionSeq}`,
          type: deduction.type,
          code: deduction.code ?? "",
          amount: deduction.amount,
          remarks: deduction.remarks ?? "",
        })) ?? [],
  );

  const lines: DraftLine[] = React.useMemo(() => {
    if (!billable.data) return [];
    return billable.data.items.map((item) => {
      // An existing bill is replaced rather than added to, so its own quantities go back onto
      // the ceiling it is being re-edited against.
      const existing = bill?.items.find((row) => row.purchaseOrderItemId === item.purchaseOrderItemId);
      const ownQty = existing ? Number(existing.currentBilledQty) : 0;
      const edit = edits[item.purchaseOrderItemId] ?? {};
      return {
        purchaseOrderItemId: item.purchaseOrderItemId,
        itemName: item.itemNameSnapshot,
        unit: item.unitSnapshot,
        orderedQty: item.orderedQty,
        acceptedQty: item.acceptedQty,
        previouslyBilledQty: (Number(item.previouslyBilledQty) - ownQty).toFixed(3),
        remainingBillableQty: (Number(item.remainingBillableQty) + ownQty).toFixed(3),
        poRate: item.poRate,
        currentBilledQty: edit.currentBilledQty ?? existing?.currentBilledQty ?? "",
        invoiceRate: edit.invoiceRate ?? existing?.invoiceRate ?? item.poRate,
        discountAmount: edit.discountAmount ?? existing?.discountAmount ?? "",
        remarks: edit.remarks ?? existing?.remarks ?? "",
        include: edit.include ?? Boolean(existing),
      };
    });
  }, [billable.data, bill, edits]);

  function patchLine(purchaseOrderItemId: string, patch: Partial<EditableLine>) {
    setEdits((prev) => ({ ...prev, [purchaseOrderItemId]: { ...prev[purchaseOrderItemId], ...patch } }));
  }

  const included = lines.filter((line) => line.include && Number(line.currentBilledQty || 0) > 0);
  const subtotalPreview = included.reduce((sum, line) => sum + Number(line.currentBilledQty || 0) * Number(line.invoiceRate || 0), 0);
  const discountPreview = included.reduce((sum, line) => sum + Number(line.discountAmount || 0), 0);
  const otherDeductionPreview = deductions.reduce((sum, deduction) => sum + Number(deduction.amount || 0), 0);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!purchaseOrderId) return setError("Select the purchase order this invoice bills against.");
    if (!supplierInvoiceNo.trim()) return setError("Supplier invoice number is required.");
    if (!included.length) return setError("Include at least one line with a billed quantity.");

    const overCeiling = included.find((line) => Number(line.currentBilledQty) > Number(line.remainingBillableQty));
    if (overCeiling) {
      return setError(
        `"${overCeiling.itemName}" cannot be billed for ${overCeiling.currentBilledQty} ${overCeiling.unit} — only ${overCeiling.remainingBillableQty} ${overCeiling.unit} has been accepted and not yet billed.`,
      );
    }

    const supplierId = billable.data?.supplier.id ?? bill?.supplierId;
    if (!supplierId) return setError("The selected purchase order has no supplier.");

    const payload = {
      supplierInvoiceNo: supplierInvoiceNo.trim(),
      supplierInvoiceDate,
      supplierId,
      purchaseOrderId,
      paymentTermId: paymentTermId || undefined,
      dueDate: dueDate || undefined,
      remarks: remarks.trim() || undefined,
      items: included.map((line) => ({
        purchaseOrderItemId: line.purchaseOrderItemId,
        currentBilledQty: Number(line.currentBilledQty),
        invoiceRate: Number(line.invoiceRate || 0),
        discountAmount: line.discountAmount === "" ? undefined : Number(line.discountAmount),
        remarks: line.remarks.trim() || undefined,
      })),
      otherDeductions: deductions
        .filter((deduction) => deduction.type.trim() && Number(deduction.amount || 0) > 0)
        .map((deduction) => ({
          type: deduction.type.trim(),
          code: deduction.code.trim() || undefined,
          amount: Number(deduction.amount),
          remarks: deduction.remarks.trim() || undefined,
        })),
    };

    const onError = (mutationError: unknown) =>
      setError(mutationError instanceof Error ? mutationError.message : "Failed to save the supplier bill.");

    if (mode === "create") {
      createMutation.mutate(payload, { onSuccess: (record) => router.push("/procurement/supplier-bills/" + record.id), onError });
    } else if (bill) {
      updateMutation.mutate({ id: bill.id, payload }, { onSuccess: () => router.push("/procurement/supplier-bills/" + bill.id), onError });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={mode === "create" ? "New Supplier Bill" : "Edit " + (bill?.billNo ?? "Supplier Bill")}
        subtitle="Record a supplier invoice against a purchase order. Quantities are capped by what has actually been accepted on a GRN."
      />

      <form onSubmit={submit} className="flex flex-col gap-6">
        <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <FormField label="Purchase Order" required>
              <SelectInput
                placeholder="Select purchase order..."
                value={purchaseOrderId}
                disabled={mode === "edit"}
                onChange={(event) => setPurchaseOrderId(event.target.value)}
                options={(purchaseOrders.data?.items ?? [])
                  .filter((order) => ["ISSUED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"].includes(order.status))
                  .map((order) => ({ value: order.id, label: `${order.poNo} — ${order.supplier.name}` }))}
              />
            </FormField>
            <FormField label="Supplier">
              <TextInput value={billable.data?.supplier.name ?? bill?.supplier.name ?? "—"} readOnly disabled />
            </FormField>
            <FormField label="Project">
              <TextInput value={billable.data?.cmsWork?.workName ?? bill?.cmsWork?.workName ?? "General procurement"} readOnly disabled />
            </FormField>
            <FormField label="Supplier Invoice No." required helper="Must be unique for this supplier">
              <TextInput value={supplierInvoiceNo} onChange={(event) => setSupplierInvoiceNo(event.target.value)} />
            </FormField>
            <FormField label="Invoice Date" required>
              <DateInput value={supplierInvoiceDate} onChange={(event) => setSupplierInvoiceDate(event.target.value)} />
            </FormField>
            <FormField label="Payment Term">
              <SelectInput
                placeholder="None"
                value={paymentTermId}
                onChange={(event) => setPaymentTermId(event.target.value)}
                options={(paymentTerms.data ?? []).map((term) => ({ value: term.id, label: term.name }))}
              />
            </FormField>
            <FormField label="Due Date">
              <DateInput value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
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
            <h3 className="text-[15px] font-semibold text-biz-text">Invoice Lines</h3>
            <p className="text-[11px] text-biz-muted">Billable quantity is capped at Accepted (GRN) minus Previously Billed.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-[13px]">
              <thead>
                <tr className="bg-biz-bg">
                  <th className="px-3 py-2.5 font-medium text-biz-muted">Bill</th>
                  <th className="px-3 py-2.5 font-medium text-biz-muted">Item</th>
                  <th className="px-3 py-2.5 font-medium text-biz-muted">Unit</th>
                  <th className="px-3 py-2.5 font-medium text-biz-muted">Ordered</th>
                  <th className="px-3 py-2.5 font-medium text-biz-muted">Accepted</th>
                  <th className="px-3 py-2.5 font-medium text-biz-muted">Prev. Billed</th>
                  <th className="px-3 py-2.5 font-medium text-biz-muted">Billable</th>
                  <th className="px-3 py-2.5 font-medium text-biz-muted">Bill Qty</th>
                  <th className="px-3 py-2.5 font-medium text-biz-muted">PO Rate</th>
                  <th className="px-3 py-2.5 font-medium text-biz-muted">Invoice Rate</th>
                  <th className="px-3 py-2.5 font-medium text-biz-muted">Discount</th>
                  <th className="px-3 py-2.5 font-medium text-biz-muted">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {!purchaseOrderId ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-biz-muted">
                      Select a purchase order to load its billable lines.
                    </td>
                  </tr>
                ) : billable.isLoading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-biz-muted">
                      Loading billable lines...
                    </td>
                  </tr>
                ) : lines.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-biz-muted">
                      This purchase order has no lines.
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => {
                    const billQty = Number(line.currentBilledQty || 0);
                    const ceiling = Number(line.remainingBillableQty);
                    const overCeiling = billQty > ceiling;
                    const rateVariance = Number(line.invoiceRate || 0) !== Number(line.poRate);
                    return (
                      <tr key={line.purchaseOrderItemId} className="border-t border-biz-border">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`Include ${line.itemName}`}
                            checked={line.include}
                            onChange={(event) => patchLine(line.purchaseOrderItemId, { include: event.target.checked })}
                          />
                        </td>
                        <td className="px-3 py-2 text-biz-text">{line.itemName}</td>
                        <td className="px-3 py-2 text-biz-muted">{line.unit}</td>
                        <td className="px-3 py-2 text-biz-muted">{formatQty(line.orderedQty)}</td>
                        <td className="px-3 py-2 text-biz-text">{formatQty(line.acceptedQty)}</td>
                        <td className="px-3 py-2 text-biz-muted">{formatQty(line.previouslyBilledQty)}</td>
                        <td className="px-3 py-2 font-medium text-biz-text">{formatQty(line.remainingBillableQty)}</td>
                        <td className="px-3 py-2">
                          <TextInput
                            className={overCeiling ? "h-9 w-24 border-biz-danger" : "h-9 w-24"}
                            type="number"
                            step="0.001"
                            min={0}
                            disabled={!line.include}
                            value={line.currentBilledQty}
                            onChange={(event) => patchLine(line.purchaseOrderItemId, { currentBilledQty: event.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 text-biz-muted">{formatBDT(line.poRate)}</td>
                        <td className="px-3 py-2">
                          <TextInput
                            className={rateVariance ? "h-9 w-28 border-biz-warning" : "h-9 w-28"}
                            type="number"
                            step="0.01"
                            min={0}
                            disabled={!line.include}
                            value={line.invoiceRate}
                            onChange={(event) => patchLine(line.purchaseOrderItemId, { invoiceRate: event.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <TextInput
                            className="h-9 w-24"
                            type="number"
                            step="0.01"
                            min={0}
                            disabled={!line.include}
                            value={line.discountAmount}
                            onChange={(event) => patchLine(line.purchaseOrderItemId, { discountAmount: event.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-biz-text">
                          {formatBDT(billQty * Number(line.invoiceRate || 0) - Number(line.discountAmount || 0))}
                          {overCeiling && <span className="ml-2 text-[11px] font-semibold text-biz-danger">over billable</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
          <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
            <div>
              <h3 className="text-[15px] font-semibold text-biz-text">Other Deductions</h3>
              <p className="mt-0.5 text-[11px] text-biz-muted">VAT and AIT come from the organisation&apos;s configured rates and are applied by the backend.</p>
            </div>
            <SecondaryButton
              type="button"
              onClick={() => setDeductions((prev) => [...prev, { key: `ded-${++deductionSeq}`, type: "", code: "", amount: "", remarks: "" }])}
            >
              <Plus className="h-4 w-4" />
              Add Deduction
            </SecondaryButton>
          </div>
          {deductions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead>
                  <tr className="bg-biz-bg">
                    <th className="px-4 py-2.5 font-medium text-biz-muted">Type</th>
                    <th className="px-4 py-2.5 font-medium text-biz-muted">Code</th>
                    <th className="px-4 py-2.5 font-medium text-biz-muted">Amount</th>
                    <th className="px-4 py-2.5 font-medium text-biz-muted">Remarks</th>
                    <th className="px-4 py-2.5 font-medium text-biz-muted">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deductions.map((deduction) => (
                    <tr key={deduction.key} className="border-t border-biz-border">
                      <td className="px-4 py-2">
                        <TextInput
                          className="h-9"
                          placeholder="e.g. Retention"
                          value={deduction.type}
                          onChange={(event) => setDeductions((prev) => prev.map((row) => (row.key === deduction.key ? { ...row, type: event.target.value } : row)))}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <TextInput
                          className="h-9"
                          value={deduction.code}
                          onChange={(event) => setDeductions((prev) => prev.map((row) => (row.key === deduction.key ? { ...row, code: event.target.value } : row)))}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <TextInput
                          className="h-9 w-32"
                          type="number"
                          step="0.01"
                          min={0}
                          value={deduction.amount}
                          onChange={(event) => setDeductions((prev) => prev.map((row) => (row.key === deduction.key ? { ...row, amount: event.target.value } : row)))}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <TextInput
                          className="h-9"
                          value={deduction.remarks}
                          onChange={(event) => setDeductions((prev) => prev.map((row) => (row.key === deduction.key ? { ...row, remarks: event.target.value } : row)))}
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          type="button"
                          aria-label="Remove deduction"
                          className="text-biz-danger hover:opacity-70"
                          onClick={() => setDeductions((prev) => prev.filter((row) => row.key !== deduction.key))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-col items-end gap-1 border-t border-biz-border px-4 py-3 text-[13px]">
            <span className="text-biz-muted">
              Subtotal (preview): <span className="font-semibold text-biz-text">{formatBDT(subtotalPreview)}</span>
            </span>
            <span className="text-biz-muted">
              Discount (preview): <span className="font-semibold text-biz-text">{formatBDT(discountPreview)}</span>
            </span>
            <span className="text-biz-muted">
              Other deductions (preview): <span className="font-semibold text-biz-text">{formatBDT(otherDeductionPreview)}</span>
            </span>
            <span className="mt-1 text-[11px] text-biz-muted">VAT, AIT and the final net payable are calculated and stored by the backend on save.</span>
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
