"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/services/api-client";
import {
  approveManufacturingSupplySuggestion,
  cancelManufacturingSupplySuggestion,
  convertManufacturingSupplySuggestion,
  createManufacturingSupplySuggestion,
  listManufacturingSupplySuggestions,
} from "@/services/manufacturing-supply.service";
import type {
  ApproveManufacturingSupplySuggestionInput,
  CancelManufacturingSupplySuggestionInput,
  ConvertManufacturingSupplySuggestionInput,
  CreateManufacturingSupplySuggestionInput,
  ManufacturingSupplySuggestionListQuery,
} from "@/types/manufacturing-supply";

export const manufacturingSupplyKeys = {
  all: ["manufacturing", "supply-suggestions"] as const,
  workspace: (workspaceId: string | undefined) =>
    ["manufacturing", "supply-suggestions", workspaceId] as const,
  list: (query: ManufacturingSupplySuggestionListQuery | null) =>
    ["manufacturing", "supply-suggestions", query?.workspaceId, query] as const,
};

function shouldRetry(failureCount: number, error: unknown) {
  if (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  ) {
    return false;
  }
  return failureCount < 2;
}

export function useManufacturingSupplySuggestionsQuery(
  query: ManufacturingSupplySuggestionListQuery | null,
) {
  return useQuery({
    queryKey: manufacturingSupplyKeys.list(query),
    queryFn: () => listManufacturingSupplySuggestions(query!),
    enabled: Boolean(query?.workspaceId),
    retry: shouldRetry,
  });
}

function useInvalidateSupplySuggestions() {
  const queryClient = useQueryClient();
  return (workspaceId: string) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: manufacturingSupplyKeys.workspace(workspaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: ["manufacturing", workspaceId, "dashboard"],
      }),
    ]);
}

export function useCreateManufacturingSupplySuggestionMutation() {
  const invalidate = useInvalidateSupplySuggestions();
  return useMutation({
    mutationFn: createManufacturingSupplySuggestion,
    onSuccess: (_result, input) => invalidate(input.workspaceId),
  });
}

export function useApproveManufacturingSupplySuggestionMutation() {
  const invalidate = useInvalidateSupplySuggestions();
  return useMutation({
    mutationFn: (input: {
      suggestionId: string;
      body: ApproveManufacturingSupplySuggestionInput;
    }) => approveManufacturingSupplySuggestion(input.suggestionId, input.body),
    onSuccess: (_result, input) => invalidate(input.body.workspaceId),
  });
}

export function useConvertManufacturingSupplySuggestionMutation() {
  const invalidate = useInvalidateSupplySuggestions();
  return useMutation({
    mutationFn: (input: {
      suggestionId: string;
      body: ConvertManufacturingSupplySuggestionInput;
    }) => convertManufacturingSupplySuggestion(input.suggestionId, input.body),
    onSuccess: (_result, input) => invalidate(input.body.workspaceId),
  });
}

export function useCancelManufacturingSupplySuggestionMutation() {
  const invalidate = useInvalidateSupplySuggestions();
  return useMutation({
    mutationFn: (input: {
      suggestionId: string;
      body: CancelManufacturingSupplySuggestionInput;
    }) => cancelManufacturingSupplySuggestion(input.suggestionId, input.body),
    onSuccess: (_result, input) => invalidate(input.body.workspaceId),
  });
}

export type ManufacturingSupplySuggestionCreatePayload =
  CreateManufacturingSupplySuggestionInput;
export type ManufacturingSupplySuggestionCancelPayload =
  CancelManufacturingSupplySuggestionInput;
