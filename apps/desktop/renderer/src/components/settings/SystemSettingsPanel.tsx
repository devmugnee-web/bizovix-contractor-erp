"use client";
import * as React from "react";
import { StatusBadge } from "@bizovix/ui";
import { useSystemSettings, useUpdateSystemSettings } from "@bizovix/api-client";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { SaveBar, SettingsCard, SettingsSectionHeader, ToggleRow, useSettingsNotice } from "./shared";

function StatusPill({ status }: { status: "ONLINE" | "OFFLINE" }) {
  return <StatusBadge label={status} tone={status === "ONLINE" ? "success" : "danger"} />;
}

export function SystemSettingsPanel() {
  useSetBreadcrumb([{ label: "Settings", href: "/settings" }, { label: "System" }]);
  const query = useSystemSettings();
  const update = useUpdateSystemSettings();
  const { notify, Notice } = useSettingsNotice();
  const [maintenanceMode, setMaintenanceMode] = React.useState<boolean | null>(null);
  const [loadedFrom, setLoadedFrom] = React.useState<typeof query.data>(undefined);

  if (query.data && query.data !== loadedFrom) {
    setLoadedFrom(query.data);
    setMaintenanceMode(query.data.maintenanceMode);
  }

  const dirty = query.data && maintenanceMode !== null && maintenanceMode !== query.data.maintenanceMode;

  async function save() {
    if (maintenanceMode === null) return;
    try {
      await update.mutateAsync({ maintenanceMode, featureToggles: query.data?.featureToggles ?? undefined });
      notify("System settings updated successfully.");
    } catch {
      notify("Failed to update system settings.");
    }
  }

  if (query.isLoading || !query.data) return <div className="h-80 animate-pulse rounded-lg bg-slate-100" />;

  const info = [
    ["Application Name", query.data.appName],
    ["Application Version", query.data.appVersion],
    ["Environment", query.data.environment],
    ["Default Page Size", String(query.data.defaultPageSize)],
  ];

  return (
    <div className="flex flex-col gap-4">
      {Notice}
      <SettingsSectionHeader
        title="System Settings"
        description="Read-only system status and administrator-only configuration. No secrets are ever exposed here."
      />
      <SettingsCard title="System Information">
        <dl className="grid gap-4 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
          {info.map(([label, value]) => (
            <div key={label}>
              <dt className="font-semibold text-biz-muted">{label}</dt>
              <dd className="mt-1 font-bold text-biz-text">{value}</dd>
            </div>
          ))}
          <div>
            <dt className="font-semibold text-biz-muted">Database Status</dt>
            <dd className="mt-1">
              <StatusPill status={query.data.databaseStatus} />
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-biz-muted">API Status</dt>
            <dd className="mt-1">
              <StatusPill status={query.data.apiStatus} />
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-biz-muted">Storage Status</dt>
            <dd className="mt-1">
              <StatusPill status={query.data.storageStatus} />
            </dd>
          </div>
        </dl>
      </SettingsCard>
      <SettingsCard title="Configuration">
        <ToggleRow
          label="Maintenance Mode"
          hint="When enabled, only administrators should be able to sign in (enforced by the app shell)."
          checked={maintenanceMode ?? false}
          onChange={setMaintenanceMode}
        />
        <div className="mt-5">
          <SaveBar dirty={!!dirty} saving={update.isPending} onSave={save} onReset={() => setMaintenanceMode(query.data!.maintenanceMode)} />
        </div>
      </SettingsCard>
    </div>
  );
}
