export interface CostedTenderChallanSummary {
  id: string;
  tenderId: string;
  tenderNumber: string | null;
  workName: string;
  paName: string | null;
  itemCount: number;
}

/** Costed goods only: no purchasing, sales, tax or profit amounts. */
export interface TenderChallanReport {
  tenderId: string;
  tenderNumber: string | null;
  workName: string;
  organizationName: string;
  costingDate: string;
  pa: { name: string | null; designation: string | null; phone: string | null; address: string | null };
  contract: { number: string; date: string; label: string } | null;
  rows: { id: string; productName: string; details: string | null; unit: string; quantity: string }[];
}

/** Optional PDF-only fields, not an official submission or delivery update. */
export interface TenderChallanPdfOptions {
  reference?: string;
  date?: string;
  deliveryPlace?: string;
}
