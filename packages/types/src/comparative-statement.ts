import type { ComparativeStatementStatus, TechnicalComplianceStatus } from "./enums";

export interface ComparativeStatementSupplierRecord {
  id: string;
  supplierId: string;
  supplier: { id: string; code: string; name: string };
  quotationId: string;
  quotation: { id: string; quotationRef: string; revisionNo: number };
  quotedTotal: string;
  commercialAdjustment: string;
  evaluatedTotal: string;
  deliveryDays: number | null;
  paymentTerms: string | null;
  technicalStatus: TechnicalComplianceStatus;
  recommended: boolean;
  rank: number | null;
  isSelected: boolean;
  remarks: string | null;
}

export interface ComparativeStatementRecord {
  id: string;
  rfqId: string;
  rfq: { id: string; rfqNo: string; status: string };
  cmsWorkId: string | null;
  cmsWork: { id: string; workName: string } | null;
  csNo: string;
  status: ComparativeStatementStatus;
  decisionNotes: string | null;
  preparedById: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  suppliers: ComparativeStatementSupplierRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ComparativeStatementItemComparisonOffer {
  supplierId: string;
  supplierName: string;
  offeredQty: string;
  unitRate: string;
  discountPct: string;
  lineAmount: string;
  deliveryDays: number | null;
  isLowest: boolean;
}

export interface ComparativeStatementItemComparisonRow {
  rfqItemId: string;
  itemName: string;
  unit: string;
  requestedQty: string;
  offers: ComparativeStatementItemComparisonOffer[];
}

export interface CsSupplierEvaluationInput {
  supplierId: string;
  commercialAdjustment?: number;
  technicalStatus?: TechnicalComplianceStatus;
  recommended?: boolean;
  remarks?: string;
}

export interface SaveComparativeStatementInput {
  csNo?: string;
  rfqId: string;
  suppliers?: CsSupplierEvaluationInput[];
}

export interface SelectSupplierInput {
  supplierId: string;
  decisionNotes?: string;
}

export interface ComparativeStatementStats {
  total: number;
  pendingEvaluation: number;
  approved: number;
}
