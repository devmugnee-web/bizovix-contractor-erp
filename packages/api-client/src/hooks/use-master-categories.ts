import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MasterCategoryRecord, MasterCategoryType, SaveMasterCategoryInput } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useMasterCategories(type?: MasterCategoryType, options: { includeLocalDrafts?: boolean } = {}) {
  const includeLocalDrafts = options.includeLocalDrafts === true;
  return useQuery({
    queryKey: [...queryKeys.masterCategories(type), includeLocalDrafts ? "with-local-drafts" : "accepted"],
    queryFn: async () => {
      const categories = await apiRequest<MasterCategoryRecord[]>("/master-categories", { params: type ? { type } : undefined });
      // Cloud-only workflows must not submit a category ID that exists only on this PC.
      return includeLocalDrafts ? categories : categories.flatMap((category) =>
        !category.syncStatus || category.syncStatus === "SYNCED" ? [category] : category.cloudCategory ? [category.cloudCategory] : [],
      );
    },
  });
}

function useInvalidateMasterCategories() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["master-categories"] }),
    queryClient.invalidateQueries({ queryKey: ["desktop-sync-status"] }),
  ]);
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
