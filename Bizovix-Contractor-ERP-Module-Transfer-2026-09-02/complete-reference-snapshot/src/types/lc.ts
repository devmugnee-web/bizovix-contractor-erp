export type LcStatus =
  | "DRAFT"
  | "ACTIVE"
  | "COSTING_PENDING"
  | "ALLOCATION_PENDING"
  | "READY_TO_FINALIZE"
  | "FINALIZED"
  | "CLOSED"
  | "CANCELLED";

export type LcCostCategory =
  | "LC_BANKING"
  | "ORIGIN"
  | "FREIGHT"
  | "INSURANCE"
  | "CUSTOMS"
  | "TAX"
  | "CNF"
  | "PORT"
  | "DESTINATION_TRANSPORT"
  | "LOCAL"
  | "OTHER";

export type LcAllocationBasis = "PURCHASE_VALUE" | "USD_VALUE" | "QUANTITY" | "WEIGHT" | "CBM" | "EQUAL";
export type LcAllocationMode = "AUTO" | "MANUAL_AMOUNT" | "MANUAL_PERCENTAGE" | "HYBRID" | "DIRECT_PRODUCT";
export type LcProfitMode = "PERCENTAGE" | "FIXED";

export interface LcProfitRowInput {
  lcItemId: string;
  profitMode: LcProfitMode;
  profitValue: number;
}

export interface LcListItem {
  id: string;
  lcNumber: string;
  lcDate: string;
  supplierName: string;
  supplierCountry: string | null;
  currency: string;
  exchangeRate: number;
  status: LcStatus;
  itemCount: number;
  costPostingCount: number;
  purchaseCost: number;
  importCost: number;
  landedCost: number;
  landedCostStatus: "DRAFT" | "FINALIZED";
}

export interface LcDashboard {
  activeLc: number;
  totalLcValue: number;
  goodsInTransit: number;
  pendingCustoms: number;
  pendingGrn: number;
  pendingCosting: number;
  pendingAllocation: number;
  paymentDueLc: number;
  totalPaymentDue: number;
  readyToFinalize: number;
  finalizedLc: number;
  totalImportCost: number;
  recentLcs: LcListItem[];
}

export interface LcPaymentAllocation {
  accountId: string;
  ledger?: string;
  amount: number;
  reference?: string;
}

export interface LcItemRecord {
  id: string;
  inventoryItemId: string | null;
  productName: string;
  description: string | null;
  unit: string;
  quantity: number;
  usdUnitPrice: number;
  exchangeRate: number;
  calculatedBdtUnitPrice: number;
  acceptedBdtUnitPrice: number | null;
  effectiveBdtUnitPrice: number;
  totalPurchaseCostBdt: number;
  weight: number | null;
  cbm: number | null;
  hsCode: string | null;
  receivedQuantity: number;
  landedCostAmount: number | null;
  landedCostPerUnit: number | null;
  profitMode: LcProfitMode | null;
  profitValue: number | null;
  inventoryPosting: {
    id: string;
    warehouseId: string;
    warehouseName: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    postedAt: string;
  } | null;
}

export interface PostLcInventoryInput {
  items: Array<{ lcItemId: string; warehouseId: string; inventoryItemId?: string; postingType: "EXISTING" | "NEW" | "ONE_TIME" }>;
}

export interface UpdateLcInventoryPostingInput {
  items: Array<{ lcItemId: string; warehouseId: string; inventoryItemId: string }>;
}

export interface LcShipmentRecord {
  id: string;
  transportMode: string | null;
  shipmentNumber: string | null;
  blAwbNumber: string | null;
  etd: string | null;
  eta: string | null;
  containerNumber: string | null;
  forwarderName: string | null;
  shippingLine: string | null;
  remarks: string | null;
  createdAt: string;
}

export interface LcAllocationRecord {
  id: string;
  lcItemId: string;
  basisValue: number;
  basisPercentage: number;
  autoSuggestedAmount: number;
  manualAmount: number | null;
  finalAmount: number;
  isDirect: boolean;
  isOverridden: boolean;
  overrideReason: string | null;
}

export interface LcCostEntryRecord {
  id: string;
  costHeadId: string;
  costHeadName: string;
  category: LcCostCategory;
  shipmentId: string | null;
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string;
  foreignAmount: number | null;
  exchangeRate: number | null;
  bdtAmount: number;
  allocationMode: LcAllocationMode;
  allocationBasis: LcAllocationBasis | null;
  includeInLandedCost: boolean;
  attachmentUrl: string | null;
  attachmentName: string | null;
  remarks: string | null;
  paymentMethod: "CREDIT" | "CASH_BANK_MFS" | null;
  creditPayeeName: string | null;
  paymentAllocations: LcPaymentAllocation[];
  paymentGlVoucherId: string | null;
  isLocked: boolean;
  createdAt: string;
  allocatedTotal: number;
  remainingAmount: number;
  isFullyAllocated: boolean;
  allocations: LcAllocationRecord[];
}

export interface LcGrnItemRecord {
  id: string;
  lcItemId: string;
  expectedQuantity: number;
  receivedQuantity: number;
  shortQuantity: number;
  excessQuantity: number;
  damagedQuantity: number;
  rejectedQuantity: number;
}

export interface LcGrnRecord {
  id: string;
  grnNumber: string;
  receivedDate: string;
  warehouseId: string | null;
  warehouseName: string | null;
  remarks: string | null;
  createdAt: string;
  items: LcGrnItemRecord[];
}

export interface LcStatusHistoryRecord {
  id: string;
  fromStatus: LcStatus | null;
  toStatus: LcStatus;
  reason: string | null;
  changedAt: string;
}

export interface LcLandedCostItemRecord {
  lcItemId: string;
  purchaseCost: number;
  lcBankingCost: number;
  originCost: number;
  freightCost: number;
  insuranceCost: number;
  customsCost: number;
  taxCost: number;
  cnfCost: number;
  portCost: number;
  destinationTransportCost: number;
  localCost: number;
  otherCost: number;
  totalLandedCost: number;
  receivedQuantity: number;
  unitLandedCost: number;
  profitMode: LcProfitMode | null;
  profitValue: number;
  sellingPricePerUnit: number;
  sellingPriceTotal: number;
}

export interface LcLandedCostRecord {
  id: string;
  status: "DRAFT" | "FINALIZED";
  purchaseCostTotal: number;
  importCostTotal: number;
  landedCostTotal: number;
  allocationDifference: number;
  finalizedAt: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  items: LcLandedCostItemRecord[];
}

export interface LcDetail {
  id: string;
  workspaceId: string;
  lcNumber: string;
  lcDate: string;
  supplierId: string | null;
  supplierName: string;
  supplierCountry: string | null;
  purchaseOrderRef: string | null;
  piReference: string | null;
  bankName: string | null;
  bankBranch: string | null;
  lcType: string | null;
  currency: string;
  exchangeRate: number;
  incoterm: string | null;
  originCountry: string | null;
  originPort: string | null;
  destinationPort: string | null;
  destinationWarehouseId: string | null;
  destinationWarehouseName: string | null;
  lastShipmentDate: string | null;
  expiryDate: string | null;
  remarks: string | null;
  purchasePaymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  purchasePaidAmount: number;
  purchasePayableAmount: number;
  paymentReference: string | null;
  paymentAllocations: LcPaymentAllocation[];
  status: LcStatus;
  createdAt: string;
  items: LcItemRecord[];
  shipments: LcShipmentRecord[];
  costEntries: LcCostEntryRecord[];
  grns: LcGrnRecord[];
  statusHistory: LcStatusHistoryRecord[];
  purchaseCostTotal: number;
  importCostTotal: number;
  landedCostTotalPreview: number;
  landedCost: LcLandedCostRecord | null;
}

export interface LcCostHeadRecord {
  id: string;
  name: string;
  code: string;
  category: LcCostCategory;
  defaultCurrency: string;
  defaultAllocationMethod: LcAllocationBasis;
  fallbackAllocationMethod: LcAllocationBasis | null;
  recommendedAllocationMode: LcAllocationMode | null;
  includeInLandedCost: boolean;
  manualOverrideAllowed: boolean;
  glAccountId: string | null;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
}

export interface CreateLcItemInput {
  inventoryItemId?: string;
  productName: string;
  description?: string;
  unit?: string;
  quantity: number;
  usdUnitPrice: number;
  acceptedBdtUnitPrice?: number;
  weight?: number;
  cbm?: number;
  hsCode?: string;
}

export interface CreateLcInput {
  workspaceId: string;
  lcNumber: string;
  lcDate: string;
  supplierId?: string;
  supplierName: string;
  supplierCountry?: string;
  purchaseOrderRef?: string;
  piReference?: string;
  bankName?: string;
  bankBranch?: string;
  lcType?: string;
  currency?: string;
  exchangeRate: number;
  incoterm?: string;
  originCountry?: string;
  originPort?: string;
  destinationPort?: string;
  destinationWarehouseId?: string;
  lastShipmentDate?: string;
  expiryDate?: string;
  remarks?: string;
  purchasePaymentStatus?: "UNPAID" | "PARTIAL" | "PAID";
  purchasePaidAmount?: number;
  paymentReference?: string;
  paymentAllocations?: LcPaymentAllocation[];
  items: CreateLcItemInput[];
}

export type UpdateLcInput = Partial<Omit<CreateLcInput, "workspaceId" | "items">> & {
  /** Full replace of the product list — only accepted while no GRN exists yet for this LC. */
  items?: CreateLcItemInput[];
};

export interface CreateLcShipmentInput {
  transportMode?: "SEA" | "AIR" | "ROAD" | "RAIL" | "COURIER" | "MULTIMODAL";
  shipmentNumber?: string;
  blAwbNumber?: string;
  etd?: string;
  eta?: string;
  containerNumber?: string;
  forwarderName?: string;
  shippingLine?: string;
  remarks?: string;
}

export interface CreateLcCostEntryInput {
  costHeadId: string;
  shipmentId?: string;
  vendorName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  currency?: string;
  foreignAmount?: number;
  exchangeRate?: number;
  bdtAmount?: number;
  allocationMode?: LcAllocationMode;
  allocationBasis?: LcAllocationBasis;
  includeInLandedCost?: boolean;
  attachmentUrl?: string;
  attachmentName?: string;
  remarks?: string;
  paymentMethod: "CREDIT" | "CASH_BANK_MFS";
  creditPayeeName?: string;
  paymentAllocations?: Array<{ accountId: string; amount: number; reference?: string }>;
}

export type UpdateLcCostEntryInput = Partial<Omit<CreateLcCostEntryInput, "costHeadId">>;

export interface AllocationRowInput {
  lcItemId: string;
  manualAmount?: number;
  manualPercentage?: number;
  overrideReason?: string;
}

export interface SaveAllocationInput {
  allocationMode: LcAllocationMode;
  allocationBasis?: LcAllocationBasis;
  rows: AllocationRowInput[];
}

export interface AllocationPreviewRow {
  lcItemId: string;
  productName: string;
  basisValue: number;
  basisPercentage: number;
  autoSuggestedAmount: number;
  manualAmount: number | null;
  finalAmount: number;
}

export interface AllocationPreview {
  costEntryId: string;
  bdtAmount: number;
  allocationMode: LcAllocationMode;
  allocationBasis: LcAllocationBasis;
  rows: AllocationPreviewRow[];
}

export interface CreateLcGrnItemInput {
  lcItemId: string;
  receivedQuantity: number;
  damagedQuantity?: number;
  rejectedQuantity?: number;
}

export interface CreateLcGrnInput {
  grnNumber?: string;
  receivedDate: string;
  warehouseId?: string;
  remarks?: string;
  items: CreateLcGrnItemInput[];
}

export interface CreateLcCostHeadInput {
  workspaceId: string;
  name: string;
  code?: string;
  category: LcCostCategory;
  defaultCurrency?: string;
  defaultAllocationMethod?: LcAllocationBasis;
  fallbackAllocationMethod?: LcAllocationBasis;
  includeInLandedCost?: boolean;
  manualOverrideAllowed?: boolean;
}

export type UpdateLcCostHeadInput = Partial<Omit<CreateLcCostHeadInput, "workspaceId" | "category">> & { isActive?: boolean };

export interface LcLandedCostPreview {
  purchaseCostTotal: number;
  importCostTotal: number;
  landedCostTotal: number;
  allocationDifference: number;
  items: LcLandedCostItemRecord[];
}
