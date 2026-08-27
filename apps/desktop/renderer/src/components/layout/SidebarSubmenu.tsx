import Link from "next/link";
import { cn } from "@bizovix/ui";
import { isNavRouteActive, type NavLeaf } from "@/config/nav";

export interface SidebarSubmenuProps {
  items: NavLeaf[];
  activeHref: string;
}

export function SidebarSubmenu({ items, activeHref }: SidebarSubmenuProps) {
  const activeItemHref = items
    .filter((item): item is NavLeaf & { href: string } => !!item.href && isNavRouteActive(activeHref, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ul className="ml-[22px] mt-1.5 flex flex-col gap-1 border-l border-white/15 pl-5">
      {items.map((item, index) => {
        const isDisabled = item.disabled || !item.href;
        const active = !isDisabled && item.href === activeItemHref;
        const Icon = item.icon;
        return (
          <li
            key={item.href ?? `${item.label}-${index}`}
            className={cn("group relative", item.indent && "ml-3")}
          >
            <span
              className={cn(
                "absolute -left-[17px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full transition-all duration-150",
                active
                  ? "bg-[#63A1FF] shadow-[0_0_0_3px_rgba(30,101,255,0.18)]"
                  : isDisabled
                    ? "bg-white/15"
                    : "bg-white/30 group-hover:scale-125 group-hover:bg-white/60",
              )}
            />
            {isDisabled ? (
              <span
                aria-disabled="true"
                title="Coming soon"
                className="flex cursor-not-allowed select-none items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-[13px] text-white/35"
              >
                <Icon className="h-[15px] w-[15px] shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </span>
            ) : (
              <Link
                href={item.href!}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-all duration-150 ease-out active:scale-[0.98]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-biz-navy",
                  active
                    ? "border-biz-blue/35 bg-biz-blue/20 font-semibold text-white"
                    : "border-transparent text-white/70 hover:translate-x-0.5 hover:border-white/10 hover:bg-white/[0.08] hover:text-white hover:shadow-[0_2px_8px_rgba(0,0,0,0.16)]",
                )}
              >
                <Icon
                  className={cn(
                    "h-[15px] w-[15px] shrink-0 transition-transform duration-150",
                    !active && "group-hover:scale-110",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
