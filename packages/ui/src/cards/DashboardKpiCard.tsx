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
    <div className="group relative flex h-[clamp(88px,15.5vh,112px)] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/50 p-2 shadow-[0_6px_18px_rgba(15,23,42,0.055)] transition-all duration-200 hover:-translate-y-px hover:border-biz-blue/20 hover:shadow-[0_10px_24px_rgba(15,23,42,0.085)] xl:p-2.5 2xl:h-[132px] 2xl:p-3">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-biz-blue/25 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex min-h-7 min-w-0 items-start gap-1.5">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-black/[0.03] xl:h-7 xl:w-7 2xl:h-8 2xl:w-8",
            iconClassName,
          )}
        >
          <Icon className="h-3.5 w-3.5 2xl:h-4 2xl:w-4" strokeWidth={1.8} />
        </span>
        <span
          title={`${index}. ${title}`}
          className="min-w-0 whitespace-normal text-[9px] font-semibold leading-[1.25] text-slate-600 sm:text-[10px] xl:text-[11px] 2xl:text-[12px]"
        >
          {index}. {title}
        </span>
      </div>
      <div
        title={value}
        className={cn(
          "mt-1 min-h-[22px] whitespace-nowrap text-[11px] font-bold leading-[1.05] tracking-[-0.02em] text-biz-text sm:text-[12px] xl:text-[13px] 2xl:mt-2 2xl:text-[17px]",
          valueClassName,
        )}
      >
        {value}
      </div>
      {children && (
        <div className="mt-auto whitespace-normal text-[8px] font-medium leading-[1.3] text-slate-600 sm:text-[9px] xl:text-[9px] 2xl:text-[10px]">
          {children}
        </div>
      )}
    </div>
  );
}
