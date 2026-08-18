"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { useCmsWorks, useCreatePurchaseRequisition, useItems, useProjectBoq, useUoms, useUpdatePurchaseRequisition } from "@bizovix/api-client";
import { DateInput, FormField, PageHeader, PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { PrPriority, PurchaseRequisitionRecord } from "@bizovix/types";
import { PR_PRIORITY_OPTIONS } from "@/lib/procurement";

interface DraftItem {
  key: string;
  itemId: string;
  itemLabel: string;
  uomId: string;
  requestedQty: string;
  estimatedRate: string;
  requiredDate: string;
  boqItemId: string;
  remarks: string;
}

interface PurchaseRequisitionFormProps {
  mode: "create" | "edit";
  requisition?: PurchaseRequisitionRecord;
}

let draftSeq = 0;
const nextKey = () => "draft-" + ++draftSeq;

export function PurchaseRequisitionForm({ mode, requisition }: PurchaseRequisitionFormProps) {
  const router = useRouter();
  const createMutation = useCreatePurchaseRequisition();
  const updateMutation = useUpdatePurchaseRequisition();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const works = useCmsWorks({ status: "ONGOING", limit: 100 });
  const itemMasters = useItems({ status: "ACTIVE", limit: 200 });
  const uoms = useUoms();

  const [prNo, setPrNo] = React.useState(requisition?.prNo ?? "");
  const [requestDate, setRequestDate] = React.useState(requisition?.requestDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [requiredByDate, setRequiredByDate] = React.useState(requisition?.requiredByDate?.slice(0, 10) ?? "");
  const [cmsWorkId, setCmsWorkId] = React.useState(requisition?.cmsWorkId ?? "");
  const [department, setDepartment] = React.useState(requisition?.department ?? "");
  const [priority, setPriority] = React.useState<PrPriority>(requisition?.priority ?? "MEDIUM");
  const [purpose, setPurpose] = React.useState(requisition?.purpose ?? "");
  const [remarks, setRemarks] = React.useState(requisition?.remarks ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const [items, setItems] = React.useState<DraftItem[]>(
    () =>
      requisition?.items.map((item) => ({
        key: nextKey(),
        itemId: item.itemId,
        itemLabel: item.item.itemCode + " — " + item.item.itemName,
        uomId: item.uomId ?? "",
        requestedQty: item.requestedQty,
        estimatedRate: item.estimatedRate ?? "",
        requiredDate: item.requiredDate?.slice(0, 10) ?? "",
        boqItemId: item.boqItemId ?? "",
        remarks: item.remarks ?? "",
      })) ?? [],
  );

  // BOQ references are only offered once a project is chosen — the backend rejects any BOQ line
  // belonging to a different project.
  const boq = useProjectBoq(cmsWorkId || undefined);

  function addItem(itemId: string) {
    const master = (itemMasters.data?.items ?? []).find((candidate) => candidate.id === itemId);
    if (!master) return;
    setItems((prev) => [
      ...prev,
      {
        key: nextKey(),
        itemId: master.id,
        itemLabel: master.itemCode + " — " + master.itemName,
        uomId: master.uomId ?? "",
        requestedQty: "",
        estimatedRate: master.defaultPurchaseRate ?? "",
        requiredDate: "",
        boqItemId: "",
        remarks: "",
      },
    ]);
  }

  function patchItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  const estimatedTotal = items.reduce((sum, item) => sum + Number(item.requestedQty || 0) * Number(item.estimatedRate || 0), 0);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!items.length) return setError("Add at least one item to the requisition.");
    if (items.some((item) => Number(item.requestedQty || 0) <= 0)) return setError("Every item needs a requested quantity greater than zero.");

    const payload = {
      prNo: prNo.trim() || undefined,
      requestDate,
      requiredByDate: requiredByDate || undefined,
      cmsWorkId: cmsWorkId || undefined,
      department: department.trim() || undefined,
      priority,
      purpose: purpose.trim() || undefined,
      remarks: remarks.trim() || undefined,
      items: items.map((item) => ({
        itemId: item.itemId,
        uomId: item.uomId || undefined,
        requestedQty: Number(item.requestedQty),
        estimatedRate: item.estimatedRate === "" ? undefined : Number(item.estimatedRate),
        requiredDate: item.requiredDate || undefined,
        boqItemId: item.boqItemId || undefined,
        remarks: item.remarks.trim() || undefined,
      })),
    };

    const onError = (mutationError: unknown) =>
      setError(mutationError instanceof Error ? mutationError.message : "Failed to save the purchase requisition.");

    if (mode === "create") {
      createMutation.mutate(payload, { onSuccess: (record) => router.push("/procurement/requisitions/" + record.id), onError });
    } else if (requisition) {
      updateMutation.mutate({ id: requisition.id, payload }, { onSuccess: () => router.push("/procurement/requisitions/" + requisition.id), onError });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={mode === "create" ? "New Purchase Requisition" : "Edit " + (requisition?.prNo ?? "Purchase Requisition")}
        subtitle="Request materials or services for a project. Submitted requisitions go for approval before any RFQ is raised."
      />

      <form onSubmit={submit} className="flex flex-col gap-6">
        <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <FormField label="PR No." helper="Leave blank to auto-generate">
              <TextInput placeholder="Auto (PR-####)" value={prNo} onChange={(event) => setPrNo(event.target.value)} disabled={mode === "edit"} />
            </FormField>
            <FormField label="Request Date" required>
              <DateInput value={requestDate} onChange={(event) => setRequestDate(event.target.value)} />
            </FormField>
            <FormField label="Required By">
              <DateInput value={requiredByDate} onChange={(event) => setRequiredByDate(event.target.value)} />
            </FormField>
            <FormField label="Project" helper="Optional — required for BOQ-linked requests">
              <SelectInput
                placeholder="None (general procurement)"
                value={cmsWorkId}
                onChange={(event) => {
                  setCmsWorkId(event.target.value);
                  setItems((prev) => prev.map((item) => ({ ...item, boqItemId: "" })));
                }}
                options={(works.data?.items ?? []).map((work) => ({ value: work.id, label: work.workName }))}
              />
            </FormField>
            <FormField label="Department">
              <TextInput placeholder="e.g. Site / Electrical" value={department} onChange={(event) => setDepartment(event.target.value)} />
            </FormField>
            <FormField label="Priority">
              <SelectInput options={PR_PRIORITY_OPTIONS} value={priority} onChange={(event) => setPriority(event.target.value as PrPriority)} />
            </FormField>
            <div className="md:col-span-2 lg:col-span-3">
              <FormField label="Purpose">
                <TextInput placeholder="Why is this needed?" value={purpose} onChange={(event) => setPurpose(event.target.value)} />
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
            <h3 className="text-[15px] font-semibold text-biz-text">Requested Items</h3>
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
            <table className="w-full min-w-[1000px] text-left text-[13px]">
              <thead>
                <tr className="bg-biz-bg">
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Item</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Unit</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Est. Rate</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Est. Amount</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Required Date</th>
                  {cmsWorkId && <th className="px-4 py-2.5 font-medium text-biz-muted">BOQ Reference</th>}
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Remarks</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={cmsWorkId ? 9 : 8} className="px-4 py-8 text-center text-biz-muted">
                      Add an item from the master to start the requisition.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.key} className="border-t border-biz-border align-top">
                      <td className="px-4 py-2 text-biz-text">{item.itemLabel}</td>
                      <td className="px-4 py-2">
                        <SelectInput
                          className="h-9 w-28"
                          placeholder="—"
                          value={item.uomId}
                          onChange={(event) => patchItem(item.key, { uomId: event.target.value })}
                          options={(uoms.data ?? []).map((uom) => ({ value: uom.id, label: uom.code }))}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <TextInput
                          className="h-9 w-24"
                          type="number"
                          step="0.001"
                          min={0}
                          value={item.requestedQty}
                          onChange={(event) => patchItem(item.key, { requestedQty: event.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <TextInput
                          className="h-9 w-28"
                          type="number"
                          step="0.01"
                          min={0}
                          value={item.estimatedRate}
                          onChange={(event) => patchItem(item.key, { estimatedRate: event.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2 font-medium text-biz-text">{formatBDT(Number(item.requestedQty || 0) * Number(item.estimatedRate || 0))}</td>
                      <td className="px-4 py-2">
                        <DateInput className="h-9 w-40" value={item.requiredDate} onChange={(event) => patchItem(item.key, { requiredDate: event.target.value })} />
                      </td>
                      {cmsWorkId && (
                        <td className="px-4 py-2">
                          <SelectInput
                            className="h-9 w-48"
                            placeholder="None"
                            value={item.boqItemId}
                            onChange={(event) => patchItem(item.key, { boqItemId: event.target.value })}
                            options={(boq.data ?? []).map((boqItem) => ({ value: boqItem.id, label: ((boqItem.itemCode ?? "") + " " + boqItem.description).trim() }))}
                          />
                        </td>
                      )}
                      <td className="px-4 py-2">
                        <TextInput className="h-9 w-40" value={item.remarks} onChange={(event) => patchItem(item.key, { remarks: event.target.value })} />
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
          <div className="flex items-center justify-end border-t border-biz-border px-4 py-3 text-[13px] font-semibold text-biz-text">
            Estimated Total: {formatBDT(estimatedTotal)}
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
