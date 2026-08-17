import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateDocumentInput, DocumentQuery, DocumentRecord, UpdateDocumentInput } from "@bizovix/types";
import { apiRequest, apiRequestBlob, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

function toFormData(input: object, file?: File): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue;
    form.append(key, String(value));
  }
  if (file) form.append("file", file);
  return form;
}

export function useDocuments(query: DocumentQuery) {
  return useQuery({
    queryKey: queryKeys.documents(query),
    queryFn: () => apiRequestPaginated<DocumentRecord>("/documents", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.document(id ?? ""),
    queryFn: () => apiRequest<DocumentRecord>(`/documents/${id}`),
    enabled: !!id,
  });
}

export function useDocumentCategories() {
  return useQuery({
    queryKey: queryKeys.documentCategories,
    queryFn: () => apiRequest<string[]>("/documents/categories"),
  });
}

function useInvalidateDocuments() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["documents"] });
}

export function useCreateDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({ input, file }: { input: CreateDocumentInput; file?: File }) =>
      apiRequest<DocumentRecord>("/documents", { method: "POST", body: toFormData(input, file) }),
    onSuccess: invalidate,
  });
}

export function useUpdateDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDocumentInput }) =>
      apiRequest<DocumentRecord>(`/documents/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });
}

export function useAddDocumentVersion() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({ id, file, changeNote }: { id: string; file: File; changeNote?: string }) =>
      apiRequest<DocumentRecord>(`/documents/${id}/versions`, {
        method: "POST",
        body: toFormData({ changeNote }, file),
      }),
    onSuccess: invalidate,
  });
}

export function useArchiveDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiRequest<DocumentRecord>(`/documents/${id}/archive`, { method: "PATCH", body: { reason } }),
    onSuccess: invalidate,
  });
}

export function useRestoreDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (id: string) => apiRequest<DocumentRecord>(`/documents/${id}/restore`, { method: "PATCH" }),
    onSuccess: invalidate,
  });
}

export async function downloadDocument(id: string, version?: number): Promise<{ blob: Blob; fileName: string | null }> {
  return apiRequestBlob(`/documents/${id}/download`, { params: version ? { version } : undefined });
}
