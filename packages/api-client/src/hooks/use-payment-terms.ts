import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaymentTermRecord, SavePaymentTermInput } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function usePaymentTerms(options: { includeLocal?: boolean } = {}) {
  const includeLocal = options.includeLocal === true;
  return useQuery({
    queryKey: [...queryKeys.paymentTerms, includeLocal ? "with-local-drafts" : "accepted"],
    queryFn: async () => {
      const records = await apiRequest<PaymentTermRecord[]>("/payment-terms");
      return includeLocal ? records : records.flatMap((record) =>
        !record.syncStatus || record.syncStatus === "SYNCED" ? [record] : record.cloudRecord ? [record.cloudRecord] : [],
      );
    },
  });
}

function useInvalidatePaymentTerms() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["payment-terms"] }),
    queryClient.invalidateQueries({ queryKey: ["desktop-sync-status"] }),
  ]);
}

export function useCreatePaymentTerm() {
  const invalidate = useInvalidatePaymentTerms();
  return useMutation({
    mutationFn: (payload: SavePaymentTermInput) => apiRequest<PaymentTermRecord>("/payment-terms", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdatePaymentTerm() {
  const invalidate = useInvalidatePaymentTerms();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SavePaymentTermInput }) =>
      apiRequest<PaymentTermRecord>(`/payment-terms/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}
