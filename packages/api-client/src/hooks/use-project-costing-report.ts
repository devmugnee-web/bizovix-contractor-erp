import { useQuery } from "@tanstack/react-query";
import type { CostedTenderBillSummary, ProjectCostingReport } from "@bizovix/types";
import { apiRequest, apiRequestBlob, apiRequestPaginated } from "../http-client";

export function useCostedTendersForBills(query: { page: number; limit: number; search?: string }) {
  return useQuery({
    queryKey: ["tender-costings", "bill-list", query], staleTime: 0,
    queryFn: () => apiRequestPaginated<CostedTenderBillSummary>("/project-bills/costing/tenders", { params: { ...query } }),
  });
}

export function useTenderBillCostingReport(costingId: string) {
  return useQuery({
    queryKey: ["tender-costings", "bill-report", costingId], staleTime: 0,
    queryFn: () => apiRequest<ProjectCostingReport>(`/project-bills/costing/tenders/${costingId}`),
  });
}

export function downloadTenderBillCostingPdf(costingId: string) {
  return apiRequestBlob(`/project-bills/costing/tenders/${costingId}/pdf`);
}

export function downloadTenderBillCostingWord(costingId: string) {
  return apiRequestBlob(`/project-bills/costing/tenders/${encodeURIComponent(costingId)}/word`);
}

export function useProjectCostingReport(workId?: string) {
  return useQuery({
    // Keep the former tender-costing response out of the project BOQ/PA view's cache.
    queryKey: ["project-boq-report", workId], enabled: !!workId, staleTime: 0,
    queryFn: () => apiRequest<ProjectCostingReport>(`/project-bills/projects/${workId}/costing`),
  });
}

export function downloadProjectCostingPdf(workId: string) {
  return apiRequestBlob(`/project-bills/projects/${workId}/costing/pdf`);
}
