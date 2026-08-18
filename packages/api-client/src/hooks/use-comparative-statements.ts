import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ComparativeStatementItemComparisonRow,
  ComparativeStatementRecord,
  ComparativeStatementStats,
  SaveComparativeStatementInput,
  SelectSupplierInput,
} from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useComparativeStatements() {
  return useQuery({
    queryKey: queryKeys.comparativeStatements,
    queryFn: () => apiRequest<ComparativeStatementRecord[]>("/comparative-statements"),
  });
}

export function useComparativeStatement(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.comparativeStatement(id ?? ""),
    queryFn: () => apiRequest<ComparativeStatementRecord>(`/comparative-statements/${id}`),
    enabled: !!id,
  });
}

export function useComparativeStatementStats() {
  return useQuery({
    queryKey: queryKeys.comparativeStatementStats,
    queryFn: () => apiRequest<ComparativeStatementStats>("/comparative-statements/stats"),
  });
}

/** Per-RFQ-item supplier comparison, recomputed by the backend at read time. */
export function useComparativeStatementItemComparison(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.comparativeStatementItemComparison(id ?? ""),
    queryFn: () => apiRequest<ComparativeStatementItemComparisonRow[]>(`/comparative-statements/${id}/item-comparison`),
    enabled: !!id,
  });
}

/** Approving a CS awards its RFQ, so RFQ caches are invalidated alongside. */
function useInvalidateComparativeStatements() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["comparative-statements"] });
    void queryClient.invalidateQueries({ queryKey: ["rfqs"] });
  };
}

export function useCreateComparativeStatement() {
  const invalidate = useInvalidateComparativeStatements();
  return useMutation({
    mutationFn: (payload: SaveComparativeStatementInput) => apiRequest<ComparativeStatementRecord>("/comparative-statements", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useEvaluateComparativeStatement() {
  const invalidate = useInvalidateComparativeStatements();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveComparativeStatementInput }) =>
      apiRequest<ComparativeStatementRecord>(`/comparative-statements/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

/** Selection is always an explicit, authorized act — the backend never auto-awards the
 * cheapest offer, and demands decision notes whenever the pick is not the lowest evaluated. */
export function useSelectComparativeStatementSupplier() {
  const invalidate = useInvalidateComparativeStatements();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SelectSupplierInput }) =>
      apiRequest<ComparativeStatementRecord>(`/comparative-statements/${id}/select-supplier`, { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useApproveComparativeStatement() {
  const invalidate = useInvalidateComparativeStatements();
  return useMutation({
    mutationFn: (id: string) => apiRequest<ComparativeStatementRecord>(`/comparative-statements/${id}/approve`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useCancelComparativeStatement() {
  const invalidate = useInvalidateComparativeStatements();
  return useMutation({
    mutationFn: (id: string) => apiRequest<ComparativeStatementRecord>(`/comparative-statements/${id}/cancel`, { method: "POST" }),
    onSuccess: invalidate,
  });
}
