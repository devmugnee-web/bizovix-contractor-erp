import type { TenderCostingApprovalStatus, TenderProcurementMethod, TenderStatus } from "./enums";
import type { TenderCostingRecord } from "./tender-costing";

export interface TenderWorkflowUser {
  id: string;
  name: string;
  email: string;
}

export interface TenderOptionUser {
  id: string;
  name: string;
}

export interface TenderOptions {
  procurementMethods: TenderProcurementMethod[];
  users: TenderOptionUser[];
  currentUserId: string;
}

export function normalizeTenderBusinessId(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export interface TenderRecord {
  id: string;
  organizationMasterId: string | null;
  organizationMaster: { id: string; shortName: string; fullName: string } | null;
  egpTenderId: string | null;
  tenderIdNormalized: string | null;
  workName: string;
  category: string | null;
  tenderType: string | null;
  procurementMethod: TenderProcurementMethod;
  tenderMethod: string | null;
  contractValue: string;
  status: TenderStatus;
  progressPercentage: number;
  payOrderRequired: boolean;
  payOrderAmount: string | null;
  foundByUserId: string | null;
  foundByName: string | null;
  findingDate: string | null;
  remarks: string | null;
  version: number;
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
  costingApprovalStatus: TenderCostingApprovalStatus;
  costingSubmittedAt: string | null;
  costingSubmittedById: string | null;
  costingApprovedAt: string | null;
  costingApprovedById: string | null;
  costingRejectedAt: string | null;
  costingRejectedById: string | null;
  costingRejectionReason: string | null;
  createdById: string | null;
  createdBy: TenderWorkflowUser | null;
  foundBy: TenderWorkflowUser | null;
  costingSubmittedBy: TenderWorkflowUser | null;
  costingApprovedBy: TenderWorkflowUser | null;
  costingRejectedBy: TenderWorkflowUser | null;
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
  organizationMasterId?: string;
  egpTenderId: string;
  workName: string;
  category?: string;
  tenderType?: string;
  procurementMethod?: TenderProcurementMethod;
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
  payOrderRequired?: boolean;
  payOrderAmount?: number;
  foundByUserId?: string;
  foundByName?: string;
  findingDate?: string;
  remarks?: string;
}

export interface TenderPdfExtractedData {
  egpTenderId?: string;
  workName?: string;
  tenderType?: string;
  procurementMethod?: TenderProcurementMethod;
  submissionDeadline?: string;
  remarks?: string;
}

export interface TenderPdfExtractionResult {
  data: TenderPdfExtractedData;
  extractedFieldCount: number;
  totalPages: number;
  warnings: string[];
}

export type UpdateTenderInput = Partial<CreateTenderInput>;

export interface SubmitTenderForCostingInput {
  version: number;
}

export interface ApproveTenderForCostingInput {
  version: number;
}

export interface TenderCostingApprovalResult {
  tender: TenderRecord;
  costing: Pick<TenderCostingRecord, "id">;
}

export interface RejectTenderForCostingInput {
  version: number;
  reason: string;
}

export interface TenderDuplicateConflict {
  code: "DUPLICATE_TENDER_ID";
  message: string;
  existing: {
    id: string;
    egpTenderId: string;
    workName: string;
    organizationMaster: { id: string; shortName: string; fullName: string } | null;
    createdAt: string;
    createdBy: TenderWorkflowUser | null;
    foundBy: TenderWorkflowUser | null;
    foundByName: string | null;
  };
}

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
  tenderType?: string;
  procurementMethod?: TenderProcurementMethod;
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
