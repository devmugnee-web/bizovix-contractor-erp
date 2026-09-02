"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest, ApiError } from "@/services/api-client";
import {
  createAssetCategory,
  createFixedAsset,
  deleteAssetCategory,
  deleteFixedAsset,
  getAssetCategories,
  getFixedAssets,
  postDepreciation,
  previewDepreciation,
  updateAssetCategory,
  updateFixedAsset,
} from "@/services/fixed-assets.service";
import type { CreateAssetCategoryInput, CreateFixedAssetInput, PostDepreciationInput, UpdateAssetCategoryInput, UpdateFixedAssetInput } from "@/types/fixed-assets";

const listKey = ["fixed-assets", "list"] as const;
const categoriesKey = ["fixed-assets", "categories"] as const;

function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
    return false;
  }
  return failureCount < 2;
}

export function useFixedAssetsQuery(enabled: boolean) {
  return useQuery({
    queryKey: listKey,
    queryFn: getFixedAssets,
    enabled,
    retry: shouldRetry,
  });
}

export function useAssetCategoriesQuery(enabled: boolean) {
  return useQuery({
    queryKey: categoriesKey,
    queryFn: getAssetCategories,
    enabled,
    retry: shouldRetry,
  });
}

export function useAssetSuppliersQuery(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["fixed-assets", "suppliers", workspaceId],
    queryFn: () => apiRequest<Array<{ id: string; name: string }>>(`/parties?workspaceId=${encodeURIComponent(workspaceId!)}&type=supplier`),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useDepreciationPreviewQuery(assetId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["fixed-assets", "depreciation-preview", assetId],
    queryFn: () => previewDepreciation(assetId!),
    enabled: Boolean(assetId) && enabled,
    retry: shouldRetry,
  });
}

function useInvalidateFixedAssets() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
    // Both a new asset (opening balance) and a depreciation posting create real
    // posted vouchers — refresh Chart of Accounts, reports, and dashboard too.
    void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "fixed-assets" });
  };
}

export function useCreateFixedAssetMutation() {
  const invalidate = useInvalidateFixedAssets();
  return useMutation({
    mutationFn: (input: CreateFixedAssetInput) => createFixedAsset(input),
    onSuccess: invalidate,
  });
}

export function useCreateAssetCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssetCategoryInput) => createAssetCategory(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: categoriesKey }),
  });
}

export function useUpdateAssetCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, input }: { categoryId: string; input: UpdateAssetCategoryInput }) => updateAssetCategory(categoryId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: categoriesKey }),
  });
}

export function useDeleteAssetCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => deleteAssetCategory(categoryId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: categoriesKey }),
  });
}

export function useUpdateFixedAssetMutation() {
  const invalidate = useInvalidateFixedAssets();
  return useMutation({
    mutationFn: ({ assetId, input }: { assetId: string; input: UpdateFixedAssetInput }) => updateFixedAsset(assetId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteFixedAssetMutation() {
  const invalidate = useInvalidateFixedAssets();
  return useMutation({
    mutationFn: (assetId: string) => deleteFixedAsset(assetId),
    onSuccess: invalidate,
  });
}

export function usePostDepreciationMutation() {
  const invalidate = useInvalidateFixedAssets();
  return useMutation({
    mutationFn: ({ assetId, input }: { assetId: string; input: PostDepreciationInput }) => postDepreciation(assetId, input),
    onSuccess: invalidate,
  });
}
