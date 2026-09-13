import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DashboardMonthlyTarget,
  DashboardQuery,
  DashboardResponse,
  SetDashboardTargetInput,
} from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useDashboard(query: DashboardQuery = {}) {
  return useQuery({
    queryKey: queryKeys.dashboard(query),
    queryFn: () => apiRequest<DashboardResponse>("/dashboard", { params: { ...query } }),
    placeholderData: (previousData) => previousData,
  });
}

export function useSetDashboardTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SetDashboardTargetInput) =>
      apiRequest<DashboardMonthlyTarget>("/dashboard/target", { method: "PUT", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });
}
