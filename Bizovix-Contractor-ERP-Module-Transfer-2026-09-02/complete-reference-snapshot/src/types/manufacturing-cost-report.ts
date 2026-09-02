export type ManufacturingActualCostType =
  "LABOUR" | "MACHINE" | "OVERHEAD" | "SUBCONTRACT" | "OTHER";
export type ManufacturingCostDriverBasis =
  | "FLAT"
  | "OUTPUT_QUANTITY"
  | "LABOUR_HOURS"
  | "MACHINE_HOURS"
  | "MATERIAL_COST_PERCENT"
  | "PRIME_COST_PERCENT";

export interface ManufacturingLedgerReference {
  id: string;
  code: string;
  name: string;
  nature: string;
  isSystem: boolean;
}

export interface ManufacturingCostConfiguration {
  workspaceId: string;
  currency: string;
  wipInventoryAccountId: string | null;
  finishedGoodsInventoryAccountId: string | null;
  manufacturingVarianceAccountId: string | null;
  ledgers: ManufacturingLedgerReference[];
  accountSafety: string;
}

export interface ManufacturingCostDriverRecord {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  costType: ManufacturingActualCostType;
  basis: ManufacturingCostDriverBasis;
  unit: string | null;
  rate: number;
  clearingAccountId: string;
  clearingAccount: ManufacturingLedgerReference | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManufacturingStandardCostLineInput {
  sequence: number;
  costType:
    | "MATERIAL"
    | "LABOUR"
    | "MACHINE"
    | "OVERHEAD"
    | "PACKAGING"
    | "SUBCONTRACT"
    | "OTHER";
  description: string;
  quantity?: number;
  rate?: number;
  amount?: number;
  costDriverId?: string | null;
  clearingAccountId?: string | null;
}

export interface ManufacturingStandardCostVersionRecord {
  id: string;
  workspaceId: string;
  inventoryItemId: string;
  inventoryItem: {
    id: string;
    itemCode: string;
    itemName: string;
    unit: string;
  } | null;
  versionNumber: number;
  status: "DRAFT" | "APPROVED" | "RETIRED";
  currency: string;
  totalUnitCost: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  notes: string | null;
  approvedAt: string | null;
  createdAt: string;
  lines: Array<
    ManufacturingStandardCostLineInput & {
      id: string;
      quantity: number;
      rate: number;
      amount: number;
    }
  >;
}

export interface ManufacturingActualCostPostingRecord {
  id: string;
  workspaceId: string;
  orderId: string;
  costDriverId: string;
  driver: { id: string; code: string; name: string } | null;
  costType: ManufacturingActualCostType;
  driverBasis: ManufacturingCostDriverBasis;
  description: string;
  basisQuantity: number;
  rate: number;
  amount: number;
  wipAccountId: string;
  clearingAccountId: string;
  voucherEntryId: string;
  finalizedSnapshotId: string | null;
  transactionDate: string;
  referenceNo: string | null;
  note: string | null;
  idempotencyKey: string;
  createdAt: string;
}

export interface ManufacturingCostSnapshotRecord {
  id: string;
  versionNumber: number;
  status: "DRAFT" | "PROVISIONAL" | "FINALIZED" | "VOIDED";
  currency: string;
  materialCost: number;
  labourCost: number;
  machineCost: number;
  overheadCost: number;
  packagingCost: number;
  subcontractCost: number;
  otherCost: number;
  scrapRecovery: number;
  varianceAmount: number;
  totalCost: number;
  completedQuantity: number;
  unitCost: number;
  voucherEntryId: string | null;
  finalizedAt: string | null;
}

export interface ManufacturingOrderCostingRecord {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    plannedQuantity: number;
    completedQuantity: number;
    unit: string;
    finishedProduct: { id: string; code: string; name: string };
  };
  actualPostings: ManufacturingActualCostPostingRecord[];
  standardCosts: ManufacturingStandardCostVersionRecord[];
  snapshots: ManufacturingCostSnapshotRecord[];
}

export interface ManufacturingReportColumn {
  key: string;
  label: string;
  type?: "date" | "money" | "quantity" | string;
}

export interface ManufacturingReportResult {
  report: string;
  columns: ManufacturingReportColumn[];
  rows: Array<Record<string, string | number | boolean | null>>;
  totals: Record<string, number>;
  filters: Record<string, string | null>;
  generatedAt: string;
  exportReady: boolean;
  truncated: boolean;
  rowCount: number;
}

export interface ManufacturingReportQuery {
  workspaceId: string;
  from?: string;
  to?: string;
  orderId?: string;
  inventoryItemId?: string;
  warehouseId?: string;
  status?: string;
  lotNumber?: string;
  serialNumber?: string;
  search?: string;
  limit?: number;
}
