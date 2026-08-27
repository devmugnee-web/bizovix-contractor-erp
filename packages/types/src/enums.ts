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

export const PartyRole = {
  CLIENT: "CLIENT",
  VENDOR: "VENDOR",
  SUPPLIER: "SUPPLIER",
  SUBCONTRACTOR: "SUBCONTRACTOR",
  SERVICE_PROVIDER: "SERVICE_PROVIDER",
  OTHER: "OTHER",
} as const;
export type PartyRole = (typeof PartyRole)[keyof typeof PartyRole];

export const PartyStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  SUSPENDED: "SUSPENDED",
  BLACKLISTED: "BLACKLISTED",
  ARCHIVED: "ARCHIVED",
} as const;
export type PartyStatus = (typeof PartyStatus)[keyof typeof PartyStatus];

export const MasterCategoryType = {
  VENDOR: "VENDOR",
  MATERIAL: "MATERIAL",
  SUBCONTRACTOR_TRADE: "SUBCONTRACTOR_TRADE",
  DOCUMENT_PURCHASE: "DOCUMENT_PURCHASE",
} as const;
export type MasterCategoryType = (typeof MasterCategoryType)[keyof typeof MasterCategoryType];

export const ItemType = {
  MATERIAL: "MATERIAL",
  SERVICE: "SERVICE",
  EQUIPMENT: "EQUIPMENT",
  CONSUMABLE: "CONSUMABLE",
  OTHER: "OTHER",
} as const;
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

export const ItemStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;
export type ItemStatus = (typeof ItemStatus)[keyof typeof ItemStatus];

export const PrPriority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;
export type PrPriority = (typeof PrPriority)[keyof typeof PrPriority];

export const PrStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  CONVERTED: "CONVERTED",
} as const;
export type PrStatus = (typeof PrStatus)[keyof typeof PrStatus];

export const RfqStatus = {
  DRAFT: "DRAFT",
  ISSUED: "ISSUED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
  AWARDED: "AWARDED",
} as const;
export type RfqStatus = (typeof RfqStatus)[keyof typeof RfqStatus];

export const QuotationStatus = {
  RECEIVED: "RECEIVED",
  SUPERSEDED: "SUPERSEDED",
  WITHDRAWN: "WITHDRAWN",
} as const;
export type QuotationStatus = (typeof QuotationStatus)[keyof typeof QuotationStatus];

export const TechnicalComplianceStatus = {
  COMPLIANT: "COMPLIANT",
  PARTIALLY_COMPLIANT: "PARTIALLY_COMPLIANT",
  NON_COMPLIANT: "NON_COMPLIANT",
} as const;
export type TechnicalComplianceStatus = (typeof TechnicalComplianceStatus)[keyof typeof TechnicalComplianceStatus];

export const ComparativeStatementStatus = {
  DRAFT: "DRAFT",
  EVALUATED: "EVALUATED",
  APPROVED: "APPROVED",
  CANCELLED: "CANCELLED",
} as const;
export type ComparativeStatementStatus = (typeof ComparativeStatementStatus)[keyof typeof ComparativeStatementStatus];

export const PurchaseOrderStatus = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  ISSUED: "ISSUED",
  PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED",
  RECEIVED: "RECEIVED",
  CANCELLED: "CANCELLED",
  CLOSED: "CLOSED",
} as const;
export type PurchaseOrderStatus = (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];

export const GrnInspectionStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  PARTIAL: "PARTIAL",
  REJECTED: "REJECTED",
} as const;
export type GrnInspectionStatus = (typeof GrnInspectionStatus)[keyof typeof GrnInspectionStatus];

export const SupplierBillStatus = {
  DRAFT: "DRAFT",
  APPROVAL_PENDING: "APPROVAL_PENDING",
  APPROVED: "APPROVED",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;
export type SupplierBillStatus = (typeof SupplierBillStatus)[keyof typeof SupplierBillStatus];

export const BillMatchStatus = {
  MATCHED: "MATCHED",
  QUANTITY_VARIANCE: "QUANTITY_VARIANCE",
  RATE_VARIANCE: "RATE_VARIANCE",
  AMOUNT_VARIANCE: "AMOUNT_VARIANCE",
  MISSING_RECEIPT: "MISSING_RECEIPT",
  BLOCKED: "BLOCKED",
} as const;
export type BillMatchStatus = (typeof BillMatchStatus)[keyof typeof BillMatchStatus];

export const SupplierPaymentStatus = {
  ACTIVE: "ACTIVE",
  CANCELLED: "CANCELLED",
} as const;
export type SupplierPaymentStatus = (typeof SupplierPaymentStatus)[keyof typeof SupplierPaymentStatus];
