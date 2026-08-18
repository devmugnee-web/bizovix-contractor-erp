import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PartyDetail, PartyQuery, PartyRecord, PartyStats, SavePartyContactInput, SavePartyInput } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useParties(query: PartyQuery) {
  return useQuery({
    queryKey: queryKeys.parties(query),
    queryFn: () => apiRequestPaginated<PartyRecord>("/parties", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useParty(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.party(id ?? ""),
    queryFn: () => apiRequest<PartyDetail>(`/parties/${id}`),
    enabled: !!id,
  });
}

export function usePartyStats(roles?: string) {
  return useQuery({
    queryKey: queryKeys.partyStats(roles),
    queryFn: () => apiRequest<PartyStats>("/parties/stats", { params: roles ? { roles } : undefined }),
  });
}

function useInvalidateParties() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["parties"] });
}

export function useCreateParty() {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: (payload: SavePartyInput) => apiRequest<PartyRecord>("/parties", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateParty() {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SavePartyInput }) => apiRequest<PartyRecord>(`/parties/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

export function useChangePartyStatus() {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      apiRequest<PartyRecord>(`/parties/${id}/status`, { method: "POST", body: { status, reason } }),
    onSuccess: invalidate,
  });
}

export function useAddPartyContact() {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SavePartyContactInput }) => apiRequest(`/parties/${id}/contacts`, { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdatePartyContact() {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: ({ id, contactId, payload }: { id: string; contactId: string; payload: SavePartyContactInput }) =>
      apiRequest(`/parties/${id}/contacts/${contactId}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

export function useRemovePartyContact() {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: ({ id, contactId }: { id: string; contactId: string }) => apiRequest(`/parties/${id}/contacts/${contactId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
