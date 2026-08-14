import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CmsWork, CmsWorkExport, CmsWorkQuery, CmsWorkStats, CmsWorkStatus, CreateCmsWorkInput } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useCmsWorks(query: CmsWorkQuery) {
  return useQuery({
    queryKey: queryKeys.cmsWorks(query),
    queryFn: () => apiRequestPaginated<CmsWork>("/cms/works", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useCmsWork(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.cmsWork(id ?? ""),
    queryFn: () => apiRequest<CmsWork>(`/cms/works/${id}`),
    enabled: !!id,
  });
}

export function useCmsWorkStats(status: CmsWorkStatus = "ONGOING") {
  return useQuery({
    queryKey: queryKeys.cmsWorkStats(status),
    queryFn: () => apiRequest<CmsWorkStats>("/cms/works/stats", { params: { status } }),
  });
}

export function useCmsWorkCategories() {
  return useQuery({ queryKey: queryKeys.cmsWorkCategories, queryFn: () => apiRequest<string[]>("/cms/works/categories") });
}

function useInvalidateCmsWorks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["cms-works"] });
}

export function useCreateCmsWork() {
  const invalidate = useInvalidateCmsWorks();
  return useMutation({
    mutationFn: (payload: CreateCmsWorkInput) => apiRequest<CmsWork>("/cms/works", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useArchiveCmsWork() {
  const invalidate = useInvalidateCmsWorks();
  return useMutation({
    mutationFn: (id: string) => apiRequest<CmsWork>(`/cms/works/${id}/archive`, { method: "PATCH" }),
    onSuccess: invalidate,
  });
}

export function useRestoreCmsWork() {
  const invalidate = useInvalidateCmsWorks();
  return useMutation({
    mutationFn: (id: string) => apiRequest<CmsWork>(`/cms/works/${id}/restore`, { method: "PATCH" }),
    onSuccess: invalidate,
  });
}

export function useExportCmsWorks() {
  return useMutation({
    mutationFn: (query: CmsWorkQuery) => apiRequest<CmsWorkExport>("/cms/works/export", { params: { ...query } }),
  });
}
