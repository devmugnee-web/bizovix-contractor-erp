import type { QuotationStatus } from "./enums";

export interface SupplierQuotationItemRecord {
  id: string;
  rfqItemId: string;
  rfqItem: { id: string; itemNameSnapshot: string; unitSnapshot: string; requestedQty: string };
  offeredQty: string;
  unitRate: string;
  discountPct: string;
  taxPct: string;
  lineAmount: string;
  deliveryDays: number | null;
  brandModel: string | null;
  specification: string | null;
  remarks: string | null;
}

export interface SupplierQuotationRecord {
  id: string;
  rfqId: string;
  rfq: { id: string; rfqNo: string; status: string };
  supplierId: string;
  supplier: { id: string; code: string; name: string };
  quotationRef: string;
  quotationDate: string;
  validityDate: string | null;
  currency: string;
  deliveryDays: number | null;
  paymentTerms: string | null;
  warranty: string | null;
  remarks: string | null;
  status: QuotationStatus;
  revisionNo: number;
  previousRevisionId: string | null;
  totalAmount: string;
  items: SupplierQuotationItemRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface QuotationItemInput {
  rfqItemId: string;
  offeredQty: number;
  unitRate: number;
  discountPct?: number;
  taxPct?: number;
  deliveryDays?: number;
  brandModel?: string;
  specification?: string;
  remarks?: string;
}

export interface SaveSupplierQuotationInput {
  rfqId: string;
  supplierId: string;
  quotationRef: string;
  quotationDate: string;
  validityDate?: string;
  currency?: string;
  deliveryDays?: number;
  paymentTerms?: string;
  warranty?: string;
  remarks?: string;
  items: QuotationItemInput[];
}

export interface SupplierQuotationQuery {
  rfqId?: string;
  supplierId?: string;
}
