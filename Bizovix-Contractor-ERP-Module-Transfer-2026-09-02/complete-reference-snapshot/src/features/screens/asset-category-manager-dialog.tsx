"use client";

import { useState } from "react";
import { Edit2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useAssetCategoriesQuery,
  useCreateAssetCategoryMutation,
  useUpdateAssetCategoryMutation,
} from "@/hooks/use-fixed-assets-query";
import type { AssetCategoryRecord, UpdateAssetCategoryInput } from "@/types/fixed-assets";

const emptyForm = {
  name: "",
  defaultUsefulLifeYears: "",
  defaultSalvageValue: "",
};

interface AssetCategoryManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EditingCategory {
  id: string;
  name: string;
  defaultUsefulLifeYears: string;
  defaultSalvageValue: string;
}

export function AssetCategoryManagerDialog({ open, onOpenChange }: AssetCategoryManagerDialogProps) {
  const categoriesQuery = useAssetCategoriesQuery(open);
  const createMutation = useCreateAssetCategoryMutation();
  const updateMutation = useUpdateAssetCategoryMutation();

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<EditingCategory | null>(null);
  const categories = categoriesQuery.data ?? [];

  async function handleCreate() {
    setError(null);
    if (!form.name.trim()) {
      setError("Category name is required.");
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: form.name.trim(),
        defaultUsefulLifeMonths: form.defaultUsefulLifeYears ? Math.round(Number(form.defaultUsefulLifeYears) * 12) : undefined,
        defaultSalvageValue: form.defaultSalvageValue ? Number(form.defaultSalvageValue) : undefined,
      });
      toast.success(`Category "${form.name.trim()}" added`);
      setForm(emptyForm);
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : "Category could not be created");
    }
  }

  function startEdit(category: AssetCategoryRecord) {
    setEditingCategory({
      id: category.id,
      name: category.name,
      defaultUsefulLifeYears: category.defaultUsefulLifeMonths ? String(Math.round(category.defaultUsefulLifeMonths / 12)) : "",
      defaultSalvageValue: category.defaultSalvageValue ? String(category.defaultSalvageValue) : "",
    });
  }

  async function handleSaveEdit() {
    if (!editingCategory) return;
    if (!editingCategory.name.trim()) {
      toast.error("Category name is required.");
      return;
    }
    try {
      const input: UpdateAssetCategoryInput = {
        name: editingCategory.name.trim(),
        defaultUsefulLifeMonths: editingCategory.defaultUsefulLifeYears ? Math.round(Number(editingCategory.defaultUsefulLifeYears) * 12) : undefined,
        defaultSalvageValue: editingCategory.defaultSalvageValue ? Number(editingCategory.defaultSalvageValue) : undefined,
      };
      await updateMutation.mutateAsync({ categoryId: editingCategory.id, input });
      toast.success("Category updated");
      setEditingCategory(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleToggleActive(category: AssetCategoryRecord) {
    try {
      await updateMutation.mutateAsync({ categoryId: category.id, input: { isActive: !category.isActive } });
    } catch (toggleError) {
      toast.error(toggleError instanceof Error ? toggleError.message : "Category could not be updated");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(95vw,800px)] max-h-[90vh] overflow-y-auto">
        <div className="pr-8">
          <DialogTitle>Asset Categories</DialogTitle>
          <DialogDescription className="mt-1">
            Each category gets its own Chart of Accounts nodes (asset, accumulated depreciation, depreciation expense) the first time it is used.
          </DialogDescription>
        </div>

        <div className="mt-4 overflow-hidden rounded-[8px] border border-[#e7edf5]">
          <table className="w-full text-sm">
            <thead className="bg-[#fbfdff] text-xs font-semibold uppercase tracking-[0.05em] text-[#8994a6]">
              <tr>
                <th className="border-b border-[#e7edf5] px-3 py-2 text-left">Category</th>
                <th className="border-b border-[#e7edf5] px-3 py-2 text-left">Code</th>
                <th className="border-b border-[#e7edf5] px-3 py-2 text-right">Assets</th>
                <th className="border-b border-[#e7edf5] px-3 py-2 text-center">Status</th>
                <th className="border-b border-[#e7edf5] px-3 py-2 text-center">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f8]">
              {categoriesQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-[#8994a6]">Loading categories...</td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-[#8994a6]">No categories yet. Add one below.</td>
                </tr>
              ) : (
                categories.map((category) => (
                  <tr key={category.id}>
                    <td className="px-3 py-2 font-medium text-[#1f2f46]">{category.name}</td>
                    <td className="px-3 py-2 text-[#6f7d91]">{category.code}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#3c4a60]">{category.assetCount}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(category)}
                        className={category.isActive ? "text-[#08783d]" : "text-[#8994a6]"}
                      >
                        {category.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => startEdit(category)}
                        className="p-1.5 text-[#3b82f6] hover:bg-blue-50 rounded"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-[8px] border border-[#e7edf5] bg-[#fbfdff] p-4">
          <div className="mb-3 text-sm font-semibold text-[#334155]">Add Category</div>
          <div className="grid grid-cols-3 gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[#334155]">Name *</span>
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Vehicles, Equipment..." />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[#334155]">Default Useful Life (years)</span>
              <Input type="number" min="1" step="1" value={form.defaultUsefulLifeYears} onChange={(event) => setForm((current) => ({ ...current, defaultUsefulLifeYears: event.target.value }))} placeholder="Optional" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[#334155]">Default Salvage Value</span>
              <Input money type="number" min="0" step="0.01" value={form.defaultSalvageValue} onChange={(event) => setForm((current) => ({ ...current, defaultSalvageValue: event.target.value }))} placeholder="Optional" />
            </label>
          </div>
          {error ? <p className="mt-2 text-sm text-[#c63c3c]">{error}</p> : null}
          <div className="mt-3 flex justify-end">
            <Button type="button" onClick={() => void handleCreate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding..." : "Add Category"}
            </Button>
          </div>
        </div>

        {/* Edit Dialog */}
        {editingCategory && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditingCategory(null)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-[90vw]" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Edit Category</h3>
              <div className="space-y-4">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-[#334155]">Name *</span>
                  <Input
                    value={editingCategory.name}
                    onChange={(e) => setEditingCategory((c) => c ? { ...c, name: e.target.value } : null)}
                    placeholder="Category name"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-[#334155]">Default Useful Life (years)</span>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={editingCategory.defaultUsefulLifeYears}
                    onChange={(e) => setEditingCategory((c) => c ? { ...c, defaultUsefulLifeYears: e.target.value } : null)}
                    placeholder="Optional"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-[#334155]">Default Salvage Value</span>
                  <Input
                    money
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingCategory.defaultSalvageValue}
                    onChange={(e) => setEditingCategory((c) => c ? { ...c, defaultSalvageValue: e.target.value } : null)}
                    placeholder="Optional"
                  />
                </label>
              </div>
              <div className="mt-6 flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditingCategory(null)}>Cancel</Button>
                <Button onClick={() => void handleSaveEdit()} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
