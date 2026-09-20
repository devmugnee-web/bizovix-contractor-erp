export type ReceiptCategory = "PROJECT" | "GENERAL";
export type ReceiptRecordStatus = "PENDING" | "RECEIVED" | "CANCELLED";

export interface ReceiptRecord {
  id: string;
  receiptNo: string;
  receiptDate: string;
  receiptCategory: ReceiptCategory;
  receiptType: string;
  receiptHeadAccountId: string | null;
  receivedFrom: string;
  amount: string;
  grossAmount: string;
  vatDeductedAmount: string;
  taxDeductedAmount: string;
  securityDepositDeductedAmount: string;
  otherDeductionAmount: string;
  paymentMethod: string;
  chequeNo: string | null;
  chequeDate: string | null;
  chequeBankName: string | null;
  referenceNo: string | null;
  description: string | null;
  status: ReceiptRecordStatus;
  work: { id: string; workName: string; tenderNumber: string | null; noaAmount: string | null; organizationMaster: { shortName: string } } | null;
  receivedInAccount: { id: string; accountName: string; accountNumber: string | null } | null;
  receiptHead: { id: string; code: string; name: string } | null;
}

export interface ReceiptQuery {
  page?: number; limit?: number; search?: string; dateFrom?: string; dateTo?: string;
  receiptType?: string; workId?: string; receivedInAccountId?: string; status?: ReceiptRecordStatus;
}

export interface ReceiptSummary {
  totalReceived: string;
  totalGross: string;
  totalVatDeducted: string;
  totalTaxDeducted: string;
  totalSecurityDepositDeducted: string;
  totalOtherDeduction: string;
  thisMonth: string;
  projectReceipt: string;
  generalReceipt: string;
  monthLabel: string;
}

export interface SaveReceiptInput {
  receiptDate: string; receiptCategory: ReceiptCategory; receiptType: string; workId?: string;
  receivableId?: string;
  receiptHeadAccountId?: string;
  receivedFrom: string; amount: number; grossAmount?: number;
  vatDeductedAmount?: number; taxDeductedAmount?: number;
  securityDepositDeductedAmount?: number; otherDeductionAmount?: number;
  receivedInAccountId: string; paymentMethod: string;
  chequeNo?: string; chequeDate?: string; chequeBankName?: string;
  referenceNo?: string; description?: string; status?: ReceiptRecordStatus;
}

export interface EligibleReceiptBill {
  id: string;
  billNo: string;
  grossBillAmount: string;
  vatAmount: string;
  taxAmount: string;
  securityDepositAmount: string;
  otherDeductionAmount: string;
  netCertified: string;
  alreadyReceived: string;
  outstanding: string;
}
