export interface AssetCategoryRecord { id: string; name: string; code: string; isActive: boolean; defaultUsefulLifeMonths: number | null; defaultSalvageValue: string | null; _count?: { assets: number }; }
export interface FixedAssetRecord {
  id: string; assetCode: string; name: string; status: "ACTIVE" | "DISPOSED" | "FULLY_DEPRECIATED"; operationalStatus: string; condition: string;
  purchaseDate: string; capitalizedCost: string; salvageValue: string; usefulLifeMonths: number; accumulatedDepreciation: string; netBookValue: string;
  location: string | null; department: string | null; assetCategory: AssetCategoryRecord | null; supplier: { id: string; code: string; name: string } | null;
  depreciationEntries: Array<{ id: string; periodStart: string; periodEnd: string; amount: string }>;
}
export interface AssetDashboard { totalAssets: number; activeAssets: number; fullyDepreciatedAssets: number; capitalizedCost: string; accumulatedDepreciation: string; netBookValue: string; }
export interface FixedAssetQuery { page?: number; limit?: number; search?: string; categoryId?: string; status?: string; }
export interface SaveAssetCategoryInput { name: string; code: string; parentId?: string; defaultUsefulLifeMonths?: number; defaultSalvageValue?: number; }
export interface SaveFixedAssetInput { name: string; categoryId: string; assetCode?: string; supplierId?: string; fundingMode: "CASH_BANK" | "CREDIT" | "OPENING_BALANCE"; fundingBankAccountId?: string; purchaseDate: string; purchaseCost: number; transportationCost?: number; installationCost?: number; importDuty?: number; registrationCost?: number; otherCapitalizedCost?: number; discountAmount?: number; salvageValue?: number; usefulLifeMonths: number; location?: string; department?: string; notes?: string; }
