import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RfqQuery, RfqRecord, RfqStats, SaveRfqInput } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useRfqs(query: RfqQuery) {
  return useQuery({
    queryKey: queryKeys.rfqs(query),
    queryFn: () => apiRequestPaginated<RfqRecord>("/rfqs", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useRfq(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.rfq(id ?? ""),
    queryFn: () => apiRequest<RfqRecord>(`/rfqs/${id}`),
    enabled: !!id,
  });
}

export function useRfqStats() {
  return useQuery({
    queryKey: queryKeys.rfqStats,
    queryFn: () => apiRequest<RfqStats>("/rfqs/stats"),
  });
}

/** RFQ creation flips its source PR to CONVERTED, so the PR caches are invalidated alongside. */
function useInvalidateRfqs() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["rfqs"] });
    void queryClient.invalidateQueries({ queryKey: ["purchase-requisitions"] });
  };
}

export function useCreateRfq() {
  const invalidate = useInvalidateRfqs();
  return useMutation({
    mutationFn: (payload: SaveRfqInput) => apiRequest<RfqRecord>("/rfqs", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateRfq() {
  const invalidate = useInvalidateRfqs();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveRfqInput }) => apiRequest<RfqRecord>(`/rfqs/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

export function useIssueRfq() {
  const invalidate = useInvalidateRfqs();
  return useMutation({
    mutationFn: (id: string) => apiRequest<RfqRecord>(`/rfqs/${id}/issue`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useCloseRfq() {
  const invalidate = useInvalidateRfqs();
  return useMutation({
    mutationFn: (id: string) => apiRequest<RfqRecord>(`/rfqs/${id}/close`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useCancelRfq() {
  const invalidate = useInvalidateRfqs();
  return useMutation({
    mutationFn: (id: string) => apiRequest<RfqRecord>(`/rfqs/${id}/cancel`, { method: "POST" }),
    onSuccess: invalidate,
  });
}
