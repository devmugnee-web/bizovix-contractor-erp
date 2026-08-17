import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BudgetVsActual, CreateProjectBudgetInput, ProjectBudgetSummary, ProjectBudgetVersion } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useProjectBudgets(workId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectBudgets(workId ?? ""),
    queryFn: () => apiRequest<ProjectBudgetVersion[]>(`/cms/works/${workId}/budgets`),
    enabled: !!workId,
  });
}

export function useProjectBudgetSummary(workId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectBudgetSummary(workId ?? ""),
    queryFn: () => apiRequest<ProjectBudgetSummary>(`/cms/works/${workId}/budget-summary`),
    enabled: !!workId,
  });
}

export function useBudgetVsActual(workId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.budgetVsActual(workId ?? ""),
    queryFn: () => apiRequest<BudgetVsActual>(`/cms/works/${workId}/budget-vs-actual`),
    enabled: !!workId,
  });
}

function useInvalidateProjectBudget(workId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.projectBudgets(workId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projectBudgetSummary(workId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.budgetVsActual(workId) }),
    ]);
}

export function useSaveProjectBudgetDraft(workId: string) {
  const invalidate = useInvalidateProjectBudget(workId);
  return useMutation({
    mutationFn: (payload: CreateProjectBudgetInput) =>
      apiRequest<ProjectBudgetVersion>(`/cms/works/${workId}/budgets`, { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useApproveProjectBudget(workId: string) {
  const invalidate = useInvalidateProjectBudget(workId);
  return useMutation({
    mutationFn: (budgetId: string) =>
      apiRequest<ProjectBudgetVersion>(`/cms/works/${workId}/budgets/${budgetId}/approve`, { method: "POST" }),
    onSuccess: invalidate,
  });
}
