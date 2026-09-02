export type AssetCondition = "NEW" | "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "DAMAGED";
export type AssetOperationalStatus = "AVAILABLE" | "ASSIGNED" | "ACTIVE" | "UNDER_MAINTENANCE" | "DAMAGED" | "LOST" | "RETIRED";
export type AssetAcquisitionType =
  | "DIRECT_PURCHASE"
  | "PURCHASE_ORDER"
  | "OPENING_ASSET"
  | "DONATION"
  | "TRANSFER_IN"
  | "INTERNALLY_CONSTRUCTED"
  | "OTHER";
export type FundingMode = "CASH_BANK" | "CREDIT";

export interface AssetCategoryRecord {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  defaultUsefulLifeMonths: number | null;
  defaultSalvageValue: number | null;
  defaultDepreciationMethod: "STRAIGHT_LINE";
  isActive: boolean;
  assetCount: number;
}

export interface CreateAssetCategoryInput {
  name: string;
  code?: string;
  parentId?: string;
  defaultUsefulLifeMonths?: number;
  defaultSalvageValue?: number;
  defaultDepreciationMethod?: "STRAIGHT_LINE";
}

export interface UpdateAssetCategoryInput {
  name?: string;
  defaultUsefulLifeMonths?: number;
  defaultSalvageValue?: number;
  defaultDepreciationMethod?: "STRAIGHT_LINE";
  isActive?: boolean;
}

export interface FixedAssetRecord {
  id: string;
  assetCode: string;
  name: string;
  category: string | null;
  categoryId: string | null;
  categoryName: string | null;
  location: string | null;
  department: string | null;
  assignedToName: string | null;
  brand: string | null;
  model: string | null;
  manufacturer: string | null;
  serialNumber: string | null;
  registrationNumber: string | null;
  condition: AssetCondition;
  operationalStatus: AssetOperationalStatus;
  acquisitionType: AssetAcquisitionType;
  supplierId: string | null;
  supplierName: string | null;
  notes: string | null;
  purchaseDate: string;
  purchaseCost: number;
  transportationCost: number;
  installationCost: number;
  importDuty: number;
  registrationCost: number;
  otherCapitalizedCost: number;
  discountAmount: number;
  capitalizedCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  depreciationMethod: "STRAIGHT_LINE";
  useManualDepreciation: boolean;
  manualDepreciationAmount: number | null;
  status: "ACTIVE" | "DISPOSED" | "FULLY_DEPRECIATED";
  disposalDate: string | null;
  disposalProceeds: number | null;
  assetLedgerId: string;
  assetLedgerCode: string;
  accumulatedDepreciation: number;
  netBookValue: number;
  periodsPosted: number;
  lastDepreciationDate: string | null;
  createdAt: string;
  depreciationHistory: Array<{
    periodStart: string;
    periodEnd: string;
    amount: number;
    voucherNumber: string;
  }>;
}

export interface CreateFixedAssetInput {
  workspaceId: string;
  name: string;
  category?: string;
  categoryId?: string;
  location?: string;
  department?: string;
  assignedToName?: string;
  brand?: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  registrationNumber?: string;
  condition?: AssetCondition;
  operationalStatus?: AssetOperationalStatus;
  acquisitionType?: AssetAcquisitionType;
  notes?: string;
  purchaseDate: string;
  purchaseCost: number;
  transportationCost?: number;
  installationCost?: number;
  importDuty?: number;
  registrationCost?: number;
  otherCapitalizedCost?: number;
  discountAmount?: number;
  salvageValue?: number;
  usefulLifeMonths: number;
  useManualDepreciation?: boolean;
  manualDepreciationAmount?: number | null;
  fundingMode?: FundingMode;
  fundingAccountId?: string;
  fundingSources?: Array<{ accountId: string; amount: number }>;
  supplierId?: string;
}

export interface DepreciationPreview {
  suggestedAmount: number;
  remaining: number;
  periodStart: string;
  fullyDepreciated: boolean;
}

export interface UpdateFixedAssetInput {
  name?: string;
  categoryId?: string | null;
  location?: string;
  department?: string;
  assignedToName?: string;
  brand?: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  registrationNumber?: string;
  condition?: AssetCondition;
  operationalStatus?: AssetOperationalStatus;
  notes?: string;
  salvageValue?: number;
  usefulLifeMonths?: number;
  depreciationMethod?: "STRAIGHT_LINE";
  useManualDepreciation?: boolean;
  manualDepreciationAmount?: number | null;
}

export interface PostDepreciationInput {
  workspaceId: string;
  periodEnd: string;
  customAmount?: number;
}
