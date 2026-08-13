import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrganizationMasterOption } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useOrganizations(search: string) {
  return useQuery({
    queryKey: queryKeys.organizations(search),
    queryFn: () => apiRequest<OrganizationMasterOption[]>("/organizations", { params: { search } }),
    enabled: search.trim().length >= 2,
  });
}

export function useAllOrganizations() {
  return useQuery({
    queryKey: queryKeys.organizations(),
    queryFn: () => apiRequest<OrganizationMasterOption[]>("/organizations"),
  });
}

export function useCreateOrganizationMaster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { shortName: string; fullName: string }) =>
      apiRequest<OrganizationMasterOption>("/organizations", { method: "POST", body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}
