import type { StatusBadgeTone } from "@bizovix/ui";
import type { BillStatus, BillType } from "@bizovix/types";
import { BILL_ADJUSTMENT_TYPES } from "@bizovix/types";

export const BILL_STATUS_META: Record<BillStatus, { label: string; tone: StatusBadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Submitted", tone: "purple" },
  UNDER_REVIEW: { label: "Under Review", tone: "warning" },
  CERTIFIED: { label: "Certified", tone: "info" },
  PARTIALLY_RECEIVED: { label: "Partially Received", tone: "warning" },
  RECEIVED: { label: "Received", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

export const BILL_STATUS_OPTIONS: { label: string; value: BillStatus }[] = (
  Object.keys(BILL_STATUS_META) as BillStatus[]
).map((value) => ({ value, label: BILL_STATUS_META[value].label }));

export const BILL_TYPE_META: Record<BillType, string> = {
  ADVANCE: "Advance Bill",
  RUNNING: "Running Bill",
  INTERIM: "Interim Payment Certificate",
  FINAL: "Final Bill",
};

export const BILL_TYPE_OPTIONS: { label: string; value: BillType }[] = (
  Object.keys(BILL_TYPE_META) as BillType[]
).map((value) => ({ value, label: BILL_TYPE_META[value] }));

export const ADJUSTMENT_TYPE_OPTIONS = BILL_ADJUSTMENT_TYPES.map((t) => ({ label: t, value: t }));
