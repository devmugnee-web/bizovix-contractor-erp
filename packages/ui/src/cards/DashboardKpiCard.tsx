import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

export interface DashboardKpiCardProps {
  index: number;
  title: string;
  icon: LucideIcon;
  iconClassName: string;
  solidClassName?: string;
  value: string;
  valueClassName?: string;
  children?: React.ReactNode;
}

export function DashboardKpiCard({
  index,
  title,
  icon: Icon,
  iconClassName,
  solidClassName,
  value,
  valueClassName,
  children,
}: DashboardKpiCardProps) {
  const isSolid = Boolean(solidClassName);

  return (
    <div
      className={cn(
        "group relative flex h-[clamp(88px,15.5vh,112px)] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 p-2 shadow-[0_6px_18px_rgba(15,23,42,0.055)] transition-all duration-200 hover:-translate-y-px hover:border-biz-blue/20 hover:shadow-[0_10px_24px_rgba(15,23,42,0.085)] 2xl:h-[132px] 2xl:p-3",
        isSolid ? "bg-none" : "bg-gradient-to-br from-white via-white to-slate-50/50",
        solidClassName,
      )}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-biz-blue/25 to-transparent opacity-0 transition-opacity group-hover:opacity-100",
          isSolid && "via-white/70",
        )}
      />
      <div className="flex min-h-6 min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-black/[0.03] lg:h-6 lg:w-6 2xl:h-7 2xl:w-7",
            iconClassName,
            isSolid && "bg-white text-slate-800 shadow-sm ring-white",
          )}
        >
          <Icon className="h-3 w-3 lg:h-3.5 lg:w-3.5 2xl:h-4 2xl:w-4" strokeWidth={2.25} />
        </span>
        <span
          title={title}
          className={cn(
            "min-w-0 flex-1 whitespace-nowrap text-[9px] font-bold leading-none tracking-[-0.025em] text-slate-700 sm:text-[9.5px] lg:text-[10px] xl:text-[10.5px] 2xl:text-[12px]",
            isSolid && "text-white",
          )}
        >
          {title}
        </span>
      </div>
      <div
        title={value}
        className={cn(
          "my-0.5 flex min-h-[20px] min-w-0 flex-1 items-center justify-center truncate whitespace-nowrap text-center text-[10px] font-bold leading-none tracking-[-0.015em] text-biz-text sm:text-[11px] lg:text-[12px] xl:text-[14px] 2xl:my-1.5 2xl:text-[18px]",
          valueClassName,
          isSolid && "text-white",
        )}
      >
        {value}
      </div>
      {children && (
        <div
          className={cn(
            "mt-auto flex min-h-[18px] items-end justify-center whitespace-normal text-center text-[8px] font-semibold leading-[1.2] text-slate-600 sm:text-[8.25px] lg:text-[8.5px] xl:text-[9px] 2xl:min-h-[24px] 2xl:text-[10.5px]",
            isSolid && "text-white/90 [&_span]:!text-white/90",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
