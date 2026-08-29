export type VatTaxCertificateType = "VAT" | "TAX";

export type VatTaxCertificateStatus =
  | "PENDING"
  | "UNDER_PROCESSING"
  | "ISSUED"
  | "NOT_ISSUED"
  | "REJECTED"
  | "RETURNED";

export type VatTaxCertificateStatusFilter =
  | VatTaxCertificateStatus
  | "PENDING_NOT_ISSUED"
  | "REJECTED_RETURNED";

export interface VatTaxCertificateCmsWorkSummary {
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

export interface VatTaxCertificateTenderSummary {
  id: string;
  egpTenderId: string | null;
  workName: string;
}

export interface VatTaxCertificateDocumentRecord {
  id: string;
  name: string;
  documentType: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  currentVersion: number;
}

export interface VatTaxCertificateRecord {
  id: string;
  cmsWorkId: string;
  cmsWork: VatTaxCertificateCmsWorkSummary;
  contractId: string | null;
  tenderId: string | null;
  tender: VatTaxCertificateTenderSummary | null;
  certificateType: VatTaxCertificateType;
  certificateNo: string | null;
  applicationDate: string | null;
  issueDate: string | null;
  validTill: string | null;
  amount: string | null;
  status: VatTaxCertificateStatus;
  issuingAuthority: string | null;
  remarks: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  documents: VatTaxCertificateDocumentRecord[];
}

export interface CreateVatTaxCertificateInput {
  cmsWorkId: string;
  contractId?: string | null;
  certificateType: VatTaxCertificateType;
  status?: VatTaxCertificateStatus;
  certificateNo?: string | null;
  applicationDate?: string;
  issueDate?: string | null;
  validTill?: string | null;
  amount?: number | null;
  issuingAuthority?: string | null;
  remarks?: string | null;
}

export type UpdateVatTaxCertificateInput = Partial<CreateVatTaxCertificateInput>;

export interface VatTaxCertificateQuery {
  page?: number;
  limit?: number;
  search?: string;
  cmsWorkId?: string;
  tenderId?: string;
  certificateType?: VatTaxCertificateType;
  status?: VatTaxCertificateStatusFilter;
  dateFrom?: string;
  dateTo?: string;
}

export type VatTaxCertificateStatsQuery = Pick<
  VatTaxCertificateQuery,
  "search" | "cmsWorkId" | "tenderId" | "certificateType" | "dateFrom" | "dateTo"
>;

export interface VatTaxCertificateRecentQuery {
  limit?: number;
  cmsWorkId?: string;
  certificateType?: VatTaxCertificateType;
}

export type VatTaxCertificateExportQuery = Omit<VatTaxCertificateQuery, "page" | "limit">;

export interface VatTaxCertificateExport {
  filename: string;
  content: string;
}

export interface VatTaxCertificateStats {
  total: number;
  vat: number;
  tax: number;
  issued: number;
  underProcessing: number;
  pendingNotIssued: number;
  rejectedReturned: number;
  totalAmount: string;
  issuedAmount: string;
  underProcessingAmount: string;
  pendingNotIssuedAmount: string;
  rejectedReturnedAmount: string;
}
