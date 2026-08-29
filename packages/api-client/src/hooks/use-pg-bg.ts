import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  EligiblePgBgTender,
  FinalizePgBgInput,
  FinalizePgBgResult,
  PgBgDecisionResult,
  PgBgEligibleQuery,
  PgBgWorkflow,
  SavePgBgWorkflowInput,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useEligiblePgBgTenders(query: PgBgEligibleQuery) {
  return useQuery({
    queryKey: queryKeys.pgBgEligible(query),
    queryFn: () => apiRequestPaginated<EligiblePgBgTender>("/pg-bg/eligible-tenders", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function usePgBgWorkflowByDocument(documentPurchaseId: string) {
  return useQuery({
    queryKey: queryKeys.pgBgWorkflowByDocument(documentPurchaseId),
    queryFn: () => apiRequest<PgBgWorkflow | null>(`/pg-bg/workflows/by-document/${documentPurchaseId}`),
    enabled: Boolean(documentPurchaseId),
  });
}

export function useWorkCategories() {
  return useQuery({ queryKey: queryKeys.workCategories, queryFn: () => apiRequest<string[]>("/pg-bg/work-categories") });
}

export function useOrganizationContacts(organizationMasterId?: string) {
  return useQuery({
    queryKey: queryKeys.organizationContacts(organizationMasterId),
    queryFn: () => apiRequest<Array<{ id: string; name: string; designation: string; mobile: string; email: string | null; address: string }>>("/pg-bg/organization-contacts", { params: { organizationMasterId } }),
    enabled: Boolean(organizationMasterId),
  });
}

export function useSavePgBgDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: SavePgBgWorkflowInput) => apiRequest<PgBgWorkflow>("/pg-bg/workflows", { method: "POST", body: payload }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["pg-bg"] }),
  });
}

export function useAcceptNoa() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, acceptNoa, pgBgRequired }: { id: string; acceptNoa: boolean; pgBgRequired: boolean }) =>
      apiRequest<PgBgDecisionResult>(`/pg-bg/workflows/${id}/accept-noa`, { method: "POST", body: { acceptNoa, pgBgRequired } }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["pg-bg"] }),
        client.invalidateQueries({ queryKey: ["cms-works"] }),
      ]);
    },
  });
}

export function useFinalizePgBg() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: FinalizePgBgInput }) => apiRequest<FinalizePgBgResult>(`/pg-bg/workflows/${id}/finalize`, { method: "POST", body: payload }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["pg-bg"] }),
        client.invalidateQueries({ queryKey: ["cms-works"] }),
      ]);
    },
  });
}
