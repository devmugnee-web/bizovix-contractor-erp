export type ReceiptCategory = "PROJECT" | "GENERAL";
export type ReceiptRecordStatus = "PENDING" | "RECEIVED" | "CANCELLED";

export interface ReceiptRecord {
  id: string;
  receiptNo: string;
  receiptDate: string;
  receiptCategory: ReceiptCategory;
  receiptType: string;
  receivedFrom: string;
  amount: string;
  paymentMethod: string;
  referenceNo: string | null;
  description: string | null;
  status: ReceiptRecordStatus;
  work: { id: string; workName: string; organizationMaster: { shortName: string } } | null;
  receivedInAccount: { id: string; accountName: string; accountNumber: string | null } | null;
}

export interface ReceiptQuery {
  page?: number; limit?: number; search?: string; dateFrom?: string; dateTo?: string;
  receiptType?: string; workId?: string; receivedInAccountId?: string; status?: ReceiptRecordStatus;
}

export interface ReceiptSummary { totalReceived: string; thisMonth: string; projectReceipt: string; generalReceipt: string; monthLabel: string; }

export interface SaveReceiptInput {
  receiptDate: string; receiptCategory: ReceiptCategory; receiptType: string; workId?: string;
  receivableId?: string;
  receiptHeadAccountId?: string;
  receivedFrom: string; amount: number; receivedInAccountId: string; paymentMethod: string;
  referenceNo?: string; description?: string; status?: ReceiptRecordStatus;
}
