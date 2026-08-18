import type { SupplierPaymentStatus } from "./enums";

export interface SupplierPaymentRecord {
  id: string;
  payableId: string;
  payable: {
    id: string;
    billNo: string;
    amount: string;
    paidAmount: string;
    outstanding: string;
    status: string;
    supplierBill: { id: string; billNo: string; supplierInvoiceNo: string; status: string } | null;
  };
  supplierId: string;
  supplier: { id: string; code: string; name: string };
  bankAccountId: string;
  bankAccount: { id: string; accountName: string; accountType: string; bankName: string | null };
  amount: string;
  paymentDate: string;
  paymentMethod: string | null;
  referenceNo: string | null;
  remarks: string | null;
  status: SupplierPaymentStatus;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveSupplierPaymentInput {
  supplierBillId: string;
  bankAccountId: string;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  referenceNo?: string;
  remarks?: string;
}

export interface SupplierPaymentQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: SupplierPaymentStatus;
  supplierId?: string;
  payableId?: string;
  supplierBillId?: string;
}

export interface SupplierPaymentStats {
  payments: number;
  totalPaid: string;
  outstanding: string;
}
