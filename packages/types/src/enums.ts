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

export const ContractType = {
  WORK_ORDER: "WORK_ORDER",
  CONTRACT_AGREEMENT: "CONTRACT_AGREEMENT",
  PURCHASE_ORDER: "PURCHASE_ORDER",
  SERVICE_CONTRACT: "SERVICE_CONTRACT",
  OTHER: "OTHER",
} as const;
export type ContractType = (typeof ContractType)[keyof typeof ContractType];

export const ContractStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  ON_HOLD: "ON_HOLD",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  CLOSED: "CLOSED",
} as const;
export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];

export const ProjectBudgetStatus = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  REVISED: "REVISED",
  ARCHIVED: "ARCHIVED",
} as const;
export type ProjectBudgetStatus = (typeof ProjectBudgetStatus)[keyof typeof ProjectBudgetStatus];

export const BillType = {
  ADVANCE: "ADVANCE",
  RUNNING: "RUNNING",
  INTERIM: "INTERIM",
  FINAL: "FINAL",
} as const;
export type BillType = (typeof BillType)[keyof typeof BillType];

export const BillStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  CERTIFIED: "CERTIFIED",
  PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED",
  RECEIVED: "RECEIVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;
export type BillStatus = (typeof BillStatus)[keyof typeof BillStatus];

export const AdjustmentDirection = {
  ADDITION: "ADDITION",
  DEDUCTION: "DEDUCTION",
} as const;
export type AdjustmentDirection = (typeof AdjustmentDirection)[keyof typeof AdjustmentDirection];

export const DeductionCalcType = {
  FIXED_AMOUNT: "FIXED_AMOUNT",
  PERCENTAGE: "PERCENTAGE",
} as const;
export type DeductionCalcType = (typeof DeductionCalcType)[keyof typeof DeductionCalcType];

export const VariationType = {
  ADDITION: "ADDITION",
  OMISSION: "OMISSION",
  RATE_CHANGE: "RATE_CHANGE",
  QUANTITY_CHANGE: "QUANTITY_CHANGE",
  NEW_ITEM: "NEW_ITEM",
  OTHER: "OTHER",
} as const;
export type VariationType = (typeof VariationType)[keyof typeof VariationType];

export const VariationStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;
export type VariationStatus = (typeof VariationStatus)[keyof typeof VariationStatus];

export const TimeExtensionStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;
export type TimeExtensionStatus = (typeof TimeExtensionStatus)[keyof typeof TimeExtensionStatus];

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
