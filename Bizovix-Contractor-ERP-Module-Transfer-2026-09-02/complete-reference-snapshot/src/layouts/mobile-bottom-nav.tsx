"use client";

import Link from "next/link";
import { BarChart3, BookOpenText, LayoutDashboard, PlusSquare, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";

import { buildWorkspaceRoute } from "@/config/routes";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import type { DataMode } from "@/types/domain";

const items = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Day Book", icon: BookOpenText, path: "/day-book" },
  { label: "Create", icon: PlusSquare, action: "create" as const },
  { label: "Reports", icon: BarChart3, path: "/reports" },
  { label: "Plan", icon: ShieldCheck, path: "/subscription" },
];

export function MobileBottomNav({ mode }: { mode: DataMode }) {
  const pathname = usePathname();
  const setCreateMenuOpen = useUiStore((state) => state.setCreateMenuOpen);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 px-2 py-2 backdrop-blur xl:hidden">
      <div className="grid grid-cols-5 gap-1">
        {items.map((item) => {
          if ("action" in item && item.action === "create") {
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setCreateMenuOpen(true)}
                className="flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium text-muted"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          }

          const href = buildWorkspaceRoute(mode, item.path);
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={item.label}
              href={href}
              onClick={() => setCreateMenuOpen(false)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium",
                active ? "bg-primary-soft text-primary" : "text-muted",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
