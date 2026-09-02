"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useMe } from "@bizovix/api-client";
import type { Permission } from "@bizovix/types";
import { TrialCard } from "@bizovix/ui";
import { isNavRouteActive, NAV_ITEMS, NAV_ITEMS_LOWER, type NavItem, type NavLeaf } from "@/config/nav";
import { SidebarItem } from "./SidebarItem";
import { SidebarSubmenu } from "./SidebarSubmenu";

function containsActiveRoute(pathname: string, items: NavLeaf[]): boolean {
  return items.some(
    (item) =>
      (!!item.href && isNavRouteActive(pathname, item.href)) ||
      (item.children ? containsActiveRoute(pathname, item.children) : false),
  );
}

function findActiveGroup(pathname: string, items: NavItem[]): string | null {
  const group = items.find(
    (item) =>
      (!!item.href && isNavRouteActive(pathname, item.href)) ||
      (item.children ? containsActiveRoute(pathname, item.children) : false),
  );
  return group?.label ?? null;
}

function filterLeaves(items: NavLeaf[], permissions: Set<Permission>): NavLeaf[] {
  return items.flatMap((item) => {
    if (item.permissions?.length && !item.permissions.some((permission) => permissions.has(permission))) return [];
    const children = item.children ? filterLeaves(item.children, permissions) : undefined;
    if (item.children && !children?.length && !item.href) return [];
    return [{ ...item, children }];
  });
}

function filterItems(items: NavItem[], permissions: Set<Permission>): NavItem[] {
  return items.flatMap((item) => {
    if (item.permissions?.length && !item.permissions.some((permission) => permissions.has(permission))) return [];
    const children = item.children ? filterLeaves(item.children, permissions) : undefined;
    if (item.children && !children?.length && !item.href) return [];
    return [{ ...item, children }];
  });
}

interface SidebarProps {
  remindersCount?: number;
  trial?: { daysLeft: number; totalDays: number } | null;
  onUpgradeClick?: () => void;
  collapsed?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({
  remindersCount = 0,
  trial = null,
  onUpgradeClick,
  collapsed = false,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const me = useMe();
  const permissionSet = React.useMemo(() => new Set(me.data?.permissions ?? []), [me.data?.permissions]);
  const upperItems = React.useMemo(() => filterItems(NAV_ITEMS, permissionSet), [permissionSet]);
  const lowerItems = React.useMemo(() => filterItems(NAV_ITEMS_LOWER, permissionSet), [permissionSet]);
  const activeGroup = findActiveGroup(pathname, [...upperItems, ...lowerItems]);

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
            href={item.href}
            expandable
            expanded={expanded}
            active={activeGroup === item.label}
            onToggle={() => setMenuState({ pathname, openGroup: expanded ? null : item.label })}
          />
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
              expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
            aria-hidden={!expanded}
            inert={!expanded ? true : undefined}
          >
            <div className="overflow-hidden">
              <SidebarSubmenu items={item.children} activeHref={pathname} />
            </div>
          </div>
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
        className={`${mobileOpen ? "fixed bottom-0 left-0 top-7 z-40 flex" : "hidden"} ${collapsed ? "md:hidden" : "md:static md:flex"} h-[calc(100vh-1.75rem)] w-[256px] max-w-[88vw] shrink-0 flex-col bg-biz-navy md:h-full md:max-w-none`}
      >
        <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-1">{upperItems.map(renderItem)}</ul>
          <div className="my-3 border-t border-white/10" />
          <ul className="flex flex-col gap-1">{lowerItems.map(renderItem)}</ul>
        </nav>
        {trial && (
          <div className="mx-3 mb-3">
            <TrialCard daysLeft={trial.daysLeft} totalDays={trial.totalDays} onUpgradeClick={onUpgradeClick} />
          </div>
        )}
        <div className="border-t border-white/10 px-3 py-3 text-center text-[11px] text-white/50">
          © 2024 Bizovix Contractor ERP
          <br />
          v1.0.0
        </div>
      </aside>
    </>
  );
}
