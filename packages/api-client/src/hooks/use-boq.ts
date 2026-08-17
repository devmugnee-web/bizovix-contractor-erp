import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoqItemRecord, BoqSummary, CreateBoqItemInput, UpdateBoqItemInput } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useProjectBoq(workId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.boqItems(workId ?? ""),
    queryFn: () => apiRequest<BoqItemRecord[]>(`/cms/works/${workId}/boq`),
    enabled: !!workId,
  });
}

export function useBoqSummary(workId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.boqSummary(workId ?? ""),
    queryFn: () => apiRequest<BoqSummary>(`/cms/works/${workId}/boq-summary`),
    enabled: !!workId,
  });
}

function useInvalidateBoq(workId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.boqItems(workId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.boqSummary(workId) }),
    ]);
}

export function useCreateBoqItem(workId: string) {
  const invalidate = useInvalidateBoq(workId);
  return useMutation({
    mutationFn: (payload: CreateBoqItemInput) =>
      apiRequest<BoqItemRecord>(`/cms/works/${workId}/boq`, { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateBoqItem(workId: string) {
  const invalidate = useInvalidateBoq(workId);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBoqItemInput }) =>
      apiRequest<BoqItemRecord>(`/cms/works/${workId}/boq/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

export function useDeleteBoqItem(workId: string) {
  const invalidate = useInvalidateBoq(workId);
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ success: boolean }>(`/cms/works/${workId}/boq/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
