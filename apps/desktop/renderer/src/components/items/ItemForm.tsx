"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useCreateItem, useMasterCategories, useParties, useUoms, useUpdateItem } from "@bizovix/api-client";
import { CurrencyInput, FormField, PageHeader, PrimaryButton, SearchSelect, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import type { ItemRecord } from "@bizovix/types";
import { ITEM_STATUS_OPTIONS, ITEM_TYPE_OPTIONS } from "@/lib/items";

interface ItemFormProps {
  mode: "create" | "edit";
  item?: ItemRecord;
}

export function ItemForm({ mode, item }: ItemFormProps) {
  const router = useRouter();
  const createMutation = useCreateItem();
  const updateMutation = useUpdateItem();
  const isPending = createMutation.isPending || updateMutation.isPending;
  const categories = useMasterCategories("MATERIAL");
  const uoms = useUoms();

  const [itemCode, setItemCode] = React.useState(item?.itemCode ?? "");
  const [itemName, setItemName] = React.useState(item?.itemName ?? "");
  const [description, setDescription] = React.useState(item?.description ?? "");
  const [itemType, setItemType] = React.useState(item?.itemType ?? "MATERIAL");
  const [categoryId, setCategoryId] = React.useState(item?.categoryId ?? "");
  const [uomId, setUomId] = React.useState(item?.uomId ?? "");
  const [defaultPurchaseRate, setDefaultPurchaseRate] = React.useState(item?.defaultPurchaseRate ?? "");
  const [specification, setSpecification] = React.useState(item?.specification ?? "");
  const [brandModel, setBrandModel] = React.useState(item?.brandModel ?? "");
  const [status, setStatus] = React.useState(item?.status ?? "ACTIVE");
  const [error, setError] = React.useState<string | null>(null);

  const [vendorQuery, setVendorQuery] = React.useState("");
  const [selectedVendor, setSelectedVendor] = React.useState<{ value: string; label: string } | null>(
    item?.preferredVendor ? { value: item.preferredVendor.id, label: item.preferredVendor.name } : null,
  );
  const vendors = useParties({ search: vendorQuery, limit: 20, roles: "VENDOR,SUPPLIER,SERVICE_PROVIDER,OTHER" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!itemName.trim()) return setError("Item Name is required.");

    const payload = {
      itemCode: itemCode.trim() || undefined,
      itemName: itemName.trim(),
      description: description.trim() || undefined,
      itemType,
      categoryId: categoryId || undefined,
      uomId: uomId || undefined,
      defaultPurchaseRate: defaultPurchaseRate === "" ? undefined : Number(defaultPurchaseRate),
      preferredVendorId: selectedVendor?.value || undefined,
      specification: specification.trim() || undefined,
      brandModel: brandModel.trim() || undefined,
      status,
    };

    if (mode === "create") {
      createMutation.mutate(payload, { onSuccess: () => router.push("/masters/items"), onError: () => setError("Failed to save item.") });
    } else if (item) {
      updateMutation.mutate({ id: item.id, payload }, { onSuccess: () => router.push("/masters/items"), onError: () => setError("Failed to save item.") });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={mode === "create" ? "Add Material / Item" : "Edit Material / Item"} subtitle="Reusable master data for materials, services and equipment." />

      <form onSubmit={submit} className="rounded-lg border border-biz-border bg-biz-surface p-6">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <FormField label="Item Code" helper="Leave blank to auto-generate">
            <TextInput placeholder="Auto (ITM-####)" value={itemCode} onChange={(e) => setItemCode(e.target.value)} disabled={mode === "edit"} />
          </FormField>
          <FormField label="Item Name" required>
            <TextInput value={itemName} onChange={(e) => setItemName(e.target.value)} />
          </FormField>
          <FormField label="Item Type">
            <SelectInput options={ITEM_TYPE_OPTIONS} value={itemType} onChange={(e) => setItemType(e.target.value as typeof itemType)} />
          </FormField>
          <FormField label="Category">
            <SelectInput placeholder="None" options={(categories.data ?? []).map((c) => ({ label: c.name, value: c.id }))} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
          </FormField>
          <FormField label="Unit of Measurement">
            <SelectInput placeholder="None" options={(uoms.data ?? []).map((u) => ({ label: `${u.name} (${u.code})`, value: u.id }))} value={uomId} onChange={(e) => setUomId(e.target.value)} />
          </FormField>
          <FormField label="Default Purchase Rate" helper="Optional">
            <CurrencyInput value={defaultPurchaseRate} onChange={(e) => setDefaultPurchaseRate(e.target.value)} />
          </FormField>
          <FormField label="Preferred Vendor" helper="Optional — search by name">
            <SearchSelect
              query={vendorQuery}
              value={selectedVendor}
              onQueryChange={(q) => {
                setVendorQuery(q);
                if (selectedVendor) setSelectedVendor(null);
              }}
              onSelect={(option) => setSelectedVendor(option)}
              options={(vendors.data?.items ?? []).map((vendor) => ({ value: vendor.id, label: vendor.name, sublabel: vendor.code }))}
              isLoading={vendors.isLoading}
              placeholder="Search vendor..."
            />
          </FormField>
          <FormField label="Brand / Model">
            <TextInput value={brandModel} onChange={(e) => setBrandModel(e.target.value)} />
          </FormField>
          <FormField label="Status">
            <SelectInput options={ITEM_STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} />
          </FormField>
          <div className="md:col-span-2 lg:col-span-3">
            <FormField label="Description">
              <textarea
                rows={2}
                className="w-full rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormField>
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <FormField label="Specification">
              <textarea
                rows={2}
                className="w-full rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                value={specification}
                onChange={(e) => setSpecification(e.target.value)}
              />
            </FormField>
          </div>
        </div>

        {error && <p className="mt-4 text-[13px] text-biz-danger">{error}</p>}

        <div className="mt-8 flex items-center justify-end gap-3 border-t border-biz-border pt-5">
          <SecondaryButton type="button" onClick={() => router.push("/masters/items")}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isPending}>
            <Save className="h-4 w-4" />
            {isPending ? "Saving..." : "Save"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
