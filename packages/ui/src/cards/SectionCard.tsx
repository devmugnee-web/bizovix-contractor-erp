import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/cn";

export interface SectionCardProps {
  title: string;
  index?: number;
  headerRight?: React.ReactNode;
  footer?: { label: string; href?: string; onClick?: () => void };
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export function SectionCard({
  title,
  index,
  headerRight,
  footer,
  className,
  bodyClassName,
  children,
}: SectionCardProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.05)]",
        className,
      )}
    >
      <div className="flex min-h-9 items-center justify-between gap-1 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-white px-2 py-1.5 sm:px-3 2xl:min-h-11 2xl:px-4 2xl:py-2">
        <h3 className="min-w-0 truncate text-[10px] font-bold leading-tight tracking-[-0.01em] text-biz-text sm:text-[11px] lg:text-[12px] 2xl:text-[14px]">
          {index !== undefined && <span className="mr-1 text-biz-blue/70">{index}.</span>}
          {title}
        </h3>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>
      <div className={cn("min-h-0 flex-1 p-2 sm:p-3 2xl:p-4", bodyClassName)}>{children}</div>
      {footer && (
        <div className="border-t border-slate-100 bg-slate-50/45 px-2 py-1 sm:px-3 2xl:px-4 2xl:py-1.5">
          {footer.href ? (
            <a
              href={footer.href}
              className="group/link flex w-full items-center justify-between text-[9px] font-semibold text-biz-blue transition-colors hover:text-biz-blue-hover lg:text-[11px] 2xl:text-[12px]"
            >
              {footer.label}
              <ChevronRight className="h-3 w-3 transition-transform group-hover/link:translate-x-0.5" />
            </a>
          ) : (
            <button
              type="button"
              onClick={footer.onClick}
              className="group/link flex w-full items-center justify-between text-[9px] font-semibold text-biz-blue transition-colors hover:text-biz-blue-hover lg:text-[11px] 2xl:text-[12px]"
            >
              {footer.label}
              <ChevronRight className="h-3 w-3 transition-transform group-hover/link:translate-x-0.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
