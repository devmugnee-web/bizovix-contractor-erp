"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { voucherShortcutOrder } from "@/config/navigation";
import { buildPurchaseStartRoute, buildSalesStartRoute, buildVoucherRoute } from "@/config/routes";
import { useWorkflowSettingsQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { cn } from "@/lib/utils";
import { defaultWorkflowSettings } from "@/services/workflow-settings.service";
import { useUiStore } from "@/stores/ui-store";
import type { DataMode } from "@/types/domain";

export function ShortcutBar({ mode }: { mode: DataMode }) {
  const pathname = usePathname();
  const { session } = useSessionContext();
  const workflowSettingsQuery = useWorkflowSettingsQuery(
    mode,
    session?.workspaceId ?? (mode === "api" ? null : "workspace"),
  );
  const workflowSettings = workflowSettingsQuery.data ?? defaultWorkflowSettings;
  const setCreateMenuOpen = useUiStore((state) => state.setCreateMenuOpen);

  return (
    <div className="border-b border-[#e4e9f3] bg-[#eef3fb] px-4 py-3">
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {voucherShortcutOrder.map((item) => {
          const href = item.type === "sales"
            ? buildSalesStartRoute(mode, workflowSettings.salesWorkflow)
            : item.type === "purchase"
              ? buildPurchaseStartRoute(mode, workflowSettings.purchaseWorkflow)
              : buildVoucherRoute(mode, item.type);
          const activeHref = href.split("?")[0];
          const active = pathname === activeHref || pathname.startsWith(`${activeHref}/`);
          const label = item.type === "sales" && workflowSettings.salesWorkflow === "ORDER_BASED"
            ? "Sales Order"
            : item.type === "purchase" && workflowSettings.purchaseWorkflow === "ORDER_BASED"
              ? "Purchase Order"
              : item.label;

          return (
            <Button
              key={item.key}
              asChild
              variant={active ? "subtle" : "outline"}
              className={cn(
                "h-10 rounded-full border-[#d7ddeb] px-2 text-xs sm:px-4 sm:text-sm",
                active
                  ? "border-[#252d59] bg-[#252d59] text-white shadow-[0_10px_18px_rgba(37,45,89,0.18)]"
                  : "bg-white text-slate-700 hover:bg-[#f7f9fc]",
              )}
            >
              <Link href={href} onClick={() => setCreateMenuOpen(false)}>
                <span className={cn("font-semibold", active ? "text-white" : "text-slate-500")}>{item.key}</span>
                <span>{label}</span>
              </Link>
            </Button>
          );
        })}
        <Button
          className="col-span-1 rounded-full bg-[#252d59] text-sm text-white shadow-[0_12px_18px_rgba(37,45,89,0.18)] hover:bg-[#1f264c] sm:col-auto sm:ml-auto"
          onClick={() => setCreateMenuOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Create
          <span className="hidden rounded-full bg-white/15 px-2 py-1 text-[11px] font-semibold sm:inline-flex">Alt + C</span>
        </Button>
      </div>
    </div>
  );
}
