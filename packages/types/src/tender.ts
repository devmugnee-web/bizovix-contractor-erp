import type { TenderStatus } from "./enums";

export interface TenderRecord {
  id: string;
  organizationMasterId: string;
  organizationMaster: { id: string; shortName: string; fullName: string };
  egpTenderId: string | null;
  workName: string;
  category: string;
  tenderType: string | null;
  procurementMethod: string | null;
  tenderMethod: string | null;
  contractValue: string;
  status: TenderStatus;
  progressPercentage: number;
  publishedDate: string | null;
  documentPurchaseDeadline: string | null;
  preBidDate: string | null;
  submissionDeadline: string | null;
  openingDate: string | null;
  tenderSecurityRequired: boolean;
  estimatedTenderSecurityAmount: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  description: string | null;
  submissionDate: string | null;
  submissionMethod: string | null;
  quotedAmount: string | null;
  submittedById: string | null;
  submittedByName: string | null;
  submissionReference: string | null;
  checklistStatus: string | null;
  submissionRemarks: string | null;
  submittedAt: string | null;
  openingResult: string | null;
  lowestBidAmount: string | null;
  lowestBidder: string | null;
  resultRemarks: string | null;
  awardedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenderLinkedDocumentPurchase {
  id: string;
  tenderWorkName: string;
  purchaseDate: string;
  documentPrice: string;
  purchaseType: "EGP" | "MANUAL";
}
export interface TenderLinkedTenderSecurity {
  id: string;
  instrumentNo: string | null;
  amount: string;
  status: string;
  expiryDate: string;
}
export interface TenderLinkedCreditCommitment {
  id: string;
  amount: string;
  isCharged: boolean;
  chargeDate: string;
}
export interface TenderLinkedPerformanceGuarantee {
  id: string;
  instrumentNo: string | null;
  amount: string;
  type: string;
  status: string;
  expiryDate: string;
}
export interface TenderLinkedCmsWork {
  id: string;
  workName: string;
  status: string;
  contractValue: string;
}
export interface TenderLinkedDocument {
  id: string;
  name: string;
  category: string | null;
  expiryDate: string | null;
}

export interface TenderDetail extends TenderRecord {
  linked: {
    documentPurchases: TenderLinkedDocumentPurchase[];
    tenderSecurities: TenderLinkedTenderSecurity[];
    creditCommitments: TenderLinkedCreditCommitment[];
    performanceGuarantees: TenderLinkedPerformanceGuarantee[];
    cmsWorks: TenderLinkedCmsWork[];
    documents: TenderLinkedDocument[];
  };
}

export interface CreateTenderInput {
  organizationMasterId: string;
  egpTenderId?: string;
  workName: string;
  category: string;
  tenderType?: string;
  procurementMethod?: string;
  tenderMethod?: string;
  contractValue?: number;
  status?: TenderStatus;
  publishedDate?: string;
  documentPurchaseDeadline?: string;
  preBidDate?: string;
  submissionDeadline?: string;
  openingDate?: string;
  tenderSecurityRequired?: boolean;
  estimatedTenderSecurityAmount?: number;
  assignedToUserId?: string;
  assignedToName?: string;
  description?: string;
}

export type UpdateTenderInput = Partial<CreateTenderInput>;

export interface SubmitTenderInput {
  submissionDate: string;
  submissionMethod: string;
  quotedAmount: number;
  submittedByName?: string;
  submissionReference?: string;
  checklistStatus?: string;
  submissionRemarks?: string;
}

export type TenderOpeningResultStatus = "OPENED" | "UNDER_PROCESS" | "AWARDED" | "REJECTED";

export interface RecordTenderOpeningInput {
  openingDate: string;
  status: TenderOpeningResultStatus;
  openingResult?: string;
  lowestBidAmount?: number;
  lowestBidder?: string;
  resultRemarks?: string;
}

export interface TenderQuery {
  page?: number;
  limit?: number;
  search?: string;
  organizationMasterId?: string;
  category?: string;
  status?: TenderStatus;
  assignedToUserId?: string;
  assignedToName?: string;
  fromDate?: string;
  toDate?: string;
}

export interface TenderStats {
  total: number;
  preparing: number;
  submitted: number;
  underEvaluation: number;
  awarded: number;
  unsuccessful: number;
}
