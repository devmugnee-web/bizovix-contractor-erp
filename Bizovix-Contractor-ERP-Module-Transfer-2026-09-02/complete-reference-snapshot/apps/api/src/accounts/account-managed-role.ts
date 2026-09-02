export const ACCOUNT_MANAGED_ROLE = {
  LC_GOODS_IN_TRANSIT: "LC_GOODS_IN_TRANSIT",
  LC_IMPORT_COST_PAYABLE: "LC_IMPORT_COST_PAYABLE",
  FIXED_ASSET_ACCUMULATED_DEPRECIATION: "FIXED_ASSET_ACCUMULATED_DEPRECIATION",
  FIXED_ASSET_DEPRECIATION_EXPENSE: "FIXED_ASSET_DEPRECIATION_EXPENSE",
} as const;

export function fixedAssetCategoryNodeRole(categoryId: string) {
  return `FIXED_ASSET_CATEGORY:${categoryId}:ASSET_NODE`;
}

export function fixedAssetCategoryAccumulatedDepreciationRole(categoryId: string) {
  return `FIXED_ASSET_CATEGORY:${categoryId}:ACCUMULATED_DEPRECIATION`;
}

export function fixedAssetCategoryDepreciationExpenseRole(categoryId: string) {
  return `FIXED_ASSET_CATEGORY:${categoryId}:DEPRECIATION_EXPENSE`;
}
