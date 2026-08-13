import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

export interface ModuleStatCardProps {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: string;
  helper?: string;
}

export function ModuleStatCard({ icon: Icon, iconClassName, label, value, helper }: ModuleStatCardProps) {
  return (
    <div className="flex flex-1 items-center gap-4 rounded-md border border-biz-border bg-biz-surface p-4 shadow-card">
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", iconClassName)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-biz-muted">{label}</span>
        <span className="text-[22px] font-bold leading-none text-biz-text">{value}</span>
        {helper && <span className="text-[11px] text-biz-muted">{helper}</span>}
      </div>
    </div>
  );
}
