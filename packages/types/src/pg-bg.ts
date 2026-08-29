export type PgBgWorkflowStatus = "DRAFT" | "NOA_ACCEPTED" | "NOA_REJECTED" | "FINALIZED";

export interface EligiblePgBgTender {
  id: string;
  tenderId: string | null;
  tenderWorkName: string;
  category: string | null;
  organizationMaster: { id: string; shortName: string; fullName: string };
}

export interface PgBgEligibleQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface OrganizationContactInput {
  name?: string;
  designation?: string;
  mobile?: string;
  email?: string;
  address?: string;
}

export interface SavePgBgWorkflowInput {
  documentPurchaseId: string;
  noaDate?: string;
  noaAmount?: number;
  workCategory?: string;
  contact?: OrganizationContactInput;
  acceptNoa?: boolean;
  pgBgRequired?: boolean;
  currentStep?: number;
}

export interface PgBgWorkflow {
  id: string;
  documentPurchaseId: string;
  noaDate: string | null;
  noaAmount: string | null;
  workCategory: string | null;
  acceptNoa: boolean | null;
  pgBgRequired: boolean | null;
  status: PgBgWorkflowStatus;
  currentStep: number;
  contact: ({ id: string } & Required<Omit<OrganizationContactInput, "email">> & { email: string | null }) | null;
}

export interface PgBgDecisionResult extends PgBgWorkflow {
  cmsWorkId: string | null;
}

export interface FinalizePgBgInput {
  type: "PG" | "BG";
  bankAccountId: string;
  instrumentNo?: string;
  amount: number;
  issueDate: string;
  expiryDate: string;
}

export interface FinalizePgBgResult {
  id: string;
  amount: string;
  cmsWorkId: string;
}
