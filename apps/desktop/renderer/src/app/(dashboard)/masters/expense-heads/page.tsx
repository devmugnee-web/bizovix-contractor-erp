"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import {
  useChartOfAccounts,
  useCreateExpenseHead,
  useManagedExpenseHeads,
  useUpdateExpenseHead,
} from "@bizovix/api-client";
import {
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
} from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

type ExpenseHeadForm = {
  name: string;
  budgetCategory: string;
  nature: "DIRECT" | "INDIRECT";
  ledgerAccountId: string;
};

const empty: ExpenseHeadForm = {
  name: "",
  budgetCategory: "",
  nature: "INDIRECT",
  ledgerAccountId: "",
};

export default function ExpenseHeadsPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Expense Heads" }]);
  const heads = useManagedExpenseHeads();
  const chart = useChartOfAccounts();
  const createHead = useCreateExpenseHead();
  const updateHead = useUpdateExpenseHead();
  const [form, setForm] = React.useState<ExpenseHeadForm>(empty);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const expenseLedgers = (chart.data ?? []).filter(
    (account) => account.isActive && account.accountType === "EXPENSE" && !account.isControlAccount,
  );

  async function save() {
    setError("");
    if (!form.ledgerAccountId) {
      setError("Select a posting ledger from the Chart of Accounts.");
      return;
    }
    try {
      const body = {
        name: form.name.trim(),
        budgetCategory: form.budgetCategory.trim() || null,
        nature: form.nature,
        ledgerAccountId: form.ledgerAccountId,
      };
      if (editingId) await updateHead.mutateAsync({ id: editingId, body });
      else await createHead.mutateAsync(body);
      setEditingId(null);
      setForm(empty);
    } catch {
      setError("Could not save the expense head. Check the name and posting ledger.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Expense Heads"
        subtitle="Map every expense head to its posting ledger in the Chart of Accounts. Project and general expenses inherit this mapping automatically."
      />
      <section className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
        <h2 className="text-[14px] font-bold text-biz-text">
          {editingId ? "Edit Expense Head" : "Add Expense Head"}
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_180px_1.2fr_auto]">
          <TextInput
            aria-label="Expense Head Name"
            placeholder="Expense Head Name"
            value={form.name}
            onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
          />
          <TextInput
            aria-label="Budget Category"
            placeholder="Budget Category (optional)"
            value={form.budgetCategory}
            onChange={(event) =>
              setForm((value) => ({ ...value, budgetCategory: event.target.value }))
            }
          />
          <SelectInput
            aria-label="Expense Nature"
            value={form.nature}
            options={[
              { label: "Direct", value: "DIRECT" },
              { label: "Indirect / General", value: "INDIRECT" },
            ]}
            onChange={(event) =>
              setForm((value) => ({
                ...value,
                nature: event.target.value as ExpenseHeadForm["nature"],
              }))
            }
          />
          <SelectInput
            aria-label="Posting Ledger"
            placeholder="Select COA posting ledger"
            value={form.ledgerAccountId}
            options={expenseLedgers.map((account) => ({
              label: `${account.code} - ${account.name}`,
              value: account.id,
            }))}
            onChange={(event) =>
              setForm((value) => ({ ...value, ledgerAccountId: event.target.value }))
            }
          />
          <PrimaryButton
            disabled={
              !form.name.trim() ||
              !form.ledgerAccountId ||
              createHead.isPending ||
              updateHead.isPending
            }
            onClick={save}
          >
            <Plus className="h-4 w-4" />
            {editingId ? "Save" : "Add"}
          </PrimaryButton>
        </div>
        {editingId && (
          <SecondaryButton
            className="mt-2"
            onClick={() => {
              setEditingId(null);
              setForm(empty);
            }}
          >
            Cancel edit
          </SecondaryButton>
        )}
        {error && <p className="mt-2 text-[12px] text-biz-danger">{error}</p>}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[12px]">
            <thead className="bg-[#f4f7fb] text-[11px] text-biz-muted">
              <tr>
                <th className="px-3 py-2.5">Expense Head Name</th>
                <th className="px-3 py-2.5">Budget Category</th>
                <th className="px-3 py-2.5">Nature</th>
                <th className="px-3 py-2.5">COA Posting Ledger</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(heads.data ?? []).map((head) => (
                <tr key={head.id} className="border-t border-biz-border">
                  <td className="px-3 py-2.5 font-semibold text-biz-text">{head.name}</td>
                  <td className="px-3 py-2.5">
                    {head.budgetCategory || (
                      <span className="text-biz-muted">Not budget-mapped</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {head.nature === "DIRECT" ? "Direct" : "Indirect / General"}
                  </td>
                  <td className="px-3 py-2.5">
                    {head.ledgerAccount ? (
                      `${head.ledgerAccount.code} - ${head.ledgerAccount.name}`
                    ) : (
                      <span className="font-semibold text-biz-danger">Unmapped</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      label={head.isActive ? "Active" : "Inactive"}
                      tone={head.isActive ? "success" : "neutral"}
                    />
                  </td>
                  <td className="flex gap-2 px-3 py-2.5">
                    <SecondaryButton
                      onClick={() => {
                        setEditingId(head.id);
                        setForm({
                          name: head.name,
                          budgetCategory: head.budgetCategory ?? "",
                          nature: head.nature ?? "INDIRECT",
                          ledgerAccountId: head.ledgerAccountId ?? "",
                        });
                      }}
                    >
                      Edit
                    </SecondaryButton>
                    <SecondaryButton
                      disabled={!head.ledgerAccountId}
                      onClick={() =>
                        updateHead.mutate({
                          id: head.id,
                          body: {
                            name: head.name,
                            budgetCategory: head.budgetCategory,
                            nature: head.nature,
                            ledgerAccountId: head.ledgerAccountId!,
                            isActive: !head.isActive,
                          },
                        })
                      }
                    >
                      {head.isActive ? "Deactivate" : "Activate"}
                    </SecondaryButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
