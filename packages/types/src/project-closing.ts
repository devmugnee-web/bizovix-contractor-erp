import type {
  WorkCompletionCertificateEgpStatus,
  WorkCompletionCertificateSource,
} from "./work-completion-certificate";

export interface CloseoutItem {
  key: string;
  label: string;
  blocking: boolean;
  passed: boolean;
  status?: "PASSED" | "FAILED" | "WARNING" | "NOT_APPLICABLE";
  value?: string | number;
  message?: string;
  route?: string;
  sourceId?: string;
}
export interface CloseoutReadiness {
  status: "READY_TO_CLOSE" | "NOT_READY" | "READY_WITH_WARNINGS";
  items: CloseoutItem[];
  project: { id: string; status: string; closedAt?: string | null; archivedAt?: string | null };
}
export interface RetentionSummary {
  totalRetentionDeducted: string;
  previouslyReleased: string;
  outstandingRetention: string;
}
export interface ProjectClosingOverview {
  contracts: Array<{ id: string; contractNo: string; currentCompletionDate: string; dlpDays?: number | null; retentionPct?: string | null; status: string }>;
  certificates: Array<{
    id: string;
    certificateNo: string;
    source: WorkCompletionCertificateSource;
    egpStatus: WorkCompletionCertificateEgpStatus;
    status: string;
    applicationDate: string;
    actualCompletionDate: string;
    certifiedCompletionDate?: string | null;
    certificateDate?: string | null;
    egpAppliedOn?: string | null;
    egpObtainedOn?: string | null;
    contractId: string;
    issuingAuthority?: string | null;
    remarks?: string | null;
    updatedAt: string;
  }>;
  dlps: Array<{
    id: string;
    startDate: string;
    endDate: string;
    durationDays: number;
    status: string;
    originalStartDate?: string | null;
    originalEndDate?: string | null;
    extensions?: Array<{ id: string; previousEndDate: string; revisedEndDate: string; extensionDays: number; reason: string }>;
  }>;
  defects: Array<{
    id: string;
    defectNo: string;
    description: string;
    status: string;
    targetRectificationDate?: string | null;
    mandatory: boolean;
    priority?: string;
  }>;
  retention: RetentionSummary;
  releases: Array<{
    id: string;
    releaseNo: string;
    amount: string;
    status: string;
    releaseDate?: string | null;
  }>;
  handovers: Array<{
    id: string;
    handoverNo: string;
    handoverType: string;
    handoverDate: string;
    status: string;
  }>;
  guarantees: Array<{ id: string; instrumentNo?: string | null; status: string; expiryDate: string; releaseReference?: string | null }>;
  readiness: CloseoutReadiness;
}
export interface FinalProjectProfitability {
  originalContractValue: string;
  approvedVariations: string;
  currentContractValue: string;
  approvedProjectBudget: string | null;
  actualProjectExpenses: string;
  totalCertified: string;
  netCertifiedReceivable: string;
  totalReceived: string;
  outstandingReceivable: string;
  retentionHeld: string;
  retentionReleased: string;
  retentionOutstanding: string;
  bankGuaranteeCharges: string | null;
  finalProjectCost: string;
  grossProfitLoss: string;
  profitMarginPct: string | null;
}
