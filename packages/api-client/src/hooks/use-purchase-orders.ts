import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PurchaseOrderQuery, PurchaseOrderRecord, PurchaseOrderStats, SavePurchaseOrderInput } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function usePurchaseOrders(query: PurchaseOrderQuery) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders(query),
    queryFn: () => apiRequestPaginated<PurchaseOrderRecord>("/purchase-orders", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.purchaseOrder(id ?? ""),
    queryFn: () => apiRequest<PurchaseOrderRecord>(`/purchase-orders/${id}`),
    enabled: !!id,
  });
}

export function usePurchaseOrderStats() {
  return useQuery({
    queryKey: queryKeys.purchaseOrderStats,
    queryFn: () => apiRequest<PurchaseOrderStats>("/purchase-orders/stats"),
  });
}

/** Raising a PO consumes its Comparative Statement, so CS caches are invalidated alongside. */
function useInvalidatePurchaseOrders() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["comparative-statements"] });
  };
}

export function useCreatePurchaseOrder() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: (payload: SavePurchaseOrderInput) => apiRequest<PurchaseOrderRecord>("/purchase-orders", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdatePurchaseOrder() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SavePurchaseOrderInput }) =>
      apiRequest<PurchaseOrderRecord>(`/purchase-orders/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

export function useApprovePurchaseOrder() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: (id: string) => apiRequest<PurchaseOrderRecord>(`/purchase-orders/${id}/approve`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useIssuePurchaseOrder() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: (id: string) => apiRequest<PurchaseOrderRecord>(`/purchase-orders/${id}/issue`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useCancelPurchaseOrder() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: (id: string) => apiRequest<PurchaseOrderRecord>(`/purchase-orders/${id}/cancel`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useClosePurchaseOrder() {
  const invalidate = useInvalidatePurchaseOrders();
  return useMutation({
    mutationFn: (id: string) => apiRequest<PurchaseOrderRecord>(`/purchase-orders/${id}/close`, { method: "POST" }),
    onSuccess: invalidate,
  });
}
