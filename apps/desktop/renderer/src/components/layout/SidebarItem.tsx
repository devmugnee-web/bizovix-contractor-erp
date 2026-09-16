import Link from "next/link";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@bizovix/ui";

export interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  subtitle?: string;
  href?: string;
  active?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  badge?: number;
}

export function SidebarItem({
  icon: Icon,
  label,
  subtitle,
  href,
  active,
  expandable,
  expanded,
  onToggle,
  badge,
}: SidebarItemProps) {
  // A parent is "split" (navigable label + separate expand toggle) only when it both
  // expands AND was explicitly given an href — existing expand-only groups have no
  // href on the parent, so they keep their original pure-toggle behavior untouched.
  const isSplitRow = expandable && !!href;

  const rowShell = cn(
    "group relative flex w-full items-center overflow-hidden rounded-lg text-left text-[12px] font-semibold leading-none",
    "transition-all duration-200 ease-out",
    active
      ? "bg-biz-blue text-white shadow-[0_3px_10px_rgba(0,79,255,0.28)] ring-1 ring-inset ring-white/10"
      : "text-white/80 hover:bg-gradient-to-r hover:from-biz-blue/25 hover:via-biz-blue/10 hover:to-transparent hover:text-white",
  );

  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-biz-navy";

  const mainContent = (
    <>
      {!active && (
        <span className="absolute left-0 top-1/2 h-0 w-[3px] -translate-y-1/2 rounded-full bg-biz-blue-hover transition-all duration-200 ease-out group-hover:h-6" />
      )}
      <span
        className={cn(
          "flex h-7 w-[26px] shrink-0 items-center justify-center rounded-md transition-all duration-200",
          active ? "bg-white/15" : "bg-white/[0.06] group-hover:translate-x-0.5 group-hover:bg-biz-blue/25",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 transition-transform duration-200",
            !active && "group-hover:scale-110",
          )}
        />
      </span>
      <span className="min-w-0 flex-1 truncate whitespace-nowrap" title={label}>
        {label}
        {subtitle && <span className="sr-only"> — {subtitle}</span>}
      </span>
      {badge !== undefined && badge > 0 && (
        <span className="flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-full bg-biz-orange px-1 text-[10px] font-bold text-white shadow-[0_0_0_2px_rgba(255,124,44,0.16)]">
          {badge}
        </span>
      )}
    </>
  );

  const chevron = (
    <ChevronDown
      className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out", expanded && "rotate-180")}
    />
  );

  if (isSplitRow) {
    return (
      <div className={cn(rowShell, "active:scale-[0.99]")}>
        <Link href={href!} className={cn("flex min-w-0 flex-1 items-center gap-1.5 rounded-l-lg py-1.5 pl-1.5 pr-1", focusRing)}>
          {mainContent}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          aria-expanded={expanded}
          className={cn("flex shrink-0 items-center justify-center self-stretch rounded-r-lg pl-1.5 pr-1 active:scale-90", focusRing)}
        >
          {chevron}
        </button>
      </div>
    );
  }

  if (expandable) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={cn(rowShell, "gap-1.5 py-1.5 pl-1.5 pr-1 active:scale-[0.98]", focusRing)}
      >
        {mainContent}
        {chevron}
      </button>
    );
  }

  return (
    <Link href={href ?? "#"} className={cn(rowShell, "gap-1.5 py-1.5 pl-1.5 pr-2 active:scale-[0.98]", focusRing)}>
      {mainContent}
    </Link>
  );
}
