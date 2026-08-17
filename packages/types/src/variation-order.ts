import type { VariationStatus, VariationType } from "./enums";

export interface VariationItemRecord {
  id: string;
  variationOrderId: string;
  boqItemId: string | null;
  boqItem: { id: string; itemCode: string | null } | null;
  itemCode: string | null;
  description: string;
  unit: string | null;
  originalQty: string | null;
  originalRate: string | null;
  revisedQty: string | null;
  revisedRate: string | null;
  amount: string;
}

export interface VariationOrderRecord {
  id: string;
  cmsWorkId: string;
  cmsWork: { id: string; workName: string };
  contractId: string;
  contract: { id: string; contractNo: string; originalContractValue: string; currentContractValue: string };
  variationNo: string;
  variationType: VariationType;
  title: string;
  reason: string;
  description: string | null;
  requestDate: string;
  approvalDate: string | null;
  requestedAmount: string;
  approvedAmount: string | null;
  status: VariationStatus;
  items: VariationItemRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface VariationItemInput {
  boqItemId?: string;
  itemCode?: string;
  description: string;
  unit?: string;
  revisedQty?: number;
  revisedRate?: number;
}

export interface SaveVariationOrderInput {
  contractId: string;
  variationType: VariationType;
  title: string;
  reason: string;
  description?: string;
  requestDate: string;
  items: VariationItemInput[];
}
