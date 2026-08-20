"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useCreateExpenseHead, useManagedExpenseHeads, useUpdateExpenseHead } from "@bizovix/api-client";
import { PageHeader, PrimaryButton, SecondaryButton, StatusBadge, TextInput } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const empty = { name: "", budgetCategory: "" };

export default function ExpenseHeadsPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Expense Heads" }]);
  const heads = useManagedExpenseHeads();
  const createHead = useCreateExpenseHead();
  const updateHead = useUpdateExpenseHead();
  const [form, setForm] = React.useState(empty);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");

  async function save() {
    setError("");
    try {
      const body = { name: form.name.trim(), budgetCategory: form.budgetCategory.trim() || null };
      if (editingId) await updateHead.mutateAsync({ id: editingId, body });
      else await createHead.mutateAsync(body);
      setEditingId(null);
      setForm(empty);
    } catch {
      setError("Could not save the expense head. Its name may already exist.");
    }
  }

  return <div className="flex flex-col gap-6">
    <PageHeader title="Expense Heads" subtitle="Map each expense head to the canonical category used by Budget vs Actual. Leave uncertain mappings blank." />
    <section className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
      <h2 className="text-[14px] font-bold text-biz-text">{editingId ? "Edit Expense Head" : "Add Expense Head"}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <TextInput aria-label="Expense Head Name" placeholder="Expense Head Name" value={form.name} onChange={(e) => setForm((value) => ({ ...value, name: e.target.value }))} />
        <TextInput aria-label="Budget Category" placeholder="Budget Category (leave blank if unmapped)" value={form.budgetCategory} onChange={(e) => setForm((value) => ({ ...value, budgetCategory: e.target.value }))} />
        <PrimaryButton disabled={!form.name.trim() || createHead.isPending || updateHead.isPending} onClick={save}><Plus className="h-4 w-4" />{editingId ? "Save" : "Add"}</PrimaryButton>
      </div>
      {editingId && <SecondaryButton className="mt-2" onClick={() => { setEditingId(null); setForm(empty); }}>Cancel edit</SecondaryButton>}
      {error && <p className="mt-2 text-[12px] text-biz-danger">{error}</p>}
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-[12px]">
        <thead className="bg-[#f4f7fb] text-[11px] text-biz-muted"><tr><th className="px-3 py-2.5">Expense Head Name</th><th className="px-3 py-2.5">Budget Category</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Actions</th></tr></thead>
        <tbody>{(heads.data ?? []).map((head) => <tr key={head.id} className="border-t border-biz-border">
          <td className="px-3 py-2.5 font-semibold text-biz-text">{head.name}</td>
          <td className="px-3 py-2.5">{head.budgetCategory || <span className="text-biz-danger">Unmapped / Unbudgeted</span>}</td>
          <td className="px-3 py-2.5"><StatusBadge label={head.isActive ? "Active" : "Inactive"} tone={head.isActive ? "success" : "neutral"} /></td>
          <td className="flex gap-2 px-3 py-2.5"><SecondaryButton onClick={() => { setEditingId(head.id); setForm({ name: head.name, budgetCategory: head.budgetCategory ?? "" }); }}>Edit</SecondaryButton><SecondaryButton onClick={() => updateHead.mutate({ id: head.id, body: { name: head.name, budgetCategory: head.budgetCategory, isActive: !head.isActive } })}>{head.isActive ? "Deactivate" : "Activate"}</SecondaryButton></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
