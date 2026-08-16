import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionCatalogEntry, RoleDetailRecord, RoleRecord, SaveRoleInput } from "@bizovix/types";
import { apiRequest } from "../http-client";

const root = ["settings", "roles"] as const;

export const useSettingsRoles = () =>
  useQuery({ queryKey: [...root, "list"], queryFn: () => apiRequest<RoleRecord[]>("/settings/roles") });

export const useSettingsRole = (id?: string | null) =>
  useQuery({
    queryKey: [...root, "one", id],
    queryFn: () => apiRequest<RoleDetailRecord>(`/settings/roles/${id}`),
    enabled: !!id,
  });

export const usePermissionsCatalog = () =>
  useQuery({
    queryKey: [...root, "permissions-catalog"],
    queryFn: () => apiRequest<PermissionCatalogEntry[]>("/settings/roles/permissions-catalog"),
    staleTime: Infinity,
  });

export const useCreateRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveRoleInput) => apiRequest<RoleDetailRecord>("/settings/roles", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};

export const useUpdateRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Omit<SaveRoleInput, "permissionKeys"> }) =>
      apiRequest<RoleDetailRecord>(`/settings/roles/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};

export const useSetRolePermissions = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permissionKeys }: { id: string; permissionKeys: string[] }) =>
      apiRequest<RoleDetailRecord>(`/settings/roles/${id}/permissions`, { method: "PUT", body: { permissionKeys } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};

export const useDeleteRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<null>(`/settings/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};
