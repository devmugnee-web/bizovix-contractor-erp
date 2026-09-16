import type { DocumentPurchaseRequestStatus, PurchaseType, TenderCostingStatus } from "./enums";

export interface DocumentPurchase {
  id: string;
  purchaseType: PurchaseType;
  tenderId: string | null;
  /** Real FK to the Tenders module record this purchase originated from, if any. */
  linkedTenderId: string | null;
  organizationMasterId: string;
  organizationMaster: { id: string; shortName: string; fullName: string };
  tenderWorkName: string;
  purchaseDate: string;
  documentPrice: string;
  estimatedTenderAmount: string;
  category: string | null;
  submissionDate: string | null;
  openingDate: string | null;
  remarks: string | null;
  paymentFromAccountId: string;
  paymentFromAccount: { id: string; accountName: string };
  createdAt: string;
  updatedAt: string;
  /** Included on the detail endpoint when the purchase came through an approval request. */
  workflowRequest?: {
    status: DocumentPurchaseRequestStatus;
    requestedAt: string;
    approvedAt: string | null;
    requestedBy: { id: string; name: string } | null;
    approvedBy: { id: string; name: string } | null;
  } | null;
}

export interface CreateDocumentPurchaseInput {
  purchaseType: PurchaseType;
  tenderId?: string | null;
  linkedTenderId?: string | null;
  requestId?: string | null;
  organizationMasterId: string;
  tenderWorkName: string;
  purchaseDate: string;
  documentPrice: number;
  paymentFromAccountId: string;
  category: string;
  estimatedTenderAmount?: number;
  submissionDate?: string;
  openingDate?: string;
  remarks?: string;
}

export type UpdateDocumentPurchaseInput = Partial<CreateDocumentPurchaseInput>;

export interface DocumentPurchaseQuery {
  page?: number;
  limit?: number;
  search?: string;
  purchaseType?: PurchaseType;
  organizationMasterId?: string;
  paymentFromAccountId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface DocumentPurchaseStats {
  totalPurchases: number;
  egpPurchases: number;
  manualPurchases: number;
  totalAmount: string;
}

export interface DocumentPurchaseRequest {
  id: string;
  organizationId: string;
  tenderId: string;
  costingId: string;
  status: DocumentPurchaseRequestStatus;
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  documentPurchaseId: string | null;
  version: number;
  tender: {
    id: string;
    egpTenderId: string | null;
    workName: string;
    category: string | null;
    documentFee: string | null;
    contractValue: string;
    documentPurchaseDeadline: string | null;
    submissionDeadline: string | null;
    openingDate: string | null;
    organizationMaster: { id: string; shortName: string; fullName: string } | null;
  };
  costing: { id: string; status: TenderCostingStatus };
  requestedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  rejectedBy: { id: string; name: string } | null;
}

export interface DocumentPurchaseRequestQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: DocumentPurchaseRequestStatus;
}

export interface DocumentPurchaseRequestStats {
  total: number;
  pendingApproval: number;
  approved: number;
  rejected: number;
  purchased: number;
}

export interface DocumentPurchaseRequestActionInput {
  version: number;
}

export interface RejectDocumentPurchaseRequestInput extends DocumentPurchaseRequestActionInput {
  reason: string;
}
