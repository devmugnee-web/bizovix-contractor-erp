import type { StatusBadgeTone } from "@bizovix/ui";
import type { ItemStatus, ItemType } from "@bizovix/types";

export const ITEM_TYPE_META: Record<ItemType, string> = {
  MATERIAL: "Material",
  SERVICE: "Service",
  EQUIPMENT: "Equipment",
  CONSUMABLE: "Consumable",
  OTHER: "Other",
};

export const ITEM_TYPE_OPTIONS: { label: string; value: ItemType }[] = (Object.keys(ITEM_TYPE_META) as ItemType[]).map((value) => ({
  value,
  label: ITEM_TYPE_META[value],
}));

export const ITEM_STATUS_META: Record<ItemStatus, { label: string; tone: StatusBadgeTone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
};

export const ITEM_STATUS_OPTIONS: { label: string; value: ItemStatus }[] = (Object.keys(ITEM_STATUS_META) as ItemStatus[]).map((value) => ({
  value,
  label: ITEM_STATUS_META[value].label,
}));
