"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  Wand2,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatAmount } from "@/lib/format";
import { sumMoney } from "@/lib/money";
import { slugify } from "@/lib/utils";
import {
  createWarehouse,
  createWarehouseTransfer,
  deleteWarehouse,
  listWarehouseStock,
  listWarehouses,
  listStockLedger,
  updateWarehouse,
  type WarehouseRecord,
  type WarehouseStockRow,
  type StockLedgerRow,
  type WarehouseType,
} from "@/services/warehouse.service";

const warehouseTypeLabels: Record<WarehouseType, string> = {
  GENERAL: "General",
  RAW_MATERIAL: "Raw Material",
  WIP: "Production / WIP",
  FINISHED_GOODS: "Finished Goods",
  REJECTED: "Rejected / Damaged",
  SCRAP: "Scrap",
  SHOWROOM: "Showroom",
};

const emptyForm = {
  name: "",
  code: "",
  address: "",
  description: "",
  type: "GENERAL" as WarehouseType,
  allowGrn: true,
  allowSales: true,
  allowMaterialIssue: false,
  isDefault: false,
  isActive: true,
};

function buildWarehouseCode(name: string, existingCodes: Set<string>) {
  const cleanedName = name.replace(/warehouse/gi, "").trim() || name;
  const stem = slugify(cleanedName).replace(/-/g, "").toUpperCase().slice(0, 15) || "WH";
  let code = stem;
  let suffix = 2;
  while (existingCodes.has(code)) {
    code = `${stem}-${suffix}`;
    suffix += 1;
  }
  return code;
}

export function WarehouseSettingsPanel({ onWarehouseCountChange }: { onWarehouseCountChange?: (count: number) => void }) {
  const { mode, session } = useSessionContext();
  const workspaceId = session?.workspaceId ?? "";
  const [rows, setRows] = useState<WarehouseRecord[]>([]);
  const [stock, setStock] = useState<WarehouseStockRow[]>([]);
  const [ledger, setLedger] = useState<StockLedgerRow[]>([]);
  const [query, setQuery] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [codeTouched, setCodeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transfer, setTransfer] = useState({
    fromWarehouseId: "",
    toWarehouseId: "",
    notes: "",
    lines: [{ inventoryItemId: "", quantity: "" }],
  });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    if (mode !== "api") {
      const demoRows: WarehouseRecord[] = [
        {
          id: "demo-main",
          name: "Main Warehouse",
          code: "WH-MAIN",
          address: null,
          description: "System default warehouse",
          type: "GENERAL",
          allowGrn: true,
          allowSales: true,
          allowMaterialIssue: false,
          isDefault: true,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ];
      setRows(demoRows);
      onWarehouseCountChange?.(demoRows.length);
      return;
    }
    try {
      const [warehouses, balances, movements] = await Promise.all([
        listWarehouses(workspaceId),
        listWarehouseStock(workspaceId),
        listStockLedger(workspaceId),
      ]);
      setRows(warehouses);
      onWarehouseCountChange?.(warehouses.length);
      setStock(balances);
      setLedger(movements);
      setSelectedWarehouseId((current) => current !== "all" && warehouses.some((warehouse) => warehouse.id === current) ? current : warehouses[0]?.id ?? "all");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load warehouses",
      );
    }
  }, [mode, onWarehouseCountChange, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          `${row.name} ${row.code} ${row.address ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [query, rows, selectedWarehouseId],
  );
  const selectedWarehouse = rows.find((row) => row.id === selectedWarehouseId) ?? null;
  const selectedWarehouseItems = useMemo(() => {
    const items = new Map(
      stock
        .filter((item) => item.warehouseId === selectedWarehouseId)
        .map((item) => [item.inventoryItemId, item]),
    );
    const movements = ledger.filter(
      (movement) => movement.warehouseId === selectedWarehouseId,
    );

    for (const movement of movements) {
      if (!items.has(movement.inventoryItemId)) {
        items.set(movement.inventoryItemId, {
          warehouseId: movement.warehouseId,
          warehouseName: movement.warehouse.name,
          warehouseCode: movement.warehouse.code,
          inventoryItemId: movement.inventoryItemId,
          itemCode: movement.inventoryItem.itemCode,
          itemName: movement.inventoryItem.itemName,
          category: "—",
          unit: movement.inventoryItem.unit,
          quantity: movement.balanceQuantity,
          averageCost: movement.averageCost,
          stockValue: movement.balanceValue,
        });
      }
    }

    return [...items.values()].map((item) => {
      const itemMovements = movements.filter(
        (movement) => movement.inventoryItemId === item.inventoryItemId,
      );
      const totalIn = itemMovements
        .filter((movement) => movement.movementType === "IN")
        .reduce((sum, movement) => sum + movement.quantity, 0);
      const totalOut = itemMovements
        .filter((movement) => movement.movementType === "OUT")
        .reduce((sum, movement) => sum + movement.quantity, 0);
      return { ...item, totalIn, totalOut };
    });
  }, [ledger, selectedWarehouseId, stock]);
  const selectedWarehouseStockValue = useMemo(
    () => sumMoney(selectedWarehouseItems.map((item) => item.stockValue)),
    [selectedWarehouseItems],
  );
  const stockTotals = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.id,
          stock
            .filter((item) => item.warehouseId === row.id)
            .reduce((sum, item) => sum + item.quantity, 0),
        ]),
      ),
    [rows, stock],
  );

  const existingCodes = useMemo(
    () =>
      new Set(
        rows
          .filter((row) => row.id !== editing?.id)
          .map((row) => row.code.toUpperCase()),
      ),
    [rows, editing],
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setCodeTouched(false);
    setDialogOpen(true);
  }
  function openEdit(row: WarehouseRecord) {
    setEditing(row);
    setForm({
      name: row.name,
      code: row.code,
      address: row.address ?? "",
      description: row.description ?? "",
      type: row.type,
      allowGrn: row.allowGrn,
      allowSales: row.allowSales,
      allowMaterialIssue: row.allowMaterialIssue,
      isDefault: row.isDefault,
      isActive: row.isActive,
    });
    setCodeTouched(true);
    setDialogOpen(true);
  }
  function handleNameChange(name: string) {
    setForm((x) => ({
      ...x,
      name,
      code:
        !editing && !codeTouched
          ? name.trim()
            ? buildWarehouseCode(name, existingCodes)
            : ""
          : x.code,
    }));
  }
  function handleAssignCode() {
    setForm((x) => ({ ...x, code: buildWarehouseCode(x.name, existingCodes) }));
    setCodeTouched(false);
  }
  async function save() {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error("Warehouse name and code are required");
      return;
    }
    if (mode !== "api") {
      toast.info("Warehouse changes are available in the live workspace");
      return;
    }
    setSaving(true);
    try {
      if (editing) await updateWarehouse(editing.id, form);
      else await createWarehouse(workspaceId, form);
      toast.success(editing ? "Warehouse updated" : "Warehouse created");
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save warehouse",
      );
    } finally {
      setSaving(false);
    }
  }
  async function changeStatus(
    row: WarehouseRecord,
    patch: Partial<typeof emptyForm>,
  ) {
    if (mode !== "api") return;
    try {
      await updateWarehouse(row.id, {
        name: row.name,
        code: row.code,
        address: row.address ?? "",
        description: row.description ?? "",
        type: row.type,
        allowGrn: row.allowGrn,
        allowSales: row.allowSales,
        allowMaterialIssue: row.allowMaterialIssue,
        isDefault: row.isDefault,
        isActive: row.isActive,
        ...patch,
      });
      await load();
      toast.success(
        patch.isDefault
          ? "Default warehouse changed"
          : "Warehouse status updated",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update warehouse",
      );
    }
  }
  async function remove(row: WarehouseRecord) {
    if (
      !window.confirm(
        `Delete ${row.name}? Used warehouses can only be deactivated.`,
      ) ||
      mode !== "api"
    )
      return;
    try {
      await deleteWarehouse(row.id);
      await load();
      toast.success("Warehouse deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete warehouse",
      );
    }
  }
  async function postTransfer() {
    const lines = transfer.lines
      .filter((line) => line.inventoryItemId && Number(line.quantity) > 0)
      .map((line) => ({ inventoryItemId: line.inventoryItemId, quantity: Number(line.quantity) }));
    if (
      !transfer.fromWarehouseId ||
      !transfer.toWarehouseId ||
      !lines.length ||
      lines.length !== transfer.lines.length
    ) {
      toast.error("Select both warehouses and complete every item row");
      return;
    }
    if (new Set(lines.map((line) => line.inventoryItemId)).size !== lines.length) {
      toast.error("The same item cannot be added more than once");
      return;
    }
    const overdrawnLine = lines.find((line) => {
      const available = stock.find((item) => item.warehouseId === transfer.fromWarehouseId && item.inventoryItemId === line.inventoryItemId)?.quantity ?? 0;
      return line.quantity > available;
    });
    if (overdrawnLine) {
      toast.error("Transfer quantity cannot exceed available stock");
      return;
    }
    setSaving(true);
    try {
      await createWarehouseTransfer({
        workspaceId,
        transferDate: new Date().toISOString().slice(0, 10),
        fromWarehouseId: transfer.fromWarehouseId,
        toWarehouseId: transfer.toWarehouseId,
        notes: transfer.notes,
        lines,
      });
      setTransferOpen(false);
      setTransfer({
        fromWarehouseId: "",
        toWarehouseId: "",
        notes: "",
        lines: [{ inventoryItemId: "", quantity: "" }],
      });
      await load();
      toast.success("Warehouse transfer posted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transfer failed");
    } finally {
      setSaving(false);
    }
  }
  const sourceProducts = useMemo(
    () => stock.filter((row) => row.warehouseId === transfer.fromWarehouseId && row.quantity > 0),
    [stock, transfer.fromWarehouseId],
  );
  return (
    <section className="space-y-3">
      <div data-warehouse-panel-header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white pb-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold text-[#132949]">
            <WarehouseIcon data-warehouse-header-icon className="h-5 w-5 text-[#3973e8]" />
            Warehouse
          </div>
          <p className="mt-0.5 text-xs text-[#73819b]">
            Manage stock locations and the default warehouse for new
            transactions.
          </p>
        </div>
        <div data-warehouse-panel-actions className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setTransferOpen(true)}
          >
            Stock Transfer
          </Button>
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Warehouse
          </Button>
        </div>
      </div>
      <div data-warehouse-settings-layout className="grid min-h-[560px] overflow-hidden rounded-lg border border-[#dfe6ef] lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[clamp(220px,18vw,300px)_minmax(0,1fr)]">
        <aside className="border-r border-[#dfe6ef] bg-white">
          <div className="border-b border-[#dfe6ef] p-3"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b98aa]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search warehouse..." className="h-9 pl-9" /></div></div>
          <div className="divide-y divide-[#e8edf4]">
            {filtered.map((row) => (
              <button key={row.id} type="button" onClick={() => setSelectedWarehouseId(row.id)} className={`w-full px-4 py-3 text-left transition-colors ${selectedWarehouseId === row.id ? "bg-[#eaf3ff]" : "hover:bg-[#f8fafc]"}`}>
                <div className="flex items-start justify-between gap-2"><span className="font-semibold text-[#213650]">{row.name}</span><span className="text-xs tabular-nums text-[#53627a]">{stockTotals.get(row.id) ?? 0} units</span></div>
                <div className="mt-1 flex items-center gap-2 text-xs text-[#73819b]"><span>{row.code}</span><span>·</span><span>{warehouseTypeLabels[row.type]}</span>{row.isDefault ? <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">Default</span> : null}</div>
              </button>
            ))}
            {!filtered.length ? <div className="px-4 py-10 text-center text-sm text-[#7a8799]">No warehouses found.</div> : null}
          </div>
        </aside>
        <section className="min-w-0 bg-white">
          {selectedWarehouse ? <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe6ef] bg-[#f7faff] px-4 py-3">
              <div><div className="text-lg font-semibold text-[#213650]">{selectedWarehouse.name}</div><div className="mt-0.5 text-xs text-[#73819b]">{selectedWarehouse.code} · {warehouseTypeLabels[selectedWarehouse.type]} · {selectedWarehouse.isActive ? "Active" : "Inactive"}</div></div>
              <div className="flex gap-1"><button type="button" onClick={() => openEdit(selectedWarehouse)} title="Edit warehouse" className="rounded p-2 hover:bg-white"><Pencil className="h-4 w-4" /></button><button type="button" disabled={selectedWarehouse.isDefault} onClick={() => void changeStatus(selectedWarehouse, { isActive: !selectedWarehouse.isActive })} title={selectedWarehouse.isActive ? "Deactivate" : "Activate"} className="rounded p-2 hover:bg-white disabled:opacity-30"><Power className="h-4 w-4" /></button><button type="button" disabled={selectedWarehouse.isDefault || !selectedWarehouse.isActive} onClick={() => void changeStatus(selectedWarehouse, { isDefault: true, isActive: true })} title="Set as Default" className="rounded p-2 hover:bg-white disabled:opacity-30"><Check className="h-4 w-4" /></button><button type="button" disabled={selectedWarehouse.isDefault} onClick={() => void remove(selectedWarehouse)} title="Delete" className="rounded p-2 text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div>
            </div>
            <div data-warehouse-items-viewport className="min-w-0 overflow-x-hidden">
              <table data-warehouse-items-table className="w-full table-fixed text-left text-[11px] 2xl:text-sm">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[14%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[18%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                </colgroup>
                <thead className="bg-[#fbfdff] text-[10px] uppercase leading-tight text-[#66758b] 2xl:text-xs">
                  <tr>
                    <th className="break-words px-1.5 py-2 2xl:px-3 2xl:py-3">Item</th>
                    <th className="break-words px-1.5 py-2 2xl:px-3 2xl:py-3">Category</th>
                    <th className="break-words px-1.5 py-2 text-right 2xl:px-3 2xl:py-3">Total In</th>
                    <th className="break-words px-1.5 py-2 text-right 2xl:px-3 2xl:py-3">Total Out</th>
                    <th className="break-words px-1.5 py-2 text-right 2xl:px-3 2xl:py-3">Available / In Stock</th>
                    <th className="break-words px-1.5 py-2 text-right 2xl:px-3 2xl:py-3">Unit Price</th>
                    <th className="break-words px-1.5 py-2 text-right 2xl:px-3 2xl:py-3">Total Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8edf4]">
                  {selectedWarehouseItems.map((item) => (
                    <tr key={item.inventoryItemId}>
                      <td className="break-words px-1.5 py-2 2xl:px-3 2xl:py-3"><div className="font-medium text-[#213650]">{item.itemName}</div><div className="text-[10px] text-[#73819b] 2xl:text-xs">{item.itemCode}</div></td>
                      <td className="break-words px-1.5 py-2 2xl:px-3 2xl:py-3">{item.category}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums text-[#08783d] 2xl:px-3 2xl:py-3">{item.totalIn} {item.unit}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums text-[#c2410c] 2xl:px-3 2xl:py-3">{item.totalOut} {item.unit}</td>
                      <td className="px-1.5 py-2 text-right font-semibold tabular-nums 2xl:px-3 2xl:py-3">{item.quantity} {item.unit}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums 2xl:px-3 2xl:py-3">BDT {formatAmount(item.averageCost)}</td>
                      <td className="px-1.5 py-2 text-right font-semibold tabular-nums 2xl:px-3 2xl:py-3">BDT {formatAmount(item.stockValue)}</td>
                    </tr>
                  ))}
                  {!selectedWarehouseItems.length ? <tr><td colSpan={7} className="px-4 py-16 text-center text-[#7a8799]">No stock movements found for this warehouse.</td></tr> : null}
                </tbody>
                <tfoot className="border-t-2 border-[#d7e1ee] bg-[#f7faff] font-semibold">
                  <tr>
                    <td colSpan={4} className="px-1.5 py-2 2xl:px-3 2xl:py-3">Warehouse Total</td>
                    <td className="px-1.5 py-2 text-right tabular-nums 2xl:px-3 2xl:py-3">{selectedWarehouseItems.reduce((sum, item) => sum + item.quantity, 0)} units</td>
                    <td />
                    <td className="px-1.5 py-2 text-right tabular-nums 2xl:px-3 2xl:py-3">BDT {formatAmount(selectedWarehouseStockValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </> : <div className="flex min-h-[420px] items-center justify-center text-sm text-[#7a8799]">Select a warehouse to view stock.</div>}
        </section>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>
            {editing ? "Edit Warehouse" : "Add Warehouse"}
          </DialogTitle>
          <DialogDescription>
            Warehouse codes are unique inside this workspace.
          </DialogDescription>
          <div className="grid gap-4 py-3">
            <label className="text-sm font-medium">
              Warehouse Name *
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </label>
            <label className="text-sm font-medium">
              Warehouse Code *
              <div className="mt-1 flex items-center gap-2">
                <Input
                  className="uppercase"
                  value={form.code}
                  onChange={(e) => {
                    setCodeTouched(true);
                    setForm((x) => ({ ...x, code: e.target.value.toUpperCase() }));
                  }}
                  placeholder="Auto-generated from name"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={handleAssignCode}
                  title="Auto-generate a code from the warehouse name"
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              </div>
            </label>
            <label className="text-sm font-medium">
              Address / Location
              <Input
                className="mt-1"
                value={form.address}
                onChange={(e) =>
                  setForm((x) => ({ ...x, address: e.target.value }))
                }
              />
            </label>
            <label className="text-sm font-medium">
              Warehouse Type *
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                value={form.type}
                onChange={(e) => setForm((x) => ({ ...x, type: e.target.value as WarehouseType }))}
              >
                {Object.entries(warehouseTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Description
              <textarea
                className="mt-1 min-h-20 w-full rounded-md border border-input px-3 py-2 text-sm"
                value={form.description}
                onChange={(e) =>
                  setForm((x) => ({ ...x, description: e.target.value }))
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-3 rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.allowGrn} onChange={(e) => setForm((x) => ({ ...x, allowGrn: e.target.checked }))} />
                Allow GRN
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.allowSales} onChange={(e) => setForm((x) => ({ ...x, allowSales: e.target.checked }))} />
                Allow Sales
              </label>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.allowMaterialIssue} onChange={(e) => setForm((x) => ({ ...x, allowMaterialIssue: e.target.checked }))} />
                Allow Manufacturing Material Issue
              </label>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) =>
                    setForm((x) => ({
                      ...x,
                      isDefault: e.target.checked,
                      isActive: e.target.checked ? true : x.isActive,
                    }))
                  }
                />
                Default Warehouse
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  disabled={form.isDefault}
                  onChange={(e) =>
                    setForm((x) => ({ ...x, isActive: e.target.checked }))
                  }
                />
                Active
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving..." : "Save Warehouse"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Warehouse Transfer</DialogTitle>
          <DialogDescription>
            Posting is atomic and keeps total company stock unchanged.
          </DialogDescription>
          <div className="grid gap-4 py-3">
            <label className="text-sm font-medium">
              From Warehouse *
              <select
                className="mt-1 h-10 w-full rounded-md border px-3"
                value={transfer.fromWarehouseId}
                onChange={(e) =>
                  setTransfer((x) => ({
                    ...x,
                    fromWarehouseId: e.target.value,
                    toWarehouseId: x.toWarehouseId === e.target.value ? "" : x.toWarehouseId,
                    lines: [{ inventoryItemId: "", quantity: "" }],
                  }))
                }
              >
                <option value="">Select warehouse</option>
                {rows
                  .filter((x) => x.isActive)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.code} — {x.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              To Warehouse *
              <select
                className="mt-1 h-10 w-full rounded-md border px-3"
                value={transfer.toWarehouseId}
                onChange={(e) =>
                  setTransfer((x) => ({ ...x, toWarehouseId: e.target.value }))
                }
              >
                <option value="">Select warehouse</option>
                {rows
                  .filter(
                    (x) => x.isActive && x.id !== transfer.fromWarehouseId,
                  )
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.code} — {x.name}
                    </option>
                  ))}
              </select>
            </label>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Transfer Items *</span>
                <Button type="button" size="sm" variant="outline" disabled={!transfer.fromWarehouseId} onClick={() => setTransfer((x) => ({ ...x, lines: [...x.lines, { inventoryItemId: "", quantity: "" }] }))}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Item
                </Button>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-[#dfe6ef] p-2">
                {transfer.lines.map((line, index) => {
                  const selected = sourceProducts.find((item) => item.inventoryItemId === line.inventoryItemId);
                  return (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_110px_34px] gap-2 rounded-md bg-[#f8fafc] p-2">
                      <div>
                        <select className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={line.inventoryItemId} onChange={(event) => setTransfer((current) => ({ ...current, lines: current.lines.map((item, itemIndex) => itemIndex === index ? { ...item, inventoryItemId: event.target.value, quantity: "" } : item) }))}>
                          <option value="">Select item</option>
                          {sourceProducts.map((item) => <option key={item.inventoryItemId} value={item.inventoryItemId} disabled={transfer.lines.some((other, otherIndex) => otherIndex !== index && other.inventoryItemId === item.inventoryItemId)}>{item.itemCode} — {item.itemName} ({item.quantity} {item.unit})</option>)}
                        </select>
                        {selected ? <div className="mt-1 text-[11px] text-[#73819b]">Available: {selected.quantity} {selected.unit}</div> : null}
                      </div>
                      <Input type="number" min="0.0001" max={selected?.quantity} step="0.0001" placeholder="Qty" value={line.quantity} onChange={(event) => setTransfer((current) => ({ ...current, lines: current.lines.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item) }))} />
                      <button type="button" aria-label="Remove item" disabled={transfer.lines.length === 1} onClick={() => setTransfer((current) => ({ ...current, lines: current.lines.filter((_, itemIndex) => itemIndex !== index) }))} className="flex h-9 items-center justify-center rounded-md text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  );
                })}
                {!transfer.fromWarehouseId ? <div className="py-4 text-center text-xs text-[#7a8799]">Select a source warehouse first.</div> : null}
              </div>
            </div>
            <label className="text-sm font-medium">
              Notes
              <Input
                className="mt-1"
                value={transfer.notes}
                onChange={(e) =>
                  setTransfer((x) => ({ ...x, notes: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTransferOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void postTransfer()}
            >
              {saving ? "Posting..." : "Post Transfer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
