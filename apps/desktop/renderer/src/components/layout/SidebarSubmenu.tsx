import Link from "next/link";
import { cn } from "@bizovix/ui";
import type { NavLeaf } from "@/config/nav";

export interface SidebarSubmenuProps {
  items: NavLeaf[];
  activeHref: string;
}

export function SidebarSubmenu({ items, activeHref }: SidebarSubmenuProps) {
  return (
    <ul className="ml-[22px] mt-1 flex flex-col gap-1 border-l border-white/15 pl-4">
      {items.map((item) => {
        const active = activeHref.startsWith(item.href);
        return (
          <li key={item.href} className="relative">
            <span
              className={cn(
                "absolute -left-[17px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full",
                active ? "bg-biz-blue" : "bg-white/30",
              )}
            />
            <Link
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-2 text-[13px] transition-colors",
                active ? "bg-biz-blue/90 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
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
