"use client";
import * as React from "react";
import { LogOut } from "lucide-react";
import { SecondaryButton, TextInput } from "@bizovix/ui";
import {
  useActiveSessions,
  useRevokeSession,
  useSecuritySettings,
  useUpdateSecuritySettings,
} from "@bizovix/api-client";
import type { SaveSecuritySettingInput } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Field, SaveBar, SettingsCard, SettingsSectionHeader, ToggleRow, isDirty, useSettingsNotice, useSyncedForm } from "./shared";

export function SecuritySettingsPanel() {
  useSetBreadcrumb([{ label: "Settings", href: "/settings" }, { label: "Security" }]);
  const query = useSecuritySettings();
  const update = useUpdateSecuritySettings();
  const sessions = useActiveSessions();
  const revoke = useRevokeSession();
  const { notify, Notice } = useSettingsNotice();
  const [form, setForm] = useSyncedForm(query.data, toInput);

  function toInput(d: NonNullable<typeof query.data>): SaveSecuritySettingInput {
    return {
      minPasswordLength: d.minPasswordLength,
      requireUppercase: d.requireUppercase,
      requireLowercase: d.requireLowercase,
      requireNumber: d.requireNumber,
      requireSpecialChar: d.requireSpecialChar,
      sessionTimeoutMinutes: d.sessionTimeoutMinutes,
      maxFailedLoginAttempts: d.maxFailedLoginAttempts,
      accountLockDurationMinutes: d.accountLockDurationMinutes,
      forcePasswordChangeDays: d.forcePasswordChangeDays ?? undefined,
      twoFactorEnabled: d.twoFactorEnabled,
    };
  }

  const dirty = !!(query.data && form && isDirty(toInput(query.data), form));

  async function save() {
    if (!form) return;
    try {
      await update.mutateAsync(form);
      notify("Security settings updated successfully.");
    } catch {
      notify("Failed to update security settings.");
    }
  }

  if (query.isLoading || !form) return <div className="h-96 animate-pulse rounded-lg bg-slate-100" />;

  return (
    <div className="flex flex-col gap-4">
      {Notice}
      <SettingsSectionHeader
        title="Security Settings"
        description="Password policy, session limits and account lockout rules enforced by the authentication service."
      />
      <SettingsCard title="Password Policy">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Minimum Password Length">
            <TextInput type="number" min={6} max={32} value={form.minPasswordLength} onChange={(e) => setForm({ ...form, minPasswordLength: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <ToggleRow label="Require Uppercase" checked={form.requireUppercase} onChange={(v) => setForm({ ...form, requireUppercase: v })} />
          <ToggleRow label="Require Lowercase" checked={form.requireLowercase} onChange={(v) => setForm({ ...form, requireLowercase: v })} />
          <ToggleRow label="Require Number" checked={form.requireNumber} onChange={(v) => setForm({ ...form, requireNumber: v })} />
          <ToggleRow label="Require Special Character" checked={form.requireSpecialChar} onChange={(v) => setForm({ ...form, requireSpecialChar: v })} />
        </div>
      </SettingsCard>
      <SettingsCard title="Session & Login">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Session Timeout (minutes)">
            <TextInput type="number" min={5} value={form.sessionTimeoutMinutes} onChange={(e) => setForm({ ...form, sessionTimeoutMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Maximum Failed Login Attempts">
            <TextInput type="number" min={3} value={form.maxFailedLoginAttempts} onChange={(e) => setForm({ ...form, maxFailedLoginAttempts: Number(e.target.value) })} />
          </Field>
          <Field label="Account Lock Duration (minutes)">
            <TextInput type="number" min={1} value={form.accountLockDurationMinutes} onChange={(e) => setForm({ ...form, accountLockDurationMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Force Password Change (days)" hint="Leave blank to disable">
            <TextInput
              type="number"
              min={1}
              value={form.forcePasswordChangeDays ?? ""}
              onChange={(e) => setForm({ ...form, forcePasswordChangeDays: e.target.value ? Number(e.target.value) : undefined })}
            />
          </Field>
        </div>
        <div className="mt-3">
          <ToggleRow
            label="Two-Factor Authentication"
            hint="Configuration readiness only — 2FA verification is not yet implemented in this build."
            checked={form.twoFactorEnabled}
            onChange={(v) => setForm({ ...form, twoFactorEnabled: v })}
          />
        </div>
        <div className="mt-5">
          <SaveBar dirty={dirty} saving={update.isPending} onSave={save} onReset={() => query.data && setForm(toInput(query.data))} />
        </div>
      </SettingsCard>
      <SettingsCard title="Active Sessions" description="Sessions signed in as you, on this and other devices.">
        {sessions.isLoading ? (
          <div className="h-32 animate-pulse rounded bg-slate-100" />
        ) : (
          <div className="divide-y divide-biz-border">
            {(sessions.data ?? []).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-biz-text">{s.userAgent ?? "Unknown device"}</p>
                  <p className="text-[10px] text-biz-muted">
                    {s.ipAddress ?? "Unknown IP"} · Signed in {new Date(s.createdAt).toLocaleString()}
                  </p>
                </div>
                <SecondaryButton onClick={() => revoke.mutate(s.id)} disabled={revoke.isPending}>
                  <LogOut className="h-3.5 w-3.5" />
                  Revoke
                </SecondaryButton>
              </div>
            ))}
            {!sessions.data?.length && <p className="py-6 text-center text-biz-muted">No active sessions.</p>}
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
