export interface DocumentVersionRecord {
  id: string;
  version: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedById: string | null;
  uploadedByName: string | null;
  changeNote: string | null;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  name: string;
  category: string | null;
  documentType: string | null;
  relatedModule: string | null;
  relatedEntityId: string | null;
  relatedEntityName: string | null;
  tenderId: string | null;
  workId: string | null;
  challanSubmissionId: string | null;
  organizationMasterId: string | null;
  referenceNumber: string | null;
  certificateNumber: string | null;
  issuingAuthority: string | null;
  account: string | null;
  amount: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  reminderDays: number | null;
  responsiblePerson: string | null;
  description: string | null;
  tags: string[];
  status: string;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  currentVersion: number;
  uploadedById: string | null;
  uploadedByName: string | null;
  archivedAt: string | null;
  archivedById: string | null;
  archivedByName: string | null;
  archiveReason: string | null;
  createdAt: string;
  updatedAt: string;
  versions?: DocumentVersionRecord[];
}

export interface CreateDocumentInput {
  name: string;
  category?: string;
  documentType?: string;
  relatedModule?: string;
  relatedEntityId?: string;
  relatedEntityName?: string;
  tenderId?: string;
  workId?: string;
  contractId?: string;
  challanSubmissionId?: string;
  organizationMasterId?: string;
  referenceNumber?: string;
  certificateNumber?: string;
  issuingAuthority?: string;
  account?: string;
  amount?: number;
  issueDate?: string;
  expiryDate?: string;
  reminderDays?: number;
  responsiblePerson?: string;
  description?: string;
  tags?: string;
}

export type UpdateDocumentInput = Partial<CreateDocumentInput>;

export interface DocumentQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  relatedModule?: string;
  tenderId?: string;
  workId?: string;
  contractId?: string;
  projectBillId?: string;
  challanSubmissionId?: string;
  variationOrderId?: string;
  timeExtensionId?: string;
  partyId?: string;
  purchaseRequisitionId?: string;
  rfqId?: string;
  supplierQuotationId?: string;
  comparativeStatementId?: string;
  purchaseOrderId?: string;
  goodsReceiptNoteId?: string;
  supplierBillId?: string;
  supplierPaymentId?: string;
  status?: string;
  expiringWithinDays?: number;
}
