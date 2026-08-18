import type { StatusBadgeTone } from "@bizovix/ui";
import type {
  ComparativeStatementStatus,
  GrnInspectionStatus,
  PrPriority,
  PrStatus,
  PurchaseOrderStatus,
  QuotationStatus,
  RfqStatus,
  TechnicalComplianceStatus,
} from "@bizovix/types";

export const PR_STATUS_META: Record<PrStatus, { label: string; tone: StatusBadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Submitted", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  CONVERTED: { label: "Converted to RFQ", tone: "info" },
};

export const PR_STATUS_OPTIONS: { label: string; value: PrStatus }[] = (Object.keys(PR_STATUS_META) as PrStatus[]).map((value) => ({
  value,
  label: PR_STATUS_META[value].label,
}));

export const PR_PRIORITY_META: Record<PrPriority, { label: string; tone: StatusBadgeTone }> = {
  LOW: { label: "Low", tone: "neutral" },
  MEDIUM: { label: "Medium", tone: "info" },
  HIGH: { label: "High", tone: "warning" },
  URGENT: { label: "Urgent", tone: "danger" },
};

export const PR_PRIORITY_OPTIONS: { label: string; value: PrPriority }[] = (Object.keys(PR_PRIORITY_META) as PrPriority[]).map((value) => ({
  value,
  label: PR_PRIORITY_META[value].label,
}));

export const RFQ_STATUS_META: Record<RfqStatus, { label: string; tone: StatusBadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  ISSUED: { label: "Issued", tone: "info" },
  CLOSED: { label: "Closed", tone: "warning" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  AWARDED: { label: "Awarded", tone: "success" },
};

export const RFQ_STATUS_OPTIONS: { label: string; value: RfqStatus }[] = (Object.keys(RFQ_STATUS_META) as RfqStatus[]).map((value) => ({
  value,
  label: RFQ_STATUS_META[value].label,
}));

export const QUOTATION_STATUS_META: Record<QuotationStatus, { label: string; tone: StatusBadgeTone }> = {
  RECEIVED: { label: "Active", tone: "success" },
  SUPERSEDED: { label: "Superseded", tone: "neutral" },
  WITHDRAWN: { label: "Withdrawn", tone: "danger" },
};

export const CS_STATUS_META: Record<ComparativeStatementStatus, { label: string; tone: StatusBadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  EVALUATED: { label: "Evaluated", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const TECHNICAL_STATUS_META: Record<TechnicalComplianceStatus, { label: string; tone: StatusBadgeTone }> = {
  COMPLIANT: { label: "Compliant", tone: "success" },
  PARTIALLY_COMPLIANT: { label: "Partially Compliant", tone: "warning" },
  NON_COMPLIANT: { label: "Non-Compliant", tone: "danger" },
};

export const TECHNICAL_STATUS_OPTIONS: { label: string; value: TechnicalComplianceStatus }[] = (
  Object.keys(TECHNICAL_STATUS_META) as TechnicalComplianceStatus[]
).map((value) => ({ value, label: TECHNICAL_STATUS_META[value].label }));

export const PO_STATUS_META: Record<PurchaseOrderStatus, { label: string; tone: StatusBadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  APPROVED: { label: "Approved", tone: "info" },
  ISSUED: { label: "Issued", tone: "purple" },
  PARTIALLY_RECEIVED: { label: "Partially Received", tone: "warning" },
  RECEIVED: { label: "Received", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export const PO_STATUS_OPTIONS: { label: string; value: PurchaseOrderStatus }[] = (Object.keys(PO_STATUS_META) as PurchaseOrderStatus[]).map((value) => ({
  value,
  label: PO_STATUS_META[value].label,
}));

export const GRN_INSPECTION_META: Record<GrnInspectionStatus, { label: string; tone: StatusBadgeTone }> = {
  PENDING: { label: "Pending Inspection", tone: "warning" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  PARTIAL: { label: "Partially Accepted", tone: "warning" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

export const GRN_INSPECTION_OPTIONS: { label: string; value: GrnInspectionStatus }[] = (
  Object.keys(GRN_INSPECTION_META) as GrnInspectionStatus[]
).map((value) => ({ value, label: GRN_INSPECTION_META[value].label }));

/** Suppliers eligible to be invited to an RFQ or receive a PO — mirrors the backend's
 * ELIGIBLE_SUPPLIER_ROLES so the pickers never offer a party the API would reject. */
export const SUPPLIER_ROLES_FILTER = "VENDOR,SUPPLIER,SERVICE_PROVIDER,OTHER";

/** Quantities come off the API as fixed-precision strings; trailing zeros just add noise
 * in dense procurement tables. */
export function formatQty(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return numeric.toLocaleString("en-US", { maximumFractionDigits: 3 });
}
