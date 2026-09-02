import type { SalesWorkspaceSection } from "@/config/sales";
import type { PurchaseWorkspaceSection } from "@/config/purchase";
import type { DataMode, VoucherType } from "@/types/domain";
import type { WorkflowPolicy } from "@/services/workflow-settings.service";

export function resolveAppShellMode(
  defaultMode: DataMode,
): Exclude<DataMode, "api"> {
  void defaultMode;
  return "mock";
}

export function normalizeMode(
  pathname: string,
  defaultMode: DataMode,
  sessionMode?: DataMode | null,
): DataMode {
  if (pathname.startsWith("/demo")) {
    return sessionMode === "mock" ? "mock" : "api";
  }

  if (pathname.startsWith("/app")) {
    // Once a real session exists, its mode is authoritative — a signed-in "api"
    // user must see real data, not the mock preview dataset. Before hydration
    // (no session yet) this falls back to the previous static-default behavior.
    if (sessionMode === "api" || sessionMode === "mock") {
      return sessionMode;
    }

    return resolveAppShellMode(defaultMode);
  }

  return defaultMode;
}

export function modePrefix(mode: DataMode) {
  void mode;
  return "/app";
}

export function buildWorkspaceRoute(mode: DataMode, path: string) {
  return `${modePrefix(mode)}${path}`;
}

export function isManufacturingWorkspacePath(mode: DataMode, pathname: string) {
  const prefix = buildWorkspaceRoute(mode, "/manufacturing");
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function buildVoucherRoute(mode: DataMode, voucherType: VoucherType) {
  return buildWorkspaceRoute(mode, `/vouchers/${voucherType}/new`);
}

export function buildSalesWorkspaceRoute(
  mode: DataMode,
  section: SalesWorkspaceSection,
) {
  return buildWorkspaceRoute(mode, `/sales/${section}`);
}

export function buildSalesInvoiceRoute(mode: DataMode) {
  return buildSalesWorkspaceRoute(mode, "invoices");
}

export function buildSalesInvoiceCreateRoute(
  mode: DataMode,
  openKey?: string | number,
) {
  const route = buildVoucherRoute(mode, "sales");
  if (openKey === undefined) {
    return route;
  }

  return `${route}?open=${encodeURIComponent(String(openKey))}`;
}

/**
 * Chooses the entry point for a brand-new purchase transaction. Existing
 * order/receipt chains deliberately keep using their explicit source links,
 * irrespective of the company's current preference.
 */
export function buildPurchaseStartRoute(
  mode: DataMode,
  policy: WorkflowPolicy,
) {
  const route = buildVoucherRoute(mode, "purchase");
  return policy === "ORDER_BASED"
    ? `${route}?workflow=purchase-order`
    : `${route}?workflow=direct`;
}

/** Direct and hybrid workspaces start with an invoice; order-based workspaces
 * start with a Sales Order. */
export function buildSalesStartRoute(
  mode: DataMode,
  policy: WorkflowPolicy,
  openKey?: string | number,
) {
  if (policy === "ORDER_BASED") {
    const route = buildSalesWorkspaceRoute(mode, "sale-order");
    const params = new URLSearchParams({ create: "1" });
    if (openKey !== undefined) params.set("open", String(openKey));
    return `${route}?${params.toString()}`;
  }

  return buildSalesInvoiceCreateRoute(mode, openKey);
}

export function buildSalesOrderEditRoute(mode: DataMode, voucherId: string) {
  const returnTo = buildSalesWorkspaceRoute(mode, "sale-order");
  return `${buildVoucherRoute(mode, "sales")}?workflow=sale-order&edit=${encodeURIComponent(voucherId)}&returnTo=${encodeURIComponent(returnTo)}`;
}

export function buildPurchaseWorkspaceRoute(
  mode: DataMode,
  section: PurchaseWorkspaceSection,
) {
  return buildWorkspaceRoute(mode, `/purchase/${section}`);
}
