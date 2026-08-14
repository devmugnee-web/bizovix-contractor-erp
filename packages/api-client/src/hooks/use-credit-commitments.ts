import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateCreditCommitmentInput,
  CreditCommitmentCharge,
  CreditCommitmentPendingQuery,
  PendingCreditCommitmentTender,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function usePendingCreditCommitmentTenders(query: CreditCommitmentPendingQuery) {
  return useQuery({
    queryKey: queryKeys.creditCommitmentPending(query),
    queryFn: () => apiRequestPaginated<PendingCreditCommitmentTender>("/credit-commitments/pending", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useCreditCommitments(query: CreditCommitmentPendingQuery = {}) {
  return useQuery({
    queryKey: queryKeys.creditCommitments(query),
    queryFn: () => apiRequestPaginated<CreditCommitmentCharge>("/credit-commitments", { params: { ...query } }),
  });
}

export function useCreditCommitment(id: string) {
  return useQuery({
    queryKey: queryKeys.creditCommitment(id),
    queryFn: () => apiRequest<CreditCommitmentCharge>(`/credit-commitments/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateCreditCommitmentCharge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCreditCommitmentInput) =>
      apiRequest<CreditCommitmentCharge>("/credit-commitments", { method: "POST", body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["credit-commitments"] }),
  });
}
