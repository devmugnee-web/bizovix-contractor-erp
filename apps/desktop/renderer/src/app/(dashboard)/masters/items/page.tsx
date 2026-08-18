"use client";

import * as React from "react";
import Link from "next/link";
import { Box, FileEdit, PackageX, Search, Wrench } from "lucide-react";
import { useItemStats, useItems, useMasterCategories, useUoms } from "@bizovix/api-client";
import { DataTable, FilterBar, IconButton, ModuleStatCard, Pagination, PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { ItemQuery, ItemRecord, ItemStatus, ItemType } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { ITEM_STATUS_META, ITEM_STATUS_OPTIONS, ITEM_TYPE_META, ITEM_TYPE_OPTIONS } from "@/lib/items";

interface FilterDraft {
  search: string;
  itemType: string;
  categoryId: string;
  uomId: string;
  status: string;
}

const EMPTY_DRAFT: FilterDraft = { search: "", itemType: "", categoryId: "", uomId: "", status: "" };

export default function ItemsPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Materials & Items" }]);

  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [query, setQuery] = React.useState<ItemQuery>({ page: 1, limit: 10 });

  const stats = useItemStats();
  const categories = useMasterCategories("MATERIAL");
  const uoms = useUoms();
  const items = useItems(query);

  function applyFilters(next: FilterDraft = draft) {
    setQuery({
      page: 1,
      limit: 10,
      search: next.search || undefined,
      itemType: (next.itemType as ItemType) || undefined,
      categoryId: next.categoryId || undefined,
      uomId: next.uomId || undefined,
      status: (next.status as ItemStatus) || undefined,
    });
  }

  function clearFilters() {
    setDraft(EMPTY_DRAFT);
    setQuery({ page: 1, limit: 10 });
  }

  const rows = items.data?.items ?? [];
  const meta = items.data?.meta ?? { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title text-biz-text">Materials & Items</h1>
          <p className="mt-1 text-[13px] text-biz-muted">Reusable master data for materials, services and equipment — no stock balances yet.</p>
        </div>
        <Link href="/masters/items/create">
          <PrimaryButton>
            <FileEdit className="h-4 w-4" />
            Add Item
          </PrimaryButton>
        </Link>
      </div>

      <div className="flex flex-wrap gap-4">
        <ModuleStatCard icon={Box} iconClassName="bg-biz-blue-soft text-biz-blue" label="Total Items" value={String(stats.data?.total ?? "—")} helper="All Time" />
        <ModuleStatCard icon={Box} iconClassName="bg-biz-success-soft text-biz-success" label="Materials" value={String(stats.data?.materials ?? "—")} helper="Material type" />
        <ModuleStatCard icon={Wrench} iconClassName="bg-biz-purple-soft text-biz-purple" label="Services" value={String(stats.data?.services ?? "—")} helper="Service type" />
        <ModuleStatCard icon={PackageX} iconClassName="bg-biz-warning-soft text-biz-warning" label="Inactive" value={String(stats.data?.inactive ?? "—")} helper="Not usable in new records" />
      </div>

      <FilterBar>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Search</label>
          <TextInput icon={Search} placeholder="Item Code / Name / Description / Brand..." value={draft.search} onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && applyFilters()} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Type</label>
          <SelectInput className="w-[140px]" placeholder="All" value={draft.itemType} onChange={(e) => setDraft((d) => ({ ...d, itemType: e.target.value }))} options={ITEM_TYPE_OPTIONS} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Category</label>
          <SelectInput className="w-[150px]" placeholder="All" value={draft.categoryId} onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))} options={(categories.data ?? []).map((c) => ({ label: c.name, value: c.id }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">UOM</label>
          <SelectInput className="w-[130px]" placeholder="All" value={draft.uomId} onChange={(e) => setDraft((d) => ({ ...d, uomId: e.target.value }))} options={(uoms.data ?? []).map((u) => ({ label: u.code, value: u.id }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Status</label>
          <SelectInput className="w-[130px]" placeholder="All" value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} options={ITEM_STATUS_OPTIONS} />
        </div>
        <PrimaryButton onClick={() => applyFilters()}>
          <Search className="h-4 w-4" />
          Search
        </PrimaryButton>
        <SecondaryButton onClick={clearFilters}>Clear Filter</SecondaryButton>
      </FilterBar>

      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <DataTable<ItemRecord>
          isLoading={items.isLoading}
          data={rows}
          rowKey={(row) => row.id}
          columns={[
            { key: "code", header: "Item Code", render: (row) => <span className="font-medium text-biz-text">{row.itemCode}</span> },
            { key: "name", header: "Item Name", render: (row) => row.itemName },
            { key: "type", header: "Type", render: (row) => ITEM_TYPE_META[row.itemType] },
            { key: "category", header: "Category", render: (row) => row.category?.name ?? "—" },
            { key: "uom", header: "UOM", render: (row) => row.uom?.code ?? "—" },
            { key: "rate", header: "Default Rate", render: (row) => (row.defaultPurchaseRate ? formatBDT(row.defaultPurchaseRate) : "—") },
            { key: "vendor", header: "Preferred Vendor", render: (row) => row.preferredVendor?.name ?? "—" },
            { key: "status", header: "Status", render: (row) => <StatusBadge label={ITEM_STATUS_META[row.status].label} tone={ITEM_STATUS_META[row.status].tone} /> },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <Link href={`/masters/items/${row.id}/edit`}>
                  <IconButton aria-label="Edit">
                    <FileEdit className="h-4 w-4" />
                  </IconButton>
                </Link>
              ),
            },
          ]}
        />
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} totalPages={meta.totalPages} onPageChange={(page) => setQuery((q) => ({ ...q, page }))} />
      </div>
    </div>
  );
}
