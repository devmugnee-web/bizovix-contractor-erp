"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { FilePlus2, Search } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buildPurchaseStartRoute, buildSalesStartRoute, buildVoucherRoute, buildWorkspaceRoute } from "@/config/routes";
import { useWorkflowSettingsQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { listAuditReport } from "@/services/audit-reports";
import { listDayBook } from "@/services/voucher.service";
import { defaultWorkflowSettings } from "@/services/workflow-settings.service";
import { useUiStore } from "@/stores/ui-store";
import type { DataMode } from "@/types/domain";

export function CommandPalette({ mode }: { mode: DataMode }) {
  const router = useRouter();
  const { session } = useSessionContext();
  const workflowSettingsQuery = useWorkflowSettingsQuery(
    mode,
    session?.workspaceId ?? (mode === "api" ? null : "workspace"),
  );
  const workflowSettings = workflowSettingsQuery.data ?? defaultWorkflowSettings;
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searchEnabled = open && deferredQuery.trim().length >= 2 && Boolean(session?.workspaceId);
  const voucherSearch = useQuery({
    queryKey: [mode, "global-voucher-search", session?.workspaceId, deferredQuery],
    queryFn: () => listDayBook(mode, { workspaceId: session!.workspaceId, voucherType: "all", status: "all", query: deferredQuery.trim() }),
    enabled: searchEnabled,
  });
  const activitySearch = useQuery({
    queryKey: [mode, "global-activity-search", session?.workspaceId],
    queryFn: () => listAuditReport("user-activity-log", session!.workspaceId),
    enabled: searchEnabled && mode === "api",
    staleTime: 30_000,
  });

  const commands = useMemo(
    () => [
      {
        id: "sales",
        section: "Create",
        label: workflowSettings.salesWorkflow === "ORDER_BASED" ? "Create Sales Order" : "Create Sales Invoice",
        shortcut: "S",
        href: buildSalesStartRoute(mode, workflowSettings.salesWorkflow),
      },
      {
        id: "purchase",
        section: "Create",
        label: workflowSettings.purchaseWorkflow === "ORDER_BASED" ? "Create Purchase Order" : "Create Purchase Bill",
        shortcut: "U",
        href: buildPurchaseStartRoute(mode, workflowSettings.purchaseWorkflow),
      },
      { id: "expense", section: "Create", label: "Create Expense Voucher", shortcut: "E", href: buildVoucherRoute(mode, "expense") },
      { id: "revenue", section: "Create", label: "Create Revenue Voucher", shortcut: "V", href: buildVoucherRoute(mode, "revenue") },
      { id: "receipt", section: "Create", label: "Create Receipt Voucher", shortcut: "R", href: buildVoucherRoute(mode, "receipt") },
      { id: "payment", section: "Create", label: "Create Payment Voucher", shortcut: "P", href: buildVoucherRoute(mode, "payment") },
      { id: "journal", section: "Create", label: "Create Journal Voucher", shortcut: "J", href: buildVoucherRoute(mode, "journal") },
      { id: "day-book", section: "Open", label: "Open Day Book", shortcut: "", href: buildWorkspaceRoute(mode, "/day-book") },
      { id: "activity-log", section: "Open", label: "User Activity Audit History", shortcut: "", href: buildWorkspaceRoute(mode, "/reports/user-activity-log") },
      { id: "sales-invoices", section: "Open", label: "Sales Invoices", shortcut: "", href: buildWorkspaceRoute(mode, "/sales/invoices") },
      { id: "sales-returns", section: "Open", label: "Sales Returns Credit Notes", shortcut: "", href: buildWorkspaceRoute(mode, "/sales/credit-note") },
      { id: "customers", section: "Open", label: "Customers", shortcut: "", href: buildWorkspaceRoute(mode, "/masters/customers") },
      { id: "suppliers", section: "Open", label: "Suppliers", shortcut: "", href: buildWorkspaceRoute(mode, "/masters/suppliers") },
      { id: "inventory", section: "Open", label: "Products Services Inventory Items", shortcut: "", href: buildWorkspaceRoute(mode, "/masters/inventory") },
      { id: "trial-balance", section: "Open", label: "Open Trial Balance", shortcut: "", href: buildWorkspaceRoute(mode, "/reports/trial-balance") },
      { id: "subscription", section: "Open", label: "Open Subscription", shortcut: "", href: buildWorkspaceRoute(mode, "/subscription") },
    ],
    [mode, workflowSettings.purchaseWorkflow, workflowSettings.salesWorkflow],
  );

  const dynamicCommands = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (needle.length < 2) return [];
    const vouchers = (voucherSearch.data ?? []).slice(0, 20).map((voucher) => ({
      id: `voucher-${voucher.id}`,
      section: "Records",
      label: `${voucher.voucherNumber} · ${voucher.partyName} · ${voucher.particulars}`,
      shortcut: "Open",
      href: buildWorkspaceRoute(mode, `/day-book?query=${encodeURIComponent(voucher.voucherNumber)}`),
    }));
    const activities = (activitySearch.data ?? [])
      .filter((row) => `${row.date} ${row.user} ${row.action} ${row.details}`.toLowerCase().includes(needle))
      .slice(0, 20)
      .map((row, index) => ({
        id: `activity-${row.date}-${index}`,
        section: "Activity",
        label: `${row.action} · ${row.user} · ${row.details}`,
        shortcut: "Open",
        href: buildWorkspaceRoute(mode, `/reports/user-activity-log?search=${encodeURIComponent(deferredQuery.trim())}`),
      }));
    return [...vouchers, ...activities];
  }, [activitySearch.data, deferredQuery, mode, voucherSearch.data]);

  const filtered = useMemo(() => {
    if (!deferredQuery) {
      return [...commands, ...dynamicCommands];
    }

    const needle = deferredQuery.toLowerCase();
    return [...commands, ...dynamicCommands].filter((command) => `${command.section} ${command.label}`.toLowerCase().includes(needle));
  }, [commands, deferredQuery, dynamicCommands]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0">
        <div className="border-b border-border p-4">
          <DialogTitle className="text-lg font-semibold">Command Palette</DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Jump to core ERP actions, reports, and voucher workflows.
          </DialogDescription>
        </div>
        <Command shouldFilter={false} className="max-h-[70vh] overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 text-muted" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search invoices, parties, items, activity or pages..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <Command.List className="max-h-[420px] overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-muted">No commands match your search.</div>
            ) : null}
            {["Records", "Activity", "Create", "Open"].map((section) => {
              const entries = filtered.filter((command) => command.section === section);
              if (entries.length === 0) {
                return null;
              }

              return (
                <Command.Group key={section} heading={section} className="px-2 py-2 text-xs text-muted">
                  {entries.map((command) => (
                    <Command.Item
                      key={command.id}
                      value={command.label}
                      onSelect={() => {
                        setOpen(false);
                        router.push(command.href);
                      }}
                      className="mt-1 flex cursor-pointer items-center justify-between rounded-xl px-3 py-3 text-sm text-foreground data-[selected=true]:bg-primary-soft"
                    >
                      <span className="flex items-center gap-3">
                        <span className="rounded-lg bg-canvas p-2 text-primary">
                          <FilePlus2 className="h-4 w-4" />
                        </span>
                        {command.label}
                      </span>
                      <span className="rounded-md border border-border px-2 py-1 text-xs text-muted">{command.shortcut || "Go"}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
