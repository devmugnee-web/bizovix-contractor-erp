import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTenderInput,
  RecordTenderOpeningInput,
  SubmitTenderInput,
  TenderDetail,
  TenderQuery,
  TenderRecord,
  TenderStats,
  UpdateTenderInput,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useTenders(query: TenderQuery) {
  return useQuery({
    queryKey: queryKeys.tenders(query),
    queryFn: () => apiRequestPaginated<TenderRecord>("/tenders", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useTender(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tender(id ?? ""),
    queryFn: () => apiRequest<TenderDetail>(`/tenders/${id}`),
    enabled: !!id,
  });
}

export function useTenderStats() {
  return useQuery({ queryKey: queryKeys.tenderStats, queryFn: () => apiRequest<TenderStats>("/tenders/stats") });
}

export function useTenderCategories() {
  return useQuery({ queryKey: queryKeys.tenderCategories, queryFn: () => apiRequest<string[]>("/tenders/categories") });
}

function useInvalidateTenders() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["tenders"] });
}

export function useCreateTender() {
  const invalidate = useInvalidateTenders();
  return useMutation({
    mutationFn: (payload: CreateTenderInput) => apiRequest<TenderRecord>("/tenders", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateTender() {
  const invalidate = useInvalidateTenders();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTenderInput }) =>
      apiRequest<TenderRecord>(`/tenders/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

export function useSubmitTender() {
  const invalidate = useInvalidateTenders();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SubmitTenderInput }) =>
      apiRequest<TenderRecord>(`/tenders/${id}/submit`, { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useRecordTenderOpening() {
  const invalidate = useInvalidateTenders();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RecordTenderOpeningInput }) =>
      apiRequest<TenderRecord>(`/tenders/${id}/opening`, { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}
