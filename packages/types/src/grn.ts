import type { GrnInspectionStatus } from "./enums";

export interface GrnItemRecord {
  id: string;
  purchaseOrderItemId: string;
  purchaseOrderItem: { id: string; itemNameSnapshot: string; unitSnapshot: string; orderedQty: string };
  descriptionSnapshot: string;
  unitSnapshot: string;
  orderedQty: string;
  previouslyReceivedQty: string;
  currentReceivedQty: string;
  cumulativeReceivedQty: string;
  remainingQty: string;
  acceptedQty: string;
  rejectedQty: string;
  damagedQty: string;
  inspectionRemarks: string | null;
}

export interface GrnRecord {
  id: string;
  grnNo: string;
  purchaseOrderId: string;
  purchaseOrder: { id: string; poNo: string; status: string };
  supplierId: string;
  supplier: { id: string; code: string; name: string };
  cmsWorkId: string | null;
  cmsWork: { id: string; workName: string } | null;
  receiptDate: string;
  deliveryChallanNo: string | null;
  deliveryChallanDate: string | null;
  receivedById: string | null;
  inspectionStatus: GrnInspectionStatus;
  warehouseLocation: string | null;
  remarks: string | null;
  items: GrnItemRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface GrnItemInput {
  purchaseOrderItemId: string;
  currentReceivedQty: number;
  acceptedQty: number;
  rejectedQty?: number;
  damagedQty?: number;
  inspectionRemarks?: string;
}

export interface SaveGrnInput {
  grnNo?: string;
  purchaseOrderId: string;
  receiptDate: string;
  deliveryChallanNo?: string;
  deliveryChallanDate?: string;
  receivedById?: string;
  warehouseLocation?: string;
  remarks?: string;
  items: GrnItemInput[];
}

export interface GrnQuery {
  page?: number;
  limit?: number;
  search?: string;
  purchaseOrderId?: string;
  inspectionStatus?: GrnInspectionStatus;
}

export interface GrnStats {
  total: number;
  accepted: number;
  partial: number;
  rejected: number;
}
