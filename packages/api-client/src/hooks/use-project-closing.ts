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
