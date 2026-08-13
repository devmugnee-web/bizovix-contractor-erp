import { useQuery } from "@tanstack/react-query";
import type { DashboardResponse } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiRequest<DashboardResponse>("/dashboard"),
  });
}
