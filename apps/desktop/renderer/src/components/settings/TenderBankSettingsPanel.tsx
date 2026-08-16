"use client";
import * as React from "react";
import { CurrencyInput, TextInput } from "@bizovix/ui";
import { useTenderBankSettings, useUpdateTenderBankSettings } from "@bizovix/api-client";
import type { SaveTenderBankSettingInput } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Field, SaveBar, SettingsCard, SettingsSectionHeader, isDirty, useSettingsNotice, useSyncedForm } from "./shared";

function numberField(
  form: SaveTenderBankSettingInput,
  setForm: (f: SaveTenderBankSettingInput) => void,
  key: keyof SaveTenderBankSettingInput,
  suffix?: string,
) {
  return (
    <div className="relative">
      <TextInput type="number" value={String(form[key])} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-biz-muted">{suffix}</span>}
    </div>
  );
}

export function TenderBankSettingsPanel() {
  useSetBreadcrumb([{ label: "Settings", href: "/settings" }, { label: "Tender & Bank Instruments" }]);
  const query = useTenderBankSettings();
  const update = useUpdateTenderBankSettings();
  const { notify, Notice } = useSettingsNotice();
  const [form, setForm] = useSyncedForm(query.data, toInput);

  function toInput(d: NonNullable<typeof query.data>): SaveTenderBankSettingInput {
    return {
      tenderValidityDays: d.tenderValidityDays,
      tenderOpeningReminderDays: d.tenderOpeningReminderDays,
      tenderExpiryReminderDays: d.tenderExpiryReminderDays,
      tsDefaultSecurityPct: Number(d.tsDefaultSecurityPct),
      tsDefaultMarginPct: Number(d.tsDefaultMarginPct),
      tsDefaultValidityMonths: d.tsDefaultValidityMonths,
      tsExpiryReminderDays: d.tsExpiryReminderDays,
      pgBgDefaultMarginPct: Number(d.pgBgDefaultMarginPct),
      pgBgDefaultValidityMonths: d.pgBgDefaultValidityMonths,
      pgBgDefaultInterestRate: Number(d.pgBgDefaultInterestRate),
      pgBgExpiryReminderDays: d.pgBgExpiryReminderDays,
      pgBgMaturityReminderDays: d.pgBgMaturityReminderDays,
      creditCommitmentDefaultCharge: Number(d.creditCommitmentDefaultCharge),
      sdDefaultPct: Number(d.sdDefaultPct),
      sdDefaultValidityMonths: d.sdDefaultValidityMonths,
    } as unknown as SaveTenderBankSettingInput;
  }

  const dirty = !!(query.data && form && isDirty(toInput(query.data), form));

  async function save() {
    if (!form) return;
    try {
      await update.mutateAsync(form);
      notify("Tender & bank instrument settings updated successfully.");
    } catch {
      notify("Failed to update settings.");
    }
  }

  if (query.isLoading || !form) return <div className="h-96 animate-pulse rounded-lg bg-slate-100" />;

  return (
    <div className="flex flex-col gap-4">
      {Notice}
      <SettingsSectionHeader
        title="Tender & Bank Instrument Settings"
        description="Defaults used when creating Tenders, Tender Security, PG/BG, Credit Commitment and Security Deposit records."
      />
      <SettingsCard title="Tender Defaults">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Default Tender Validity Days">{numberField(form, setForm, "tenderValidityDays", "days")}</Field>
          <Field label="Tender Opening Reminder Days">{numberField(form, setForm, "tenderOpeningReminderDays", "days before")}</Field>
          <Field label="Tender Expiry Reminder Days">{numberField(form, setForm, "tenderExpiryReminderDays", "days before")}</Field>
        </div>
      </SettingsCard>
      <SettingsCard title="Tender Security">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Default Security %">{numberField(form, setForm, "tsDefaultSecurityPct", "%")}</Field>
          <Field label="Default Margin %">{numberField(form, setForm, "tsDefaultMarginPct", "%")}</Field>
          <Field label="Default Validity (Months)">{numberField(form, setForm, "tsDefaultValidityMonths", "months")}</Field>
          <Field label="Expiry Reminder Days">{numberField(form, setForm, "tsExpiryReminderDays", "days before")}</Field>
        </div>
      </SettingsCard>
      <SettingsCard title="PG / BG">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Default Margin %">{numberField(form, setForm, "pgBgDefaultMarginPct", "%")}</Field>
          <Field label="Default Validity (Months)">{numberField(form, setForm, "pgBgDefaultValidityMonths", "months")}</Field>
          <Field label="Default Interest Rate">{numberField(form, setForm, "pgBgDefaultInterestRate", "%")}</Field>
          <Field label="Expiry Reminder Days">{numberField(form, setForm, "pgBgExpiryReminderDays", "days before")}</Field>
          <Field label="Maturity Reminder Days">{numberField(form, setForm, "pgBgMaturityReminderDays", "days before")}</Field>
        </div>
      </SettingsCard>
      <SettingsCard title="Credit Commitment">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Default Charge Per Tender">
            <CurrencyInput
              value={form.creditCommitmentDefaultCharge}
              onChange={(e) => setForm({ ...form, creditCommitmentDefaultCharge: Number(e.target.value) })}
            />
          </Field>
        </div>
      </SettingsCard>
      <SettingsCard title="Security Deposit">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Default SD %">{numberField(form, setForm, "sdDefaultPct", "%")}</Field>
          <Field label="Default Validity (Months)">{numberField(form, setForm, "sdDefaultValidityMonths", "months")}</Field>
        </div>
        <div className="mt-5">
          <SaveBar dirty={dirty} saving={update.isPending} onSave={save} onReset={() => query.data && setForm(toInput(query.data))} />
        </div>
      </SettingsCard>
    </div>
  );
}
