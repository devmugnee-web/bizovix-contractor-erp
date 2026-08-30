import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CancelWorkIouInput,
  CreateWorkIouInput,
  SubmitWorkIouInput,
  UpdateWorkIouInput,
  WorkIouListRecord,
  WorkIouOptions,
  WorkIouQuery,
  WorkIouRecord,
} from "@bizovix/types";
import {
  apiRequest,
  apiRequestBlob,
  apiRequestPaginated,
} from "../http-client";
import { queryKeys } from "./query-keys";

const root = ["work-ious"] as const;

function useInvalidateWorkIous() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: root });
}

export function useWorkIous(query: WorkIouQuery = {}) {
  return useQuery({
    queryKey: queryKeys.workIous(query),
    queryFn: () =>
      apiRequestPaginated<WorkIouListRecord>("/work-ious", {
        params: { ...query },
      }),
    placeholderData: (previous) => previous,
  });
}

export function useWorkIou(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workIou(id ?? ""),
    queryFn: () => apiRequest<WorkIouRecord>(`/work-ious/${id}`),
    enabled: !!id,
  });
}

export function useWorkIouOptions() {
  return useQuery({
    queryKey: queryKeys.workIouOptions,
    queryFn: () => apiRequest<WorkIouOptions>("/work-ious/options"),
  });
}

export function useCreateWorkIou() {
  const invalidate = useInvalidateWorkIous();
  return useMutation({
    mutationFn: (body: CreateWorkIouInput) =>
      apiRequest<WorkIouRecord>("/work-ious", { method: "POST", body }),
    onSuccess: invalidate,
  });
}

export function useUpdateWorkIou() {
  const invalidate = useInvalidateWorkIous();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateWorkIouInput }) =>
      apiRequest<WorkIouRecord>(`/work-ious/${id}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useSubmitWorkIou() {
  const invalidate = useInvalidateWorkIous();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SubmitWorkIouInput }) =>
      apiRequest<WorkIouRecord>(`/work-ious/${id}/submit`, {
        method: "POST",
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useCancelWorkIou() {
  const invalidate = useInvalidateWorkIous();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CancelWorkIouInput }) =>
      apiRequest<WorkIouRecord>(`/work-ious/${id}/cancel`, {
        method: "POST",
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useUploadWorkIouAttachments() {
  const invalidate = useInvalidateWorkIous();
  return useMutation({
    mutationFn: ({
      id,
      expectedVersion,
      files,
    }: {
      id: string;
      expectedVersion: number;
      files: File[];
    }) => {
      const body = new FormData();
      body.append("expectedVersion", String(expectedVersion));
      files.forEach((file) => body.append("files", file));
      return apiRequest<WorkIouRecord>(`/work-ious/${id}/attachments`, {
        method: "POST",
        body,
      });
    },
    onSuccess: invalidate,
  });
}

export function useDeleteWorkIouAttachment() {
  const invalidate = useInvalidateWorkIous();
  return useMutation({
    mutationFn: ({
      id,
      attachmentId,
      expectedVersion,
    }: {
      id: string;
      attachmentId: string;
      expectedVersion: number;
    }) =>
      apiRequest<WorkIouRecord>(
        `/work-ious/${id}/attachments/${attachmentId}`,
        { method: "DELETE", body: { expectedVersion } },
      ),
    onSuccess: invalidate,
  });
}

export function downloadWorkIouAttachment(
  id: string,
  attachmentId: string,
): Promise<{ blob: Blob; fileName: string | null }> {
  return apiRequestBlob(
    `/work-ious/${id}/attachments/${attachmentId}/download`,
  );
}

export function useDownloadWorkIouAttachment() {
  return useMutation({
    mutationFn: ({ id, attachmentId }: { id: string; attachmentId: string }) =>
      downloadWorkIouAttachment(id, attachmentId),
  });
}
