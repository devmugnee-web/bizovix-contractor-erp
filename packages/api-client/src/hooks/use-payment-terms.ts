import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaymentTermRecord, SavePaymentTermInput } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function usePaymentTerms() {
  return useQuery({
    queryKey: queryKeys.paymentTerms,
    queryFn: () => apiRequest<PaymentTermRecord[]>("/payment-terms"),
  });
}

function useInvalidatePaymentTerms() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["payment-terms"] });
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
