import { describe, expect, it } from "vitest";

import {
  buildPurchaseStartRoute,
  buildSalesStartRoute,
  buildSalesInvoiceCreateRoute,
  buildSalesInvoiceRoute,
  buildSalesOrderEditRoute,
  buildVoucherRoute,
  buildWorkspaceRoute,
  isManufacturingWorkspacePath,
  normalizeMode,
} from "@/config/routes";

describe("route helpers", () => {
  it("routes retired demo-mode links into the live app", () => {
    expect(buildWorkspaceRoute("demo", "/dashboard")).toBe("/app/dashboard");
    expect(buildVoucherRoute("demo", "sales")).toBe("/app/vouchers/sales/new");
    expect(buildSalesInvoiceRoute("demo")).toBe("/app/sales/invoices");
    expect(buildSalesInvoiceCreateRoute("demo", "123")).toBe(
      "/app/vouchers/sales/new?open=123",
    );
  });

  it("always opens Sales Order edits in the Sales Order voucher workflow", () => {
    expect(buildSalesOrderEditRoute("api", "order/id 07")).toBe(
      "/app/vouchers/sales/new?workflow=sale-order&edit=order%2Fid%2007&returnTo=%2Fapp%2Fsales%2Fsale-order",
    );
  });

  it("starts new purchase and sales transactions from the configured workflow", () => {
    expect(buildPurchaseStartRoute("api", "DIRECT")).toBe("/app/vouchers/purchase/new?workflow=direct");
    expect(buildPurchaseStartRoute("api", "BOTH")).toBe("/app/vouchers/purchase/new?workflow=direct");
    expect(buildPurchaseStartRoute("api", "ORDER_BASED")).toBe("/app/vouchers/purchase/new?workflow=purchase-order");

    expect(buildSalesStartRoute("api", "DIRECT")).toBe("/app/vouchers/sales/new");
    expect(buildSalesStartRoute("api", "BOTH", "invoice-1")).toBe("/app/vouchers/sales/new?open=invoice-1");
    expect(buildSalesStartRoute("api", "ORDER_BASED")).toBe("/app/sales/sale-order?create=1");
  });

  it("normalizes runtime mode from pathname before a session exists", () => {
    expect(normalizeMode("/demo/day-book", "mock")).toBe("api");
    expect(normalizeMode("/app/day-book", "api")).toBe("mock");
  });

  it("honors the real session's mode once one exists, even on /app paths", () => {
    expect(normalizeMode("/app/day-book", "mock", "api")).toBe("api");
    expect(normalizeMode("/app/day-book", "api", "mock")).toBe("mock");
  });

  it("keeps retired /demo paths on the live session mode", () => {
    expect(normalizeMode("/demo/day-book", "mock", "api")).toBe("api");
  });

  it("hides global workspace actions only inside the Manufacturing module", () => {
    expect(isManufacturingWorkspacePath("api", "/app/manufacturing")).toBe(
      true,
    );
    expect(
      isManufacturingWorkspacePath("api", "/app/manufacturing/dashboard"),
    ).toBe(true);
    expect(
      isManufacturingWorkspacePath("api", "/app/manufacturing-tools"),
    ).toBe(false);
    expect(isManufacturingWorkspacePath("api", "/app/dashboard")).toBe(false);
    expect(isManufacturingWorkspacePath("api", "/app/lc-management")).toBe(
      false,
    );
  });
});
