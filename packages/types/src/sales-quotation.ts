export type SalesQuotationStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED";
/** PENDING is derived from DRAFT and SENT; it is never persisted as a quotation status. */
export type SalesQuotationDecision = "PENDING" | "ACCEPTED" | "REJECTED";

export interface SalesQuotationCustomerRef {
  id: string;
  name: string;
  shortName?: string | null;
}

export interface SalesQuotationUserRef {
  id: string;
  name: string;
  email?: string | null;
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
  customerId: string;
  customer: SalesQuotationCustomerRef;
  workName: string;
  quotationDate: string;
  validUntil: string;
  currency: string;
  status: SalesQuotationStatus;
  decision: SalesQuotationDecision;
  salesPersonId: string | null;
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
  decisionById: string | null;
  acceptedAmount: string | null;
  customerPoWoNo: string | null;
  rejectionReason: string | null;
  lastFollowUpAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Result tables receive decision data with the list row to avoid per-row detail requests. */
export interface SalesQuotationResultRow extends SalesQuotationListRecord {
  decisionBy: SalesQuotationUserRef | null;
}

export interface SalesQuotationRecord extends SalesQuotationListRecord {
  decisionBy: SalesQuotationUserRef | null;
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

export interface SalesQuotationResultQuery extends Omit<
  SalesQuotationQuery,
  "status" | "decision"
> {
  decision?: SalesQuotationDecision;
}

export interface SalesQuotationFollowUpQuery {
  page?: number;
  limit?: number;
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

export interface SalesQuotationCostingSummaryQuery
  extends Omit<SalesQuotationQuery, "page"> {
  limit?: number;
}

export interface SalesQuotationCostingSummaryRow {
  description: string;
  unit: string;
  quantity: string;
  weightedUnitCost: string;
  weightedUnitPrice: string;
  marginPct: string;
  totalCost: string;
  totalSelling: string;
  profit: string;
}

export interface SalesQuotationCostingSummary {
  items: SalesQuotationCostingSummaryRow[];
  totalCost: string;
  totalSelling: string;
  profit: string;
}

export interface SalesQuotationRecentDecisionQuery
  extends Omit<SalesQuotationQuery, "page" | "status" | "decision"> {
  limit?: number;
}

export interface SalesQuotationOptions {
  customers: SalesQuotationCustomerRef[];
  salesPeople: SalesQuotationUserRef[];
  workNames: string[];
  projectNames: string[];
}

export interface SalesQuotationRecentRecord {
  id: string;
  quotationNo: string;
  customer: SalesQuotationCustomerRef;
  workName: string;
  grandTotal: string;
  status: SalesQuotationStatus;
  decision: SalesQuotationDecision;
  activityAt: string;
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

export interface UpdateSalesQuotationInput extends Omit<
  Partial<CreateSalesQuotationInput>,
  "salesPersonId"
> {
  expectedVersion: number;
  /** Use null to explicitly clear an existing salesperson assignment. */
  salesPersonId?: string | null;
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

export interface VersionedSalesQuotationActionInput {
  expectedVersion: number;
}

export type RecordSalesQuotationResultInput =
  | {
      expectedVersion: number;
      decision: "ACCEPTED";
      decisionDate: string;
      acceptedAmount: string;
      customerPoWoNo: string;
    }
  | {
      expectedVersion: number;
      decision: "REJECTED";
      decisionDate: string;
      rejectionReason: string;
    };

export interface CreateSalesQuotationFollowUpInput {
  expectedVersion: number;
  followedUpAt: string;
  nextFollowUpAt?: string;
  notes?: string;
}

export interface SalesQuotationExport {
  filename: string;
  content: string;
}
