import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GeneralExpense, GeneralExpenseExport, GeneralExpenseQuery, SaveGeneralExpenseInput } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useGeneralExpenses(query: GeneralExpenseQuery) {
  return useQuery({
    queryKey: queryKeys.generalExpenses(query),
    queryFn: () => apiRequestPaginated<GeneralExpense>("/general-expenses", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

function useInvalidateGeneralExpenses() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["general-expenses"] });
}

export function useCreateGeneralExpense() {
  const invalidate = useInvalidateGeneralExpenses();
  return useMutation({ mutationFn: (payload: SaveGeneralExpenseInput) => apiRequest<GeneralExpense>("/general-expenses", { method: "POST", body: payload }), onSuccess: invalidate });
}

export function useUpdateGeneralExpense() {
  const invalidate = useInvalidateGeneralExpenses();
  return useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Partial<SaveGeneralExpenseInput> }) => apiRequest<GeneralExpense>(`/general-expenses/${id}`, { method: "PATCH", body: payload }), onSuccess: invalidate });
}

export function useDeleteGeneralExpense() {
  const invalidate = useInvalidateGeneralExpenses();
  return useMutation({ mutationFn: (id: string) => apiRequest<null>(`/general-expenses/${id}`, { method: "DELETE" }), onSuccess: invalidate });
}

export function useUploadGeneralExpenseAttachments() {
  const invalidate = useInvalidateGeneralExpenses();
  return useMutation({ mutationFn: ({ id, files }: { id: string; files: File[] }) => {
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    return apiRequest<GeneralExpense>(`/general-expenses/${id}/attachments`, { method: "POST", body });
  }, onSuccess: invalidate });
}

export function useExportGeneralExpenses() {
  return useMutation({ mutationFn: (query: GeneralExpenseQuery) => apiRequest<GeneralExpenseExport>("/general-expenses/export", { params: { ...query } }) });
}
