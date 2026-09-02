"use client";

import { Download, Filter, PackageCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import { useSessionContext } from "@/hooks/use-session-context";
import { downloadCsv } from "@/lib/download";
import { formatCurrency } from "@/lib/format";
import { roundMoney } from "@/lib/money";
import { buildWorkspaceRoute } from "@/config/routes";
import { listWorkspaces } from "@/services/workspace.service";
import { loadInventoryItems, type InventorySnapshotItem } from "@/features/screens/inventory-screen";

type ExportItemRow = Record<string, string> & {
  "Item Name": string;
  "Item Code": string;
  Category: string;
  "Sale Price": string;
  "Current Stock": string;
  "Min Stock": string;
  Workspace: string;
  "Base Unit": string;
};

function buildExportRow(item: InventorySnapshotItem, workspaceName: string): ExportItemRow {
  return {
    "Item Name": item.itemName,
    "Item Code": item.itemCode,
    Category: item.category || "",
    "Sale Price": roundMoney(item.rate || 0).toFixed(2),
    "Current Stock": String(item.quantity ?? 0),
    "Min Stock": String(item.reorderLevel ?? 0),
    Workspace: workspaceName,
    "Base Unit": item.unit ? item.unit.toUpperCase() : "",
  };
}

export function ExportItemsScreen() {
  const router = useRouter();
  const { mode, session } = useSessionContext();
  const workspaceId = session?.workspaceId ?? "";

  const itemsQuery = useQuery({
    queryKey: [mode, "export-items", workspaceId],
    queryFn: () => loadInventoryItems(mode, workspaceId),
    enabled: Boolean(workspaceId),
  });

  const workspacesQuery = useQuery({
    queryKey: [mode, "workspaces"],
    queryFn: () => listWorkspaces(mode),
    enabled: Boolean(workspaceId),
  });

  const workspaceName = useMemo(
    () => workspacesQuery.data?.find((workspace) => workspace.id === workspaceId)?.name ?? "Current Workspace",
    [workspacesQuery.data, workspaceId],
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [columnFilters, setColumnFilters] = useState<Partial<Record<keyof ExportItemRow, string>>>({});
  const [openFilterColumn, setOpenFilterColumn] = useState<keyof ExportItemRow | null>(null);
  const [previewItem, setPreviewItem] = useState<InventorySnapshotItem | null>(null);
  const [selectedItemCodes, setSelectedItemCodes] = useState<string[]>([]);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function closeFilter(event: PointerEvent) {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(event.target as Node)) {
        setOpenFilterColumn(null);
      }
    }
    document.addEventListener("pointerdown", closeFilter);
    return () => document.removeEventListener("pointerdown", closeFilter);
  }, []);

  const rows = useMemo(() => (itemsQuery.data ?? []).map((item) => buildExportRow(item, workspaceName)), [itemsQuery.data, workspaceName]);

  const filteredRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch =
        !needle ||
        row["Item Name"].toLowerCase().includes(needle) ||
        row["Item Code"].toLowerCase().includes(needle) ||
        row.Category.toLowerCase().includes(needle);
      const matchesColumns = Object.entries(columnFilters).every(([key, value]) => {
        const filterValue = (value ?? "").trim().toLowerCase();
        return !filterValue || row[key as keyof ExportItemRow].toLowerCase().includes(filterValue);
      });
      return matchesSearch && matchesColumns;
    });
  }, [columnFilters, rows, searchTerm]);
  const hasActiveFilters = Boolean(searchTerm.trim()) || Object.values(columnFilters).some((value) => value?.trim());
  const selectedRows = rows.filter((row) => selectedItemCodes.includes(row["Item Code"]));
  const visibleSelectedCount = filteredRows.filter((row) => selectedItemCodes.includes(row["Item Code"])).length;
  const allVisibleSelected = filteredRows.length > 0 && visibleSelectedCount === filteredRows.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected;
    }
  }, [allVisibleSelected, visibleSelectedCount]);

  function toggleItemSelection(itemCode: string) {
    setSelectedItemCodes((current) => current.includes(itemCode) ? current.filter((code) => code !== itemCode) : [...current, itemCode]);
  }

  function toggleAllVisible() {
    const visibleCodes = filteredRows.map((row) => row["Item Code"]);
    setSelectedItemCodes((current) => allVisibleSelected
      ? current.filter((code) => !visibleCodes.includes(code))
      : Array.from(new Set([...current, ...visibleCodes])));
  }

  function openInventoryItem(item: InventorySnapshotItem) {
    const tab = item.kind === "service" ? "services" : "products";
    router.push(`${buildWorkspaceRoute(mode, "/masters/inventory")}?tab=${tab}&item=${encodeURIComponent(item.id)}`);
  }

  function previewInventoryItem(row: ExportItemRow) {
    const item = itemsQuery.data?.find((candidate) => candidate.itemCode === row["Item Code"]);
    if (item) setPreviewItem(item);
  }

  function handleExport() {
    if (!selectedRows.length) {
      toast.error("Select at least one item to export");
      return;
    }

    const workspaceSlug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
    downloadCsv(`${workspaceSlug}-bizovix-items.csv`, selectedRows);
    toast.success(`${selectedRows.length} selected item(s) exported`);
  }

  const columns: Array<{ key: keyof ExportItemRow; width: string }> = [
    { key: "Item Name", width: "18%" },
    { key: "Item Code", width: "14%" },
    { key: "Category", width: "13%" },
    { key: "Sale Price", width: "10%" },
    { key: "Current Stock", width: "10%" },
    { key: "Min Stock", width: "9%" },
    { key: "Workspace", width: "16%" },
    { key: "Base Unit", width: "10%" },
  ];
  const totalStock = rows.reduce((sum, row) => sum + Number(row["Current Stock"] || 0), 0);
  const filteredStock = filteredRows.reduce((sum, row) => sum + Number(row["Current Stock"] || 0), 0);
  const selectedStock = selectedRows.reduce((sum, row) => sum + Number(row["Current Stock"] || 0), 0);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] min-w-0 flex-col overflow-hidden rounded-[8px] border border-[#d8e1ed] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-none items-center justify-between gap-3 border-b border-[#e3ebf4] bg-white px-5 py-3">
          <div className="text-sm text-[#697791]">
            {hasActiveFilters ? `${filteredRows.length} of ${rows.length} items matched` : `${rows.length} items in this workspace`}
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters ? <button type="button" onClick={() => { setSearchTerm(""); setColumnFilters({}); setOpenFilterColumn(null); }} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-[#e06808] transition hover:bg-[#fff3e8]">Clear all filters</button> : null}
            <CollapsibleSearch value={searchTerm} onChange={setSearchTerm} label="Search items" placeholder="Search by item name, code, or category" expandedWidth="w-[280px]" />
            <button type="button" onClick={() => router.back()} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#d8e1ed] bg-white text-[#718096] transition hover:bg-[#f7faff] hover:text-[#24365a]" aria-label="Close export items"><X className="h-4.5 w-4.5" /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <table className="w-full table-fixed border-separate border-spacing-0 text-left text-[14px] text-[#4b5568]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#f7f9fc] text-[12px] font-semibold uppercase text-[#687793]">
                <th className="w-12 border-b border-r border-[#dce5f0] px-3 py-3 text-center">
                  <input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} disabled={!filteredRows.length} onChange={toggleAllVisible} aria-label="Select all visible items" className="h-4 w-4 cursor-pointer accent-[#e96f0b] disabled:cursor-not-allowed" />
                </th>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className="relative border-b border-r border-[#dce5f0] px-3 py-3 align-top last:border-r-0"
                    style={{ width: column.width }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{column.key}</span>
                      <button
                        type="button"
                        aria-label={`Filter ${column.key}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setOpenFilterColumn((current) => current === column.key ? null : column.key)}
                        className={`rounded p-1 transition hover:bg-[#e8eef7] ${columnFilters[column.key] ? "bg-[#e7f0ff] text-[#246fc1]" : "text-[#6b7b92]"}`}
                      >
                        <Filter className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {openFilterColumn === column.key ? (
                      <div ref={filterPopoverRef} className="absolute right-2 top-[calc(100%-3px)] z-30 w-56 rounded-lg border border-[#d5dfeb] bg-white p-3 text-left normal-case shadow-[0_14px_34px_rgba(15,23,42,0.16)]">
                        <label className="mb-1.5 block text-xs font-semibold text-[#4a5d76]">Filter {column.key}</label>
                        <input autoFocus value={columnFilters[column.key] ?? ""} onChange={(event) => setColumnFilters((current) => ({ ...current, [column.key]: event.target.value }))} placeholder={`Type ${column.key.toLowerCase()}...`} className="h-9 w-full rounded-md border border-[#ccd8e6] px-2.5 text-sm font-normal text-[#203550] outline-none focus:border-[#4388d3]" />
                        <button type="button" onClick={() => { setColumnFilters((current) => ({ ...current, [column.key]: "" })); setOpenFilterColumn(null); }} className="mt-2 text-xs font-semibold text-[#e06808] hover:text-[#bd5605]">Clear filter</button>
                      </div>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itemsQuery.isLoading ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-16 text-center text-[15px] text-[#7b8aa2]">
                    Loading items...
                  </td>
                </tr>
              ) : itemsQuery.error ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-16 text-center text-[15px] text-[#e05243]">
                    Could not load items. Please refresh and try again.
                  </td>
                </tr>
              ) : filteredRows.length ? (
                filteredRows.map((row, index) => (
                  <tr key={`${row["Item Code"] || "item"}-${index}`} tabIndex={0} role="button" onClick={() => previewInventoryItem(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); previewInventoryItem(row); } }} className="cursor-pointer transition hover:bg-[#f3f8ff] focus:bg-[#f3f8ff] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#8bb8eb]">
                    <td className="border-b border-r border-[#edf2f7] px-3 py-3 text-center"><input type="checkbox" checked={selectedItemCodes.includes(row["Item Code"])} onClick={(event) => event.stopPropagation()} onChange={() => toggleItemSelection(row["Item Code"])} aria-label={`Select ${row["Item Name"]}`} className="h-4 w-4 cursor-pointer accent-[#e96f0b]" /></td>
                    {columns.map((column) => (
                      <td
                        key={`${row["Item Code"] || "item"}-${index}-${column.key}`}
                        className="truncate border-b border-r border-[#edf2f7] px-3 py-3 text-[14px] text-[#50596c] last:border-r-0"
                        title={row[column.key] || ""}
                      >
                        {row[column.key] || ""}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-16 text-center text-[15px] text-[#7b8aa2]">
                    <div className="flex flex-col items-center gap-3">
                      <PackageCheck className="h-10 w-10 text-[#9aa9bf]" />
                      <span>{hasActiveFilters ? "No items matched the selected filters." : "No items available for this workspace yet."}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dbe5ef] bg-[#fbfcff] px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-[#697791]">
            <span>Items: <strong className="font-semibold tabular-nums text-[#24365a]">{filteredRows.length}</strong>{hasActiveFilters ? ` of ${rows.length}` : ""}</span>
            <span>Current stock: <strong className="font-semibold tabular-nums text-[#24365a]">{filteredStock}</strong>{hasActiveFilters ? ` of ${totalStock}` : ""}</span>
            <span>Selected: <strong className="font-semibold tabular-nums text-[#e06808]">{selectedRows.length}</strong> · Stock: <strong className="font-semibold tabular-nums text-[#e06808]">{selectedStock}</strong></span>
            <span className="hidden text-[#8a98ab] md:inline">{workspaceName}</span>
          </div>
          <Button
            type="button"
            onClick={handleExport}
            disabled={itemsQuery.isLoading || !selectedRows.length}
            className="h-10 rounded-[10px] bg-primary px-5 text-[15px] font-semibold text-white shadow-[0_10px_22px_rgba(230,120,23,0.18)] hover:bg-[#cf670f]"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(previewItem)} onOpenChange={(open) => { if (!open) setPreviewItem(null); }}>
        <DialogContent className="w-[min(94vw,680px)] overflow-hidden rounded-2xl p-0">
          {previewItem ? (
            <>
              <div className="border-b border-[#e2eaf3] bg-[#f8fbff] px-6 py-5 pr-12">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eaf3ff] text-[#2f78c8]"><PackageCheck className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <DialogTitle className="truncate text-xl text-[#203550]">{previewItem.itemName}</DialogTitle>
                    <DialogDescription className="mt-1">{previewItem.itemCode} · {previewItem.category || "Uncategorized"}</DialogDescription>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-[#dce7f3] bg-[#fbfdff] p-4"><div className="text-xs font-semibold uppercase tracking-wide text-[#8190a6]">Current stock</div><div className="mt-2 text-xl font-bold text-[#203550]">{previewItem.quantity} <span className="text-sm font-semibold text-[#71819a]">{previewItem.unit.toUpperCase()}</span></div></div>
                  <div className="rounded-xl border border-[#dce7f3] bg-[#fbfdff] p-4"><div className="text-xs font-semibold uppercase tracking-wide text-[#8190a6]">Sale price</div><div className="mt-2 text-lg font-bold text-[#203550]">{formatCurrency(previewItem.rate)}</div></div>
                  <div className="rounded-xl border border-[#dce7f3] bg-[#fbfdff] p-4"><div className="text-xs font-semibold uppercase tracking-wide text-[#8190a6]">Stock value</div><div className="mt-2 text-lg font-bold text-[#203550]">{formatCurrency(previewItem.stockValue)}</div></div>
                  <div className="rounded-xl border border-[#e5eaf1] p-4"><div className="text-xs text-[#8190a6]">Minimum stock</div><div className="mt-1 font-semibold text-[#34465f]">{previewItem.reorderLevel} {previewItem.unit.toUpperCase()}</div></div>
                  <div className="rounded-xl border border-[#e5eaf1] p-4"><div className="text-xs text-[#8190a6]">Base unit</div><div className="mt-1 font-semibold text-[#34465f]">{previewItem.unit.toUpperCase()}</div></div>
                  <div className="rounded-xl border border-[#e5eaf1] p-4"><div className="text-xs text-[#8190a6]">Status</div><div className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${previewItem.status === "active" ? "bg-[#eaf8ef] text-[#16804a]" : "bg-[#f1f3f6] text-[#697791]"}`}>{previewItem.status === "active" ? "Active" : "Inactive"}</div></div>
                </div>

                {previewItem.description ? <div className="mt-4 rounded-xl border border-[#e5eaf1] bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-[#8190a6]">Description</div><p className="mt-2 text-sm leading-6 text-[#526177]">{previewItem.description}</p></div> : null}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5eaf1] pt-4">
                  <span className={`text-sm font-semibold ${previewItem.quantity <= previewItem.reorderLevel ? "text-[#c75b13]" : "text-[#16804a]"}`}>{previewItem.quantity <= previewItem.reorderLevel ? "Stock is at or below the minimum level" : "Stock level is healthy"}</span>
                  <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setPreviewItem(null)}>Close</Button><Button type="button" onClick={() => openInventoryItem(previewItem)}>Open in Inventory</Button></div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
