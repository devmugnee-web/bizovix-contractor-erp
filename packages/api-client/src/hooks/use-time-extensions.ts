import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SaveTimeExtensionInput, TimeExtensionRecord } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useTimeExtensions(cmsWorkId?: string) {
  return useQuery({
    queryKey: queryKeys.timeExtensions(cmsWorkId),
    queryFn: () => apiRequest<TimeExtensionRecord[]>("/time-extensions", { params: cmsWorkId ? { cmsWorkId } : undefined }),
  });
}

export function useTimeExtension(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.timeExtension(id ?? ""),
    queryFn: () => apiRequest<TimeExtensionRecord>(`/time-extensions/${id}`),
    enabled: !!id,
  });
}

function useInvalidateTimeExtensions() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["time-extensions"] }),
      queryClient.invalidateQueries({ queryKey: ["contracts"] }),
      queryClient.invalidateQueries({ queryKey: ["cms-works"] }),
    ]);
}

export function useCreateTimeExtension() {
  const invalidate = useInvalidateTimeExtensions();
  return useMutation({
    mutationFn: (payload: SaveTimeExtensionInput) => apiRequest<TimeExtensionRecord>("/time-extensions", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateTimeExtension() {
  const invalidate = useInvalidateTimeExtensions();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveTimeExtensionInput }) =>
      apiRequest<TimeExtensionRecord>(`/time-extensions/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

export function useSubmitTimeExtension() {
  const invalidate = useInvalidateTimeExtensions();
  return useMutation({
    mutationFn: (id: string) => apiRequest<TimeExtensionRecord>(`/time-extensions/${id}/submit`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useApproveTimeExtension() {
  const invalidate = useInvalidateTimeExtensions();
  return useMutation({
    mutationFn: ({ id, approvedDays }: { id: string; approvedDays?: number }) =>
      apiRequest<TimeExtensionRecord>(`/time-extensions/${id}/approve`, { method: "POST", body: { approvedDays } }),
    onSuccess: invalidate,
  });
}

export function useRejectTimeExtension() {
  const invalidate = useInvalidateTimeExtensions();
  return useMutation({
    mutationFn: (id: string) => apiRequest<TimeExtensionRecord>(`/time-extensions/${id}/reject`, { method: "POST" }),
    onSuccess: invalidate,
  });
}
