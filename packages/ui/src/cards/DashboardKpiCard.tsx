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
    <div className="group relative flex h-[clamp(82px,15.5vh,108px)] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/50 p-2 shadow-[0_6px_18px_rgba(15,23,42,0.055)] transition-all duration-200 hover:-translate-y-px hover:border-biz-blue/20 hover:shadow-[0_10px_24px_rgba(15,23,42,0.085)] xl:p-2.5">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-biz-blue/25 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex min-h-7 min-w-0 items-start gap-1.5">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-black/[0.03] xl:h-7 xl:w-7",
            iconClassName,
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 whitespace-normal break-words text-[8px] font-semibold leading-[1.2] text-slate-500 xl:text-[9px]">
          {index}. {title}
        </span>
      </div>
      <div className={cn("mt-1 min-h-[22px] whitespace-normal break-words text-[11px] font-bold leading-[1.05] tracking-[-0.02em] text-biz-text sm:text-[12px] xl:text-[15px]", valueClassName)}>
        {value}
      </div>
      {children && (
        <div className="mt-auto whitespace-normal break-words text-[6px] font-medium leading-[1.2] text-slate-500 sm:text-[7px] xl:text-[8px]">{children}</div>
      )}
    </div>
  );
}
