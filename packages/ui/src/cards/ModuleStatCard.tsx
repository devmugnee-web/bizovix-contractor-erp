import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

export interface ModuleStatCardProps {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: string;
  helper?: string;
  /** Keeps dense KPI rows readable when several cards must remain on one line. */
  compact?: boolean;
}

export function ModuleStatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  helper,
  compact = false,
}: ModuleStatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-4 rounded-md border border-biz-border bg-biz-surface p-4 shadow-card",
        compact &&
          "min-w-0 gap-0.5 overflow-hidden p-0.5 sm:gap-1 sm:p-1 lg:p-1.5 xl:gap-1.5 xl:p-2",
      )}
    >
      <span
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
          compact && "hidden h-7 w-7 sm:flex lg:h-8 lg:w-8 2xl:h-9 2xl:w-9",
          iconClassName,
        )}
      >
        <Icon className={cn("h-5 w-5", compact && "h-3 w-3 lg:h-3.5 lg:w-3.5")} />
      </span>
      <div className={cn("flex flex-col gap-0.5", compact && "min-w-0 flex-1 gap-0")}>
        <span
          title={label}
          className={cn(
            "text-[13px] text-biz-muted",
            compact && "truncate text-[7px] leading-tight sm:text-[8px] lg:text-[9px] xl:text-[10px]",
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "text-[22px] font-bold leading-none text-biz-text",
            compact && "truncate text-[12px] sm:text-[14px] lg:text-[15px] xl:text-[17px]",
          )}
        >
          {value}
        </span>
        {helper && (
          <span
            title={helper}
            className={cn(
              "text-[11px] text-biz-muted",
              compact && "hidden truncate text-[8px] leading-tight 2xl:block",
            )}
          >
            {helper}
          </span>
        )}
      </div>
    </div>
  );
}
