import Link from "next/link";
import { cn } from "@bizovix/ui";
import { isNavRouteActive, type NavLeaf } from "@/config/nav";

export interface SidebarSubmenuProps {
  items: NavLeaf[];
  activeHref: string;
}

export function SidebarSubmenu({ items, activeHref }: SidebarSubmenuProps) {
  const activeItemHref = items
    .filter((item) => isNavRouteActive(activeHref, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ul className="ml-[22px] mt-1 flex flex-col gap-1 border-l border-white/15 pl-4">
      {items.map((item) => {
        const active = item.href === activeItemHref;
        return (
          <li key={item.href} className="relative">
            <span
              className={cn(
                "absolute -left-[17px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full",
                active ? "bg-[#63A1FF] shadow-[0_0_0_3px_rgba(30,101,255,0.18)]" : "bg-white/30",
              )}
            />
            <Link
              href={item.href}
              className={cn(
                "block rounded-md border px-3 py-2 text-[13px] transition-colors",
                active
                  ? "border-biz-blue/35 bg-biz-blue/20 font-semibold text-white"
                  : "border-transparent text-white/70 hover:bg-white/5 hover:text-white",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
