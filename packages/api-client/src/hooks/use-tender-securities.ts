import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTenderSecurityInput,
  MarkTenderSecurityNotRequiredInput,
  PendingTenderSecurity,
  TenderSecurity,
  TenderSecurityPendingQuery,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function usePendingTenderSecurities(query: TenderSecurityPendingQuery) {
  return useQuery({
    queryKey: queryKeys.tenderSecurityPending(query),
    queryFn: () =>
      apiRequestPaginated<PendingTenderSecurity>("/tender-securities/pending", {
        params: { ...query },
      }),
    placeholderData: (previous) => previous,
  });
}

function useInvalidateTenderSecurities() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["tender-securities"] });
  };
}

export function useCreateTenderSecurity() {
  const invalidate = useInvalidateTenderSecurities();

  return useMutation({
    mutationFn: (payload: CreateTenderSecurityInput) =>
      apiRequest<TenderSecurity>("/tender-securities", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useMarkTenderSecurityNotRequired() {
  const invalidate = useInvalidateTenderSecurities();

  return useMutation({
    mutationFn: (payload: MarkTenderSecurityNotRequiredInput) =>
      apiRequest<{ count: number }>("/tender-securities/mark-not-required", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}
