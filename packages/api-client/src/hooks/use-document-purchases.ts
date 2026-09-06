import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateDocumentPurchaseInput,
  DocumentPurchase,
  DocumentPurchaseQuery,
  DocumentPurchaseRequest,
  DocumentPurchaseRequestActionInput,
  DocumentPurchaseRequestQuery,
  DocumentPurchaseRequestStats,
  DocumentPurchaseStats,
  RejectDocumentPurchaseRequestInput,
  UpdateDocumentPurchaseInput,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useDocumentPurchases(query: DocumentPurchaseQuery) {
  return useQuery({
    queryKey: queryKeys.documentPurchases(query),
    queryFn: () =>
      apiRequestPaginated<DocumentPurchase>("/document-purchases", {
        params: { ...query },
      }),
    placeholderData: (previous) => previous,
  });
}

export function useDocumentPurchase(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.documentPurchase(id ?? ""),
    queryFn: () => apiRequest<DocumentPurchase>(`/document-purchases/${id}`),
    enabled: !!id,
  });
}

export function useDocumentPurchaseStats() {
  return useQuery({
    queryKey: queryKeys.documentPurchaseStats,
    queryFn: () => apiRequest<DocumentPurchaseStats>("/document-purchases/stats"),
  });
}

export function useDocumentPurchaseRequests(query: DocumentPurchaseRequestQuery) {
  return useQuery({
    queryKey: queryKeys.documentPurchaseRequests(query),
    queryFn: () =>
      apiRequestPaginated<DocumentPurchaseRequest>("/document-purchases/workflow-requests", {
        params: { ...query },
      }),
    placeholderData: (previous) => previous,
  });
}

export function useDocumentPurchaseRequestStats() {
  return useQuery({
    queryKey: queryKeys.documentPurchaseRequestStats,
    queryFn: () => apiRequest<DocumentPurchaseRequestStats>("/document-purchases/workflow-requests/stats"),
  });
}

function useInvalidateDocumentPurchases() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["document-purchases"] });
    queryClient.invalidateQueries({ queryKey: ["document-purchase-requests"] });
  };
}

export function useApproveDocumentPurchaseRequest() {
  const invalidate = useInvalidateDocumentPurchases();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DocumentPurchaseRequestActionInput }) =>
      apiRequest<DocumentPurchaseRequest>(`/document-purchases/workflow-requests/${id}/approve`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: invalidate,
  });
}

export function useRejectDocumentPurchaseRequest() {
  const invalidate = useInvalidateDocumentPurchases();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RejectDocumentPurchaseRequestInput }) =>
      apiRequest<DocumentPurchaseRequest>(`/document-purchases/workflow-requests/${id}/reject`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: invalidate,
  });
}

export function useCreateDocumentPurchase() {
  const invalidate = useInvalidateDocumentPurchases();

  return useMutation({
    mutationFn: (payload: CreateDocumentPurchaseInput) =>
      apiRequest<DocumentPurchase>("/document-purchases", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateDocumentPurchase() {
  const invalidate = useInvalidateDocumentPurchases();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateDocumentPurchaseInput }) =>
      apiRequest<DocumentPurchase>(`/document-purchases/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

export function useDeleteDocumentPurchase() {
  const invalidate = useInvalidateDocumentPurchases();

  return useMutation({
    mutationFn: (id: string) => apiRequest<null>(`/document-purchases/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
