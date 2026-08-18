import type { BillMatchStatus, SupplierBillStatus } from "./enums";

export interface SupplierBillItemRecord {
  id: string;
  purchaseOrderItemId: string;
  itemId: string | null;
  item: { id: string; itemCode: string; itemName: string } | null;
  itemCodeSnapshot: string;
  itemNameSnapshot: string;
  descriptionSnapshot: string | null;
  unitSnapshot: string;
  /** Every quantity/amount below is backend-authoritative — recomputed at match, submit and
   * approve time rather than trusted from whatever the form last sent. */
  orderedQty: string;
  acceptedQty: string;
  previouslyBilledQty: string;
  currentBilledQty: string;
  remainingBillableQty: string;
  poRate: string;
  invoiceRate: string;
  discountAmount: string;
  lineAmount: string;
  matchStatus: BillMatchStatus;
  remarks: string | null;
}

export interface SupplierBillDeductionRecord {
  id: string;
  type: string;
  code: string | null;
  /** Snapshotted at save/approval time so a historical bill stays reproducible even after the
   * organisation changes its VAT/AIT configuration. */
  rate: string;
  base: string;
  amount: string;
  remarks: string | null;
}

export interface SupplierBillRecord {
  id: string;
  billNo: string;
  supplierInvoiceNo: string;
  supplierInvoiceDate: string;
  supplierId: string;
  supplier: { id: string; code: string; name: string };
  purchaseOrderId: string;
  purchaseOrder: { id: string; poNo: string; status: string };
  cmsWorkId: string | null;
  cmsWork: { id: string; workName: string } | null;
  paymentTermId: string | null;
  paymentTerm: { id: string; name: string; days: number | null } | null;
  currency: string;
  dueDate: string | null;
  remarks: string | null;
  status: SupplierBillStatus;
  matchStatus: BillMatchStatus;
  subtotal: string;
  discountAmount: string;
  taxableBase: string;
  vatRate: string | null;
  vatAmount: string;
  aitRate: string | null;
  aitAmount: string;
  otherDeductionAmount: string;
  netPayable: string;
  payableId: string | null;
  payable: { id: string; billNo: string; amount: string; paidAmount: string; status: string } | null;
  submittedAt: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  items: SupplierBillItemRecord[];
  deductions: SupplierBillDeductionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface SupplierBillItemInput {
  purchaseOrderItemId: string;
  currentBilledQty: number;
  invoiceRate: number;
  discountAmount?: number;
  remarks?: string;
}

export interface SupplierBillOtherDeductionInput {
  type: string;
  code?: string;
  amount: number;
  remarks?: string;
}

export interface SaveSupplierBillInput {
  billNo?: string;
  supplierInvoiceNo: string;
  supplierInvoiceDate: string;
  supplierId: string;
  purchaseOrderId: string;
  paymentTermId?: string;
  dueDate?: string;
  remarks?: string;
  items: SupplierBillItemInput[];
  otherDeductions?: SupplierBillOtherDeductionInput[];
}

export interface SupplierBillQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: SupplierBillStatus;
  matchStatus?: BillMatchStatus;
  supplierId?: string;
  purchaseOrderId?: string;
  cmsWorkId?: string;
}

export interface SupplierBillStats {
  total: number;
  approvalPending: number;
  blocked: number;
  outstanding: string;
  grossApproved: string;
}

/** Backend-computed billable position for one PO line — the ceiling the bill form must respect
 * and the same figure the approval path re-derives. */
export interface BillableLineRecord {
  purchaseOrderItemId: string;
  itemId: string | null;
  itemCodeSnapshot: string;
  itemNameSnapshot: string;
  descriptionSnapshot: string | null;
  unitSnapshot: string;
  orderedQty: string;
  receivedQty: string;
  acceptedQty: string;
  previouslyBilledQty: string;
  remainingBillableQty: string;
  poRate: string;
}

export interface BillableLinesResult {
  purchaseOrder: { id: string; poNo: string; status: string; currency: string };
  supplier: { id: string; code: string; name: string };
  cmsWork: { id: string; workName: string } | null;
  items: BillableLineRecord[];
}
