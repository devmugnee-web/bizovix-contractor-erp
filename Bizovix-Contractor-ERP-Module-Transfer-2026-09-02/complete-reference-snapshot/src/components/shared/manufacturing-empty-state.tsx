import { Cog, Factory, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The manufacturing module's empty state, alongside the LC and HR ones. The
 * illustration is an idle conveyor: whatever the screen was going to show sits
 * waiting above a belt that has nothing on it yet. Pass the icon that matches the
 * screen (a lot, a serial, a work order) so the picture says which line is idle.
 */
export function ManufacturingEmptyState({
  icon: Icon = Factory,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[#cbd9ea] bg-white px-6 text-center",
        compact ? "min-h-[180px] py-6" : "min-h-[260px] py-9",
        className,
      )}
    >
      <div className={cn("relative mb-4 w-40", compact ? "h-[68px]" : "h-20")} aria-hidden="true">
        <div className="absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-[18px] border border-[#c9dcf6] bg-white text-[#1f73d8] shadow-[0_10px_26px_rgba(31,115,216,0.16)]">
          <Icon className="h-7 w-7" strokeWidth={1.7} />
        </div>
        <div className="absolute bottom-4 left-2 right-2 h-1.5 rounded-full bg-[#dbe7f6]" />
        <div className="absolute bottom-0 left-3 right-3 flex items-center justify-between text-[#b6cfec]">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-current" />
          <span className="h-2.5 w-2.5 rounded-full border-2 border-current" />
          <span className="h-2.5 w-2.5 rounded-full border-2 border-current" />
          <span className="h-2.5 w-2.5 rounded-full border-2 border-current" />
        </div>
        <Cog className="absolute right-0 top-2 h-4 w-4 text-[#e78a11]" strokeWidth={1.9} />
      </div>
      <h3 className="text-sm font-semibold text-[#14233b]">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-xs leading-5 text-[#6f7d91]">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button type="button" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
