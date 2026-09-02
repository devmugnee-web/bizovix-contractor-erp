"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import {
  ArrowUpDown,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  EllipsisVertical,
  FileText,
  Filter,
  List as ListIcon,
  PackagePlus,
  Pencil,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Wallet,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { AppDateInput } from "@/components/shared/app-date-input";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorPanel } from "@/components/shared/error-panel";
import { LoadingPanel } from "@/components/shared/loading-panel";
import { TablePagination } from "@/components/shared/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildPurchaseStartRoute, buildVoucherRoute, buildWorkspaceRoute } from "@/config/routes";
import { useColumnResize } from "@/hooks/use-column-resize";
import { useWorkflowSettingsQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { useUiStore } from "@/stores/ui-store";
import { useTransientScrollbar } from "@/hooks/use-transient-scrollbar";
import { getInventoryOptions } from "@/lib/erp-data";
import { downloadCsv, openInvoicePdf, printInvoice } from "@/lib/download";
import { formatCurrency, formatDate, formatMoneyInput, formatNumber } from "@/lib/format";
import { roundMoney, sumMoney } from "@/lib/money";
import { buildInvoiceExportPayloadFromVoucher } from "@/lib/invoice";
import { cn, slugify } from "@/lib/utils";
import { apiRequest } from "@/services/api-client";
import { readDataset, writeDataset } from "@/services/browser-dataset";
import { moveItemToRecycleBin, moveVoucherToRecycleBin } from "@/services/recycle-bin";
import { deleteVoucher, getVoucher, listDayBook } from "@/services/voucher.service";
import type { DataMode, StockItemRecord, VoucherRecord, VoucherStatus, VoucherType } from "@/types/domain";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import { WarehouseSettingsPanel } from "@/features/screens/warehouse-settings-panel";
import { listWarehouses, listWarehouseStock } from "@/services/warehouse.service";
import { defaultWorkflowSettings } from "@/services/workflow-settings.service";

type InventoryWorkspaceTab = "products" | "services" | "categories" | "units" | "warehouses";
type InventoryPanelTab = "overview" | "transactions" | "stock" | "reorder" | "timeline";
type InventoryColumnId =
  | "select"
  | "type"
  | "voucherNumber"
  | "reference"
  | "partyName"
  | "voucherDate"
  | "quantity"
  | "unitPrice"
  | "total"
  | "warehouse"
  | "status"
  | "actions";
type InventorySortColumn = Exclude<InventoryColumnId, "select" | "actions">;
type InventoryTransactionSortColumn = InventorySortColumn | "createdAt";

type InventorySnapshotAdjustment = {
  id: string;
  quantity: number;
  unitPrice: number;
  note: string | null;
  reason: string | null;
  adjustmentDate: string;
  warehouseId?: string;
  batchNumber?: string | null;
  manufacturedAt?: string | null;
  expiresAt?: string | null;
};

type ApiStockMovement = {
  id: string;
  inventoryItemId: string;
  transactionType: string;
  transactionId: string;
  transactionLineId: string | null;
  referenceNo: string | null;
  movementType: "IN" | "OUT";
  quantity: number | string;
  unit: string;
  inputUnitCost: number | string | null;
  unitCost: number | string;
  movementValue: number | string;
  transactionDate: string;
  createdAt: string;
  reversalOfId: string | null;
  batchNumber: string | null;
  manufacturedAt: string | null;
  expiresAt: string | null;
  warehouse: { id: string; name: string };
  inventoryItem: { itemCode: string; itemName: string; category: string; unit: string };
};

const ADD_STOCK_REASONS = [
  { value: "opening_correction", label: "Opening Balance / Correction" },
  { value: "purchase_undocumented", label: "Purchase (Undocumented)" },
  { value: "customer_return", label: "Customer Return" },
  { value: "production_output", label: "Production / Manufacturing" },
  { value: "count_surplus", label: "Physical Count Surplus" },
  { value: "other", label: "Other" },
] as const;

const REDUCE_STOCK_REASONS = [
  { value: "damaged", label: "Damaged" },
  { value: "expired", label: "Expired" },
  { value: "lost_theft", label: "Lost / Theft" },
  { value: "internal_use", label: "Internal Use / Consumption" },
  { value: "quality_reject", label: "Quality Reject" },
  { value: "count_shortage", label: "Physical Count Shortage" },
  { value: "other", label: "Other" },
] as const;

function getStockAdjustmentReasonOptions(mode: "add" | "reduce") {
  return mode === "add" ? ADD_STOCK_REASONS : REDUCE_STOCK_REASONS;
}

function getStockAdjustmentReasonLabel(reason: string | null) {
  if (!reason) {
    return null;
  }
  const match = [...ADD_STOCK_REASONS, ...REDUCE_STOCK_REASONS].find((option) => option.value === reason);
  return match?.label ?? null;
}

export type InventorySnapshotItem = {
  id: string;
  itemCode: string;
  itemName: string;
  kind: "product" | "service";
  alias: string;
  category: string;
  categoryId: string;
  unit: string;
  alternateUnit: string;
  alternateUnitConversion: number;
  description: string;
  languageAlias: string;
  partNumber: string;
  notes: string;
  openingQty: number;
  openingRate: number;
  quantity: number;
  rate: number;
  stockValue: number;
  reorderLevel: number;
  expiryDate: string | null;
  trackBatchExpiry: boolean;
  status: "active" | "inactive";
  adjustments: InventorySnapshotAdjustment[];
};

type InventoryViewRow = {
  id: string;
  kind: InventoryWorkspaceTab;
  title: string;
  subtitle: string;
  quantity: number;
  unit: string;
  amount: number;
  badge: string;
  statusText: string;
  linkedItemCodes: string[];
  isSubcategory?: boolean;
};

type InventoryMovementRow = {
  id: string;
  source: "voucher" | "opening" | "adjustment" | "ledger";
  voucherId: string;
  voucherType: VoucherType;
  displayType: string;
  voucherNumber: string;
  reference: string;
  partyName: string;
  voucherDate: string;
  createdAt: string;
  quantity: number;
  stockQuantity: number;
  affectsStock: boolean;
  unitPrice: number;
  total: number;
  warehouse: string;
  warehouseId: string;
  status: VoucherStatus;
  itemName: string;
  itemCode: string;
  category: string;
  unit: string;
  reason?: string | null;
  note?: string | null;
  batchNumber?: string | null;
  manufacturedAt?: string | null;
  expiresAt?: string | null;
};

type InventoryFormState = {
  itemCode: string;
  itemName: string;
  alias: string;
  category: string;
  categoryId: string;
  unit: string;
  alternateUnit: string;
  alternateUnitConversion: string;
  description: string;
  languageAlias: string;
  partNumber: string;
  notes: string;
  salePrice: string;
  openingQty: string;
  openingRate: string;
  reorderLevel: string;
  trackBatchExpiry: boolean;
  openingBatchNumber: string;
  openingManufacturedAt: string;
  openingExpiresAt: string;
  status: StockItemRecord["status"];
};

type InventoryTableFilterState = {
  transactionTypes: VoucherType[];
  voucherQuery: string;
  referenceQuery: string;
  partyQuery: string;
  warehouseQuery: string;
  dateRange: "all" | "this-month" | "this-year" | "last-90";
  quantityRange: "all" | "0-10" | "10-100" | "100+";
  valueRange: "all" | "0-1000" | "1000-10000" | "10000+";
  statuses: VoucherStatus[];
};

type InventoryFilterPopoverState = {
  columnId: InventorySortColumn;
  left: number;
  top: number;
};

type InventoryColumnConfig = {
  id: InventoryColumnId;
  label: string;
  width: string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  filterable?: boolean;
  hideable?: boolean;
};
type InventoryTransactionActionMenuState =
  | {
      rowId: string;
      left: number;
      top: number;
    }
  | null;
type InventoryBulkActionMenuState =
  | {
      left: number;
      top: number;
    }
  | null;
type InventoryItemContextMenuState =
  | {
      itemId: string;
      left: number;
      top: number;
    }
  | null;
type InventoryTransactionDialogState =
  | {
      mode: "preview" | "history";
      row: InventoryMovementRow;
    }
  | null;
type InventoryBulkDeleteRow =
  | {
      source: "voucher";
      voucherId: string;
      rowId: string;
      status: VoucherStatus;
    }
  | {
      source: "adjustment";
      itemId: string;
      adjustmentId: string;
      rowId: string;
      quantity: number;
    }
  | {
      source: "opening";
      itemId: string;
      itemName: string;
      rowId: string;
    };
type ConfirmationDialogState =
  | {
      kind: "delete-item";
      itemCode: string;
      itemName: string;
    }
  | {
      kind: "delete-selected-items";
      items: Array<{ id: string; itemCode: string; itemName: string; kind: "product" | "service" }>;
    }
  | {
      kind: "delete-transaction";
      voucherId: string;
      rowId: string;
      voucherNumber: string;
      status: VoucherStatus;
    }
  | {
      kind: "delete-selected-transactions";
      rows: InventoryBulkDeleteRow[];
    }
  | {
      kind: "delete-opening-stock";
      itemId: string;
      itemName: string;
    }
  | {
      kind: "delete-adjustment";
      itemId: string;
      adjustmentId: string;
      rowId: string;
    }
  | null;
type StockAdjustmentDialogState =
  | {
      itemId: string;
      itemName: string;
      mode: "add" | "reduce";
      quantity: string;
      unitPrice: string;
      details: string;
      reason: string;
      adjustmentDate: string;
      warehouseId: string;
      batchNumber: string;
      manufacturedAt: string;
      expiresAt: string;
      editId?: string;
      originalQuantity?: number;
    }
  | null;

const workspaceTabs: Array<{ value: InventoryWorkspaceTab; label: string }> = [
  { value: "products", label: "Products" },
  { value: "services", label: "Services" },
  { value: "categories", label: "Categories" },
  { value: "units", label: "Units" },
  { value: "warehouses", label: "Warehouses" },
];

const panelTabs: Array<{ value: InventoryPanelTab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "transactions", label: "Transactions" },
  { value: "stock", label: "Stock" },
  { value: "reorder", label: "Reorder" },
  { value: "timeline", label: "Timeline" },
];

const tableColumns: InventoryColumnConfig[] = [
  { id: "select", label: "", width: "34px", align: "center" },
  { id: "type", label: "Type", width: "116px", sortable: true, filterable: true, hideable: true },
  { id: "voucherNumber", label: "Invoice / Ref. No", width: "130px", sortable: true, filterable: true, hideable: true },
  { id: "partyName", label: "Name", width: "110px", sortable: true, filterable: true, hideable: true },
  { id: "voucherDate", label: "Date", width: "80px", sortable: true, filterable: true, hideable: true },
  { id: "quantity", label: "Quantity", width: "76px", align: "right", sortable: true, filterable: true, hideable: true },
  { id: "warehouse", label: "Warehouse", width: "132px", sortable: true, filterable: true, hideable: true },
  { id: "unitPrice", label: "Price / Unit", width: "96px", align: "right", sortable: true, filterable: true, hideable: true },
  { id: "status", label: "Status", width: "74px", align: "center", sortable: true, filterable: true, hideable: true },
  { id: "actions", label: "", width: "38px", align: "right" },
];

const defaultColumnVisibility: Record<InventoryColumnId, boolean> = {
  select: true,
  type: true,
  voucherNumber: true,
  reference: false,
  partyName: true,
  voucherDate: true,
  quantity: true,
  unitPrice: true,
  total: false,
  warehouse: true,
  status: true,
  actions: true,
};

const defaultFilters: InventoryTableFilterState = {
  transactionTypes: [],
  voucherQuery: "",
  referenceQuery: "",
  partyQuery: "",
  warehouseQuery: "",
  dateRange: "all",
  quantityRange: "all",
  valueRange: "all",
  statuses: [],
};
const inventoryCategoryOptions = ["General Items", "Electronics", "Office Supplies", "Raw Materials", "Services"];
const inventoryUnitOptions = ["pcs", "box", "bag", "kg", "ltr", "set", "unit"];
const serviceUnitOptions = ["hour", "session", "visit", "job", "day", "month"];
const serviceCategoryOptions = [
  "Consulting",
  "Installation",
  "Repair & Maintenance",
  "IT Support",
  "Training",
  "Delivery",
  "Subscription",
  "Professional Services",
  "Other Services",
];

function isServiceCategory(category: string) {
  const normalized = category.trim().toLowerCase();
  return normalized.includes("service") || serviceCategoryOptions.some((option) => option.toLowerCase() === normalized);
}

type ApiInventoryItemSnapshot = {
  id: string;
  itemCode: string;
  itemName: string;
  kind: "product" | "service";
  alias?: string;
  category: string;
  categoryId?: string | null;
  unit: string;
  alternateUnit?: string;
  alternateUnitConversion?: number;
  description?: string;
  languageAlias?: string;
  partNumber?: string;
  notes?: string;
  openingQty: number;
  openingRate: number;
  quantity: number;
  rate: number;
  stockValue?: number;
  reorderLevel: number;
  expiryDate?: string | null;
  trackBatchExpiry?: boolean;
  status: "active" | "inactive";
  adjustments?: InventorySnapshotAdjustment[];
};

type ApiInventoryItemPayload = {
  itemCode: string;
  itemName: string;
  kind?: "product" | "service";
  alias?: string;
  category: string;
  unit: string;
  alternateUnit?: string;
  alternateUnitConversion?: number;
  description?: string;
  languageAlias?: string;
  partNumber?: string;
  notes?: string;
  openingQty: number;
  openingRate: number;
  reorderLevel: number;
  expiryDate?: string | null;
  trackBatchExpiry?: boolean;
  openingBatchNumber?: string | null;
  openingManufacturedAt?: string | null;
  openingExpiresAt?: string | null;
  status: "active" | "inactive";
};

function normalizeInventorySnapshotItem(
  item: {
    sourceId?: string;
    itemCode: string;
    itemName: string;
    kind?: "product" | "service";
    alias?: string;
    category: string;
    categoryId?: string | null;
    unit: string;
    alternateUnit?: string;
    alternateUnitConversion?: number;
    description?: string;
    languageAlias?: string;
    partNumber?: string;
    notes?: string;
    openingQty?: number;
    openingRate?: number;
    quantity: number;
    rate: number;
    stockValue?: number;
    reorderLevel: number;
    expiryDate?: string | null;
    trackBatchExpiry?: boolean;
    status?: "active" | "inactive";
    adjustments?: InventorySnapshotAdjustment[];
  },
  index: number,
): InventorySnapshotItem {
  const fallbackIdBase = item.itemCode || `${slugify(item.itemName) || "item"}`;
  return {
    id: item.sourceId || `${fallbackIdBase}-${index + 1}`,
    itemCode: item.itemCode,
    itemName: item.itemName,
    kind: item.kind ?? (isServiceCategory(item.category) ? "service" : "product"),
    alias: item.alias ?? "",
    category: item.category,
    categoryId: item.categoryId ?? "",
    unit: item.unit,
    alternateUnit: item.alternateUnit ?? "",
    alternateUnitConversion: Number(item.alternateUnitConversion || 0),
    description: item.description ?? "",
    languageAlias: item.languageAlias ?? "",
    partNumber: item.partNumber ?? "",
    notes: item.notes ?? "",
    openingQty: Number(item.openingQty ?? item.quantity ?? 0),
    openingRate: Number(item.openingRate ?? item.rate ?? 0),
    quantity: Number(item.quantity || 0),
    rate: Number(item.rate || 0),
    stockValue: Number(item.stockValue ?? Number(item.quantity || 0) * Number(item.rate || 0)),
    reorderLevel: Number(item.reorderLevel || 0),
    expiryDate: item.expiryDate ?? null,
    trackBatchExpiry: Boolean(item.trackBatchExpiry),
    status: item.status ?? "active",
    adjustments: item.adjustments ?? [],
  };
}

function buildLocalInventoryItems(mode: Exclude<DataMode, "api">, workspaceId: string) {
  const dataset = readDataset(mode);
  const sourceItems = new Map(
    dataset.stockItems
      .filter((item) => item.workspaceId === workspaceId)
      .map((item) => [item.itemCode.toLowerCase(), item] as const),
  );

  return getInventoryOptions(dataset, workspaceId).map((item, index) =>
    normalizeInventorySnapshotItem(
      {
        sourceId: sourceItems.get(item.itemCode.toLowerCase())?.id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        kind: isServiceCategory(item.category) ? "service" : "product",
        category: item.category,
        unit: item.unit,
        openingQty: sourceItems.get(item.itemCode.toLowerCase())?.openingQty ?? item.qty,
        openingRate: sourceItems.get(item.itemCode.toLowerCase())?.openingRate ?? item.rate,
        quantity: item.qty,
        rate: item.rate,
        stockValue: item.qty * item.rate,
        reorderLevel: item.reorderLevel,
        expiryDate: sourceItems.get(item.itemCode.toLowerCase())?.expiryDate ?? null,
        status: sourceItems.get(item.itemCode.toLowerCase())?.status ?? item.status,
      },
      index,
    ),
  );
}

export async function loadInventoryItems(mode: DataMode, workspaceId: string) {
  if (mode === "api") {
    const response = await apiRequest<ApiInventoryItemSnapshot[]>(`/inventory/items?workspaceId=${encodeURIComponent(workspaceId)}`);

    return response.map((item, index) => normalizeInventorySnapshotItem({ ...item, sourceId: item.id }, index));
  }

  return buildLocalInventoryItems(mode, workspaceId);
}

function getMovementDirectionLabel(row: InventoryMovementRow) {
  if (!row.affectsStock) return "Service Quantity";
  if (row.source === "adjustment") {
    return row.stockQuantity >= 0 ? "Adjustment Increase" : "Adjustment Decrease";
  }
  return row.stockQuantity >= 0 ? "Stock In" : "Stock Out";
}

function formatMovementQuantity(row: InventoryMovementRow) {
  if (!row.affectsStock) return `${formatNumber(row.quantity)} ${row.unit}`;
  return `${row.stockQuantity >= 0 ? "+" : "−"}${formatNumber(Math.abs(row.stockQuantity))} ${row.unit}`;
}

function resolveUnitAbbreviation(unit: string, configuredUnits: string[]) {
  const normalized = unit.trim().toLowerCase();
  return configuredUnits.find((candidate) => candidate.trim().toLowerCase() === normalized) ?? unit.trim();
}

async function loadApiStockMovements(workspaceId: string) {
  const movements = await apiRequest<ApiStockMovement[]>(`/inventory/stock-ledger?workspaceId=${encodeURIComponent(workspaceId)}`);
  return movements.map((movement): InventoryMovementRow => {
    const transactionType = movement.transactionType.toUpperCase();
    const isReversal = Boolean(movement.reversalOfId) || transactionType.endsWith("_REVERSAL");
    const isOpening = ["OPENING_STOCK", "OPENING_STOCK_ADJUSTMENT", "MIGRATION_OPENING"].includes(transactionType);
    const isAdjustment = transactionType === "STOCK_ADJUSTMENT";
    const voucherType: VoucherType = transactionType.includes("PURCHASE_RETURN") || transactionType === "DEBIT_NOTE"
      ? "debit-note"
      : transactionType.includes("SALES_RETURN") || transactionType === "CREDIT_NOTE"
        ? "credit-note"
        : transactionType.includes("PURCHASE") || transactionType === "RECEIPT_NOTE" || transactionType === "BILL"
          ? "purchase"
          : transactionType.includes("SALES") || transactionType === "DELIVERY_NOTE" || transactionType === "INVOICE"
            ? "sales"
            : "journal";
    const quantity = Number(movement.quantity || 0);
    const stockQuantity = movement.movementType === "IN" ? quantity : -quantity;
    const transferCounterpart = transactionType.startsWith("STOCK_TRANSFER_")
      ? movements.find((candidate) =>
          candidate.id !== movement.id
          && candidate.transactionId === movement.transactionId
          && candidate.transactionLineId === movement.transactionLineId
          && candidate.movementType !== movement.movementType,
        )
      : undefined;
    const transferOut = movement.movementType === "OUT" ? movement : transferCounterpart;
    const transferIn = movement.movementType === "IN" ? movement : transferCounterpart;
    const warehouseLabel = transferOut && transferIn
      ? `${transferOut.warehouse.name} → ${transferIn.warehouse.name}`
      : movement.warehouse.name;
    const displayType = isReversal
      ? "Stock Reversal"
      : isOpening
        ? "Opening Stock"
        : isAdjustment
          ? "Stock Adjustment"
          : transactionType.split("_").map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(" ");

    return {
      id: isAdjustment && !isReversal ? `adjustment-${movement.transactionId}` : `movement-${movement.id}`,
      source: isReversal ? "ledger" : isOpening ? "opening" : isAdjustment ? "adjustment" : voucherType === "journal" ? "ledger" : "voucher",
      voucherId: voucherType === "journal" ? "" : movement.transactionId,
      voucherType,
      displayType,
      voucherNumber: movement.referenceNo || displayType,
      reference: isReversal ? `Reversal of stock movement ${movement.reversalOfId}` : movement.referenceNo || displayType,
      partyName: isOpening ? "Opening Balance" : isAdjustment ? "Stock Adjustment" : "Inventory Movement",
      voucherDate: movement.transactionDate.slice(0, 10),
      createdAt: movement.createdAt,
      quantity,
      stockQuantity,
      affectsStock: true,
      unitPrice: Number(movement.inputUnitCost ?? movement.unitCost ?? 0),
      total: roundMoney(Math.abs(Number(movement.movementValue || 0))),
      warehouse: warehouseLabel,
      warehouseId: movement.warehouse.id,
      status: "posted",
      itemName: movement.inventoryItem.itemName,
      itemCode: movement.inventoryItem.itemCode,
      category: movement.inventoryItem.category,
      unit: movement.inventoryItem.unit || movement.unit,
      batchNumber: movement.batchNumber,
      manufacturedAt: movement.manufacturedAt,
      expiresAt: movement.expiresAt,
    };
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createApiInventoryItem(workspaceId: string, payload: ApiInventoryItemPayload) {
  return apiRequest<ApiInventoryItemSnapshot>("/inventory/items", {
    method: "POST",
    body: JSON.stringify({ workspaceId, ...payload }),
  });
}

export async function updateApiInventoryItem(itemId: string, payload: Partial<ApiInventoryItemPayload>) {
  return apiRequest<ApiInventoryItemSnapshot>(`/inventory/items/${encodeURIComponent(itemId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

async function deleteApiInventoryItem(itemId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/inventory/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}

async function createApiInventoryAdjustment(
  itemId: string,
  payload: { quantity: number; unitPrice?: number; note?: string; reason?: string; adjustmentDate?: string; warehouseId: string; batchNumber?: string; manufacturedAt?: string; expiresAt?: string },
) {
  return apiRequest<InventorySnapshotAdjustment>(`/inventory/items/${encodeURIComponent(itemId)}/adjustments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function updateApiInventoryAdjustment(
  itemId: string,
  adjustmentId: string,
  payload: { quantity: number; unitPrice?: number; note?: string; reason?: string; adjustmentDate?: string; warehouseId: string; batchNumber?: string; manufacturedAt?: string; expiresAt?: string },
) {
  return apiRequest<InventorySnapshotAdjustment>(
    `/inventory/items/${encodeURIComponent(itemId)}/adjustments/${encodeURIComponent(adjustmentId)}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
}

async function deleteApiInventoryAdjustment(itemId: string, adjustmentId: string) {
  return apiRequest<{ success: boolean; id: string }>(
    `/inventory/items/${encodeURIComponent(itemId)}/adjustments/${encodeURIComponent(adjustmentId)}`,
    { method: "DELETE" },
  );
}

export type InventoryTaxonomyEntry = {
  id: string;
  name: string;
  itemCount: number;
  alternateUnit?: string;
  alternateUnitConversion?: number;
  parentId?: string | null;
  parentName?: string | null;
};

export async function listApiInventoryCategories(workspaceId: string) {
  return apiRequest<InventoryTaxonomyEntry[]>(`/inventory/categories?workspaceId=${encodeURIComponent(workspaceId)}`);
}

async function createApiInventoryCategory(workspaceId: string, name: string, parentId?: string | null) {
  return apiRequest<InventoryTaxonomyEntry>("/inventory/categories", {
    method: "POST",
    body: JSON.stringify({ workspaceId, name, parentId: parentId ?? null }),
  });
}

async function updateApiInventoryCategory(categoryId: string, name: string, parentId?: string | null) {
  return apiRequest<InventoryTaxonomyEntry>(`/inventory/categories/${encodeURIComponent(categoryId)}`, {
    method: "PUT",
    body: JSON.stringify({ name, parentId: parentId ?? null }),
  });
}

async function deleteApiInventoryCategory(categoryId: string) {
  return apiRequest<{ success: boolean; id: string; reassignedItemCount?: number; promotedSubcategoryCount?: number }>(
    `/inventory/categories/${encodeURIComponent(categoryId)}`,
    { method: "DELETE" },
  );
}

async function listApiInventoryUnits(workspaceId: string) {
  return apiRequest<InventoryTaxonomyEntry[]>(`/inventory/units?workspaceId=${encodeURIComponent(workspaceId)}`);
}

async function createApiInventoryUnit(workspaceId: string, name: string, alternateUnit?: string, alternateUnitConversion?: number) {
  return apiRequest<InventoryTaxonomyEntry>("/inventory/units", {
    method: "POST",
    body: JSON.stringify({ workspaceId, name, alternateUnit, alternateUnitConversion }),
  });
}

async function updateApiInventoryUnit(unitId: string, name: string, alternateUnit?: string, alternateUnitConversion?: number) {
  return apiRequest<InventoryTaxonomyEntry>(`/inventory/units/${encodeURIComponent(unitId)}`, {
    method: "PUT",
    body: JSON.stringify({ name, alternateUnit, alternateUnitConversion }),
  });
}

async function deleteApiInventoryUnit(unitId: string) {
  return apiRequest<{ success: boolean; id: string; reassignedItemCount?: number }>(`/inventory/units/${encodeURIComponent(unitId)}`, {
    method: "DELETE",
  });
}

function buildInventoryMovements(items: InventorySnapshotItem[], vouchers: VoucherRecord[]) {
  const itemMap = new Map(items.map((item) => [item.itemName.trim().toLowerCase(), item]));
  const itemIdMap = new Map(items.map((item) => [item.id, item]));
  const openingEntryDate = new Date().toISOString().slice(0, 10);
  const receiptNoteIds = new Set(
    vouchers
      .filter((voucher) => voucher.voucherType === "purchase" && voucher.documentKind === "receipt-note" && voucher.status !== "cancelled")
      .map((voucher) => voucher.id),
  );
  const deliveryNoteIds = new Set(
    vouchers
      .filter((voucher) => voucher.voucherType === "sales" && voucher.documentKind === "delivery-note" && voucher.status !== "cancelled")
      .map((voucher) => voucher.id),
  );
  const voucherRows = vouchers
    .filter((voucher) => (voucher.inventoryItems ?? []).length > 0)
    .flatMap((voucher) =>
      (voucher.inventoryItems ?? []).map((inventoryItem, index) => {
        const matched =
          (inventoryItem.inventoryItemId ? itemIdMap.get(inventoryItem.inventoryItemId) : undefined) ??
          itemMap.get(inventoryItem.itemName.trim().toLowerCase());
        const isLive = voucher.status === "pending" || voucher.status === "approved" || voucher.status === "posted";
        const isPurchaseOrder = voucher.voucherType === "purchase" && voucher.documentKind === "purchase-order";
        const isPurchaseBillFromReceipt =
          voucher.voucherType === "purchase" && Boolean(voucher.sourceVoucherId && receiptNoteIds.has(voucher.sourceVoucherId));
        const isNonStockSalesDocument =
          voucher.voucherType === "sales" && ["quotation", "proforma", "sale-order"].includes(voucher.documentKind ?? "");
        const isSalesInvoiceFromDelivery =
          voucher.voucherType === "sales" &&
          voucher.documentKind !== "delivery-note" &&
          Boolean(voucher.sourceVoucherId && deliveryNoteIds.has(voucher.sourceVoucherId));
        const stockDirection =
          voucher.voucherType === "purchase" || voucher.voucherType === "credit-note"
            ? 1
            : voucher.voucherType === "sales" || voucher.voucherType === "debit-note"
              ? -1
              : 0;
        const affectsStock =
          isLive && stockDirection !== 0 && !isPurchaseOrder && !isPurchaseBillFromReceipt && !isNonStockSalesDocument && !isSalesInvoiceFromDelivery;
        const quantity = Number(inventoryItem.quantity || 0);

        return {
          id: `${voucher.id}-${inventoryItem.id || index + 1}`,
          source: "voucher" as const,
          voucherId: voucher.id,
          voucherType: voucher.voucherType,
          displayType: voucher.voucherType === "debit-note" ? "Purchase Return" : voucher.voucherType.replace("-", " "),
          voucherNumber: voucher.voucherNumber,
          reference: voucher.reference?.trim() || voucher.voucherNumber,
          partyName: voucher.partyName,
          voucherDate: voucher.voucherDate,
          createdAt: voucher.createdAt,
          quantity,
          stockQuantity: affectsStock ? quantity * stockDirection : 0,
          affectsStock,
          unitPrice: Number(inventoryItem.unitPrice || 0),
          total: Number(inventoryItem.quantity || 0) * Number(inventoryItem.unitPrice || 0),
          warehouse: "Main Warehouse",
          warehouseId: "demo-main",
          status: voucher.status,
          itemName: inventoryItem.itemName,
          itemCode: matched?.itemCode ?? `ITM-${slugify(inventoryItem.itemName).slice(0, 8).toUpperCase() || "AUTO"}`,
          category: matched?.category ?? "General Items",
          unit: matched?.unit ?? "pcs",
        } satisfies InventoryMovementRow;
      }),
    );

  // Only items that really carry an opening balance get an opening row, and it
  // shows that opening figure alone. Falling back to the current quantity here
  // labelled today's stock as "Opening Stock" — an item sold without ever being
  // purchased then reported a negative opening balance it never had.
  const openingRows = items
    .filter((item) => Number(item.openingQty || 0) !== 0)
    .map((item) => ({
      id: `opening-${item.id}`,
      source: "opening" as const,
      voucherId: "",
      voucherType: "journal" as const,
      displayType: "Opening Stock",
      voucherNumber: item.itemCode,
      reference: "Opening entry",
      partyName: "Opening Balance",
      voucherDate: openingEntryDate,
      createdAt: `${openingEntryDate}T00:00:00.000Z`,
      quantity: Number(item.openingQty || 0),
      stockQuantity: Number(item.openingQty || 0),
      affectsStock: true,
      unitPrice: Number(item.rate || 0),
      total: Number(item.openingQty || 0) * Number(item.rate || 0),
      warehouse: "Main Warehouse",
      warehouseId: "demo-main",
      status: "posted" as const,
      itemName: item.itemName,
      itemCode: item.itemCode,
      category: item.category,
      unit: item.unit,
    }) satisfies InventoryMovementRow);

  const adjustmentRows = items.flatMap((item) =>
    item.adjustments.map(
      (adjustment) =>
        ({
          id: `adjustment-${adjustment.id}`,
          source: "adjustment" as const,
          voucherId: "",
          voucherType: "journal" as const,
          displayType: "Stock Adjustment",
          voucherNumber: adjustment.quantity >= 0 ? "Stock Added" : "Stock Reduced",
          reference: (() => {
            const reasonLabel = getStockAdjustmentReasonLabel(adjustment.reason);
            const note = adjustment.note?.trim();
            if (reasonLabel) {
              return note ? `${reasonLabel} — ${note}` : reasonLabel;
            }
            return note || (adjustment.quantity >= 0 ? "Manual increase" : "Manual decrease");
          })(),
          partyName: "Stock Adjustment",
          voucherDate: adjustment.adjustmentDate.slice(0, 10),
          createdAt: adjustment.adjustmentDate,
          quantity: adjustment.quantity,
          stockQuantity: adjustment.quantity,
          affectsStock: true,
          unitPrice: adjustment.unitPrice,
          total: roundMoney(Math.abs(adjustment.quantity) * adjustment.unitPrice),
          warehouse: "Main Warehouse",
          warehouseId: "demo-main",
          status: "posted" as const,
          itemName: item.itemName,
          itemCode: item.itemCode,
          category: item.category,
          unit: item.unit,
          reason: adjustment.reason,
          note: adjustment.note,
        }) satisfies InventoryMovementRow,
    ),
  );

  return [...voucherRows, ...adjustmentRows, ...openingRows]
    .sort((left, right) => {
      if (left.voucherDate === right.voucherDate) {
        return right.voucherNumber.localeCompare(left.voucherNumber);
      }

      return right.voucherDate.localeCompare(left.voucherDate);
    });
}

function createDefaultInventoryForm(): InventoryFormState {
  return {
    itemCode: "",
    itemName: "",
    alias: "",
    category: "",
    categoryId: "",
    unit: "pcs",
    alternateUnit: "",
    alternateUnitConversion: "",
    description: "",
    languageAlias: "",
    partNumber: "",
    notes: "",
    salePrice: "0",
    openingQty: "0",
    openingRate: "0",
    reorderLevel: "0",
    trackBatchExpiry: false,
    openingBatchNumber: "",
    openingManufacturedAt: "",
    openingExpiresAt: "",
    status: "active",
  };
}

function createInventoryFormFromItem(item: InventorySnapshotItem): InventoryFormState {
  return {
    itemCode: item.itemCode,
    itemName: item.itemName,
    alias: item.alias,
    category: item.category,
    categoryId: item.categoryId,
    unit: item.unit,
    alternateUnit: item.alternateUnit,
    alternateUnitConversion: item.alternateUnitConversion ? String(item.alternateUnitConversion) : "",
    description: item.description,
    languageAlias: item.languageAlias,
    partNumber: item.partNumber,
    notes: item.notes,
    salePrice: String(item.rate),
    openingQty: String(item.openingQty),
    openingRate: String(item.openingRate),
    reorderLevel: String(item.reorderLevel),
    trackBatchExpiry: item.trackBatchExpiry,
    openingBatchNumber: "",
    openingManufacturedAt: "",
    openingExpiresAt: "",
    status: item.status,
  };
}

export function buildAssignedItemCode(itemName: string) {
  const stem = slugify(itemName).replace(/-/g, "").toUpperCase().slice(0, 8) || "ITEM";
  const suffix = String(Date.now()).slice(-4);
  return `${stem}-${suffix}`;
}

const inventoryPageSizeStorageKey = "inventory-workspace:page-size";

function buildInventoryViewRows(
  tab: InventoryWorkspaceTab,
  items: InventorySnapshotItem[],
  taxonomy: InventoryTaxonomyEntry[] = [],
): InventoryViewRow[] {
  if (tab === "services") {
    return items.filter((item) => item.kind === "service").map((item) => ({
      id: item.id,
      kind: tab,
      title: item.itemName,
      subtitle: `${item.itemCode} • ${item.category}`,
      quantity: 0,
      unit: item.unit,
      amount: item.rate,
      badge: item.category,
      statusText: "Service",
      linkedItemCodes: [item.itemCode],
    }));
  }

  if ((tab === "categories" || tab === "units") && taxonomy.length) {
    const orderedTaxonomy =
      tab === "categories"
        ? (() => {
            const mainCategories = taxonomy.filter((entry) => !entry.parentId).sort((a, b) => a.name.localeCompare(b.name));
            const subcategoriesByParent = new Map<string, InventoryTaxonomyEntry[]>();
            taxonomy
              .filter((entry) => entry.parentId)
              .forEach((entry) => {
                const list = subcategoriesByParent.get(entry.parentId!) ?? [];
                list.push(entry);
                subcategoriesByParent.set(entry.parentId!, list);
              });

            const ordered: InventoryTaxonomyEntry[] = [];
            mainCategories.forEach((main) => {
              ordered.push(main);
              const subs = (subcategoriesByParent.get(main.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
              ordered.push(...subs);
            });

            return ordered;
          })()
        : taxonomy;

    const childrenByParent = new Map<string, InventoryTaxonomyEntry[]>();
    if (tab === "categories") {
      taxonomy.forEach((entry) => {
        if (!entry.parentId) return;
        childrenByParent.set(entry.parentId, [...(childrenByParent.get(entry.parentId) ?? []), entry]);
      });
    }

    const usageCountById = new Map<string, number>();
    const resolveUsageCount = (entry: InventoryTaxonomyEntry, ancestors = new Set<string>()): number => {
      const cached = usageCountById.get(entry.id);
      if (cached !== undefined) return cached;
      if (ancestors.has(entry.id)) return entry.itemCount;

      const nextAncestors = new Set(ancestors).add(entry.id);
      const descendantCount = (childrenByParent.get(entry.id) ?? []).reduce(
        (total, child) => total + resolveUsageCount(child, nextAncestors),
        0,
      );
      const totalCount = entry.itemCount + descendantCount;
      usageCountById.set(entry.id, totalCount);
      return totalCount;
    };

    return orderedTaxonomy.map((entry) => {
      const collectCategoryNames = (category: InventoryTaxonomyEntry, visited = new Set<string>()): string[] => {
        if (visited.has(category.id)) return [];
        const nextVisited = new Set(visited).add(category.id);
        return [
          category.name,
          ...(childrenByParent.get(category.id) ?? []).flatMap((child) => collectCategoryNames(child, nextVisited)),
        ];
      };
      const categoryNames = tab === "categories"
        ? new Set(collectCategoryNames(entry).map((name) => name.trim().toLowerCase()))
        : new Set<string>();
      const linkedItems = items.filter((item) =>
        tab === "categories"
          ? categoryNames.has(item.category.trim().toLowerCase())
          : item.unit.trim().toLowerCase() === entry.name.trim().toLowerCase(),
      );
      const usageCount = linkedItems.length || (tab === "categories" ? resolveUsageCount(entry) : entry.itemCount);

      return {
        id: entry.id,
        kind: tab,
        title: entry.name,
        subtitle: `${usageCount} item${usageCount === 1 ? "" : "s"}`,
        quantity: usageCount,
        unit: tab === "categories" ? "items" : entry.name,
        amount: sumMoney(linkedItems.map((item) => item.stockValue)),
        badge:
          tab === "units" && entry.alternateUnit
            ? `1 ${entry.name} = ${formatNumber(entry.alternateUnitConversion ?? 0)} ${entry.alternateUnit}`
            : usageCount
              ? ""
              : "Unused",
        statusText: "",
        linkedItemCodes: linkedItems.map((item) => item.itemCode),
        isSubcategory: tab === "categories" && Boolean(entry.parentId),
      };
    });
  }

  if (tab === "products") {
    return items.filter((item) => item.kind === "product").map((item) => {
      const stockValue = item.stockValue;
      const lowStock = item.reorderLevel > 0 && item.quantity <= item.reorderLevel;

      return {
        id: item.id,
        kind: tab,
        title: item.itemName,
        subtitle: `${item.itemCode} • ${item.category}`,
        quantity: item.quantity,
        unit: item.unit,
        amount: stockValue,
        badge: item.category,
        statusText: lowStock ? "Low stock" : "In stock",
        linkedItemCodes: [item.itemCode],
      };
    });
  }

  const grouped = new Map<string, InventoryViewRow>();

  items.forEach((item) => {
    const groupKey = tab === "categories" ? item.category : item.unit;
    const existing = grouped.get(groupKey) ?? {
      id: `${tab}-${slugify(groupKey)}`,
      kind: tab,
      title: groupKey,
      subtitle: tab === "categories" ? "Grouped stock items" : "Measurement group",
      quantity: 0,
      unit: tab === "categories" ? "items" : item.unit,
      amount: 0,
      badge: tab === "categories" ? `${item.unit} mix` : `${item.category} mix`,
      statusText: "Balanced",
      linkedItemCodes: [],
    };

    existing.quantity += tab === "categories" ? 1 : item.quantity;
    existing.amount = sumMoney([existing.amount, item.stockValue]);
    existing.linkedItemCodes.push(item.itemCode);
    grouped.set(groupKey, existing);
  });

  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      subtitle:
        tab === "categories"
          ? `${row.linkedItemCodes.length} item${row.linkedItemCodes.length > 1 ? "s" : ""}`
          : `${row.linkedItemCodes.length} product${row.linkedItemCodes.length > 1 ? "s" : ""}`,
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

export function parseImportedItems(text: string, extension: string): StockItemRecord[] {
  if (extension === "json") {
    const parsed = JSON.parse(text) as Array<Partial<StockItemRecord>>;
    if (!Array.isArray(parsed)) {
      throw new Error("JSON file must contain an array");
    }

    return parsed.map((item, index) => ({
      id: String(item.id || `stock-import-${index + 1}`),
      workspaceId: String(item.workspaceId || ""),
      itemCode: String(item.itemCode || ""),
      itemName: String(item.itemName || ""),
      category: String(item.category || "General Items"),
      unit: String(item.unit || "pcs"),
      openingQty: Number(item.openingQty || 0),
      openingRate: Number(item.openingRate || 0),
      reorderLevel: Number(item.reorderLevel || 0),
      status: item.status === "inactive" ? "inactive" : "active",
    }));
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const [headerLine, ...dataLines] = lines;
  const headers = headerLine.split(",").map((cell) => cell.trim().toLowerCase());

  return dataLines.map((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""])) as Record<string, string>;

    return {
      id: row.id || `stock-import-${index + 1}`,
      workspaceId: row.workspaceid || "",
      itemCode: row["item code"] || row.itemcode || row.code || `ITM-NEW-${index + 1}`,
      itemName: row["item name"] || row.itemname || row.name || "",
      category: row.category || "General Items",
      unit: row.unit || "pcs",
      openingQty: Number(row["opening stock quantity"] || row.openingqty || row.quantity || 0),
      openingRate: Number(row["purchase price"] || row.openingrate || row.rate || row["sale price"] || row.saleprice || 0),
      reorderLevel: Number(row["minimum stock quantity"] || row.reorderlevel || 0),
      status: row.status?.toLowerCase() === "inactive" ? "inactive" : "active",
    } satisfies StockItemRecord;
  });
}

export function InventoryScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialCreateKind = searchParams.get("create") === "service" ? "service" : "product";
  const hasInitialCreateRequest = Boolean(searchParams.get("create"));
  const { mode, session, hasHydrated } = useSessionContext();
  const workflowSettingsQuery = useWorkflowSettingsQuery(
    mode,
    session?.workspaceId ?? (mode === "api" ? null : "workspace"),
  );
  const workflowSettings = workflowSettingsQuery.data ?? defaultWorkflowSettings;
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const listSearchRef = useRef<HTMLInputElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const itemSettingsMenuRef = useRef<HTMLDivElement | null>(null);
  const columnMenuRef = useRef<HTMLDivElement | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const transactionActionMenuRef = useRef<HTMLDivElement | null>(null);
  const transactionBulkActionMenuRef = useRef<HTMLDivElement | null>(null);
  const itemContextMenuRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const listScrollRef = useTransientScrollbar<HTMLDivElement>();
  const tableScrollRef = useTransientScrollbar<HTMLDivElement>();
  const createRequestRef = useRef("");

  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<InventoryWorkspaceTab>(() => {
    const raw = searchParams.get("tab");
    return raw === "services" || raw === "categories" || raw === "units" || raw === "warehouses" ? raw : "products";
  });
  const [activePanelTab, setActivePanelTab] = useState<InventoryPanelTab>("transactions");
  const [listQuery, setListQuery] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [listFilter] = useState<"all" | "low-stock">("all");
  const [listSort] = useState<"name" | "stock" | "value">("name");
  const [selectedViewId, setSelectedViewId] = useState(() => searchParams.get("item") ?? "");
  const [localItems, setLocalItems] = useState<InventorySnapshotItem[]>([]);
  const [localVouchers, setLocalVouchers] = useState<VoucherRecord[]>([]);
  const [localCategories, setLocalCategories] = useState<InventoryTaxonomyEntry[]>([]);
  const [localUnits, setLocalUnits] = useState<InventoryTaxonomyEntry[]>([]);
  const [warehouseCount, setWarehouseCount] = useState(0);
  const [taxonomyDialog, setTaxonomyDialog] = useState<{
    kind: "category" | "unit";
    name: string;
    alternateUnit: string;
    alternateUnitConversion: string;
    parentId: string;
    editId?: string;
  } | null>(null);
  const [taxonomySaving, setTaxonomySaving] = useState(false);
  const [taxonomyParentPickerOpen, setTaxonomyParentPickerOpen] = useState(false);
  const [taxonomyParentQuery, setTaxonomyParentQuery] = useState("");
  const [taxonomyParentHighlightIndex, setTaxonomyParentHighlightIndex] = useState(0);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [itemSettingsMenuOpen, setItemSettingsMenuOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(hasInitialCreateRequest);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [itemForm, setItemForm] = useState<InventoryFormState>(() => ({
    ...createDefaultInventoryForm(),
    unit: initialCreateKind === "service" ? "hour" : "pcs",
  }));
  const [customUnitMode, setCustomUnitMode] = useState(false);
  const [unitSelector, setUnitSelector] = useState<{
    baseUnit: string;
    alternateUnit: string;
    conversion: string;
    customBase: boolean;
    customAlternate: boolean;
  } | null>(null);
  const [itemEditorKind, setItemEditorKind] = useState<"product" | "service">(initialCreateKind);
  const [itemEditorTab, setItemEditorTab] = useState<"pricing" | "stock" | "additional">("pricing");
  const [wholesalePrices, setWholesalePrices] = useState<string[]>([]);
  const [categorySearchText, setCategorySearchText] = useState("");
  const [categoryHighlightIndex, setCategoryHighlightIndex] = useState(0);
  const [categoryPanelSearching, setCategoryPanelSearching] = useState(false);
  const categoryOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const shouldRenderItemFormAsPage = formMode === "create" && Boolean(searchParams.get("create"));
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [selectedInventoryItemIds, setSelectedInventoryItemIds] = useState<string[]>([]);
  const [sortState, setSortState] = useState<{ columnId: InventoryTransactionSortColumn; direction: "asc" | "desc" }>({
    columnId: "voucherDate",
    direction: "asc",
  });
  const [columnVisibility, setColumnVisibility] = useState<Record<InventoryColumnId, boolean>>(defaultColumnVisibility);
  const [filterPopover, setFilterPopover] = useState<InventoryFilterPopoverState | null>(null);
  const [transactionActionMenu, setTransactionActionMenu] = useState<InventoryTransactionActionMenuState>(null);
  const [transactionBulkActionMenu, setTransactionBulkActionMenu] = useState<InventoryBulkActionMenuState>(null);
  const [itemContextMenu, setItemContextMenu] = useState<InventoryItemContextMenuState>(null);
  const [transactionDialog, setTransactionDialog] = useState<InventoryTransactionDialogState>(null);
  const [confirmationDialog, setConfirmationDialog] = useState<ConfirmationDialogState>(null);
  const [stockAdjustmentDialog, setStockAdjustmentDialog] = useState<StockAdjustmentDialogState>(null);
  const [stockAdjustmentItemQuery, setStockAdjustmentItemQuery] = useState("");
  const [stockAdjustmentItemDropdownOpen, setStockAdjustmentItemDropdownOpen] = useState(false);
  const [tableFilters, setTableFilters] = useState<InventoryTableFilterState>(defaultFilters);
  const [draftTableFilters, setDraftTableFilters] = useState<InventoryTableFilterState>(defaultFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window === "undefined") {
      return 25;
    }

    const saved = Number(window.localStorage.getItem(inventoryPageSizeStorageKey));
    return [10, 25, 50, 100].includes(saved) ? saved : 25;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(inventoryPageSizeStorageKey, String(pageSize));
  }, [pageSize]);

  // Keeps the active workspace tab in the URL so a reload lands back on the
  // tab you were working in (Services/Category/Unit), while a fresh visit to
  // this page with no ?tab= still defaults to Products.
  useEffect(() => {
    const currentTab = searchParams.get("tab");
    const nextTab = activeWorkspaceTab === "products" ? null : activeWorkspaceTab;
    if (currentTab === nextTab) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    if (nextTab) {
      params.set("tab", nextTab);
    } else {
      params.delete("tab");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [activeWorkspaceTab, pathname, router, searchParams]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const inventoryColumnWidthDefaults = useMemo(
    () => Object.fromEntries(tableColumns.map((column) => [column.id, Number.parseInt(column.width, 10)])) as Record<InventoryColumnId, number>,
    [],
  );
  const { beginResize: beginColumnResize, columnWidths } = useColumnResize(inventoryColumnWidthDefaults);

  const workspaceId = session?.workspaceId ?? "";

  const itemsQuery = useQuery({
    queryKey: [mode, "inventory-items", workspaceId],
    queryFn: () => loadInventoryItems(mode, workspaceId),
    enabled: hasHydrated && Boolean(workspaceId),
  });

  const vouchersQuery = useQuery({
    queryKey: [mode, "inventory-vouchers", workspaceId],
    queryFn: () => listDayBook(mode, { workspaceId }),
    enabled: hasHydrated && Boolean(workspaceId),
  });

  const stockMovementsQuery = useQuery({
    queryKey: [mode, "inventory-stock-movements", workspaceId],
    queryFn: () => loadApiStockMovements(workspaceId),
    enabled: hasHydrated && Boolean(workspaceId) && mode === "api",
  });

  const categoriesQuery = useQuery({
    queryKey: [mode, "inventory-categories", workspaceId],
    queryFn: () => listApiInventoryCategories(workspaceId),
    enabled: hasHydrated && Boolean(workspaceId) && mode === "api",
  });

  const unitsQuery = useQuery({
    queryKey: [mode, "inventory-units", workspaceId],
    queryFn: () => listApiInventoryUnits(workspaceId),
    enabled: hasHydrated && Boolean(workspaceId) && mode === "api",
  });

  const warehousesQuery = useQuery({
    queryKey: [mode, "inventory-warehouses", workspaceId],
    queryFn: () => listWarehouses(workspaceId),
    enabled: hasHydrated && Boolean(workspaceId) && mode === "api",
  });

  const warehouseStockQuery = useQuery({
    queryKey: [mode, "inventory-warehouse-stock", workspaceId],
    queryFn: () => listWarehouseStock(workspaceId),
    enabled: hasHydrated && Boolean(workspaceId) && mode === "api",
  });

  useEffect(() => {
    if (itemsQuery.data) {
      setLocalItems(itemsQuery.data);
    }
  }, [itemsQuery.data]);

  useEffect(() => {
    if (vouchersQuery.data) {
      setLocalVouchers(vouchersQuery.data.filter((voucher) => voucher.workspaceId === workspaceId));
    }
  }, [vouchersQuery.data, workspaceId]);

  useEffect(() => {
    if (categoriesQuery.data) {
      setLocalCategories(categoriesQuery.data);
    }
  }, [categoriesQuery.data]);

  useEffect(() => {
    if (unitsQuery.data) {
      setLocalUnits(unitsQuery.data);
    }
  }, [unitsQuery.data]);

  useEffect(() => {
    if (warehousesQuery.data) setWarehouseCount(warehousesQuery.data.length);
    else if (mode !== "api") setWarehouseCount(1);
  }, [mode, warehousesQuery.data]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      const targetElement = event.target instanceof Element ? event.target : null;

      if (targetElement?.closest('button[aria-label^="Filter "]')) {
        return;
      }

      if (moreMenuOpen && moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setMoreMenuOpen(false);
      }

      if (itemSettingsMenuOpen && itemSettingsMenuRef.current && !itemSettingsMenuRef.current.contains(target)) {
        setItemSettingsMenuOpen(false);
      }

      if (columnsOpen && columnMenuRef.current && !columnMenuRef.current.contains(target)) {
        setColumnsOpen(false);
      }

      if (filterPopover && filterPopoverRef.current && !filterPopoverRef.current.contains(target)) {
        setFilterPopover(null);
      }

      if (transactionActionMenu && transactionActionMenuRef.current && !transactionActionMenuRef.current.contains(target)) {
        setTransactionActionMenu(null);
      }

      if (transactionBulkActionMenu && transactionBulkActionMenuRef.current && !transactionBulkActionMenuRef.current.contains(target)) {
        setTransactionBulkActionMenu(null);
      }

      if (itemContextMenu && itemContextMenuRef.current && !itemContextMenuRef.current.contains(target)) {
        setItemContextMenu(null);
      }
    }

    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") {
        event.preventDefault();
        listSearchRef.current?.focus();
      }

      if (event.key === "Escape") {
        setItemContextMenu(null);
        setTransactionBulkActionMenu(null);
        setItemSettingsMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleShortcut);

    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleShortcut);
    };
  }, [columnsOpen, filterPopover, itemContextMenu, itemSettingsMenuOpen, moreMenuOpen, transactionActionMenu, transactionBulkActionMenu]);

  const configuredUnitNames = useMemo(
    () => mode === "api" ? localUnits.map((unit) => unit.name) : [...inventoryUnitOptions, ...serviceUnitOptions],
    [localUnits, mode],
  );
  const canonicalItems = useMemo(
    () => localItems.map((item) => ({ ...item, unit: resolveUnitAbbreviation(item.unit, configuredUnitNames) })),
    [configuredUnitNames, localItems],
  );
  const movementRows = useMemo(
    () => mode === "api"
      ? (stockMovementsQuery.data ?? []).map((row) => {
          const voucher = row.voucherId ? localVouchers.find((candidate) => candidate.id === row.voucherId) : undefined;
          const enriched = voucher
            ? { ...row, partyName: voucher.partyName, reference: voucher.reference || row.reference, status: voucher.status }
            : row;
          return { ...enriched, unit: resolveUnitAbbreviation(enriched.unit, configuredUnitNames) };
        })
      : buildInventoryMovements(canonicalItems, localVouchers),
    [canonicalItems, configuredUnitNames, localVouchers, mode, stockMovementsQuery.data],
  );
  const categoryOptions = mode === "api" ? localCategories.map((category) => category.name) : inventoryCategoryOptions;
  const productUnitOptions = mode === "api" ? localUnits.map((unit) => unit.name) : inventoryUnitOptions;
  const unitOptions = itemEditorKind === "service" ? serviceUnitOptions : productUnitOptions;
  const categoryTaxonomyForPicker: InventoryTaxonomyEntry[] = itemEditorKind === "service"
    ? localCategories.filter((category) => isServiceCategory(category.name))
    : mode === "api"
      ? localCategories.filter((category) => !isServiceCategory(category.name))
      : inventoryCategoryOptions.map((name) => ({ id: name, name, itemCount: 0, parentId: null, parentName: null }));
  const selectedCategoryEntry =
    (itemForm.categoryId ? categoryTaxonomyForPicker.find((category) => category.id === itemForm.categoryId) : undefined) ??
    categoryTaxonomyForPicker.find((category) => category.name.toLowerCase() === itemForm.category.trim().toLowerCase());
  const selectedCategoryDisplay = selectedCategoryEntry?.name ?? itemForm.category.trim();

  const categoryPickerGroups = useMemo(() => {
    const query = categoryPanelSearching ? categorySearchText.trim().toLowerCase() : "";
    const matchesQuery = (name: string) => !query || name.toLowerCase().includes(query);

    const mainCategories = categoryTaxonomyForPicker.filter((category) => !category.parentId).sort((a, b) => a.name.localeCompare(b.name));
    const subcategoriesByParent = new Map<string, InventoryTaxonomyEntry[]>();
    categoryTaxonomyForPicker
      .filter((category) => category.parentId)
      .forEach((category) => {
        const list = subcategoriesByParent.get(category.parentId!) ?? [];
        list.push(category);
        subcategoriesByParent.set(category.parentId!, list);
      });

    return mainCategories
      .map((main) => {
        const mainMatches = matchesQuery(main.name);
        const allSubcategories = (subcategoriesByParent.get(main.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
        return {
          main,
          mainMatches,
          subcategories: mainMatches ? allSubcategories : allSubcategories.filter((sub) => matchesQuery(sub.name)),
        };
      })
      .filter((group) => group.mainMatches || group.subcategories.length > 0);
  }, [categoryTaxonomyForPicker, categorySearchText, categoryPanelSearching]);

  const categoryPickerFlatOptions = useMemo(() => {
    const options: Array<{ entry: InventoryTaxonomyEntry }> = [];
    categoryPickerGroups.forEach(({ main, mainMatches, subcategories }) => {
      if (mainMatches) {
        options.push({ entry: main });
      }
      subcategories.forEach((sub) => {
        options.push({ entry: sub });
      });
    });
    return options;
  }, [categoryPickerGroups]);

  useEffect(() => {
    categoryOptionRefs.current[categoryHighlightIndex]?.scrollIntoView({ block: "nearest" });
  }, [categoryHighlightIndex]);

  const inventoryViewRows = useMemo(() => {
    const query = listQuery.trim().toLowerCase();
    const taxonomySource = activeWorkspaceTab === "categories" ? localCategories : activeWorkspaceTab === "units" ? localUnits : [];
    const baseRows = buildInventoryViewRows(activeWorkspaceTab, canonicalItems, taxonomySource)
      .filter((row) => (listFilter === "low-stock" ? row.statusText.toLowerCase().includes("low stock") : true))
      .sort((left, right) => {
        if (activeWorkspaceTab === "categories") {
          return 0;
        }

        if (listSort === "stock") {
          return right.quantity - left.quantity || left.title.localeCompare(right.title);
        }

        if (listSort === "value") {
          return right.amount - left.amount || left.title.localeCompare(right.title);
        }

        return left.title.localeCompare(right.title);
      });

    if (!query) {
      return baseRows;
    }

    return baseRows.filter((row) =>
      [row.title, row.subtitle, row.badge, row.statusText]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [activeWorkspaceTab, canonicalItems, listFilter, listQuery, listSort, localCategories, localUnits]);

  useEffect(() => {
    if (!inventoryViewRows.length) {
      setSelectedViewId("");
      return;
    }

    const selectedStillVisible = inventoryViewRows.some((row) => row.id === selectedViewId);
    if (!selectedStillVisible) {
      setSelectedViewId(inventoryViewRows[0].id);
    }
  }, [inventoryViewRows, selectedViewId]);

  const selectedViewRow = inventoryViewRows.find((row) => row.id === selectedViewId) ?? null;
  const selectedWorkspaceCategory =
    activeWorkspaceTab === "categories"
      ? localCategories.find((category) => category.id === selectedViewId) ?? null
      : null;
  const taxonomyParentOptions = useMemo(() => {
    const query = taxonomyParentQuery.trim().toLowerCase();
    return [
      { id: "", name: "None — Main Category", parentName: null },
      ...localCategories
        .filter((category) => category.id !== taxonomyDialog?.editId)
        .filter((category) => !query || `${category.name} ${category.parentName ?? ""}`.toLowerCase().includes(query)),
    ];
  }, [localCategories, taxonomyDialog?.editId, taxonomyParentQuery]);
  const selectedItem =
    (activeWorkspaceTab === "products" || activeWorkspaceTab === "services") && selectedViewRow
      ? canonicalItems.find((item) => item.id === selectedViewRow.id) ?? null
      : null;
  const adjustmentItem = stockAdjustmentDialog
    ? canonicalItems.find((item) => item.id === stockAdjustmentDialog.itemId) ?? null
    : null;
  const adjustmentCurrentStock = stockAdjustmentDialog
    ? mode === "api"
      ? warehouseStockQuery.data?.find(
          (row) => row.inventoryItemId === stockAdjustmentDialog.itemId && row.warehouseId === stockAdjustmentDialog.warehouseId,
        )?.quantity ?? 0
      : adjustmentItem?.quantity ?? 0
    : 0;
  const adjustmentEnteredQuantity = Number(stockAdjustmentDialog?.quantity || 0);
  const adjustmentSignedQuantity = stockAdjustmentDialog?.mode === "reduce"
    ? -Math.abs(Number.isFinite(adjustmentEnteredQuantity) ? adjustmentEnteredQuantity : 0)
    : Math.abs(Number.isFinite(adjustmentEnteredQuantity) ? adjustmentEnteredQuantity : 0);
  const adjustmentNewStock = adjustmentCurrentStock + adjustmentSignedQuantity;
  const adjustmentWarehouseStock = stockAdjustmentDialog && mode === "api"
    ? warehouseStockQuery.data?.find(
        (row) => row.inventoryItemId === stockAdjustmentDialog.itemId && row.warehouseId === stockAdjustmentDialog.warehouseId,
      )
    : undefined;
  const adjustmentCurrentUnitCost = adjustmentWarehouseStock?.averageCost ?? adjustmentItem?.rate ?? 0;
  const adjustmentEnteredUnitCost = Number(stockAdjustmentDialog?.unitPrice || 0);
  const adjustmentNewAverageCost = stockAdjustmentDialog?.mode === "add" && adjustmentNewStock > 0
    ? ((adjustmentCurrentStock * adjustmentCurrentUnitCost)
      + (Math.max(0, adjustmentSignedQuantity) * (Number.isFinite(adjustmentEnteredUnitCost) ? adjustmentEnteredUnitCost : 0))) / adjustmentNewStock
    : adjustmentCurrentUnitCost;

  const selectedMovementRows = useMemo(() => {
    if (!selectedViewRow) {
      return [];
    }

    if (activeWorkspaceTab === "products" || activeWorkspaceTab === "services") {
      return movementRows.filter((row) => row.itemCode === selectedViewRow.linkedItemCodes[0]);
    }

    if (activeWorkspaceTab === "categories" || activeWorkspaceTab === "units") {
      return movementRows.filter((row) => selectedViewRow.linkedItemCodes.includes(row.itemCode));
    }

    return [];
  }, [activeWorkspaceTab, movementRows, selectedViewRow]);

  const selectedCategoryStockItems = useMemo(() => {
    if (activeWorkspaceTab !== "categories" || !selectedViewRow) {
      return [];
    }

    const linkedCodes = new Set(selectedViewRow.linkedItemCodes.map((code) => code.trim().toLowerCase()));
    const query = globalQuery.trim().toLowerCase();
    return canonicalItems
      .filter((item) => item.kind === "product" && linkedCodes.has(item.itemCode.trim().toLowerCase()))
      .filter((item) => !query || [item.itemCode, item.itemName, item.category, item.unit, item.status].join(" ").toLowerCase().includes(query))
      .sort((left, right) => left.itemName.localeCompare(right.itemName));
  }, [activeWorkspaceTab, canonicalItems, globalQuery, selectedViewRow]);

  const visiblePanelTabs = activeWorkspaceTab === "services"
    ? panelTabs.filter((tab) => tab.value !== "stock" && tab.value !== "reorder")
    : panelTabs;

  useEffect(() => {
    if (activeWorkspaceTab === "services" && (activePanelTab === "stock" || activePanelTab === "reorder")) {
      setActivePanelTab("overview");
    }
  }, [activePanelTab, activeWorkspaceTab]);

  const selectedItemHasVoucherHistory = useMemo(() => {
    if (!selectedItem) {
      return false;
    }

    return movementRows.some((row) => row.itemCode === selectedItem.itemCode && row.source === "voucher");
  }, [movementRows, selectedItem]);

  const selectableInventoryRows =
    activeWorkspaceTab === "products" || activeWorkspaceTab === "services" ? inventoryViewRows : [];
  const allVisibleInventoryRowsSelected =
    selectableInventoryRows.length > 0 && selectableInventoryRows.every((row) => selectedInventoryItemIds.includes(row.id));

  useEffect(() => {
    setSelectedInventoryItemIds([]);
  }, [activeWorkspaceTab]);

  const transactionRows = useMemo(() => {
    const query = globalQuery.trim().toLowerCase();
    const panelRows = activePanelTab === "stock" ? selectedMovementRows.filter((row) => row.affectsStock) : selectedMovementRows;

    return panelRows.filter((row) => {
      if (tableFilters.transactionTypes.length && !tableFilters.transactionTypes.includes(row.voucherType)) {
        return false;
      }

      if (tableFilters.statuses.length && !tableFilters.statuses.includes(row.status)) {
        return false;
      }

      if (tableFilters.voucherQuery.trim()) {
        const voucherNeedle = tableFilters.voucherQuery.trim().toLowerCase();
        if (!`${row.voucherNumber} ${row.itemName}`.toLowerCase().includes(voucherNeedle)) {
          return false;
        }
      }

      if (tableFilters.referenceQuery.trim() && !row.reference.toLowerCase().includes(tableFilters.referenceQuery.trim().toLowerCase())) {
        return false;
      }

      if (tableFilters.partyQuery.trim() && !row.partyName.toLowerCase().includes(tableFilters.partyQuery.trim().toLowerCase())) {
        return false;
      }

      if (tableFilters.warehouseQuery.trim() && !row.warehouse.toLowerCase().includes(tableFilters.warehouseQuery.trim().toLowerCase())) {
        return false;
      }

      if (tableFilters.dateRange === "this-month") {
        if (!row.voucherDate.startsWith(new Date().toISOString().slice(0, 7))) {
          return false;
        }
      }

      if (tableFilters.dateRange === "this-year") {
        if (!row.voucherDate.startsWith(String(new Date().getFullYear()))) {
          return false;
        }
      }

      if (tableFilters.dateRange === "last-90") {
        const current = new Date();
        const entryDate = new Date(row.voucherDate);
        const diffDays = (current.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 90) {
          return false;
        }
      }

      if (tableFilters.quantityRange === "0-10" && !(row.quantity <= 10)) {
        return false;
      }

      if (tableFilters.quantityRange === "10-100" && !(row.quantity > 10 && row.quantity <= 100)) {
        return false;
      }

      if (tableFilters.quantityRange === "100+" && !(row.quantity > 100)) {
        return false;
      }

      if (tableFilters.valueRange === "0-1000" && !(row.total <= 1000)) {
        return false;
      }

      if (tableFilters.valueRange === "1000-10000" && !(row.total > 1000 && row.total <= 10000)) {
        return false;
      }

      if (tableFilters.valueRange === "10000+" && !(row.total > 10000)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [row.itemName, row.itemCode, row.voucherNumber, row.partyName, row.category, row.total]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [activePanelTab, globalQuery, selectedMovementRows, tableFilters]);

  const sortedTransactionRows = useMemo(() => {
    const rows = [...transactionRows];

    rows.sort((left, right) => {
      switch (sortState.columnId) {
        case "createdAt":
          return sortState.direction === "asc"
            ? left.createdAt.localeCompare(right.createdAt) || left.voucherDate.localeCompare(right.voucherDate)
            : right.createdAt.localeCompare(left.createdAt) || right.voucherDate.localeCompare(left.voucherDate);
        case "type":
          return sortState.direction === "asc" ? left.voucherType.localeCompare(right.voucherType) : right.voucherType.localeCompare(left.voucherType);
        case "voucherNumber":
          return sortState.direction === "asc" ? left.voucherNumber.localeCompare(right.voucherNumber) : right.voucherNumber.localeCompare(left.voucherNumber);
        case "reference":
          return sortState.direction === "asc" ? left.reference.localeCompare(right.reference) : right.reference.localeCompare(left.reference);
        case "partyName":
          return sortState.direction === "asc" ? left.partyName.localeCompare(right.partyName) : right.partyName.localeCompare(left.partyName);
        case "voucherDate":
          return sortState.direction === "asc" ? left.voucherDate.localeCompare(right.voucherDate) : right.voucherDate.localeCompare(left.voucherDate);
        case "quantity":
          return sortState.direction === "asc" ? left.quantity - right.quantity : right.quantity - left.quantity;
        case "unitPrice":
          return sortState.direction === "asc" ? left.unitPrice - right.unitPrice : right.unitPrice - left.unitPrice;
        case "total":
          return sortState.direction === "asc" ? left.total - right.total : right.total - left.total;
        case "warehouse":
          return sortState.direction === "asc" ? left.warehouse.localeCompare(right.warehouse) : right.warehouse.localeCompare(left.warehouse);
        case "status":
          return sortState.direction === "asc" ? left.status.localeCompare(right.status) : right.status.localeCompare(left.status);
        default:
          return 0;
      }
    });

    return rows;
  }, [sortState, transactionRows]);

  useEffect(() => {
    setPage(1);
  }, [activePanelTab, activeWorkspaceTab, globalQuery, listQuery, pageSize, selectedViewId, sortState, tableFilters]);

  useEffect(() => {
    setSelectedTransactionIds([]);
    setTransactionActionMenu(null);
    setTransactionBulkActionMenu(null);
  }, [activePanelTab]);

  useEffect(() => {
    setTableFilters(defaultFilters);
    setDraftTableFilters(defaultFilters);
    setGlobalQuery("");
  }, [selectedViewId]);

  const paginatedTransactionRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedTransactionRows.slice(start, start + pageSize);
  }, [page, pageSize, sortedTransactionRows]);

  const pageCount = Math.max(1, Math.ceil(sortedTransactionRows.length / pageSize));

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const visibleColumns = tableColumns.filter((column) => columnVisibility[column.id]);
  const tableHasRows = paginatedTransactionRows.length > 0;
  const renderedColumns = tableHasRows ? visibleColumns : visibleColumns.filter((column) => column.id !== "select");
  const activeTransactionActionRow = useMemo(
    () => (transactionActionMenu ? sortedTransactionRows.find((row) => row.id === transactionActionMenu.rowId) ?? null : null),
    [sortedTransactionRows, transactionActionMenu],
  );
  const selectedBulkDeleteRows = useMemo(
    () => buildBulkDeleteRows(sortedTransactionRows.filter((row) => selectedTransactionIds.includes(row.id))),
    [localItems, selectedTransactionIds, sortedTransactionRows],
  );

  function handleListKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!inventoryViewRows.length) {
      return;
    }

    const currentIndex = Math.max(
      0,
      inventoryViewRows.findIndex((row) => row.id === selectedViewId),
    );

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedViewId(inventoryViewRows[Math.min(currentIndex + 1, inventoryViewRows.length - 1)]?.id ?? selectedViewId);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedViewId(inventoryViewRows[Math.max(currentIndex - 1, 0)]?.id ?? selectedViewId);
    }
  }

  function hydrateLocalStateFromDataset(currentMode: Exclude<DataMode, "api">, currentWorkspaceId: string) {
    const dataset = readDataset(currentMode);
    setLocalItems(buildLocalInventoryItems(currentMode, currentWorkspaceId));
    setLocalVouchers(dataset.vouchers.filter((voucher) => voucher.workspaceId === currentWorkspaceId));
  }

  function updateFormField<K extends keyof InventoryFormState>(field: K, value: InventoryFormState[K]) {
    setItemForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applyCategorySelection(entry: InventoryTaxonomyEntry) {
    setItemForm((current) => ({ ...current, category: entry.name, categoryId: entry.id }));
    setCategorySearchText(entry.name);
    setCategoryHighlightIndex(0);
    setCategoryPanelSearching(false);
  }

  function handleCategoryInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setCategorySearchText(selectedCategoryDisplay);
      setCategoryPanelSearching(false);
      return;
    }

    if (!categoryPickerFlatOptions.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCategoryHighlightIndex((current) => Math.min(current + 1, categoryPickerFlatOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCategoryHighlightIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = categoryPickerFlatOptions[categoryHighlightIndex];
      if (option) {
        applyCategorySelection(option.entry);
      }
    }
  }

  function renderCategoryPickerPanel() {
    const groups = categoryPickerGroups;
    let flatIndex = -1;

    return (
      <aside className="sticky top-0 flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-xl border border-[#d8e1ea] bg-white shadow-sm">
        <div className="border-b border-[#e4ebf5] px-4 py-4">
          <div className="text-sm font-semibold uppercase tracking-[0.1em] text-[#6d7d93]">Category Selection</div>
          <div className="mt-2 text-xs text-[#8994a6]">
            Type in the {itemEditorKind === "service" ? "Service" : "Product"} Category field to search, or pick a category below.
          </div>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-primary"
            onClick={() => setTaxonomyDialog({ kind: "category", name: "", alternateUnit: "", alternateUnitConversion: "", parentId: "" })}
          >
            + Add {itemEditorKind === "service" ? "Service Category" : "Category"}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {categoryTaxonomyForPicker.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-8 text-center text-sm text-[#6d7d93]">
              <span>No category created yet.</span>
              <span>Create at least one Main Category before adding a product or service.</span>
            </div>
          ) : groups.length ? (
            groups.map(({ main, mainMatches, subcategories }) => {
              const mainIndex = mainMatches ? ++flatIndex : -1;
              return (
                <div key={main.id} className="border-b border-[#eef2f7]">
                  {mainMatches ? (
                    <button
                      type="button"
                      ref={(element) => {
                        categoryOptionRefs.current[mainIndex] = element;
                      }}
                      className={cn(
                        "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-semibold transition hover:bg-[#f5f9ff]",
                        mainIndex === categoryHighlightIndex
                          ? "bg-[#e3edff] text-primary ring-1 ring-inset ring-[#9fc1f3]"
                          : itemForm.category.trim().toLowerCase() === main.name.toLowerCase()
                            ? "bg-[#eef5ff] text-primary"
                            : "text-[#17263c]",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyCategorySelection(main)}
                    >
                      <span className="truncate">{main.name}</span>
                      <span className="shrink-0 text-xs font-normal text-[#8994a6]">
                        {main.itemCount} item{main.itemCount === 1 ? "" : "s"}
                      </span>
                    </button>
                  ) : (
                    <div className="truncate px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8994a6]">{main.name}</div>
                  )}
                  {subcategories.map((sub) => {
                    const subIndex = ++flatIndex;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        ref={(element) => {
                          categoryOptionRefs.current[subIndex] = element;
                        }}
                        className={cn(
                          "flex w-full items-center justify-between py-2 pl-8 pr-4 text-left text-sm transition hover:bg-[#f5f9ff]",
                          subIndex === categoryHighlightIndex
                            ? "bg-[#e3edff] font-medium text-primary ring-1 ring-inset ring-[#9fc1f3]"
                            : itemForm.category.trim().toLowerCase() === sub.name.toLowerCase()
                              ? "bg-[#eef5ff] font-medium text-primary"
                              : "text-[#3f4f65]",
                        )}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyCategorySelection(sub)}
                      >
                        <span className="truncate">↳ {sub.name}</span>
                        <span className="shrink-0 text-xs text-[#8994a6]">{sub.itemCount}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          ) : (
            <div className="px-4 py-6 text-center text-sm text-[#8994a6]">No category matches &quot;{categorySearchText}&quot;.</div>
          )}
        </div>
      </aside>
    );
  }

  function openCreateDialog(kind: "product" | "service" = activeWorkspaceTab === "services" ? "service" : "product") {
    setFormMode("create");
    setItemForm({ ...createDefaultInventoryForm(), unit: kind === "service" ? "hour" : "pcs" });
    setCustomUnitMode(false);
    setActiveWorkspaceTab(kind === "service" ? "services" : "products");
    setItemEditorKind(kind);
    setItemEditorTab("pricing");
    setWholesalePrices([]);
    setFormDialogOpen(true);
    setMoreMenuOpen(false);
  }

  function openCreatePage(
    kind: "product" | "service" = activeWorkspaceTab === "services" ? "service" : "product",
    category?: InventoryTaxonomyEntry | null,
  ) {
    const params = new URLSearchParams({ create: kind, open: String(Date.now()) });
    if (kind === "product" && category) {
      params.set("categoryId", category.id);
      params.set("category", category.name);
    }
    router.push(`${buildWorkspaceRoute(mode, "/masters/inventory")}?${params.toString()}`);
  }

  function closeItemForm() {
    setFormDialogOpen(false);
    setWholesalePrices([]);

    if (shouldRenderItemFormAsPage) {
      router.replace(buildWorkspaceRoute(mode, "/masters/inventory"), { scroll: false });
    }
  }

  useEffect(() => {
    const createType = searchParams.get("create");
    if (!createType) {
      if (formDialogOpen && formMode === "create" && createRequestRef.current) {
        setFormDialogOpen(false);
        setWholesalePrices([]);
        createRequestRef.current = "";
      }
      return;
    }

    const requestKey = `${createType}:${searchParams.get("open") ?? "initial"}`;
    if (createRequestRef.current === requestKey) {
      return;
    }

    const editorKind = createType === "service" ? "service" : "product";
    openCreateDialog(editorKind);
    const requestedCategory = searchParams.get("category")?.trim();
    const requestedCategoryId = searchParams.get("categoryId")?.trim();
    if (editorKind === "product" && requestedCategory) {
      setItemForm((current) => ({
        ...current,
        category: requestedCategory,
        categoryId: requestedCategoryId ?? "",
      }));
      setCategorySearchText(requestedCategory);
    }
    createRequestRef.current = requestKey;
  }, [formDialogOpen, formMode, searchParams]);

  useEffect(() => {
    if (!formDialogOpen) {
      return;
    }

    setCategorySearchText(selectedCategoryDisplay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formDialogOpen]);

  function openEditDialog() {
    if (!selectedItem) {
      toast.error("Select a product or service first");
      return;
    }

    setFormMode("edit");
    setItemForm(createInventoryFormFromItem(selectedItem));
    setCustomUnitMode(!unitOptions.some((unit) => unit.toLowerCase() === selectedItem.unit.trim().toLowerCase()));
    setItemEditorKind(selectedItem.kind);
    setItemEditorTab("pricing");
    setWholesalePrices([]);
    setFormDialogOpen(true);
    setMoreMenuOpen(false);
  }

  function handleAssignItemCode() {
    updateFormField("itemCode", buildAssignedItemCode(itemForm.itemName));
  }

  function handleColumnSort(columnId: InventorySortColumn) {
    setSortState((current) =>
      current.columnId === columnId
        ? { columnId, direction: current.direction === "asc" ? "desc" : "asc" }
        : { columnId, direction: columnId === "voucherDate" ? "desc" : "asc" },
    );
  }

  function openFilterPopover(event: React.MouseEvent<HTMLButtonElement>, columnId: InventorySortColumn) {
    if (filterPopover?.columnId === columnId) {
      setFilterPopover(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const popoverWidth = 288;
    const maxLeft = Math.max(12, viewportWidth - popoverWidth - 12);
    const centeredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const preferredLeft = rect.right + popoverWidth > viewportWidth - 12 ? rect.right - popoverWidth : centeredLeft;
    setDraftTableFilters(tableFilters);
    setFilterPopover({
      columnId,
      left: Math.min(Math.max(12, preferredLeft), maxLeft),
      top: rect.bottom + 8,
    });
  }

  function handleResetFilters() {
    setTableFilters(defaultFilters);
    setDraftTableFilters(defaultFilters);
    setFilterPopover(null);
    toast.success("Transaction filters reset");
  }

  async function refetchInventoryWorkspaceData(showToast = true) {
    const [itemsResult, vouchersResult, movementsResult, categoriesResult, unitsResult, warehousesResult, warehouseStockResult] = await Promise.all([
      itemsQuery.refetch(),
      vouchersQuery.refetch(),
      mode === "api" ? stockMovementsQuery.refetch() : Promise.resolve(null),
      mode === "api" ? categoriesQuery.refetch() : Promise.resolve(null),
      mode === "api" ? unitsQuery.refetch() : Promise.resolve(null),
      mode === "api" ? warehousesQuery.refetch() : Promise.resolve(null),
      mode === "api" ? warehouseStockQuery.refetch() : Promise.resolve(null),
    ]);
    if (itemsResult.error || vouchersResult.error || movementsResult?.error || warehousesResult?.error || warehouseStockResult?.error) {
      throw itemsResult.error ?? vouchersResult.error ?? movementsResult?.error ?? warehousesResult?.error ?? warehouseStockResult?.error ?? new Error("Inventory refresh failed");
    }

    if (itemsResult.data) {
      setLocalItems(itemsResult.data);
    }

    if (vouchersResult.data) {
      setLocalVouchers(vouchersResult.data.filter((voucher) => voucher.workspaceId === workspaceId));
    }

    if (categoriesResult?.data) {
      setLocalCategories(categoriesResult.data);
    }

    if (unitsResult?.data) {
      setLocalUnits(unitsResult.data);
    }

    if (showToast) {
      toast.success("Inventory workspace refreshed");
    }
  }

  async function handleRefresh() {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    setMoreMenuOpen(false);
    setColumnsOpen(false);
    setFilterPopover(null);
    setTransactionActionMenu(null);
    setTransactionBulkActionMenu(null);

    try {
      await refetchInventoryWorkspaceData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Inventory refresh failed");
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleExportTransactions(rows: InventoryMovementRow[]) {
    if (!rows.length) {
      toast.error("No transaction rows available to export");
      return;
    }

    downloadCsv(
      "inventory-transactions.csv",
      rows.map((row) => ({
        Type: row.voucherType,
        "Invoice / Ref. No":
          row.reference && row.reference !== row.voucherNumber ? `${row.voucherNumber} / ${row.reference}` : row.voucherNumber,
        Name: row.partyName,
        Date: formatDate(row.voucherDate),
        Quantity: formatMovementQuantity(row),
        Direction: getMovementDirectionLabel(row),
        Warehouse: row.warehouse,
        "Price / Unit": formatCurrency(row.unitPrice),
        Status: row.status,
      })),
    );
    toast.success("Inventory transactions exported");
  }

  function handleDuplicateItem() {
    if (!selectedItem) {
      toast.error("Select a product or service first");
      return;
    }

    if (mode === "api") {
      void (async () => {
        try {
          const created = await createApiInventoryItem(workspaceId, {
            itemCode: `${selectedItem.itemCode}-COPY`,
            itemName: `${selectedItem.itemName} Copy`,
            kind: selectedItem.kind,
            alias: selectedItem.alias,
            category: selectedItem.category,
            unit: selectedItem.unit,
            alternateUnit: selectedItem.alternateUnit,
            alternateUnitConversion: selectedItem.alternateUnitConversion,
            description: selectedItem.description,
            languageAlias: selectedItem.languageAlias,
            partNumber: selectedItem.partNumber,
            notes: selectedItem.notes,
            openingQty: selectedItem.kind === "service" ? 0 : selectedItem.quantity,
            openingRate: selectedItem.rate,
            reorderLevel: selectedItem.reorderLevel,
            status: selectedItem.status,
          });
          await refetchInventoryWorkspaceData(false);
          setActiveWorkspaceTab(selectedItem.kind === "service" ? "services" : "products");
          setSelectedViewId(created.id);
          toast.success(selectedItem.kind === "service" ? "Service duplicated" : "Product duplicated");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : `${selectedItem.kind === "service" ? "Service" : "Product"} could not be duplicated`);
        }
      })();
      return;
    }

    const dataset = readDataset(mode);
    const duplicatedItem: StockItemRecord = {
      id: `stock-${crypto.randomUUID()}`,
      workspaceId,
      itemCode: `${selectedItem.itemCode}-COPY`,
      itemName: `${selectedItem.itemName} Copy`,
      category: selectedItem.category,
      unit: selectedItem.unit,
      openingQty: selectedItem.kind === "service" ? 0 : selectedItem.quantity,
      openingRate: selectedItem.rate,
      reorderLevel: selectedItem.reorderLevel,
      status: selectedItem.status,
    };

    writeDataset(mode, {
      ...dataset,
      stockItems: [duplicatedItem, ...dataset.stockItems],
    });
    hydrateLocalStateFromDataset(mode, workspaceId);
    setActiveWorkspaceTab(selectedItem.kind === "service" ? "services" : "products");
    setSelectedViewId(duplicatedItem.id);
    toast.success(selectedItem.kind === "service" ? "Service duplicated" : "Product duplicated");
  }

  function handleDeleteItem() {
    if (!selectedItem) {
      toast.error("Select a product or service first");
      return;
    }

    if (selectedItemHasVoucherHistory) {
      toast.error(`This ${selectedItem.kind === "service" ? "service" : "item"} already has real voucher history, so it cannot be deleted directly`);
      return;
    }

    setConfirmationDialog({
      kind: "delete-item",
      itemCode: selectedItem.itemCode,
      itemName: selectedItem.itemName,
    });
  }

  function handleDeleteSelectedItems() {
    const selectedItems = localItems.filter((item) => selectedInventoryItemIds.includes(item.id));
    if (!selectedItems.length) {
      toast.error("Select at least one product or service");
      return;
    }

    const itemCodesWithVoucherHistory = new Set(
      movementRows.filter((row) => row.source === "voucher").map((row) => row.itemCode),
    );
    const protectedItems = selectedItems.filter((item) => itemCodesWithVoucherHistory.has(item.itemCode));
    if (protectedItems.length) {
      toast.error(
        `${protectedItems.length} selected ${protectedItems.length === 1 ? "item has" : "items have"} voucher history and cannot be deleted`,
      );
      return;
    }

    setConfirmationDialog({
      kind: "delete-selected-items",
      items: selectedItems.map(({ id, itemCode, itemName, kind }) => ({ id, itemCode, itemName, kind })),
    });
  }

  function handleAdjustItem() {
    if (!selectedItem || selectedItem.kind !== "product") {
      toast.error("Select a product first");
      return;
    }
    setStockAdjustmentDialog({
      itemId: selectedItem.id,
      itemName: selectedItem.itemName,
      mode: "add",
      quantity: "",
      unitPrice: selectedItem.rate > 0 ? String(selectedItem.rate) : "",
      details: "",
      reason: ADD_STOCK_REASONS[0].value,
      adjustmentDate: new Date().toISOString().slice(0, 10),
      warehouseId: mode === "api" ? "" : "demo-main",
      batchNumber: "",
      manufacturedAt: "",
      expiresAt: "",
    });
    setStockAdjustmentItemQuery(selectedItem.itemName);
    setStockAdjustmentItemDropdownOpen(false);
  }

  function handleImportItemsFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["csv", "json"].includes(extension)) {
      toast.error("Import a CSV or JSON file");
      return;
    }

    void file.text().then(async (text) => {
      try {
        const rows = parseImportedItems(text, extension)
          .filter((item) => item.itemName.trim())
          .map((item) => ({
            ...item,
            id: item.id || `stock-${crypto.randomUUID()}`,
            workspaceId,
          }));

        if (!rows.length) {
          toast.error("No valid items were found in that file");
          return;
        }

        if (mode === "api") {
          const existingCodes = new Set(localItems.map((item) => item.itemCode.toLowerCase()));
          const mergedRows = rows.filter((item) => !existingCodes.has(item.itemCode.toLowerCase()));

          if (!mergedRows.length) {
            toast.error("All imported items already exist");
            return;
          }

          await Promise.all(
            mergedRows.map((item) =>
              createApiInventoryItem(workspaceId, {
                itemCode: item.itemCode,
                itemName: item.itemName,
                category: item.category,
                unit: item.unit,
                openingQty: Number(item.openingQty || 0),
                openingRate: Number(item.openingRate || 0),
                reorderLevel: Number(item.reorderLevel || 0),
                status: item.status,
              }),
            ),
          );
          await refetchInventoryWorkspaceData(false);
          toast.success(`${mergedRows.length} stock item${mergedRows.length > 1 ? "s" : ""} imported`);
          return;
        }

        const dataset = readDataset(mode);
        const existingCodes = new Set(dataset.stockItems.map((item) => item.itemCode.toLowerCase()));
        const mergedRows = rows.filter((item) => !existingCodes.has(item.itemCode.toLowerCase()));

        writeDataset(mode, {
          ...dataset,
          stockItems: [...mergedRows, ...dataset.stockItems],
        });

        hydrateLocalStateFromDataset(mode, workspaceId);
        toast.success(`${mergedRows.length} stock item${mergedRows.length > 1 ? "s" : ""} imported`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Import failed");
      }
    });
  }

  async function handleSaveItem(saveAndNew = false) {
    if (!itemForm.itemName.trim() || !itemForm.itemCode.trim()) {
      toast.error(`${itemEditorKind === "service" ? "Service" : "Item"} code and name are required`);
      return;
    }

    if (!itemForm.category.trim()) {
      toast.error(`Please select a ${itemEditorKind === "service" ? "service" : "product"} category.`);
      return;
    }

    // Opening unit cost seeds the moving-average inventory valuation — it must
    // never silently fall back to Sale Price, or the item's cost basis
    // becomes its selling price, hiding margin on every sale from this layer.
    const resolvedRate = Number(itemForm.openingRate || 0);
    const apiPayload: ApiInventoryItemPayload = {
      itemCode: itemForm.itemCode.trim(),
      itemName: itemForm.itemName.trim(),
      kind: itemEditorKind,
      alias: itemForm.alias.trim(),
      category: itemForm.category.trim(),
      unit: itemForm.unit.trim() || (itemEditorKind === "service" ? "hour" : "pcs"),
      alternateUnit: itemEditorKind === "service" ? "" : itemForm.alternateUnit.trim(),
      alternateUnitConversion: itemEditorKind === "service" ? 0 : Number(itemForm.alternateUnitConversion || 0),
      description: itemForm.description.trim(),
      languageAlias: itemForm.languageAlias.trim(),
      partNumber: itemForm.partNumber.trim(),
      notes: itemForm.notes.trim(),
      openingQty: itemEditorKind === "service" ? 0 : Number(itemForm.openingQty || 0),
      openingRate: resolvedRate,
      reorderLevel: Number(itemForm.reorderLevel || 0),
      trackBatchExpiry: itemEditorKind === "product" && itemForm.trackBatchExpiry,
      openingBatchNumber: itemForm.openingBatchNumber.trim() || null,
      openingManufacturedAt: itemForm.openingManufacturedAt || null,
      openingExpiresAt: itemForm.openingExpiresAt || null,
      status: itemForm.status,
    };

    if (mode === "api") {
      try {
        const nextCategoryName = apiPayload.category.trim();
        if (nextCategoryName && !localCategories.some((category) => category.name.toLowerCase() === nextCategoryName.toLowerCase())) {
          await createApiInventoryCategory(workspaceId, nextCategoryName);
        }

        const nextUnitName = apiPayload.unit.trim();
        if (nextUnitName && !localUnits.some((unit) => unit.name.toLowerCase() === nextUnitName.toLowerCase())) {
          await createApiInventoryUnit(workspaceId, nextUnitName);
        }

        const saved =
          formMode === "edit" && selectedItem
            ? await updateApiInventoryItem(selectedItem.id, apiPayload)
            : await createApiInventoryItem(workspaceId, apiPayload);

        await refetchInventoryWorkspaceData(false);
        setActiveWorkspaceTab(itemEditorKind === "service" ? "services" : "products");
        setSelectedViewId(saved.id);
        toast.success(formMode === "edit" ? "Product updated" : "Product created");
        if (formMode === "edit" || !saveAndNew) {
          closeItemForm();
          return;
        }

        setItemForm(createDefaultInventoryForm());
        setItemEditorKind("product");
        setItemEditorTab("pricing");
        setWholesalePrices([]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Item could not be saved");
      }
      return;
    }

    const dataset = readDataset(mode);
    const normalizedCode = itemForm.itemCode.trim().toLowerCase();
    const duplicateCode = dataset.stockItems.some(
      (item) =>
        item.workspaceId === workspaceId &&
        item.itemCode.toLowerCase() === normalizedCode &&
        !(formMode === "edit" && selectedItem && item.itemCode.toLowerCase() === selectedItem.itemCode.toLowerCase()),
    );

    if (duplicateCode) {
      toast.error("This item code already exists");
      return;
    }

    const nextRecord: StockItemRecord = {
      id:
        formMode === "edit" && selectedItem
          ? dataset.stockItems.find((item) => item.itemCode === selectedItem.itemCode)?.id || `stock-${crypto.randomUUID()}`
          : `stock-${crypto.randomUUID()}`,
      workspaceId,
      itemCode: itemForm.itemCode.trim(),
      itemName: itemForm.itemName.trim(),
      category: itemForm.category.trim() || (itemEditorKind === "service" ? "Services" : "General Items"),
      unit: itemForm.unit.trim() || "pcs",
      openingQty: Number(itemForm.openingQty || 0),
      openingRate: resolvedRate,
      reorderLevel: Number(itemForm.reorderLevel || 0),
      expiryDate: null,
      trackBatchExpiry: itemEditorKind === "product" && itemForm.trackBatchExpiry,
      status: itemForm.status,
    };

    const nextItems =
      formMode === "edit" && selectedItem
        ? dataset.stockItems.map((item) =>
            item.workspaceId === workspaceId && item.itemCode === selectedItem.itemCode ? nextRecord : item,
          )
        : [nextRecord, ...dataset.stockItems];

    writeDataset(mode, {
      ...dataset,
      stockItems: nextItems,
    });
    hydrateLocalStateFromDataset(mode, workspaceId);
    setActiveWorkspaceTab("products");
    setSelectedViewId(nextRecord.id);
    toast.success(formMode === "edit" ? "Product updated" : "Product created");
    if (formMode === "edit" || !saveAndNew) {
      closeItemForm();
      return;
    }

    setItemForm(createDefaultInventoryForm());
    setItemEditorKind("product");
    setItemEditorTab("pricing");
    setWholesalePrices([]);
  }

  function handleItemFormKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (
      event.key !== "Enter" ||
      event.defaultPrevented ||
      event.shiftKey ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    ) {
      return;
    }

    const target = event.target as HTMLElement;
    if (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable ||
      target.closest("button")
    ) {
      return;
    }

    event.preventDefault();
    void handleSaveItem();
  }

  async function handleSaveTaxonomy() {
    if (!taxonomyDialog) {
      return;
    }

    const enteredName = taxonomyDialog.name.trim();
    const nextName =
      taxonomyDialog.kind === "category" && itemEditorKind === "service" && enteredName && !isServiceCategory(enteredName)
        ? `${enteredName} Services`
        : enteredName;
    if (!nextName) {
      toast.error(`${taxonomyDialog.kind === "category" ? "Category" : "Unit"} name is required`);
      return;
    }

    const isEditing = Boolean(taxonomyDialog.editId);

    setTaxonomySaving(true);
    try {
      if (taxonomyDialog.kind === "category") {
        const result = isEditing
          ? await updateApiInventoryCategory(taxonomyDialog.editId!, nextName, taxonomyDialog.parentId || null)
          : await createApiInventoryCategory(workspaceId, nextName, taxonomyDialog.parentId || null);
        await refetchInventoryWorkspaceData(false);
        if (!isEditing) {
          applyCategorySelection(result);
        }
      } else {
        const result = isEditing
          ? await updateApiInventoryUnit(
              taxonomyDialog.editId!,
              nextName,
              taxonomyDialog.alternateUnit.trim() || undefined,
              Number(taxonomyDialog.alternateUnitConversion || 0) || undefined,
            )
          : await createApiInventoryUnit(
              workspaceId,
              nextName,
              taxonomyDialog.alternateUnit.trim() || undefined,
              Number(taxonomyDialog.alternateUnitConversion || 0) || undefined,
            );
        await refetchInventoryWorkspaceData(false);
        if (!isEditing) {
          setCustomUnitMode(false);
          updateFormField("unit", result.name);
        }
      }

      toast.success(`${taxonomyDialog.kind === "category" ? "Category" : "Unit"} ${isEditing ? "updated" : "added"}`);
      closeTaxonomyDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not be saved");
    } finally {
      setTaxonomySaving(false);
    }
  }

  function openAddWorkspaceTaxonomy(kind: "category" | "unit") {
    setTaxonomyParentQuery("");
    setTaxonomyParentHighlightIndex(0);
    setTaxonomyParentPickerOpen(false);
    setTaxonomyDialog({ kind, name: "", alternateUnit: "", alternateUnitConversion: "", parentId: "" });
  }

  function closeTaxonomyDialog() {
    setTaxonomyParentPickerOpen(false);
    setTaxonomyParentQuery("");
    setTaxonomyDialog(null);
  }

  async function handleDeleteTaxonomy(kind: "category" | "unit", id: string) {
    try {
      const result = kind === "category" ? await deleteApiInventoryCategory(id) : await deleteApiInventoryUnit(id);

      await refetchInventoryWorkspaceData(false);
      const reassignedCount = result.reassignedItemCount ?? 0;
      const reassignedNote =
        reassignedCount > 0
          ? kind === "category"
            ? ` — ${reassignedCount} item${reassignedCount > 1 ? "s" : ""} moved to Uncategorized`
            : ` — ${reassignedCount} item${reassignedCount > 1 ? "s" : ""} reassigned to a fallback unit`
          : "";
      toast.success(`${kind === "category" ? "Category" : "Unit"} deleted${reassignedNote}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not be deleted");
    }
  }

  function handleOpenVoucher(row: InventoryMovementRow) {
    router.push(`${buildVoucherRoute(mode, row.voucherType)}?edit=${encodeURIComponent(row.voucherId)}`);
  }

  function handlePreviewTransaction(row: InventoryMovementRow) {
    setTransactionActionMenu(null);
    setTransactionDialog({ mode: "preview", row });
  }

  function handlePrimaryRowOpen(row: InventoryMovementRow) {
    handlePreviewTransaction(row);
  }

  function handleViewOrEditTransaction(row: InventoryMovementRow) {
    setTransactionActionMenu(null);

    if (row.source === "opening") {
      openEditDialog();
      return;
    }

    if (row.source === "ledger") {
      handlePreviewTransaction(row);
      return;
    }

    handleOpenVoucher(row);
  }

  function handleOpenTransactionActionMenu(event: React.MouseEvent<HTMLButtonElement>, row: InventoryMovementRow) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 232;
    const maxLeft = Math.max(12, window.innerWidth - menuWidth - 12);

    setTransactionActionMenu((current) =>
      current?.rowId === row.id
        ? null
        : {
            rowId: row.id,
            left: Math.min(Math.max(12, rect.right - menuWidth), maxLeft),
            top: Math.min(rect.bottom + 8, window.innerHeight - 360),
          },
    );
  }

  function handleOpenTransactionBulkActionMenu(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 236;
    const maxLeft = Math.max(12, window.innerWidth - menuWidth - 12);

    setTransactionActionMenu(null);
    setTransactionBulkActionMenu((current) =>
      current
        ? null
        : {
            left: Math.min(Math.max(12, rect.right - menuWidth), maxLeft),
            top: Math.min(rect.bottom + 8, window.innerHeight - 220),
          },
    );
  }

  function handleOpenItemContextMenu(event: React.MouseEvent<HTMLDivElement>, itemId: string) {
    event.preventDefault();
    setSelectedViewId(itemId);
    const menuWidth = 208;
    const menuHeight = 176;
    const maxLeft = Math.max(12, window.innerWidth - menuWidth - 12);
    const maxTop = Math.max(12, window.innerHeight - menuHeight - 12);

    setItemContextMenu({
      itemId,
      left: Math.min(event.clientX, maxLeft),
      top: Math.min(event.clientY, maxTop),
    });
  }

  function buildItemContextMenuItems() {
    if (activeWorkspaceTab === "categories" || activeWorkspaceTab === "units") {
      const kind = activeWorkspaceTab === "categories" ? "category" : "unit";
      const entry =
        kind === "category"
          ? localCategories.find((category) => category.id === itemContextMenu?.itemId)
          : localUnits.find((unit) => unit.id === itemContextMenu?.itemId);

      if (!entry) {
        return [];
      }

      return [
        {
          label: kind === "category" ? "Edit Category" : "Edit Unit",
          icon: Pencil,
          action: () => {
            setItemContextMenu(null);
            setTaxonomyDialog({
              kind,
              name: entry.name,
              alternateUnit: entry.alternateUnit ?? "",
              alternateUnitConversion: entry.alternateUnitConversion ? String(entry.alternateUnitConversion) : "",
              parentId: entry.parentId ?? "",
              editId: entry.id,
            });
          },
        },
        {
          label: kind === "category" ? "Delete Category" : "Delete Unit",
          icon: Trash2,
          action: () => { setItemContextMenu(null); void handleDeleteTaxonomy(kind, entry.id); },
        },
      ];
    }

    const isService = selectedItem?.kind === "service";
    return [
      { label: isService ? "Edit Service" : "Edit Item", icon: Pencil, action: () => { setItemContextMenu(null); openEditDialog(); } },
      ...(isService ? [] : [{ label: "Adjust Item", icon: PackagePlus, action: () => { setItemContextMenu(null); handleAdjustItem(); } }]),
      { label: isService ? "Duplicate Service" : "Duplicate Item", icon: Boxes, action: () => { setItemContextMenu(null); handleDuplicateItem(); } },
      {
        label: isService ? "Delete Service" : "Delete Item",
        icon: Trash2,
        action: () => { setItemContextMenu(null); handleDeleteItem(); },
        disabled: selectedItemHasVoucherHistory,
        hint: "This item already has real voucher history",
      },
    ];
  }

  function handleDeleteTransaction(row: InventoryMovementRow) {
    setTransactionActionMenu(null);

    setConfirmationDialog({
      kind: "delete-transaction",
      voucherId: row.voucherId,
      rowId: row.id,
      voucherNumber: row.voucherNumber,
      status: row.status,
    });
  }

  function handleDeleteOpeningStock() {
    setTransactionActionMenu(null);
    if (!selectedItem) {
      return;
    }

    setConfirmationDialog({
      kind: "delete-opening-stock",
      itemId: selectedItem.id,
      itemName: selectedItem.itemName,
    });
  }

  function handleEditAdjustment(row: InventoryMovementRow) {
    setTransactionActionMenu(null);
    if (!selectedItem) {
      return;
    }

    const adjustmentMode: "add" | "reduce" = row.stockQuantity >= 0 ? "add" : "reduce";
    const isFallbackNote = row.reference === "Manual increase" || row.reference === "Manual decrease";
    const reasonOptions = getStockAdjustmentReasonOptions(adjustmentMode);
    const reason = (row.reason && reasonOptions.some((option) => option.value === row.reason) ? row.reason : "other") as string;

    setStockAdjustmentDialog({
      itemId: selectedItem.id,
      itemName: selectedItem.itemName,
      mode: adjustmentMode,
      quantity: String(Math.abs(row.stockQuantity)),
      unitPrice: row.unitPrice > 0 ? String(row.unitPrice) : "",
      details: isFallbackNote ? "" : (row.note?.trim() ?? row.reference),
      reason,
      adjustmentDate: row.voucherDate,
      editId: row.id.replace(/^adjustment-/, ""),
      originalQuantity: row.stockQuantity,
      warehouseId: row.warehouseId,
      batchNumber: row.batchNumber ?? "",
      manufacturedAt: row.manufacturedAt?.slice(0, 10) ?? "",
      expiresAt: row.expiresAt?.slice(0, 10) ?? "",
    });
    setStockAdjustmentItemQuery(selectedItem.itemName);
    setStockAdjustmentItemDropdownOpen(false);
  }

  function handleDeleteAdjustment(row: InventoryMovementRow) {
    setTransactionActionMenu(null);
    if (!selectedItem) {
      return;
    }

    setConfirmationDialog({
      kind: "delete-adjustment",
      itemId: selectedItem.id,
      adjustmentId: row.id.replace(/^adjustment-/, ""),
      rowId: row.id,
    });
  }

  function buildBulkDeleteRows(rows: InventoryMovementRow[]) {
    const bulkRows: InventoryBulkDeleteRow[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      if (row.source === "voucher" && row.voucherId) {
        const key = `voucher:${row.voucherId}`;
        if (!seen.has(key)) {
          seen.add(key);
          bulkRows.push({ source: "voucher", voucherId: row.voucherId, rowId: row.id, status: row.status });
        }
        continue;
      }

      const item = localItems.find((entry) => entry.itemCode === row.itemCode || entry.itemName === row.itemName);
      if (!item) {
        continue;
      }

      if (row.source === "adjustment") {
        const adjustmentId = row.id.replace(/^adjustment-/, "");
        const key = `adjustment:${item.id}:${adjustmentId}`;
        if (!seen.has(key)) {
          seen.add(key);
          bulkRows.push({ source: "adjustment", itemId: item.id, adjustmentId, rowId: row.id, quantity: row.quantity });
        }
        continue;
      }

      if (row.source === "opening") {
        const key = `opening:${item.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          bulkRows.push({ source: "opening", itemId: item.id, itemName: item.itemName, rowId: row.id });
        }
      }
    }

    return bulkRows;
  }

  function handleDeleteSelectedTransactions() {
    setTransactionBulkActionMenu(null);
    if (!selectedBulkDeleteRows.length) {
      toast.error("Select at least one transaction row to delete");
      return;
    }

    setConfirmationDialog({
      kind: "delete-selected-transactions",
      rows: selectedBulkDeleteRows,
    });
  }

  function handleSelectVisibleTransactionRows() {
    setTransactionBulkActionMenu(null);
    if (!paginatedTransactionRows.length) {
      toast.error("No visible transaction rows to select");
      return;
    }

    setSelectedTransactionIds((current) => Array.from(new Set([...current, ...paginatedTransactionRows.map((row) => row.id)])));
  }

  function handleConfirmationDialogOpenChange(open: boolean) {
    if (!open) {
      setConfirmationDialog(null);
    }
  }

  function handleConfirmDialogAction() {
    if (!confirmationDialog) {
      setConfirmationDialog(null);
      return;
    }

    if (confirmationDialog.kind === "delete-item") {
      void (async () => {
        try {
          if (mode === "api") {
            if (!selectedItem?.id || selectedItem.itemCode !== confirmationDialog.itemCode) {
              throw new Error("Select the product again before deleting");
            }
            await deleteApiInventoryItem(selectedItem.id);
            await refetchInventoryWorkspaceData(false);
          } else {
            const dataset = readDataset(mode);
            const deletedItem =
              dataset.stockItems.find(
                (item) => item.itemCode === confirmationDialog.itemCode && item.workspaceId === workspaceId,
              ) ?? null;
            if (deletedItem) {
              moveItemToRecycleBin(mode, deletedItem, session?.user.name ?? "Current User");
            }
            writeDataset(mode, {
              ...dataset,
              stockItems: dataset.stockItems.filter((item) => item.itemCode !== confirmationDialog.itemCode),
            });
            hydrateLocalStateFromDataset(mode, workspaceId);
          }
          toast.success("Product deleted");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Product could not be deleted");
        } finally {
          setConfirmationDialog(null);
        }
      })();
      return;
    }

    if (confirmationDialog.kind === "delete-selected-items") {
      const { items } = confirmationDialog;
      void (async () => {
        try {
          if (mode === "api") {
            for (const item of items) {
              await deleteApiInventoryItem(item.id);
            }
            await refetchInventoryWorkspaceData(false);
          } else {
            const dataset = readDataset(mode);
            const selectedIds = new Set(items.map((item) => item.id));
            dataset.stockItems
              .filter((item) => item.workspaceId === workspaceId && selectedIds.has(item.id))
              .forEach((item) => moveItemToRecycleBin(mode, item, session?.user.name ?? "Current User"));
            writeDataset(mode, {
              ...dataset,
              stockItems: dataset.stockItems.filter(
                (item) => item.workspaceId !== workspaceId || !selectedIds.has(item.id),
              ),
            });
            hydrateLocalStateFromDataset(mode, workspaceId);
          }
          setSelectedInventoryItemIds([]);
          toast.success(`${items.length} ${items.length === 1 ? "item" : "items"} deleted`);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Selected items could not be deleted");
        } finally {
          setConfirmationDialog(null);
        }
      })();
      return;
    }

    if (confirmationDialog.kind === "delete-opening-stock") {
      const { itemId } = confirmationDialog;
      void (async () => {
        try {
          if (mode === "api") {
            if (!selectedItem?.id || selectedItem.id !== itemId) {
              throw new Error("Select the product again before removing opening stock");
            }
            await updateApiInventoryItem(itemId, { openingQty: 0, openingRate: 0 });
            await refetchInventoryWorkspaceData(false);
          } else {
            const dataset = readDataset(mode);
            writeDataset(mode, {
              ...dataset,
              stockItems: dataset.stockItems.map((item) =>
                item.workspaceId === workspaceId && item.id === itemId ? { ...item, openingQty: 0, openingRate: 0 } : item,
              ),
            });
            hydrateLocalStateFromDataset(mode, workspaceId);
          }
          toast.success("Opening stock removed");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Opening stock could not be removed");
        } finally {
          setConfirmationDialog(null);
        }
      })();
      return;
    }

    if (confirmationDialog.kind === "delete-adjustment") {
      const { itemId, adjustmentId, rowId } = confirmationDialog;
      void (async () => {
        try {
          if (mode === "api") {
            await deleteApiInventoryAdjustment(itemId, adjustmentId);
            await refetchInventoryWorkspaceData(false);
          }
          setSelectedTransactionIds((current) => current.filter((id) => id !== rowId));
          toast.success("Adjustment deleted");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Adjustment could not be deleted");
        } finally {
          setConfirmationDialog(null);
        }
      })();
      return;
    }

    if (confirmationDialog.kind === "delete-selected-transactions") {
      const { rows } = confirmationDialog;
      const rowIds = rows.map((row) => row.rowId);
      void (async () => {
        let processedCount = 0;
        for (const row of rows) {
          try {
            if (row.source === "voucher") {
              const deletedVoucher = await deleteVoucher(mode, row.voucherId, workspaceId);
              if (deletedVoucher && mode !== "api") {
                moveVoucherToRecycleBin(mode, deletedVoucher, session?.user.name ?? "Current User");
              }
            } else if (row.source === "adjustment") {
              if (mode === "api") {
                await deleteApiInventoryAdjustment(row.itemId, row.adjustmentId);
              } else {
                const dataset = readDataset(mode);
                writeDataset(mode, {
                  ...dataset,
                  stockItems: dataset.stockItems.map((item) =>
                    item.workspaceId === workspaceId && item.id === row.itemId
                      ? { ...item, openingQty: Math.max(0, Number(item.openingQty || 0) - row.quantity) }
                      : item,
                  ),
                });
              }
            } else if (row.source === "opening") {
              if (mode === "api") {
                await updateApiInventoryItem(row.itemId, { openingQty: 0, openingRate: 0 });
              } else {
                const dataset = readDataset(mode);
                writeDataset(mode, {
                  ...dataset,
                  stockItems: dataset.stockItems.map((item) =>
                    item.workspaceId === workspaceId && item.id === row.itemId ? { ...item, openingQty: 0, openingRate: 0 } : item,
                  ),
                });
              }
            }
            processedCount += 1;
          } catch {
            // continue deleting the rest; report the shortfall below
          }
        }

        await refetchInventoryWorkspaceData(false);
        setSelectedTransactionIds((current) => current.filter((id) => !rowIds.includes(id)));

        if (processedCount === rows.length) {
          toast.success(`${processedCount} transaction${processedCount > 1 ? "s" : ""} deleted`);
        } else {
          toast.error(`${processedCount} of ${rows.length} transactions deleted; the rest could not be removed`);
        }

        setConfirmationDialog(null);
      })();
      return;
    }

    void (async () => {
      try {
        const deletedVoucher = await deleteVoucher(mode, confirmationDialog.voucherId, workspaceId);
        if (deletedVoucher && mode !== "api") {
          moveVoucherToRecycleBin(mode, deletedVoucher, session?.user.name ?? "Current User");
        }
        toast.success("Transaction deleted");
        await refetchInventoryWorkspaceData(false);
        setSelectedTransactionIds((current) => current.filter((id) => id !== confirmationDialog.rowId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Transaction could not be removed");
      } finally {
        setConfirmationDialog(null);
      }
    })();
  }

  function handleDuplicateTransaction(row: InventoryMovementRow) {
    setTransactionActionMenu(null);
    router.push(`${buildVoucherRoute(mode, row.voucherType)}?duplicate=${encodeURIComponent(row.voucherId)}`);
  }

  async function handleOpenTransactionPdf(row: InventoryMovementRow) {
    setTransactionActionMenu(null);
    try {
      const voucher = await getVoucher(mode, row.voucherId, workspaceId);
      await openInvoicePdf(buildInvoiceExportPayloadFromVoucher(mode, voucher));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF could not be opened");
    }
  }

  async function handlePrintTransaction(row: InventoryMovementRow) {
    setTransactionActionMenu(null);
    try {
      const voucher = await getVoucher(mode, row.voucherId, workspaceId);
      await printInvoice(buildInvoiceExportPayloadFromVoucher(mode, voucher));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invoice print failed");
    }
  }

  function handleConvertTransactionToReturn(row: InventoryMovementRow) {
    setTransactionActionMenu(null);
    const targetType = row.voucherType === "sales" ? "credit-note" : row.voucherType === "purchase" ? "debit-note" : null;

    if (!targetType) {
      toast.info("Convert to return is available for sales and purchase vouchers only");
      return;
    }

    router.push(`${buildVoucherRoute(mode, targetType)}?fromVoucher=${encodeURIComponent(row.voucherId)}`);
  }

  function handleMakeTransactionPayment(row: InventoryMovementRow) {
    setTransactionActionMenu(null);
    const targetType = row.voucherType === "sales" ? "receipt" : row.voucherType === "purchase" ? "payment" : null;

    if (!targetType) {
      toast.info("Payment action is available for sales and purchase vouchers only");
      return;
    }

    router.push(`${buildVoucherRoute(mode, targetType)}?fromVoucher=${encodeURIComponent(row.voucherId)}`);
  }

  function handleOpenTransactionHistory(row: InventoryMovementRow) {
    setTransactionActionMenu(null);
    setTransactionDialog({ mode: "history", row });
  }

  function buildTransactionActionItems(row: InventoryMovementRow) {
    if (row.source === "ledger") {
      return [
        { label: "Preview", icon: Search, action: () => handlePreviewTransaction(row) },
        { label: "View History", icon: FileText, action: () => handleOpenTransactionHistory(row) },
      ];
    }

    if (row.source === "adjustment") {
      return [
        { label: "Edit", icon: Pencil, action: () => handleEditAdjustment(row) },
        { label: "Delete", icon: Trash2, action: () => handleDeleteAdjustment(row) },
        { label: "Preview", icon: Search, action: () => handlePreviewTransaction(row) },
        { label: "View History", icon: FileText, action: () => handleOpenTransactionHistory(row) },
      ];
    }

    if (row.source === "opening") {
      return [
        { label: "View / Edit", icon: Pencil, action: () => handleViewOrEditTransaction(row) },
        {
          label: "Delete",
          icon: Trash2,
          action: handleDeleteOpeningStock,
          disabled: selectedItemHasVoucherHistory,
          hint: "This item already has real voucher history",
        },
        { label: "Duplicate", icon: Copy, action: handleDuplicateItem },
        { label: "Preview", icon: Search, action: () => handlePreviewTransaction(row) },
        { label: "View History", icon: FileText, action: () => handleOpenTransactionHistory(row) },
      ];
    }

    return [
      { label: "View / Edit", icon: Pencil, action: () => handleViewOrEditTransaction(row) },
      { label: "Delete", icon: Trash2, action: () => handleDeleteTransaction(row) },
      { label: "Duplicate", icon: Copy, action: () => handleDuplicateTransaction(row) },
      { label: "Open PDF", icon: FileText, action: () => void handleOpenTransactionPdf(row) },
      { label: "Preview", icon: Search, action: () => handlePreviewTransaction(row) },
      { label: "Print", icon: Printer, action: () => void handlePrintTransaction(row) },
      { label: "Convert to Return", icon: RefreshCw, action: () => handleConvertTransactionToReturn(row) },
      { label: "Make Payment", icon: Wallet, action: () => handleMakeTransactionPayment(row) },
      { label: "View History", icon: Settings2, action: () => handleOpenTransactionHistory(row) },
    ];
  }

  function handleStockAdjustmentModeChange(mode: "add" | "reduce") {
    setStockAdjustmentDialog((current) => {
      if (!current) {
        return current;
      }
      const currentItem = localItems.find((item) => item.id === current.itemId);
      return {
        ...current,
        mode,
        reason: getStockAdjustmentReasonOptions(mode)[0].value,
        unitPrice: mode === "reduce" ? String(currentItem?.rate ?? 0) : current.unitPrice,
      };
    });
  }

  function handleStockAdjustmentItemSelect(item: InventorySnapshotItem) {
    setStockAdjustmentDialog((current) =>
      current
        ? {
            ...current,
            itemId: item.id,
            itemName: item.itemName,
            unitPrice: current.mode === "reduce" ? String(item.rate || 0) : current.unitPrice,
            warehouseId: mode === "api" ? "" : "demo-main",
          }
        : current,
    );
    setStockAdjustmentItemQuery(item.itemName);
    setStockAdjustmentItemDropdownOpen(false);
  }

  async function handleSaveStockAdjustment() {
    if (!stockAdjustmentDialog) {
      return;
    }

    const targetItem = localItems.find((item) => item.id === stockAdjustmentDialog.itemId);
    if (!targetItem) {
      toast.error("Select a product to adjust");
      return;
    }

    const adjustmentQty = Number(stockAdjustmentDialog.quantity);
    if (!Number.isFinite(adjustmentQty) || adjustmentQty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }

    if (!stockAdjustmentDialog.reason) {
      toast.error("Select a reason");
      return;
    }

    if (!stockAdjustmentDialog.warehouseId) {
      toast.error("Select a warehouse");
      return;
    }

    if (stockAdjustmentDialog.reason === "other" && !stockAdjustmentDialog.details.trim()) {
      toast.error("Add details for the \"Other\" reason");
      return;
    }

    const signedQuantity = stockAdjustmentDialog.mode === "reduce" ? -adjustmentQty : adjustmentQty;
    const baselineQuantity = targetItem.quantity - (stockAdjustmentDialog.originalQuantity ?? 0);
    const nextCurrentQuantity = baselineQuantity + signedQuantity;
    if (mode !== "api" && nextCurrentQuantity < 0) {
      toast.error("Reduce quantity cannot be greater than current stock");
      return;
    }
    if (targetItem.trackBatchExpiry && !stockAdjustmentDialog.expiresAt) {
      toast.error("Expiry Date is required for this item");
      return;
    }
    if (stockAdjustmentDialog.manufacturedAt && stockAdjustmentDialog.expiresAt && stockAdjustmentDialog.manufacturedAt > stockAdjustmentDialog.expiresAt) {
      toast.error("Manufacturing Date cannot be after Expiry Date");
      return;
    }

    const selectedWarehouse = warehousesQuery.data?.find((warehouse) => warehouse.id === stockAdjustmentDialog.warehouseId);
    const selectedWarehouseBalance = mode === "api"
      ? warehouseStockQuery.data?.find((row) => row.inventoryItemId === targetItem.id && row.warehouseId === stockAdjustmentDialog.warehouseId)?.quantity ?? 0
      : targetItem.quantity;
    if (!stockAdjustmentDialog.editId && signedQuantity < 0 && Math.abs(signedQuantity) > selectedWarehouseBalance) {
      toast.error(`Insufficient stock in ${selectedWarehouse?.name ?? "the selected warehouse"}. Available: ${formatNumber(selectedWarehouseBalance)} ${targetItem.unit}`);
      return;
    }

    try {
      if (mode === "api") {
        if (stockAdjustmentDialog.editId) {
          await updateApiInventoryAdjustment(targetItem.id, stockAdjustmentDialog.editId, {
            quantity: signedQuantity,
            unitPrice: stockAdjustmentDialog.mode === "reduce" ? adjustmentCurrentUnitCost : Number(stockAdjustmentDialog.unitPrice || targetItem.rate || 0),
            note: stockAdjustmentDialog.details,
            reason: stockAdjustmentDialog.reason,
            adjustmentDate: stockAdjustmentDialog.adjustmentDate,
            warehouseId: stockAdjustmentDialog.warehouseId,
            batchNumber: stockAdjustmentDialog.batchNumber,
            manufacturedAt: stockAdjustmentDialog.manufacturedAt,
            expiresAt: stockAdjustmentDialog.expiresAt,
          });
        } else {
          await createApiInventoryAdjustment(targetItem.id, {
            quantity: signedQuantity,
            unitPrice: stockAdjustmentDialog.mode === "reduce" ? adjustmentCurrentUnitCost : Number(stockAdjustmentDialog.unitPrice || targetItem.rate || 0),
            note: stockAdjustmentDialog.details,
            reason: stockAdjustmentDialog.reason,
            adjustmentDate: stockAdjustmentDialog.adjustmentDate,
            warehouseId: stockAdjustmentDialog.warehouseId,
            batchNumber: stockAdjustmentDialog.batchNumber,
            manufacturedAt: stockAdjustmentDialog.manufacturedAt,
            expiresAt: stockAdjustmentDialog.expiresAt,
          });
        }
        await refetchInventoryWorkspaceData(false);
      } else {
        const nextOpeningQty = targetItem.openingQty + signedQuantity;
        const dataset = readDataset(mode);
        writeDataset(mode, {
          ...dataset,
          stockItems: dataset.stockItems.map((item) =>
            item.workspaceId === workspaceId && item.itemCode === targetItem.itemCode
              ? {
                  ...item,
                  openingQty: nextOpeningQty,
                  openingRate: Number(stockAdjustmentDialog.unitPrice || item.openingRate || targetItem.rate || 0),
                }
              : item,
          ),
        });
        hydrateLocalStateFromDataset(mode, workspaceId);
      }

      const wasEditing = Boolean(stockAdjustmentDialog.editId);
      setStockAdjustmentDialog(null);
      toast.success(wasEditing ? "Stock adjustment updated" : "Stock quantity adjusted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stock quantity could not be adjusted");
    }
  }

  function renderCell(row: InventoryMovementRow, columnId: InventoryColumnId) {
    switch (columnId) {
      case "select":
        return (
          <input
            type="checkbox"
            checked={selectedTransactionIds.includes(row.id)}
            onChange={(event) =>
              setSelectedTransactionIds((current) =>
                event.target.checked ? [...current, row.id] : current.filter((value) => value !== row.id),
              )
            }
          />
        );
      case "type":
        return (
          <Badge className="whitespace-nowrap border-0 bg-[#fff1ed] px-2.5 py-1 text-[11px] font-semibold text-[#d94816]">
            {row.displayType}
          </Badge>
        );
      case "voucherNumber":
        return row.source === "voucher" ? (
          <button
            type="button"
            className="min-w-0 text-left hover:text-primary"
            onClick={() => handleOpenVoucher(row)}
          >
            <div className="truncate font-semibold text-foreground">{row.voucherNumber}</div>
            {row.reference && row.reference !== row.voucherNumber ? (
              <div className="truncate text-xs text-muted">{row.reference}</div>
            ) : null}
          </button>
        ) : (
          <div className="min-w-0">
            <div className="truncate font-semibold text-foreground">{row.voucherNumber}</div>
            <div className="truncate text-xs text-muted">{row.reference}</div>
          </div>
        );
      case "reference":
        return <span className="truncate text-muted">{row.reference || "-"}</span>;
      case "partyName":
        return (
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{row.partyName}</div>
            <div className="truncate text-xs text-muted">{row.itemName}</div>
          </div>
        );
      case "voucherDate":
        return formatDate(row.voucherDate);
      case "quantity":
        return (
          <div className={cn("min-w-0 tabular-nums font-medium", row.affectsStock && (row.stockQuantity >= 0 ? "text-success" : "text-danger"))}>
            <div className="truncate">{formatMovementQuantity(row)}</div>
            <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide">
              {getMovementDirectionLabel(row)}
            </div>
          </div>
        );
      case "unitPrice":
        return <span className="tabular-nums font-medium">{formatCurrency(row.unitPrice)}</span>;
      case "total":
        return <span className="tabular-nums font-semibold">{formatCurrency(row.total)}</span>;
      case "warehouse":
        return <span className="truncate text-foreground">{row.warehouse}</span>;
      case "status":
        return (
          <Badge
            className={cn(
              "border-0 px-2.5 py-1 text-[11px] font-semibold capitalize",
              row.status === "posted"
                ? "bg-[#e6f6ee] text-[#0f8b4c]"
                : row.status === "pending"
                  ? "bg-[#ebf2ff] text-[#245bb2]"
                  : row.status === "draft"
                    ? "bg-[#fff7e6] text-[#b7791f]"
                    : "bg-canvas text-muted",
            )}
          >
            {row.status}
          </Badge>
        );
      case "actions":
        return (
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-foreground"
            onClick={(event) => handleOpenTransactionActionMenu(event, row)}
            aria-label="Open transaction actions"
          >
            <EllipsisVertical className="h-4 w-4" />
          </button>
        );
      default:
        return "-";
    }
  }

  if (!hasHydrated || !session || itemsQuery.isLoading || vouchersQuery.isLoading) {
    return <LoadingPanel lines={9} />;
  }

  if (itemsQuery.error || vouchersQuery.error) {
    return (
      <ErrorPanel
        title="Inventory workspace unavailable"
        description="The inventory list or stock movement history could not be loaded from the current data source."
        onRetry={handleRefresh}
      />
    );
  }

  return (
    <>
      <input ref={importInputRef} type="file" accept=".csv,.json" className="hidden" onChange={handleImportItemsFile} />

      <Dialog open={Boolean(transactionDialog)} onOpenChange={(open) => (!open ? setTransactionDialog(null) : undefined)}>
        <DialogContent>
          <DialogTitle>{transactionDialog?.mode === "history" ? "Transaction History" : "Transaction Preview"}</DialogTitle>
          <DialogDescription>
            {transactionDialog?.mode === "history"
              ? "Quick activity details for the selected stock-linked voucher."
              : "Review the selected transaction before opening or printing it."}
          </DialogDescription>
          {transactionDialog ? (
            <div className="space-y-4 pt-2">
              <div className="grid sm:grid-cols-2 sm:gap-x-8">
                  {[ 
                    { label: "Type", value: transactionDialog.row.displayType },
                  {
                    label: "Invoice / Ref. No",
                    value:
                      transactionDialog.row.reference && transactionDialog.row.reference !== transactionDialog.row.voucherNumber
                        ? `${transactionDialog.row.voucherNumber} / ${transactionDialog.row.reference}`
                        : transactionDialog.row.voucherNumber,
                  },
                  { label: "Party", value: transactionDialog.row.partyName },
                  { label: "Date", value: formatDate(transactionDialog.row.voucherDate) },
                  {
                    label: "Quantity",
                    value: `${formatMovementQuantity(transactionDialog.row)} — ${getMovementDirectionLabel(transactionDialog.row)}`,
                  },
                  { label: "Price / Unit", value: formatCurrency(transactionDialog.row.unitPrice) },
                  { label: "Status", value: transactionDialog.row.status },
                  { label: "Warehouse", value: transactionDialog.row.warehouse },
                ].map((item) => (
                  <div key={item.label} className="flex min-h-14 items-center justify-between gap-5 border-b border-border py-3">
                    <div className="text-xs font-medium text-muted">{item.label}</div>
                    <div
                      className={cn(
                        "text-right text-sm font-semibold text-foreground",
                        item.label === "Status" && "rounded-full px-2.5 py-1 capitalize",
                        item.label === "Status" && item.value === "posted" && "bg-[#e6f6ee] text-[#0f8b4c]",
                        item.label === "Status" && (item.value === "pending" || item.value === "approved") && "bg-[#fff7e6] text-[#b7791f]",
                        item.label === "Status" && item.value === "cancelled" && "bg-[#fff1f2] text-[#dc2626]",
                        item.label === "Type" && "rounded-full bg-[#fff1ed] px-2.5 py-1 capitalize text-[#d94816]",
                      )}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              {transactionDialog.mode === "history" ? (
                <div className="divide-y divide-border border-y border-border">
                  {[ 
                    transactionDialog.row.source === "opening"
                      ? `${transactionDialog.row.itemName} was opened on ${formatDate(transactionDialog.row.voucherDate)}.`
                      : `Voucher ${transactionDialog.row.voucherNumber} was recorded on ${formatDate(transactionDialog.row.voucherDate)}.`,
                    `${formatNumber(transactionDialog.row.quantity)} ${transactionDialog.row.unit} moved for ${transactionDialog.row.itemName}.`,
                    transactionDialog.row.source === "opening"
                      ? `Opening balance is stored with status ${transactionDialog.row.status}.`
                      : `${transactionDialog.row.partyName} is linked to this ${transactionDialog.row.displayType} entry with status ${transactionDialog.row.status}.`,
                  ].map((entry) => (
                    <div key={entry} className="py-2.5 text-sm text-foreground">
                      {entry}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-y border-border py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Item</div>
                  <div className="mt-1 text-base font-semibold text-foreground">{transactionDialog.row.itemName}</div>
                  <div className="mt-1 text-sm text-muted">
                    {transactionDialog.row.itemCode} • {transactionDialog.row.category}
                  </div>
                  <div className="mt-3 text-sm font-medium text-foreground">Total value {formatCurrency(transactionDialog.row.total)}</div>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                {transactionDialog.row.source !== "ledger" ? <Button
                  onClick={() => {
                    if (transactionDialog.row.source === "opening") {
                      openEditDialog();
                    } else if (transactionDialog.row.source === "adjustment") {
                      setTransactionDialog(null);
                      handleEditAdjustment(transactionDialog.row);
                    } else {
                      handleOpenVoucher(transactionDialog.row);
                    }
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  {transactionDialog.row.source === "opening" ? "Edit Item" : transactionDialog.row.source === "adjustment" ? "Edit" : "View / Edit"}
                </Button> : null}
                {transactionDialog.row.source === "voucher" ? (
                  <Button variant="outline" onClick={() => void handlePrintTransaction(transactionDialog.row)}>
                    <Printer className="h-4 w-4" />
                    Print
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(stockAdjustmentDialog)} onOpenChange={(open) => (!open ? setStockAdjustmentDialog(null) : undefined)}>
        <DialogContent hideClose className="w-[min(90vw,860px)] max-w-none rounded-[20px] border border-[#dfe5ee] p-0 shadow-[0_28px_70px_rgba(15,23,42,0.18)]">
          {stockAdjustmentDialog ? (
            <div className="overflow-hidden bg-white">
              <div className="flex items-center justify-between border-b border-[#d9e1ec] px-6 py-5">
                <div className="flex flex-wrap items-center gap-4">
                <div className="whitespace-nowrap text-[2rem] font-semibold text-[#24324a]">{stockAdjustmentDialog.editId ? "Edit Adjustment" : "Stock Adjustment"}</div>
                  <div className="inline-flex items-center rounded-full bg-[#eef5ff] p-1">
                    <button
                      type="button"
                      className={cn(
                        "rounded-full px-4 py-2 text-sm font-semibold transition",
                        stockAdjustmentDialog.mode === "add" ? "bg-[#0f6cf6] text-white shadow-sm" : "text-[#7b8aa0]",
                      )}
                      onClick={() => handleStockAdjustmentModeChange("add")}
                    >
                      Add Stock
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded-full px-4 py-2 text-sm font-semibold transition",
                        stockAdjustmentDialog.mode === "reduce" ? "bg-[#0f6cf6] text-white shadow-sm" : "text-[#7b8aa0]",
                      )}
                      onClick={() => handleStockAdjustmentModeChange("reduce")}
                    >
                      Reduce Stock
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#8b96aa] transition hover:bg-[#f2f6fb] hover:text-[#17263c]"
                  onClick={() => setStockAdjustmentDialog(null)}
                  aria-label="Close stock adjustment"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-6 px-6 py-6">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_200px_220px]">
                  <div className="relative space-y-2">
                    <label className="text-sm font-medium text-[#6d7d93]">Item Name</label>
                    {stockAdjustmentDialog.editId ? (
                      <div className="mt-2 text-base font-semibold text-[#24324a]">{stockAdjustmentDialog.itemName}</div>
                    ) : (
                      <>
                        <Input
                          value={stockAdjustmentItemQuery}
                          placeholder="Search product to adjust"
                          onChange={(event) => {
                            setStockAdjustmentItemQuery(event.target.value);
                            setStockAdjustmentItemDropdownOpen(true);
                          }}
                          onFocus={() => setStockAdjustmentItemDropdownOpen(true)}
                          onBlur={() => setStockAdjustmentItemDropdownOpen(false)}
                          className="h-11 rounded-xl border-[#d8e1ea] bg-white"
                        />
                        {stockAdjustmentItemDropdownOpen ? (
                          <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[#d8e1ea] bg-white shadow-[0_18px_34px_rgba(15,23,42,0.14)]">
                            {localItems
                              .filter((item) => item.kind === "product")
                              .filter((item) => item.itemName.toLowerCase().includes(stockAdjustmentItemQuery.trim().toLowerCase()))
                              .slice(0, 8)
                              .map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => handleStockAdjustmentItemSelect(item)}
                                  className={cn(
                                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-[#f5f9ff]",
                                    item.id === stockAdjustmentDialog.itemId ? "bg-[#eef5ff]" : "",
                                  )}
                                >
                                  <span className="truncate font-medium text-[#24324a]">{item.itemName}</span>
                                  <span className="shrink-0 text-xs text-[#8994a6]">
                                    {formatNumber(item.quantity)} {item.unit}
                                  </span>
                                </button>
                              ))}
                            {localItems.filter(
                              (item) => item.kind === "product" && item.itemName.toLowerCase().includes(stockAdjustmentItemQuery.trim().toLowerCase()),
                            ).length === 0 ? (
                              <div className="px-3 py-2.5 text-center text-sm text-[#8994a6]">No product found.</div>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#6d7d93]">Adjustment Date</label>
                    <AppDateInput
                      value={stockAdjustmentDialog.adjustmentDate}
                      onChange={(value) =>
                        setStockAdjustmentDialog((current) =>
                          current ? { ...current, adjustmentDate: value } : current,
                        )
                      }
                      aria-label="Adjustment Date"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#6d7d93]">Reason</label>
                    <select
                      value={stockAdjustmentDialog.reason}
                      onChange={(event) =>
                        setStockAdjustmentDialog((current) =>
                          current ? { ...current, reason: event.target.value } : current,
                        )
                      }
                      className="h-11 w-full rounded-xl border border-[#d8e1ea] bg-white px-3 text-sm font-medium outline-none"
                    >
                      {getStockAdjustmentReasonOptions(stockAdjustmentDialog.mode).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-end">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#6d7d93]">Warehouse *</label>
                    <select
                      required
                      value={stockAdjustmentDialog.warehouseId}
                      onChange={(event) => setStockAdjustmentDialog((current) => current ? { ...current, warehouseId: event.target.value } : current)}
                      className="h-11 w-full rounded-xl border border-[#d8e1ea] bg-white px-3 text-sm font-medium outline-none"
                    >
                      <option value="">Select warehouse</option>
                      {mode === "api" ? (warehousesQuery.data ?? []).filter((warehouse) => warehouse.isActive).map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                      )) : <option value="demo-main">Main Warehouse</option>}
                    </select>
                  </div>
                  {stockAdjustmentDialog.warehouseId ? (() => {
                    const warehouse = mode === "api"
                      ? warehousesQuery.data?.find((candidate) => candidate.id === stockAdjustmentDialog.warehouseId)
                      : { name: "Main Warehouse" };
                    const available = mode === "api"
                      ? warehouseStockQuery.data?.find((row) => row.inventoryItemId === stockAdjustmentDialog.itemId && row.warehouseId === stockAdjustmentDialog.warehouseId)?.quantity ?? 0
                      : localItems.find((item) => item.id === stockAdjustmentDialog.itemId)?.quantity ?? 0;
                    const unit = canonicalItems.find((item) => item.id === stockAdjustmentDialog.itemId)?.unit ?? "";
                    return (
                      <div className="rounded-xl border border-[#d8e1ea] bg-[#f6f9fd] px-4 py-3 text-sm text-[#52627a]">
                        Available in <span className="font-semibold text-[#24324a]">{warehouse?.name ?? "Selected Warehouse"}</span>:{" "}
                        <span className="font-semibold text-[#24324a]">{formatNumber(available)} {unit}</span>
                      </div>
                    );
                  })() : <div className="pb-3 text-sm text-[#8994a6]">Select a warehouse to view available stock.</div>}
                </div>

                <div className="border-t border-[#e3eaf4]" />

                {adjustmentItem?.trackBatchExpiry ? (
                  <div className="rounded-2xl border border-[#d8e1ea] bg-[#fbfdff] p-4">
                    <div className="mb-3 text-sm font-semibold text-[#24324a]">Batch &amp; Expiry Details</div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-[#6d7d93]">Batch / Lot Number (Optional)</label>
                        <Input value={stockAdjustmentDialog.batchNumber} onChange={(event) => setStockAdjustmentDialog((current) => current ? { ...current, batchNumber: event.target.value } : current)} placeholder="Batch or lot number" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-[#6d7d93]">Manufacturing Date</label>
                        <AppDateInput value={stockAdjustmentDialog.manufacturedAt} onChange={(value) => setStockAdjustmentDialog((current) => current ? { ...current, manufacturedAt: value } : current)} aria-label="Manufacturing Date" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-[#6d7d93]">Expiry Date <span className="text-red-600" aria-hidden="true">*</span></label>
                        <AppDateInput value={stockAdjustmentDialog.expiresAt} onChange={(value) => setStockAdjustmentDialog((current) => current ? { ...current, expiresAt: value } : current)} aria-label="Expiry Date" />
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-[180px_220px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#6d7d93]">
                      {stockAdjustmentDialog.mode === "add" ? "Quantity to Add" : "Quantity to Reduce"}
                    </label>
                    <div className="relative">
                      <Input
                        inputMode="decimal"
                        placeholder={stockAdjustmentDialog.mode === "add" ? "Quantity to Add" : "Quantity to Reduce"}
                        value={stockAdjustmentDialog.quantity}
                        onChange={(event) =>
                          setStockAdjustmentDialog((current) =>
                            current ? { ...current, quantity: event.target.value } : current,
                          )
                        }
                        className="h-11 rounded-xl border-[#d8e1ea] bg-white pr-14"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-[#6d7d93]">
                        {adjustmentItem?.unit ?? ""}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#6d7d93]">Unit Cost (BDT)</label>
                    <Input
                      money
                      inputMode="decimal"
                      placeholder="Unit Cost"
                      value={stockAdjustmentDialog.mode === "reduce" ? String(adjustmentCurrentUnitCost) : stockAdjustmentDialog.unitPrice}
                      disabled={stockAdjustmentDialog.mode === "reduce"}
                      onChange={(event) =>
                        setStockAdjustmentDialog((current) =>
                          current ? { ...current, unitPrice: event.target.value } : current,
                        )
                      }
                      className={cn(
                        "h-11 rounded-xl border-[#d8e1ea]",
                        stockAdjustmentDialog.mode === "reduce" ? "bg-[#f4f6f9] text-[#6d7d93]" : "bg-white",
                      )}
                    />
                    <p className="text-[11px] leading-4 text-[#8994a6]">
                      {stockAdjustmentDialog.mode === "reduce"
                        ? "Read-only: calculated from this warehouse's moving average cost."
                        : "Used to recalculate the moving weighted average cost."}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#6d7d93]">Details</label>
                    <Input
                      placeholder="Details"
                      value={stockAdjustmentDialog.details}
                      onChange={(event) =>
                        setStockAdjustmentDialog((current) =>
                          current ? { ...current, details: event.target.value } : current,
                        )
                      }
                      className="h-11 rounded-xl border-[#d8e1ea] bg-white"
                    />
                  </div>
                </div>

                <div className="ml-auto w-full max-w-sm rounded-xl border border-[#d8e1ea] bg-[#f6f9fd] px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-4 py-1 text-[#52627a]">
                    <span>Current Stock</span>
                    <span className="font-semibold text-[#24324a]">{formatNumber(adjustmentCurrentStock)} {adjustmentItem?.unit ?? ""}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-1 text-[#52627a]">
                    <span>Adjustment</span>
                    <span className={cn("font-semibold", adjustmentSignedQuantity < 0 ? "text-danger" : "text-success")}>
                      {adjustmentSignedQuantity < 0 ? "−" : "+"}{formatNumber(Math.abs(adjustmentSignedQuantity))} {adjustmentItem?.unit ?? ""}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-4 border-t border-[#d8e1ea] pt-2 text-[#24324a]">
                    <span className="font-semibold">New Stock</span>
                    <span className={cn("font-bold", adjustmentNewStock < 0 && "text-danger")}>{formatNumber(adjustmentNewStock)} {adjustmentItem?.unit ?? ""}</span>
                  </div>
                  {stockAdjustmentDialog.mode === "add" ? (
                    <div className="mt-1 flex items-center justify-between gap-4 border-t border-[#d8e1ea] pt-2 text-[#52627a]">
                      <span>New Average Cost</span>
                      <span className="font-semibold text-[#24324a]">{formatCurrency(adjustmentNewAverageCost)}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-end border-t border-[#d9e1ec] px-6 py-4">
                <Button
                  className="rounded-md px-10"
                  onClick={() => void handleSaveStockAdjustment()}
                  disabled={!stockAdjustmentDialog.warehouseId || adjustmentNewStock < 0}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {transactionActionMenu && activeTransactionActionRow
        ? createPortal(
            <div
              ref={transactionActionMenuRef}
              className="fixed z-[70] w-56 rounded-xl border border-border bg-white p-2 shadow-xl"
              style={{ left: `${transactionActionMenu.left}px`, top: `${transactionActionMenu.top}px` }}
            >
          {buildTransactionActionItems(activeTransactionActionRow).map((item) => (
            <button
              key={item.label}
              type="button"
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                item.disabled ? "cursor-not-allowed text-muted opacity-60" : "text-foreground hover:bg-canvas"
              }`}
              onClick={item.disabled ? undefined : item.action}
              disabled={item.disabled}
              title={item.disabled ? item.hint : undefined}
            >
              <item.icon className="h-4 w-4 text-muted" />
              {item.label}
            </button>
          ))}
            </div>,
            document.body,
          )
        : null}

      {transactionBulkActionMenu
        ? createPortal(
            <div
              ref={transactionBulkActionMenuRef}
              className="fixed z-[70] w-60 rounded-xl border border-border bg-white p-2 shadow-xl"
              style={{ left: `${transactionBulkActionMenu.left}px`, top: `${transactionBulkActionMenu.top}px` }}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-canvas"
                onClick={handleSelectVisibleTransactionRows}
              >
                <ListIcon className="h-4 w-4 text-muted" />
                Select Current Page
              </button>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition",
                  selectedBulkDeleteRows.length ? "text-danger hover:bg-canvas" : "cursor-not-allowed text-muted opacity-60",
                )}
                onClick={selectedBulkDeleteRows.length ? handleDeleteSelectedTransactions : undefined}
                disabled={!selectedBulkDeleteRows.length}
              >
                <Trash2 className="h-4 w-4 text-muted" />
                Delete Selected
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-canvas"
                onClick={() => {
                  setTransactionBulkActionMenu(null);
                  setSelectedTransactionIds([]);
                }}
              >
                <X className="h-4 w-4 text-muted" />
                Clear Selection
              </button>
            </div>,
            document.body,
          )
        : null}

      {itemContextMenu && buildItemContextMenuItems().length
        ? createPortal(
            <div
              ref={itemContextMenuRef}
              className="fixed z-[70] w-52 rounded-xl border border-border bg-white p-2 shadow-xl"
              style={{ left: `${itemContextMenu.left}px`, top: `${itemContextMenu.top}px` }}
            >
              {buildItemContextMenuItems().map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                    item.disabled ? "cursor-not-allowed text-muted opacity-60" : "text-foreground hover:bg-canvas"
                  }`}
                  onClick={item.disabled ? undefined : item.action}
                  disabled={item.disabled}
                  title={item.disabled ? item.hint : undefined}
                >
                  <item.icon className="h-4 w-4 text-muted" />
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}

      <Dialog open={Boolean(taxonomyDialog)} onOpenChange={(open) => !open && closeTaxonomyDialog()}>
        <DialogContent className="z-[80] w-[min(92vw,420px)] overflow-visible p-6" overlayClassName="z-[80]">
          <DialogTitle className="text-xl font-semibold text-foreground">
            {taxonomyDialog?.editId
              ? taxonomyDialog.kind === "category"
                ? "Edit Category"
                : "Edit Unit"
              : taxonomyDialog?.kind === "category"
                ? "Add Category"
                : "Add Unit"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted">
            {taxonomyDialog?.editId
              ? taxonomyDialog.kind === "category"
                ? "Rename this category or change its parent."
                : "Rename this unit or change its conversion details."
              : taxonomyDialog?.kind === "category"
                ? "Create a category to use when adding products or services."
                : "Create a unit to use when adding products or services."}
          </DialogDescription>
          <div className="mt-4 space-y-2">
            <label className="text-sm font-medium text-[#6d7d93]">{taxonomyDialog?.kind === "category" ? "Category name" : "Unit name"}</label>
            <Input
              autoFocus
              className="h-11 rounded-xl border-[#d8e1ea] bg-white"
              placeholder={taxonomyDialog?.kind === "category" ? "e.g. Electronics" : "e.g. Dozen"}
              value={taxonomyDialog?.name ?? ""}
              onChange={(event) => setTaxonomyDialog((current) => (current ? { ...current, name: event.target.value } : current))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSaveTaxonomy();
                }
              }}
            />
          </div>
          {taxonomyDialog?.kind === "category" ? (
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium text-[#6d7d93]">Parent Category</label>
              <div className="relative">
                <div className="relative">
                  <Input
                    role="combobox"
                    aria-expanded={taxonomyParentPickerOpen}
                    aria-controls="taxonomy-parent-options"
                    aria-autocomplete="list"
                    className="h-11 rounded-xl border-[#d8e1ea] bg-white pl-3 pr-11"
                    placeholder="Search parent category"
                    value={
                      taxonomyParentPickerOpen
                        ? taxonomyParentQuery
                        : taxonomyDialog.parentId
                          ? localCategories.find((category) => category.id === taxonomyDialog.parentId)?.name ?? ""
                          : "None — Main Category"
                    }
                    onFocus={() => {
                      setTaxonomyParentQuery("");
                      setTaxonomyParentHighlightIndex(0);
                      setTaxonomyParentPickerOpen(true);
                    }}
                    onChange={(event) => {
                      setTaxonomyParentQuery(event.target.value);
                      setTaxonomyParentHighlightIndex(0);
                      setTaxonomyParentPickerOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setTaxonomyParentPickerOpen(true);
                        setTaxonomyParentHighlightIndex((current) => Math.min(current + 1, taxonomyParentOptions.length - 1));
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setTaxonomyParentPickerOpen(true);
                        setTaxonomyParentHighlightIndex((current) => Math.max(current - 1, 0));
                      } else if (event.key === "Enter" && taxonomyParentPickerOpen) {
                        event.preventDefault();
                        const option = taxonomyParentOptions[taxonomyParentHighlightIndex];
                        if (option) {
                          setTaxonomyDialog((current) => (current ? { ...current, parentId: option.id } : current));
                          setTaxonomyParentPickerOpen(false);
                          setTaxonomyParentQuery("");
                        }
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setTaxonomyParentPickerOpen(false);
                        setTaxonomyParentQuery("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg bg-white text-muted hover:bg-canvas hover:text-foreground"
                    aria-label="Choose parent category"
                    onClick={() => {
                      setTaxonomyParentQuery("");
                      setTaxonomyParentHighlightIndex(0);
                      setTaxonomyParentPickerOpen((current) => !current);
                    }}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                {taxonomyParentPickerOpen ? (
                  <div
                    id="taxonomy-parent-options"
                    role="listbox"
                    className="absolute left-0 top-full z-[90] mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-[#d8e1ea] bg-white p-1.5 shadow-xl"
                  >
                    {taxonomyParentOptions.length ? taxonomyParentOptions.map((option, index) => (
                      <button
                        key={option.id || "main-category"}
                        type="button"
                        role="option"
                        aria-selected={taxonomyDialog.parentId === option.id}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                          index === taxonomyParentHighlightIndex ? "bg-[#e8f1ff] text-info" : "hover:bg-canvas",
                        )}
                        onMouseEnter={() => setTaxonomyParentHighlightIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setTaxonomyDialog((current) => (current ? { ...current, parentId: option.id } : current));
                          setTaxonomyParentPickerOpen(false);
                          setTaxonomyParentQuery("");
                        }}
                      >
                        <span className="min-w-0 truncate font-medium">{option.name}</span>
                        {option.parentName ? <span className="shrink-0 text-xs text-muted">under {option.parentName}</span> : null}
                      </button>
                    )) : (
                      <div className="px-3 py-5 text-center text-sm text-muted">No category found</div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {taxonomyDialog?.kind === "unit" ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#6d7d93]">Alternative Unit</label>
                <Input
                  className="h-11 rounded-xl border-[#d8e1ea] bg-white"
                  placeholder="e.g. kg"
                  value={taxonomyDialog.alternateUnit}
                  onChange={(event) => setTaxonomyDialog((current) => (current ? { ...current, alternateUnit: event.target.value } : current))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#6d7d93]">1 {taxonomyDialog.name || "unit"} =</label>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-11 rounded-xl border-[#d8e1ea] bg-white"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={taxonomyDialog.alternateUnitConversion}
                    onChange={(event) => setTaxonomyDialog((current) => (current ? { ...current, alternateUnitConversion: event.target.value } : current))}
                  />
                  <span className="shrink-0 text-sm text-[#6d7d93]">{taxonomyDialog.alternateUnit || "alt unit"}</span>
                </div>
              </div>
            </div>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={closeTaxonomyDialog}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveTaxonomy()} disabled={taxonomySaving}>
              <CheckCircle2 className="h-5 w-5" />
              {taxonomySaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={Boolean(confirmationDialog)}
        onOpenChange={handleConfirmationDialogOpenChange}
        title={
          confirmationDialog?.kind === "delete-item"
            ? "Delete product?"
            : confirmationDialog?.kind === "delete-selected-items"
              ? "Delete selected items?"
            : confirmationDialog?.kind === "delete-transaction"
              ? "Delete transaction?"
              : confirmationDialog?.kind === "delete-selected-transactions"
                ? "Delete selected transactions?"
                : confirmationDialog?.kind === "delete-opening-stock"
                  ? "Remove opening stock?"
                  : confirmationDialog?.kind === "delete-adjustment"
                    ? "Delete adjustment?"
                    : "Confirm action"
        }
        description={
          confirmationDialog?.kind === "delete-item"
            ? `${confirmationDialog.itemName} will be removed from the current stock list.`
            : confirmationDialog?.kind === "delete-selected-items"
              ? `${confirmationDialog.items.length} selected ${confirmationDialog.items.length === 1 ? "item" : "items"} will be moved to the recycle bin.`
            : confirmationDialog?.kind === "delete-transaction"
              ? `Voucher ${confirmationDialog.voucherNumber} will be removed from the transaction list.`
              : confirmationDialog?.kind === "delete-selected-transactions"
                ? `${confirmationDialog.rows.length} selected transaction${confirmationDialog.rows.length > 1 ? "s" : ""} will be removed.`
                : confirmationDialog?.kind === "delete-opening-stock"
                  ? `The opening stock entry for ${confirmationDialog.itemName} will be set to zero. The product itself will not be deleted.`
                  : confirmationDialog?.kind === "delete-adjustment"
                    ? "This stock adjustment will be permanently removed and the item's quantity will update accordingly."
                    : "Please confirm this action."
        }
        confirmLabel={
          confirmationDialog?.kind === "delete-item"
            ? "Delete Product"
            : confirmationDialog?.kind === "delete-selected-items"
              ? "Delete Selected"
            : confirmationDialog?.kind === "delete-selected-transactions"
              ? "Delete Selected"
              : confirmationDialog?.kind === "delete-opening-stock"
                ? "Remove Opening Stock"
                : confirmationDialog?.kind === "delete-adjustment"
                  ? "Delete Adjustment"
                  : "Delete Transaction"
        }
        tone="danger"
        onConfirm={handleConfirmDialogAction}
      />

      <Dialog open={Boolean(unitSelector)} onOpenChange={(open) => !open && setUnitSelector(null)}>
        <DialogContent
          className="z-[90] w-[min(94vw,560px)] max-w-none overflow-hidden rounded-2xl border border-[#d8e1ea] bg-white p-0 shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
          overlayClassName="z-[90]"
        >
          <div className="border-b border-[#d8e1ea] bg-[#edf6ff] px-6 py-4">
            <DialogTitle className="text-lg font-semibold text-[#17263c]">Select Unit</DialogTitle>
            <DialogDescription className="mt-1 text-xs text-[#6d7d93]">
              Choose the item unit and, if needed, set its conversion.
            </DialogDescription>
          </div>

          {unitSelector ? (
            <div className="space-y-5 px-6 py-5">
              <div className={cn("grid gap-4", itemEditorKind === "product" && "sm:grid-cols-2")}>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[#2774c7]">Base Unit</label>
                  {unitSelector.customBase ? (
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        className="h-11 rounded-xl border-[#9cc5ed]"
                        placeholder="e.g. Dozen"
                        value={unitSelector.baseUnit}
                        onChange={(event) => setUnitSelector((current) => current ? { ...current, baseUnit: event.target.value } : current)}
                      />
                      <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setUnitSelector((current) => current ? { ...current, customBase: false, baseUnit: unitOptions[0] ?? "" } : current)}>
                        List
                      </Button>
                    </div>
                  ) : (
                    <select
                      autoFocus
                      className="h-11 w-full rounded-xl border border-[#9cc5ed] bg-white px-3 text-sm font-medium text-[#17263c] outline-none focus:ring-2 focus:ring-[#2f80ed]/20"
                      value={unitSelector.baseUnit}
                      onChange={(event) => {
                        if (event.target.value === "__custom__") {
                          setUnitSelector((current) => current ? { ...current, customBase: true, baseUnit: "" } : current);
                          return;
                        }
                        setUnitSelector((current) => current ? { ...current, baseUnit: event.target.value } : current);
                      }}
                    >
                      {unitOptions.map((unit) => <option key={unit} value={unit}>{unit.toUpperCase()}</option>)}
                      <option value="__custom__">+ ADD CUSTOM UNIT</option>
                    </select>
                  )}
                </div>

                {itemEditorKind === "product" ? (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[#2774c7]">Alternative Unit</label>
                    {unitSelector.customAlternate ? (
                      <div className="flex gap-2">
                        <Input
                          className="h-11 rounded-xl border-[#9cc5ed]"
                          placeholder="e.g. Box"
                          value={unitSelector.alternateUnit}
                          onChange={(event) => setUnitSelector((current) => current ? { ...current, alternateUnit: event.target.value } : current)}
                        />
                        <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setUnitSelector((current) => current ? { ...current, customAlternate: false, alternateUnit: "" } : current)}>
                          List
                        </Button>
                      </div>
                    ) : (
                      <select
                        className="h-11 w-full rounded-xl border border-[#9cc5ed] bg-white px-3 text-sm font-medium text-[#17263c] outline-none focus:ring-2 focus:ring-[#2f80ed]/20"
                        value={unitSelector.alternateUnit}
                        onChange={(event) => {
                          if (event.target.value === "__custom__") {
                            setUnitSelector((current) => current ? { ...current, customAlternate: true, alternateUnit: "" } : current);
                            return;
                          }
                          setUnitSelector((current) => current ? { ...current, alternateUnit: event.target.value, conversion: event.target.value ? current.conversion : "" } : current);
                        }}
                      >
                        <option value="">No alternative unit</option>
                        {productUnitOptions.filter((unit) => unit.toLowerCase() !== unitSelector.baseUnit.toLowerCase()).map((unit) => <option key={unit} value={unit}>{unit.toUpperCase()}</option>)}
                        <option value="__custom__">+ ADD CUSTOM UNIT</option>
                      </select>
                    )}
                  </div>
                ) : null}
              </div>

              {itemEditorKind === "product" && unitSelector.alternateUnit ? (
                <div className="rounded-xl border border-[#d8e1ea] bg-[#f8fafc] p-4">
                  <div className="mb-3 text-sm font-semibold text-[#17263c]">Conversion Rate</div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-[#53647a]">
                    <span>1</span>
                    <span className="font-semibold uppercase text-[#17263c]">{unitSelector.baseUnit || "unit"}</span>
                    <span>=</span>
                    <Input
                      className="h-10 w-28 rounded-lg bg-white text-right"
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={unitSelector.conversion}
                      onChange={(event) => setUnitSelector((current) => current ? { ...current, conversion: event.target.value } : current)}
                    />
                    <span className="font-semibold uppercase text-[#17263c]">{unitSelector.alternateUnit}</span>
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-3 border-t border-[#e4eaf1] pt-4">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setUnitSelector(null)}>Cancel</Button>
                <Button
                  type="button"
                  className="rounded-xl bg-[#1677d2] px-7 text-white hover:bg-[#1267b8]"
                  onClick={() => {
                    const baseUnit = unitSelector.baseUnit.trim();
                    const alternateUnit = itemEditorKind === "product" ? unitSelector.alternateUnit.trim() : "";
                    const conversion = Number(unitSelector.conversion);
                    if (!baseUnit) {
                      toast.error("Please select or enter a base unit");
                      return;
                    }
                    if (alternateUnit && baseUnit.toLowerCase() === alternateUnit.toLowerCase()) {
                      toast.error("Base unit and alternative unit must be different");
                      return;
                    }
                    if (alternateUnit && (!Number.isFinite(conversion) || conversion <= 0)) {
                      toast.error("Enter a valid conversion rate");
                      return;
                    }
                    setItemForm((current) => ({
                      ...current,
                      unit: baseUnit,
                      alternateUnit,
                      alternateUnitConversion: alternateUnit ? String(conversion) : "",
                    }));
                    setCustomUnitMode(!unitOptions.some((unit) => unit.toLowerCase() === baseUnit.toLowerCase()));
                    setUnitSelector(null);
                  }}
                >
                  Save Unit
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        modal={!shouldRenderItemFormAsPage}
        open={formDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setFormDialogOpen(true);
            return;
          }

          if (shouldRenderItemFormAsPage) {
            return;
          }

          closeItemForm();
        }}
      >
      <DialogContent
        hideClose
        disableMotion={shouldRenderItemFormAsPage}
        overlayClassName={shouldRenderItemFormAsPage ? "hidden" : undefined}
        data-page-form-panel={shouldRenderItemFormAsPage ? "true" : undefined}
        data-sidebar-state={shouldRenderItemFormAsPage ? (sidebarCollapsed ? "collapsed" : "expanded") : undefined}
        className={cn(
          "max-w-none overflow-hidden border border-[#dfe5ee] p-0",
          shouldRenderItemFormAsPage
            ? cn(
                "fixed bottom-0 left-0 right-0 top-[60px] z-[70] h-auto w-auto translate-x-0 translate-y-0 rounded-none border-0 bg-white p-0 shadow-none lg:top-[92px]",
                sidebarCollapsed ? "xl:left-[68px]" : "xl:left-[252px]",
              )
            : "max-h-[88vh] w-[min(92vw,1360px)] rounded-[18px] shadow-[0_28px_70px_rgba(15,23,42,0.18)] xl:w-[min(94vw,1500px)]",
        )}
      >
          <div
            className={cn("flex h-full flex-col overflow-hidden bg-[#f8fafc]", shouldRenderItemFormAsPage ? "rounded-none border-0 shadow-none" : "")}
            onKeyDown={handleItemFormKeyDown}
          >
            <div className="flex items-center justify-between border-b border-[#d9e1ec] bg-white px-6 py-3">
              <div className="flex items-center gap-6">
                <div>
                  <DialogTitle className="text-[2rem] font-semibold text-[#17263c]">
                    {formMode === "edit"
                      ? itemEditorKind === "service"
                        ? "Edit Service"
                        : "Edit Product"
                      : itemEditorKind === "service"
                        ? "Add Service"
                        : "Add Product"}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-[#6d7d93]">
                    {formMode === "edit" && selectedItem
                      ? `${selectedItem.itemCode} · Edit mode`
                      : `Create ${itemEditorKind === "service" ? "service" : "product"} from the same workspace window.`}
                  </DialogDescription>
                </div>
                <div className="inline-flex rounded-full border border-[#b9c9df] bg-[#e8eef6] p-1 shadow-sm">
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-semibold transition",
                      itemEditorKind === "product"
                        ? "bg-[#1463b8] text-white shadow-[0_4px_12px_rgba(20,99,184,0.28)]"
                        : "text-[#334155] hover:bg-white/70 hover:text-[#0f172a]",
                    )}
                    onClick={() => {
                      setItemEditorKind("product");
                      if (serviceUnitOptions.includes(itemForm.unit)) {
                        updateFormField("unit", productUnitOptions[0] ?? "pcs");
                      }
                    }}
                  >
                    Product
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-semibold transition",
                      itemEditorKind === "service"
                        ? "bg-[#1463b8] text-white shadow-[0_4px_12px_rgba(20,99,184,0.28)]"
                        : "text-[#334155] hover:bg-white/70 hover:text-[#0f172a]",
                    )}
                    onClick={() => {
                      setItemEditorKind("service");
                      if (!serviceUnitOptions.includes(itemForm.unit)) {
                        updateFormField("unit", "hour");
                      }
                      if (itemEditorTab === "stock") {
                        setItemEditorTab("pricing");
                      }
                    }}
                  >
                    Service
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative" ref={itemSettingsMenuRef}>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-11 w-11 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1463b8]/30",
                      itemSettingsMenuOpen
                        ? "bg-[#e8f1ff] text-[#1463b8]"
                        : "text-[#65758b] hover:bg-[#f2f6fb] hover:text-[#17263c]",
                    )}
                    onClick={() => setItemSettingsMenuOpen((current) => !current)}
                    aria-label="Open form sections"
                    aria-haspopup="menu"
                    aria-expanded={itemSettingsMenuOpen}
                    title="Form sections"
                  >
                    <Settings2 className="h-5 w-5" />
                  </button>

                  {itemSettingsMenuOpen ? (
                    <div
                      role="menu"
                      aria-label="Form sections"
                      className="absolute right-0 top-[calc(100%+8px)] z-[100] w-[270px] overflow-hidden rounded-2xl border border-[#d9e3ef] bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.18)]"
                    >
                      <div className="px-3 pb-2 pt-1">
                        <div className="text-sm font-semibold text-[#17263c]">Form sections</div>
                        <div className="mt-0.5 text-xs text-[#718198]">Jump to the details you want to manage.</div>
                      </div>
                      {(
                        [
                          { id: "pricing", label: "Pricing", description: "Purchase, sale and wholesale prices", icon: Wallet },
                          { id: "stock", label: "Stock & inventory", description: "Opening stock and reorder level", icon: Boxes },
                          { id: "additional", label: "Additional details", description: "Aliases, part number and notes", icon: FileText },
                        ] as const
                      )
                        .filter((section) => itemEditorKind === "product" || section.id !== "stock")
                        .map((section) => {
                        const Icon = section.icon;
                        const isActive = itemEditorTab === section.id;

                        return (
                          <button
                            key={section.id}
                            type="button"
                            role="menuitem"
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1463b8]/25",
                              isActive ? "bg-[#edf5ff]" : "hover:bg-[#f5f8fc]",
                            )}
                            onClick={() => {
                              setItemEditorTab(section.id);
                              setItemSettingsMenuOpen(false);
                            }}
                          >
                            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", isActive ? "bg-[#1463b8] text-white" : "bg-[#edf1f6] text-[#53657c]")}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-[#17263c]">{section.label}</span>
                              <span className="mt-0.5 block text-xs leading-4 text-[#718198]">{section.description}</span>
                            </span>
                            <span className={cn("h-2 w-2 shrink-0 rounded-full", isActive ? "bg-[#1463b8]" : "bg-transparent")} aria-hidden="true" />
                          </button>
                        );
                        })}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#fecaca] bg-[#fff1f2] text-[#dc2626] shadow-sm transition hover:border-[#fca5a5] hover:bg-[#fee2e2] hover:text-[#991b1b]"
                  onClick={closeItemForm}
                  aria-label="Close item editor"
                  title="Close"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-white px-6 py-4">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
              <div className="min-w-0">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_230px_150px]">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#6d7d93]">{itemEditorKind === "service" ? "Service Name" : "Item Name"} *</label>
                  <Input
                    className="h-12 rounded-xl border-[#d8e1ea] bg-white"
                    placeholder={itemEditorKind === "service" ? "Service Name" : "Item Name"}
                    value={itemForm.itemName}
                    onChange={(event) => updateFormField("itemName", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#6d7d93]">Alias ({itemEditorKind === "service" ? "Service Name" : "Product Name"})</label>
                  <Input
                    className="h-12 rounded-xl border-[#d8e1ea] bg-white"
                    placeholder={`Alternative or well-known name for this ${itemEditorKind === "service" ? "service" : "item"}`}
                    value={itemForm.alias}
                    onChange={(event) => updateFormField("alias", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#6d7d93]">{itemEditorKind === "service" ? "Service Category" : "Product Category"} *</label>
                  <Input
                    className={cn("h-12 rounded-xl bg-white", itemForm.category.trim() ? "border-[#d8e1ea]" : "border-[#f0c9a4]")}
                    placeholder="Type or select a category"
                    value={categorySearchText}
                    onChange={(event) => {
                      setCategorySearchText(event.target.value);
                      setCategoryHighlightIndex(0);
                      setCategoryPanelSearching(true);
                    }}
                    onFocus={() => setCategoryPanelSearching(true)}
                    onKeyDown={handleCategoryInputKeyDown}
                    onBlur={() => {
                      setCategorySearchText(selectedCategoryDisplay);
                      setCategoryPanelSearching(false);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#6d7d93]">Unit</label>
                  <button
                    type="button"
                    className="flex h-12 w-full items-center justify-between rounded-xl border border-[#d6dfeb] bg-white px-4 text-left transition hover:border-[#b9c9de] hover:bg-[#f7faff] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/15"
                    onClick={() => {
                      const baseIsCustom = Boolean(itemForm.unit) && !unitOptions.some((unit) => unit.toLowerCase() === itemForm.unit.toLowerCase());
                      const alternateIsCustom = Boolean(itemForm.alternateUnit) && !productUnitOptions.some((unit) => unit.toLowerCase() === itemForm.alternateUnit.toLowerCase());
                      setUnitSelector({
                        baseUnit: itemForm.unit || unitOptions[0] || "pcs",
                        alternateUnit: itemEditorKind === "product" ? itemForm.alternateUnit : "",
                        conversion: itemEditorKind === "product" ? itemForm.alternateUnitConversion : "",
                        customBase: baseIsCustom,
                        customAlternate: alternateIsCustom,
                      });
                    }}
                  >
                    <span>
                      <span className="block text-sm font-semibold uppercase text-[#d96512]">{itemForm.unit || "Select unit"}</span>
                      {itemEditorKind === "product" && itemForm.alternateUnit && Number(itemForm.alternateUnitConversion) > 0 ? (
                        <span className="mt-0.5 block text-[11px] font-medium normal-case text-[#7b8798]">
                          1 {itemForm.unit} = {itemForm.alternateUnitConversion} {itemForm.alternateUnit}
                        </span>
                      ) : null}
                    </span>
                    <ChevronDown className="h-4 w-4 text-[#d96512]" />
                  </button>
                </div>
              </div>

              {itemEditorKind === "product" ? (
                <div className="mt-3 grid gap-4 sm:grid-cols-[230px_minmax(230px,1fr)] sm:max-w-[520px]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#6d7d93]">Alternative Unit</label>
                    <Input
                      className="h-11 rounded-xl border-[#d8e1ea] bg-white"
                      placeholder="e.g. kg"
                      value={itemForm.alternateUnit}
                      onChange={(event) => updateFormField("alternateUnit", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#6d7d93]">1 {itemForm.unit || "unit"} =</label>
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-11 rounded-xl border-[#d8e1ea] bg-white"
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={itemForm.alternateUnitConversion}
                        onChange={(event) => updateFormField("alternateUnitConversion", event.target.value)}
                      />
                      <span className="shrink-0 text-sm text-[#6d7d93]">{itemForm.alternateUnit || "alt unit"}</span>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 space-y-2">
                <label className="text-sm font-medium text-[#6d7d93]">{itemEditorKind === "service" ? "Service Description" : "Product Description"}</label>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-[#d8e1ea] bg-white px-3 py-2.5 text-sm text-[#17263c] placeholder:text-[#9aa6b8]"
                  placeholder={itemEditorKind === "service" ? "Describe this service" : "Describe this product"}
                  value={itemForm.description}
                  onChange={(event) => updateFormField("description", event.target.value)}
                />
              </div>

              <div className="mt-3 grid gap-4 xl:grid-cols-[clamp(180px,14.4vw,230px)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#6d7d93]">{itemEditorKind === "service" ? "Service Code" : "Item Code"}</label>
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-11 rounded-xl border-[#d8e1ea] bg-white"
                      placeholder={itemEditorKind === "service" ? "Service Code" : "Item Code"}
                      value={itemForm.itemCode}
                      onChange={(event) => updateFormField("itemCode", event.target.value)}
                    />
                    <Button
                      type="button"
                      className="h-11 shrink-0 rounded-xl border-primary bg-primary px-5 text-white shadow-sm hover:bg-[#cf670f]"
                      onClick={handleAssignItemCode}
                      title={`Auto-generate a code from the ${itemEditorKind === "service" ? "service" : "item"} name`}
                    >
                      <Wand2 className="h-4 w-4" />
                      Assign Code
                    </Button>
                  </div>
                </div>
                {itemEditorKind === "product" ? (
                  <div className="max-w-[360px] space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-[#6d7d93]">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-[#cbd5e1] accent-primary"
                        checked={itemForm.trackBatchExpiry}
                        onChange={(event) => {
                          const enabled = event.target.checked;
                          updateFormField("trackBatchExpiry", enabled);
                          if (enabled) setItemEditorTab("stock");
                        }}
                      />
                      Track Batch &amp; Expiry
                    </label>
                    <p className="text-xs leading-5 text-[#7b889b]">
                      Enable this for products that expire. Enter the batch number and expiry date whenever new stock is received.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 border-b border-[#dbe5f0]">
                <div className="flex items-center gap-6">
                  <button
                    type="button"
                    className={cn(
                      "border-b-2 px-4 py-2 text-sm font-semibold transition",
                      itemEditorTab === "pricing" ? "border-[#ff3355] text-[#ff3355]" : "border-transparent text-[#92a0b4]",
                    )}
                    onClick={() => setItemEditorTab("pricing")}
                  >
                    Pricing
                  </button>
                  {itemEditorKind === "product" ? (
                    <button
                      type="button"
                      className={cn(
                        "border-b-2 px-4 py-2 text-sm font-semibold transition",
                        itemEditorTab === "stock" ? "border-[#ff3355] text-[#ff3355]" : "border-transparent text-[#92a0b4]",
                      )}
                      onClick={() => setItemEditorTab("stock")}
                    >
                      Stock
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={cn(
                      "border-b-2 px-4 py-2 text-sm font-semibold transition",
                      itemEditorTab === "additional" ? "border-[#ff3355] text-[#ff3355]" : "border-transparent text-[#92a0b4]",
                    )}
                    onClick={() => setItemEditorTab("additional")}
                  >
                    Additional Details
                  </button>
                </div>
              </div>

              {itemEditorTab === "pricing" ? (
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-[#e3eaf4] bg-[#fbfdff] p-4">
                    <div className="text-[1.05rem] font-semibold text-[#17263c]">Opening Unit Cost (BDT)</div>
                    <div className="relative mt-3 max-w-[320px]">
                      <span className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-sm font-semibold text-[#52627a]">
                        BDT
                      </span>
                      <Input
                        money
                        className="h-11 rounded-xl border-[#d8e1ea] bg-white pl-14"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={formatMoneyInput(itemForm.openingRate)}
                        onChange={(event) => updateFormField("openingRate", event.target.value.replace(/,/g, ""))}
                        disabled={formMode === "edit" && selectedMovementRows.some((row) => row.source !== "opening")}
                      />
                    </div>
                    <div className="mt-2 text-xs text-[#6d7d93]">
                      {formMode === "edit" && selectedMovementRows.some((row) => row.source !== "opening")
                        ? "Locked after stock activity. Use a dated stock adjustment; posted purchases update the average cost automatically."
                        : "Used only to value opening stock. Posted purchases automatically update the moving weighted-average cost."}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#e3eaf4] bg-[#fbfdff] p-4">
                    <div className="text-[1.05rem] font-semibold text-[#17263c]">Sale Price</div>
                    <div className="mt-3 max-w-[320px]">
                      <Input
                        money
                        className="h-11 rounded-xl border-[#d8e1ea] bg-white"
                        inputMode="decimal"
                        placeholder="Sale Price"
                        value={formatMoneyInput(itemForm.salePrice)}
                        onChange={(event) => updateFormField("salePrice", event.target.value.replace(/,/g, ""))}
                      />
                    </div>
                    <div className="mt-3 space-y-2">
                      {wholesalePrices.map((value, index) => (
                        <Input
                          money
                          key={`wholesale-${index}`}
                          className="h-10 max-w-[320px] rounded-xl border-[#d8e1ea] bg-white"
                          inputMode="decimal"
                          placeholder={`Wholesale Price ${index + 1}`}
                          value={formatMoneyInput(value)}
                          onChange={(event) =>
                            setWholesalePrices((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? event.target.value.replace(/,/g, "") : entry,
                              ),
                            )
                          }
                        />
                      ))}
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-[#0f6bff] transition hover:text-[#0c57d0]"
                        onClick={() => setWholesalePrices((current) => [...current, ""])}
                      >
                        <PackagePlus className="h-4 w-4" />
                        Add Wholesale Price
                      </button>
                    </div>
                  </div>

                </div>
              ) : itemEditorTab === "stock" ? (
                <div className="mt-8 space-y-5">
                  {itemForm.trackBatchExpiry ? (
                    <div className="rounded-2xl border border-[#e3eaf4] bg-[#fbfdff] p-6">
                      <div className="text-[1.05rem] font-semibold text-[#17263c]">Opening Stock Batch</div>
                      <div className="mt-5 grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-[#6d7d93]">Batch / Lot Number (Optional)</label>
                          <Input value={itemForm.openingBatchNumber} onChange={(event) => updateFormField("openingBatchNumber", event.target.value)} placeholder="e.g. LOT-2026-001" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-[#6d7d93]">Manufacturing Date (Optional)</label>
                          <AppDateInput value={itemForm.openingManufacturedAt} onChange={(value) => updateFormField("openingManufacturedAt", value)} aria-label="Opening stock manufacturing date" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-[#6d7d93]">Expiry Date <span className="text-red-600" aria-hidden="true">*</span></label>
                          <AppDateInput value={itemForm.openingExpiresAt} onChange={(value) => updateFormField("openingExpiresAt", value)} aria-label="Opening stock expiry date" />
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-5 xl:grid-cols-2">
                  <div className="rounded-2xl border border-[#e3eaf4] bg-[#fbfdff] p-6">
                    <div className="text-[1.05rem] font-semibold text-[#17263c]">Opening Stock</div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-[#6d7d93]">Opening Qty</label>
                        <Input
                          className="h-12 rounded-xl border-[#d8e1ea] bg-white"
                          inputMode="decimal"
                          value={itemForm.openingQty}
                          onChange={(event) => updateFormField("openingQty", event.target.value)}
                          disabled={formMode === "edit" && selectedMovementRows.some((row) => row.source !== "opening")}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-[#6d7d93]">Reorder Level</label>
                        <Input
                          className="h-12 rounded-xl border-[#d8e1ea] bg-white"
                          inputMode="decimal"
                          value={itemForm.reorderLevel}
                          onChange={(event) => updateFormField("reorderLevel", event.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#e3eaf4] bg-[#fbfdff] p-6">
                    <div className="text-[1.05rem] font-semibold text-[#17263c]">Stock Setup</div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-[#6d7d93]">Status</label>
                        <select
                          className="h-12 w-full rounded-xl border border-[#d8e1ea] bg-white px-3 text-sm text-[#17263c]"
                          value={itemForm.status}
                          onChange={(event) => updateFormField("status", event.target.value as StockItemRecord["status"])}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-[#6d7d93]">Base Unit</label>
                        <Input className="h-12 rounded-xl border-[#d8e1ea] bg-white" value={itemForm.unit.toUpperCase()} readOnly />
                      </div>
                    </div>
                    <div className="mt-5 rounded-2xl border border-dashed border-[#d8e1ea] bg-white px-4 py-4 text-sm text-[#61708a]">
                      Opening value preview: {formatCurrency(Number(itemForm.openingQty || 0) * Number(itemForm.openingRate || 0))}
                    </div>
                  </div>
                  </div>
                </div>
              ) : (
                <div className="mt-8 space-y-5">
                  <div className="rounded-2xl border border-[#e3eaf4] bg-[#fbfdff] p-6">
                    <div className="text-[1.05rem] font-semibold text-[#17263c]">Additional Details</div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-[#6d7d93]">Language Alias</label>
                        <Input
                          className="h-12 rounded-xl border-[#d8e1ea] bg-white"
                          placeholder="Name in another language/script"
                          value={itemForm.languageAlias}
                          onChange={(event) => updateFormField("languageAlias", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-[#6d7d93]">Part Number</label>
                        <Input
                          className="h-12 rounded-xl border-[#d8e1ea] bg-white"
                          placeholder="Manufacturer / part reference number"
                          value={itemForm.partNumber}
                          onChange={(event) => updateFormField("partNumber", event.target.value)}
                        />
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <label className="text-sm font-medium text-[#6d7d93]">Notes</label>
                      <textarea
                        rows={3}
                        className="w-full rounded-xl border border-[#d8e1ea] bg-white px-3 py-2.5 text-sm text-[#17263c] placeholder:text-[#9aa6b8]"
                        placeholder="Any internal notes about this item"
                        value={itemForm.notes}
                        onChange={(event) => updateFormField("notes", event.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
              </div>
              {renderCategoryPickerPanel()}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#d9e1ec] bg-white px-6 py-3">
              {formMode === "create" ? (
                <Button
                  variant="outline"
                  className="rounded-md border-[#8ebcff] px-5 text-[#0f6cf6]"
                  onClick={() => handleSaveItem(true)}
                  disabled={!itemForm.category.trim()}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Save & New
                </Button>
              ) : null}
              <Button className="rounded-md px-10" onClick={() => handleSaveItem(false)} disabled={!itemForm.category.trim()}>
                <CheckCircle2 className="h-5 w-5" />
                {formMode === "edit" ? "Save Changes" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {filterPopover
        ? createPortal(
            <div
              ref={filterPopoverRef}
              className="fixed z-[70] w-72 rounded-2xl border border-border bg-white p-3 shadow-[0_18px_48px_rgba(15,23,42,0.16)]"
              style={{ left: filterPopover.left, top: filterPopover.top }}
            >
          <div className="mb-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              {tableColumns.find((column) => column.id === filterPopover.columnId)?.label}
            </div>
            <div className="mt-1 text-xs text-muted">Quick filter for this column without leaving the grid.</div>
          </div>

          {filterPopover.columnId === "type" ? (
            <div className="space-y-2">
              {(["purchase", "sales"] as VoucherType[]).map((type) => (
                <label key={type} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-canvas/80">
                  <input
                    type="checkbox"
                    checked={draftTableFilters.transactionTypes.includes(type)}
                    onChange={(event) =>
                      setDraftTableFilters((current) => ({
                        ...current,
                        transactionTypes: event.target.checked
                          ? [...current.transactionTypes, type]
                          : current.transactionTypes.filter((value) => value !== type),
                      }))
                    }
                  />
                  <span className="capitalize">{type}</span>
                </label>
              ))}
            </div>
          ) : null}

          {filterPopover.columnId === "voucherNumber" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted">Voucher number</label>
              <Input
                value={draftTableFilters.voucherQuery}
                onChange={(event) => setDraftTableFilters((current) => ({ ...current, voucherQuery: event.target.value }))}
              />
            </div>
          ) : null}

          {filterPopover.columnId === "reference" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted">Reference</label>
              <Input
                value={draftTableFilters.referenceQuery}
                onChange={(event) => setDraftTableFilters((current) => ({ ...current, referenceQuery: event.target.value }))}
              />
            </div>
          ) : null}

          {filterPopover.columnId === "partyName" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted">Party or name</label>
              <Input
                value={draftTableFilters.partyQuery}
                onChange={(event) => setDraftTableFilters((current) => ({ ...current, partyQuery: event.target.value }))}
              />
            </div>
          ) : null}

          {filterPopover.columnId === "voucherDate" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted">Date range</label>
              <select
                className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
                value={draftTableFilters.dateRange}
                onChange={(event) =>
                  setDraftTableFilters((current) => ({
                    ...current,
                    dateRange: event.target.value as InventoryTableFilterState["dateRange"],
                  }))
                }
              >
                <option value="all">All dates</option>
                <option value="this-month">This month</option>
                <option value="this-year">This year</option>
                <option value="last-90">Last 90 days</option>
              </select>
            </div>
          ) : null}

          {filterPopover.columnId === "quantity" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted">Quantity range</label>
              <select
                className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
                value={draftTableFilters.quantityRange}
                onChange={(event) =>
                  setDraftTableFilters((current) => ({
                    ...current,
                    quantityRange: event.target.value as InventoryTableFilterState["quantityRange"],
                  }))
                }
              >
                <option value="all">All quantities</option>
                <option value="0-10">0 - 10</option>
                <option value="10-100">10 - 100</option>
                <option value="100+">100+</option>
              </select>
            </div>
          ) : null}

          {filterPopover.columnId === "unitPrice" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted">Value range</label>
              <select
                className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
                value={draftTableFilters.valueRange}
                onChange={(event) =>
                  setDraftTableFilters((current) => ({
                    ...current,
                    valueRange: event.target.value as InventoryTableFilterState["valueRange"],
                  }))
                }
              >
                <option value="all">All values</option>
                <option value="0-1000">0 - 1,000</option>
                <option value="1000-10000">1,000 - 10,000</option>
                <option value="10000+">10,000+</option>
              </select>
            </div>
          ) : null}

          {filterPopover.columnId === "status" ? (
            <div className="space-y-2">
              {(["draft", "pending", "approved", "posted", "cancelled"] as VoucherStatus[]).map((status) => (
                <label key={status} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-canvas/80">
                  <input
                    type="checkbox"
                    checked={draftTableFilters.statuses.includes(status)}
                    onChange={(event) =>
                      setDraftTableFilters((current) => ({
                        ...current,
                        statuses: event.target.checked
                          ? [...current.statuses, status]
                          : current.statuses.filter((value) => value !== status),
                      }))
                    }
                  />
                  <span className="capitalize">{status}</span>
                </label>
              ))}
            </div>
          ) : null}

          {filterPopover.columnId === "warehouse" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted">Warehouse</label>
              <Input
                value={draftTableFilters.warehouseQuery}
                onChange={(event) => setDraftTableFilters((current) => ({ ...current, warehouseQuery: event.target.value }))}
              />
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={handleResetFilters}>
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setTableFilters(draftTableFilters);
                setFilterPopover(null);
              }}
            >
              Apply
            </Button>
          </div>
            </div>,
            document.body,
          )
        : null}

      <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div data-inventory-workspace-tabs className="overflow-x-auto border-b border-border bg-white">
          <div className="flex min-w-[720px] items-center">
            {workspaceTabs.map((tab) => {
              const active = tab.value === activeWorkspaceTab;
              const count =
                tab.value === "products"
                  ? localItems.filter((item) => item.kind === "product").length
                  : tab.value === "services"
                    ? localItems.filter((item) => item.kind === "service").length
                  : tab.value === "categories"
                    ? mode === "api"
                      ? localCategories.length
                      : new Set(localItems.map((item) => item.category)).size
                    : tab.value === "units"
                      ? mode === "api"
                        ? localUnits.length
                      : new Set(canonicalItems.map((item) => item.unit)).size
                      : tab.value === "warehouses"
                        ? warehouseCount
                      : 0;

              return (
                <button
                  key={tab.value}
                  type="button"
                  data-inventory-workspace-tab
                  className={cn(
                    "relative flex-1 border-b-2 px-5 py-4 text-center text-[13px] font-semibold uppercase tracking-[0.14em] transition-colors",
                    active ? "border-info text-foreground" : "border-transparent text-muted hover:text-foreground",
                  )}
                  onClick={() => setActiveWorkspaceTab(tab.value)}
                >
                  {tab.label}
                  <span className="ml-2 text-xs text-muted">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {activeWorkspaceTab === "warehouses" ? (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-[18px] border border-border bg-white p-4">
            <WarehouseSettingsPanel onWarehouseCountChange={setWarehouseCount} />
          </div>
        ) : (
        <div className="grid min-h-0 flex-1 gap-2 xl:grid-cols-[clamp(280px,18vw,310px)_minmax(0,1fr)]">
          <section className="flex max-h-full min-h-0 flex-col self-start overflow-hidden rounded-[14px] border border-border bg-white" onKeyDown={handleListKeyDown} tabIndex={0}>
            <div className="space-y-3 border-b border-border px-3 py-3">
              <div className="grid grid-cols-[minmax(0,1fr)_124px_40px] items-center gap-1.5">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                  <Input
                    ref={listSearchRef}
                    value={listQuery}
                    onChange={(event) => setListQuery(event.target.value)}
                    placeholder="Search item"
                    className="h-10 rounded-[12px] pl-10"
                  />
                </div>
                <Button
                  onClick={() => {
                    if (activeWorkspaceTab === "categories") {
                      openAddWorkspaceTaxonomy("category");
                      return;
                    }
                    if (activeWorkspaceTab === "units") {
                      openAddWorkspaceTaxonomy("unit");
                      return;
                    }
                    openCreatePage();
                  }}
                  className="h-10 w-[124px] rounded-[12px] px-2 text-xs"
                >
                  <PackagePlus className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">
                    {activeWorkspaceTab === "categories"
                      ? "Add Category"
                      : activeWorkspaceTab === "units"
                        ? "Add Unit"
                        : activeWorkspaceTab === "services"
                          ? "Add Service"
                          : "Add Product"}
                  </span>
                </Button>
                <div className="relative" ref={moreMenuRef}>
                  <Button variant="outline" size="icon" className="h-10 w-10 rounded-[12px]" onClick={() => setMoreMenuOpen((current) => !current)}>
                    <EllipsisVertical className="h-4 w-4" />
                  </Button>
                  {moreMenuOpen ? (
                    <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-60 rounded-xl border border-border bg-white p-2 shadow-lg">
                      {activeWorkspaceTab !== "services" ? (
                      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-canvas" onClick={() => importInputRef.current?.click()}>
                        <Download className="h-4 w-4 text-muted" />
                        Import items
                      </button>
                      ) : null}
                      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-canvas" onClick={handleDuplicateItem}>
                        <Boxes className="h-4 w-4 text-muted" />
                        {activeWorkspaceTab === "services" ? "Duplicate service" : "Duplicate item"}
                      </button>
                      <button
                        type="button"
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                          selectedItemHasVoucherHistory ? "cursor-not-allowed text-muted opacity-60" : "hover:bg-canvas"
                        }`}
                        onClick={selectedItemHasVoucherHistory ? undefined : handleDeleteItem}
                        disabled={selectedItemHasVoucherHistory}
                        title={selectedItemHasVoucherHistory ? "This item already has real voucher history" : undefined}
                      >
                        <Trash2 className="h-4 w-4 text-muted" />
                        {activeWorkspaceTab === "services" ? "Delete service" : "Delete item"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              {selectedInventoryItemIds.length > 0 && (activeWorkspaceTab === "products" || activeWorkspaceTab === "services") ? (
                <div className="flex items-center justify-between rounded-xl border border-[#bfd7fb] bg-[#edf5ff] px-3 py-2">
                  <span className="text-xs font-semibold text-[#245caa]">
                    {selectedInventoryItemIds.length} selected
                  </span>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-danger transition hover:bg-white"
                    onClick={handleDeleteSelectedItems}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete selected
                  </button>
                </div>
              ) : null}
            </div>

            <div className={cn(
              "grid border-b border-border bg-canvas py-3 pr-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted",
              activeWorkspaceTab === "products" || activeWorkspaceTab === "services"
                ? "grid-cols-[30px_minmax(0,1fr)_112px] pl-3"
                : "grid-cols-[minmax(0,1fr)_112px] pl-4",
            )}>
              {activeWorkspaceTab === "products" || activeWorkspaceTab === "services" ? (
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-[#2563eb]"
                  checked={allVisibleInventoryRowsSelected}
                  onChange={(event) => {
                    const visibleIds = selectableInventoryRows.map((row) => row.id);
                    setSelectedInventoryItemIds((current) =>
                      event.target.checked
                        ? Array.from(new Set([...current, ...visibleIds]))
                        : current.filter((id) => !visibleIds.includes(id)),
                    );
                  }}
                  aria-label="Select all visible items"
                />
              ) : null}
              <div>{activeWorkspaceTab === "products" ? "Item" : activeWorkspaceTab.slice(0, -1)}</div>
              <div
                className="text-right"
                title={activeWorkspaceTab === "products" ? "Available quantity and stock value based on average purchase cost" : undefined}
              >
                {activeWorkspaceTab === "categories" ? "Value" : activeWorkspaceTab === "services" ? "Rate" : activeWorkspaceTab === "products" ? "Stock Qty / Value" : "Stock"}
              </div>
            </div>

            <div ref={listScrollRef} className="transient-scrollbar min-h-0 max-h-full flex-1 overflow-y-auto">
              {inventoryViewRows.length ? (
                inventoryViewRows.map((row) => {
                  const active = row.id === selectedViewId;

                  return (
                    <div
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "grid w-full cursor-pointer items-center gap-2 border-b border-border py-0 pl-3 pr-1 text-left transition-colors",
                        activeWorkspaceTab === "products" || activeWorkspaceTab === "services"
                          ? "grid-cols-[22px_minmax(0,1fr)_112px]"
                          : "grid-cols-[minmax(0,1fr)_112px]",
                        activeWorkspaceTab === "categories" || activeWorkspaceTab === "units" ? "min-h-[44px]" : "min-h-[64px]",
                        active ? "bg-[#dff0ff]" : "bg-white hover:bg-canvas/80",
                      )}
                      onClick={() => setSelectedViewId(row.id)}
                      onContextMenu={
                        activeWorkspaceTab === "products" || activeWorkspaceTab === "services" || activeWorkspaceTab === "categories" || activeWorkspaceTab === "units"
                          ? (event) => handleOpenItemContextMenu(event, row.id)
                          : undefined
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedViewId(row.id);
                        }
                      }}
                    >
                      {activeWorkspaceTab === "products" || activeWorkspaceTab === "services" ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-[#2563eb]"
                          checked={selectedInventoryItemIds.includes(row.id)}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            setSelectedInventoryItemIds((current) =>
                              event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id),
                            );
                          }}
                          aria-label={`Select ${row.title}`}
                        />
                      ) : null}
                      <div className="min-w-0 py-2.5">
                        {activeWorkspaceTab === "categories" ? (
                          <div className={cn("grid grid-cols-[16px_minmax(0,1fr)] gap-2", row.isSubcategory && "pl-5")}>
                            <span className="mt-1 text-xs leading-5 text-muted">{row.isSubcategory ? "↳" : "•"}</span>
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="min-w-0 flex-1 whitespace-normal break-words text-[0.98rem] font-semibold leading-5 text-foreground [overflow-wrap:anywhere]">{row.title}</span>
                              {row.badge && (
                                <Badge className="shrink-0 border-0 bg-[#ebf2ff] px-2 py-0.5 text-[11px] font-semibold text-info">
                                  {row.badge}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ) : activeWorkspaceTab === "units" ? (
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="min-w-0 flex-1 whitespace-normal break-words text-[0.98rem] font-semibold leading-5 text-foreground [overflow-wrap:anywhere]">{row.title}</span>
                            {row.badge && (
                              <Badge className="shrink-0 border-0 bg-[#ebf2ff] px-2 py-0.5 text-[11px] font-semibold text-info">
                                {row.badge}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start gap-2">
                              <span className="whitespace-normal break-words text-[0.98rem] font-semibold leading-5 text-foreground [overflow-wrap:anywhere]">{row.title}</span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <Badge className="border-0 bg-[#ebf2ff] px-2 py-0.5 text-[11px] font-semibold text-info">
                                {row.badge}
                              </Badge>
                              <span className="text-[11px] text-muted">{row.statusText}</span>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="py-2.5 text-right">
                        {activeWorkspaceTab === "categories" || activeWorkspaceTab === "units" ? (
                          <div className="truncate tabular-nums text-sm font-semibold text-foreground">{row.quantity} item{row.quantity === 1 ? "" : "s"}</div>
                        ) : activeWorkspaceTab === "services" ? (
                          <>
                            <div className="truncate tabular-nums text-sm font-semibold text-foreground">{formatCurrency(row.amount)}</div>
                            <div className="mt-1 truncate text-[11px] text-muted">per {row.unit}</div>
                          </>
                        ) : (
                          <>
                            <div className={cn("truncate tabular-nums text-sm font-semibold", row.quantity > 0 ? "text-foreground" : "text-muted")}>
                              {`${formatNumber(row.quantity)} ${row.unit}`}
                            </div>
                            <div
                              className="mt-1 truncate text-[11px] text-muted"
                              title={`${formatCurrency(row.amount)} stock value: current quantity × average purchase cost`}
                            >
                              {formatCurrency(row.amount)}
                            </div>
                            <div className="mt-0.5 truncate text-[10px] text-muted">Stock value (avg. cost)</div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-4">
                  <EmptyState
                    title={
                      activeWorkspaceTab === "services"
                        ? "No services yet"
                        : activeWorkspaceTab === "categories"
                          ? "No categories yet"
                          : activeWorkspaceTab === "units"
                            ? "No units yet"
                            : "No matching items"
                    }
                    description={
                      activeWorkspaceTab === "services"
                        ? "Add your first service. Saved services will appear here with their real rate and billing unit."
                        : activeWorkspaceTab === "categories"
                          ? "Add a category first, then use it when creating products or services."
                          : activeWorkspaceTab === "units"
                            ? "Add a unit first, then use it when creating products or services."
                            : "Try another search term or switch the inventory tab."
                    }
                    actionLabel={
                      activeWorkspaceTab === "products"
                        ? "Create Item"
                        : activeWorkspaceTab === "categories"
                          ? "Add Category"
                          : activeWorkspaceTab === "units"
                            ? "Add Unit"
                            : undefined
                    }
                    onAction={
                      activeWorkspaceTab === "products"
                        ? () => openCreatePage()
                        : activeWorkspaceTab === "categories"
                          ? () => openAddWorkspaceTaxonomy("category")
                          : activeWorkspaceTab === "units"
                            ? () => openAddWorkspaceTaxonomy("unit")
                            : undefined
                    }
                  />
                </div>
              )}
            </div>
          </section>

          <section className="min-h-0 min-w-0 overflow-hidden rounded-[18px] border border-border bg-white">
              <div className="flex h-full min-h-0 min-w-0 flex-col">
                <div className="sticky top-0 z-20 overflow-hidden rounded-t-[18px] border-b border-border bg-white">
                  <div className="border-b border-[#dbe6f5] bg-[#f3f7ff] px-4 py-3">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h2 className="min-w-0 whitespace-normal break-words text-[1.65rem] font-semibold leading-tight text-foreground [overflow-wrap:anywhere]">
                            {selectedViewRow?.title ?? "Inventory Workspace"}
                          </h2>
                          {selectedItem ? (
                            <button
                              type="button"
                              className="rounded-full border border-border bg-white p-2 text-info shadow-sm transition hover:border-info/40"
                              onClick={openEditDialog}
                              aria-label="Edit item"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>

                      </div>

                      {selectedItem?.kind === "product" ? (
                      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                        <Button
                          className="h-11 rounded-[12px] border-transparent bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#cf670f]"
                          onClick={handleAdjustItem}
                        >
                          <PackagePlus className="h-5 w-5" />
                          Adjust Item
                        </Button>
                      </div>
                      ) : null}
                    </div>
                  </div>

                <div className="overflow-x-auto border-t border-border px-4">
                  <div className="flex min-w-max items-center gap-2 py-2">
                    {visiblePanelTabs.map((tab) => (
                      <button
                        key={tab.value}
                        type="button"
                        className={cn(
                          "rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
                          activePanelTab === tab.value ? "bg-[#ebf2ff] text-info" : "text-muted hover:bg-canvas hover:text-foreground",
                        )}
                        onClick={() => setActivePanelTab(tab.value)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {activePanelTab === "overview" ? (
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    <div className="grid gap-3 lg:grid-cols-3">
                      <div className="rounded-2xl border border-border bg-canvas/60 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{selectedItem?.kind === "service" ? "Service Rate" : "Available Stock"}</div>
                        <div className="mt-2 text-2xl font-semibold text-foreground">
                          {selectedItem?.kind === "service"
                            ? `${formatCurrency(selectedItem.rate)} / ${selectedItem.unit}`
                            : selectedItem
                              ? `${formatNumber(selectedItem.quantity)} ${selectedItem.unit}`
                              : selectedViewRow
                                ? formatNumber(selectedViewRow.quantity)
                                : "0"}
                        </div>
                        <div className="mt-1 text-sm text-muted">{selectedItem?.kind === "service" ? "Default charge used when adding this service to a sale." : "Visible live from the selected workspace slice."}</div>
                      </div>
                      <div className="rounded-2xl border border-border bg-canvas/60 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{selectedItem?.kind === "service" ? "Service Category" : "Current Value"}</div>
                        <div className="mt-2 text-2xl font-semibold text-foreground">
                          {selectedItem?.kind === "service"
                            ? selectedItem.category
                            : selectedItem
                              ? formatCurrency(selectedItem.stockValue)
                              : selectedViewRow
                                ? formatCurrency(selectedViewRow.amount)
                                : formatCurrency(0)}
                        </div>
                        <div className="mt-1 text-sm text-muted">
                          {selectedItem?.kind === "service"
                            ? "Used to organize service sales and reporting."
                            : `Average cost: ${formatCurrency(selectedItem?.rate ?? 0)}${selectedItem ? ` / ${selectedItem.unit}` : ""}`}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border bg-canvas/60 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{selectedItem?.kind === "service" ? "Transaction Count" : "Movement Count"}</div>
                        <div className="mt-2 text-2xl font-semibold text-foreground">{selectedMovementRows.length}</div>
                        <div className="mt-1 text-sm text-muted">{selectedItem?.kind === "service" ? "Sales entries containing this service." : "Purchase and sales entries refresh without a page reload."}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-foreground">{selectedItem?.kind === "service" ? "Recent service activity" : "Recent movements"}</div>
                          <div className="text-sm text-muted">{selectedItem?.kind === "service" ? "The latest sales containing this service." : "The latest stock-linked voucher lines for this selection."}</div>
                        </div>
                        <Button variant="outline" onClick={() => setActivePanelTab("transactions")}>
                          Open Table
                        </Button>
                      </div>

                      <div className="mt-4 space-y-3">
                        {selectedMovementRows.slice(0, 5).length ? (
                          selectedMovementRows.slice(0, 5).map((row) => (
                            <button
                              key={row.id}
                              type="button"
                              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3 text-left transition hover:bg-canvas/60"
                              onClick={() => handleOpenVoucher(row)}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge className="border-0 bg-[#fff1ed] px-2 py-0.5 text-[11px] font-semibold text-[#d94816]">
                                    {row.voucherType}
                                  </Badge>
                                  <span className="font-semibold text-foreground">{row.voucherNumber}</span>
                                </div>
                                <div className="mt-1 truncate text-sm text-muted">
                                  {row.partyName} • {formatDate(row.voucherDate)}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="tabular-nums font-semibold text-foreground">{formatCurrency(row.total)}</div>
                                <div className="mt-1 text-xs text-muted">
                                  {formatNumber(row.quantity)} {row.unit} @ {formatCurrency(row.unitPrice)}
                                </div>
                              </div>
                            </button>
                          ))
                        ) : (
                          <EmptyState
                            title="No stock movement yet"
                            description="Once purchase or sales vouchers include this item, the movement feed will appear here automatically."
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {activePanelTab === "reorder" ? (
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-border bg-white p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Reorder Status</div>
                        <div className="mt-2 text-xl font-semibold text-foreground">
                          {selectedItem
                            ? selectedItem.quantity <= selectedItem.reorderLevel
                              ? "Attention needed"
                              : "Healthy"
                            : selectedViewRow
                              ? selectedViewRow.statusText
                              : "No selection"}
                        </div>
                        <div className="mt-2 text-sm text-muted">
                          {selectedItem
                            ? `Threshold: ${formatNumber(selectedItem.reorderLevel)} ${selectedItem.unit}`
                            : "Open a product row to manage exact reorder level and stock trigger."}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border bg-white p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Quick Action</div>
                        <div className="mt-2 text-sm text-muted">
                          Keep reorder control inside the same compact workspace instead of bouncing into extra dashboard cards.
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button onClick={openEditDialog}>Edit Threshold</Button>
                          <Button variant="outline" onClick={() => router.push(buildPurchaseStartRoute(mode, workflowSettings.purchaseWorkflow))}>
                            {workflowSettings.purchaseWorkflow === "ORDER_BASED" ? "Create Purchase Order" : "Create Purchase"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {activePanelTab === "timeline" ? (
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    {selectedMovementRows.length ? (
                      selectedMovementRows.map((row) => (
                        <div key={row.id} className="flex items-start gap-3 rounded-2xl border border-border px-4 py-3">
                          <div className="mt-1 h-2.5 w-2.5 rounded-full bg-info" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="border-0 bg-[#fff1ed] px-2 py-0.5 text-[11px] font-semibold text-[#d94816]">
                                {row.voucherType}
                              </Badge>
                              <span className="font-semibold text-foreground">{row.voucherNumber}</span>
                              <span className="text-sm text-muted">{formatDate(row.voucherDate)}</span>
                            </div>
                            <div className="mt-1 text-sm text-muted">
                              {row.partyName} moved {formatNumber(row.quantity)} {row.unit} at {formatCurrency(row.unitPrice)}
                            </div>
                          </div>
                          <div className="tabular-nums font-semibold text-foreground">{formatCurrency(row.total)}</div>
                        </div>
                      ))
                    ) : (
                      <EmptyState
                        title="Timeline is empty"
                        description="Voucher movement will appear here in chronological order once this item starts moving."
                      />
                    )}
                  </div>
                ) : null}

                {activeWorkspaceTab === "categories" && activePanelTab === "stock" ? (
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-[1.1rem] font-semibold text-foreground">Products in this category</div>
                        <div className="text-sm text-muted">
                          {selectedCategoryStockItems.length} product{selectedCategoryStockItems.length === 1 ? "" : "s"}; products remain visible even when stock is zero.
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          className="h-10 rounded-[12px] bg-primary px-4 font-semibold text-white hover:bg-[#cf670f]"
                          onClick={() => openCreatePage("product", selectedWorkspaceCategory)}
                          disabled={!selectedWorkspaceCategory}
                        >
                          <PackagePlus className="h-4 w-4" />
                          Add Product
                        </Button>
                        <CollapsibleSearch
                          value={globalQuery}
                          onChange={setGlobalQuery}
                          label="Search category products"
                          placeholder="Search product, code, category"
                          expandedWidth="w-[320px] min-w-[220px] max-w-[46vw]"
                        />
                        <Button variant="outline" className="h-10 rounded-[12px] px-3" onClick={handleRefresh} disabled={isRefreshing}>
                          <RefreshCw className={cn("h-4 w-4", isRefreshing ? "animate-spin" : "")} />
                          Refresh
                        </Button>
                      </div>
                    </div>

                    <div className="transient-scrollbar min-h-0 min-w-0 flex-1 overflow-auto">
                      <table className="w-full min-w-[850px] border-separate border-spacing-0 text-sm">
                        <thead className="sticky top-0 z-10 bg-canvas text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                          <tr>
                            {['Item Code', 'Product', 'Category', 'Unit', 'Available Stock', 'Average Cost', 'Stock Value', 'Status'].map((label) => (
                              <th key={label} className={cn("border-b border-r border-[#d9e3ef] px-3 py-2 text-left", ['Available Stock', 'Average Cost', 'Stock Value'].includes(label) && "text-right")}>
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCategoryStockItems.length ? selectedCategoryStockItems.map((item) => {
                            const lowStock = item.reorderLevel > 0 && item.quantity <= item.reorderLevel;
                            return (
                              <tr key={item.id} className="border-b border-border/80 hover:bg-canvas/50">
                                <td className="border-b border-r border-[#e1e8f2] px-3 py-3 font-medium text-muted">{item.itemCode}</td>
                                <td className="border-b border-r border-[#e1e8f2] px-3 py-3 font-semibold text-foreground">{item.itemName}</td>
                                <td className="border-b border-r border-[#e1e8f2] px-3 py-3 text-muted">{item.category}</td>
                                <td className="border-b border-r border-[#e1e8f2] px-3 py-3 uppercase text-muted">{item.unit}</td>
                                <td className={cn("border-b border-r border-[#e1e8f2] px-3 py-3 text-right tabular-nums font-semibold", item.quantity > 0 ? "text-foreground" : "text-muted")}>
                                  {formatNumber(item.quantity)} {item.unit}
                                </td>
                                <td className="border-b border-r border-[#e1e8f2] px-3 py-3 text-right tabular-nums">{formatCurrency(item.rate)}</td>
                                <td className="border-b border-r border-[#e1e8f2] px-3 py-3 text-right tabular-nums font-semibold">{formatCurrency(item.stockValue)}</td>
                                <td className="border-b border-[#e1e8f2] px-3 py-3">
                                  <Badge className={cn("whitespace-nowrap border-0 px-2.5 py-1 text-[11px] font-semibold", item.status === "inactive" ? "bg-[#f1f5f9] text-[#64748b]" : lowStock ? "bg-[#fff1ed] text-[#d94816]" : "bg-[#ecfdf3] text-[#16814b]")}>
                                    {item.status === "inactive" ? "Inactive" : lowStock ? "Low stock" : item.quantity > 0 ? "In stock" : "No stock"}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          }) : (
                            <tr>
                              <td colSpan={8} className="p-5">
                                <EmptyState
                                  title={globalQuery.trim() ? "No matching products" : "No products in this category"}
                                  description={globalQuery.trim() ? "Try another product name, item code, or category." : "Products assigned to this category or any of its subcategories will appear here, including zero-stock products."}
                                />
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {(activePanelTab === "transactions" || activePanelTab === "stock") && !(activeWorkspaceTab === "categories" && activePanelTab === "stock") ? (
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-[1.1rem] font-semibold text-foreground">
                          {activePanelTab === "stock" ? "Stock movement" : "Transactions"}
                        </div>
                        <div className="text-sm text-muted">
                          {sortedTransactionRows.length
                            ? `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, sortedTransactionRows.length)} of ${sortedTransactionRows.length} entries`
                            : "No transactions"}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {activeWorkspaceTab === "categories" ? (
                          <Button
                            type="button"
                            className="h-10 rounded-[12px] bg-primary px-4 font-semibold text-white hover:bg-[#cf670f]"
                            onClick={() => openCreatePage("product", selectedWorkspaceCategory)}
                            disabled={!selectedWorkspaceCategory}
                          >
                            <PackagePlus className="h-4 w-4" />
                            Add Product
                          </Button>
                        ) : null}
                        <CollapsibleSearch
                          value={globalQuery}
                          onChange={setGlobalQuery}
                          label="Search transactions"
                          placeholder="Search voucher, reference, party"
                          expandedWidth="w-[320px] min-w-[220px] max-w-[46vw]"
                        />
                        <div className="relative" ref={columnMenuRef}>
                          <Button variant="outline" className="h-10 rounded-[12px] px-3" onClick={() => setColumnsOpen((current) => !current)}>
                            <SlidersHorizontal className="h-4 w-4" />
                            Columns
                          </Button>
                          {columnsOpen ? (
                            <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 rounded-xl border border-border bg-white p-2 shadow-lg">
                              {tableColumns
                                .filter((column) => column.hideable)
                                .map((column) => (
                                  <label key={column.id} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-canvas">
                                    <input
                                      type="checkbox"
                                      checked={columnVisibility[column.id]}
                                      onChange={(event) =>
                                        setColumnVisibility((current) => ({
                                          ...current,
                                          [column.id]: event.target.checked,
                                        }))
                                      }
                                    />
                                    {column.label}
                                  </label>
                                ))}
                            </div>
                          ) : null}
                        </div>
                        <Button
                          variant="outline"
                          className="h-10 rounded-[12px] px-3"
                          disabled={sortedTransactionRows.length === 0}
                          onClick={() =>
                            handleExportTransactions(
                              selectedTransactionIds.length
                                ? sortedTransactionRows.filter((row) => selectedTransactionIds.includes(row.id))
                                : sortedTransactionRows,
                            )
                          }
                        >
                          <Download className="h-4 w-4" />
                          Export
                        </Button>
                        <Button variant="outline" className="h-10 rounded-[12px] px-3" onClick={handleRefresh} disabled={isRefreshing}>
                          <RefreshCw className={cn("h-4 w-4", isRefreshing ? "animate-spin" : "")} />
                          Refresh
                        </Button>
                      </div>
                    </div>

                    {selectedTransactionIds.length ? (
                      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-canvas/60 px-4 py-2 text-[13px] text-muted">
                        <span>{selectedTransactionIds.length} row{selectedTransactionIds.length > 1 ? "s" : ""} selected</span>
                        <button type="button" className="font-semibold text-danger" onClick={handleDeleteSelectedTransactions}>
                          Delete Selected
                        </button>
                        <button type="button" className="font-semibold text-info" onClick={() => setSelectedTransactionIds([])}>
                          Clear Selection
                        </button>
                      </div>
                    ) : null}

                    <div ref={tableScrollRef} className="transient-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
                      <table data-item-transactions-table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                        <colgroup>
                          {renderedColumns.map((column) => (
                            <col key={column.id} data-item-table-column={column.id} style={{ width: `${columnWidths[column.id]}px` }} />
                          ))}
                        </colgroup>
                        <thead className="sticky top-0 z-10 bg-canvas text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                          <tr>
                            {renderedColumns.map((column) => {
                              const isSorted = sortState.columnId === column.id;

                              return (
                                <th
                                  key={column.id}
                                  data-item-table-column={column.id}
                                  className={cn(
                                    "relative overflow-hidden border-b border-r border-[#d9e3ef] px-3 py-2",
                                    column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left",
                                  )}
                                  style={{ width: `${columnWidths[column.id]}px`, minWidth: `${columnWidths[column.id]}px` }}
                                >
                                  {column.id === "select" ? (
                                    <input
                                      type="checkbox"
                                      checked={paginatedTransactionRows.length > 0 && paginatedTransactionRows.every((row) => selectedTransactionIds.includes(row.id))}
                                      onChange={(event) =>
                                        setSelectedTransactionIds((current) =>
                                          event.target.checked
                                            ? Array.from(new Set([...current, ...paginatedTransactionRows.map((row) => row.id)]))
                                            : current.filter((id) => !paginatedTransactionRows.some((row) => row.id === id)),
                                        )
                                      }
                                    />
                                  ) : column.id === "actions" ? (
                                    <button
                                      type="button"
                                      className={cn(
                                        "inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-white hover:text-foreground",
                                        transactionBulkActionMenu ? "bg-white text-foreground shadow-sm" : "",
                                      )}
                                      onClick={handleOpenTransactionBulkActionMenu}
                                      aria-label="Open table actions"
                                    >
                                      <EllipsisVertical className="h-4 w-4" />
                                    </button>
                                  ) : (
                                    <div className="flex items-center justify-between gap-2">
                                      <button
                                        type="button"
                                        className={cn(
                                          "flex min-w-0 items-center gap-1.5 truncate",
                                          column.sortable ? "hover:text-foreground" : "cursor-default",
                                        )}
                                        onClick={() => (column.sortable ? handleColumnSort(column.id as InventorySortColumn) : undefined)}
                                      >
                                        <span className="truncate">{column.label}</span>
                                        {column.sortable ? (
                                          <ArrowUpDown className={cn("h-3.5 w-3.5", isSorted ? "text-foreground" : "text-muted")} />
                                        ) : null}
                                      </button>
                                      {column.filterable ? (
                                        <button
                                          type="button"
                                          className={cn(
                                            "rounded-full border p-1 text-muted transition",
                                            filterPopover?.columnId === column.id
                                              ? "border-info/30 bg-white text-info"
                                              : "border-transparent hover:border-border hover:bg-white hover:text-foreground",
                                          )}
                                          onMouseDown={(event) => event.stopPropagation()}
                                          onClick={(event) => openFilterPopover(event, column.id as InventorySortColumn)}
                                          aria-label={`Filter ${column.label}`}
                                        >
                                          <Filter className="h-3.5 w-3.5" />
                                        </button>
                                      ) : null}
                                    </div>
                                  )}
                                  {column.id !== "actions" ? (
                                    <button
                                      type="button"
                                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        beginColumnResize(column.id, event.clientX);
                                      }}
                                      aria-label={`Resize ${column.label || "selection"} column`}
                                    />
                                  ) : null}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedTransactionRows.length ? (
                            paginatedTransactionRows.map((row) => (
                              <tr
                                key={row.id}
                                className="cursor-pointer border-b border-border/80 text-sm hover:bg-canvas/50"
                                onClick={(event) => {
                                  if ((event.target as HTMLElement).closest("button, input, a, select")) {
                                    return;
                                  }
                                  handlePrimaryRowOpen(row);
                                }}
                              >
                                {renderedColumns.map((column) => (
                                  <td
                                    key={`${row.id}-${column.id}`}
                                    data-item-table-column={column.id}
                                    className={cn(
                                      "overflow-hidden border-b border-r border-[#e1e8f2] px-3 py-3 align-middle",
                                      column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left",
                                    )}
                                    style={{ width: `${columnWidths[column.id]}px`, minWidth: `${columnWidths[column.id]}px` }}
                                  >
                                    {renderCell(row, column.id)}
                                  </td>
                                ))}
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={renderedColumns.length} className="p-5">
                                <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-10 text-center">
                                  <div className="relative mb-5 h-28 w-44" aria-hidden="true">
                                    <div className="absolute inset-x-6 bottom-1 h-5 rounded-[50%] bg-[#dbe8f8]/70 blur-[1px]" />
                                    <div className="absolute left-1/2 top-1 flex h-20 w-20 -translate-x-1/2 items-center justify-center rounded-[24px] border border-[#cbdcf3] bg-white text-[#2563eb] shadow-[0_14px_35px_rgba(37,99,235,0.14)]">
                                      <Boxes className="h-10 w-10" strokeWidth={1.55} />
                                    </div>
                                    <div className="absolute bottom-1 left-3 flex h-9 w-9 items-center justify-center rounded-xl border border-[#ffd9b0] bg-[#fff7ed] text-[#ea7600] shadow-sm">
                                      <ArrowUpDown className="h-4.5 w-4.5" strokeWidth={1.8} />
                                    </div>
                                    <div className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-xl border border-[#cfe0f6] bg-white text-[#5b7da8] shadow-sm">
                                      <FileText className="h-4.5 w-4.5" strokeWidth={1.8} />
                                    </div>
                                    <span className="absolute left-0 top-8 h-2 w-2 rounded-full bg-[#f5a34b]/70" />
                                    <span className="absolute right-1 top-5 h-2.5 w-2.5 rounded-full bg-[#80aef1]/70" />
                                  </div>
                                  <p className="text-[16px] font-semibold text-[#17233d]">No transactions</p>
                                  <p className="mt-1.5 max-w-md text-[13px] leading-5 text-[#71809a]">
                                    {selectedViewRow
                                      ? "Purchases, sales, and stock adjustments for this item will appear here automatically."
                                      : "Select an inventory item to review its complete stock movement history."}
                                  </p>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {sortedTransactionRows.length ? <TablePagination
                      page={page}
                      pageSize={pageSize}
                      totalItems={sortedTransactionRows.length}
                      pageSizeOptions={[10, 25, 50, 100]}
                      onPageChange={setPage}
                      onPageSizeChange={setPageSize}
                      summary={selectedTransactionIds.length ? `${selectedTransactionIds.length} row${selectedTransactionIds.length > 1 ? "s" : ""} selected` : "No rows selected"}
                    /> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
        )}
      </div>
    </>
  );
}
