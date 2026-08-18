import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrganizationMasterOption, OrganizationMasterQuery, OrganizationMasterRecord } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
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

export function useOrganizationMasters(query: OrganizationMasterQuery) {
  return useQuery({
    queryKey: queryKeys.organizationMasters(query),
    queryFn: () => apiRequestPaginated<OrganizationMasterRecord>("/organizations/all", { params: { ...query } }),
    placeholderData: (previous) => previous,
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
