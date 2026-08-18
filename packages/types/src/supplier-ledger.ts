export interface SupplierLedgerRow {
  date: string;
  journalNo: string;
  referenceNo: string | null;
  type: string;
  description: string | null;
  debit: string;
  credit: string;
  /** Credit-positive running balance — an AP balance is what the organisation still owes. */
  balance: string;
  project: { id: string; workName: string } | null;
  purchaseOrder: { id: string; poNo: string } | null;
  supplierBill: { id: string; billNo: string } | null;
  supplierPayment: { id: string; referenceNo: string | null } | null;
  reversed: boolean;
}

export interface SupplierLedgerResult {
  supplier: { id: string; code: string; name: string };
  items: SupplierLedgerRow[];
  summary: {
    openingBalance: string;
    totalDebit: string;
    totalCredit: string;
    closingBalance: string;
    payableOutstanding: string;
    /** null when a date window was applied — a windowed closing balance is not expected to
     * equal the full Payable subledger outstanding. */
    reconciled: boolean | null;
  };
}

export interface SupplierLedgerQuery {
  supplierId: string;
  dateFrom?: string;
  dateTo?: string;
}

export type ApAgingBucket = "CURRENT" | "1-30" | "31-60" | "61-90" | "90+";

export interface ApAgingBuckets {
  current: string;
  days1To30: string;
  days31To60: string;
  days61To90: string;
  days90Plus: string;
  total: string;
}

export interface ApAgingRow {
  payableId: string;
  supplierId: string | null;
  supplierName: string;
  billNo: string;
  supplierBill: { id: string; billNo: string; supplierInvoiceNo: string } | null;
  billDate: string;
  dueDate: string | null;
  daysOverdue: number;
  amount: string;
  paidAmount: string;
  outstanding: string;
  bucket: ApAgingBucket;
}

export interface ApAgingSupplierRow extends ApAgingBuckets {
  supplierId: string | null;
  supplierName: string;
}

export interface ApAgingResult {
  asOf: string;
  items: ApAgingRow[];
  bySupplier: ApAgingSupplierRow[];
  summary: ApAgingBuckets;
}

export interface ApAgingQuery {
  supplierId?: string;
  projectId?: string;
  asOf?: string;
}

export interface ApReconciliationResult {
  controlBalance: string;
  subledgerBalance: string;
  difference: string;
  reconciled: boolean;
}
