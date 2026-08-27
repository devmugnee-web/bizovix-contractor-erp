import type { ContractStatus, ContractType } from "./enums";

export interface ContractRecord {
  id: string;
  organizationMasterId: string;
  organizationMaster: { id: string; shortName: string; fullName: string };
  tenderId: string | null;
  tender: { id: string; workName: string; egpTenderId: string | null } | null;
  cmsWorkId: string;
  cmsWork: {
    id: string;
    workName: string;
    workCategory: string;
    status: string;
    contractValue: string;
  };
  pgBgWorkflowId: string | null;
  contractNo: string;
  contractType: ContractType;
  issueDate: string;
  contractDate: string | null;
  originalContractValue: string;
  currentContractValue: string;
  currency: string;
  commencementDate: string;
  originalCompletionDate: string;
  currentCompletionDate: string;
  durationDays: number | null;
  dlpDays: number | null;
  retentionPct: string | null;
  securityDepositPct: string | null;
  vatPct: string | null;
  taxPct: string | null;
  securityDepositMethod: string | null;
  securityDepositStatus: string | null;
  securityDepositReleasedAmount: string | null;
  securityDepositReleaseDueDate: string | null;
  securityDepositReleasedDate: string | null;
  clientContactName: string | null;
  responsiblePerson: string | null;
  scopeOfWork: string | null;
  remarks: string | null;
  status: ContractStatus;
  scheduleProgressPct: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContractLinkedDocument {
  id: string;
  name: string;
  category: string | null;
  expiryDate: string | null;
}

export interface ContractDetail extends ContractRecord {
  linked: { documents: ContractLinkedDocument[] };
}

export interface CreateContractInput {
  cmsWorkId: string;
  tenderId?: string;
  pgBgWorkflowId?: string;
  contractType?: ContractType;
  contractNo: string;
  issueDate: string;
  contractDate?: string;
  originalContractValue: number;
  currentContractValue?: number;
  currency?: string;
  commencementDate: string;
  originalCompletionDate: string;
  currentCompletionDate?: string;
  durationDays?: number;
  dlpDays?: number;
  retentionPct?: number;
  securityDepositPct?: number;
  vatPct?: number;
  taxPct?: number;
  securityDepositMethod?: string;
  securityDepositStatus?: string;
  securityDepositReleasedAmount?: number;
  securityDepositReleaseDueDate?: string;
  securityDepositReleasedDate?: string;
  clientContactName?: string;
  responsiblePerson?: string;
  scopeOfWork?: string;
  remarks?: string;
  status?: ContractStatus;
}

export type UpdateContractInput = Partial<CreateContractInput>;

export interface ContractQuery {
  page?: number;
  limit?: number;
  search?: string;
  organizationMasterId?: string;
  cmsWorkId?: string;
  workCategory?: string;
  status?: ContractStatus;
  fromDate?: string;
  toDate?: string;
}

export interface ContractStats {
  total: number;
  active: number;
  contractValue: string;
  completingSoon: number;
}
