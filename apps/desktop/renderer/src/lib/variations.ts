import type { StatusBadgeTone } from "@bizovix/ui";
import type { VariationStatus, VariationType } from "@bizovix/types";

export const VARIATION_STATUS_META: Record<VariationStatus, { label: string; tone: StatusBadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Submitted", tone: "purple" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

export const VARIATION_TYPE_META: Record<VariationType, string> = {
  ADDITION: "Addition",
  OMISSION: "Omission",
  RATE_CHANGE: "Rate Change",
  QUANTITY_CHANGE: "Quantity Change",
  NEW_ITEM: "New Item",
  OTHER: "Other",
};

export const VARIATION_TYPE_OPTIONS: { label: string; value: VariationType }[] = (
  Object.keys(VARIATION_TYPE_META) as VariationType[]
).map((value) => ({ value, label: VARIATION_TYPE_META[value] }));
