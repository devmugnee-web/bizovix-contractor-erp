import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CmsWork, CmsWorkExport, CmsWorkOverview, CmsWorkQuery, CmsWorkStats, CmsWorkStatus, CreateCmsWorkInput } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

function cmsWorkParams(query: CmsWorkQuery) {
  return {
    ...query,
    includeClosed: query.includeClosed ? "true" : undefined,
  };
}

export function useCmsWorks(query: CmsWorkQuery) {
  return useQuery({
    queryKey: queryKeys.cmsWorks(query),
    queryFn: () => apiRequestPaginated<CmsWork>("/cms/works", { params: cmsWorkParams(query) }),
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

export function useCmsWorkOverview(id: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.cmsWork(id ?? ""), "overview"],
    queryFn: () => apiRequest<CmsWorkOverview>(`/cms/works/${id}/overview`),
    enabled: !!id,
  });
}

export function useAddCmsWorkContact(workId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; designation: string; mobile: string; email?: string; address?: string }) =>
      apiRequest(`/cms/works/${workId}/contacts`, { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...queryKeys.cmsWork(workId), "overview"] }),
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
    mutationFn: (query: CmsWorkQuery) => apiRequest<CmsWorkExport>("/cms/works/export", { params: cmsWorkParams(query) }),
  });
}
