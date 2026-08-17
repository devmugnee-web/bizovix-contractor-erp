import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProjectBillQuery, ProjectBillRecord, ProjectBillStats, ProjectProgress, SaveProjectBillInput } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useProjectBills(query: ProjectBillQuery) {
  return useQuery({
    queryKey: queryKeys.projectBills(query),
    queryFn: () => apiRequestPaginated<ProjectBillRecord>("/project-bills", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useProjectBill(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectBill(id ?? ""),
    queryFn: () => apiRequest<ProjectBillRecord>(`/project-bills/${id}`),
    enabled: !!id,
  });
}

export function useProjectBillStats(cmsWorkId?: string) {
  return useQuery({
    queryKey: queryKeys.projectBillStats(cmsWorkId),
    queryFn: () => apiRequest<ProjectBillStats>("/project-bills/stats", { params: cmsWorkId ? { cmsWorkId } : undefined }),
  });
}

export function useProjectProgress(workId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectProgress(workId ?? ""),
    queryFn: () => apiRequest<ProjectProgress>(`/cms/works/${workId}/progress`),
    enabled: !!workId,
  });
}

function useInvalidateProjectBills() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project-bills"] }),
      queryClient.invalidateQueries({ queryKey: ["cms-works"] }),
    ]);
}

export function useCreateProjectBill() {
  const invalidate = useInvalidateProjectBills();
  return useMutation({
    mutationFn: (payload: SaveProjectBillInput) => apiRequest<ProjectBillRecord>("/project-bills", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateProjectBill() {
  const invalidate = useInvalidateProjectBills();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveProjectBillInput }) =>
      apiRequest<ProjectBillRecord>(`/project-bills/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

function useBillAction(action: string) {
  const invalidate = useInvalidateProjectBills();
  return useMutation({
    mutationFn: (id: string) => apiRequest<ProjectBillRecord>(`/project-bills/${id}/${action}`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useSubmitProjectBill() {
  return useBillAction("submit");
}
export function useStartReviewProjectBill() {
  return useBillAction("start-review");
}
export function useCertifyProjectBill() {
  return useBillAction("certify");
}
export function useRejectProjectBill() {
  return useBillAction("reject");
}
export function useCancelProjectBill() {
  return useBillAction("cancel");
}
