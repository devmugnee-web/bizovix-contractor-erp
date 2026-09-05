import { useMutation, useQuery } from "@tanstack/react-query";
import type { BillCostingReferenceItem, BillPreparation, BillSource, BillSourceQuery, ProjectBillPreview, SaveProjectBillInput } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";

export function useBillSources(query: BillSourceQuery) {
  return useQuery({ queryKey: ["project-bills", "sources", query], queryFn: () => apiRequestPaginated<BillSource>("/project-bills/sources", { params: { ...query } }) });
}

export function useBillPreparation(cmsWorkId?: string, excludeBillId?: string) {
  return useQuery({ queryKey: ["project-bills", "preparation", cmsWorkId, excludeBillId], enabled: !!cmsWorkId,
    staleTime: 0, refetchOnMount: "always",
    queryFn: () => apiRequest<BillPreparation>(`/project-bills/preparation/${cmsWorkId}`, { params: { excludeBillId } }) });
}

export function useBillCostingReference(tenderId?: string) {
  return useQuery({ queryKey: ["project-bills", "costing-reference", tenderId], enabled: !!tenderId,
    queryFn: () => apiRequest<BillCostingReferenceItem[]>(`/project-bills/sources/${tenderId}/items`) });
}

export function usePreviewProjectBill(excludeBillId?: string) {
  return useMutation({ mutationFn: (body: SaveProjectBillInput) => apiRequest<ProjectBillPreview>("/project-bills/preview", { method: "POST", body, params: { excludeBillId } }) });
}
