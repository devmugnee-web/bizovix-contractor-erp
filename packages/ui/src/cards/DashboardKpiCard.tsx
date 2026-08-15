import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

export interface DashboardKpiCardProps {
  index: number;
  title: string;
  icon: LucideIcon;
  iconClassName: string;
  value: string;
  valueClassName?: string;
  children?: React.ReactNode;
}

export function DashboardKpiCard({
  index,
  title,
  icon: Icon,
  iconClassName,
  value,
  valueClassName,
  children,
}: DashboardKpiCardProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-biz-border bg-biz-surface p-1.5 shadow-card sm:p-2 lg:gap-1.5 lg:p-2">
      <div className="flex min-w-0 items-start gap-1 sm:gap-1.5">
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded sm:h-6 sm:w-6 lg:h-7 lg:w-7 lg:rounded-md",
            iconClassName,
          )}
        >
          <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </span>
        <span className="min-w-0 whitespace-normal break-words text-[9px] font-semibold leading-tight text-biz-muted sm:text-[10px] lg:text-[11px]">
          {index}. {title}
        </span>
      </div>
      <div className={cn("whitespace-normal break-words text-[12px] font-bold leading-tight text-biz-text sm:text-[13px] lg:text-[16px]", valueClassName)}>
        {value}
      </div>
      {children && (
        <div className="hidden whitespace-normal break-words text-[9px] font-medium leading-tight text-biz-muted sm:block lg:text-[10px]">{children}</div>
      )}
    </div>
  );
}
