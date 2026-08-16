"use client";
import { Building2, FolderKanban, HardDrive, Users } from "lucide-react";
import type { UsageSummary } from "@bizovix/types";
import { ProgressBar } from "./shared";

function tile(
  icon: React.ReactNode,
  label: string,
  used: string,
  limit: string,
  percent: number | null,
) {
  return (
    <div className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
      <div className="flex items-center gap-2 text-biz-muted">
        {icon}
        <span className="text-[11px] font-semibold">{label}</span>
      </div>
      <p className="mt-2 text-[16px] font-bold text-biz-text">
        {used} <span className="text-[12px] font-medium text-biz-muted">/ {limit}</span>
      </p>
      {percent !== null && (
        <div className="mt-2">
          <ProgressBar percent={percent} tone={percent >= 90 ? "red" : percent >= 70 ? "orange" : "blue"} />
        </div>
      )}
    </div>
  );
}

export function UsageCards({ usage }: { usage: UsageSummary }) {
  const userPercent = usage.users.limit ? (usage.users.used / usage.users.limit) * 100 : null;
  const projectPercent = usage.projects.limit ? (usage.projects.used / usage.projects.limit) * 100 : null;
  const storagePercent = usage.storage.limitMb ? (usage.storage.usedMb / usage.storage.limitMb) * 100 : null;
  const companyPercent = usage.companies.limit ? (usage.companies.used / usage.companies.limit) * 100 : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tile(<Users className="h-4 w-4" />, "Users", String(usage.users.used), usage.users.limit == null ? "Unlimited" : String(usage.users.limit), userPercent)}
      {tile(
        <FolderKanban className="h-4 w-4" />,
        "Projects / Works",
        String(usage.projects.used),
        usage.projects.limit == null ? "Unlimited" : String(usage.projects.limit),
        projectPercent,
      )}
      {tile(
        <HardDrive className="h-4 w-4" />,
        "Storage",
        `${usage.storage.usedMb < 1024 ? `${usage.storage.usedMb} MB` : `${(usage.storage.usedMb / 1024).toFixed(1)} GB`}`,
        usage.storage.limitMb == null ? "Unlimited" : usage.storage.limitMb < 1024 ? `${usage.storage.limitMb} MB` : `${(usage.storage.limitMb / 1024).toFixed(0)} GB`,
        storagePercent,
      )}
      {tile(<Building2 className="h-4 w-4" />, "Companies", String(usage.companies.used), usage.companies.limit == null ? "Unlimited" : String(usage.companies.limit), companyPercent)}
    </div>
  );
}
