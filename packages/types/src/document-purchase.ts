import type { PurchaseType } from "./enums";

export interface DocumentPurchase {
  id: string;
  purchaseType: PurchaseType;
  tenderId: string | null;
  organizationMasterId: string;
  organizationMaster: { id: string; shortName: string; fullName: string };
  tenderWorkName: string;
  purchaseDate: string;
  documentPrice: string;
  paymentFromAccountId: string;
  paymentFromAccount: { id: string; accountName: string };
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentPurchaseInput {
  purchaseType: PurchaseType;
  tenderId?: string | null;
  organizationMasterId: string;
  tenderWorkName: string;
  purchaseDate: string;
  documentPrice: number;
  paymentFromAccountId: string;
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
