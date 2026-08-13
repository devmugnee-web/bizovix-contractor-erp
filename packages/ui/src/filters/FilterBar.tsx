import * as React from "react";
import { cn } from "../lib/cn";

export interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn("rounded-lg border border-biz-border bg-biz-surface p-4", className)}>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </div>
  );
}
