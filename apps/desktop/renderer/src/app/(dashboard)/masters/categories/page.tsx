"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useCreateMasterCategory, useMasterCategories, useUpdateMasterCategory } from "@bizovix/api-client";
import { PageHeader, PrimaryButton, SecondaryButton, StatusBadge, TextInput } from "@bizovix/ui";
import type { MasterCategoryType } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const TABS: { label: string; value: MasterCategoryType }[] = [
  { label: "Vendor Category", value: "VENDOR" },
  { label: "Material Category", value: "MATERIAL" },
  { label: "Subcontractor Trade Category", value: "SUBCONTRACTOR_TRADE" },
  { label: "Document Purchase Category", value: "DOCUMENT_PURCHASE" },
];

export default function CategoriesPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Categories" }]);
  const [type, setType] = React.useState<MasterCategoryType>("VENDOR");
  const categories = useMasterCategories(type);
  const createCategory = useCreateMasterCategory();
  const updateCategory = useUpdateMasterCategory();
  const [form, setForm] = React.useState({ name: "", description: "" });
  const [error, setError] = React.useState<string | null>(null);

  async function add() {
    setError(null);
    try {
      await createCategory.mutateAsync({ type, name: form.name, description: form.description || undefined });
      setForm({ name: "", description: "" });
    } catch {
      setError("Failed to create category — the name may already be in use for this type.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Categories" subtitle="Reusable, typed categories for vendors, materials and subcontractor trades — one shared master, not duplicated per module." />

      <div className="flex flex-wrap gap-2 border-b border-biz-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            className={`rounded-t-md px-4 py-2 text-[13px] font-medium ${type === t.value ? "border-b-2 border-biz-blue text-biz-blue" : "text-biz-muted hover:text-biz-text"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
        <h3 className="mb-4 text-[15px] font-semibold text-biz-text">Add {TABS.find((t) => t.value === type)?.label}</h3>
        <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput placeholder="Category name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <TextInput placeholder="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <PrimaryButton disabled={!form.name || createCategory.isPending} onClick={add}>
            <Plus className="h-4 w-4" />
            Add Category
          </PrimaryButton>
        </div>
        {error && <p className="text-[13px] text-biz-danger">{error}</p>}

        <table className="mt-4 w-full text-left text-[13px]">
          <thead className="bg-[#f4f7fb] text-[11px] text-biz-muted">
            <tr>
              {["Name", "Description", "Status", "Action"].map((h) => (
                <th key={h} className="px-3 py-2.5">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(categories.data ?? []).map((category) => (
              <tr key={category.id} className="border-t border-biz-border">
                <td className="px-3 py-2.5 font-medium">{category.name}</td>
                <td className="px-3 py-2.5">{category.description ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge label={category.isActive ? "Active" : "Inactive"} tone={category.isActive ? "success" : "neutral"} />
                </td>
                <td className="px-3 py-2.5">
                  <SecondaryButton onClick={() => updateCategory.mutate({ id: category.id, payload: { type, name: category.name, description: category.description ?? undefined, isActive: !category.isActive } })}>
                    {category.isActive ? "Deactivate" : "Activate"}
                  </SecondaryButton>
                </td>
              </tr>
            ))}
            {!categories.data?.length && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-biz-muted">
                  No categories defined yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
