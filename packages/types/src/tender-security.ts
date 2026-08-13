import type { FundingType, SecurityType } from "./enums";

export interface PendingTenderSecurity {
  id: string;
  tenderId: string | null;
  organizationMasterId: string;
  organizationMaster: { id: string; shortName: string; fullName: string };
  tenderWorkName: string;
  purchaseDate: string;
  securityAmount: string;
  status: "Security Not Given";
}

export interface TenderSecurityPendingQuery {
  page?: number;
  limit?: number;
  search?: string;
  organizationId?: string;
  status?: string;
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
