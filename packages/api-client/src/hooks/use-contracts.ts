import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ContractDetail,
  ContractQuery,
  ContractRecord,
  ContractStats,
  CreateContractInput,
  UpdateContractInput,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useContracts(query: ContractQuery) {
  return useQuery({
    queryKey: queryKeys.contracts(query),
    queryFn: () => apiRequestPaginated<ContractRecord>("/contracts", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useContract(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.contract(id ?? ""),
    queryFn: () => apiRequest<ContractDetail>(`/contracts/${id}`),
    enabled: !!id,
  });
}

export function useContractStats() {
  return useQuery({ queryKey: queryKeys.contractStats, queryFn: () => apiRequest<ContractStats>("/contracts/stats") });
}

export function useContractCategories() {
  return useQuery({
    queryKey: queryKeys.contractCategories,
    queryFn: () => apiRequest<string[]>("/contracts/categories"),
  });
}

function useInvalidateContracts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["contracts"] });
}

export function useCreateContract() {
  const invalidate = useInvalidateContracts();
  return useMutation({
    mutationFn: (payload: CreateContractInput) =>
      apiRequest<ContractRecord>("/contracts", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateContract() {
  const invalidate = useInvalidateContracts();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateContractInput }) =>
      apiRequest<ContractRecord>(`/contracts/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

export function useActivateContract() {
  const invalidate = useInvalidateContracts();
  return useMutation({
    mutationFn: (id: string) => apiRequest<ContractRecord>(`/contracts/${id}/activate`, { method: "POST" }),
    onSuccess: invalidate,
  });
}
