import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApprovalRuleRecord, SaveApprovalRuleInput } from "@bizovix/types";
import { apiRequest } from "../http-client";

const root = ["settings", "approvals"] as const;

export const useApprovalRules = () =>
  useQuery({ queryKey: root, queryFn: () => apiRequest<ApprovalRuleRecord[]>("/settings/approvals") });

export const useCreateApprovalRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveApprovalRuleInput) => apiRequest<ApprovalRuleRecord>("/settings/approvals", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};

export const useUpdateApprovalRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SaveApprovalRuleInput }) =>
      apiRequest<ApprovalRuleRecord>(`/settings/approvals/${id}`, { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};

export const useDeleteApprovalRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<null>(`/settings/approvals/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};
