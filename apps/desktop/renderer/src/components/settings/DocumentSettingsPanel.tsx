"use client";
import * as React from "react";
import { TextInput, cn } from "@bizovix/ui";
import { useDocumentSettings, useUpdateDocumentSettings } from "@bizovix/api-client";
import type { SaveDocumentSettingInput } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Field, SaveBar, SettingsCard, SettingsSectionHeader, ToggleRow, isDirty, useSettingsNotice, useSyncedForm } from "./shared";

const FILE_TYPES = ["PDF", "DOC", "DOCX", "XLS", "XLSX", "JPG", "JPEG", "PNG"];

export function DocumentSettingsPanel() {
  useSetBreadcrumb([{ label: "Settings", href: "/settings" }, { label: "Documents" }]);
  const query = useDocumentSettings();
  const update = useUpdateDocumentSettings();
  const { notify, Notice } = useSettingsNotice();
  const [form, setForm] = useSyncedForm(query.data, toInput);

  function toInput(d: NonNullable<typeof query.data>): SaveDocumentSettingInput {
    return {
      allowedFileTypes: d.allowedFileTypes,
      maxFileSizeMb: d.maxFileSizeMb,
      defaultExpiryReminderDays: d.defaultExpiryReminderDays,
      enableVersionControl: d.enableVersionControl,
      enableExpiryTracking: d.enableExpiryTracking,
      autoArchiveExpired: d.autoArchiveExpired,
    };
  }

  const dirty = !!(query.data && form && isDirty(toInput(query.data), form));

  function toggleType(type: string) {
    if (!form) return;
    setForm({
      ...form,
      allowedFileTypes: form.allowedFileTypes.includes(type)
        ? form.allowedFileTypes.filter((t) => t !== type)
        : [...form.allowedFileTypes, type],
    });
  }

  async function save() {
    if (!form || !form.allowedFileTypes.length) return;
    try {
      await update.mutateAsync(form);
      notify("Document settings updated successfully.");
    } catch {
      notify("Failed to update settings.");
    }
  }

  if (query.isLoading || !form) return <div className="h-80 animate-pulse rounded-lg bg-slate-100" />;

  return (
    <div className="flex flex-col gap-4">
      {Notice}
      <SettingsSectionHeader
        title="Document Settings"
        description="Upload rules, expiry tracking and archival policy for the Documents module."
      />
      <SettingsCard title="Upload Rules">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Allowed File Types" required hint="Enforced on the server regardless of client input.">
            <div className="flex flex-wrap gap-1.5">
              {FILE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-semibold",
                    form.allowedFileTypes.includes(type) ? "border-biz-blue bg-biz-blue text-white" : "border-biz-border text-biz-text",
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Maximum File Size (MB)" required>
            <TextInput type="number" min={1} max={100} value={form.maxFileSizeMb} onChange={(e) => setForm({ ...form, maxFileSizeMb: Number(e.target.value) })} />
          </Field>
          <Field label="Default Expiry Reminder Days">
            <TextInput type="number" min={0} value={form.defaultExpiryReminderDays} onChange={(e) => setForm({ ...form, defaultExpiryReminderDays: Number(e.target.value) })} />
          </Field>
        </div>
      </SettingsCard>
      <SettingsCard title="Tracking & Archival">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <ToggleRow label="Enable Version Control" checked={form.enableVersionControl} onChange={(v) => setForm({ ...form, enableVersionControl: v })} />
          <ToggleRow label="Enable Document Expiry Tracking" checked={form.enableExpiryTracking} onChange={(v) => setForm({ ...form, enableExpiryTracking: v })} />
          <ToggleRow label="Auto Archive Expired Documents" checked={form.autoArchiveExpired} onChange={(v) => setForm({ ...form, autoArchiveExpired: v })} />
        </div>
        <div className="mt-5">
          <SaveBar dirty={dirty} saving={update.isPending} onSave={save} onReset={() => query.data && setForm(toInput(query.data))} />
        </div>
      </SettingsCard>
    </div>
  );
}
