import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ItemQuery, ItemRecord, ItemStats, SaveItemInput } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useItems(query: ItemQuery) {
  return useQuery({
    queryKey: queryKeys.items(query),
    queryFn: () => apiRequestPaginated<ItemRecord>("/items", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.item(id ?? ""),
    queryFn: () => apiRequest<ItemRecord>(`/items/${id}`),
    enabled: !!id,
  });
}

export function useItemStats() {
  return useQuery({
    queryKey: queryKeys.itemStats,
    queryFn: () => apiRequest<ItemStats>("/items/stats"),
  });
}

function useInvalidateItems() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["items"] });
}

export function useCreateItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: (payload: SaveItemInput) => apiRequest<ItemRecord>("/items", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveItemInput }) => apiRequest<ItemRecord>(`/items/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}
