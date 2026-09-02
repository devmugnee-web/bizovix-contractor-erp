import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), "src", relativePath), "utf8");
}

describe("workflow policy UI contract", () => {
  it("does not expose source-less Receipt Note or Delivery Note create links", () => {
    const sidebar = readSource("layouts/sidebar-nav.tsx");
    const salesWorkspace = readSource("features/screens/sales-workspace-screen.tsx");

    expect(sidebar).not.toContain("/vouchers/purchase/new?workflow=receipt-note");
    expect(sidebar).not.toContain("/sales/delivery-challan?create=1");
    expect(salesWorkspace).toContain("Select a Sales Order and use Convert to Delivery Note.");
    expect(salesWorkspace).toContain('section === "delivery-challan" && !conversionSourceVoucherId');
  });

  it("keeps new roots closed when workflow settings are unavailable or incompatible", () => {
    const voucherEntry = readSource("features/screens/voucher-entry-screen.tsx");
    const salesWorkspace = readSource("features/screens/sales-workspace-screen.tsx");

    expect(voucherEntry).toContain("evaluateWorkflowRootAccess");
    expect(voucherEntry).toContain('newRootWorkflowAccess.reason === "SETTINGS_ERROR"');
    expect(voucherEntry).toContain('newRootPolicy !== "DIRECT"');
    expect(salesWorkspace).toContain('const requestKey = `blocked:sale-order:${access.reason}`');
  });

  it("keeps advanced history reachable and report create actions policy-aware", () => {
    const settings = readSource("features/screens/auto-backup-screen.tsx");
    const reports = readSource("features/screens/reports-workspace-screen.tsx");

    for (const route of [
      "/purchase/orders",
      "/purchase/receipt-notes",
      "/sales/sale-order",
      "/sales/delivery-challan",
    ]) {
      expect(settings).toContain(route);
    }
    expect(reports).toContain('function openOrderRootFromReport(kind: "purchase" | "sales")');
    expect(reports).toContain('openOrderRootFromReport(isPurchaseOrderReport ? "purchase" : "sales")');
    expect(reports).toContain("workflowSettingsQuery.isError");
  });
});
