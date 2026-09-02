"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, BookUser, Check, CheckCircle2, Copy, Eye, EyeOff, Info, KeyRound, LogIn, Minus, MoreVertical, Pencil, Plus, RefreshCw, Trash2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCurrentSessionQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { getDataProvider } from "@/services/data-provider";
import { logout } from "@/services/auth.service";
import { useSessionStore } from "@/stores/session-store";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import type {
  SyncSharePermissionColumn as PermissionColumn,
  SyncSharePermissionLevel as PermissionLevel,
  SyncSharePermissionMatrix as PermissionMatrix,
  SyncShareUserRecord as SharedUserRecord,
  SyncShareUserRole as UserRole,
} from "@/types/api";

type UserFormState = {
  name: string;
  contact: string;
  password: string;
  role: UserRole;
};

type InviteCredentials = {
  name: string;
  email: string;
  password: string;
};

type CloudSyncStatus = "synced" | "syncing" | "offline" | "not-configured";

const permissionColumns: Array<{ key: PermissionColumn; label: string }> = [
  { key: "view", label: "VIEW" },
  { key: "create", label: "CREATE" },
  { key: "edit", label: "EDIT" },
  { key: "share", label: "SHARE" },
  { key: "delete", label: "DELETE" },
];

const permissionRows = [
  "Sale",
  "Payment-In",
  "Sale Order",
  "Credit Note",
  "Delivery Challan",
  "Estimate",
  "Expense",
  "Party",
  "Item",
  "Proforma",
] as const;

function normalizeUserRole(role: string): UserRole {
  if (role === "Admin") return "Manager";
  if (role === "Biller") return "Staff";
  if (role === "Viewer") return "Auditor";
  return (["Manager", "Accountant", "Staff", "Auditor"] as const).includes(role as UserRole) ? role as UserRole : "Staff";
}

function buildRolePermissions(role: UserRole): PermissionMatrix {
  const templates: Record<UserRole, PermissionMatrix> = {
    Manager: Object.fromEntries(
      permissionRows.map((row) => [
        row,
        {
          view: "allow",
          create: "allow",
          edit: "allow",
          share: "allow",
          delete: "limited",
        },
      ]),
    ) as PermissionMatrix,
    Staff: {
      Sale: { view: "allow", create: "allow", edit: "limited", share: "allow", delete: "deny" },
      "Payment-In": { view: "allow", create: "allow", edit: "limited", share: "allow", delete: "deny" },
      "Sale Order": { view: "allow", create: "allow", edit: "limited", share: "allow", delete: "deny" },
      "Credit Note": { view: "allow", create: "allow", edit: "limited", share: "allow", delete: "deny" },
      "Delivery Challan": { view: "allow", create: "allow", edit: "limited", share: "allow", delete: "deny" },
      Estimate: { view: "allow", create: "allow", edit: "limited", share: "allow", delete: "deny" },
      Expense: { view: "limited", create: "allow", edit: "limited", share: "allow", delete: "deny" },
      Party: { view: "allow", create: "allow", edit: "allow", share: "allow", delete: "deny" },
      Item: { view: "allow", create: "deny", edit: "deny", share: "deny", delete: "deny" },
      Proforma: { view: "allow", create: "allow", edit: "limited", share: "allow", delete: "deny" },
    },
    Accountant: {
      Sale: { view: "allow", create: "allow", edit: "allow", share: "allow", delete: "limited" },
      "Payment-In": { view: "allow", create: "allow", edit: "allow", share: "allow", delete: "limited" },
      "Sale Order": { view: "allow", create: "limited", edit: "limited", share: "allow", delete: "deny" },
      "Credit Note": { view: "allow", create: "allow", edit: "allow", share: "allow", delete: "limited" },
      "Delivery Challan": { view: "allow", create: "limited", edit: "limited", share: "allow", delete: "deny" },
      Estimate: { view: "allow", create: "limited", edit: "limited", share: "allow", delete: "deny" },
      Expense: { view: "allow", create: "allow", edit: "allow", share: "allow", delete: "limited" },
      Party: { view: "allow", create: "allow", edit: "allow", share: "allow", delete: "deny" },
      Item: { view: "allow", create: "limited", edit: "limited", share: "deny", delete: "deny" },
      Proforma: { view: "allow", create: "limited", edit: "limited", share: "allow", delete: "deny" },
    },
    Auditor: Object.fromEntries(
      permissionRows.map((row) => [
        row,
        {
          view: "allow",
          create: "deny",
          edit: "deny",
          share: "limited",
          delete: "deny",
        },
      ]),
    ) as PermissionMatrix,
  };

  return templates[role];
}

function buildEmptyForm(): UserFormState {
  return {
    name: "",
    contact: "",
    password: "",
    role: "Staff",
  };
}

function formatSyncStamp(value: Date) {
  return formatDateTime(value);
}

function formatSavedSyncStamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return formatSyncStamp(parsed);
}

function cyclePermission(level: PermissionLevel): PermissionLevel {
  if (level === "allow") {
    return "limited";
  }

  if (level === "limited") {
    return "deny";
  }

  return "allow";
}

function PermissionBadge({
  level,
  onClick,
}: {
  level: PermissionLevel;
  onClick: () => void;
}) {
  const label = level === "allow" ? "Allowed" : level === "limited" ? "Limited to own records" : "Blocked";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={level === "limited" ? "mixed" : level === "allow"}
      aria-label={`${label}. Click to change permission.`}
      title={`${label} — click to change`}
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded px-1 transition hover:bg-[#f6f8fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2477ff]/35"
    >
      <span
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border bg-white",
          level === "allow" && "border-[#10b981] text-[#10b981]",
          level === "limited" && "border-[#a8b3c7] text-[#7c86a8]",
          level === "deny" && "border-[#c5d1dd]",
        )}
      >
        {level === "allow" ? <Check className="h-3 w-3 stroke-2" /> : null}
        {level === "limited" ? <Minus className="h-3 w-3 stroke-2" /> : null}
      </span>
      {level === "allow" ? <Check className="h-3.5 w-3.5 stroke-[1.75] text-[#10b981]" /> : null}
      {level === "limited" ? <TriangleAlert className="h-3.5 w-3.5 stroke-[1.5] text-[#7c86a8]" /> : null}
      {level === "deny" ? <X className="h-3.5 w-3.5 stroke-[1.75] text-[#ff5370]" /> : null}
    </button>
  );
}

function getCloudSyncStatusMeta(status: CloudSyncStatus) {
  if (status === "synced") {
    return { label: "Synced", className: "bg-[#ecfdf5] text-[#0f9f63]" };
  }

  if (status === "syncing") {
    return { label: "Syncing...", className: "bg-[#fff8e7] text-[#c76925]" };
  }

  if (status === "offline") {
    return { label: "Offline", className: "bg-[#fff1f2] text-[#e11d48]" };
  }

  return { label: "Not Configured", className: "bg-[#f3f4f6] text-[#667085]" };
}

export function SyncShareScreen() {
  const router = useRouter();
  const { mode, session } = useSessionContext();
  const clearSession = useSessionStore((state) => state.clearSession);
  const dataProvider = useMemo(() => getDataProvider(mode), [mode]);
  const isApiMode = mode === "api";
  const currentSessionQuery = useCurrentSessionQuery(mode);
  const storageKey = `bizovix:sync-share:${mode}:${session?.workspaceId ?? "default"}`;
  const [users, setUsers] = useState<SharedUserRecord[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(buildEmptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState<PermissionMatrix>(() => buildRolePermissions("Staff"));
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [knowMoreOpen, setKnowMoreOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [removeTarget, setRemoveTarget] = useState<SharedUserRecord | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [inviteCredentials, setInviteCredentials] = useState<InviteCredentials | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [networkInfo, setNetworkInfo] = useState<{ mode: "server" | "client"; allowLan: boolean; addresses: Array<{ name: string; address: string }> } | null>(null);
  const [togglingLanSharing, setTogglingLanSharing] = useState(false);

  useEffect(() => {
    if (!window.desktopApp?.isDesktop || !window.desktopApp.getNetworkInfo) {
      return;
    }
    void window.desktopApp
      .getNetworkInfo()
      .then(setNetworkInfo)
      .catch(() => undefined);
  }, []);

  async function handleEnableLanSharing() {
    if (!window.desktopApp?.setLanSharing) {
      return;
    }
    setTogglingLanSharing(true);
    try {
      await window.desktopApp.setLanSharing(true);
      // The app is about to relaunch (see desktop/main.cjs) — nothing else to
      // do here; leaving the button disabled avoids a second click racing it.
    } catch {
      setTogglingLanSharing(false);
      toast.error("Could not turn on network access. Try again.");
    }
  }

  useEffect(() => {
    if (isApiMode) {
      setHydratedKey(storageKey);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setUsers([]);
      setHydratedKey(storageKey);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as SharedUserRecord[];
      setUsers(Array.isArray(parsed) ? parsed.map((user) => ({ ...user, role: normalizeUserRole(String(user.role)) })) : []);
    } catch {
      window.localStorage.removeItem(storageKey);
      setUsers([]);
    }

    setHydratedKey(storageKey);
  }, [isApiMode, storageKey]);

  useEffect(() => {
    if (isApiMode) {
      return;
    }

    // Never write before the stored users have been read back for this key,
    // otherwise the initial empty state overwrites whatever the user already saved.
    if (typeof window === "undefined" || hydratedKey !== storageKey) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(users));
  }, [hydratedKey, isApiMode, storageKey, users]);

  useEffect(() => {
    if (!isApiMode || !session?.workspaceId) {
      return;
    }

    let cancelled = false;
    setIsLoadingUsers(true);
    dataProvider.workspaces
      .listShareUsers(session.workspaceId)
      .then((records) => {
        if (!cancelled) {
          setUsers(records);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Could not load shared users");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingUsers(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dataProvider.workspaces, isApiMode, session?.workspaceId]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-sync-account-menu]")) {
        return;
      }

      setAccountMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncOnlineStatus = () => {
      setIsOnline(window.navigator.onLine);
    };

    syncOnlineStatus();
    window.addEventListener("online", syncOnlineStatus);
    window.addEventListener("offline", syncOnlineStatus);

    return () => {
      window.removeEventListener("online", syncOnlineStatus);
      window.removeEventListener("offline", syncOnlineStatus);
    };
  }, []);

  const loggedInContact = useMemo(() => {
    const account = isApiMode ? currentSessionQuery.data?.user ?? session?.user : session?.user;
    if (account?.email) {
      return account.email;
    }

    return "Not signed in";
  }, [currentSessionQuery.data?.user, isApiMode, session?.user]);
  const cloudSyncStatus = useMemo<CloudSyncStatus>(() => {
    if (!isOnline) {
      return "offline";
    }

    if (isSyncing) {
      return "syncing";
    }

    if (!isApiMode && !users.length) {
      return "not-configured";
    }

    return "synced";
  }, [isApiMode, isOnline, isSyncing, users.length]);
  const cloudSyncStatusMeta = getCloudSyncStatusMeta(cloudSyncStatus);
  const showPermissions = form.name.trim().length > 0 && form.contact.trim().length > 0;
  const canSaveUser = showPermissions && (Boolean(editingId) || form.password.length >= 8);
  const accountLabel = loggedInContact.includes("@") ? "email" : "number";
  const visibleUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return users;
    }

    return users.filter((user) =>
      [user.name, user.contact, user.role, user.status].some((field) => field.toLowerCase().includes(needle)),
    );
  }, [search, users]);

  function openCreateEditor() {
    setEditingId(null);
    setForm(buildEmptyForm());
    setShowPassword(false);
    setPermissions(buildRolePermissions("Staff"));
    setEditorOpen(true);
  }

  function openEditEditor(user: SharedUserRecord) {
    setEditingId(user.id);
    setForm({
      name: user.name,
      contact: user.contact,
      password: "",
      role: user.role,
    });
    setPermissions(user.permissions);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setForm(buildEmptyForm());
    setShowPassword(false);
    setPermissions(buildRolePermissions("Staff"));
  }

  function updateRole(role: UserRole) {
    setForm((current) => ({
      ...current,
      role,
    }));
    setPermissions(buildRolePermissions(role));
  }

  function togglePermission(row: string, column: PermissionColumn) {
    setPermissions((current) => ({
      ...current,
      [row]: {
        ...current[row],
        [column]: cyclePermission(current[row][column]),
      },
    }));
  }

  async function handleRefreshSync() {
    if (!isOnline) {
      toast.error("You are offline right now");
      return;
    }

    setIsSyncing(true);
    if (isApiMode && session?.workspaceId) {
      try {
        const records = await dataProvider.workspaces.listShareUsers(session.workspaceId);
        setUsers(records);
        toast.success("Cloud sync status refreshed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not refresh cloud sync");
      } finally {
        setIsSyncing(false);
      }
      return;
    }

    window.setTimeout(() => {
      setIsSyncing(false);
      toast.success("Cloud sync status refreshed");
    }, 1200);
  }

  async function saveUser() {
    const name = form.name.trim();
    const contact = form.contact.trim();

    if (!name) {
      toast.error("User name is required");
      return;
    }

    if (isApiMode && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
      toast.error("Cloud sharing needs a valid email address");
      return;
    }

    if (!contact) {
      toast.error("Email address is required");
      return;
    }

    if (!editingId && form.password.length < 8) {
      toast.error("Initial password must be at least 8 characters");
      return;
    }

    if (editingId && form.password.length > 0 && form.password.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }

    const duplicateContact = users.find(
      (user) => user.id !== editingId && user.contact.trim().toLowerCase() === contact.toLowerCase(),
    );
    if (duplicateContact) {
      toast.error(`${duplicateContact.name} already uses this email address`);
      return;
    }

    const duplicateName = users.find((user) => user.id !== editingId && user.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicateName) {
      toast.error("This user name already exists");
      return;
    }

    const input = { name, contact, password: form.password || undefined, role: form.role, permissions };

    if (isApiMode && session?.workspaceId) {
      try {
        const payload = editingId
          ? await dataProvider.workspaces.updateShareUser(session.workspaceId, editingId, input)
          : await dataProvider.workspaces.createShareUser(session.workspaceId, input);

        setUsers((current) => {
          if (editingId) {
            return current.map((user) => (user.id === editingId ? payload : user));
          }

          return [payload, ...current];
        });
        toast.success(editingId ? "User access updated" : "User added to Users & Roles");
        if (!editingId && payload.temporaryPassword) {
          setInviteCredentials({
            name: payload.name,
            email: payload.contact,
            password: payload.temporaryPassword,
          });
        }
        closeEditor();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save user access");
      }
      return;
    }

    const payload: SharedUserRecord = {
      id: editingId ?? crypto.randomUUID(),
      ...input,
      status: editingId ? users.find((user) => user.id === editingId)?.status ?? "Invite Sent" : "Invite Sent",
      device: editingId ? users.find((user) => user.id === editingId)?.device ?? "Pending Join" : "Pending Join",
      lastSync: formatSyncStamp(new Date()),
    };

    setUsers((current) => {
      if (editingId) {
        return current.map((user) => (user.id === editingId ? payload : user));
      }

      return [payload, ...current];
    });

    toast.success(editingId ? "User access updated" : "User added to Users & Roles");
    closeEditor();
  }

  async function confirmRemoveUser() {
    if (!removeTarget) {
      return;
    }

    if (isApiMode && session?.workspaceId) {
      try {
        await dataProvider.workspaces.removeShareUser(session.workspaceId, removeTarget.id);
        setUsers((current) => current.filter((user) => user.id !== removeTarget.id));
        toast.success(`${removeTarget.name} removed from Users & Roles`);
        setRemoveTarget(null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not remove user");
      }
      return;
    }

    setUsers((current) => current.filter((user) => user.id !== removeTarget.id));
    setRemoveTarget(null);
    toast.success(`${removeTarget.name} removed from Users & Roles`);
  }

  async function copyAccountId() {
    setAccountMenuOpen(false);

    try {
      await navigator.clipboard.writeText(loggedInContact);
      toast.success("Account copied to clipboard");
      return;
    } catch {
      // The async clipboard API needs a permission the desktop shell may not
      // grant, so fall back to the selection-based copy that always works.
    }

    try {
      const holder = document.createElement("textarea");
      holder.value = loggedInContact;
      holder.setAttribute("readonly", "");
      holder.style.position = "fixed";
      holder.style.opacity = "0";
      document.body.appendChild(holder);
      holder.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(holder);

      if (copied) {
        toast.success("Account copied to clipboard");
        return;
      }
    } catch {
      // fall through to the error toast below
    }

    toast.error("Could not copy the account");
  }

  async function handleResetPassword(user: SharedUserRecord) {
    if (!session?.workspaceId) {
      toast.error("Active workspace not found");
      return;
    }

    setResettingUserId(user.id);
    try {
      const result = await dataProvider.workspaces.resetShareUserPassword(session.workspaceId, user.id);
      setInviteCredentials({
        name: result.name,
        email: result.contact,
        password: result.temporaryPassword,
      });
      toast.success(`${result.name} has a new password. Their old one no longer works.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset the password");
    } finally {
      setResettingUserId(null);
    }
  }

  async function copyInviteCredentials() {
    if (!inviteCredentials) {
      return;
    }

    const value = `Bizovix sign-in details\nEmail: ${inviteCredentials.email}\nInitial password: ${inviteCredentials.password}\n\nOpen Bizovix on an authorized PC connected to the same company server/data, choose Switch User, and enter these details.`;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Login details copied");
    } catch {
      toast.error("Could not copy login details");
    }
  }

  if (editorOpen) {
    return (
      <form
        className="flex h-full min-h-0 flex-col overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white"
        onSubmit={(event) => {
          event.preventDefault();
          saveUser();
        }}
      >
        <div className="flex items-center justify-between border-b border-[#d7dfeb] px-4 py-4">
          <div className="text-[18px] font-semibold text-[#23365a]">{editingId ? "Edit User" : "Add User"}</div>
          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#7c86a8] transition hover:bg-[#f5f8fc]" onClick={closeEditor}>
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="grid items-start gap-4 xl:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-[#697791]">
                User Name <span className="text-[#ef4444]">*</span>
              </span>
              <Input
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Enter user name"
                className="h-10 rounded-[8px] border-[#c9d5e8]"
              />
              <span className="text-xs leading-5 text-[#8a97b1]">The name shown in activity and approval records.</span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-[#697791]">
                {editingId ? "New Password" : "Initial Password"} {!editingId ? <span className="text-[#ef4444]">*</span> : null}
              </span>
              <div className="relative">
                <Input
                  required={!editingId}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder={editingId ? "Leave blank to keep current" : "Minimum 8 characters"}
                  className="h-10 rounded-[8px] border-[#c9d5e8] pr-10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="!absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[#7c89a3] hover:text-[#23365a]"
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <span className="text-xs leading-5 text-[#8a97b1]">{editingId ? "Optional; sets a new sign-in password." : "The user will use this to sign in."}</span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-[#697791]">
                Email Address <span className="text-[#ef4444]">*</span>
              </span>
              <Input
                required
                type="email"
                autoComplete="off"
                value={form.contact}
                onChange={(event) => setForm((current) => ({ ...current, contact: event.target.value }))}
                placeholder="name@company.com"
                className="h-10 rounded-[8px] border-[#c9d5e8]"
              />
              <span className="text-xs leading-5 text-[#8a97b1]">The user will sign in with this email.</span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-[#697791]">Role</span>
              <select
                value={form.role}
                onChange={(event) => updateRole(event.target.value as UserRole)}
                className="h-10 rounded-[8px] border border-[#2477ff] bg-white px-3 text-sm font-medium text-[#23365a] outline-none"
              >
                {(["Manager", "Accountant", "Staff", "Auditor"] as const).map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <span className="text-xs leading-5 text-[#8a97b1]">You can fine-tune permissions below.</span>
            </label>
          </div>

          {showPermissions ? (
            <>
              <div className="mt-2 text-[17px] font-semibold text-[#23365a]">{form.role} Permissions</div>
              <div className="mt-2 overflow-hidden rounded-[8px] border border-[#d7dfeb]">
                <div className="grid grid-cols-[1.8fr_repeat(5,minmax(96px,1fr))] border-b border-[#e5ebf3] bg-[#f7f8fb] px-4 py-3 text-xs font-semibold tracking-[0.04em] text-[#5a6b8c]">
                  <div>Transactions</div>
                  {permissionColumns.map((column) => (
                    <div key={column.key} className="text-center text-[#136af8]">
                      {column.label}
                    </div>
                  ))}
                </div>

                <div>
                  {permissionRows.map((row) => (
                    <div key={row} className="grid grid-cols-[1.8fr_repeat(5,minmax(96px,1fr))] items-center border-b border-[#edf2f8] px-4 py-4 last:border-b-0">
                      <div className="text-[15px] font-medium text-[#23365a]">{row}</div>
                      {permissionColumns.map((column) => (
                        <div key={`${row}-${column.key}`} className="flex justify-center">
                          <PermissionBadge level={permissions[row][column.key]} onClick={() => togglePermission(row, column.key)} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-[8px] border border-dashed border-[#d7dfeb] bg-[#fafcff] px-4 py-5 text-sm text-[#74839d]">
              Enter the user name and a phone number or email — the permission table will appear here.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#d7dfeb] bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#66748f]">
            <span className="font-medium text-[#43516d]">Click a box to change access:</span>
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 stroke-[1.75] text-[#10b981]" />Allowed</span>
            <span className="inline-flex items-center gap-1.5"><TriangleAlert className="h-3.5 w-3.5 stroke-[1.5] text-[#7c86a8]" />Own records only</span>
            <span className="inline-flex items-center gap-1.5"><X className="h-3.5 w-3.5 stroke-[1.75] text-[#ff5370]" />Blocked</span>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" className="rounded-full border-[#eef1f6] px-6 text-[#66748f]" onClick={closeEditor}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSaveUser} className="rounded-full bg-primary px-7 text-white shadow-[0_12px_28px_rgba(230,120,23,0.24)] hover:bg-[#cf670f] disabled:cursor-not-allowed disabled:bg-primary/60 disabled:opacity-100">
              <CheckCircle2 className="h-5 w-5" />
              {editingId ? "Save User" : "Add User"}
            </Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d7dfeb] px-4 py-4">
          <div>
            <div className="text-[18px] font-semibold text-[#23365a]">Users &amp; Roles</div>
            <div className="mt-1 text-xs text-[#7a879d]">Add team members and control what they can view, create, edit, post or remove.</div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d7dfeb] text-[#2477ff] transition hover:bg-[#eef5ff]"
              onClick={handleRefreshSync}
              aria-label="Refresh sync status"
              title="Refresh sync status"
            >
              <RefreshCw className={cn("h-4 w-4", isSyncing ? "animate-spin" : "")} />
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-[#f3f5fb] px-4 py-2 text-sm font-medium text-[#687793] transition hover:bg-[#ebeff8]"
              onClick={() => setKnowMoreOpen(true)}
            >
              <BookOpen className="h-4 w-4" />
              Access Guide
            </button>
            <Button className="rounded-full bg-primary px-6" onClick={openCreateEditor}>
              <Plus className="mr-2 h-4 w-4" />
              Add Users
            </Button>
          </div>
        </div>

        <div className="border-b border-[#d7dfeb] px-4 py-4">
          <div className="flex items-center justify-between gap-3 rounded-[8px] bg-[#fafcff] px-3 py-3">
            <div className="min-w-0">
              <div className="text-sm text-[#8a97b1]">Currently logged in with the following {accountLabel}:</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[28px] font-semibold tracking-[0.02em] text-[#23365a]">
                <span className="truncate">{loggedInContact}</span>
                <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold", cloudSyncStatusMeta.className)}>
                  {cloudSyncStatusMeta.label}
                </span>
              </div>
            </div>
            <div className="relative shrink-0" data-sync-account-menu>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f1ff] text-[#2477ff] transition hover:bg-[#deebff]"
                onClick={() => setAccountMenuOpen((current) => !current)}
                aria-label="Account actions"
                aria-expanded={accountMenuOpen}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {accountMenuOpen ? (
                <div className="absolute right-0 top-12 z-30 min-w-[220px] overflow-hidden rounded-[14px] border border-[#d7dfeb] bg-white py-2 text-left shadow-[0_16px_36px_rgba(15,23,42,0.14)]">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#24365a] transition hover:bg-[#f7f9fd]"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      openCreateEditor();
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add User
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#24365a] transition hover:bg-[#f7f9fd]"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      handleRefreshSync();
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh Sync Status
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#24365a] transition hover:bg-[#f7f9fd]"
                    onClick={() => void copyAccountId()}
                  >
                    <Copy className="h-4 w-4" />
                    Copy Account {accountLabel === "email" ? "Email" : "Number"}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#24365a] transition hover:bg-[#f7f9fd]"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setKnowMoreOpen(true);
                    }}
                  >
                    <Info className="h-4 w-4" />
                    About Sync &amp; Share
                  </button>
                  {mode === "api" ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 border-t border-[#edf1f7] px-4 py-2.5 text-sm text-[#24365a] transition hover:bg-[#f7f9fd]"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        void logout("api").catch(() => undefined).finally(() => {
                          clearSession("api");
                          router.push("/login");
                        });
                      }}
                    >
                      <LogIn className="h-4 w-4" />
                      Switch User
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {isLoadingUsers ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-14 text-sm text-[#74839d]">
            Loading shared users...
          </div>
        ) : !users.length ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-14 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#f5f7fb] text-[#c9d2e3]">
              <BookUser className="h-10 w-10" />
            </div>
            <div className="mt-6 text-[17px] font-semibold text-[#23365a]">You have not added any users till now.</div>
            <div className="mt-1 max-w-[460px] text-sm leading-6 text-[#74839d]">
              Add users, assign roles and let your employees manage your business with controlled access.
            </div>
            <Button className="mt-6 rounded-full bg-primary px-7" onClick={openCreateEditor}>
              <Plus className="mr-2 h-4 w-4" />
              Add Users
            </Button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-[#677892]">
                {visibleUsers.length} of {users.length} user{users.length === 1 ? "" : "s"}
              </div>
              <CollapsibleSearch
                value={search}
                onChange={setSearch}
                label="Search users"
                placeholder="Search name, contact, role..."
                expandedWidth="w-[260px]"
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] border border-[#d7dfeb]">
              <div className="grid grid-cols-[1.2fr_1fr_130px_170px_110px_96px] border-b border-[#e5ebf3] bg-[#f7f8fb] px-4 py-3 text-xs font-semibold uppercase tracking-[0.04em] text-[#5a6b8c]">
                <div>Name</div>
                <div>Contact</div>
                <div>Role</div>
                <div>Last Updated</div>
                <div className="text-right">Status</div>
                <div className="flex justify-end"><MoreVertical className="h-4 w-4" aria-label="More actions" /></div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {visibleUsers.length ? (
                  visibleUsers.map((user) => (
                    <div
                      key={user.id}
                      className="grid grid-cols-[1.2fr_1fr_130px_170px_110px_96px] items-center border-b border-[#edf2f8] px-4 py-3.5 text-left transition last:border-b-0 hover:bg-[#fbfdff]"
                    >
                      <div className="truncate font-medium text-[#23365a]">{user.name}</div>
                      <div className="truncate text-sm text-[#677892]">{user.contact}</div>
                      <div className="text-sm text-[#23365a]">{user.role}</div>
                      <div className="text-sm text-[#677892]">{formatSavedSyncStamp(user.lastSync)}</div>
                      <div className="text-right">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                            user.status === "Active" ? "bg-[#ecfdf5] text-[#0f9f63]" : "bg-[#fff8e7] text-[#c76925]",
                          )}
                        >
                          {user.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d7dfeb] text-[#61708a] transition hover:bg-[#f4f7fb]"
                          onClick={() => openEditEditor(user)}
                          aria-label={`Edit ${user.name}`}
                          title="Edit user and permissions"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d7dfeb] text-[#61708a] transition hover:bg-[#f4f7fb] disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void handleResetPassword(user)}
                          disabled={resettingUserId === user.id}
                          aria-label={`Reset password for ${user.name}`}
                          title="Give this user a new password"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d7dfeb] text-[#d34848] transition hover:bg-[#fff3f3]"
                          onClick={() => setRemoveTarget(user)}
                          aria-label={`Remove ${user.name}`}
                          title="Remove user"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-[#8994a6]">No user matches &quot;{search}&quot;.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={knowMoreOpen} onOpenChange={setKnowMoreOpen}>
        <DialogContent className="w-[min(92vw,540px)]">
          <DialogTitle className="text-lg font-semibold text-[#23365a]">Users, roles and approvals</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-6 text-[#697791]">
            Sync &amp; Share lets you add the people who work in this business and decide exactly what each of them can see and
            change.
          </DialogDescription>

          <div className="mt-4 space-y-3 text-sm leading-6 text-[#4a5a75]">
            <div className="rounded-[12px] border border-[#e5eaf2] bg-[#fbfcff] px-4 py-3">
              <div className="font-semibold text-[#23365a]">How to give a staff member access</div>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li>Press <strong>Add Users</strong>, enter their name and email, and pick a role.</li>
                <li>A password appears once — copy it and send it to them.</li>
                <li>
                  On their computer they open Bizovix, choose <strong>Switch User</strong> from the Company menu, and sign in with
                  that email and password.
                </li>
                <li>Lost the password? Use the key button on their row to issue a new one.</li>
              </ol>
            </div>
            <div className="rounded-[12px] border border-[#e5eaf2] bg-[#fbfcff] px-4 py-3">
              <div className="font-semibold text-[#23365a]">Roles</div>
              <div className="mt-1">
                <strong>Manager</strong> manages daily operations and approvals, <strong>Accountant</strong> handles books and posting,{" "}
                <strong>Staff</strong> creates assigned entries, and <strong>Auditor</strong> has review-focused access.
              </div>
            </div>
            <div className="rounded-[12px] border border-[#e5eaf2] bg-[#fbfcff] px-4 py-3">
              <div className="font-semibold text-[#23365a]">Permissions</div>
              <div className="mt-1">
                Every role starts from a sensible default that you can fine-tune. Tap an icon in the permission table to switch
                between allowed, limited, and blocked. The server enforces what you set here, not just the screen.
              </div>
            </div>
            <div className="rounded-[12px] border border-[#e5eaf2] bg-[#fbfcff] px-4 py-3">
              <div className="font-semibold text-[#23365a]">How approval works</div>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li>Staff creates and submits a voucher; it remains <strong>Pending</strong>.</li>
                <li>An Owner, Manager, or Accountant with posting permission opens <strong>Reports → Day Book</strong>.</li>
                <li>Open the Pending voucher, review its details, then choose <strong>Approve &amp; Post</strong> or <strong>Reject</strong>.</li>
              </ol>
            </div>
            <div className="rounded-[12px] border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-[#31507a]">
              Only you, the workspace owner, can add, edit, or remove users. Staff members see only this workspace and cannot
              manage each other.
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end">
            <Button type="button" className="rounded-full bg-primary px-7" onClick={() => setKnowMoreOpen(false)}>
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => (open ? null : setRemoveTarget(null))}>
        <DialogContent className="w-[min(92vw,460px)]" submitOnEnter>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fdece9] text-[#c43d34]">
              <TriangleAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold text-[#23365a]">Remove this user?</DialogTitle>
              <DialogDescription className="mt-1.5 text-sm leading-6 text-[#697791]">
                They will lose access to this workspace and their saved permissions will be deleted. This cannot be undone.
              </DialogDescription>
            </div>
          </div>

          {removeTarget ? (
            <div className="mt-4 rounded-[14px] border border-[#e5eaf2] bg-[#fbfcff] px-4 py-3">
              <div className="text-sm font-semibold text-[#23365a]">{removeTarget.name}</div>
              <div className="mt-0.5 text-xs text-[#7d8aa2]">
                {removeTarget.contact} · {removeTarget.role} · {removeTarget.status}
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-end gap-3">
            <Button type="button" variant="outline" className="rounded-full border-[#eef1f6] px-6 text-[#66748f]" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <button
              type="button"
              data-enter-submit
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#cf670f]"
              onClick={confirmRemoveUser}
            >
              <Trash2 className="h-4 w-4" />
              Yes, remove
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(inviteCredentials)} onOpenChange={(open) => (open ? null : setInviteCredentials(null))}>
        <DialogContent className="w-[min(92vw,500px)]">
          <DialogTitle className="text-lg font-semibold text-[#23365a]">User sign-in details are ready</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-6 text-[#697791]">
            This is not a license or activation code. Share it privately with the user; the initial password is shown only once.
          </DialogDescription>

          {inviteCredentials ? (
            <div className="mt-4 grid gap-3 rounded-[14px] border border-[#dbeafe] bg-[#f8fbff] px-4 py-4 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.04em] text-[#7182a0]">User</div>
                <div className="mt-1 font-semibold text-[#23365a]">{inviteCredentials.name}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.04em] text-[#7182a0]">Email</div>
                <div className="mt-1 font-medium text-[#23365a]">{inviteCredentials.email}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.04em] text-[#7182a0]">Initial Password</div>
                <div className="mt-1 rounded-[8px] border border-[#cad7ea] bg-white px-3 py-2 font-mono text-[13px] font-semibold text-[#23365a]">
                  {inviteCredentials.password}
                </div>
              </div>
            </div>
          ) : null}

          {networkInfo?.allowLan && networkInfo.addresses.length > 0 ? (
            <div className="mt-4 rounded-xl border border-[#e3e9f2] bg-white px-4 py-3 text-xs leading-5 text-[#60708a]">
              On the other computer, open Bizovix and choose <strong>Connect to another computer on this network</strong> using this address:
              <ul className="mt-2 space-y-1">
                {networkInfo.addresses.map((entry) => (
                  <li key={entry.address} className="font-mono font-semibold text-[#23365a]">{entry.address} <span className="font-sans font-normal text-[#8a97b1]">({entry.name})</span></li>
                ))}
              </ul>
              Then sign in with this email and initial password. Only do this on a network you trust — never on public/guest Wi-Fi.
            </div>
          ) : window.desktopApp?.isDesktop ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#f6dfb8] bg-[#fffaf1] px-4 py-3 text-xs leading-5 text-[#8a5a1d]">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                This computer isn't sharing its data on the network yet, so another PC can't sign in as this user until you turn that on.
                <Button type="button" variant="outline" className="mt-2 h-8 rounded-full px-4 text-xs" disabled={togglingLanSharing} onClick={() => void handleEnableLanSharing()}>
                  {togglingLanSharing ? "Turning on…" : "Allow other computers on this network to connect"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-[#e3e9f2] bg-white px-4 py-3 text-xs leading-5 text-[#60708a]">
              On another authorized PC connected to the same company server/data, open Bizovix, choose <strong>Switch User</strong>, then enter this email and initial password on the sign-in page.
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-3">
            <Button type="button" variant="outline" className="rounded-full border-[#eef1f6] px-6 text-[#66748f]" onClick={() => setInviteCredentials(null)}>
              Close
            </Button>
            <Button type="button" className="rounded-full bg-primary px-7" onClick={() => void copyInviteCredentials()}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Sign-in Details
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
