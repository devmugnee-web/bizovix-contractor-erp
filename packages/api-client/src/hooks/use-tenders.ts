import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTenderInput,
  ApproveTenderForCostingInput,
  RecordTenderOpeningInput,
  RejectTenderForCostingInput,
  SubmitTenderForCostingInput,
  SubmitTenderInput,
  TenderCostingApprovalResult,
  TenderDetail,
  TenderOptions,
  TenderPdfExtractionResult,
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

export function useTenderOptions() {
  return useQuery({
    queryKey: queryKeys.tenderOptions,
    queryFn: () => apiRequest<TenderOptions>("/tenders/options"),
  });
}

export async function extractTenderPdf(file: File) {
  const upload = () => {
    const body = new FormData();
    body.append("file", file);
    return apiRequest<TenderPdfExtractionResult>("/tenders/extract-pdf", {
      method: "POST",
      body,
    });
  };

  try {
    return await upload();
  } catch (error) {
    // PDF extraction is read-only, so one retry safely covers brief API restarts.
    if (!(error instanceof TypeError)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 750));
    return upload();
  }
}

function useInvalidateTenders() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      ["tenders"], ["organizations"], ["tender-securities", "pending"],
      ["pg-bg", "eligible"], ["cms-works"],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  };
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

export function useDeleteTender() {
  const invalidate = useInvalidateTenders();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ id: string }>(`/tenders/${id}`, { method: "DELETE" }),
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

export function useSubmitTenderForCostingApproval() {
  const invalidate = useInvalidateTenders();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SubmitTenderForCostingInput }) =>
      apiRequest<TenderRecord>(`/tenders/${id}/submit-for-costing-approval`, { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useApproveTenderForCosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ApproveTenderForCostingInput }) =>
      apiRequest<TenderCostingApprovalResult>(`/tenders/${id}/approve-for-costing`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenders"] });
      queryClient.invalidateQueries({ queryKey: ["tender-costings"] });
    },
  });
}

export function useRejectTenderForCosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RejectTenderForCostingInput }) =>
      apiRequest<TenderRecord>(`/tenders/${id}/reject-for-costing`, { method: "POST", body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenders"] });
      queryClient.invalidateQueries({ queryKey: ["tender-costings"] });
    },
  });
}
