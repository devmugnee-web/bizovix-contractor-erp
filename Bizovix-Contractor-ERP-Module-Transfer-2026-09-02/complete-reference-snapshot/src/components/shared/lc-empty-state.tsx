import { Anchor, ShipWheel, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LcEmptyState({
  icon: Icon = ShipWheel,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[#cbd9ea] bg-white px-6 text-center",
      compact ? "min-h-[220px] py-7" : "min-h-[300px] py-10",
      className,
    )}>
      <div className="relative mb-5 h-24 w-40" aria-hidden="true">
        <div className="absolute left-1/2 top-0 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-[20px] border border-[#c9dcf6] bg-white text-[#0f6cf6] shadow-[0_12px_30px_rgba(15,108,246,0.14)]">
          <Icon className="h-8 w-8" strokeWidth={1.7} />
        </div>
        <div className="absolute bottom-3 left-3 right-3 h-px bg-[#b8d0ee]" />
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-1 text-[#8db5e8]">
          <span className="h-2 w-10 rounded-full bg-current opacity-40" />
          <span className="h-2 w-16 rounded-full bg-current opacity-65" />
          <span className="h-2 w-10 rounded-full bg-current opacity-40" />
        </div>
        <Anchor className="absolute bottom-5 right-1 h-5 w-5 text-[#e78a11]" strokeWidth={1.8} />
      </div>
      <h3 className="text-base font-semibold text-[#14233b]">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-[#6f7d91]">{description}</p>
      {actionLabel && onAction ? <Button type="button" size="sm" className="mt-4" onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  );
}
