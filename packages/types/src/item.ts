import type { ItemStatus, ItemType } from "./enums";

export interface ItemRecord {
  id: string;
  itemCode: string;
  itemName: string;
  description: string | null;
  itemType: ItemType;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  uomId: string | null;
  uom: { id: string; code: string; name: string; symbol: string | null } | null;
  defaultPurchaseRate: string | null;
  preferredVendorId: string | null;
  preferredVendor: { id: string; code: string; name: string } | null;
  specification: string | null;
  brandModel: string | null;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ItemStats {
  total: number;
  materials: number;
  services: number;
  inactive: number;
}

export interface SaveItemInput {
  itemCode?: string;
  itemName: string;
  description?: string;
  itemType?: ItemType;
  categoryId?: string;
  uomId?: string;
  defaultPurchaseRate?: number;
  preferredVendorId?: string;
  specification?: string;
  brandModel?: string;
  status?: ItemStatus;
}

export interface ItemQuery {
  page?: number;
  limit?: number;
  search?: string;
  itemType?: ItemType;
  categoryId?: string;
  uomId?: string;
  status?: ItemStatus;
}
