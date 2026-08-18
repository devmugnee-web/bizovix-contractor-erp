import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SaveUomInput, UomRecord } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useUoms() {
  return useQuery({
    queryKey: queryKeys.uoms,
    queryFn: () => apiRequest<UomRecord[]>("/uoms"),
  });
}

function useInvalidateUoms() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["uoms"] });
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
