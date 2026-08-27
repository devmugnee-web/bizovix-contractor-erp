import type { ReminderPriority, ReminderStatus } from "@bizovix/types";
export const REMINDER_TYPES = [
  "Tender Security",
  "PG/BG",
  "SD",
  "Bill Maturity",
];
export const SOURCE_MODULES = [
  "MANUAL",
  "TENDER",
  "DOCUMENT_PURCHASE",
  "TENDER_SECURITY",
  "CREDIT_COMMITMENT",
  "PG_BG",
  "PROJECT",
  "RECEIVABLE",
  "PAYABLE",
  "CHEQUE",
  "LOAN",
  "DOCUMENT",
  "CONTRACT",
  "PROJECT_BILL",
];
export const PRIORITIES: ReminderPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const STATUSES: ReminderStatus[] = [
  "UPCOMING",
  "DUE_TODAY",
  "OVERDUE",
  "SNOOZED",
  "COMPLETED",
  "CANCELLED",
];
export const label = (v: string) => v.replaceAll("_", " ").replace(/\b\w/g, (x) => x.toUpperCase());
const SOURCE_MODULE_LABELS: Record<string, string> = {
  MANUAL: "Manual Reminder",
  TENDER: "Tender",
  DOCUMENT_PURCHASE: "Document Purchase",
  TENDER_SECURITY: "Tender Security",
  CREDIT_COMMITMENT: "Credit Commitment",
  PG_BG: "PG/BG",
  PROJECT: "Project",
  RECEIVABLE: "Receivable",
  PAYABLE: "Payable",
  CHEQUE: "Cheque",
  LOAN: "Loan",
  DOCUMENT: "Document",
  CONTRACT: "Contract",
  PROJECT_BILL: "Running Bill",
};
export const sourceModuleLabel = (v: string) => SOURCE_MODULE_LABELS[v] ?? label(v);
export function dateDelta(value: string) {
  const target = new Date(value),
    today = new Date();
  target.setHours(12, 0, 0, 0);
  today.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 864e5);
}
export function daysLabel(value: string) {
  const n = dateDelta(value);
  return n === 0
    ? "Due Today"
    : n > 0
      ? `${n} Day${n === 1 ? "" : "s"} Left`
      : `${Math.abs(n)} Day${n === -1 ? "" : "s"} Overdue`;
}
export const dateLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB") : "—";
