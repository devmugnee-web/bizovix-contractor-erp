import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssetCategoryRecord, AssetDashboard, FixedAssetQuery, FixedAssetRecord, SaveAssetCategoryInput, SaveFixedAssetInput } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";

const key = ["fixed-assets"] as const;
const invalidate = (client: ReturnType<typeof useQueryClient>) => () => client.invalidateQueries({ queryKey: key });
export const useFixedAssets = (query: FixedAssetQuery = {}) => useQuery({ queryKey: [...key, "list", query], queryFn: () => apiRequestPaginated<FixedAssetRecord>("/fixed-assets", { params: { page: query.page, limit: query.limit, search: query.search, categoryId: query.categoryId, status: query.status } }), placeholderData: (previous) => previous });
export const useFixedAsset = (id?: string) => useQuery({ queryKey: [...key, id], queryFn: () => apiRequest<FixedAssetRecord>(`/fixed-assets/${id}`), enabled: Boolean(id) });
export const useAssetDashboard = () => useQuery({ queryKey: [...key, "dashboard"], queryFn: () => apiRequest<AssetDashboard>("/fixed-assets/dashboard") });
export const useAssetCategories = () => useQuery({ queryKey: [...key, "categories"], queryFn: () => apiRequest<AssetCategoryRecord[]>("/fixed-assets/categories") });
export function useCreateAssetCategory() { const client = useQueryClient(); return useMutation({ mutationFn: (body: SaveAssetCategoryInput) => apiRequest<AssetCategoryRecord>("/fixed-assets/categories", { method: "POST", body }), onSuccess: invalidate(client) }); }
export function useCreateFixedAsset() { const client = useQueryClient(); return useMutation({ mutationFn: (body: SaveFixedAssetInput) => apiRequest<FixedAssetRecord>("/fixed-assets", { method: "POST", body }), onSuccess: invalidate(client) }); }
export function useUpdateFixedAsset() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiRequest<FixedAssetRecord>(`/fixed-assets/${id}`, { method: "PATCH", body }), onSuccess: invalidate(client) }); }
export function usePostAssetDepreciation() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, periodStart, periodEnd }: { id: string; periodStart: string; periodEnd: string }) => apiRequest<FixedAssetRecord>(`/fixed-assets/${id}/depreciation`, { method: "POST", body: { periodStart, periodEnd } }), onSuccess: invalidate(client) }); }
