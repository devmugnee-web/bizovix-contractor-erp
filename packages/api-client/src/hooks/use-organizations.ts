import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrganizationMasterOption, OrganizationMasterQuery, OrganizationMasterRecord } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { isLocalDesktop } from "../desktop-runtime";
import { queryKeys } from "./query-keys";

interface OrganizationLookupOptions { includeLocal?: boolean }
type OrganizationInput = { shortName: string; fullName: string };

export function isAcceptedOrganizationMaster(record: OrganizationMasterOption) {
  return !record.syncStatus || record.syncStatus === "SYNCED";
}

function visibleRecords<T extends OrganizationMasterOption>(records: T[], includeLocal?: boolean): T[] {
  return includeLocal ? records : records.filter(isAcceptedOrganizationMaster);
}

function localParams(includeLocal?: boolean) {
  return includeLocal && isLocalDesktop() ? { includeLocal: "true" } : {};
}

function requireDesktop() {
  if (!isLocalDesktop()) throw new Error("Saved organization drafts are available in the desktop app.");
}

export function useOrganizations(search: string, options: OrganizationLookupOptions = {}) {
  return useQuery({
    queryKey: [...queryKeys.organizations(search), options.includeLocal ? "with-local-drafts" : "accepted"],
    queryFn: async () => visibleRecords(await apiRequest<OrganizationMasterOption[]>("/organizations", { params: { search, ...localParams(options.includeLocal) } }), options.includeLocal),
    enabled: search.trim().length >= 2,
  });
}

export function useAllOrganizations(options: OrganizationLookupOptions = {}) {
  return useQuery({
    queryKey: [...queryKeys.organizations(), options.includeLocal ? "with-local-drafts" : "accepted"],
    queryFn: async () => visibleRecords(await apiRequest<OrganizationMasterOption[]>("/organizations", options.includeLocal && isLocalDesktop() ? { params: localParams(true) } : undefined), options.includeLocal),
  });
}

export function useOrganizationMasters(query: OrganizationMasterQuery, options: OrganizationLookupOptions = {}) {
  return useQuery({
    queryKey: [...queryKeys.organizationMasters(query), options.includeLocal ? "with-local-drafts" : "accepted"],
    queryFn: async () => {
      const result = await apiRequestPaginated<OrganizationMasterRecord>("/organizations/all", { params: { ...query, ...localParams(options.includeLocal) } });
      return { ...result, items: visibleRecords(result.items, options.includeLocal) };
    },
    placeholderData: (previous) => previous,
  });
}

export function useCreateOrganizationMaster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: OrganizationInput) =>
      apiRequest<OrganizationMasterOption>("/organizations", { method: "POST", body: payload }),
    onSuccess: (record) => {
      if (record.syncStatus) queryClient.setQueryData(["organizations", "desktop-draft", record.id], record);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["desktop-sync-status"] }),
      ]);
    },
  });
}

export function useOrganizationDraft(id?: string) {
  return useQuery({
    queryKey: ["organizations", "desktop-draft", id],
    enabled: Boolean(id) && isLocalDesktop(),
    staleTime: 0,
    queryFn: () => {
      requireDesktop();
      return apiRequest<OrganizationMasterRecord>(`/desktop/organization-drafts/${encodeURIComponent(id!)}`);
    },
    refetchInterval: (query) => query.state.data?.syncStatus === "SYNCED" ? false : 5_000,
  });
}

export function useOrganizationDrafts(open: boolean) {
  const status = useQuery({
    queryKey: ["desktop-sync-status"],
    queryFn: () => apiRequest<{ offlineModules?: string[]; organizationDraftRecoveryAvailable?: boolean }>("/desktop/status"),
    enabled: open && isLocalDesktop(),
    retry: false,
  });
  const available = status.data?.organizationDraftRecoveryAvailable ?? status.data?.offlineModules?.includes("organizations") ?? false;
  return useQuery({
    queryKey: ["organizations", "desktop-drafts"],
    enabled: open && isLocalDesktop() && available,
    staleTime: 0,
    queryFn: () => {
      requireDesktop();
      if (!available) throw new Error("Organization draft recovery is not enabled for this session.");
      return apiRequest<OrganizationMasterRecord[]>("/desktop/organization-drafts");
    },
    refetchInterval: open ? 5_000 : false,
  });
}

export function useReviseOrganizationDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: OrganizationInput }) => {
      requireDesktop();
      return apiRequest<OrganizationMasterOption>(`/desktop/organization-drafts/${encodeURIComponent(id)}`, { method: "PATCH", body: payload });
    },
    onSuccess: (record) => {
      queryClient.setQueryData(["organizations", "desktop-draft", record.id], record);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["desktop-sync-status"] }),
      ]);
    },
  });
}
