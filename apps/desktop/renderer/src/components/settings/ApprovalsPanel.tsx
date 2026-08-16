"use client";
import * as React from "react";
import { Plus, X } from "lucide-react";
import { CurrencyInput, PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { useApprovalRules, useCreateApprovalRule, useDeleteApprovalRule, useUpdateApprovalRule } from "@bizovix/api-client";
import type { ApprovalRuleRecord, SaveApprovalRuleInput } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Field, SettingsCard, SettingsSectionHeader, useSettingsNotice } from "./shared";

const MODULES = [
  "TENDER", "TENDER_SECURITY", "PG_BG", "CREDIT_COMMITMENT", "PROJECT_EXPENSE",
  "GENERAL_EXPENSE", "RECEIPT", "PAYMENT", "BANK_TRANSFER", "JOURNAL_ENTRY",
];
const moduleLabel = (m: string) => m.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

function blank(): SaveApprovalRuleInput {
  return {
    module: MODULES[0]!,
    transactionType: "",
    minAmount: undefined,
    maxAmount: undefined,
    approvalRequired: true,
    approverRole: "Admin",
    approvalLevel: 1,
    isActive: true,
  };
}

function RuleForm({
  record,
  onClose,
  notify,
}: {
  record?: ApprovalRuleRecord;
  onClose: () => void;
  notify: (m: string) => void;
}) {
  const create = useCreateApprovalRule();
  const update = useUpdateApprovalRule();
  const [form, setForm] = React.useState<SaveApprovalRuleInput>(
    record
      ? {
          module: record.module,
          transactionType: record.transactionType ?? "",
          minAmount: record.minAmount ? Number(record.minAmount) : undefined,
          maxAmount: record.maxAmount ? Number(record.maxAmount) : undefined,
          approvalRequired: record.approvalRequired,
          approverRole: record.approverRole,
          approvalLevel: record.approvalLevel,
          isActive: record.isActive,
        }
      : blank(),
  );
  const pending = create.isPending || update.isPending;

  async function save() {
    if (record) await update.mutateAsync({ id: record.id, body: form });
    else await create.mutateAsync(form);
    notify(record ? "Approval rule updated successfully." : "Approval rule created successfully.");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <section className="w-full max-w-xl rounded-lg bg-white p-5 shadow-card-hover" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-bold">{record ? "Edit Approval Rule" : "Add Approval Rule"}</h2>
          <button aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5 text-biz-muted" />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Module" required>
            <SelectInput value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} options={MODULES.map((m) => ({ value: m, label: moduleLabel(m) }))} />
          </Field>
          <Field label="Transaction Type">
            <TextInput value={form.transactionType ?? ""} onChange={(e) => setForm({ ...form, transactionType: e.target.value })} />
          </Field>
          <Field label="Minimum Amount">
            <CurrencyInput value={form.minAmount ?? ""} onChange={(e) => setForm({ ...form, minAmount: e.target.value ? Number(e.target.value) : undefined })} />
          </Field>
          <Field label="Maximum Amount">
            <CurrencyInput value={form.maxAmount ?? ""} onChange={(e) => setForm({ ...form, maxAmount: e.target.value ? Number(e.target.value) : undefined })} />
          </Field>
          <Field label="Approver Role" required>
            <TextInput value={form.approverRole} onChange={(e) => setForm({ ...form, approverRole: e.target.value })} />
          </Field>
          <Field label="Approval Level" required>
            <SelectInput
              value={String(form.approvalLevel)}
              onChange={(e) => setForm({ ...form, approvalLevel: Number(e.target.value) })}
              options={[1, 2, 3].map((n) => ({ value: String(n), label: `Level ${n}` }))}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-[12px] font-semibold">
            <input type="checkbox" checked={form.approvalRequired} onChange={(e) => setForm({ ...form, approvalRequired: e.target.checked })} />
            Approval Required
          </label>
          <label className="flex items-center gap-2 text-[12px] font-semibold">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Active
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton disabled={pending} onClick={save}>
            {pending ? "Saving..." : "Save Rule"}
          </PrimaryButton>
        </div>
      </section>
    </div>
  );
}

export function ApprovalsPanel() {
  useSetBreadcrumb([{ label: "Settings", href: "/settings" }, { label: "Approvals" }]);
  const query = useApprovalRules();
  const del = useDeleteApprovalRule();
  const { notify, Notice } = useSettingsNotice();
  const [modal, setModal] = React.useState<ApprovalRuleRecord | "new" | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {Notice}
      <SettingsSectionHeader
        title="Approval Workflow"
        description="Amount-based approval thresholds per module. Levels 1-3 are supported for future multi-step approval."
      />
      <SettingsCard title="Approval Rules">
        <div className="mb-3 flex justify-end">
          <PrimaryButton onClick={() => setModal("new")}>
            <Plus className="h-4 w-4" />
            Add Rule
          </PrimaryButton>
        </div>
        {query.isLoading ? (
          <div className="h-64 animate-pulse rounded bg-slate-100" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[11px]">
              <thead className="bg-[#f4f7fb] text-[10px]">
                <tr>
                  {["Module", "Type", "Range", "Approver", "Level", "Status", "Action"].map((h) => (
                    <th key={h} className="px-3 py-2.5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(query.data ?? []).map((rule) => (
                  <tr key={rule.id} className="border-t border-biz-border">
                    <td className="px-3 py-2.5 font-semibold">{moduleLabel(rule.module)}</td>
                    <td className="px-3 py-2.5 text-biz-muted">{rule.transactionType ?? "Any"}</td>
                    <td className="px-3 py-2.5">
                      {rule.minAmount ? `≥ ${Number(rule.minAmount).toLocaleString()}` : "Any"}
                      {rule.maxAmount ? ` – ${Number(rule.maxAmount).toLocaleString()}` : ""}
                    </td>
                    <td className="px-3 py-2.5">{rule.approverRole}</td>
                    <td className="px-3 py-2.5">Level {rule.approvalLevel}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge label={rule.isActive ? "Active" : "Inactive"} tone={rule.isActive ? "success" : "neutral"} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5">
                        <button className="rounded border px-2 py-1 hover:text-biz-blue" onClick={() => setModal(rule)}>
                          Edit
                        </button>
                        <button
                          className="rounded border px-2 py-1 hover:text-biz-danger"
                          onClick={async () => {
                            await del.mutateAsync(rule.id);
                            notify("Approval rule deleted successfully.");
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!query.data?.length && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-biz-muted">
                      No approval rules configured yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>
      {modal && <RuleForm record={modal === "new" ? undefined : modal} onClose={() => setModal(null)} notify={notify} />}
    </div>
  );
}
