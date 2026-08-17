export interface CloseoutItem {
  key: string;
  label: string;
  blocking: boolean;
  passed: boolean;
  value?: string | number;
}
export interface CloseoutReadiness {
  status: "READY_TO_CLOSE" | "NOT_READY" | "READY_WITH_WARNINGS";
  items: CloseoutItem[];
}
export interface RetentionSummary {
  totalRetentionDeducted: string;
  previouslyReleased: string;
  outstandingRetention: string;
}
export interface ProjectClosingOverview {
  certificates: Array<{
    id: string;
    certificateNo: string;
    status: string;
    actualCompletionDate: string;
    issuingAuthority?: string | null;
  }>;
  dlps: Array<{
    id: string;
    startDate: string;
    endDate: string;
    durationDays: number;
    status: string;
  }>;
  defects: Array<{
    id: string;
    defectNo: string;
    description: string;
    status: string;
    targetRectificationDate?: string | null;
    mandatory: boolean;
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
