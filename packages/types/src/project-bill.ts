import type { AdjustmentDirection, BillStatus, BillType, DeductionCalcType } from "./enums";

export const BILL_ADJUSTMENT_TYPES = [
  "Variation Work",
  "Price Adjustment",
  "Material Advance",
  "Mobilization Advance",
  "Advance Recovery",
  "Other Addition",
  "Other Deduction",
] as const;

export interface ProjectBillItemRecord {
  id: string;
  billId: string;
  boqItemId: string;
  boqItem: { id: string; itemCode: string | null };
  description: string;
  unit: string;
  approvedRate: string;
  contractQty: string;
  previousQty: string;
  currentQty: string;
  cumulativeQty: string;
  previousValue: string;
  currentValue: string;
  cumulativeValue: string;
}

export interface BillAdjustmentRecord {
  id: string;
  billId: string;
  type: string;
  direction: AdjustmentDirection;
  description: string | null;
  calculationType: DeductionCalcType;
  rate: string | null;
  baseAmount: string | null;
  amount: string;
  ledgerAccountId: string | null;
  sortOrder: number;
}

export interface ReceivableEntry {
  id: string;
  projectId: string;
  contractId: string | null;
  projectBillId: string | null;
  partyName: string;
  billNo: string;
  billDate: string;
  amount: string;
  receivedAmount: string;
  status: string;
}

export interface ProjectBillRecord {
  id: string;
  cmsWorkId: string;
  cmsWork: {
    id: string;
    workName: string;
    organizationMaster: { id: string; shortName: string };
    tender: { id: string; egpTenderId: string | null } | null;
  };
  contractId: string;
  contract: { id: string; contractNo: string; retentionPct: string | null; currentContractValue: string };
  billNo: string;
  billType: BillType;
  billDate: string;
  periodFrom: string | null;
  periodTo: string | null;
  submissionDate: string | null;
  certificationDate: string | null;
  clientCertificateRef: string | null;
  measurementBookRef: string | null;
  remarks: string | null;
  grossWorkValue: string;
  approvedAdditions: string;
  grossBillAmount: string;
  retentionPct: string | null;
  retentionAmount: string;
  retentionReleasedAmount: string;
  retentionReleaseDueDate: string | null;
  vatRate: string | null;
  vatAmount: string;
  aitRate: string | null;
  aitAmount: string;
  otherDeductionAmount: string;
  netCertifiedAmount: string;
  receivedAmount: string;
  status: BillStatus;
  items: ProjectBillItemRecord[];
  adjustments: BillAdjustmentRecord[];
  receivable: ReceivableEntry | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillItemInput {
  boqItemId: string;
  currentQty: number;
}

export interface BillAdjustmentInput {
  type: string;
  direction: AdjustmentDirection;
  description?: string;
  calculationType?: DeductionCalcType;
  rate?: number;
  baseAmount?: number;
  amount?: number;
  ledgerAccountId?: string;
}

export interface SaveProjectBillInput {
  contractId: string;
  billType?: BillType;
  billDate: string;
  periodFrom?: string;
  periodTo?: string;
  clientCertificateRef?: string;
  measurementBookRef?: string;
  remarks?: string;
  retentionPctOverride?: number;
  items: BillItemInput[];
  adjustments?: BillAdjustmentInput[];
}

export interface ProjectBillQuery {
  page?: number;
  limit?: number;
  search?: string;
  cmsWorkId?: string;
  billType?: BillType;
  status?: BillStatus;
}

export interface ProjectBillStats {
  totalBills: number;
  grossCertified: string;
  netCertified: string;
  received: string;
  outstanding: string;
  retentionHeld: string;
}

export interface ProjectProgressItem {
  id: string;
  itemCode: string | null;
  description: string;
  unit: string;
  contractQty: string;
  executedQty: string;
  remainingQty: string;
  progressPct: string;
  certifiedValue: string;
}

export interface ProjectProgress {
  physicalProgressPct: string;
  financialProgressPct: string;
  collectionProgressPct: string;
  grossCertified: string;
  netCertified: string;
  received: string;
  outstanding: string;
  retentionHeld: string;
  contractValue: string;
  items: ProjectProgressItem[];
}
