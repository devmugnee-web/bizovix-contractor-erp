"use client";

import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/services/api-client";
import { getCurrentSession } from "@/services/auth.service";
import { getDashboard } from "@/services/dashboard.service";
import { getTrialBalance } from "@/services/reports.service";
import { getSubscription } from "@/services/subscription.service";
import { listDayBook } from "@/services/voucher.service";
import {
  getWorkspaceWorkflowSettings,
  workflowSettingsQueryKey,
} from "@/services/workflow-settings.service";
import type { DataMode, DayBookFilters } from "@/types/domain";

function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return false;
  }

  return failureCount < 2;
}

export function useDashboardQuery(mode: DataMode, workspaceId: string) {
  return useQuery({
    queryKey: [mode, "dashboard", workspaceId],
    queryFn: () => getDashboard(mode, workspaceId),
    enabled: Boolean(workspaceId),
    retry: shouldRetry,
  });
}

export function useDayBookQuery(mode: DataMode, filters: DayBookFilters) {
  return useQuery({
    queryKey: [mode, "day-book", filters],
    queryFn: () => listDayBook(mode, filters),
    retry: shouldRetry,
  });
}

export function useTrialBalanceQuery(mode: DataMode, workspaceId: string) {
  return useQuery({
    queryKey: [mode, "trial-balance", workspaceId],
    queryFn: () => getTrialBalance(mode, workspaceId),
    enabled: Boolean(workspaceId),
    retry: shouldRetry,
  });
}

export function useCurrentSessionQuery(mode: DataMode, enabled = true) {
  return useQuery({
    queryKey: [mode, "current-session"],
    queryFn: getCurrentSession,
    enabled: enabled && mode === "api",
    staleTime: 5 * 60_000,
    retry: shouldRetry,
  });
}

export function useSubscriptionQuery(mode: DataMode, workspaceId?: string | null, enabled = true) {
  return useQuery({
    queryKey: [mode, "subscription", workspaceId ?? "default"],
    queryFn: () => getSubscription(mode, workspaceId),
    enabled: enabled && (mode !== "api" || Boolean(workspaceId)),
    retry: shouldRetry,
  });
}

export function useWorkflowSettingsQuery(mode: DataMode, workspaceId?: string | null) {
  const activeWorkspaceId = workspaceId ?? "";
  return useQuery({
    queryKey: workflowSettingsQueryKey(mode, activeWorkspaceId),
    queryFn: () => getWorkspaceWorkflowSettings(mode, activeWorkspaceId),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 5 * 60_000,
    retry: shouldRetry,
  });
}
