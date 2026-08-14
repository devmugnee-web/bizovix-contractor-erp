export interface PendingCreditCommitmentTender {
  id: string;
  tenderId: string | null;
  organizationMaster: { id: string; shortName: string; fullName: string };
  tenderWorkName: string;
  purchaseDate: string;
  estimatedTenderAmount: string;
}

export interface CreditCommitmentPendingQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface CreateCreditCommitmentItemInput {
  documentPurchaseId: string;
  bankAccountId: string;
  chargeAmount: number;
  remarks?: string;
}

export interface CreateCreditCommitmentInput {
  paymentFromAccountId: string;
  paymentDate: string;
  remarks?: string;
  items: CreateCreditCommitmentItemInput[];
}

export interface CreditCommitmentItem {
  id: string;
  documentPurchaseId: string;
  bankAccountId: string;
  chargeAmount: string;
  remarks: string | null;
}

export interface CreditCommitmentCharge {
  id: string;
  paymentFromAccountId: string | null;
  paymentDate: string | null;
  remarks: string | null;
  totalAmount: string;
  items: CreditCommitmentItem[];
}
