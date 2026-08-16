import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SaveSettingsUserInput,
  SettingsUserQuery,
  SettingsUserRecord,
  UpdateSettingsUserInput,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";

const root = ["settings", "users"] as const;

export const useSettingsUsers = (q: SettingsUserQuery) =>
  useQuery({
    queryKey: [...root, "list", q],
    queryFn: () =>
      apiRequestPaginated<SettingsUserRecord>("/settings/users", {
        params: {
          page: q.page,
          limit: q.limit,
          search: q.search,
          roleId: q.roleId,
          isActive: q.isActive === undefined ? undefined : String(q.isActive),
        },
      }),
    placeholderData: (p) => p,
  });

export const useCreateSettingsUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveSettingsUserInput) => apiRequest<SettingsUserRecord>("/settings/users", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};

export const useUpdateSettingsUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSettingsUserInput }) =>
      apiRequest<SettingsUserRecord>(`/settings/users/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};

export const useSetSettingsUserStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest<SettingsUserRecord>(`/settings/users/${id}/status`, { method: "PATCH", body: { isActive } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};

export const useResetSettingsUserPassword = () =>
  useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      apiRequest<{ success: boolean }>(`/settings/users/${id}/reset-password`, { method: "POST", body: { newPassword } }),
  });
