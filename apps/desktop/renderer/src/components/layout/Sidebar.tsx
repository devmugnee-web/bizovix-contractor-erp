"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { TrialCard } from "@bizovix/ui";
import { isNavRouteActive, NAV_ITEMS, NAV_ITEMS_LOWER, type NavItem } from "@/config/nav";
import { SidebarItem } from "./SidebarItem";
import { SidebarSubmenu } from "./SidebarSubmenu";

function findActiveGroup(pathname: string): string | null {
  const group = [...NAV_ITEMS, ...NAV_ITEMS_LOWER].find((item) =>
    item.children?.some((child) => isNavRouteActive(pathname, child.href)),
  );
  return group?.label ?? null;
}

interface SidebarProps {
  remindersCount?: number;
  collapsed?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({
  remindersCount = 0,
  collapsed = false,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const activeGroup = findActiveGroup(pathname);

  const [menuState, setMenuState] = React.useState<{ pathname: string; openGroup: string | null }>(
    () => ({
      pathname,
      openGroup: activeGroup,
    }),
  );
  const openGroup = menuState.pathname === pathname ? menuState.openGroup : activeGroup;

  function renderItem(item: NavItem) {
    const badge = item.badgeKey === "reminders" ? remindersCount : undefined;

    if (item.children) {
      const expanded = openGroup === item.label;
      return (
        <li key={item.label}>
          <SidebarItem
            icon={item.icon}
            label={item.label}
            expandable
            expanded={expanded}
            active={activeGroup === item.label}
            onToggle={() => setMenuState({ pathname, openGroup: expanded ? null : item.label })}
          />
          {expanded && <SidebarSubmenu items={item.children} activeHref={pathname} />}
        </li>
      );
    }

    return (
      <li key={item.label}>
        <SidebarItem
          icon={item.icon}
          label={item.label}
          subtitle={item.subtitle}
          href={item.href}
          active={item.href ? isNavRouteActive(pathname, item.href) : false}
          badge={badge}
        />
      </li>
    );
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onMobileClose}
          className="fixed inset-0 top-14 z-30 bg-biz-navy/25 md:hidden"
        />
      )}
      <aside
        className={`${mobileOpen ? "fixed bottom-0 left-0 top-14 z-40 flex" : "hidden"} ${collapsed ? "md:hidden" : "md:static md:flex"} h-[calc(100vh-3.5rem)] w-[236px] shrink-0 flex-col bg-biz-navy md:h-full`}
      >
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-1">{NAV_ITEMS.map(renderItem)}</ul>
          <div className="my-3 border-t border-white/10" />
          <ul className="flex flex-col gap-1">{NAV_ITEMS_LOWER.map(renderItem)}</ul>
        </nav>
        <div className="mx-3 mb-3">
          <TrialCard daysLeft={30} />
        </div>
        <div className="border-t border-white/10 px-3 py-3 text-center text-[11px] text-white/50">
          © 2024 Bizovix Contractor ERP
          <br />
          v1.0.0
        </div>
      </aside>
    </>
  );
}
