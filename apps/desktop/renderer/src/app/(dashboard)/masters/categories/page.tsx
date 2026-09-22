"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { ApiError, useCreateMasterCategory, useMasterCategories, useUpdateMasterCategory } from "@bizovix/api-client";
import { PageHeader, PrimaryButton, SecondaryButton, StatusBadge, TextInput } from "@bizovix/ui";
import type { MasterCategoryRecord, MasterCategoryType } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { useDesktopMode } from "@/hooks/use-desktop-mode";

const TABS: { label: string; value: MasterCategoryType }[] = [
  { label: "Vendor Category", value: "VENDOR" },
  { label: "Material Category", value: "MATERIAL" },
  { label: "Subcontractor Trade Category", value: "SUBCONTRACTOR_TRADE" },
  { label: "Document Purchase Category", value: "DOCUMENT_PURCHASE" },
];

export default function CategoriesPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Categories" }]);
  const [type, setType] = React.useState<MasterCategoryType>("VENDOR");
  const desktop = useDesktopMode() === "desktop";
  const categories = useMasterCategories(type, { includeLocalDrafts: desktop });
  const createCategory = useCreateMasterCategory();
  const updateCategory = useUpdateMasterCategory();
  const [form, setForm] = React.useState({ name: "", description: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [review, setReview] = React.useState<MasterCategoryRecord | null>(null);
  const [reviewActive, setReviewActive] = React.useState(true);
  const saving = createCategory.isPending || updateCategory.isPending;

  function finishReview() {
    setReview(null);
    setForm({ name: "", description: "" });
    setError(null);
  }

  async function add() {
    setError(null);
    try {
      if (review) {
        await updateCategory.mutateAsync({ id: review.id, payload: { type: review.type, name: form.name, description: form.description, isActive: reviewActive } });
      } else {
        await createCategory.mutateAsync({ type, name: form.name, description: form.description || undefined });
      }
      finishReview();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The category could not be saved. Your existing data is unchanged.");
    }
  }

  async function toggle(category: MasterCategoryRecord) {
    setError(null);
    try {
      await updateCategory.mutateAsync({ id: category.id, payload: { type, name: category.name, description: category.description ?? undefined, isActive: !category.isActive } });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The category could not be updated.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Categories" subtitle="Reusable, typed categories for vendors, materials and subcontractor trades — one shared master, not duplicated per module." />

      <div className="flex flex-wrap gap-2 border-b border-biz-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            disabled={saving}
            onClick={() => { setType(t.value); finishReview(); }}
            className={`rounded-t-md px-4 py-2 text-[13px] font-medium ${type === t.value ? "border-b-2 border-biz-blue text-biz-blue" : "text-biz-muted hover:text-biz-text"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
        <h3 className="mb-4 text-[15px] font-semibold text-biz-text">{review ? "Review saved category" : `Add ${TABS.find((t) => t.value === type)?.label}`}</h3>
        {review && (
          <div className="mb-3 rounded-md border border-biz-border bg-biz-bg p-3 text-[13px]">
            <p className="text-biz-danger">{review.syncError?.message}</p>
            {review.cloudCategory ? (
              <p className="mt-1">Current cloud value: <strong>{review.cloudCategory.name}</strong> · {review.cloudCategory.description || "No description"} · {review.cloudCategory.isActive ? "Active" : "Inactive"}.</p>
            ) : <p className="mt-1">This saved category has not been accepted by the cloud.</p>}
            <p className="mt-1">Check your saved values below before sending a revised change. The previous attempt stays in the local history.</p>
          </div>
        )}
        <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput placeholder="Category name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <TextInput placeholder="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <PrimaryButton disabled={!form.name.trim() || saving} onClick={add}>
            <Plus className="h-4 w-4" />
            {review ? "Queue reviewed change" : "Add Category"}
          </PrimaryButton>
        </div>
        {review && (
          <div className="mb-3 flex items-center gap-4 text-[13px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={reviewActive} onChange={(event) => setReviewActive(event.target.checked)} />Active</label>
            <SecondaryButton disabled={saving} onClick={finishReview}>Close review</SecondaryButton>
          </div>
        )}
        {error && <p className="text-[13px] text-biz-danger">{error}</p>}
        {categories.isError && <p className="text-[13px] text-biz-danger">{categories.error instanceof ApiError ? categories.error.message : "Categories could not be loaded."}</p>}

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
                <td className="px-3 py-2.5 font-medium">
                  {category.name}
                  {desktop && category.syncStatus && <p className={`mt-1 text-[11px] font-normal ${category.syncStatus === "REJECTED" ? "text-biz-danger" : "text-biz-muted"}`}>{category.syncStatus === "PENDING" ? "Saved on this PC · waiting to sync" : category.syncStatus === "REJECTED" ? "Saved on this PC · needs review" : "Synced"}</p>}
                  {desktop && category.syncError && <p className="mt-1 max-w-md text-[11px] font-normal text-biz-danger">{category.syncError.message}</p>}
                </td>
                <td className="px-3 py-2.5">{category.description ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge label={category.isActive ? "Active" : "Inactive"} tone={category.isActive ? "success" : "neutral"} />
                </td>
                <td className="px-3 py-2.5">
                  {desktop && category.syncStatus === "REJECTED" ? <SecondaryButton disabled={saving} onClick={() => { setReview(category); setReviewActive(category.isActive); setForm({ name: category.name, description: category.description ?? "" }); setError(null); }}>Review saved change</SecondaryButton> : <SecondaryButton disabled={saving || category.syncStatus === "PENDING"} onClick={() => void toggle(category)}>
                    {category.isActive ? "Deactivate" : "Activate"}
                  </SecondaryButton>}
                </td>
              </tr>
            ))}
            {!categories.data?.length && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-biz-muted">
                  {categories.isPending ? "Loading categories…" : categories.isError ? "Categories are unavailable." : "No categories defined yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
