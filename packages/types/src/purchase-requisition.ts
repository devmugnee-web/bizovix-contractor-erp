import type { PrPriority, PrStatus } from "./enums";

export interface PurchaseRequisitionItemRecord {
  id: string;
  itemId: string;
  item: { id: string; itemCode: string; itemName: string; status: string };
  descriptionSnapshot: string;
  uomId: string | null;
  uom: { id: string; code: string; name: string } | null;
  requestedQty: string;
  estimatedRate: string | null;
  estimatedAmount: string | null;
  requiredDate: string | null;
  boqItemId: string | null;
  boqItem: { id: string; itemCode: string | null; description: string } | null;
  remarks: string | null;
}

export interface PurchaseRequisitionRecord {
  id: string;
  prNo: string;
  requestDate: string;
  requiredByDate: string | null;
  cmsWorkId: string | null;
  cmsWork: { id: string; workName: string } | null;
  department: string | null;
  requestedById: string | null;
  priority: PrPriority;
  purpose: string | null;
  remarks: string | null;
  status: PrStatus;
  submittedAt: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  items: PurchaseRequisitionItemRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface PrItemInput {
  itemId: string;
  uomId?: string;
  requestedQty: number;
  estimatedRate?: number;
  requiredDate?: string;
  boqItemId?: string;
  remarks?: string;
}

export interface SavePurchaseRequisitionInput {
  prNo?: string;
  requestDate: string;
  requiredByDate?: string;
  cmsWorkId?: string;
  department?: string;
  requestedById?: string;
  priority?: PrPriority;
  purpose?: string;
  remarks?: string;
  items: PrItemInput[];
}

export interface PurchaseRequisitionQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: PrStatus;
  priority?: PrPriority;
  cmsWorkId?: string;
}

export interface PurchaseRequisitionStats {
  total: number;
  pendingApproval: number;
  approved: number;
  draft: number;
}
