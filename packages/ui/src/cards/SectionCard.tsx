import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/cn";

export interface SectionCardProps {
  title: string;
  index?: number;
  headerRight?: React.ReactNode;
  footer?: { label: string; onClick?: () => void };
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
    <div className={cn("flex flex-col rounded-lg border border-biz-border bg-biz-surface shadow-card", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-biz-border px-4 py-3">
        <h3 className="text-[15px] font-semibold text-biz-text">
          {index !== undefined && <span className="text-biz-muted">{index}. </span>}
          {title}
        </h3>
        {headerRight}
      </div>
      <div className={cn("flex-1 p-4", bodyClassName)}>{children}</div>
      {footer && (
        <div className="border-t border-biz-border px-4 py-2.5">
          <button
            type="button"
            onClick={footer.onClick}
            className="flex w-full items-center justify-between text-[13px] font-medium text-biz-blue hover:text-biz-blue-hover"
          >
            {footer.label}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
