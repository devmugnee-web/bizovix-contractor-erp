import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationQuery, NotificationRecord } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";

const root = ["notifications"] as const;

export const useNotifications = (q: NotificationQuery) =>
  useQuery({
    queryKey: [...root, "list", q],
    queryFn: () =>
      apiRequestPaginated<NotificationRecord>("/notifications", {
        params: {
          page: q.page,
          limit: q.limit,
          isRead: q.isRead === undefined ? undefined : String(q.isRead),
        },
      }),
    placeholderData: (p) => p,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

export const useUnreadNotificationCount = () =>
  useQuery({
    queryKey: [...root, "unread-count"],
    queryFn: () => apiRequest<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 60_000,
  });

export const useMarkNotificationRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<NotificationRecord>(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};

export const useMarkAllNotificationsRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<{ count: number }>("/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};
