import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SaveVariationOrderInput, VariationOrderRecord } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useVariationOrders(cmsWorkId?: string) {
  return useQuery({
    queryKey: queryKeys.variationOrders(cmsWorkId),
    queryFn: () => apiRequestPaginated<VariationOrderRecord>("/variation-orders", { params: cmsWorkId ? { cmsWorkId } : undefined }),
  });
}

export function useVariationOrder(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.variationOrder(id ?? ""),
    queryFn: () => apiRequest<VariationOrderRecord>(`/variation-orders/${id}`),
    enabled: !!id,
  });
}

function useInvalidateVariations() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["variation-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["cms-works"] }),
      queryClient.invalidateQueries({ queryKey: ["contracts"] }),
    ]);
}

export function useCreateVariationOrder() {
  const invalidate = useInvalidateVariations();
  return useMutation({
    mutationFn: (payload: SaveVariationOrderInput) => apiRequest<VariationOrderRecord>("/variation-orders", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateVariationOrder() {
  const invalidate = useInvalidateVariations();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveVariationOrderInput }) =>
      apiRequest<VariationOrderRecord>(`/variation-orders/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

export function useSubmitVariationOrder() {
  const invalidate = useInvalidateVariations();
  return useMutation({
    mutationFn: (id: string) => apiRequest<VariationOrderRecord>(`/variation-orders/${id}/submit`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useApproveVariationOrder() {
  const invalidate = useInvalidateVariations();
  return useMutation({
    mutationFn: ({ id, approvedAmount }: { id: string; approvedAmount?: number }) =>
      apiRequest<VariationOrderRecord>(`/variation-orders/${id}/approve`, { method: "POST", body: { approvedAmount } }),
    onSuccess: invalidate,
  });
}

export function useRejectVariationOrder() {
  const invalidate = useInvalidateVariations();
  return useMutation({
    mutationFn: (id: string) => apiRequest<VariationOrderRecord>(`/variation-orders/${id}/reject`, { method: "POST" }),
    onSuccess: invalidate,
  });
}
