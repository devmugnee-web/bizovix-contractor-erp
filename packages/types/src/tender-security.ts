import type { FundingType, SecurityType, TenderStatus } from "./enums";

export type TenderSecurityEligibilityStatus = "PENDING" | "CREATED" | "NOT_REQUIRED" | "NO_DOCUMENT_PURCHASE";

export interface PendingTenderSecurity {
  id: string;
  tenderRecordId: string;
  documentPurchaseId: string | null;
  tenderId: string | null;
  organizationMasterId: string | null;
  organizationMaster: { id: string; shortName: string; fullName: string } | null;
  tenderWorkName: string;
  submissionDeadline: string | null;
  tenderSecurityValidUpTo: string | null;
  tenderStatus: TenderStatus;
  securityAmount: string;
  securityStatus: TenderSecurityEligibilityStatus;
  eligible: boolean;
  ineligibleReason: string | null;
}

export interface TenderSecurityPendingQuery {
  page?: number;
  limit?: number;
  search?: string;
  organizationId?: string;
  tenderStatus?: TenderStatus;
  securityStatus?: TenderSecurityEligibilityStatus;
  fromDate?: string;
  toDate?: string;
}

export interface CreateTenderSecurityItemInput {
  documentPurchaseId: string;
  securityAmount: number;
  marginPercentage: number;
  referenceNo?: string;
}

export interface CreateTenderSecurityInput {
  securityType: SecurityType;
  bankId: string;
  fundingType: FundingType;
  issueDate: string;
  validityMonths: number;
  expiryDate: string;
  interestRate: number;
  chargeFromAccountId: string;
  remarks?: string;
  items: CreateTenderSecurityItemInput[];
}

export interface MarkTenderSecurityNotRequiredInput {
  documentPurchaseIds: string[];
}

export interface TenderSecurityItem {
  id: string;
  documentPurchaseId: string;
  securityAmount: string;
  marginPercentage: string;
  marginAmount: string;
  bankFinanceAmount: string;
  referenceNo: string | null;
}

export interface TenderSecurity {
  id: string;
  securityType: SecurityType;
  fundingType: FundingType;
  amount: string;
  marginAmount: string;
  bankFinanceAmount: string;
  issueDate: string;
  expiryDate: string;
  validityMonths: number;
  interestRate: string;
  remarks: string | null;
  items: TenderSecurityItem[];
}
