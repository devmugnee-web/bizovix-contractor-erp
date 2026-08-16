"use client";
import * as React from "react";
import { Pencil, X } from "lucide-react";
import { PrimaryButton, SecondaryButton, SelectInput, TextInput, cn } from "@bizovix/ui";
import { useNumberSequences, useUpdateNumberSequence } from "@bizovix/api-client";
import type { NumberSequenceRecord, SaveNumberSequenceInput } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Field, SettingsCard, SettingsSectionHeader, ToggleRow, useSettingsNotice } from "./shared";

const MODULE_LABELS: Record<string, string> = {
  TENDER: "Tender",
  EXPENSE: "Expense",
  RECEIPT: "Receipt",
  JOURNAL: "Journal Voucher",
  PAYMENT_VOUCHER: "Payment Voucher",
  RECEIPT_VOUCHER: "Receipt Voucher",
  BANK_TRANSFER: "Bank Transfer",
  PG_BG: "PG/BG",
  TENDER_SECURITY: "Tender Security",
  DOCUMENT: "Document",
  PROJECT: "Project / Work",
  CHEQUE: "Cheque",
};

function preview(config: { prefix: string; includeYear: boolean; yearFormat: string; separator: string; sequenceLength: number }, sequence: number) {
  const year = new Date().getFullYear();
  const yearPart = config.includeYear ? (config.yearFormat === "YY" ? String(year).slice(-2) : String(year)) : null;
  const seqPart = String(sequence).padStart(config.sequenceLength, "0");
  return [config.prefix || "—", yearPart, seqPart].filter(Boolean).join(config.separator || "");
}

function EditModal({
  row,
  onClose,
  notify,
}: {
  row: NumberSequenceRecord;
  onClose: () => void;
  notify: (m: string) => void;
}) {
  const update = useUpdateNumberSequence();
  const [form, setForm] = React.useState<SaveNumberSequenceInput>({
    prefix: row.prefix,
    includeYear: row.includeYear,
    yearFormat: row.yearFormat,
    separator: row.separator,
    sequenceLength: row.sequenceLength,
    nextNumber: row.nextNumber,
  });
  const isReceipt = row.moduleKey === "RECEIPT";

  async function save() {
    await update.mutateAsync({ moduleKey: row.moduleKey, body: form });
    notify("Numbering settings updated successfully.");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <section className="w-full max-w-lg rounded-lg bg-white p-5 shadow-card-hover" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-bold">{MODULE_LABELS[row.moduleKey] ?? row.moduleKey} Numbering</h2>
          <button aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5 text-biz-muted" />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prefix" required>
            <TextInput value={form.prefix} maxLength={10} onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Separator">
            <TextInput value={form.separator} maxLength={3} onChange={(e) => setForm({ ...form, separator: e.target.value })} />
          </Field>
          <Field label="Year Format">
            <SelectInput
              value={form.yearFormat}
              onChange={(e) => setForm({ ...form, yearFormat: e.target.value })}
              options={[{ value: "YYYY", label: "YYYY (2026)" }, { value: "YY", label: "YY (26)" }]}
            />
          </Field>
          <Field label="Sequence Digits">
            <TextInput type="number" min={1} max={10} value={form.sequenceLength} onChange={(e) => setForm({ ...form, sequenceLength: Number(e.target.value) })} />
          </Field>
          <Field label="Next Sequence Number" hint={isReceipt ? "Receipt numbers are driven by a live counter — this value is informational only." : undefined}>
            <TextInput type="number" min={1} disabled={isReceipt} value={form.nextNumber} onChange={(e) => setForm({ ...form, nextNumber: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="mt-3">
          <ToggleRow label="Include Year" checked={form.includeYear} onChange={(v) => setForm({ ...form, includeYear: v })} />
        </div>
        <div className="mt-4 rounded border border-dashed border-biz-border bg-biz-bg p-3 text-center">
          <p className="text-[10px] font-semibold uppercase text-biz-muted">Live Preview</p>
          <p className="mt-1 text-[16px] font-bold text-biz-blue">{preview(form, form.nextNumber)}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton disabled={update.isPending} onClick={save}>
            {update.isPending ? "Saving..." : "Save"}
          </PrimaryButton>
        </div>
      </section>
    </div>
  );
}

export function NumberingSettingsPanel() {
  useSetBreadcrumb([{ label: "Settings", href: "/settings" }, { label: "Numbering & Prefixes" }]);
  const query = useNumberSequences();
  const { notify, Notice } = useSettingsNotice();
  const [editing, setEditing] = React.useState<NumberSequenceRecord | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {Notice}
      <SettingsSectionHeader
        title="Numbering & Prefixes"
        description="Configure document number formats. Numbers are generated atomically — duplicates are never issued."
      />
      <SettingsCard title="Document Sequences">
        {query.isLoading ? (
          <div className="h-64 animate-pulse rounded bg-slate-100" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[11px]">
              <thead className="bg-[#f4f7fb] text-[10px]">
                <tr>
                  {["Module", "Format", "Next Preview", "Action"].map((h) => (
                    <th key={h} className="px-3 py-2.5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(query.data ?? []).map((row) => (
                  <tr key={row.moduleKey} className="border-t border-biz-border">
                    <td className="px-3 py-2.5 font-semibold">{MODULE_LABELS[row.moduleKey] ?? row.moduleKey}</td>
                    <td className={cn("px-3 py-2.5 text-biz-muted")}>
                      {row.prefix}
                      {row.includeYear ? `${row.separator}${row.yearFormat}` : ""}
                      {row.separator}
                      {"0".repeat(row.sequenceLength)}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-biz-blue">{preview(row, row.nextNumber)}</td>
                    <td className="px-3 py-2.5">
                      <button className="rounded border px-2 py-1 hover:text-biz-blue" onClick={() => setEditing(row)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>
      {editing && <EditModal row={editing} onClose={() => setEditing(null)} notify={notify} />}
    </div>
  );
}
