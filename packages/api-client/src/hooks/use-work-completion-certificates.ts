import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  UpdateCompletionCertificateEgpInput,
  WorkCompletionCertificateQuery,
  WorkCompletionCertificateRow,
  WorkCompletionCertificateStats,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

function params(query: WorkCompletionCertificateQuery) {
  const { completedOnly, ...rest } = query;

  return {
    ...rest,
    completedOnly: completedOnly === undefined ? undefined : String(completedOnly),
  };
}

export function useWorkCompletionCertificates(query: WorkCompletionCertificateQuery) {
  return useQuery({
    queryKey: queryKeys.workCompletionCertificates(query),
    queryFn: () =>
      apiRequestPaginated<WorkCompletionCertificateRow>("/work-completion-certificates", {
        params: params(query),
      }),
    placeholderData: (previous) => previous,
  });
}

export function useWorkCompletionCertificate(workId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workCompletionCertificate(workId ?? ""),
    queryFn: () =>
      apiRequest<WorkCompletionCertificateRow>(`/work-completion-certificates/${workId}`),
    enabled: Boolean(workId),
  });
}

export function useWorkCompletionCertificateStats(query: WorkCompletionCertificateQuery = {}) {
  return useQuery({
    queryKey: queryKeys.workCompletionCertificateStats(query),
    queryFn: () =>
      apiRequest<WorkCompletionCertificateStats>("/work-completion-certificates/stats", {
        params: params(query),
      }),
  });
}

export function useUpdateCompletionCertificateEgpTracking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      certificateId,
      input,
    }: {
      certificateId: string;
      input: UpdateCompletionCertificateEgpInput;
    }) =>
      apiRequest<WorkCompletionCertificateRow>(
        `/work-completion-certificates/${certificateId}/egp-status`,
        { method: "PATCH", body: input },
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work-completion-certificates"] }),
        queryClient.invalidateQueries({ queryKey: ["project-closing"] }),
      ]),
  });
}
