export type CmsWorkStatus = "ONGOING" | "COMPLETED" | "ARCHIVED" | "CANCELLED";

export interface CmsWork {
  id: string;
  workName: string;
  workCategory: string;
  contractValue: string;
  status: CmsWorkStatus;
  startDate: string | null;
  expectedCompletionDate: string | null;
  completionDate: string | null;
  organizationMaster: { id: string; shortName: string; fullName: string };
}

export interface CmsWorkQuery {
  page?: number;
  limit?: number;
  status?: CmsWorkStatus;
  search?: string;
  organizationMasterId?: string;
  workCategory?: string;
  completionDateFrom?: string;
  completionDateTo?: string;
}

export interface CmsWorkStats {
  ongoingWorks: number;
  archivedWorks: number;
  totalWorkValue: string;
}

export interface CmsWorkExport {
  filename: string;
  content: string;
}

export interface CreateCmsWorkInput {
  organizationMasterId: string;
  workName: string;
  workCategory: string;
  contractValue: number;
  startDate?: string;
  expectedCompletionDate?: string;
  /** Real FK to the awarded Tender — the Award → CMS handoff link. */
  tenderId?: string;
}
