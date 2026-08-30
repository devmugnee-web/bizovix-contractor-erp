import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSalesQuotationFollowUpInput,
  CreateSalesQuotationInput,
  SalesQuotationExport,
  SalesQuotationFollowUpQuery,
  SalesQuotationFollowUpRecord,
  SalesQuotationOptions,
  SalesQuotationQuery,
  SalesQuotationListRecord,
  SalesQuotationRecentRecord,
  SalesQuotationRecord,
  SalesQuotationResultRow,
  SalesQuotationResultQuery,
  SalesQuotationSummary,
  SalesQuotationCostingSummary,
  SalesQuotationCostingSummaryQuery,
  SalesQuotationRecentDecisionQuery,
  SaveSalesQuotationCostingInput,
  RecordSalesQuotationResultInput,
  VersionedSalesQuotationActionInput,
  UpdateSalesQuotationInput,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

const root = ["sales-quotations"] as const;

function exportParams(query: SalesQuotationQuery | SalesQuotationResultQuery) {
  const { page: _page, limit: _limit, ...params } = query;
  return params;
}

function useInvalidateSalesQuotations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: root });
}

export function useSalesQuotations(query: SalesQuotationQuery) {
  return useQuery({
    queryKey: queryKeys.salesQuotations(query),
    queryFn: () =>
      apiRequestPaginated<SalesQuotationListRecord>("/sales-quotations", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useSalesQuotation(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.salesQuotation(id ?? ""),
    queryFn: () => apiRequest<SalesQuotationRecord>(`/sales-quotations/${id}`),
    enabled: !!id,
  });
}

export function useSalesQuotationSummary(query: Omit<SalesQuotationQuery, "page" | "limit"> = {}) {
  return useQuery({
    queryKey: queryKeys.salesQuotationSummary(query),
    queryFn: () =>
      apiRequest<SalesQuotationSummary>("/sales-quotations/summary", { params: { ...query } }),
  });
}

export function useSalesQuotationRecent(query: { limit?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.salesQuotationRecent(query),
    queryFn: () =>
      apiRequest<SalesQuotationRecentRecord[]>("/sales-quotations/recent", { params: query }),
  });
}

export function useSalesQuotationCostingSummary(
  query: SalesQuotationCostingSummaryQuery = {},
) {
  return useQuery({
    queryKey: queryKeys.salesQuotationCostingSummary(query),
    queryFn: () =>
      apiRequest<SalesQuotationCostingSummary>("/sales-quotations/costing-summary", {
        params: { ...query },
      }),
  });
}

export function useSalesQuotationRecentDecisions(
  query: SalesQuotationRecentDecisionQuery = {},
) {
  return useQuery({
    queryKey: queryKeys.salesQuotationRecentDecisions(query),
    queryFn: () =>
      apiRequest<SalesQuotationResultRow[]>("/sales-quotations/recent-decisions", {
        params: { ...query },
      }),
  });
}

export function useSalesQuotationOptions() {
  return useQuery({
    queryKey: queryKeys.salesQuotationOptions,
    queryFn: () => apiRequest<SalesQuotationOptions>("/sales-quotations/options"),
  });
}

export function useSalesQuotationCosting(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.salesQuotationCosting(id ?? ""),
    queryFn: () => apiRequest<SalesQuotationRecord>(`/sales-quotations/${id}`),
    enabled: !!id,
  });
}

export function useSalesQuotationResults(query: SalesQuotationResultQuery) {
  return useQuery({
    queryKey: queryKeys.salesQuotationResults(query),
    queryFn: () =>
      apiRequestPaginated<SalesQuotationResultRow>("/sales-quotations", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useSalesQuotationResultSummary(
  query: Omit<SalesQuotationResultQuery, "page" | "limit"> = {},
) {
  return useQuery({
    queryKey: queryKeys.salesQuotationResultSummary(query),
    queryFn: () =>
      apiRequest<SalesQuotationSummary>("/sales-quotations/summary", { params: { ...query } }),
  });
}

export function useSalesQuotationFollowUps(
  id: string | undefined,
  query: SalesQuotationFollowUpQuery = {},
) {
  return useQuery({
    queryKey: queryKeys.salesQuotationFollowUps(id ?? "", query),
    queryFn: () =>
      apiRequest<SalesQuotationFollowUpRecord[]>(`/sales-quotations/${id}/follow-ups`, {
        params: { ...query },
      }),
    enabled: !!id,
    placeholderData: (previous) => previous,
  });
}

export function useCreateSalesQuotation() {
  const invalidate = useInvalidateSalesQuotations();
  return useMutation({
    mutationFn: (body: CreateSalesQuotationInput) =>
      apiRequest<SalesQuotationRecord>("/sales-quotations", { method: "POST", body }),
    onSuccess: invalidate,
  });
}

export function useUpdateSalesQuotation() {
  const invalidate = useInvalidateSalesQuotations();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSalesQuotationInput }) =>
      apiRequest<SalesQuotationRecord>(`/sales-quotations/${id}`, { method: "PATCH", body }),
    onSuccess: invalidate,
  });
}

export function useSendSalesQuotation() {
  const invalidate = useInvalidateSalesQuotations();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: VersionedSalesQuotationActionInput }) =>
      apiRequest<SalesQuotationRecord>(`/sales-quotations/${id}/send`, { method: "POST", body }),
    onSuccess: invalidate,
  });
}

export function useSaveSalesQuotationCosting() {
  const invalidate = useInvalidateSalesQuotations();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SaveSalesQuotationCostingInput }) =>
      apiRequest<SalesQuotationRecord>(`/sales-quotations/${id}/costing`, { method: "PUT", body }),
    onSuccess: invalidate,
  });
}

export function useSaveSalesQuotationResult() {
  const invalidate = useInvalidateSalesQuotations();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RecordSalesQuotationResultInput }) =>
      apiRequest<SalesQuotationRecord>(`/sales-quotations/${id}/result`, { method: "POST", body }),
    onSuccess: invalidate,
  });
}

export function useCreateSalesQuotationFollowUp() {
  const invalidate = useInvalidateSalesQuotations();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CreateSalesQuotationFollowUpInput }) =>
      apiRequest<SalesQuotationFollowUpRecord>(`/sales-quotations/${id}/follow-ups`, {
        method: "POST",
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useExportSalesQuotations() {
  return useMutation({
    mutationFn: (query: SalesQuotationQuery) =>
      apiRequest<SalesQuotationExport>("/sales-quotations/export", { params: exportParams(query) }),
  });
}

export function useExportSalesQuotationResults() {
  return useMutation({
    mutationFn: (query: SalesQuotationResultQuery) =>
      apiRequest<SalesQuotationExport>("/sales-quotations/export", { params: exportParams(query) }),
  });
}
