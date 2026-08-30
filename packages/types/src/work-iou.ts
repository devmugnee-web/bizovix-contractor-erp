export type WorkIouStatus = "DRAFT" | "SUBMITTED" | "CANCELLED";

export type WorkIouSettlementStatus =
  | "PENDING"
  | "PARTIALLY_SETTLED"
  | "SETTLED";

export type WorkIouExpenseFor = "TENDER" | "PROJECT";

export type WorkIouPaymentMethod =
  | "CASH"
  | "BANK_TRANSFER"
  | "CARD"
  | "MOBILE_BANKING"
  | "CHEQUE"
  | "OTHER";

export interface WorkIouUserRef {
  id: string;
  name: string;
  email?: string | null;
}

export interface WorkIouOrganizationRef {
  id: string;
  name: string;
  shortName: string;
}

export interface WorkIouExpenseHeadRef {
  id: string;
  name: string;
  budgetCategory?: string | null;
}

export interface WorkIouTenderRef {
  id: string;
  tenderId: string | null;
  workName: string;
  status: string;
  organization: WorkIouOrganizationRef;
}

export interface WorkIouProjectRef {
  id: string;
  tenderId: string | null;
  workName: string;
  workCategory: string;
  status: string;
  organization: WorkIouOrganizationRef;
}

export interface WorkIouItemRecord {
  id: string;
  organizationId: string;
  workIouId: string;
  expenseDate: string;
  description: string;
  expenseHeadId: string;
  expenseHead: WorkIouExpenseHeadRef;
  categoryName: string;
  paidToName: string;
  referenceNo: string | null;
  amount: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkIouAttachmentRecord {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedById: string | null;
  uploadedBy: WorkIouUserRef | null;
  createdAt: string;
}

export interface WorkIouListRecord {
  id: string;
  organizationId: string;
  iouNo: string;
  iouDate: string;
  paidOn: string;
  paidById: string;
  paidBy: WorkIouUserRef;
  paidToName: string;
  paymentMethod: WorkIouPaymentMethod;
  referenceNo: string | null;
  expenseFor: WorkIouExpenseFor;
  tenderId: string | null;
  tender: WorkIouTenderRef | null;
  workId: string | null;
  work: WorkIouProjectRef | null;
  purpose: string;
  remarks: string | null;
  otherCharges: string;
  subtotal: string;
  discount: string;
  totalAmount: string;
  settledAmount: string;
  dueAmount: string;
  settlementStatus: WorkIouSettlementStatus;
  expectedSettlementDate: string | null;
  settlementRemarks: string | null;
  status: WorkIouStatus;
  version: number;
  submittedAt: string | null;
  submittedById: string | null;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancellationReason: string | null;
  createdById: string | null;
  itemCount: number;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkIouRecord extends WorkIouListRecord {
  submittedBy: WorkIouUserRef | null;
  cancelledBy: WorkIouUserRef | null;
  createdBy: WorkIouUserRef | null;
  items: WorkIouItemRecord[];
  attachments: WorkIouAttachmentRecord[];
}

export interface WorkIouQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: WorkIouStatus;
  settlementStatus?: WorkIouSettlementStatus;
  expenseFor?: WorkIouExpenseFor;
  paymentMethod?: WorkIouPaymentMethod;
  tenderId?: string;
  workId?: string;
  paidById?: string;
  fromDate?: string;
  toDate?: string;
}

export interface WorkIouOptionTender {
  id: string;
  tenderId: string | null;
  workName: string;
  status: string;
  organization: WorkIouOrganizationRef;
}

export interface WorkIouOptionProject {
  id: string;
  tenderId: string | null;
  workName: string;
  workCategory: string;
  status: string;
  organization: WorkIouOrganizationRef;
}

export interface WorkIouOptions {
  people: WorkIouUserRef[];
  expenseHeads: WorkIouExpenseHeadRef[];
  tenders: WorkIouOptionTender[];
  projects: WorkIouOptionProject[];
}

export interface WorkIouItemInput {
  expenseDate: string;
  description: string;
  expenseHeadId: string;
  paidToName: string;
  referenceNo?: string | null;
  amount: string;
}

export interface CreateWorkIouInput {
  iouDate: string;
  paidOn: string;
  paidById: string;
  paidToName: string;
  paymentMethod: WorkIouPaymentMethod;
  referenceNo?: string | null;
  expenseFor: WorkIouExpenseFor;
  tenderId?: string | null;
  workId?: string | null;
  purpose: string;
  remarks?: string | null;
  otherCharges?: string;
  discount?: string;
  expectedSettlementDate?: string | null;
  settlementRemarks?: string | null;
  items?: WorkIouItemInput[];
}

export interface UpdateWorkIouInput
  extends Partial<Omit<CreateWorkIouInput, "items">> {
  expectedVersion: number;
  items?: WorkIouItemInput[];
}

export interface SubmitWorkIouInput {
  expectedVersion: number;
}

export interface CancelWorkIouInput {
  expectedVersion: number;
  cancellationReason: string;
}

export interface WorkIouAttachmentMutationInput {
  expectedVersion: number;
}
