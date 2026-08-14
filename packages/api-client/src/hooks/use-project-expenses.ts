import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ExpenseHeadOption,
  ExpensePersonOption,
  ProjectExpense,
  ProjectExpenseExport,
  ProjectExpenseQuery,
  SaveProjectExpenseInput,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useProjectExpenses(query: ProjectExpenseQuery) {
  return useQuery({
    queryKey: queryKeys.projectExpenses(query),
    queryFn: () => apiRequestPaginated<ProjectExpense>("/project-expenses", { params: { ...query } }),
    enabled: !!query.workId,
    placeholderData: (previous) => previous,
  });
}

export function useExpenseHeads() {
  return useQuery({ queryKey: queryKeys.projectExpenseHeads, queryFn: () => apiRequest<ExpenseHeadOption[]>("/project-expenses/expense-heads") });
}

export function useExpensePeople() {
  return useQuery({ queryKey: queryKeys.projectExpensePeople, queryFn: () => apiRequest<ExpensePersonOption[]>("/project-expenses/people") });
}

function useInvalidateProjectExpenses() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["project-expenses"] });
}

export function useCreateProjectExpense() {
  const invalidate = useInvalidateProjectExpenses();
  return useMutation({ mutationFn: (payload: SaveProjectExpenseInput) => apiRequest<ProjectExpense>("/project-expenses", { method: "POST", body: payload }), onSuccess: invalidate });
}

export function useUpdateProjectExpense() {
  const invalidate = useInvalidateProjectExpenses();
  return useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Partial<SaveProjectExpenseInput> }) => apiRequest<ProjectExpense>(`/project-expenses/${id}`, { method: "PATCH", body: payload }), onSuccess: invalidate });
}

export function useDeleteProjectExpense() {
  const invalidate = useInvalidateProjectExpenses();
  return useMutation({ mutationFn: (id: string) => apiRequest<null>(`/project-expenses/${id}`, { method: "DELETE" }), onSuccess: invalidate });
}

export function useExportProjectExpenses() {
  return useMutation({ mutationFn: (query: ProjectExpenseQuery) => apiRequest<ProjectExpenseExport>("/project-expenses/export", { params: { ...query } }) });
}
