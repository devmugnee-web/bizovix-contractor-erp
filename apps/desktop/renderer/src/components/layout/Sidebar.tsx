"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { TrialCard } from "@bizovix/ui";
import { NAV_ITEMS, NAV_ITEMS_LOWER, type NavItem } from "@/config/nav";
import { SidebarItem } from "./SidebarItem";
import { SidebarSubmenu } from "./SidebarSubmenu";

function findActiveGroup(pathname: string): string | null {
  const group = NAV_ITEMS.find((item) => item.children?.some((child) => pathname.startsWith(child.href)));
  return group?.label ?? null;
}

interface SidebarProps {
  remindersCount?: number;
}

export function Sidebar({ remindersCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const activeGroup = findActiveGroup(pathname);

  const [openGroup, setOpenGroup] = React.useState<string | null>(activeGroup);
  const [trackedPathname, setTrackedPathname] = React.useState(pathname);

  if (pathname !== trackedPathname) {
    setTrackedPathname(pathname);
    if (activeGroup) setOpenGroup(activeGroup);
  }

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
            active={expanded}
            onToggle={() => setOpenGroup(expanded ? null : item.label)}
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
          active={item.href ? pathname.startsWith(item.href) : false}
          badge={badge}
        />
      </li>
    );
  }

  return (
    <aside className="flex h-full w-[236px] flex-col bg-biz-navy">
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
  );
}
