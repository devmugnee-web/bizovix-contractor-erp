"use client";
import * as React from "react";
import { Lock, Plus, Unlock } from "lucide-react";
import { PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import {
  useAccountingPeriods,
  useCreateAccountingPeriod,
  useFinanceAccountOptions,
  useFinanceSettings,
  useSetAccountingPeriodStatus,
  useUpdateFinanceSettings,
} from "@bizovix/api-client";
import type { SaveFinanceSettingInput } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Field, SaveBar, SettingsCard, SettingsSectionHeader, ToggleRow, isDirty, useSettingsNotice, useSyncedForm } from "./shared";

const ACCOUNT_FIELDS: Array<[keyof SaveFinanceSettingInput, string]> = [
  ["defaultCashAccountId", "Default Cash Account"],
  ["defaultPettyCashAccountId", "Default Petty Cash Account"],
  ["defaultBankChargeAccountId", "Default Bank Charge Account"],
  ["defaultReceivableAccountId", "Default Accounts Receivable Account"],
  ["defaultPayableAccountId", "Default Accounts Payable Account"],
  ["defaultProjectRevenueAccountId", "Default Project Revenue Account"],
  ["defaultGeneralExpenseAccountId", "Default General Expense Account"],
  ["defaultTenderDocumentExpenseAccountId", "Default Tender Document Expense Account"],
  ["defaultCreditCommitmentChargeAccountId", "Default Credit Commitment Charge Account"],
];

export function FinanceSettingsPanel() {
  useSetBreadcrumb([{ label: "Settings", href: "/settings" }, { label: "Finance & Accounts" }]);
  const query = useFinanceSettings();
  const accounts = useFinanceAccountOptions();
  const update = useUpdateFinanceSettings();
  const { notify, Notice } = useSettingsNotice();
  const [form, setForm] = useSyncedForm(query.data, toInput);

  function toInput(d: NonNullable<typeof query.data>): SaveFinanceSettingInput {
    return {
      defaultCashAccountId: d.defaultCashAccountId ?? "",
      defaultPettyCashAccountId: d.defaultPettyCashAccountId ?? "",
      defaultBankChargeAccountId: d.defaultBankChargeAccountId ?? "",
      defaultReceivableAccountId: d.defaultReceivableAccountId ?? "",
      defaultPayableAccountId: d.defaultPayableAccountId ?? "",
      defaultProjectRevenueAccountId: d.defaultProjectRevenueAccountId ?? "",
      defaultGeneralExpenseAccountId: d.defaultGeneralExpenseAccountId ?? "",
      defaultTenderDocumentExpenseAccountId: d.defaultTenderDocumentExpenseAccountId ?? "",
      defaultCreditCommitmentChargeAccountId: d.defaultCreditCommitmentChargeAccountId ?? "",
      autoPostApproved: d.autoPostApproved,
      requireApprovalBeforePosting: d.requireApprovalBeforePosting,
      allowBackdatedTransactions: d.allowBackdatedTransactions,
      allowFutureDatedTransactions: d.allowFutureDatedTransactions,
    };
  }

  const dirty = !!(query.data && form && isDirty(toInput(query.data), form));

  async function save() {
    if (!form) return;
    const cleaned = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === "" ? undefined : v]),
    ) as unknown as SaveFinanceSettingInput;
    try {
      await update.mutateAsync(cleaned);
      notify("Finance & accounts settings updated successfully.");
    } catch {
      notify("Failed to update settings.");
    }
  }

  const periods = useAccountingPeriods();
  const createPeriod = useCreateAccountingPeriod();
  const setPeriodStatus = useSetAccountingPeriodStatus();
  const [periodForm, setPeriodForm] = React.useState({ label: "", startDate: "", endDate: "" });

  if (query.isLoading || !form) return <div className="h-96 animate-pulse rounded-lg bg-slate-100" />;

  const accountOptions = (accounts.data ?? []).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }));

  return (
    <div className="flex flex-col gap-4">
      {Notice}
      <SettingsSectionHeader
        title="Finance & Accounts Settings"
        description="Default posting accounts, posting rules and accounting period control drawn from your Chart of Accounts."
      />
      <SettingsCard title="Default Accounts">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ACCOUNT_FIELDS.map(([key, label]) => (
            <Field label={label} key={key}>
              <SelectInput
                placeholder="Not set"
                value={(form[key] as string) ?? ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                options={accountOptions}
              />
            </Field>
          ))}
        </div>
      </SettingsCard>
      <SettingsCard title="Posting Rules">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <ToggleRow
            label="Auto-post approved transactions"
            checked={form.autoPostApproved}
            onChange={(v) => setForm({ ...form, autoPostApproved: v })}
          />
          <ToggleRow
            label="Require approval before posting"
            checked={form.requireApprovalBeforePosting}
            onChange={(v) => setForm({ ...form, requireApprovalBeforePosting: v })}
          />
          <ToggleRow
            label="Allow backdated transactions"
            checked={form.allowBackdatedTransactions}
            onChange={(v) => setForm({ ...form, allowBackdatedTransactions: v })}
          />
          <ToggleRow
            label="Allow future-dated transactions"
            checked={form.allowFutureDatedTransactions}
            onChange={(v) => setForm({ ...form, allowFutureDatedTransactions: v })}
          />
        </div>
        <div className="mt-5">
          <SaveBar dirty={dirty} saving={update.isPending} onSave={save} onReset={() => query.data && setForm(toInput(query.data))} />
        </div>
      </SettingsCard>
      <SettingsCard title="Period Control" description="Locked periods block new journal postings and edits dated within them.">
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <TextInput placeholder="Label (e.g. FY2026-Q1)" value={periodForm.label} onChange={(e) => setPeriodForm({ ...periodForm, label: e.target.value })} />
          <TextInput type="date" value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} />
          <TextInput type="date" value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} />
          <PrimaryButton
            disabled={!periodForm.label || !periodForm.startDate || !periodForm.endDate || createPeriod.isPending}
            onClick={async () => {
              await createPeriod.mutateAsync(periodForm);
              setPeriodForm({ label: "", startDate: "", endDate: "" });
              notify("Accounting period created successfully.");
            }}
          >
            <Plus className="h-4 w-4" />
            Add Period
          </PrimaryButton>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[11px]">
            <thead className="bg-[#f4f7fb] text-[10px]">
              <tr>
                {["Label", "Start", "End", "Status", "Action"].map((h) => (
                  <th key={h} className="px-3 py-2.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(periods.data ?? []).map((p) => (
                <tr key={p.id} className="border-t border-biz-border">
                  <td className="px-3 py-2.5 font-semibold">{p.label}</td>
                  <td className="px-3 py-2.5">{new Date(p.startDate).toLocaleDateString()}</td>
                  <td className="px-3 py-2.5">{new Date(p.endDate).toLocaleDateString()}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge label={p.status} tone={p.status === "LOCKED" ? "danger" : "success"} />
                  </td>
                  <td className="px-3 py-2.5">
                    <SecondaryButton
                      disabled={setPeriodStatus.isPending}
                      onClick={async () => {
                        await setPeriodStatus.mutateAsync({ id: p.id, status: p.status === "LOCKED" ? "OPEN" : "LOCKED" });
                        notify(p.status === "LOCKED" ? "Period unlocked." : "Period locked.");
                      }}
                    >
                      {p.status === "LOCKED" ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                      {p.status === "LOCKED" ? "Unlock" : "Lock"}
                    </SecondaryButton>
                  </td>
                </tr>
              ))}
              {!periods.data?.length && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-biz-muted">
                    No accounting periods defined yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SettingsCard>
    </div>
  );
}
