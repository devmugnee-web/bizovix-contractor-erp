import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApproveChallanSubmissionInput,
  CancelChallanSubmissionInput,
  ChallanSubmissionNumberPreview,
  ChallanSubmissionQuery,
  ChallanSubmissionRecord,
  ChallanSubmissionStats,
  RejectChallanSubmissionInput,
  SaveChallanSubmissionInput,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useChallanSubmissions(query: ChallanSubmissionQuery) {
  return useQuery({
    queryKey: queryKeys.challanSubmissions(query),
    queryFn: () =>
      apiRequestPaginated<ChallanSubmissionRecord>("/challan-submissions", {
        params: { ...query },
      }),
    placeholderData: (previous) => previous,
  });
}

export function useChallanSubmission(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.challanSubmission(id ?? ""),
    queryFn: () => apiRequest<ChallanSubmissionRecord>(`/challan-submissions/${id}`),
    enabled: !!id,
  });
}

export function useChallanSubmissionStats(cmsWorkId?: string) {
  return useQuery({
    queryKey: queryKeys.challanSubmissionStats(cmsWorkId),
    queryFn: () =>
      apiRequest<ChallanSubmissionStats>("/challan-submissions/stats", {
        params: cmsWorkId ? { cmsWorkId } : undefined,
      }),
  });
}

export function useChallanNumberPreview() {
  return useQuery({
    queryKey: queryKeys.challanSubmissionNumberPreview,
    queryFn: () =>
      apiRequest<ChallanSubmissionNumberPreview>("/challan-submissions/number-preview"),
  });
}

function useInvalidateChallanSubmissions() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["challan-submissions"] }),
      queryClient.invalidateQueries({ queryKey: ["cms-works"] }),
      queryClient.invalidateQueries({ queryKey: ["documents"] }),
    ]);
}

export function useCreateChallanSubmission() {
  const invalidate = useInvalidateChallanSubmissions();
  return useMutation({
    mutationFn: (payload: SaveChallanSubmissionInput) =>
      apiRequest<ChallanSubmissionRecord>("/challan-submissions", {
        method: "POST",
        body: payload,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateChallanSubmission() {
  const invalidate = useInvalidateChallanSubmissions();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveChallanSubmissionInput }) =>
      apiRequest<ChallanSubmissionRecord>(`/challan-submissions/${id}`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: invalidate,
  });
}

function useChallanSubmissionAction(action: "submit" | "start-review" | "release-payment") {
  const invalidate = useInvalidateChallanSubmissions();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<ChallanSubmissionRecord>(`/challan-submissions/${id}/${action}`, {
        method: "POST",
      }),
    onSuccess: invalidate,
  });
}

export function useSubmitChallanSubmission() {
  return useChallanSubmissionAction("submit");
}

export function useStartReviewChallanSubmission() {
  return useChallanSubmissionAction("start-review");
}

export function useApproveChallanSubmission() {
  const invalidate = useInvalidateChallanSubmissions();
  return useMutation({
    mutationFn: ({ id, approvedAmount }: ApproveChallanSubmissionInput) =>
      apiRequest<ChallanSubmissionRecord>(`/challan-submissions/${id}/approve`, {
        method: "POST",
        body: approvedAmount === undefined ? {} : { approvedAmount },
      }),
    onSuccess: invalidate,
  });
}

export function useRejectChallanSubmission() {
  const invalidate = useInvalidateChallanSubmissions();
  return useMutation({
    mutationFn: ({ id, reason }: RejectChallanSubmissionInput) =>
      apiRequest<ChallanSubmissionRecord>(`/challan-submissions/${id}/reject`, {
        method: "POST",
        body: reason === undefined ? {} : { reason },
      }),
    onSuccess: invalidate,
  });
}

export function useReleaseChallanPayment() {
  return useChallanSubmissionAction("release-payment");
}

export function useCancelChallanSubmission() {
  const invalidate = useInvalidateChallanSubmissions();
  return useMutation({
    mutationFn: ({ id, reason }: CancelChallanSubmissionInput) =>
      apiRequest<ChallanSubmissionRecord>(`/challan-submissions/${id}/cancel`, {
        method: "POST",
        body: reason === undefined ? {} : { reason },
      }),
    onSuccess: invalidate,
  });
}
