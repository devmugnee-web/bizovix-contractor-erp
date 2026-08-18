import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SaveSupplierQuotationInput, SupplierQuotationQuery, SupplierQuotationRecord } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useSupplierQuotations(query: SupplierQuotationQuery) {
  return useQuery({
    queryKey: queryKeys.supplierQuotations(query),
    queryFn: () => apiRequest<SupplierQuotationRecord[]>("/supplier-quotations", { params: { ...query } }),
  });
}

export function useSupplierQuotation(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.supplierQuotation(id ?? ""),
    queryFn: () => apiRequest<SupplierQuotationRecord>(`/supplier-quotations/${id}`),
    enabled: !!id,
  });
}

/** A recorded quotation changes the RFQ's responded-supplier list, so RFQ caches go too. */
function useInvalidateSupplierQuotations() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["supplier-quotations"] });
    void queryClient.invalidateQueries({ queryKey: ["rfqs"] });
  };
}

export function useCreateSupplierQuotation() {
  const invalidate = useInvalidateSupplierQuotations();
  return useMutation({
    mutationFn: (payload: SaveSupplierQuotationInput) => apiRequest<SupplierQuotationRecord>("/supplier-quotations", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

/** The backend never mutates recorded figures in place — revising supersedes the prior
 * revision and returns a new one, which is why there is no plain "update" mutation. */
export function useReviseSupplierQuotation() {
  const invalidate = useInvalidateSupplierQuotations();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveSupplierQuotationInput }) =>
      apiRequest<SupplierQuotationRecord>(`/supplier-quotations/${id}/revise`, { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useWithdrawSupplierQuotation() {
  const invalidate = useInvalidateSupplierQuotations();
  return useMutation({
    mutationFn: (id: string) => apiRequest<SupplierQuotationRecord>(`/supplier-quotations/${id}/withdraw`, { method: "POST" }),
    onSuccess: invalidate,
  });
}
