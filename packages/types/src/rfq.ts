import type { RfqStatus } from "./enums";

export interface RfqSupplierRecord {
  id: string;
  supplierId: string;
  supplier: { id: string; code: string; name: string };
  invitedAt: string;
}

export interface RfqItemRecord {
  id: string;
  itemId: string;
  item: { id: string; itemCode: string; itemName: string };
  purchaseRequisitionItemId: string | null;
  itemCodeSnapshot: string;
  itemNameSnapshot: string;
  descriptionSnapshot: string | null;
  unitSnapshot: string;
  requestedQty: string;
  remarks: string | null;
}

export interface RfqRecord {
  id: string;
  rfqNo: string;
  purchaseRequisitionId: string | null;
  purchaseRequisition: { id: string; prNo: string } | null;
  cmsWorkId: string | null;
  cmsWork: { id: string; workName: string } | null;
  issueDate: string;
  submissionDeadline: string;
  deliveryLocation: string | null;
  termsConditions: string | null;
  paymentTerms: string | null;
  remarks: string | null;
  status: RfqStatus;
  issuedById: string | null;
  issuedAt: string | null;
  suppliers: RfqSupplierRecord[];
  items: RfqItemRecord[];
  comparativeStatement: { id: string; csNo: string; status: string } | null;
  respondedSupplierIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RfqItemInput {
  itemId: string;
  purchaseRequisitionItemId?: string;
  requestedQty: number;
  remarks?: string;
}

export interface SaveRfqInput {
  rfqNo?: string;
  purchaseRequisitionId?: string;
  cmsWorkId?: string;
  issueDate: string;
  submissionDeadline: string;
  deliveryLocation?: string;
  termsConditions?: string;
  paymentTerms?: string;
  remarks?: string;
  supplierIds: string[];
  items?: RfqItemInput[];
}

export interface RfqQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: RfqStatus;
  purchaseRequisitionId?: string;
}

export interface RfqStats {
  total: number;
  open: number;
  closed: number;
  awarded: number;
}
