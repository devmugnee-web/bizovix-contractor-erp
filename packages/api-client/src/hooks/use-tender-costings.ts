import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ItemPriceHistoryRecord,
  SaveTenderCostingInput,
  SetTenderCostingBudgetInput,
  TenderCostingDetail,
  TenderCostingPdfExtractionResult,
  TenderCostingQuery,
  TenderCostingRecord,
  TenderCostingStats,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function extractTenderCostingPdfs(files: File[]) {
  const body = new FormData();
  files.forEach((file) => body.append("files", file));
  return apiRequest<TenderCostingPdfExtractionResult>("/tender-costings/extract-pdfs", {
    method: "POST",
    body,
  });
}

export function useTenderCostings(query: TenderCostingQuery) {
  return useQuery({
    queryKey: queryKeys.tenderCostings(query),
    queryFn: () => apiRequestPaginated<TenderCostingRecord>("/tender-costings", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useTenderCosting(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tenderCosting(id ?? ""),
    queryFn: () => apiRequest<TenderCostingDetail>(`/tender-costings/${id}`),
    enabled: !!id,
  });
}

export function useTenderCostingStats() {
  return useQuery({
    queryKey: queryKeys.tenderCostingStats,
    queryFn: () => apiRequest<TenderCostingStats>("/tender-costings/stats"),
  });
}

export function useItemPriceHistory() {
  return useQuery({
    queryKey: queryKeys.itemPriceHistory,
    queryFn: () => apiRequest<ItemPriceHistoryRecord[]>("/tender-costings/item-price-history"),
  });
}

export function useSaveTenderCosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveTenderCostingInput }) =>
      apiRequest<TenderCostingDetail>(`/tender-costings/${id}`, { method: "PUT", body: payload }),
    onSuccess: (record) => {
      queryClient.setQueryData(queryKeys.tenderCosting(record.id), record);
      queryClient.invalidateQueries({ queryKey: ["tender-costings"] });
      queryClient.invalidateQueries({ queryKey: ["tenders"] });
    },
  });
}

export function useSetTenderCostingBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SetTenderCostingBudgetInput }) =>
      apiRequest<TenderCostingDetail>(`/tender-costings/${id}/budget`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: (record) => {
      queryClient.setQueryData(queryKeys.tenderCosting(record.id), record);
      queryClient.invalidateQueries({ queryKey: ["tender-costings"] });
    },
  });
}
