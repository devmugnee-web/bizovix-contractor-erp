import type { ContractStatus } from "./enums";
import type { CmsWorkStatus } from "./cms-work";

export interface ProjectBillPreview {
  grossWorkValue: string;
  grossBillAmount: string;
  retentionAmount: string;
  vatAmount: string;
  aitAmount: string;
  otherDeductionAmount: string;
  netCertifiedAmount: string;
}

export interface BillSource {
  id: string;
  kind: "tenders" | "projects";
  name: string;
  tenderId: string | null;
  tenderNumber: string | null;
  organization: string;
  pa: { name: string; designation: string; mobile: string; address: string } | null;
  costingId: string | null;
  costedItemCount: number;
  projects: { id: string; workName: string; status: CmsWorkStatus }[];
}

export interface BillSourceQuery {
  kind: "tenders" | "projects";
  page?: number;
  limit?: number;
  search?: string;
}

export interface BillPreparationItem {
  id: string;
  itemCode: string | null;
  description: string;
  unit: string;
  contractQty: string;
  unitRate: string;
  previousQty: string;
  pendingQty: string;
  remainingQty: string;
}

export interface BillPreparation {
  work: { id: string; workName: string; status: CmsWorkStatus };
  contracts: { id: string; contractNo: string; status: ContractStatus; currency: string; currentContractValue: string; retentionPct: string | null }[];
  items: BillPreparationItem[];
  ready: boolean;
  reason: string | null;
}

// Deliberately excludes purchasing prices, sourcing charges and internal profit.
export interface BillCostingReferenceItem {
  id: string;
  description: string;
  unit: string;
  quantity: string;
}
