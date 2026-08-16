"use client";
import * as React from "react";
import { SelectInput, TextInput } from "@bizovix/ui";
import { useGeneralSettings, useUpdateGeneralSettings } from "@bizovix/api-client";
import type { SaveGeneralSettingInput } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Field, SaveBar, SettingsCard, SettingsSectionHeader, isDirty, useSettingsNotice, useSyncedForm } from "./shared";

const CURRENCIES = ["BDT", "USD", "EUR", "GBP", "INR"];
const TIMEZONES = ["Asia/Dhaka", "Asia/Kolkata", "Asia/Dubai", "UTC"];
const DATE_FORMATS = ["DD/MM/YYYY", "DD-MMM-YYYY", "YYYY-MM-DD"];
const NUMBER_FORMATS = [
  { value: "STANDARD", label: "Standard (1,250,000.00)" },
  { value: "LAKH_CRORE", label: "Lakh/Crore (12.50 Lac)" },
];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const LANGUAGES = [{ value: "en", label: "English" }, { value: "bn", label: "Bengali" }];

function preview(numberFormat: string) {
  return numberFormat === "LAKH_CRORE" ? "12.50 Lac" : "1,250,000.00";
}

function formatDate(dateFormat: string) {
  const d = new Date(2026, 7, 16);
  if (dateFormat === "YYYY-MM-DD") return "2026-08-16";
  if (dateFormat === "DD-MMM-YYYY") return "16-Aug-2026";
  return "16/08/2026";
}

export function GeneralSettingsPanel() {
  useSetBreadcrumb([{ label: "Settings", href: "/settings" }, { label: "General" }]);
  const query = useGeneralSettings();
  const update = useUpdateGeneralSettings();
  const { notify, Notice } = useSettingsNotice();
  const [form, setForm] = useSyncedForm(query.data, toInput);

  function toInput(d: NonNullable<typeof query.data>): SaveGeneralSettingInput {
    return {
      companyDisplayName: d.companyDisplayName ?? "",
      defaultCurrency: d.defaultCurrency,
      timezone: d.timezone,
      dateFormat: d.dateFormat,
      numberFormat: d.numberFormat,
      financialYearStartMonth: d.financialYearStartMonth,
      defaultLanguage: d.defaultLanguage,
      country: d.country,
      defaultPageSize: d.defaultPageSize,
    };
  }

  const dirty = !!(query.data && form && isDirty(toInput(query.data), form));

  async function save() {
    if (!form) return;
    try {
      await update.mutateAsync(form);
      notify("General settings updated successfully.");
    } catch {
      notify("Failed to update general settings.");
    }
  }

  if (query.isLoading || !form) return <div className="h-64 animate-pulse rounded-lg bg-slate-100" />;

  return (
    <div className="flex flex-col gap-4">
      {Notice}
      <SettingsSectionHeader
        title="General Settings"
        description="Configure company display, locale, currency and formatting defaults used across the ERP."
      />
      <SettingsCard title="Regional & Display Defaults">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Company Display Name">
            <TextInput
              value={form.companyDisplayName ?? ""}
              onChange={(e) => setForm({ ...form, companyDisplayName: e.target.value })}
            />
          </Field>
          <Field label="Default Currency" required>
            <SelectInput
              value={form.defaultCurrency}
              onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
          </Field>
          <Field label="Timezone" required>
            <SelectInput
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              options={TIMEZONES.map((t) => ({ value: t, label: t }))}
            />
          </Field>
          <Field label="Date Format" required hint={`Preview: ${formatDate(form.dateFormat)}`}>
            <SelectInput
              value={form.dateFormat}
              onChange={(e) => setForm({ ...form, dateFormat: e.target.value })}
              options={DATE_FORMATS.map((f) => ({ value: f, label: f }))}
            />
          </Field>
          <Field label="Number Format" required hint={`Preview: ${preview(form.numberFormat)}`}>
            <SelectInput
              value={form.numberFormat}
              onChange={(e) => setForm({ ...form, numberFormat: e.target.value })}
              options={NUMBER_FORMATS}
            />
          </Field>
          <Field label="Financial Year Start Month" required>
            <SelectInput
              value={String(form.financialYearStartMonth)}
              onChange={(e) => setForm({ ...form, financialYearStartMonth: Number(e.target.value) })}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
          </Field>
          <Field label="Default Language" required>
            <SelectInput
              value={form.defaultLanguage}
              onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value })}
              options={LANGUAGES}
            />
          </Field>
          <Field label="Country" required>
            <TextInput value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </Field>
          <Field label="Default Pagination Size" required hint="Rows per page across list views">
            <TextInput
              type="number"
              min={5}
              max={100}
              value={form.defaultPageSize}
              onChange={(e) => setForm({ ...form, defaultPageSize: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="mt-5">
          <SaveBar
            dirty={dirty}
            saving={update.isPending}
            onSave={save}
            onReset={() => query.data && setForm(toInput(query.data))}
          />
        </div>
      </SettingsCard>
    </div>
  );
}
