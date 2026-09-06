import type { PaginationMeta } from "./api";

export type TenderTaxType = "VAT" | "TAX";
export type TenderTaxEntryKind = "SELF_DEPOSIT" | "BILL_DEDUCTION";
export interface TenderTaxQuery {
  page?: number; limit?: number; search?: string; dateFrom?: string; dateTo?: string;
  entryKind?: TenderTaxEntryKind; taxType?: TenderTaxType;
}
export interface TenderTaxTotals {
  vat: string; tax: string; total: string; entryCount: number;
  depositedVat: string; depositedTax: string; deductedVat: string; deductedTax: string;
}
export interface TenderTaxTender {
  id: string; tenderNumber: string | null; workName: string;
}
export interface TenderTaxList {
  rows: (TenderTaxTender & TenderTaxTotals)[]; meta: PaginationMeta; totals: TenderTaxTotals;
}
export interface TenderTaxDocument { id: string; name: string; fileName: string | null; fileType: string | null }
export interface TenderTaxEntry {
  id: string; tenderId: string; taxType: TenderTaxType; entryKind: TenderTaxEntryKind;
  entryDate: string; amount: string; referenceNo: string; notes: string | null; version: number;
  voidedAt: string | null; voidReason: string | null; createdAt: string; updatedAt: string;
  documents: TenderTaxDocument[];
}
export interface TenderTaxDetail {
  tender: TenderTaxTender; rows: TenderTaxEntry[]; meta: PaginationMeta; totals: TenderTaxTotals;
}
export interface SaveTenderTaxInput {
  taxType: TenderTaxType; entryKind: TenderTaxEntryKind; entryDate: string;
  amount: string; referenceNo: string; notes?: string;
}
export interface CreateTenderTaxInput extends SaveTenderTaxInput { requestId: string }
export interface UpdateTenderTaxInput extends SaveTenderTaxInput { version: number }
