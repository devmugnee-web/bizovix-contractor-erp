"use client";
import * as React from "react";
import { Pencil, X } from "lucide-react";
import { PrimaryButton, SecondaryButton, SelectInput, StatusBadge, cn } from "@bizovix/ui";
import { useReminderRules, useUpdateReminderRule } from "@bizovix/api-client";
import type { ReminderRuleRecord, SaveReminderRuleInput } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Field, SettingsCard, SettingsSectionHeader, ToggleRow, useSettingsNotice } from "./shared";

const TYPE_LABELS: Record<string, string> = {
  TENDER_OPENING: "Tender Opening",
  TENDER_CLOSING: "Tender Closing",
  TENDER_SECURITY_EXPIRY: "Tender Security Expiry",
  PG_EXPIRY: "PG Expiry",
  BG_EXPIRY: "BG Expiry",
  SECURITY_DEPOSIT_EXPIRY: "Security Deposit Expiry",
  BILL_MATURITY: "Bill Maturity",
  CHEQUE_MATURITY: "Cheque Maturity",
  LOAN_EMI_DUE: "Loan / EMI Due",
  DOCUMENT_EXPIRY: "Document Expiry",
  RECEIVABLE_DUE: "Receivable Due",
  PAYABLE_DUE: "Payable Due",
  CONTRACT_EXPIRY: "Contract Expiry",
};
const OFFSET_CHOICES = [0, 1, 3, 7, 15, 30];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const priorityTone = (p: string) => (p === "CRITICAL" ? "danger" : p === "HIGH" ? "warning" : p === "MEDIUM" ? "info" : "neutral");

function EditModal({ row, onClose, notify }: { row: ReminderRuleRecord; onClose: () => void; notify: (m: string) => void }) {
  const update = useUpdateReminderRule();
  const [form, setForm] = React.useState<SaveReminderRuleInput>({
    isEnabled: row.isEnabled,
    defaultPriority: row.defaultPriority,
    offsetDays: row.offsetDays,
    inAppEnabled: row.inAppEnabled,
    emailEnabled: row.emailEnabled,
  });

  function toggleOffset(day: number) {
    setForm((f) => ({
      ...f,
      offsetDays: f.offsetDays.includes(day) ? f.offsetDays.filter((d) => d !== day) : [...f.offsetDays, day],
    }));
  }

  async function save() {
    if (!form.offsetDays.length) return;
    await update.mutateAsync({ reminderType: String(row.reminderType), body: form });
    notify("Notification rule updated successfully.");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <section className="w-full max-w-lg rounded-lg bg-white p-5 shadow-card-hover" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-bold">{TYPE_LABELS[String(row.reminderType)] ?? row.reminderType}</h2>
          <button aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5 text-biz-muted" />
          </button>
        </div>
        <div className="grid gap-3">
          <ToggleRow label="Enable Reminder" checked={form.isEnabled} onChange={(v) => setForm({ ...form, isEnabled: v })} />
          <Field label="Default Priority">
            <SelectInput
              value={form.defaultPriority}
              onChange={(e) => setForm({ ...form, defaultPriority: e.target.value })}
              options={PRIORITIES.map((p) => ({ value: p, label: p }))}
            />
          </Field>
          <Field label="Reminder Days (select one or more offsets)">
            <div className="flex flex-wrap gap-1.5">
              {OFFSET_CHOICES.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleOffset(day)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-semibold",
                    form.offsetDays.includes(day) ? "border-biz-blue bg-biz-blue text-white" : "border-biz-border text-biz-text",
                  )}
                >
                  {day === 0 ? "Same day" : `${day}d before`}
                </button>
              ))}
            </div>
          </Field>
          <ToggleRow label="In-App Notification" checked={form.inAppEnabled} onChange={(v) => setForm({ ...form, inAppEnabled: v })} />
          <ToggleRow
            label="Email Notification"
            hint="Architecture reserved — email delivery is not yet configured for this ERP."
            checked={form.emailEnabled}
            onChange={(v) => setForm({ ...form, emailEnabled: v })}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton disabled={update.isPending || !form.offsetDays.length} onClick={save}>
            {update.isPending ? "Saving..." : "Save"}
          </PrimaryButton>
        </div>
      </section>
    </div>
  );
}

export function NotificationSettingsPanel() {
  useSetBreadcrumb([{ label: "Settings", href: "/settings" }, { label: "Reminders & Notifications" }]);
  const query = useReminderRules();
  const { notify, Notice } = useSettingsNotice();
  const [editing, setEditing] = React.useState<ReminderRuleRecord | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {Notice}
      <SettingsSectionHeader
        title="Reminders & Notifications"
        description="These rules drive both the Reminders list and the Topbar notification bell — the same underlying records, no duplication."
      />
      <SettingsCard title="Reminder Rules">
        {query.isLoading ? (
          <div className="h-64 animate-pulse rounded bg-slate-100" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[11px]">
              <thead className="bg-[#f4f7fb] text-[10px]">
                <tr>
                  {["Reminder Type", "Enabled", "Priority", "Offsets", "In-App", "Email", "Action"].map((h) => (
                    <th key={h} className="px-3 py-2.5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(query.data ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-biz-border">
                    <td className="px-3 py-2.5 font-semibold">{TYPE_LABELS[String(row.reminderType)] ?? row.reminderType}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge label={row.isEnabled ? "Enabled" : "Disabled"} tone={row.isEnabled ? "success" : "neutral"} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge label={row.defaultPriority} tone={priorityTone(row.defaultPriority)} />
                    </td>
                    <td className="px-3 py-2.5 text-biz-muted">{row.offsetDays.map((d) => (d === 0 ? "Same day" : `${d}d`)).join(", ")}</td>
                    <td className="px-3 py-2.5">{row.inAppEnabled ? "Yes" : "No"}</td>
                    <td className="px-3 py-2.5">{row.emailEnabled ? "Yes" : "No"}</td>
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
