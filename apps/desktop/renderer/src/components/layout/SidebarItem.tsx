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
    "group relative flex w-full items-center overflow-hidden rounded-xl text-left text-[13px] font-medium",
    "transition-all duration-200 ease-out",
    active
      ? "bg-biz-blue text-white shadow-[0_4px_14px_rgba(0,79,255,0.35)]"
      : "text-white/80 hover:bg-gradient-to-r hover:from-biz-blue/25 hover:via-biz-blue/10 hover:to-transparent hover:text-white hover:shadow-[0_2px_10px_rgba(0,0,0,0.18)]",
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
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
          active ? "bg-white/15" : "bg-white/[0.06] group-hover:translate-x-0.5 group-hover:bg-biz-blue/25",
        )}
      >
        <Icon
          className={cn(
            "h-[17px] w-[17px] transition-transform duration-200",
            !active && "group-hover:scale-110",
          )}
        />
      </span>
      <span className="min-w-0 flex-1 truncate">
        {label}
        {subtitle && <span className="block truncate text-[11px] font-normal text-white/55">{subtitle}</span>}
      </span>
      {badge !== undefined && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-biz-orange px-1.5 text-[11px] font-semibold text-white shadow-[0_0_0_3px_rgba(255,124,44,0.18)]">
          {badge}
        </span>
      )}
    </>
  );

  const chevron = (
    <ChevronDown
      className={cn("h-4 w-4 shrink-0 transition-transform duration-200 ease-out", expanded && "rotate-180")}
    />
  );

  if (isSplitRow) {
    return (
      <div className={cn(rowShell, "active:scale-[0.99]")}>
        <Link href={href!} className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-l-xl px-2.5 py-2", focusRing)}>
          {mainContent}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          aria-expanded={expanded}
          className={cn("flex shrink-0 items-center justify-center self-stretch rounded-r-xl px-2.5 active:scale-90", focusRing)}
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
        className={cn(rowShell, "gap-3 px-2.5 py-2 active:scale-[0.98]", focusRing)}
      >
        {mainContent}
        {chevron}
      </button>
    );
  }

  return (
    <Link href={href ?? "#"} className={cn(rowShell, "gap-3 px-2.5 py-2 active:scale-[0.98]", focusRing)}>
      {mainContent}
    </Link>
  );
}
