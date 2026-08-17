import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateDeductionConfigInput, DeductionConfigRecord, UpdateDeductionConfigInput } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useDeductionConfigs(type?: string) {
  return useQuery({
    queryKey: queryKeys.deductionConfigs(type),
    queryFn: () => apiRequest<DeductionConfigRecord[]>("/settings/deduction-configs", { params: type ? { type } : undefined }),
  });
}

function useInvalidateDeductionConfigs() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["deduction-configs"] });
}

export function useCreateDeductionConfig() {
  const invalidate = useInvalidateDeductionConfigs();
  return useMutation({
    mutationFn: (payload: CreateDeductionConfigInput) =>
      apiRequest<DeductionConfigRecord>("/settings/deduction-configs", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateDeductionConfig() {
  const invalidate = useInvalidateDeductionConfigs();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateDeductionConfigInput }) =>
      apiRequest<DeductionConfigRecord>(`/settings/deduction-configs/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}
