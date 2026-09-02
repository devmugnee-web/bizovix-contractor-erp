import { apiRequest } from "@/services/api-client";

export type WarehouseStockRow = {
  warehouseId: string;
  warehouseName?: string;
  warehouseCode?: string;
  inventoryItemId: string;
  itemCode?: string;
  itemName?: string;
  category?: string;
  unit?: string;
  quantity: number;
  averageCost: number;
  stockValue: number;
};

export function listWarehouseStock(workspaceId: string, toDate?: string) {
  const params = new URLSearchParams({ workspaceId });
  if (toDate) params.set("to", toDate);
  return apiRequest<WarehouseStockRow[]>(`/inventory/warehouse-stock?${params.toString()}`);
}
