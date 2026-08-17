export const PurchaseType = {
  EGP: "EGP",
  MANUAL: "MANUAL",
} as const;
export type PurchaseType = (typeof PurchaseType)[keyof typeof PurchaseType];

export const TenderStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  DOCUMENT_PURCHASED: "DOCUMENT_PURCHASED",
  PREPARING: "PREPARING",
  SUBMITTED: "SUBMITTED",
  UNDER_PROCESS: "UNDER_PROCESS",
  OPENED: "OPENED",
  NOA: "NOA",
  AWARDED: "AWARDED",
  ONGOING: "ONGOING",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
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

export const SecurityType = {
  PAY_ORDER: "PAY_ORDER",
  BANK_GUARANTEE: "BANK_GUARANTEE",
} as const;
export type SecurityType = (typeof SecurityType)[keyof typeof SecurityType];

export const FundingType = {
  LOAN: "LOAN",
  CASH: "CASH",
} as const;
export type FundingType = (typeof FundingType)[keyof typeof FundingType];

export const TenderSecurityDocumentStatus = {
  PENDING: "PENDING",
  CREATED: "CREATED",
  NOT_REQUIRED: "NOT_REQUIRED",
} as const;
export type TenderSecurityDocumentStatus =
  (typeof TenderSecurityDocumentStatus)[keyof typeof TenderSecurityDocumentStatus];
