import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { DashboardService } from "./dashboard.service.js";

const currentUser: AuthenticatedRequestUser = {
  id: "user-1",
  email: "owner@example.com",
  name: "Owner",
  initials: "OW",
  tenantId: "tenant-1",
  organizationId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

function salesEntry(options: {
  partyId: string | null;
  partyName: string;
  partyLedger: string;
  partyAccountId: string | null;
  amount?: number;
}) {
  const amount = options.amount ?? 500;
  return {
    id: `voucher-${options.partyId ?? "legacy"}-${options.partyAccountId ?? "name"}`,
    tenantId: "tenant-1",
    companyId: "company-1",
    workspaceId: "workspace-1",
    createdByUserId: "user-1",
    voucherType: "SALES",
    documentKind: null,
    sourceVoucherId: null,
    workflowOrigin: "DIRECT",
    voucherNumber: `SI-${options.partyId ?? "legacy"}`,
    voucherDate: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    partyName: options.partyName,
    partyId: options.partyId,
    reference: null,
    narration: null,
    status: "POSTED",
    settlementMode: "ACCOUNTS_PAYABLE",
    paidAmount: 0,
    supplierAddress: null,
    condition: null,
    buyerSignature: null,
    sellerSignature: null,
    attachmentImageUrl: null,
    attachmentDocumentUrl: null,
    attachmentDocumentName: null,
    discountType: "FIXED",
    discountAmount: 0,
    loyaltyPointsEarned: 0,
    loyaltyPointsRedeemed: 0,
    loyaltyDiscountAmount: 0,
    subtotal: amount,
    totalAmount: amount,
    debit: amount,
    credit: amount,
    currency: "BDT",
    reversalOfId: null,
    warehouse: null,
    inventoryItems: [],
    lines: [
      {
        id: "party-line",
        accountId: options.partyAccountId,
        ledger: options.partyLedger,
        description: null,
        debit: amount,
        credit: 0,
        costCenter: null,
        project: null,
        billReference: null,
      },
      {
        id: "sales-line",
        accountId: "sales-account",
        ledger: "Sales Account",
        description: null,
        debit: 0,
        credit: amount,
        costCenter: null,
        project: null,
        billReference: null,
      },
    ],
  };
}

type DashboardEntry = Omit<ReturnType<typeof salesEntry>, "documentKind" | "reversalOfId"> & {
  documentKind: string | null;
  reversalOfId: string | null;
};

async function dashboardFor(
  entries: DashboardEntry[],
  parties: Array<{
    id: string;
    ledgerAccountId: string | null;
    name: string;
    type: "CUSTOMER" | "SUPPLIER";
    openingBalance: number;
    billMaturityDays: number;
  }>,
  accounts: Array<{ id: string; code: string; name: string; parentId: string | null; bankDetails: Record<string, unknown> | null }> = [],
) {
  const voucherFindMany = vi.fn(async ({ where }: { where: { status?: string } }) =>
    where.status === "PENDING" ? [] : entries);
  const prisma = {
    workspaceMember: { findFirst: vi.fn(async () => ({ id: "membership-1" })) },
    voucherEntry: { findMany: voucherFindMany },
    account: { findMany: vi.fn(async () => accounts) },
    party: { findMany: vi.fn(async () => parties) },
  };
  return new DashboardService(prisma as never).getForCurrentUser(currentUser, "workspace-1");
}

function attentionValue(
  dashboard: Awaited<ReturnType<DashboardService["getForCurrentUser"]>>,
  metricId: "receivable" | "payable" | "cash" | "bank" | "mfs",
) {
  return dashboard.metrics.find((metric) => metric.id === metricId)?.attention;
}

function metricValue(
  dashboard: Awaited<ReturnType<DashboardService["getForCurrentUser"]>>,
  metricId: "receivable" | "payable" | "sales" | "purchase" | "cash" | "bank" | "mfs",
) {
  return dashboard.metrics.find((metric) => metric.id === metricId)?.value;
}

describe("DashboardService invoice and bill metrics", () => {
  it("counts only final Sales Invoices and Purchase Bills, never order or fulfilment stages", async () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const makeEntry = (
      id: string,
      voucherType: string,
      documentKind: string | null,
      amount: number,
    ): DashboardEntry => {
      const entry: DashboardEntry = salesEntry({
        partyId: "customer-1",
        partyName: "Customer One",
        partyLedger: "Customer One",
        partyAccountId: "customer-ar-1",
        amount,
      });
      entry.id = id;
      entry.voucherNumber = id;
      entry.voucherType = voucherType;
      entry.documentKind = documentKind;
      entry.voucherDate = today;
      entry.createdAt = today;
      return entry;
    };
    const entries = [
      makeEntry("SI-1", "SALES", null, 500),
      makeEntry("SO-LEGACY", "SALES", "sale-order", 900),
      makeEntry("DN-LEGACY", "SALES", "delivery-note", 800),
      makeEntry("SO-ENUM", "SALES_ORDER", "sale-order", 700),
      makeEntry("DN-ENUM", "DELIVERY_NOTE", "delivery-note", 600),
      makeEntry("PB-1", "PURCHASE", "bill", 400),
      makeEntry("PO-LEGACY", "PURCHASE", "purchase-order", 300),
      makeEntry("GRN-LEGACY", "PURCHASE", "receipt-note", 200),
      makeEntry("PO-ENUM", "PURCHASE_ORDER", "purchase-order", 100),
      makeEntry("GRN-ENUM", "RECEIPT_NOTE", "receipt-note", 50),
      makeEntry("UNKNOWN-STAGE", "SALES", "packing-list", 25),
    ];

    const dashboard = await dashboardFor(entries, [{
      id: "customer-1",
      ledgerAccountId: "customer-ar-1",
      name: "Customer One",
      type: "CUSTOMER",
      openingBalance: 0,
      billMaturityDays: -1,
    }]);

    expect(metricValue(dashboard, "sales")).toBe(500);
    expect(metricValue(dashboard, "purchase")).toBe(400);
    expect(dashboard.metrics.find((metric) => metric.id === "sales")?.monthValue).toBe(500);
    expect(dashboard.metrics.find((metric) => metric.id === "purchase")?.monthValue).toBe(400);
    expect(attentionValue(dashboard, "receivable")).toMatchObject({ value: 500, count: 1 });
  });
});

describe("DashboardService party attention identity", () => {
  it("uses partyId plus ledgerAccountId even when the persisted ledger snapshot has an old name", async () => {
    const dashboard = await dashboardFor(
      [salesEntry({
        partyId: "customer-1",
        partyName: "Renamed Customer",
        partyLedger: "Old Customer Name",
        partyAccountId: "customer-ar-1",
      })],
      [{
        id: "customer-1",
        ledgerAccountId: "customer-ar-1",
        name: "Renamed Customer",
        type: "CUSTOMER",
        openingBalance: 0,
        billMaturityDays: 30,
      }],
    );

    expect(attentionValue(dashboard, "receivable")).toMatchObject({ value: 500, count: 1 });
  });

  it("keeps name matching only for a legacy line whose accountId is missing", async () => {
    const dashboard = await dashboardFor(
      [salesEntry({
        partyId: null,
        partyName: "Legacy Customer",
        partyLedger: "Legacy Customer",
        partyAccountId: null,
      })],
      [{
        id: "customer-legacy",
        ledgerAccountId: "customer-ar-legacy",
        name: "Legacy Customer",
        type: "CUSTOMER",
        openingBalance: 0,
        billMaturityDays: 30,
      }],
    );

    expect(attentionValue(dashboard, "receivable")).toMatchObject({ value: 500, count: 1 });
  });

  it("never lets an equal display name override conflicting party and account ids", async () => {
    const dashboard = await dashboardFor(
      [salesEntry({
        partyId: "other-party",
        partyName: "Shared Name",
        partyLedger: "Shared Name",
        partyAccountId: "other-account",
      })],
      [{
        id: "customer-1",
        ledgerAccountId: "customer-ar-1",
        name: "Shared Name",
        type: "CUSTOMER",
        openingBalance: 0,
        billMaturityDays: 30,
      }],
    );

    expect(attentionValue(dashboard, "receivable")).toMatchObject({ value: 0, count: 0 });
  });

  it("does not name-match an ID-backed line when the legacy Party link is missing", async () => {
    const dashboard = await dashboardFor(
      [salesEntry({
        partyId: "customer-1",
        partyName: "Shared Caption",
        partyLedger: "Shared Caption",
        partyAccountId: "some-other-account",
      })],
      [{
        id: "customer-1",
        ledgerAccountId: null,
        name: "Shared Caption",
        type: "CUSTOMER",
        openingBalance: 0,
        billMaturityDays: 30,
      }],
    );

    expect(attentionValue(dashboard, "receivable")).toMatchObject({ value: 0, count: 0 });
  });

  it("includes an ID-backed Party opening journal in receivables without adding the metadata twice", async () => {
    const opening: DashboardEntry = salesEntry({
      partyId: "customer-1",
      partyName: "Opening Customer",
      partyLedger: "Opening Customer",
      partyAccountId: "customer-ar-1",
      amount: 300,
    });
    opening.voucherType = "JOURNAL";
    opening.documentKind = "opening-balance";
    opening.voucherNumber = "OB-PARTY-1231001";
    opening.lines[1] = {
      ...opening.lines[1],
      accountId: "opening-equity",
      ledger: "Opening Balance Equity",
    };

    const dashboard = await dashboardFor(
      [opening],
      [{
        id: "customer-1",
        ledgerAccountId: "customer-ar-1",
        name: "Opening Customer",
        type: "CUSTOMER",
        openingBalance: 300,
        billMaturityDays: 30,
      }],
    );

    expect(metricValue(dashboard, "receivable")).toBe(300);
  });

  it("nets a reversed original with its posted mirror in dashboard balances", async () => {
    const original: DashboardEntry = salesEntry({
      partyId: "customer-1",
      partyName: "Customer One",
      partyLedger: "Customer One",
      partyAccountId: "customer-ar-1",
      amount: 500,
    });
    original.id = "sale-original";
    original.status = "REVERSED";
    const reversal = {
      ...original,
      id: "sale-reversal",
      voucherNumber: `${original.voucherNumber}-REV`,
      status: "POSTED",
      reversalOfId: original.id,
      lines: original.lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit })),
    };

    const dashboard = await dashboardFor(
      [original, reversal],
      [{
        id: "customer-1",
        ledgerAccountId: "customer-ar-1",
        name: "Customer One",
        type: "CUSTOMER",
        openingBalance: 0,
        billMaturityDays: 30,
      }],
    );

    expect(metricValue(dashboard, "receivable")).toBe(0);
  });
});

describe("DashboardService money-account identity", () => {
  function moneyEntry(accountId: string | null, ledger: string): DashboardEntry {
    const entry: DashboardEntry = salesEntry({
      partyId: null,
      partyName: "Opening",
      partyLedger: ledger,
      partyAccountId: accountId,
      amount: 500,
    });
    entry.voucherType = "JOURNAL";
    entry.lines[1] = { ...entry.lines[1], accountId: "equity", ledger: "Opening Equity" };
    return entry;
  }

  it("uses fixed COA codes for an ID-backed ledger even after every caption is renamed", async () => {
    const dashboard = await dashboardFor(
      [moneyEntry("cash-ledger", "Old snapshot")],
      [],
      [
        { id: "cash-category", code: "1221000", name: "Localized liquid funds", parentId: null, bankDetails: null },
        { id: "cash-ledger", code: "1221009", name: "Front counter", parentId: "cash-category", bankDetails: null },
      ],
    );

    expect(metricValue(dashboard, "cash")).toBe(500);
  });

  it("does not classify an ID-backed lookalike ledger by its mutable cash name", async () => {
    const dashboard = await dashboardFor(
      [moneyEntry("lookalike-ledger", "Cash in Hand")],
      [],
      [
        { id: "lookalike-category", code: "9990000", name: "Cash Accounts", parentId: null, bankDetails: null },
        { id: "lookalike-ledger", code: "9990001", name: "Cash in Hand", parentId: "lookalike-category", bankDetails: null },
      ],
    );

    expect(metricValue(dashboard, "cash")).toBe(0);
  });
});
