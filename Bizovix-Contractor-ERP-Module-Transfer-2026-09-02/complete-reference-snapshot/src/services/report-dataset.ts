import { apiRequest } from "@/services/api-client";
import { readDataset } from "@/services/browser-dataset";
import { listDayBook } from "@/services/voucher.service";
import { listStockLedger } from "@/services/warehouse.service";
import type { AppDataset, DataMode, PartyRecord, StockItemRecord, VoucherRecord } from "@/types/domain";

type ApiPartyRow = Record<string, unknown>;

type ApiInventoryRow = {
  id?: unknown;
  itemCode?: unknown;
  itemName?: unknown;
  category?: unknown;
  unit?: unknown;
  openingQty?: unknown;
  openingRate?: unknown;
  quantity?: unknown;
  rate?: unknown;
  reorderLevel?: unknown;
  status?: unknown;
  createdAt?: unknown;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePartyRecord(party: ApiPartyRow, workspaceId: string): PartyRecord {
  const type = String(party.type ?? "customer").toLowerCase();
  const status = String(party.status ?? "active").toLowerCase();

  return {
    id: String(party.id ?? ""),
    workspaceId: String(party.workspaceId ?? workspaceId),
    ledgerAccountId: party.ledgerAccountId == null ? null : String(party.ledgerAccountId),
    name: String(party.name ?? "Unnamed Party"),
    type: type === "supplier" ? "supplier" : "customer",
    contact: String(party.contact ?? ""),
    address: String(party.address ?? ""),
    creditLimit: toNumber(party.creditLimit),
    openingBalance: toNumber(party.openingBalance),
    openingBalanceDate: party.openingBalanceDate == null ? null : String(party.openingBalanceDate).slice(0, 10),
    billMaturityDays: Number.isInteger(Number(party.billMaturityDays)) ? Number(party.billMaturityDays) : 30,
    status: status === "inactive" ? "inactive" : "active",
  };
}

function normalizeStockItem(item: ApiInventoryRow, workspaceId: string): StockItemRecord {
  const itemName = String(item.itemName ?? "").trim();

  return {
    id: String(item.id ?? itemName),
    workspaceId,
    itemCode: String(item.itemCode ?? itemName),
    itemName,
    category: String(item.category ?? "General Items"),
    unit: String(item.unit ?? "pcs"),
    openingQty: toNumber(item.openingQty),
    openingRate: toNumber(item.openingRate, toNumber(item.rate)),
    reorderLevel: toNumber(item.reorderLevel),
    status: String(item.status ?? "active").toLowerCase() === "inactive" ? "inactive" : "active",
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
  };
}

function buildEmptySubscription(): AppDataset["subscription"] {
  return {
    currentPlan: {
      code: "local",
      name: "Local Workspace",
      description: "Runs entirely on this computer.",
      priceLabel: "-",
      billingLabel: "-",
    },
    status: "paid-active",
    renewalDate: "",
    daysRemaining: 0,
    usages: [],
    plans: [],
    upgradeRequest: null,
  };
}

/**
 * Reports read everything from an AppDataset. In mock/demo that dataset is the
 * seeded browser dataset; in API mode it has to be assembled from the live
 * workspace so every report reflects real vouchers, parties, and stock.
 */
export async function loadWorkspaceReportDataset(mode: DataMode, workspaceId: string): Promise<AppDataset> {
  if (mode !== "api") {
    return readDataset(mode);
  }

  const [vouchers, partyRows, inventoryRows, stockLedgerRows] = await Promise.all([
    listDayBook("api", { workspaceId }) as Promise<VoucherRecord[]>,
    apiRequest<ApiPartyRow[]>(`/parties?workspaceId=${encodeURIComponent(workspaceId)}`),
    apiRequest<ApiInventoryRow[]>(`/inventory/items?workspaceId=${encodeURIComponent(workspaceId)}`),
    listStockLedger(workspaceId),
  ]);

  return {
    workspaces: [],
    users: [],
    parties: partyRows.map((party) => normalizePartyRecord(party, workspaceId)),
    stockItems: inventoryRows.map((item) => normalizeStockItem(item, workspaceId)),
    inventoryMovements: stockLedgerRows.map((movement) => ({
      id: movement.id,
      workspaceId: movement.workspaceId,
      warehouseId: movement.warehouseId,
      inventoryItemId: movement.inventoryItemId,
      itemName: movement.inventoryItem.itemName,
      itemCode: movement.inventoryItem.itemCode,
      unit: movement.inventoryItem.unit,
      transactionType: movement.transactionType,
      transactionId: movement.transactionId,
      transactionLineId: movement.transactionLineId,
      referenceNo: movement.referenceNo ?? "-",
      movementType: movement.movementType,
      quantity: toNumber(movement.quantity),
      unitCost: toNumber(movement.unitCost),
      movementValue: toNumber(movement.movementValue),
      balanceQuantity: toNumber(movement.balanceQuantity),
      balanceValue: toNumber(movement.balanceValue),
      averageCost: toNumber(movement.averageCost),
      transactionDate: String(movement.transactionDate).slice(0, 10),
      createdAt: String(movement.createdAt),
    })),
    vouchers,
    dashboardMetrics: [],
    trialBalance: [],
    summary: [],
    approvals: [],
    quickShortcuts: [],
    subscription: buildEmptySubscription(),
    workspaceSubscriptions: {},
  };
}
