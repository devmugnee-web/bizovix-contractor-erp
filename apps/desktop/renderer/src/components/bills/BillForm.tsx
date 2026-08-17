"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { useContracts, useCreateProjectBill, useProjectBoq, useUpdateProjectBill } from "@bizovix/api-client";
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
import type { BillAdjustmentInput, ProjectBillRecord } from "@bizovix/types";
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
  const router = useRouter();
  const contracts = useContracts({ cmsWorkId, limit: 1 });
  const boq = useProjectBoq(cmsWorkId);
  const createBill = useCreateProjectBill();
  const updateBill = useUpdateProjectBill();
  const isPending = createBill.isPending || updateBill.isPending;

  const contract = contracts.data?.items[0];

  const [billType, setBillType] = React.useState(bill?.billType ?? "RUNNING");
  const [billDate, setBillDate] = React.useState(bill?.billDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [periodFrom, setPeriodFrom] = React.useState(bill?.periodFrom?.slice(0, 10) ?? "");
  const [periodTo, setPeriodTo] = React.useState(bill?.periodTo?.slice(0, 10) ?? "");
  const [clientCertificateRef, setClientCertificateRef] = React.useState(bill?.clientCertificateRef ?? "");
  const [measurementBookRef, setMeasurementBookRef] = React.useState(bill?.measurementBookRef ?? "");
  const [remarks, setRemarks] = React.useState(bill?.remarks ?? "");
  const [retentionPctOverride, setRetentionPctOverride] = React.useState(bill?.retentionPct ?? "");

  const [items, setItems] = React.useState<DraftItem[]>(() =>
    (bill?.items ?? []).map((i) => ({
      key: i.id,
      boqItemId: i.boqItemId,
      description: i.description,
      unit: i.unit,
      contractQty: Number(i.contractQty),
      previousQty: Number(i.previousQty),
      rate: Number(i.approvedRate),
      currentQty: i.currentQty,
    })),
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

  const availableBoqItems = (boq.data ?? []).filter((b) => !items.some((i) => i.boqItemId === b.id));

  function addItem(boqItemId: string) {
    const boqItem = (boq.data ?? []).find((b) => b.id === boqItemId);
    if (!boqItem) return;
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        boqItemId: boqItem.id,
        description: boqItem.description,
        unit: boqItem.unit,
        contractQty: Number(boqItem.contractQty),
        previousQty: Number(boqItem.executedQty),
        rate: Number(boqItem.unitRate),
        currentQty: "0",
      },
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

  const grossPreview = items.reduce((sum, i) => sum + Number(i.currentQty || 0) * i.rate, 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contract) return;
    const payload = {
      contractId: contract.id,
      billType,
      billDate,
      periodFrom: periodFrom || undefined,
      periodTo: periodTo || undefined,
      clientCertificateRef: clientCertificateRef || undefined,
      measurementBookRef: measurementBookRef || undefined,
      remarks: remarks || undefined,
      retentionPctOverride: retentionPctOverride ? Number(retentionPctOverride) : undefined,
      items: items.map((i) => ({ boqItemId: i.boqItemId, currentQty: Number(i.currentQty || 0) })),
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

    if (mode === "create") {
      createBill.mutate(payload, { onSuccess: (record) => router.push(`/cms/bills/${record.id}`) });
    } else if (bill) {
      updateBill.mutate({ id: bill.id, payload }, { onSuccess: () => router.push(`/cms/bills/${bill.id}`) });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={mode === "create" ? "Add Running Bill / IPC" : "Edit Running Bill / IPC"}
        subtitle="Manage project billing, certification, deductions and receivables."
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <FormField label="Contract" required>
              <TextInput value={contract?.contractNo ?? "Loading..."} readOnly disabled />
            </FormField>
            <FormField label="Bill Type" required>
              <SelectInput options={BILL_TYPE_OPTIONS} value={billType} onChange={(e) => setBillType(e.target.value as typeof billType)} />
            </FormField>
            <FormField label="Bill Date" required>
              <DateInput value={billDate} onChange={(e) => setBillDate(e.target.value)} />
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
          <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
            <h3 className="text-[15px] font-semibold text-biz-text">BOQ Items</h3>
            <div className="w-64">
              <SelectInput
                placeholder="Add BOQ item..."
                value=""
                onChange={(e) => e.target.value && addItem(e.target.value)}
                options={availableBoqItems.map((b) => ({ value: b.id, label: `${b.itemCode ?? ""} ${b.description}`.trim() }))}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead>
                <tr className="bg-biz-bg">
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Description</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Unit</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Contract Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Previous Qty</th>
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
                    <td colSpan={9} className="px-4 py-8 text-center text-biz-muted">
                      Add a BOQ item to start billing.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const cumulativeQty = item.previousQty + Number(item.currentQty || 0);
                    const overLimit = cumulativeQty > item.contractQty;
                    return (
                      <tr key={item.key} className="border-t border-biz-border">
                        <td className="px-4 py-2 text-biz-text">{item.description}</td>
                        <td className="px-4 py-2 text-biz-muted">{item.unit}</td>
                        <td className="px-4 py-2 text-biz-muted">{item.contractQty}</td>
                        <td className="px-4 py-2 text-biz-muted">{item.previousQty}</td>
                        <td className="px-4 py-2">
                          <TextInput
                            type="number"
                            step="0.001"
                            min={0}
                            className={overLimit ? "border-biz-danger" : undefined}
                            value={item.currentQty}
                            onChange={(e) =>
                              setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, currentQty: e.target.value } : i)))
                            }
                          />
                        </td>
                        <td className={overLimit ? "px-4 py-2 font-semibold text-biz-danger" : "px-4 py-2 text-biz-text"}>
                          {cumulativeQty.toFixed(3)}
                          {overLimit && " (exceeds BOQ qty)"}
                        </td>
                        <td className="px-4 py-2 text-biz-muted">{formatBDT(item.rate)}</td>
                        <td className="px-4 py-2 font-medium text-biz-text">{formatBDT(Number(item.currentQty || 0) * item.rate)}</td>
                        <td className="px-4 py-2 text-center">
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

        {(createBill.isError || updateBill.isError) && (
          <p className="text-[13px] text-biz-danger">
            {(createBill.error as Error)?.message || (updateBill.error as Error)?.message || "Failed to save bill. Please try again."}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <SecondaryButton type="button" onClick={() => router.back()}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isPending || !contract || items.length === 0}>
            <Save className="h-4 w-4" />
            {isPending ? "Saving..." : "Save Draft"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
