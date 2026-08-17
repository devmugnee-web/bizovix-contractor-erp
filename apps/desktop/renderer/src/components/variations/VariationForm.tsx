"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { useContracts, useCreateVariationOrder, useProjectBoq } from "@bizovix/api-client";
import { DateInput, FormField, PageHeader, PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { VariationItemInput, VariationType } from "@bizovix/types";
import { VARIATION_TYPE_OPTIONS } from "@/lib/variations";

interface DraftItem {
  key: string;
  boqItemId?: string;
  itemCode: string;
  description: string;
  unit: string;
  originalQty?: number;
  originalRate?: number;
  revisedQty: string;
  revisedRate: string;
}

export function VariationForm({ cmsWorkId }: { cmsWorkId: string }) {
  const router = useRouter();
  const contracts = useContracts({ cmsWorkId, limit: 1 });
  const contract = contracts.data?.items[0];
  const boq = useProjectBoq(cmsWorkId);
  const createVariation = useCreateVariationOrder();

  const [variationType, setVariationType] = React.useState<VariationType>("ADDITION");
  const [title, setTitle] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [requestDate, setRequestDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = React.useState<DraftItem[]>([]);

  const availableBoqItems = (boq.data ?? []).filter((b) => !items.some((i) => i.boqItemId === b.id));

  function addExistingItem(boqItemId: string) {
    const boqItem = (boq.data ?? []).find((b) => b.id === boqItemId);
    if (!boqItem) return;
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        boqItemId: boqItem.id,
        itemCode: boqItem.itemCode ?? "",
        description: boqItem.description,
        unit: boqItem.unit,
        originalQty: Number(boqItem.contractQty),
        originalRate: Number(boqItem.unitRate),
        revisedQty: boqItem.contractQty,
        revisedRate: boqItem.unitRate,
      },
    ]);
  }

  function addNewItem() {
    setItems((prev) => [
      ...prev,
      { key: crypto.randomUUID(), itemCode: "", description: "", unit: "Nos", revisedQty: "0", revisedRate: "0" },
    ]);
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  const previewAmount = items.reduce((sum, item) => {
    const revisedValue = Number(item.revisedQty || 0) * Number(item.revisedRate || 0);
    const originalValue = (item.originalQty ?? 0) * (item.originalRate ?? 0);
    return sum + (revisedValue - originalValue);
  }, 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contract || items.length === 0) return;
    createVariation.mutate(
      {
        contractId: contract.id,
        variationType,
        title,
        reason,
        description: description || undefined,
        requestDate,
        items: items.map(
          (item): VariationItemInput => ({
            boqItemId: item.boqItemId,
            itemCode: item.itemCode || undefined,
            description: item.description,
            unit: item.unit,
            revisedQty: Number(item.revisedQty || 0),
            revisedRate: Number(item.revisedRate || 0),
          }),
        ),
      },
      { onSuccess: (record) => router.push(`/cms/variations/${record.id}`) },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Add Variation Order" subtitle="Track approved changes to BOQ quantities, rates and contract value." />
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <FormField label="Contract" required>
              <TextInput value={contract?.contractNo ?? "Loading..."} readOnly disabled />
            </FormField>
            <FormField label="Variation Type" required>
              <SelectInput options={VARIATION_TYPE_OPTIONS} value={variationType} onChange={(e) => setVariationType(e.target.value as typeof variationType)} />
            </FormField>
            <FormField label="Request Date" required>
              <DateInput value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
            </FormField>
            <FormField label="Title" required>
              <TextInput placeholder="Short title for this variation" value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
            <FormField label="Reason" required>
              <TextInput placeholder="Why is this variation needed?" value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Description">
            <textarea
              rows={2}
              className="w-full rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
        </div>

        <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
          <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
            <h3 className="text-[15px] font-semibold text-biz-text">BOQ Impact</h3>
            <div className="flex items-center gap-2">
              <div className="w-64">
                <SelectInput
                  placeholder="Change existing BOQ item..."
                  value=""
                  onChange={(e) => e.target.value && addExistingItem(e.target.value)}
                  options={availableBoqItems.map((b) => ({ value: b.id, label: `${b.itemCode ?? ""} ${b.description}`.trim() }))}
                />
              </div>
              <SecondaryButton type="button" onClick={addNewItem}>
                <Plus className="h-4 w-4" />
                New Item
              </SecondaryButton>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead>
                <tr className="bg-biz-bg">
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Description</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Unit</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Original Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Original Rate</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Revised Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Revised Rate</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Net Amount</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-biz-muted">
                      Add a BOQ item to change, or a new item to introduce.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const netAmount = Number(item.revisedQty || 0) * Number(item.revisedRate || 0) - (item.originalQty ?? 0) * (item.originalRate ?? 0);
                    return (
                      <tr key={item.key} className="border-t border-biz-border">
                        <td className="px-4 py-2">
                          {item.boqItemId ? (
                            <span className="text-biz-text">{item.description}</span>
                          ) : (
                            <TextInput placeholder="New item description" value={item.description} onChange={(e) => updateItem(item.key, { description: e.target.value })} />
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {item.boqItemId ? (
                            <span className="text-biz-muted">{item.unit}</span>
                          ) : (
                            <TextInput placeholder="Unit" value={item.unit} onChange={(e) => updateItem(item.key, { unit: e.target.value })} />
                          )}
                        </td>
                        <td className="px-4 py-2 text-biz-muted">{item.originalQty ?? "—"}</td>
                        <td className="px-4 py-2 text-biz-muted">{item.originalRate !== undefined ? formatBDT(item.originalRate) : "—"}</td>
                        <td className="px-4 py-2">
                          <TextInput type="number" step="0.001" min={0} value={item.revisedQty} onChange={(e) => updateItem(item.key, { revisedQty: e.target.value })} />
                        </td>
                        <td className="px-4 py-2">
                          <TextInput type="number" step="0.01" min={0} value={item.revisedRate} onChange={(e) => updateItem(item.key, { revisedRate: e.target.value })} />
                        </td>
                        <td className={netAmount < 0 ? "px-4 py-2 font-medium text-biz-danger" : "px-4 py-2 font-medium text-biz-success"}>
                          {formatBDT(netAmount)}
                        </td>
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
            Net Variation Amount (preview): {formatBDT(previewAmount)}
          </div>
        </section>

        {createVariation.isError && <p className="text-[13px] text-biz-danger">Failed to save variation. Please try again.</p>}

        <div className="flex items-center justify-end gap-3">
          <SecondaryButton type="button" onClick={() => router.back()}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={createVariation.isPending || !contract || items.length === 0 || !title || !reason}>
            <Save className="h-4 w-4" />
            {createVariation.isPending ? "Saving..." : "Save Draft"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
