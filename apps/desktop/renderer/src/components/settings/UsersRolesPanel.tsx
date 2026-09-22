"use client";
import * as React from "react";
import { Key, Plus, Shield, X } from "lucide-react";
import { PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput, cn } from "@bizovix/ui";
import {
  useCreateRole,
  useCreateSettingsUser,
  useDeleteRole,
  usePermissionsCatalog,
  useResetSettingsUserPassword,
  useSetRolePermissions,
  useSetSettingsUserStatus,
  useSettingsRole,
  useSettingsRoles,
  useSettingsUsers,
  useUpdateRole,
  useUpdateSettingsUser,
} from "@bizovix/api-client";
import type { RoleRecord, SaveSettingsUserInput, SettingsUserRecord } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { SettingsSectionHeader, useSettingsNotice } from "./shared";

function Overlay({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <section
        className={cn("max-h-[92vh] w-full overflow-y-auto rounded-lg bg-white p-5 shadow-card-hover", wide ? "max-w-2xl" : "max-w-md")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-bold">{title}</h2>
          <button aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5 text-biz-muted" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold">
      {label}
      {required && <span className="text-biz-danger"> *</span>}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}

function UserForm({
  record,
  roles,
  onClose,
  notify,
}: {
  record?: SettingsUserRecord;
  roles: RoleRecord[];
  onClose: () => void;
  notify: (m: string) => void;
}) {
  const create = useCreateSettingsUser();
  const update = useUpdateSettingsUser();
  const [error, setError] = React.useState("");
  const [form, setForm] = React.useState<SaveSettingsUserInput>({
    name: record?.name ?? "",
    email: record?.email ?? "",
    phone: record?.phone ?? "",
    roleId: record?.role.id ?? roles[0]?.id ?? "",
    password: "",
  });
  const pending = create.isPending || update.isPending;

  async function save() {
    if (!form.name.trim() || !form.email.trim() || !form.roleId) {
      setError("Name, email and role are required.");
      return;
    }
    try {
      if (record) {
        await update.mutateAsync({ id: record.id, body: { name: form.name, phone: form.phone, roleId: form.roleId } });
        notify("User updated successfully.");
      } else {
        const result = await create.mutateAsync(form);
        notify(result.temporaryPassword ? `User created. Temporary password: ${result.temporaryPassword}` : "User created successfully.");
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save user.");
    }
  }

  return (
    <Overlay title={record ? "Edit User" : "Add User"} onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Full Name" required>
          <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email" required>
          <TextInput type="email" disabled={!!record} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <TextInput value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Role" required>
          <SelectInput
            value={form.roleId}
            onChange={(e) => setForm({ ...form, roleId: e.target.value })}
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
          />
        </Field>
        {!record && (
          <Field label="Password">
            <TextInput
              type="text"
              placeholder="Leave blank to auto-generate a temporary password"
              value={form.password ?? ""}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
        )}
      </div>
      {error && <p className="mt-3 text-xs text-biz-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={pending} onClick={save}>
          {pending ? "Saving..." : "Save User"}
        </PrimaryButton>
      </div>
    </Overlay>
  );
}

function ResetPasswordModal({ userId, onClose, notify }: { userId: string; onClose: () => void; notify: (m: string) => void }) {
  const reset = useResetSettingsUserPassword();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");

  async function save() {
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    try {
      await reset.mutateAsync({ id: userId, newPassword: password });
      notify("Password reset successfully.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset password.");
    }
  }

  return (
    <Overlay title="Reset Password" onClose={onClose}>
      <Field label="New Password" required>
        <TextInput type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p className="mt-3 text-xs text-biz-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={reset.isPending} onClick={save}>
          {reset.isPending ? "Resetting..." : "Reset Password"}
        </PrimaryButton>
      </div>
    </Overlay>
  );
}

function RoleForm({ record, onClose, notify }: { record?: RoleRecord; onClose: () => void; notify: (m: string) => void }) {
  const create = useCreateRole();
  const update = useUpdateRole();
  const [name, setName] = React.useState(record?.name ?? "");
  const [description, setDescription] = React.useState(record?.description ?? "");
  const [error, setError] = React.useState("");
  const pending = create.isPending || update.isPending;

  async function save() {
    if (!name.trim()) {
      setError("Role name is required.");
      return;
    }
    try {
      if (record) await update.mutateAsync({ id: record.id, body: { name, description } });
      else await create.mutateAsync({ name, description });
      notify(record ? "Role updated successfully." : "Role created successfully.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save role.");
    }
  }

  return (
    <Overlay title={record ? "Edit Role" : "Add Role"} onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Role Name" required>
          <TextInput disabled={record?.isSystem} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description">
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
      {error && <p className="mt-3 text-xs text-biz-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={pending} onClick={save}>
          {pending ? "Saving..." : "Save Role"}
        </PrimaryButton>
      </div>
    </Overlay>
  );
}

function PermissionMatrixModal({ roleId, onClose, notify }: { roleId: string; onClose: () => void; notify: (m: string) => void }) {
  const role = useSettingsRole(roleId);
  const catalog = usePermissionsCatalog();
  const setPermissions = useSetRolePermissions();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loadedFrom, setLoadedFrom] = React.useState<typeof role.data>(undefined);

  if (role.data && role.data !== loadedFrom) {
    setLoadedFrom(role.data);
    setSelected(new Set(role.data.permissionKeys));
  }

  const permissionEntries = catalog.data;
  const groups = React.useMemo(() => {
    const map = new Map<string, typeof permissionEntries>();
    for (const entry of permissionEntries ?? []) {
      if (!map.has(entry.group)) map.set(entry.group, []);
      map.get(entry.group)!.push(entry);
    }
    return Array.from(map.entries());
  }, [permissionEntries]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    await setPermissions.mutateAsync({ id: roleId, permissionKeys: Array.from(selected) });
    notify("Role permissions updated successfully.");
    onClose();
  }

  return (
    <Overlay title={`Permissions — ${role.data?.name ?? ""}`} onClose={onClose} wide>
      {role.isLoading || catalog.isLoading ? (
        <div className="h-64 animate-pulse rounded bg-slate-100" />
      ) : (
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {groups.map(([group, entries]) => (
            <div key={group}>
              <p className="mb-1.5 text-[11px] font-bold uppercase text-biz-muted">{group.replaceAll("_", " ")}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {(entries ?? []).map((entry) => (
                  <label key={entry.key} className="flex items-center gap-2 rounded border border-biz-border px-2 py-1.5 text-[11px]">
                    <input type="checkbox" checked={selected.has(entry.key)} onChange={() => toggle(entry.key)} />
                    <span className="truncate" title={entry.key}>
                      {entry.key}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={setPermissions.isPending} onClick={save}>
          {setPermissions.isPending ? "Saving..." : "Save Permissions"}
        </PrimaryButton>
      </div>
    </Overlay>
  );
}

export function UsersRolesPanel() {
  useSetBreadcrumb([{ label: "Settings", href: "/settings" }, { label: "Users & Roles" }]);
  const { notify, Notice } = useSettingsNotice();
  const [tab, setTab] = React.useState<"users" | "roles">("users");
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("");
  const [userModal, setUserModal] = React.useState<SettingsUserRecord | "new" | null>(null);
  const [resetTarget, setResetTarget] = React.useState<string | null>(null);
  const [roleModal, setRoleModal] = React.useState<RoleRecord | "new" | null>(null);
  const [permissionsTarget, setPermissionsTarget] = React.useState<string | null>(null);

  const roles = useSettingsRoles();
  const users = useSettingsUsers({ search, roleId: roleFilter || undefined, limit: 20 });
  const setStatus = useSetSettingsUserStatus();
  const deleteRole = useDeleteRole();

  return (
    <div className="flex flex-col gap-4">
      {Notice}
      <SettingsSectionHeader
        title="Users & Roles"
        description="Manage user accounts, roles and the permission matrix that controls access across the ERP."
      />
      <div className="flex gap-1 rounded-lg border border-biz-border bg-white p-1 shadow-card">
        {(["users", "roles"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded px-3 py-2 text-[12px] font-semibold capitalize",
              tab === t ? "bg-biz-blue text-white" : "text-biz-muted hover:bg-biz-bg",
            )}
          >
            {t === "users" ? "Users" : "Roles & Permissions"}
          </button>
        ))}
      </div>

      {tab === "users" ? (
        <section className="overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div className="flex flex-wrap gap-2">
              <TextInput placeholder="Search name or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <SelectInput
                placeholder="All Roles"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
              />
            </div>
            <PrimaryButton onClick={() => setUserModal("new")}>
              <Plus className="h-4 w-4" />
              Add User
            </PrimaryButton>
          </div>
          {users.isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-[11px]">
                <thead className="bg-[#f4f7fb] text-[10px]">
                  <tr>
                    {["Name", "Email", "Role", "Status", "Last Login", "Created Date", "Action"].map((h) => (
                      <th key={h} className="px-3 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(users.data?.items ?? []).map((u) => (
                    <tr key={u.id} className="border-t border-biz-border">
                      <td className="px-3 py-3 font-semibold">{u.name}</td>
                      <td className="px-3 py-3">{u.email}</td>
                      <td className="px-3 py-3">{u.role.name}</td>
                      <td className="px-3 py-3">
                        <StatusBadge label={u.isActive ? "Active" : "Inactive"} tone={u.isActive ? "success" : "neutral"} />
                      </td>
                      <td className="px-3 py-3">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}</td>
                      <td className="px-3 py-3">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button className="rounded border px-2 py-1 hover:text-biz-blue" onClick={() => setUserModal(u)}>
                            Edit
                          </button>
                          <button
                            className="rounded border px-2 py-1 hover:text-biz-blue"
                            onClick={() => setStatus.mutate({ id: u.id, isActive: !u.isActive })}
                          >
                            {u.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button className="rounded border px-2 py-1 hover:text-biz-blue" onClick={() => setResetTarget(u.id)}>
                            <Key className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!users.data?.items.length && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-biz-muted">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
          <div className="flex items-center justify-between border-b p-4">
            <p className="text-[12px] text-biz-muted">Define roles and the permissions each role grants.</p>
            <PrimaryButton onClick={() => setRoleModal("new")}>
              <Plus className="h-4 w-4" />
              Add Role
            </PrimaryButton>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[11px]">
              <thead className="bg-[#f4f7fb] text-[10px]">
                <tr>
                  {["Role", "Description", "Users", "Permissions", "Action"].map((h) => (
                    <th key={h} className="px-3 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(roles.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-biz-border">
                    <td className="px-3 py-3 font-semibold">
                      {r.name} {r.isSystem && <StatusBadge label="System" tone="info" className="ml-1.5" />}
                    </td>
                    <td className="px-3 py-3 text-biz-muted">{r.description ?? "—"}</td>
                    <td className="px-3 py-3">{r.userCount}</td>
                    <td className="px-3 py-3">{r.permissionCount}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button className="rounded border px-2 py-1 hover:text-biz-blue" onClick={() => setPermissionsTarget(r.id)}>
                          <Shield className="h-3 w-3" />
                        </button>
                        <button className="rounded border px-2 py-1 hover:text-biz-blue" onClick={() => setRoleModal(r)}>
                          Edit
                        </button>
                        <button
                          className="rounded border px-2 py-1 hover:text-biz-danger disabled:opacity-40"
                          disabled={r.isSystem || r.userCount > 0}
                          title={r.isSystem ? "System roles cannot be deleted" : r.userCount > 0 ? "Role is assigned to users" : "Delete role"}
                          onClick={async () => {
                            await deleteRole.mutateAsync(r.id);
                            notify("Role deleted successfully.");
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {userModal && (
        <UserForm
          record={userModal === "new" ? undefined : userModal}
          roles={roles.data ?? []}
          onClose={() => setUserModal(null)}
          notify={notify}
        />
      )}
      {resetTarget && <ResetPasswordModal userId={resetTarget} onClose={() => setResetTarget(null)} notify={notify} />}
      {roleModal && <RoleForm record={roleModal === "new" ? undefined : roleModal} onClose={() => setRoleModal(null)} notify={notify} />}
      {permissionsTarget && (
        <PermissionMatrixModal roleId={permissionsTarget} onClose={() => setPermissionsTarget(null)} notify={notify} />
      )}
    </div>
  );
}
