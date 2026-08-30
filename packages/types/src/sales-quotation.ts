export type SalesQuotationStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED";
export type SalesQuotationDecision = "PENDING" | "ACCEPTED" | "REJECTED";

export interface SalesQuotationPartyRef {
  id: string;
  shortName: string;
  fullName: string;
}

export interface SalesQuotationUserRef {
  id: string;
  name: string;
}

export interface SalesQuotationItemRecord {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
  totalCost: string;
  taxPct: string;
  taxAmount: string;
  unitPrice: string;
  totalPrice: string;
  profit: string;
  marginPct: string;
  sortOrder: number;
}

export interface SalesQuotationOverheadRecord {
  id: string;
  description: string;
  amount: string;
  sortOrder: number;
}

export interface SalesQuotationFollowUpRecord {
  id: string;
  followedUpAt: string;
  nextFollowUpAt: string | null;
  notes: string | null;
  createdBy: SalesQuotationUserRef;
  createdAt: string;
}

export interface SalesQuotationStatusHistoryRecord {
  id: string;
  fromStatus: SalesQuotationStatus | null;
  toStatus: SalesQuotationStatus;
  reason: string | null;
  changedBy: SalesQuotationUserRef;
  changedAt: string;
}

export interface SalesQuotationListRecord {
  id: string;
  quotationNo: string;
  customer: SalesQuotationPartyRef;
  workName: string;
  quotationDate: string;
  validUntil: string;
  currency: string;
  status: SalesQuotationStatus;
  decision: SalesQuotationDecision;
  salesPerson: SalesQuotationUserRef | null;
  remarks: string | null;
  version: number;
  totalCost: string;
  itemTaxTotal: string;
  totalSelling: string;
  overheadTotal: string;
  subtotalBeforeVat: string;
  vatApplicable: boolean;
  vatRate: string;
  vatAmount: string;
  grandTotal: string;
  sentAt: string | null;
  decisionDate: string | null;
  acceptedAmount: string | null;
  customerPoWoNo: string | null;
  rejectionReason: string | null;
  lastFollowUpAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesQuotationRecord extends SalesQuotationListRecord {
  items: SalesQuotationItemRecord[];
  overheads: SalesQuotationOverheadRecord[];
  followUps: SalesQuotationFollowUpRecord[];
  statusHistory: SalesQuotationStatusHistoryRecord[];
}

export interface SalesQuotationQuery {
  page?: number;
  limit?: number;
  search?: string;
  fromDate?: string;
  toDate?: string;
  status?: SalesQuotationStatus;
  decision?: SalesQuotationDecision;
  customerId?: string;
  salesPersonId?: string;
  workName?: string;
  projectName?: string;
}

export interface SalesQuotationSummary {
  total: number;
  draft: number;
  sent: number;
  accepted: number;
  rejected: number;
  pending: number;
  totalQuotationValue: string;
  acceptedValue: string;
  rejectedValue: string;
}

export interface SalesQuotationOptions {
  customers: SalesQuotationPartyRef[];
  salespeople: SalesQuotationUserRef[];
  workNames: string[];
}

export interface CreateSalesQuotationInput {
  customerId: string;
  workName: string;
  quotationDate: string;
  validUntil: string;
  salesPersonId?: string;
  remarks?: string;
  currency?: string;
}

export interface UpdateSalesQuotationInput extends Partial<CreateSalesQuotationInput> {
  expectedVersion: number;
}

export interface SalesQuotationCostingItemInput {
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
  taxPct?: string;
  unitPrice: string;
}

export interface SalesQuotationOverheadInput {
  description: string;
  amount: string;
}

export interface SaveSalesQuotationCostingInput {
  expectedVersion: number;
  items: SalesQuotationCostingItemInput[];
  overheads?: SalesQuotationOverheadInput[];
  vatApplicable?: boolean;
  vatRate?: string;
}

export interface RecordSalesQuotationResultInput {
  expectedVersion: number;
  decision: "ACCEPTED" | "REJECTED";
  decisionDate: string;
  acceptedAmount?: string;
  customerPoWoNo?: string;
  rejectionReason?: string;
}

export interface CreateSalesQuotationFollowUpInput {
  expectedVersion: number;
  followedUpAt: string;
  nextFollowUpAt?: string;
  notes?: string;
}
