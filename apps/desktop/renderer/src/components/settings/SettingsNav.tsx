"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  FileCog,
  Hash,
  Landmark,
  ListChecks,
  Server,
  Settings2,
  Shield,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { cn } from "@bizovix/ui";

const SECTIONS = [
  { href: "/settings/general", label: "General", icon: Settings2 },
  { href: "/settings/company", label: "Company Profile", icon: Building2 },
  { href: "/settings/users-roles", label: "Users & Roles", icon: Users },
  { href: "/settings/tender-bank", label: "Tender & Bank Instruments", icon: Landmark },
  { href: "/settings/finance", label: "Finance & Accounts", icon: SlidersHorizontal },
  { href: "/settings/numbering", label: "Numbering & Prefixes", icon: Hash },
  { href: "/settings/notifications", label: "Reminders & Notifications", icon: Bell },
  { href: "/settings/documents", label: "Documents", icon: FileCog },
  { href: "/settings/approvals", label: "Approvals", icon: ListChecks },
  { href: "/settings/security", label: "Security", icon: Shield },
  { href: "/settings/system", label: "System", icon: Server },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 rounded-lg border border-biz-border bg-white p-2 shadow-card">
      {SECTIONS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded px-3 py-2 text-[12px] font-semibold",
              active ? "bg-biz-blue text-white" : "text-biz-text hover:bg-biz-bg",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
