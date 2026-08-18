import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FinalProjectProfitability, ProjectClosingOverview } from "@bizovix/types";
import { apiRequest } from "../http-client";

export function useProjectClosing(workId: string | undefined) {
  return useQuery({
    queryKey: ["project-closing", workId],
    queryFn: () => apiRequest<ProjectClosingOverview>(`/project-closing/${workId}`),
    enabled: !!workId,
  });
}
export function useFinalProjectProfitability(workId: string | undefined) {
  return useQuery({
    queryKey: ["project-profitability", workId],
    queryFn: () =>
      apiRequest<FinalProjectProfitability>(`/project-closing/${workId}/profitability`),
    enabled: !!workId,
  });
}
export function useCloseProject(workId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: { reason?: string }) =>
      apiRequest(`/project-closing/${workId}/close`, { method: "POST", body: payload }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["project-closing", workId] }),
        client.invalidateQueries({ queryKey: ["cms-works"] }),
      ]),
  });
}

function useClosingMutation<T>(workId: string, path: string, method: "POST" | "PATCH" = "POST") {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: T) => apiRequest(`/project-closing/${path}`, { method, body: payload }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["project-closing", workId] }),
  });
}

export const useCreateCompletionCertificate = (workId: string) => useClosingMutation<Record<string, unknown>>(workId, `${workId}/certificates`);
export const useUpdateCompletionCertificate = (workId: string, id: string) => useClosingMutation<Record<string, unknown>>(workId, `certificates/${id}`, "PATCH");
export const useCompletionCertificateStatus = (workId: string, id: string) => useClosingMutation<{ status: string; remarks?: string }>(workId, `certificates/${id}/status`, "PATCH");
export const useCreateDlp = (workId: string) => useClosingMutation<Record<string, unknown>>(workId, `${workId}/dlp`);
export const useExtendDlp = (workId: string, id: string) => useClosingMutation<{ extensionDays: number; reason: string }>(workId, `dlp/${id}/extend`);
export const useCompleteDlp = (workId: string, id: string) => useClosingMutation<Record<string, never>>(workId, `dlp/${id}/complete`);
export const useCreateDefect = (workId: string) => useClosingMutation<Record<string, unknown>>(workId, `${workId}/defects`);
export const useDefectStatus = (workId: string, id: string) => useClosingMutation<Record<string, unknown>>(workId, `defects/${id}/status`, "PATCH");
export const useCreateRetentionRelease = (workId: string) => useClosingMutation<Record<string, unknown>>(workId, `${workId}/retention-releases`);
export const useReleaseRetention = (workId: string, id: string) => useClosingMutation<Record<string, never>>(workId, `retention-releases/${id}/release`);
export const useCreateHandover = (workId: string) => useClosingMutation<Record<string, unknown>>(workId, `${workId}/handovers`);
export const useCompleteHandover = (workId: string, id: string) => useClosingMutation<Record<string, never>>(workId, `handovers/${id}/complete`);
export const useReopenProject = (workId: string) => useClosingMutation<{ reason: string }>(workId, `${workId}/reopen`);
export const useArchiveProject = (workId: string) => useClosingMutation<{ reason: string }>(workId, `${workId}/archive`);
