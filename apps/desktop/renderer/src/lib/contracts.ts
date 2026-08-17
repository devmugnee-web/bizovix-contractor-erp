import type { StatusBadgeTone } from "@bizovix/ui";
import type { ContractStatus, ContractType } from "@bizovix/types";

export const CONTRACT_STATUS_META: Record<ContractStatus, { label: string; tone: StatusBadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "success" },
  ON_HOLD: { label: "On Hold", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export const CONTRACT_STATUS_OPTIONS: { label: string; value: ContractStatus }[] = (
  Object.keys(CONTRACT_STATUS_META) as ContractStatus[]
).map((value) => ({ value, label: CONTRACT_STATUS_META[value].label }));

export const CONTRACT_TYPE_META: Record<ContractType, string> = {
  WORK_ORDER: "Work Order",
  CONTRACT_AGREEMENT: "Contract Agreement",
  PURCHASE_ORDER: "Purchase Order",
  SERVICE_CONTRACT: "Service Contract",
  OTHER: "Other",
};

export const CONTRACT_TYPE_OPTIONS: { label: string; value: ContractType }[] = (
  Object.keys(CONTRACT_TYPE_META) as ContractType[]
).map((value) => ({ value, label: CONTRACT_TYPE_META[value] }));
