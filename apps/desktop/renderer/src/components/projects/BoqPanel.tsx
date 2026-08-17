"use client";

import * as React from "react";
import { AlertTriangle, FileEdit, Plus, Trash2 } from "lucide-react";
import { useBoqSummary, useCreateBoqItem, useDeleteBoqItem, useProjectBoq, useUpdateBoqItem } from "@bizovix/api-client";
import { DataTable, FormField, IconButton, PrimaryButton, SecondaryButton, TextInput } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import { BOQ_SECTIONS, type BoqItemRecord, type CreateBoqItemInput } from "@bizovix/types";
import { Modal } from "@/components/layout/Modal";

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-biz-text">{value}</p>
    </div>
  );
}

export function BoqPanel({ workId }: { workId: string }) {
  const summary = useBoqSummary(workId);
  const items = useProjectBoq(workId);
  const deleteItem = useDeleteBoqItem(workId);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BoqItemRecord | null>(null);

  function remove(item: BoqItemRecord) {
    if (!window.confirm(`Remove BOQ item "${item.description}"?`)) return;
    deleteItem.mutate(item.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4">
        <InfoCard label="Total BOQ Items" value={String(summary.data?.totalItems ?? "—")} />
        <InfoCard label="Total BOQ Value" value={formatBDT(summary.data?.totalBoqValue ?? "0")} />
        <InfoCard label="Executed Value" value={formatBDT(summary.data?.executedValue ?? "0")} />
        <InfoCard label="Remaining Value" value={formatBDT(summary.data?.remainingValue ?? "0")} />
        <InfoCard label="Overall Progress" value={`${summary.data?.overallProgressPct ?? "0.00"}%`} />
      </div>

      {summary.data?.hasDifferenceWarning && (
        <div className="flex items-center gap-2 rounded-lg border border-biz-warning/40 bg-biz-warning-soft px-4 py-3 text-[13px] text-biz-text">
          <AlertTriangle className="h-4 w-4 shrink-0 text-biz-warning" />
          BOQ total differs from Contract Value by {formatBDT(Math.abs(Number(summary.data.differenceFromContract)))}.
        </div>
      )}

      <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">Bill of Quantities (BOQ)</h3>
          <PrimaryButton
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add BOQ Item
          </PrimaryButton>
        </div>

        <DataTable<BoqItemRecord>
          isLoading={items.isLoading}
          data={items.data ?? []}
          rowKey={(row) => row.id}
          emptyMessage="No BOQ items added yet."
          columns={[
            { key: "sl", header: "SL", render: (row) => (items.data ?? []).indexOf(row) + 1 },
            { key: "code", header: "Item Code", render: (row) => row.itemCode ?? "—" },
            { key: "description", header: "Description", render: (row) => row.description },
            { key: "unit", header: "Unit", render: (row) => row.unit },
            { key: "qty", header: "Contract Qty", render: (row) => row.contractQty },
            { key: "rate", header: "Rate", render: (row) => formatBDT(row.unitRate) },
            { key: "amount", header: "Contract Amount", render: (row) => formatBDT(row.contractAmount) },
            { key: "execQty", header: "Executed Qty", render: (row) => row.executedQty },
            { key: "execValue", header: "Executed Value", render: (row) => formatBDT(row.executedValue) },
            { key: "remQty", header: "Remaining Qty", render: (row) => row.remainingQty },
            { key: "remValue", header: "Remaining Value", render: (row) => formatBDT(row.remainingValue) },
            { key: "progress", header: "Progress %", render: (row) => `${row.progressPct}%` },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <div className="flex items-center justify-center gap-1">
                  <IconButton
                    aria-label="Edit"
                    onClick={() => {
                      setEditing(row);
                      setFormOpen(true);
                    }}
                  >
                    <FileEdit className="h-4 w-4" />
                  </IconButton>
                  <IconButton aria-label="Delete" onClick={() => remove(row)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              ),
            },
          ]}
        />
      </section>

      <BoqItemModal
        key={`${formOpen}-${editing?.id ?? "new"}`}
        workId={workId}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        item={editing}
      />
    </div>
  );
}

function BoqItemModal({
  workId,
  open,
  onClose,
  item,
}: {
  workId: string;
  open: boolean;
  onClose: () => void;
  item: BoqItemRecord | null;
}) {
  const createItem = useCreateBoqItem(workId);
  const updateItem = useUpdateBoqItem(workId);
  const [form, setForm] = React.useState<CreateBoqItemInput>(() => ({
    section: item?.section?.name ?? BOQ_SECTIONS[0],
    itemCode: item?.itemCode ?? "",
    description: item?.description ?? "",
    unit: item?.unit ?? "",
    contractQty: item ? Number(item.contractQty) : 0,
    unitRate: item ? Number(item.unitRate) : 0,
    specification: item?.specification ?? "",
    remarks: item?.remarks ?? "",
  }));

  const isPending = createItem.isPending || updateItem.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: CreateBoqItemInput = {
      ...form,
      itemCode: form.itemCode || undefined,
      specification: form.specification || undefined,
      remarks: form.remarks || undefined,
    };
    if (item) {
      updateItem.mutate({ id: item.id, payload }, { onSuccess: onClose });
    } else {
      createItem.mutate(payload, { onSuccess: onClose });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? "Edit BOQ Item" : "Add BOQ Item"}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormField label="Section">
          <select
            className="h-11 w-full rounded-sm border border-biz-border bg-biz-surface px-3 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
            value={form.section}
            onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
          >
            {BOQ_SECTIONS.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Item Code">
          <TextInput
            placeholder="Optional"
            value={form.itemCode}
            onChange={(e) => setForm((f) => ({ ...f, itemCode: e.target.value }))}
          />
        </FormField>
        <FormField label="Description" required>
          <TextInput
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            required
          />
        </FormField>
        <FormField label="Unit" required>
          <TextInput
            placeholder="e.g. Nos, Sqm, Lot"
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            required
          />
        </FormField>
        <FormField label="Contract Quantity" required>
          <TextInput
            type="number"
            step="0.001"
            min={0}
            value={form.contractQty}
            onChange={(e) => setForm((f) => ({ ...f, contractQty: Number(e.target.value) }))}
            required
          />
        </FormField>
        <FormField label="Unit Rate" required>
          <TextInput
            type="number"
            step="0.01"
            min={0}
            value={form.unitRate}
            onChange={(e) => setForm((f) => ({ ...f, unitRate: Number(e.target.value) }))}
            required
          />
        </FormField>
        <FormField label="Specification">
          <TextInput
            placeholder="Optional"
            value={form.specification}
            onChange={(e) => setForm((f) => ({ ...f, specification: e.target.value }))}
          />
        </FormField>
        <FormField label="Remarks">
          <TextInput
            placeholder="Optional"
            value={form.remarks}
            onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
          />
        </FormField>
        <div className="mt-2 flex justify-end gap-3">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
