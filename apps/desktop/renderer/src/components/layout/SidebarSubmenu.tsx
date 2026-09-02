import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@bizovix/ui";
import { isNavRouteActive, type NavLeaf } from "@/config/nav";

export interface SidebarSubmenuProps {
  items: NavLeaf[];
  activeHref: string;
}

function findDeepestActiveHref(items: NavLeaf[], activeHref: string): string | undefined {
  let deepestHref: string | undefined;

  for (const item of items) {
    if (item.href && isNavRouteActive(activeHref, item.href)) {
      if (!deepestHref || item.href.length > deepestHref.length) {
        deepestHref = item.href;
      }
    }

    if (item.children) {
      const childHref = findDeepestActiveHref(item.children, activeHref);
      if (childHref && (!deepestHref || childHref.length > deepestHref.length)) {
        deepestHref = childHref;
      }
    }
  }

  return deepestHref;
}

function containsHref(items: NavLeaf[], href: string | undefined): boolean {
  if (!href) return false;
  return items.some((item) => item.href === href || (item.children ? containsHref(item.children, href) : false));
}

function SubmenuList({
  items,
  activeItemHref,
  nested = false,
}: {
  items: NavLeaf[];
  activeItemHref: string | undefined;
  nested?: boolean;
}) {
  return (
    <ul
      className={cn(
        "flex flex-col gap-1 border-l",
        nested ? "ml-2 mt-1 border-white/10 pl-3" : "ml-4 mt-1.5 border-white/15 pl-3",
      )}
    >
      {items.map((item, index) => {
        const hasChildren = !!item.children?.length;
        const isDisabled = item.disabled || (!item.href && !hasChildren);
        const active = !isDisabled && item.href === activeItemHref;
        const childActive = hasChildren && containsHref(item.children!, activeItemHref);
        const Icon = item.icon;

        return (
          <li
            key={item.href ?? `${item.label}-${index}`}
            className={cn("group relative", item.indent && "ml-3")}
          >
            <span
              className={cn(
                "absolute -left-[9px] top-[18px] h-1.5 w-1.5 -translate-y-1/2 rounded-full transition-all duration-150",
                active || childActive
                  ? "bg-[#63A1FF] shadow-[0_0_0_3px_rgba(30,101,255,0.18)]"
                  : isDisabled
                    ? "bg-white/15"
                    : "bg-white/30 group-hover:scale-125 group-hover:bg-white/60",
              )}
            />

            {hasChildren ? (
              <>
                {item.href ? (
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-expanded="true"
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2 py-2 text-[13px] transition-all duration-150 ease-out active:scale-[0.98]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-biz-navy",
                      active
                        ? "border-biz-blue/35 bg-biz-blue/20 font-semibold text-white"
                        : childActive
                          ? "border-biz-blue/25 bg-biz-blue/10 font-semibold text-white"
                          : "border-transparent text-white/70 hover:translate-x-0.5 hover:border-white/10 hover:bg-white/[0.08] hover:text-white",
                    )}
                  >
                    <Icon className="h-[15px] w-[15px] shrink-0" />
                    <span className="min-w-0 flex-1 whitespace-normal break-words leading-4" title={item.label}>{item.label}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 rotate-180" />
                  </Link>
                ) : (
                  <span className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-[13px] font-semibold text-white">
                    <Icon className="h-[15px] w-[15px] shrink-0" />
                    <span className="min-w-0 flex-1 whitespace-normal break-words leading-4" title={item.label}>{item.label}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 rotate-180" />
                  </span>
                )}
                <SubmenuList items={item.children!} activeItemHref={activeItemHref} nested />
              </>
            ) : isDisabled ? (
              <span
                aria-disabled="true"
                title="Coming soon"
                className="flex cursor-not-allowed select-none items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-[13px] text-white/35"
              >
                <Icon className="h-[15px] w-[15px] shrink-0" />
                <span className="min-w-0 flex-1 whitespace-normal break-words leading-4">{item.label}</span>
              </span>
            ) : (
              <Link
                href={item.href!}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2 py-2 text-[13px] transition-all duration-150 ease-out active:scale-[0.98]",
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
                <span className="min-w-0 flex-1 whitespace-normal break-words leading-4" title={item.label}>{item.label}</span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function SidebarSubmenu({ items, activeHref }: SidebarSubmenuProps) {
  const activeItemHref = findDeepestActiveHref(items, activeHref);
  return <SubmenuList items={items} activeItemHref={activeItemHref} />;
}
