"use client";

import { Filter } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { readDataset, writeDataset } from "@/services/browser-dataset";
import type { StockItemRecord } from "@/types/domain";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import { loadInventoryItems, updateApiInventoryItem, type InventorySnapshotItem } from "@/features/screens/inventory-screen";

type BulkMode = "pricing" | "stock" | "item-information";
type FilterableColumn = "itemName" | "category" | "purchasePrice" | "salePrice" | "unit" | "stockQty" | "reorderLevel" | "itemCode" | "status";

interface EditableItemRow {
  id: string;
  itemName: string;
  itemCode: string;
  category: string;
  purchasePrice: string;
  salePrice: string;
  stockQty: string;
  reorderLevel: string;
  unit: string;
  status: StockItemRecord["status"];
}

const MODE_OPTIONS: Array<{ id: BulkMode; label: string }> = [
  { id: "pricing", label: "Pricing" },
  { id: "stock", label: "Stock" },
  { id: "item-information", label: "Item Information" },
];

const CATEGORY_OPTIONS = ["Raw Materials", "Consumables", "Equipment", "Category 1", "Category 2"];
const UNIT_OPTIONS = ["pcs", "drum", "unit", "box", "kg", "ltr"];

function ColumnFilterHeader({
  label,
  columnKey,
  openFilterColumn,
  setOpenFilterColumn,
  columnFilters,
  setColumnFilters,
  filterPopoverRef,
}: {
  label: string;
  columnKey: FilterableColumn;
  openFilterColumn: FilterableColumn | null;
  setOpenFilterColumn: (value: FilterableColumn | null) => void;
  columnFilters: Partial<Record<FilterableColumn, string>>;
  setColumnFilters: (updater: (current: Partial<Record<FilterableColumn, string>>) => Partial<Record<FilterableColumn, string>>) => void;
  filterPopoverRef: RefObject<HTMLDivElement | null>;
}) {
  const isOpen = openFilterColumn === columnKey;

  return (
    <div className="relative flex items-center justify-between gap-3">
      <span className="whitespace-nowrap">{label}</span>
      <button
        type="button"
        aria-label={`Filter ${label}`}
        onClick={() => setOpenFilterColumn(isOpen ? null : columnKey)}
        className={cn(
          "shrink-0 rounded p-0.5 transition",
          columnFilters[columnKey]?.trim() ? "bg-[#edf4ff] text-[#1d66b1]" : "text-[#6e7f9b] hover:bg-[#f4f7fb]",
        )}
      >
        <Filter className="h-4 w-4" />
      </button>
      {isOpen ? (
        <div
          ref={filterPopoverRef}
          className="absolute left-0 top-full z-20 mt-1 w-[180px] rounded-[10px] border border-[#d7dfeb] bg-white p-3 text-left normal-case shadow-[0_16px_36px_rgba(15,23,42,0.14)]"
        >
          <input
            autoFocus
            type="text"
            value={columnFilters[columnKey] ?? ""}
            onChange={(event) => setColumnFilters((current) => ({ ...current, [columnKey]: event.target.value }))}
            placeholder={`Filter ${label.toLowerCase()}`}
            className="h-9 w-full rounded-[6px] border border-[#d7dfeb] px-2 text-[13px] text-[#20344f] outline-none focus:border-[#1677ff]"
          />
          <button
            type="button"
            onClick={() => setColumnFilters((current) => ({ ...current, [columnKey]: "" }))}
            className="mt-2 text-[12px] font-medium text-[#6a7d9b] hover:text-[#20344f]"
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatCurrencyInput(value: string) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "৳ ---";
  }

  return `৳ ${formatAmount(numeric)}`;
}

function toEditableRow(item: InventorySnapshotItem): EditableItemRow {
  return {
    id: item.id,
    itemName: item.itemName,
    itemCode: item.itemCode,
    category: item.category || "---",
    purchasePrice: item.rate > 0 ? String(item.rate) : "",
    salePrice: item.rate > 0 ? String(item.rate) : "",
    stockQty: item.openingQty > 0 ? String(item.openingQty) : "",
    reorderLevel: item.reorderLevel > 0 ? String(item.reorderLevel) : "",
    unit: item.unit || "pcs",
    status: item.status,
  };
}

function isSameRow(a: EditableItemRow, b: EditableItemRow) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function UpdateItemsBulkScreen() {
  const { mode, session } = useSessionContext();
  const workspaceId = session?.workspaceId ?? "";
  const queryClient = useQueryClient();
  const [bulkMode, setBulkMode] = useState<BulkMode>("pricing");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategoryChoice, setBulkCategoryChoice] = useState(CATEGORY_OPTIONS[0]);
  const [baseRows, setBaseRows] = useState<EditableItemRow[]>([]);
  const [draftRows, setDraftRows] = useState<EditableItemRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<FilterableColumn, string>>>({});
  const [openFilterColumn, setOpenFilterColumn] = useState<FilterableColumn | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const targetElement = event.target instanceof Element ? event.target : null;
      if (targetElement?.closest('button[aria-label^="Filter "]')) {
        return;
      }
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(event.target as Node)) {
        setOpenFilterColumn(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const itemsQuery = useQuery({
    queryKey: [mode, "update-items-bulk", workspaceId],
    queryFn: async () => {
      const items = await loadInventoryItems(mode, workspaceId);
      return items.map(toEditableRow);
    },
    enabled: Boolean(workspaceId),
  });

  // Synced from the query result (rather than set inline in queryFn) so a
  // cache hit that skips re-running queryFn still lands in local state —
  // otherwise a quick navigate-away-and-back could render "No items found"
  // even though itemsQuery already has the rows.
  useEffect(() => {
    if (!itemsQuery.data) {
      return;
    }

    setBaseRows(itemsQuery.data);
    setDraftRows(itemsQuery.data);
    setSelectedIds([]);
  }, [itemsQuery.data]);

  const hasChanges = useMemo(
    () => draftRows.some((draft) => !isSameRow(draft, baseRows.find((row) => row.id === draft.id) ?? draft)),
    [baseRows, draftRows],
  );

  const changeCounts = useMemo(() => {
    const baseById = new Map(baseRows.map((row) => [row.id, row]));
    let pricing = 0;
    let stock = 0;
    let itemInformation = 0;

    for (const draft of draftRows) {
      const base = baseById.get(draft.id);
      if (!base) {
        continue;
      }

      if (base.purchasePrice !== draft.purchasePrice || base.salePrice !== draft.salePrice || base.category !== draft.category) {
        pricing += 1;
      }

      if (base.unit !== draft.unit || base.stockQty !== draft.stockQty || base.reorderLevel !== draft.reorderLevel) {
        stock += 1;
      }

      if (base.itemName !== draft.itemName || base.itemCode !== draft.itemCode || base.category !== draft.category || base.status !== draft.status) {
        itemInformation += 1;
      }
    }

    return { pricing, stock, itemInformation };
  }, [baseRows, draftRows]);

  const filteredRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    const activeColumnFilters = Object.entries(columnFilters).filter(([, value]) => value?.trim());

    return draftRows.filter((row) => {
      const searchAllowed =
        !needle ||
        row.itemName.toLowerCase().includes(needle) ||
        row.itemCode.toLowerCase().includes(needle) ||
        row.category.toLowerCase().includes(needle);
      const columnsAllowed = activeColumnFilters.every(([columnId, value]) =>
        row[columnId as FilterableColumn].toLowerCase().includes((value ?? "").trim().toLowerCase()),
      );

      return searchAllowed && columnsAllowed;
    });
  }, [columnFilters, draftRows, searchTerm]);

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.includes(row.id));

  function updateRow(id: string, patch: Partial<EditableItemRow>) {
    setDraftRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function handleAssignCategory() {
    if (!selectedIds.length) {
      toast.error("Select at least one item first");
      return;
    }

    setDraftRows((current) =>
      current.map((row) => (selectedIds.includes(row.id) ? { ...row, category: bulkCategoryChoice } : row)),
    );
    toast.success(`${selectedIds.length} item(s) moved to ${bulkCategoryChoice}`);
  }

  function handleMarkInactive() {
    if (!selectedIds.length) {
      toast.error("Select at least one item first");
      return;
    }

    setDraftRows((current) =>
      current.map((row) => (selectedIds.includes(row.id) ? { ...row, status: "inactive" } : row)),
    );
    toast.success(`${selectedIds.length} item(s) marked inactive`);
  }

  async function handleSaveUpdates() {
    const changedRows = draftRows.filter((draft) => {
      const base = baseRows.find((row) => row.id === draft.id);
      return base && !isSameRow(base, draft);
    });

    if (!changedRows.length) {
      return;
    }

    setSaving(true);
    try {
      if (mode === "api") {
        await Promise.all(
          changedRows.map((draft) =>
            updateApiInventoryItem(draft.id, {
              itemName: draft.itemName.trim(),
              itemCode: draft.itemCode.trim(),
              category: draft.category === "---" ? "" : draft.category,
              unit: draft.unit,
              openingQty: Number(draft.stockQty || 0),
              // Opening Cost seeds the moving-average inventory valuation — it
              // must never silently fall back to Sale Price (see inventory-screen.tsx).
              openingRate: Number(draft.purchasePrice || 0),
              reorderLevel: Number(draft.reorderLevel || 0),
              status: draft.status,
            }),
          ),
        );
        setBaseRows(draftRows);
        void queryClient.invalidateQueries({ queryKey: [mode, "inventory-items", workspaceId] });
        toast.success(`Updated ${changedRows.length} item(s)`);
        return;
      }

      const dataset = readDataset(mode);
      const nextItems = dataset.stockItems.map((item) => {
        if (session?.workspaceId && item.workspaceId !== session.workspaceId) {
          return item;
        }

        const draft = draftRows.find((row) => row.id === item.id);
        if (!draft) {
          return item;
        }

        return {
          ...item,
          itemName: draft.itemName.trim() || item.itemName,
          itemCode: draft.itemCode.trim() || item.itemCode,
          category: draft.category === "---" ? "" : draft.category,
          openingRate: Number(draft.purchasePrice || 0),
          openingQty: Number(draft.stockQty || 0),
          reorderLevel: Number(draft.reorderLevel || 0),
          unit: draft.unit,
          status: draft.status,
        };
      });

      writeDataset(mode, {
        ...dataset,
        stockItems: nextItems,
      });

      setBaseRows(draftRows);
      void queryClient.invalidateQueries({ queryKey: [mode, "inventory-items", workspaceId] });
      toast.success(`Updated ${changedRows.length} item(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-[620px] flex-col overflow-hidden rounded-[4px] border border-[#d9e1ed] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
      <div className="flex flex-none flex-wrap items-center justify-between gap-4 border-b border-[#e5ebf3] px-7 py-4">
        <div className="text-[20px] font-semibold text-[#192c49]">Bulk Update Items</div>
        <div className="flex flex-wrap items-center gap-4">
          <CollapsibleSearch
            value={searchTerm}
            onChange={setSearchTerm}
            label="Search items"
            placeholder="Search by item name"
            expandedWidth="w-[280px]"
          />
          <div className="flex flex-wrap items-center gap-6">
            {MODE_OPTIONS.map((option) => (
              <label key={option.id} className="flex cursor-pointer items-center gap-3 text-[15px] text-[#314668]">
                <span className="relative flex h-6 w-6 items-center justify-center">
                  <input
                    type="radio"
                    className="peer sr-only"
                    name="bulk-mode"
                    checked={bulkMode === option.id}
                    onChange={() => setBulkMode(option.id)}
                  />
                  <span className="h-6 w-6 rounded-full border border-[#7f93b1] peer-checked:border-[#1677ff]" />
                  <span className="absolute h-3 w-3 rounded-full bg-[#1677ff] opacity-0 peer-checked:opacity-100" />
                </span>
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-none flex-wrap items-center justify-between gap-3 bg-[#d8ecff] px-7 py-3 text-[15px] text-[#29466f]">
        <span>{selectedIds.length} items selected</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={bulkCategoryChoice}
            onChange={(event) => setBulkCategoryChoice(event.target.value)}
            className="h-9 rounded-full border border-[#b7c5d9] bg-white px-3 text-[13px] text-[#20344f] outline-none"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAssignCategory}
            disabled={!selectedIds.length}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-[#c6c9df]"
          >
            Assign Category
          </button>
          <button
            type="button"
            onClick={handleMarkInactive}
            disabled={!selectedIds.length}
            className="inline-flex items-center gap-2 rounded-full border border-[#c9cfdd] bg-white px-4 py-2 text-[13px] font-semibold text-[#4a5a78] transition-colors hover:bg-[#f3f6fb] disabled:cursor-not-allowed disabled:text-[#a8b1c4]"
          >
            Mark Inactive
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse">
          <thead className="bg-white">
            <tr>
              <th className="w-11 border-b border-r border-[#dfe7f1] px-3 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={(event) =>
                    setSelectedIds((current) => {
                      if (event.target.checked) {
                        return Array.from(new Set([...current, ...filteredRows.map((row) => row.id)]));
                      }

                      return current.filter((id) => !filteredRows.some((row) => row.id === id));
                    })
                  }
                  className="h-4 w-4 rounded border-[#b7c5d9]"
                />
              </th>
              <th className="w-10 border-b border-r border-[#dfe7f1] px-3 py-3 text-left text-[14px] font-semibold text-[#687c9d]">#</th>
              <th className="border-b border-r border-[#dfe7f1] px-3 py-3 text-left text-[14px] font-semibold text-[#687c9d]">
                <ColumnFilterHeader
                  label="ITEM NAME*"
                  columnKey="itemName"
                  openFilterColumn={openFilterColumn}
                  setOpenFilterColumn={setOpenFilterColumn}
                  columnFilters={columnFilters}
                  setColumnFilters={setColumnFilters}
                  filterPopoverRef={filterPopoverRef}
                />
              </th>
              {bulkMode !== "stock" ? (
                <th className="border-b border-r border-[#dfe7f1] px-3 py-3 text-left text-[14px] font-semibold text-[#687c9d]">
                  <ColumnFilterHeader
                    label="CATEGORY"
                    columnKey="category"
                    openFilterColumn={openFilterColumn}
                    setOpenFilterColumn={setOpenFilterColumn}
                    columnFilters={columnFilters}
                    setColumnFilters={setColumnFilters}
                    filterPopoverRef={filterPopoverRef}
                  />
                </th>
              ) : null}
              {bulkMode === "pricing" ? (
                <>
                  <th className="border-b border-r border-[#dfe7f1] px-3 py-3 text-left text-[14px] font-semibold text-[#687c9d]">
                    <ColumnFilterHeader
                      label="PURCHASE PRICE"
                      columnKey="purchasePrice"
                      openFilterColumn={openFilterColumn}
                      setOpenFilterColumn={setOpenFilterColumn}
                      columnFilters={columnFilters}
                      setColumnFilters={setColumnFilters}
                      filterPopoverRef={filterPopoverRef}
                    />
                  </th>
                  <th className="border-b px-3 py-3 text-left text-[14px] font-semibold text-[#687c9d]">
                    <ColumnFilterHeader
                      label="SALE PRICE"
                      columnKey="salePrice"
                      openFilterColumn={openFilterColumn}
                      setOpenFilterColumn={setOpenFilterColumn}
                      columnFilters={columnFilters}
                      setColumnFilters={setColumnFilters}
                      filterPopoverRef={filterPopoverRef}
                    />
                  </th>
                </>
              ) : null}
              {bulkMode === "stock" ? (
                <>
                  <th className="border-b border-r border-[#dfe7f1] px-3 py-3 text-left text-[14px] font-semibold text-[#687c9d]">
                    <ColumnFilterHeader
                      label="UNIT"
                      columnKey="unit"
                      openFilterColumn={openFilterColumn}
                      setOpenFilterColumn={setOpenFilterColumn}
                      columnFilters={columnFilters}
                      setColumnFilters={setColumnFilters}
                      filterPopoverRef={filterPopoverRef}
                    />
                  </th>
                  <th className="border-b border-r border-[#dfe7f1] px-3 py-3 text-left text-[14px] font-semibold text-[#687c9d]">
                    <ColumnFilterHeader
                      label="OPENING STOCK"
                      columnKey="stockQty"
                      openFilterColumn={openFilterColumn}
                      setOpenFilterColumn={setOpenFilterColumn}
                      columnFilters={columnFilters}
                      setColumnFilters={setColumnFilters}
                      filterPopoverRef={filterPopoverRef}
                    />
                  </th>
                  <th className="border-b px-3 py-3 text-left text-[14px] font-semibold text-[#687c9d]">
                    <ColumnFilterHeader
                      label="REORDER LEVEL"
                      columnKey="reorderLevel"
                      openFilterColumn={openFilterColumn}
                      setOpenFilterColumn={setOpenFilterColumn}
                      columnFilters={columnFilters}
                      setColumnFilters={setColumnFilters}
                      filterPopoverRef={filterPopoverRef}
                    />
                  </th>
                </>
              ) : null}
              {bulkMode === "item-information" ? (
                <>
                  <th className="border-b border-r border-[#dfe7f1] px-3 py-3 text-left text-[14px] font-semibold text-[#687c9d]">
                    <ColumnFilterHeader
                      label="ITEM CODE"
                      columnKey="itemCode"
                      openFilterColumn={openFilterColumn}
                      setOpenFilterColumn={setOpenFilterColumn}
                      columnFilters={columnFilters}
                      setColumnFilters={setColumnFilters}
                      filterPopoverRef={filterPopoverRef}
                    />
                  </th>
                  <th className="border-b px-3 py-3 text-left text-[14px] font-semibold text-[#687c9d]">
                    <ColumnFilterHeader
                      label="STATUS"
                      columnKey="status"
                      openFilterColumn={openFilterColumn}
                      setOpenFilterColumn={setOpenFilterColumn}
                      columnFilters={columnFilters}
                      setColumnFilters={setColumnFilters}
                      filterPopoverRef={filterPopoverRef}
                    />
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {itemsQuery.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center text-sm text-[#6f7f98]">
                  Loading items...
                </td>
              </tr>
            ) : itemsQuery.isError ? (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center text-sm text-[#c0384f]">
                  Could not load items.{" "}
                  <button type="button" className="font-semibold underline" onClick={() => void itemsQuery.refetch()}>
                    Try again
                  </button>
                </td>
              </tr>
            ) : filteredRows.length ? (
              filteredRows.map((row, index) => (
                <tr key={row.id} className="border-b border-[#dfe7f1]">
                  <td className="border-r border-[#dfe7f1] px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={() =>
                        setSelectedIds((current) =>
                          current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
                        )
                      }
                      className="h-4 w-4 rounded border-[#b7c5d9]"
                    />
                  </td>
                  <td className="border-r border-[#dfe7f1] px-3 py-2.5 text-[14px] text-[#1a2f4a]">{index + 1}</td>
                  <td className="border-r border-[#dfe7f1] px-3 py-2">
                    <Input
                      value={row.itemName}
                      onChange={(event) => updateRow(row.id, { itemName: event.target.value })}
                      className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
                    />
                  </td>
                  {bulkMode !== "stock" ? (
                    <td className="border-r border-[#dfe7f1] px-3 py-2">
                      <select
                        value={row.category}
                        onChange={(event) => updateRow(row.id, { category: event.target.value })}
                        className="h-10 w-full rounded-xl border-0 bg-transparent px-0 text-sm text-[#20344f] focus:outline-none"
                      >
                        <option value="---">---</option>
                        {CATEGORY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                  ) : null}
                  {bulkMode === "pricing" ? (
                    <>
                      <td className="border-r border-[#dfe7f1] px-3 py-2">
                        <Input
                          money
                          value={row.purchasePrice}
                          onChange={(event) => updateRow(row.id, { purchasePrice: event.target.value })}
                          className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
                          placeholder={formatCurrencyInput("")}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          money
                          value={row.salePrice}
                          onChange={(event) => updateRow(row.id, { salePrice: event.target.value })}
                          className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
                          placeholder={formatCurrencyInput("")}
                        />
                      </td>
                    </>
                  ) : null}
                  {bulkMode === "stock" ? (
                    <>
                      <td className="border-r border-[#dfe7f1] px-3 py-2">
                        <select
                          value={row.unit}
                          onChange={(event) => updateRow(row.id, { unit: event.target.value })}
                          className="h-10 w-full rounded-xl border-0 bg-transparent px-0 text-sm text-[#20344f] focus:outline-none"
                        >
                          {UNIT_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border-r border-[#dfe7f1] px-3 py-2">
                        <Input
                          value={row.stockQty}
                          onChange={(event) => updateRow(row.id, { stockQty: event.target.value })}
                          className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.reorderLevel}
                          onChange={(event) => updateRow(row.id, { reorderLevel: event.target.value })}
                          className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
                          placeholder="0"
                        />
                      </td>
                    </>
                  ) : null}
                  {bulkMode === "item-information" ? (
                    <>
                      <td className="border-r border-[#dfe7f1] px-3 py-2">
                        <Input
                          value={row.itemCode}
                          onChange={(event) => updateRow(row.id, { itemCode: event.target.value })}
                          className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.status}
                          onChange={(event) => updateRow(row.id, { status: event.target.value as StockItemRecord["status"] })}
                          className="h-10 w-full rounded-xl border-0 bg-transparent px-0 text-sm text-[#20344f] focus:outline-none"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </td>
                    </>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center text-sm text-[#6f7f98]">
                  No items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-none flex-wrap items-center justify-between gap-4 bg-[#f8fafc] px-7 py-4">
        <div className="rounded-[8px] bg-[#faf3e8] px-4 py-3 text-[14px] text-[#596c8a]">
          <span className="font-semibold text-[#3e5476]">Pricing</span> - {changeCounts.pricing} Update{changeCounts.pricing === 1 ? "" : "s"},{" "}
          <span className="font-semibold text-[#3e5476]">Stock</span> - {changeCounts.stock} Update{changeCounts.stock === 1 ? "" : "s"},{" "}
          <span className="font-semibold text-[#3e5476]">Item Information</span> - {changeCounts.itemInformation} Update
          {changeCounts.itemInformation === 1 ? "" : "s"}
        </div>
        <Button
          type="button"
          className="h-10 rounded-[8px] px-8"
          onClick={() => void handleSaveUpdates()}
          disabled={!hasChanges || saving}
        >
          {saving ? "Updating..." : "Update"}
        </Button>
      </div>
    </div>
  );
}
