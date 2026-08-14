export type CmsWorkStatus = "ONGOING" | "COMPLETED" | "ARCHIVED" | "CANCELLED";

export interface CmsWork {
  id: string;
  workName: string;
  workCategory: string;
  contractValue: string;
  status: CmsWorkStatus;
  startDate: string | null;
  expectedCompletionDate: string | null;
  organizationMaster: { id: string; shortName: string; fullName: string };
}

export interface CmsWorkQuery {
  page?: number;
  limit?: number;
  status?: CmsWorkStatus;
  search?: string;
  organizationMasterId?: string;
  workCategory?: string;
}

export interface CmsWorkStats {
  ongoingWorks: number;
  totalWorkValue: string;
}

export interface CreateCmsWorkInput {
  organizationMasterId: string;
  workName: string;
  workCategory: string;
  contractValue: number;
  startDate?: string;
  expectedCompletionDate?: string;
}
