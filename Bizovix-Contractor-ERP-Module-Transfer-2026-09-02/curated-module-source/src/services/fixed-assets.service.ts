import { apiRequest } from "@/services/api-client";
import type {
  AssetCategoryRecord,
  CreateAssetCategoryInput,
  CreateFixedAssetInput,
  DepreciationPreview,
  FixedAssetRecord,
  PostDepreciationInput,
  UpdateAssetCategoryInput,
  UpdateFixedAssetInput,
} from "@/types/fixed-assets";

export function getFixedAssets() {
  return apiRequest<FixedAssetRecord[]>("/fixed-assets");
}

export function createFixedAsset(input: CreateFixedAssetInput) {
  return apiRequest<FixedAssetRecord>("/fixed-assets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAssetCategories() {
  return apiRequest<AssetCategoryRecord[]>("/fixed-assets/categories");
}

export function createAssetCategory(input: CreateAssetCategoryInput) {
  return apiRequest<AssetCategoryRecord>("/fixed-assets/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAssetCategory(categoryId: string, input: UpdateAssetCategoryInput) {
  return apiRequest<AssetCategoryRecord>(`/fixed-assets/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteAssetCategory(categoryId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/fixed-assets/categories/${categoryId}`, {
    method: "DELETE",
  });
}

export function bootstrapChartOfAccounts() {
  return apiRequest<{
    status: string;
    message: string;
    totalCreated: number;
    breakdown: Record<string, number>;
    protectedCount: number;
  }>(`/fixed-assets/bootstrap-coa`, {
    method: "POST",
  });
}

export function previewDepreciation(assetId: string) {
  return apiRequest<DepreciationPreview>(`/fixed-assets/${assetId}/depreciation/preview`);
}

export function updateFixedAsset(assetId: string, input: UpdateFixedAssetInput) {
  return apiRequest<FixedAssetRecord>(`/fixed-assets/${assetId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteFixedAsset(assetId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/fixed-assets/${assetId}`, {
    method: "DELETE",
  });
}

export function postDepreciation(assetId: string, input: PostDepreciationInput) {
  return apiRequest<FixedAssetRecord>(`/fixed-assets/${assetId}/depreciation`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
