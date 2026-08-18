import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PurchaseRequisitionQuery, PurchaseRequisitionRecord, PurchaseRequisitionStats, SavePurchaseRequisitionInput } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function usePurchaseRequisitions(query: PurchaseRequisitionQuery) {
  return useQuery({
    queryKey: queryKeys.purchaseRequisitions(query),
    queryFn: () => apiRequestPaginated<PurchaseRequisitionRecord>("/purchase-requisitions", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function usePurchaseRequisition(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.purchaseRequisition(id ?? ""),
    queryFn: () => apiRequest<PurchaseRequisitionRecord>(`/purchase-requisitions/${id}`),
    enabled: !!id,
  });
}

export function usePurchaseRequisitionStats() {
  return useQuery({
    queryKey: queryKeys.purchaseRequisitionStats,
    queryFn: () => apiRequest<PurchaseRequisitionStats>("/purchase-requisitions/stats"),
  });
}

function useInvalidatePurchaseRequisitions() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["purchase-requisitions"] });
}

export function useCreatePurchaseRequisition() {
  const invalidate = useInvalidatePurchaseRequisitions();
  return useMutation({
    mutationFn: (payload: SavePurchaseRequisitionInput) => apiRequest<PurchaseRequisitionRecord>("/purchase-requisitions", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdatePurchaseRequisition() {
  const invalidate = useInvalidatePurchaseRequisitions();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SavePurchaseRequisitionInput }) =>
      apiRequest<PurchaseRequisitionRecord>(`/purchase-requisitions/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

export function useSubmitPurchaseRequisition() {
  const invalidate = useInvalidatePurchaseRequisitions();
  return useMutation({
    mutationFn: (id: string) => apiRequest<PurchaseRequisitionRecord>(`/purchase-requisitions/${id}/submit`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useApprovePurchaseRequisition() {
  const invalidate = useInvalidatePurchaseRequisitions();
  return useMutation({
    mutationFn: (id: string) => apiRequest<PurchaseRequisitionRecord>(`/purchase-requisitions/${id}/approve`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useRejectPurchaseRequisition() {
  const invalidate = useInvalidatePurchaseRequisitions();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest<PurchaseRequisitionRecord>(`/purchase-requisitions/${id}/reject`, { method: "POST", body: { reason } }),
    onSuccess: invalidate,
  });
}

export function useCancelPurchaseRequisition() {
  const invalidate = useInvalidatePurchaseRequisitions();
  return useMutation({
    mutationFn: (id: string) => apiRequest<PurchaseRequisitionRecord>(`/purchase-requisitions/${id}/cancel`, { method: "POST" }),
    onSuccess: invalidate,
  });
}
