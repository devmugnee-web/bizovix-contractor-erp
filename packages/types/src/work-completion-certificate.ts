import type { CmsWorkStatus } from "./cms-work";
import type { PageQuery } from "./api";

export type WorkCompletionCertificateSource = "UNSPECIFIED" | "EGP" | "MANUAL";

export type WorkCompletionCertificateEgpStatus =
  | "UNSPECIFIED"
  | "NOT_APPLICABLE"
  | "NOT_APPLIED"
  | "PENDING"
  | "UNDER_PROCESS"
  | "OBTAINED";

export type WorkCompletionCertificateCoreStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type WorkCompletionCertificateDisplayStatus =
  | "NOT_APPLIED"
  | "WCC_APPLIED"
  | "WCC_OBTAINED"
  | "EGP_APPLIED_FOR_MANUAL"
  | "MANUAL_WCC_OBTAINED_EGP_APPLIED"
  | "MANUAL_WCC_OBTAINED_EGP_NOT_APPLIED";

export interface WorkCompletionCertificateDocument {
  id: string;
  name: string;
  documentType: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  currentVersion: number;
  status: string;
  updatedAt: string;
}

export interface WorkCompletionCertificateRecord {
  id: string;
  certificateNo: string;
  completionType: string;
  source: WorkCompletionCertificateSource;
  egpStatus: WorkCompletionCertificateEgpStatus;
  status: WorkCompletionCertificateCoreStatus;
  applicationDate: string;
  actualCompletionDate: string;
  certifiedCompletionDate: string | null;
  certificateDate: string | null;
  egpAppliedOn: string | null;
  egpObtainedOn: string | null;
  issuingAuthority: string | null;
  remarks: string | null;
  contract: { id: string; contractNo: string; scopeOfWork: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface WorkCompletionCertificateRow {
  id: string;
  workId: string;
  tenderId: string | null;
  tid: string | null;
  project: string;
  procuringEntity: string;
  workDescription: string;
  workCategory: string;
  contractNo: string | null;
  projectStatus: CmsWorkStatus;
  workCompletionDate: string | null;
  displayStatus: WorkCompletionCertificateDisplayStatus;
  source: WorkCompletionCertificateSource | null;
  egpStatus: WorkCompletionCertificateEgpStatus | null;
  wccObtainedOn: string | null;
  certificateNo: string | null;
  certificateDate: string | null;
  egpAppliedOn: string | null;
  egpObtainedOn: string | null;
  lastUpdated: string;
  certificate: WorkCompletionCertificateRecord | null;
  documents: WorkCompletionCertificateDocument[];
}

export interface WorkCompletionCertificateQuery extends PageQuery {
  cmsWorkId?: string;
  completedOnly?: boolean;
  source?: WorkCompletionCertificateSource;
  egpStatus?: WorkCompletionCertificateEgpStatus;
  certificateStatus?: WorkCompletionCertificateCoreStatus;
  displayStatus?: WorkCompletionCertificateDisplayStatus;
}

export interface WorkCompletionCertificateStats {
  totalProjects: number;
  wccObtained: number;
  obtainedEgp: number;
  obtainedManual: number;
  unclassifiedObtained: number;
  egpAppliedForManual: number;
  withoutWcc: number;
}

export interface SaveCompletionCertificateInput {
  contractId: string;
  source?: WorkCompletionCertificateSource;
  applicationDate: string;
  actualCompletionDate: string;
  certifiedCompletionDate?: string;
  certificateDate?: string;
  completionType?: string;
  issuingAuthority?: string;
  remarks?: string;
}

export type UpdateCompletionCertificateInput = Partial<
  Omit<SaveCompletionCertificateInput, "contractId" | "completionType">
>;

export interface UpdateCompletionCertificateEgpInput {
  egpStatus: Extract<
    WorkCompletionCertificateEgpStatus,
    "PENDING" | "UNDER_PROCESS" | "OBTAINED"
  >;
  egpAppliedOn?: string;
  egpObtainedOn?: string;
  remarks?: string;
}
