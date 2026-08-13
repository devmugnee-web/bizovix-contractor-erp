import Link from "next/link";
import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";
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
  const className = cn(
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13px] font-medium transition-colors",
    active ? "bg-biz-blue text-white" : "text-white/80 hover:bg-white/5 hover:text-white",
  );

  const content = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {label}
        {subtitle && <span className="block truncate text-[11px] font-normal text-white/55">{subtitle}</span>}
      </span>
      {badge !== undefined && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-biz-orange px-1.5 text-[11px] font-semibold text-white">
          {badge}
        </span>
      )}
      {expandable && (expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
    </>
  );

  if (expandable) {
    return (
      <button type="button" onClick={onToggle} className={className}>
        {content}
      </button>
    );
  }

  return (
    <Link href={href ?? "#"} className={className}>
      {content}
    </Link>
  );
}
