export const PurchaseType = {
  EGP: "EGP",
  MANUAL: "MANUAL",
} as const;
export type PurchaseType = (typeof PurchaseType)[keyof typeof PurchaseType];

export const TenderStatus = {
  SUBMITTED: "SUBMITTED",
  UNDER_PROCESS: "UNDER_PROCESS",
  AWARDED: "AWARDED",
  NOA: "NOA",
  REJECTED: "REJECTED",
} as const;
export type TenderStatus = (typeof TenderStatus)[keyof typeof TenderStatus];

export const ExpenseStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type ExpenseStatus = (typeof ExpenseStatus)[keyof typeof ExpenseStatus];

export const ReceiptStatus = {
  RECEIVED: "RECEIVED",
  PENDING: "PENDING",
} as const;
export type ReceiptStatus = (typeof ReceiptStatus)[keyof typeof ReceiptStatus];
