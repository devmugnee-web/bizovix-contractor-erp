"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BookOpenCheck, CheckCircle2, LifeBuoy, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildPurchaseStartRoute, buildSalesStartRoute, buildVoucherRoute, buildWorkspaceRoute } from "@/config/routes";
import { useWorkflowSettingsQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { supportCenterLinks } from "@/config/module-registry";
import { openSupportChat, openTutorialVideoSearch } from "@/lib/app-actions";
import { voucherShortcutOrder } from "@/config/navigation";
import { defaultWorkflowSettings } from "@/services/workflow-settings.service";
import { useAccountingPreferenceStore } from "@/stores/accounting-preference-store";
import { useUiStore } from "@/stores/ui-store";
import type { AccountingEntryMode, DataMode } from "@/types/domain";

export function ShellDialogs({ mode }: { mode: DataMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSessionContext();
  const workflowSettingsQuery = useWorkflowSettingsQuery(
    mode,
    session?.workspaceId ?? (mode === "api" ? null : "workspace"),
  );
  const workflowSettings = workflowSettingsQuery.data ?? defaultWorkflowSettings;
  const createMenuOpen = useUiStore((state) => state.createMenuOpen);
  const notificationsOpen = useUiStore((state) => state.notificationsOpen);
  const settingsOpen = useUiStore((state) => state.settingsOpen);
  const supportOpen = useUiStore((state) => state.supportOpen);
  const setCreateMenuOpen = useUiStore((state) => state.setCreateMenuOpen);
  const setNotificationsOpen = useUiStore((state) => state.setNotificationsOpen);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const setSupportOpen = useUiStore((state) => state.setSupportOpen);
  const setShortcutHelpOpen = useUiStore((state) => state.setShortcutHelpOpen);
  const entryMode = useAccountingPreferenceStore((state) => state.entryMode);
  const setEntryMode = useAccountingPreferenceStore((state) => state.setEntryMode);
  const [companyName, setCompanyName] = useState("Bizovix Trading Limited");
  const [notifyEmail, setNotifyEmail] = useState("owner@bizovix.app");
  const [entryModeDraft, setEntryModeDraft] = useState<AccountingEntryMode>(entryMode);
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    if (previousPathnameRef.current !== pathname && createMenuOpen) {
      setCreateMenuOpen(false);
    }
    previousPathnameRef.current = pathname;
  }, [createMenuOpen, pathname, setCreateMenuOpen]);

  useEffect(() => {
    if (settingsOpen) {
      setEntryModeDraft(entryMode);
    }
  }, [entryMode, settingsOpen]);

  function handleSupportLink(label: string) {
    switch (label) {
      case "Shortcut Guide":
        setSupportOpen(false);
        setShortcutHelpOpen(true);
        break;
      case "Release Notes":
        setSupportOpen(false);
        setNotificationsOpen(true);
        break;
      case "Security Settings":
        setSupportOpen(false);
        setSettingsOpen(true);
        break;
      case "Billing Contacts":
        setSupportOpen(false);
        router.push(buildWorkspaceRoute(mode, "/subscription"));
        break;
      default:
        openTutorialVideoSearch("Bizovix ERP help tutorial");
        break;
    }
  }

  return (
    <>
      <Dialog open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">Create New</DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Jump straight into voucher and transaction entry from the global create menu.
          </DialogDescription>
          <div className="grid gap-3 pt-4 md:grid-cols-2">
            {voucherShortcutOrder.map((item) => {
              const label = item.type === "sales" && workflowSettings.salesWorkflow === "ORDER_BASED"
                ? "Sales Order"
                : item.type === "purchase" && workflowSettings.purchaseWorkflow === "ORDER_BASED"
                  ? "Purchase Order"
                  : item.label;
              const href = item.type === "sales"
                ? buildSalesStartRoute(mode, workflowSettings.salesWorkflow, Date.now())
                : item.type === "purchase"
                  ? buildPurchaseStartRoute(mode, workflowSettings.purchaseWorkflow)
                  : buildVoucherRoute(mode, item.type);

              return (
                <button
                  key={item.type}
                  className="rounded-2xl border border-border p-4 text-left transition-colors hover:bg-canvas"
                  onClick={() => {
                    setCreateMenuOpen(false);
                    router.push(href);
                  }}
                >
                  <div className="text-sm font-semibold text-primary">{item.key}</div>
                  <div className="mt-1 text-base font-semibold">{label}</div>
                  <div className="mt-1 text-sm text-muted">Open a new {label.toLowerCase()} workflow.</div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Bell className="h-5 w-5 text-primary" />
            Notifications
          </DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Approval requests, workspace alerts, and recent workflow events.
          </DialogDescription>
          <div className="space-y-3 pt-4">
            {[
              ["5 Sales invoices are waiting for approval", "Accounts Manager · 10 mins ago"],
              ["Bank reconciliation has 2 unmatched entries", "Banking · 32 mins ago"],
              ["Demo workspace reset completed successfully", "System · 1 hour ago"],
            ].map(([title, meta]) => (
              <div key={title} className="rounded-2xl border border-border p-4">
                <div className="font-medium">{title}</div>
                <div className="mt-1 text-sm text-muted">{meta}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Settings2 className="h-5 w-5 text-primary" />
            Quick Settings
          </DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Update common demo-ready preferences without leaving the current screen.
          </DialogDescription>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Company display name</label>
              <input
                className="h-10 w-full rounded-xl border border-border px-3 text-sm"
                autoComplete="off"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notification email</label>
              <input
                className="h-10 w-full rounded-xl border border-border px-3 text-sm"
                autoComplete="off"
                value={notifyEmail}
                onChange={(event) => setNotifyEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Voucher entry style</label>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { value: "simple", label: "Simple Entry", description: "Hide debit and credit from operators." },
                  { value: "double-entry", label: "Debit / Credit", description: "Show full accounting columns." },
                ].map((option) => {
                  const active = entryModeDraft === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-2xl border p-4 text-left transition-colors ${active ? "border-primary bg-primary-soft" : "border-border bg-white hover:bg-canvas"}`}
                      onClick={() => setEntryModeDraft(option.value as AccountingEntryMode)}
                    >
                      <div className="font-medium text-foreground">{option.label}</div>
                      <div className="mt-1 text-sm text-muted">{option.description}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted">Shortcut: `Alt + D` toggles this instantly from the voucher screen.</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setEntryMode(entryModeDraft);
                  toast.success("Settings saved for this session");
                  setSettingsOpen(false);
                }}
              >
                <CheckCircle2 className="h-5 w-5" />
                Save Settings
              </Button>
              <Button variant="outline" onClick={() => router.push(buildWorkspaceRoute(mode, "/masters/settings"))}>
                Open Full Settings
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <LifeBuoy className="h-5 w-5 text-primary" />
            Help & Support
          </DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Shortcut guidance, billing help, and workflow references for demo and preview operations.
          </DialogDescription>
          <div className="space-y-3 pt-4">
            {supportCenterLinks.map((item) => (
              <button
                key={item.label}
                type="button"
                className="flex w-full items-start gap-3 rounded-2xl border border-border p-4 text-left transition hover:bg-canvas"
                onClick={() => handleSupportLink(item.label)}
              >
                <div className="rounded-xl bg-primary-soft p-2 text-primary">
                  <item.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{item.label}</div>
                  <div className="text-sm text-muted">{item.description}</div>
                </div>
              </button>
            ))}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSupportOpen(false);
                  setShortcutHelpOpen(true);
                }}
              >
                <BookOpenCheck className="h-4 w-4" />
                Open Shortcut Guide
              </Button>
              <Button
                onClick={() => {
                  setSupportOpen(false);
                  openSupportChat();
                }}
              >
                Contact Support
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
