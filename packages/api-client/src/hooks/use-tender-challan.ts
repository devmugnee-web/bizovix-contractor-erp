import { useQuery } from "@tanstack/react-query";
import type { CostedTenderChallanSummary, TenderChallanReport, TenderChallanPdfOptions } from "@bizovix/types";
import { apiRequest, apiRequestBlob, apiRequestPaginated } from "../http-client";

const base = "/challan-submissions/costing/tenders";

export function useCostedTendersForChallans(query: { page: number; limit: number; search?: string }) {
  return useQuery({
    queryKey: ["tender-costings", "challan-list", query], staleTime: 0,
    queryFn: () => apiRequestPaginated<CostedTenderChallanSummary>(base, { params: { ...query } }),
  });
}

export function useTenderChallanReport(costingId: string) {
  return useQuery({
    queryKey: ["tender-costings", "challan-report", costingId], staleTime: 0,
    queryFn: () => apiRequest<TenderChallanReport>(`${base}/${encodeURIComponent(costingId)}`),
  });
}

export function downloadTenderChallanPdf(costingId: string, options: TenderChallanPdfOptions = {}) {
  return apiRequestBlob(`${base}/${encodeURIComponent(costingId)}/pdf`, { params: { ...options } });
}

export function downloadTenderChallanWord(costingId: string, options: TenderChallanPdfOptions = {}) {
  return apiRequestBlob(`${base}/${encodeURIComponent(costingId)}/word`, { params: { ...options } });
}
