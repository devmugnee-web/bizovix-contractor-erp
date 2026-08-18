import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GrnQuery, GrnRecord, GrnStats, SaveGrnInput } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useGoodsReceipts(query: GrnQuery) {
  return useQuery({
    queryKey: queryKeys.grns(query),
    queryFn: () => apiRequestPaginated<GrnRecord>("/grns", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useGoodsReceipt(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.grn(id ?? ""),
    queryFn: () => apiRequest<GrnRecord>(`/grns/${id}`),
    enabled: !!id,
  });
}

export function useGoodsReceiptStats() {
  return useQuery({
    queryKey: queryKeys.grnStats,
    queryFn: () => apiRequest<GrnStats>("/grns/stats"),
  });
}

/** Receiving goods advances the PO's received quantities and status, so PO caches go too. */
export function useCreateGoodsReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveGrnInput) => apiRequest<GrnRecord>("/grns", { method: "POST", body: payload }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["grns"] });
      void queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}
