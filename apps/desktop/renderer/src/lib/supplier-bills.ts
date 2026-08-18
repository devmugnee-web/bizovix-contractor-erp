import type { StatusBadgeTone } from "@bizovix/ui";
import type { BillMatchStatus, SupplierBillStatus, SupplierPaymentStatus } from "@bizovix/types";

export const SUPPLIER_BILL_STATUS_META: Record<SupplierBillStatus, { label: string; tone: StatusBadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  APPROVAL_PENDING: { label: "Pending Approval", tone: "warning" },
  APPROVED: { label: "Approved", tone: "info" },
  PARTIALLY_PAID: { label: "Partially Paid", tone: "purple" },
  PAID: { label: "Paid", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const SUPPLIER_BILL_STATUS_OPTIONS: { label: string; value: SupplierBillStatus }[] = (
  Object.keys(SUPPLIER_BILL_STATUS_META) as SupplierBillStatus[]
).map((value) => ({ value, label: SUPPLIER_BILL_STATUS_META[value].label }));

/** MISSING_RECEIPT and BLOCKED are the only hard stops — the variance statuses are advisory and
 * still allow approval, which is why they are toned warning rather than danger. */
export const BILL_MATCH_STATUS_META: Record<BillMatchStatus, { label: string; tone: StatusBadgeTone; blocking: boolean }> = {
  MATCHED: { label: "Matched", tone: "success", blocking: false },
  QUANTITY_VARIANCE: { label: "Qty Variance", tone: "warning", blocking: false },
  RATE_VARIANCE: { label: "Rate Variance", tone: "warning", blocking: false },
  AMOUNT_VARIANCE: { label: "Amount Variance", tone: "warning", blocking: false },
  MISSING_RECEIPT: { label: "No Accepted Receipt", tone: "danger", blocking: true },
  BLOCKED: { label: "Blocked", tone: "danger", blocking: true },
};

export const BILL_MATCH_STATUS_OPTIONS: { label: string; value: BillMatchStatus }[] = (
  Object.keys(BILL_MATCH_STATUS_META) as BillMatchStatus[]
).map((value) => ({ value, label: BILL_MATCH_STATUS_META[value].label }));

export const SUPPLIER_PAYMENT_STATUS_META: Record<SupplierPaymentStatus, { label: string; tone: StatusBadgeTone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const PAYMENT_METHOD_OPTIONS = [
  { label: "Bank Transfer", value: "BANK_TRANSFER" },
  { label: "Cheque", value: "CHEQUE" },
  { label: "Cash", value: "CASH" },
  { label: "Mobile Banking", value: "MOBILE_BANKING" },
];

export const AP_AGING_BUCKET_LABELS: Record<string, string> = {
  CURRENT: "Current",
  "1-30": "1-30 Days",
  "31-60": "31-60 Days",
  "61-90": "61-90 Days",
  "90+": "90+ Days",
};
