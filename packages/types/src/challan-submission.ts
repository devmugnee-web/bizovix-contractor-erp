export type ChallanSubmissionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "PAYMENT_RELEASED"
  | "REJECTED"
  | "CANCELLED";

export interface ChallanSubmissionCmsWorkSummary {
  id: string;
  workName: string;
  workCategory: string;
  contractValue: string;
  organizationMaster: {
    id: string;
    shortName: string;
    fullName: string;
  };
}

export interface ChallanSubmissionContractSummary {
  id: string;
  contractNo: string;
  currentContractValue: string;
  currency: string;
  scopeOfWork: string | null;
  tender: {
    id: string;
    egpTenderId: string | null;
    workName: string;
  } | null;
}

export interface ChallanSubmissionItemRecord {
  id: string;
  itemCode: string | null;
  description: string;
  unit: string;
  quantity: string;
  rate: string;
  amount: string;
  sortOrder: number;
}

export interface ChallanSubmissionHistoryRecord {
  id: string;
  fromStatus: ChallanSubmissionStatus | null;
  toStatus: ChallanSubmissionStatus;
  action: string;
  note: string | null;
  actedById: string | null;
  createdAt: string;
}

export interface ChallanSubmissionDocumentRecord {
  id: string;
  name: string;
  documentType: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  currentVersion: number;
}

export interface ChallanSubmissionRecord {
  id: string;
  cmsWorkId: string;
  cmsWork: ChallanSubmissionCmsWorkSummary;
  contractId: string | null;
  contract: ChallanSubmissionContractSummary | null;
  challanNo: string;
  challanDate: string;
  description: string;
  challanType: string;
  challanMonth: string;
  periodFrom: string;
  periodTo: string;
  receivedBy: string;
  receivedAt: string;
  submittedTo: string;
  paymentFrom: string;
  remarks: string | null;
  totalAmount: string;
  approvedAmount: string | null;
  status: ChallanSubmissionStatus;
  createdById: string | null;
  submittedAt: string | null;
  submittedById: string | null;
  reviewStartedAt: string | null;
  reviewStartedById: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  paymentReleasedAt: string | null;
  paymentReleasedById: string | null;
  rejectedAt: string | null;
  rejectedById: string | null;
  rejectionReason: string | null;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: ChallanSubmissionItemRecord[];
  statusHistory: ChallanSubmissionHistoryRecord[];
  documents: ChallanSubmissionDocumentRecord[];
}

export interface ChallanSubmissionItemInput {
  itemCode?: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  sortOrder?: number;
}

export interface SaveChallanSubmissionInput {
  cmsWorkId: string;
  contractId?: string;
  challanDate: string;
  description: string;
  challanType: string;
  challanMonth: string;
  periodFrom: string;
  periodTo: string;
  receivedBy: string;
  receivedAt: string;
  submittedTo: string;
  paymentFrom: string;
  remarks?: string;
  items?: ChallanSubmissionItemInput[];
}

export interface ChallanSubmissionQuery {
  page?: number;
  limit?: number;
  search?: string;
  cmsWorkId?: string;
  status?: ChallanSubmissionStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface ChallanSubmissionStats {
  total: number;
  draft: number;
  submitted: number;
  underReview: number;
  approved: number;
  paymentReleased: number;
  rejected: number;
  cancelled: number;
  totalAmount: string;
  approvedAmount: string;
  releasedAmount: string;
}

export interface ChallanSubmissionNumberPreview {
  challanNo: string;
}

export interface ApproveChallanSubmissionInput {
  id: string;
  approvedAmount?: number;
}

export interface RejectChallanSubmissionInput {
  id: string;
  reason?: string;
}

export interface CancelChallanSubmissionInput {
  id: string;
  reason?: string;
}
