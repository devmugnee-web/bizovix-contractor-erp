"use client";

import { useEffect, useEffectEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { printCurrentPage } from "@/lib/current-page-print";

import { buildPurchaseStartRoute, buildSalesStartRoute, buildVoucherRoute, buildWorkspaceRoute } from "@/config/routes";
import { useWorkflowSettingsQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { isEditableElement } from "@/lib/utils";
import { defaultWorkflowSettings } from "@/services/workflow-settings.service";
import { useAccountingPreferenceStore } from "@/stores/accounting-preference-store";
import { useUiStore } from "@/stores/ui-store";
import type { DataMode, VoucherType } from "@/types/domain";

const voucherKeys: Record<string, VoucherType> = {
  P: "payment",
  R: "receipt",
  J: "journal",
  S: "sales",
  U: "purchase",
  E: "expense",
  V: "revenue",
};

function hasOpenModalLayer(target: EventTarget | null) {
  if (typeof document === "undefined") {
    return false;
  }

  if (target instanceof HTMLElement && target.closest("[data-erp-modal-content='true'], [role='dialog'][aria-modal='true']")) {
    return true;
  }

  return Boolean(document.querySelector("[data-erp-modal-content='true'], [role='dialog'][aria-modal='true']"));
}

export function useGlobalShortcuts(mode: DataMode) {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSessionContext();
  const workflowSettingsQuery = useWorkflowSettingsQuery(
    mode,
    session?.workspaceId ?? (mode === "api" ? null : "workspace"),
  );
  const workflowSettings = workflowSettingsQuery.data ?? defaultWorkflowSettings;
  const commandPaletteOpen = useUiStore((state) => state.commandPaletteOpen);
  const shortcutHelpOpen = useUiStore((state) => state.shortcutHelpOpen);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const setShortcutHelpOpen = useUiStore((state) => state.setShortcutHelpOpen);
  const setCreateMenuOpen = useUiStore((state) => state.setCreateMenuOpen);
  const toggleEntryMode = useAccountingPreferenceStore((state) => state.toggleEntryMode);
  const entryMode = useAccountingPreferenceStore((state) => state.entryMode);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const rawKey = typeof event.key === "string" ? event.key : "";
    const key = rawKey.toUpperCase();
    const editable = isEditableElement(event.target);

    if (rawKey === "F2" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      const postingDateInput = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-voucher-posting-date='true']"))
        .find((input) => !input.disabled && !input.readOnly && input.getClientRects().length > 0);

      if (postingDateInput) {
        event.preventDefault();
        event.stopImmediatePropagation();
        postingDateInput.focus();
        postingDateInput.select();
        return;
      }
    }

    if ((event.ctrlKey || event.metaKey) && key === "K") {
      event.preventDefault();
      setCommandPaletteOpen(true);
      return;
    }

    if (event.ctrlKey && rawKey === "/") {
      event.preventDefault();
      setShortcutHelpOpen(true);
      return;
    }

    if (rawKey === "Escape") {
      if (commandPaletteOpen) {
        setCommandPaletteOpen(false);
        return;
      }

      if (shortcutHelpOpen) {
        setShortcutHelpOpen(false);
        return;
      }

      if (hasOpenModalLayer(event.target)) {
        return;
      }
    }

    if (editable) {
      return;
    }

    if (event.altKey && key === "G") {
      event.preventDefault();
      document.getElementById("global-search")?.focus();
      return;
    }

    if (event.altKey && key === "F") {
      event.preventDefault();
      document.getElementById("page-filter-query")?.focus();
      return;
    }

    if (event.altKey && key === "C") {
      event.preventDefault();
      setCreateMenuOpen(true);
      toast.success("Create menu opened");
      return;
    }

    if (event.altKey && key === "D") {
      event.preventDefault();
      toggleEntryMode();
      toast.success(entryMode === "simple" ? "Debit and credit view enabled" : "Simple entry view enabled");
      return;
    }

    if (event.altKey && key === "S") {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("erp-save-request"));
      return;
    }

    if (event.altKey && key === "P") {
      event.preventDefault();
      const printEvent = new CustomEvent("erp-print-request", { cancelable: true });
      window.dispatchEvent(printEvent);
      if (!printEvent.defaultPrevented) {
        printCurrentPage();
      }
      return;
    }

    if (event.altKey && key === "E") {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("erp-export-request"));
      return;
    }

    if (voucherKeys[key]) {
      event.preventDefault();
      const voucherType = voucherKeys[key];
      setCreateMenuOpen(false);
      const href = voucherType === "sales"
        ? buildSalesStartRoute(mode, workflowSettings.salesWorkflow, Date.now())
        : voucherType === "purchase"
          ? buildPurchaseStartRoute(mode, workflowSettings.purchaseWorkflow)
          : buildVoucherRoute(mode, voucherType);
      router.push(href);
      const openedLabel = voucherType === "sales" && workflowSettings.salesWorkflow === "ORDER_BASED"
        ? "sales order"
        : voucherType === "purchase" && workflowSettings.purchaseWorkflow === "ORDER_BASED"
          ? "purchase order"
          : `${voucherType.replace("-", " ")} voucher`;
      toast.success(`${openedLabel} opened`);
      return;
    }

    if (rawKey === "Escape" && pathname !== buildWorkspaceRoute(mode, "/dashboard")) {
      router.back();
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onKeyDown]);
}
