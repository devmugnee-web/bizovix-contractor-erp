import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MasterCategoryRecord, MasterCategoryType, SaveMasterCategoryInput } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useMasterCategories(type?: MasterCategoryType) {
  return useQuery({
    queryKey: queryKeys.masterCategories(type),
    queryFn: () => apiRequest<MasterCategoryRecord[]>("/master-categories", { params: type ? { type } : undefined }),
  });
}

function useInvalidateMasterCategories() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["master-categories"] });
}

export function useCreateMasterCategory() {
  const invalidate = useInvalidateMasterCategories();
  return useMutation({
    mutationFn: (payload: SaveMasterCategoryInput) => apiRequest<MasterCategoryRecord>("/master-categories", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateMasterCategory() {
  const invalidate = useInvalidateMasterCategories();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveMasterCategoryInput }) =>
      apiRequest<MasterCategoryRecord>(`/master-categories/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}
