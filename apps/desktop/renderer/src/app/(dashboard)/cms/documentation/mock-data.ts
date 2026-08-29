// Project Documentation has no backend of its own yet. "Select Project" is
// real (backed by the actual CmsWork/Project records), but Bill Submission,
// VAT-Tax Certificates and Work Completion Certificate
// have no matching backend model — the closest real feature (project RA
// bills, see use-project-bills.ts) has a different shape (no Tender ID,
// a richer status lifecycle) and doesn't map cleanly onto this hub's
// TID-keyed document rows, so those three panels below are mock data, same
// as Tender Costing / Item Price History.

export type BillStatus = "Approved" | "Under Review";
export type CertificateType = "VAT" | "Tax";
export type CertificateStatus = "Valid" | "Upcoming";
export type WccSource = "e-GP" | "Manual";
export type WccStatus = "Issued" | "In Progress";

export interface BillSubmissionRow {
  id: string;
  tid: string;
  billNo: string;
  billDate: string;
  workDescription: string;
  billAmount: number;
  status: BillStatus;
}

export interface VatTaxCertificateRow {
  id: string;
  tid: string;
  certificateNo: string;
  issueDate: string;
  validTill: string;
  type: CertificateType;
  status: CertificateStatus;
}

export interface WorkCompletionCertRow {
  id: string;
  tid: string;
  wccNo: string;
  completionDate: string;
  issuedOn: string;
  source: WccSource;
  status: WccStatus;
}

export const BILL_SUBMISSION_ROWS: BillSubmissionRow[] = [
  {
    id: "1",
    tid: "TID-2024-1258",
    billNo: "BILL-2024-001",
    billDate: "2024-05-05",
    workDescription: "Foundation Work",
    billAmount: 1_250_000,
    status: "Approved",
  },
  {
    id: "2",
    tid: "TID-2024-1257",
    billNo: "BILL-2024-002",
    billDate: "2024-05-20",
    workDescription: "Column Work",
    billAmount: 2_750_000,
    status: "Approved",
  },
  {
    id: "3",
    tid: "TID-2024-1256",
    billNo: "BILL-2024-003",
    billDate: "2024-06-10",
    workDescription: "Beam Work",
    billAmount: 1_850_000,
    status: "Under Review",
  },
];

export const VAT_TAX_CERTIFICATE_ROWS: VatTaxCertificateRow[] = [
  {
    id: "1",
    tid: "TID-2024-1258",
    certificateNo: "VAT-2024-001",
    issueDate: "2024-05-15",
    validTill: "2025-05-14",
    type: "VAT",
    status: "Valid",
  },
  {
    id: "2",
    tid: "TID-2024-1257",
    certificateNo: "TAX-2024-002",
    issueDate: "2024-06-15",
    validTill: "2025-06-14",
    type: "Tax",
    status: "Valid",
  },
  {
    id: "3",
    tid: "TID-2024-1256",
    certificateNo: "VAT-2024-003",
    issueDate: "2024-07-15",
    validTill: "2025-07-14",
    type: "VAT",
    status: "Upcoming",
  },
];

export const WORK_COMPLETION_CERT_ROWS: WorkCompletionCertRow[] = [
  {
    id: "1",
    tid: "TID-2024-1258",
    wccNo: "WCC-2024-001",
    completionDate: "2024-04-30",
    issuedOn: "2024-05-02",
    source: "e-GP",
    status: "Issued",
  },
  {
    id: "2",
    tid: "TID-2024-1257",
    wccNo: "WCC-2024-002",
    completionDate: "2024-08-15",
    issuedOn: "2024-08-16",
    source: "Manual",
    status: "In Progress",
  },
];

export const DOCUMENT_KPI_TOTALS = {
  totalDocuments: 56,
  billSubmissions: 18,
  vatTaxCertificates: 8,
  workCompletionCert: 2,
};
