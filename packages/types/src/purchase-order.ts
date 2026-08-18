import type { PurchaseOrderStatus } from "./enums";

export interface PurchaseOrderItemRecord {
  id: string;
  itemId: string;
  item: { id: string; itemCode: string; itemName: string };
  itemCodeSnapshot: string;
  itemNameSnapshot: string;
  descriptionSnapshot: string | null;
  unitSnapshot: string;
  orderedQty: string;
  unitRate: string;
  discountAmount: string;
  netRate: string;
  lineAmount: string;
  receivedQty: string;
  remainingQty: string;
  deliveryDate: string | null;
  cmsWorkId: string | null;
  boqItemId: string | null;
  sourceQuotationItemId: string | null;
  remarks: string | null;
}

export interface PurchaseOrderRecord {
  id: string;
  poNo: string;
  poDate: string;
  supplierId: string;
  supplier: { id: string; code: string; name: string };
  cmsWorkId: string | null;
  cmsWork: { id: string; workName: string } | null;
  purchaseRequisitionId: string | null;
  purchaseRequisition: { id: string; prNo: string } | null;
  rfqId: string | null;
  rfq: { id: string; rfqNo: string } | null;
  comparativeStatementId: string | null;
  comparativeStatement: { id: string; csNo: string } | null;
  deliveryAddress: string | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  otherCharges: string;
  grandTotal: string;
  remarks: string | null;
  status: PurchaseOrderStatus;
  approvedById: string | null;
  approvedAt: string | null;
  issuedAt: string | null;
  items: PurchaseOrderItemRecord[];
  receivedPct: number;
  createdAt: string;
  updatedAt: string;
}

export interface PoItemInput {
  itemId: string;
  sourceQuotationItemId?: string;
  orderedQty: number;
  unitRate: number;
  discountAmount?: number;
  deliveryDate?: string;
  cmsWorkId?: string;
  boqItemId?: string;
  remarks?: string;
}

export interface SavePurchaseOrderInput {
  poNo?: string;
  poDate: string;
  supplierId: string;
  cmsWorkId?: string;
  purchaseRequisitionId?: string;
  rfqId?: string;
  comparativeStatementId?: string;
  deliveryAddress?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  currency?: string;
  otherCharges?: number;
  remarks?: string;
  items: PoItemInput[];
}

export interface PurchaseOrderQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: PurchaseOrderStatus;
  supplierId?: string;
  cmsWorkId?: string;
  comparativeStatementId?: string;
}

export interface PurchaseOrderStats {
  total: number;
  awaitingDelivery: number;
  received: number;
  draft: number;
}
