import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SaveUomInput, UomRecord } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useUoms(options: { includeLocal?: boolean } = {}) {
  const includeLocal = options.includeLocal === true;
  return useQuery({
    queryKey: [...queryKeys.uoms, includeLocal ? "with-local-drafts" : "accepted"],
    queryFn: async () => {
      const records = await apiRequest<UomRecord[]>("/uoms");
      // Cloud workflows may use only accepted IDs and accepted field values.
      return includeLocal ? records : records.flatMap((record) =>
        !record.syncStatus || record.syncStatus === "SYNCED" ? [record] : record.cloudRecord ? [record.cloudRecord] : [],
      );
    },
  });
}

function useInvalidateUoms() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["uoms"] }),
    queryClient.invalidateQueries({ queryKey: ["desktop-sync-status"] }),
  ]);
}

export function useCreateUom() {
  const invalidate = useInvalidateUoms();
  return useMutation({
    mutationFn: (payload: SaveUomInput) => apiRequest<UomRecord>("/uoms", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateUom() {
  const invalidate = useInvalidateUoms();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveUomInput }) => apiRequest<UomRecord>(`/uoms/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}
