"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Save, Trash2 } from "lucide-react";
import { useBillPreparation, useCreateProjectBill, useUpdateProjectBill, usePreviewProjectBill, useSubmitProjectBill, useMe } from "@bizovix/api-client";
import {
  CurrencyInput,
  DateInput,
  FormField,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  TextInput,
} from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { BillAdjustmentInput, BillPreparation, BillPreparationItem, ProjectBillRecord, SaveProjectBillInput } from "@bizovix/types";
import { Modal } from "@/components/layout/Modal";
import { ADJUSTMENT_TYPE_OPTIONS, BILL_TYPE_OPTIONS } from "@/lib/project-bills";

interface DraftItem {
  key: string;
  boqItemId: string;
  description: string;
  unit: string;
  contractQty: number;
  previousQty: number;
  rate: number;
  currentQty: string;
}

interface DraftAdjustment {
  key: string;
  type: string;
  direction: "ADDITION" | "DEDUCTION";
  description: string;
  amount: string;
}

interface BillFormProps {
  mode: "create" | "edit";
  cmsWorkId: string;
  bill?: ProjectBillRecord;
}

export function BillForm({ mode, cmsWorkId, bill }: BillFormProps) {
  const preparation = useBillPreparation(cmsWorkId, bill?.id);
  if (preparation.isLoading) return <p className="p-8 text-center text-biz-muted">Loading Contract & BOQ…</p>;
  if (!preparation.data) return <div className="space-y-3 p-8 text-center text-biz-muted"><p>Could not load the project billing data.</p><button className="text-biz-blue" onClick={() => void preparation.refetch()}>Retry</button></div>;
  return <PreparedBillForm key={`${cmsWorkId}-${bill?.id ?? "new"}`} mode={mode} cmsWorkId={cmsWorkId} bill={bill} preparation={preparation.data} />;
}

function asDraftItem(item: BillPreparationItem): DraftItem {
  return { key: item.id, boqItemId: item.id, description: item.description, unit: item.unit, contractQty: Number(item.contractQty), previousQty: Number(item.previousQty), rate: Number(item.unitRate), currentQty: "" };
}

function PreparedBillForm({ mode, cmsWorkId, bill, preparation }: BillFormProps & { preparation: BillPreparation }) {
  const router = useRouter();
  const me = useMe();
  const createBill = useCreateProjectBill();
  const updateBill = useUpdateProjectBill();
  const previewBill = usePreviewProjectBill(bill?.id);
  const submitBill = useSubmitProjectBill();
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [reviewPayload, setReviewPayload] = React.useState<SaveProjectBillInput | null>(null);
  const [validationAttempted, setValidationAttempted] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");
  const formRef = React.useRef<HTMLFormElement>(null);
  const savingRef = React.useRef(false);
  const isPending = createBill.isPending || updateBill.isPending || submitBill.isPending;
  const [contractId, setContractId] = React.useState(bill?.contractId ?? preparation.contracts.find((c) => c.status === "ACTIVE" && c.currency === "BDT")?.id ?? "");
  const contract = preparation.contracts.find((c) => c.id === contractId);
  const canBill = preparation.ready && contract?.status === "ACTIVE" && contract.currency === "BDT";

  const [billType, setBillType] = React.useState(bill?.billType ?? "RUNNING");
  const [billDate, setBillDate] = React.useState(bill?.billDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [periodFrom, setPeriodFrom] = React.useState(bill?.periodFrom?.slice(0, 10) ?? "");
  const [periodTo, setPeriodTo] = React.useState(bill?.periodTo?.slice(0, 10) ?? "");
  const [clientCertificateRef, setClientCertificateRef] = React.useState(bill?.clientCertificateRef ?? "");
  const [measurementBookRef, setMeasurementBookRef] = React.useState(bill?.measurementBookRef ?? "");
  const [remarks, setRemarks] = React.useState(bill?.remarks ?? "");
  const [retentionPctOverride, setRetentionPctOverride] = React.useState(bill?.retentionPct ?? "");

  const [items, setItems] = React.useState<DraftItem[]>(() =>
    bill ? bill.items.map((i) => ({
      key: i.id,
      boqItemId: i.boqItemId,
      description: i.description,
      unit: i.unit,
      contractQty: Number(i.contractQty),
      previousQty: Number(i.previousQty),
      rate: Number(i.approvedRate),
      currentQty: i.currentQty,
    })) : preparation.items.filter((item) => Number(item.remainingQty) > 0).map(asDraftItem),
  );
  const [adjustments, setAdjustments] = React.useState<DraftAdjustment[]>(() =>
    (bill?.adjustments ?? []).map((a) => ({
      key: a.id,
      type: a.type,
      direction: a.direction,
      description: a.description ?? "",
      amount: a.amount,
    })),
  );

  const availableBoqItems = preparation.items.filter((b) => Number(b.remainingQty) > 0 && !items.some((i) => i.boqItemId === b.id));

  function addItem(boqItemId: string) {
    const boqItem = preparation.items.find((b) => b.id === boqItemId);
    if (!boqItem) return;
    setItems((prev) => [
      ...prev,
      asDraftItem(boqItem),
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function addAdjustment() {
    setAdjustments((prev) => [
      ...prev,
      { key: crypto.randomUUID(), type: ADJUSTMENT_TYPE_OPTIONS[0]!.value, direction: "ADDITION", description: "", amount: "0" },
    ]);
  }

  function removeAdjustment(key: string) {
    setAdjustments((prev) => prev.filter((a) => a.key !== key));
  }

  const displayItems = items.map((item) => {
    const current = preparation.items.find((boqItem) => boqItem.id === item.boqItemId);
    return { ...item, ...(current ? { description: current.description, unit: current.unit, contractQty: Number(current.contractQty), previousQty: Number(current.previousQty), rate: Number(current.unitRate) } : {}), pendingQty: Number(current?.pendingQty ?? 0), remainingQty: Number(current?.remainingQty ?? 0) };
  });
  const grossPreview = displayItems.reduce((sum, i) => sum + Number(i.currentQty || 0) * i.rate, 0);

  function payload() {
    return {
      contractId,
      billType,
      billDate,
      periodFrom: periodFrom || undefined,
      periodTo: periodTo || undefined,
      clientCertificateRef: clientCertificateRef || undefined,
      measurementBookRef: measurementBookRef || undefined,
      remarks: remarks || undefined,
      retentionPctOverride: retentionPctOverride ? Number(retentionPctOverride) : undefined,
      items: items.filter((i) => Number(i.currentQty) > 0).map((i) => ({ boqItemId: i.boqItemId, currentQty: Number(i.currentQty) })),
      adjustments: adjustments.map(
        (a): BillAdjustmentInput => ({
          type: a.type,
          direction: a.direction,
          description: a.description || undefined,
          calculationType: "FIXED_AMOUNT",
          amount: Number(a.amount || 0),
        }),
      ),
    };

  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canBill) return;
    setValidationAttempted(true);
    const invalid = displayItems.find((item) => !Number.isFinite(Number(item.currentQty)) || Number(item.currentQty) < 0 || Number(item.currentQty) > item.remainingQty);
    if (invalid || !items.some((item) => Number(item.currentQty) > 0)) {
      const input = invalid ? formRef.current?.querySelector<HTMLInputElement>(`[data-bill-quantity="${invalid.key}"]`) : formRef.current?.querySelector<HTMLInputElement>("[data-bill-quantity]");
      input?.focus(); input?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setSaveError("");
    previewBill.mutate(payload(), { onSuccess: (_result, reviewed) => { setReviewPayload(reviewed); setReviewOpen(true); } });
  }

  async function save(andSubmit: boolean) {
    if (savingRef.current || !reviewPayload) return;
    savingRef.current = true;
    setSaveError("");
    try {
      const record = mode === "edit" && bill
        ? await updateBill.mutateAsync({ id: bill.id, payload: reviewPayload })
        : await createBill.mutateAsync(reviewPayload);
      if (andSubmit) {
        try { await submitBill.mutateAsync(record.id); }
        catch { router.push(`/cms/bills/${record.id}?submissionFailed=1`); return; }
      }
      router.push(`/cms/bills/${record.id}`);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not save bill. Please retry."); }
    finally { savingRef.current = false; }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={mode === "create" ? "Add Running Bill / IPC" : "Edit Running Bill / IPC"}
        subtitle={preparation.work.workName}
      />
      <Link href="/cms/documentation/bill-submission" className="text-xs font-semibold text-biz-blue">← Back to Bill Submission</Link>
      {!canBill && <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{preparation.reason ?? "Select an active BDT contract before billing."} <Link href={`/cms/ongoing-works/${cmsWorkId}/boq`} className="underline">Review Contract BOQ</Link></div>}
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <FormField label="Contract" required>
              <SelectInput value={contractId} onChange={(e) => setContractId(e.target.value)} options={preparation.contracts.map((c) => ({ value: c.id, label: `${c.contractNo} (${c.status})` }))} />
            </FormField>
            <FormField label="Bill Type" required>
              <SelectInput options={BILL_TYPE_OPTIONS} value={billType} onChange={(e) => setBillType(e.target.value as typeof billType)} />
            </FormField>
            <FormField label="Bill Date" required>
              <DateInput required value={billDate} onChange={(e) => setBillDate(e.target.value)} />
            </FormField>
            <FormField label="Billing Period From">
              <DateInput value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            </FormField>
            <FormField label="Billing Period To">
              <DateInput value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
            </FormField>
            <FormField label="Retention % Override" helper="Defaults to the contract's retention %">
              <TextInput type="number" step="0.01" placeholder="Optional" value={retentionPctOverride} onChange={(e) => setRetentionPctOverride(e.target.value)} />
            </FormField>
            <FormField label="Client Certificate / IPC Reference">
              <TextInput placeholder="Optional" value={clientCertificateRef} onChange={(e) => setClientCertificateRef(e.target.value)} />
            </FormField>
            <FormField label="Measurement Book Reference">
              <TextInput placeholder="Optional" value={measurementBookRef} onChange={(e) => setMeasurementBookRef(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Remarks">
            <textarea
              rows={2}
              className="w-full rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </FormField>
        </div>

        <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-biz-border px-4 py-3">
            <div><h3 className="text-[15px] font-semibold text-biz-text">Contract BOQ Items</h3><p className="mt-1 text-xs text-biz-muted">Enter only the quantity to bill now. Leave unused rows blank.</p></div>
            <div className="w-full sm:w-64">
              <SelectInput
                placeholder="Add BOQ item..."
                value=""
                onChange={(e) => e.target.value && addItem(e.target.value)}
                options={availableBoqItems.map((b) => ({ value: b.id, label: `${b.itemCode ?? ""} ${b.description}`.trim() }))}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="bill-intake-table w-full table-fixed text-left text-[11px] [&_th]:px-2 [&_td]:px-2">
              <thead>
                <tr className="bg-biz-bg">
                  <th className="w-[20%] px-4 py-2.5 font-medium text-biz-muted">Description</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Unit</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Contract Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Previous Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Pending Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Available Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Current Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Cumulative Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Rate</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Current Value</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-biz-muted">
                      Add a BOQ item to start billing.
                    </td>
                  </tr>
                ) : (
                  displayItems.map((item) => {
                    const cumulativeQty = item.previousQty + Number(item.currentQty || 0);
                    const overLimit = Number(item.currentQty) > item.remainingQty || Number(item.currentQty) < 0;
                    const missingQuantity = validationAttempted && !items.some((row) => Number(row.currentQty) > 0);
                    return (
                      <tr key={item.key} className="border-t border-biz-border">
                        <td data-label="Product / Work" className="break-words px-4 py-2 text-biz-text">{item.description}</td>
                        <td data-label="Unit" className="px-4 py-2 text-biz-muted">{item.unit}</td>
                        <td data-label="Contract Qty" className="px-4 py-2 text-biz-muted">{item.contractQty}</td>
                        <td data-label="Previous Qty" className="px-4 py-2 text-biz-muted">{item.previousQty}</td>
                        <td data-label="Pending Qty" className="px-4 py-2 text-biz-muted">{item.pendingQty}</td>
                        <td data-label="Available Qty" className="px-4 py-2 font-semibold">{item.remainingQty}</td>
                        <td data-label="Current Qty" className="px-4 py-2">
                          <TextInput
                            type="number"
                            step="0.001"
                            min={0}
                            max={item.remainingQty}
                            aria-label={`Current quantity for ${item.description}`}
                            data-bill-quantity={item.key}
                            aria-invalid={overLimit || missingQuantity}
                            className={`min-w-0 px-1 ${overLimit || missingQuantity ? "border-biz-danger bg-red-50" : ""}`}
                            value={item.currentQty}
                            onChange={(e) =>
                              setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, currentQty: e.target.value } : i)))
                            }
                          />
                        </td>
                        <td data-label="Cumulative Qty" className={overLimit ? "px-4 py-2 font-semibold text-biz-danger" : "px-4 py-2 text-biz-text"}>
                          {cumulativeQty.toFixed(3)}
                          {overLimit && " (exceeds BOQ qty)"}
                        </td>
                        <td data-label="Billing Rate" className="px-4 py-2 text-biz-muted">{formatBDT(item.rate)}</td>
                        <td data-label="Current Value" className="px-4 py-2 font-medium text-biz-text">{formatBDT(Number(item.currentQty || 0) * item.rate)}</td>
                        <td data-label="Remove" className="px-4 py-2 text-center">
                          <button type="button" onClick={() => removeItem(item.key)} className="text-biz-danger hover:opacity-70" aria-label="Remove item">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end border-t border-biz-border px-4 py-3 text-[13px] font-semibold text-biz-text">
            Gross Work Value (preview): {formatBDT(grossPreview)}
          </div>
        </section>

        <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
          <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
            <h3 className="text-[15px] font-semibold text-biz-text">Adjustments</h3>
            <SecondaryButton type="button" onClick={addAdjustment}>
              <Plus className="h-4 w-4" />
              Add Adjustment
            </SecondaryButton>
          </div>
          {adjustments.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <thead>
                  <tr className="bg-biz-bg">
                    <th className="px-4 py-2.5 font-medium text-biz-muted">Type</th>
                    <th className="px-4 py-2.5 font-medium text-biz-muted">Direction</th>
                    <th className="px-4 py-2.5 font-medium text-biz-muted">Description</th>
                    <th className="px-4 py-2.5 font-medium text-biz-muted">Amount</th>
                    <th className="px-4 py-2.5 font-medium text-biz-muted">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((adj) => (
                    <tr key={adj.key} className="border-t border-biz-border">
                      <td className="px-4 py-2">
                        <SelectInput
                          options={ADJUSTMENT_TYPE_OPTIONS}
                          value={adj.type}
                          onChange={(e) => setAdjustments((prev) => prev.map((a) => (a.key === adj.key ? { ...a, type: e.target.value } : a)))}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <SelectInput
                          options={[
                            { label: "Addition", value: "ADDITION" },
                            { label: "Deduction", value: "DEDUCTION" },
                          ]}
                          value={adj.direction}
                          onChange={(e) =>
                            setAdjustments((prev) =>
                              prev.map((a) => (a.key === adj.key ? { ...a, direction: e.target.value as "ADDITION" | "DEDUCTION" } : a)),
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <TextInput
                          placeholder="Optional"
                          value={adj.description}
                          onChange={(e) => setAdjustments((prev) => prev.map((a) => (a.key === adj.key ? { ...a, description: e.target.value } : a)))}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <CurrencyInput
                          value={adj.amount}
                          onChange={(e) => setAdjustments((prev) => prev.map((a) => (a.key === adj.key ? { ...a, amount: e.target.value } : a)))}
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button type="button" onClick={() => removeAdjustment(adj.key)} className="text-biz-danger hover:opacity-70" aria-label="Remove adjustment">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {(createBill.isError || updateBill.isError || previewBill.isError) && (
          <p className="text-[13px] text-biz-danger">
            {previewBill.error?.message || createBill.error?.message || updateBill.error?.message || "Could not prepare bill. Please try again."}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <SecondaryButton type="button" onClick={() => router.back()}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isPending || previewBill.isPending || !canBill || items.length === 0}>
            <Save className="h-4 w-4" />
            {previewBill.isPending ? "Calculating..." : "Preview Bill"}
          </PrimaryButton>
        </div>
      </form>
      <Modal open={reviewOpen} onClose={() => { if (!isPending) setReviewOpen(false); }} title="Bill Preview" contentClassName="max-h-[90dvh] overflow-y-auto">
        <p className="mb-3 text-xs text-biz-muted">{contract?.contractNo} · {reviewPayload?.items.length ?? 0} {(reviewPayload?.items.length ?? 0) === 1 ? "item" : "items"}</p>
        {previewBill.data && <dl className="divide-y divide-biz-border text-sm">{([
          ["Gross Bill", previewBill.data.grossBillAmount], ["Retention", previewBill.data.retentionAmount], ["VAT", previewBill.data.vatAmount], ["Tax / AIT", previewBill.data.aitAmount], ["Other Deductions", previewBill.data.otherDeductionAmount], ["Net Amount", previewBill.data.netCertifiedAmount],
        ] as const).map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-2 last:font-bold"><dt>{label}</dt><dd>{formatBDT(value)}</dd></div>)}</dl>}
        {saveError && <p role="alert" className="mt-3 text-xs text-biz-danger">{saveError}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <SecondaryButton onClick={() => setReviewOpen(false)} disabled={isPending}>Back</SecondaryButton>
          {me.data?.permissions.includes(mode === "create" ? "project_bill.create" : "project_bill.update") && <SecondaryButton onClick={() => void save(false)} disabled={isPending}>Save Draft</SecondaryButton>}
          {me.data?.permissions.includes("project_bill.submit") && me.data.permissions.includes(mode === "create" ? "project_bill.create" : "project_bill.update") && <PrimaryButton onClick={() => void save(true)} disabled={isPending}>{isPending ? "Saving…" : "Save & Submit"}</PrimaryButton>}
        </div>
      </Modal>
      <style jsx>{`
        @media (max-width: 1279px) {
          .bill-intake-table, .bill-intake-table tbody { display: block; }
          .bill-intake-table thead { display: none; }
          .bill-intake-table tbody tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 12px; }
          .bill-intake-table td { display: block; min-width: 0; text-align: left; font-size: 12px; }
          .bill-intake-table td:first-child { grid-column: 1 / -1; font-weight: 600; }
          .bill-intake-table td::before { content: attr(data-label); display: block; color: #6b7c96; font-size: 10px; font-weight: 400; margin-bottom: 4px; }
        }
      `}</style>
    </div>
  );
}
