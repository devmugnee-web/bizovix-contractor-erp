import { describe, expect, it, vi } from "vitest";

import { LcAllocationMode, LcLandedCostStatus, LcStatus, Prisma } from "../generated/prisma/index.js";
import { LcService } from "./lc.service.js";
import { allocateProportionally } from "./lc-allocation.util.js";

const D = (value: number) => new Prisma.Decimal(value);

// The spec's acceptance dataset: 7 imported products plus 7 additional
// import costs, expected to reconcile to an exact BDT 4,854,296.45 landed
// cost with zero allocation difference.
const PRODUCTS = [
  { id: "forklift", productName: "Forklift", quantity: 1, totalPurchaseCostBdt: 713933.91 },
  { id: "plate-processor", productName: "Plate Processor", quantity: 1, totalPurchaseCostBdt: 785232.35 },
  { id: "fishing-boat", productName: "Fishing Boat", quantity: 2, totalPurchaseCostBdt: 178910.0 },
  { id: "flight-case", productName: "Flight Case", quantity: 25, totalPurchaseCostBdt: 213000.0 },
  { id: "empty-cabinet", productName: "Empty Cabinet", quantity: 101, totalPurchaseCostBdt: 519645.0 },
  { id: "front-service-cabinet", productName: "Front Service Aluminum Cabinet", quantity: 100, totalPurchaseCostBdt: 221200.0 },
  { id: "controller-flight-case", productName: "Controller Flight Case", quantity: 3, totalPurchaseCostBdt: 14880.0 },
];

const COST_ENTRIES = [
  { id: "ce-lc-cost", category: "LC_BANKING", name: "LC Cost", bdtAmount: 494879.0 },
  { id: "ce-origin", category: "ORIGIN", name: "Supplier Warehouse -> Supplier Port", bdtAmount: 700000.0 },
  { id: "ce-customs", category: "CUSTOMS", name: "Custom Duty", bdtAmount: 370545.04 },
  { id: "ce-tax", category: "TAX", name: "Global Tax", bdtAmount: 3450.0 },
  { id: "ce-cnf", category: "CNF", name: "CNF Bill", bdtAmount: 170000.0 },
  { id: "ce-transport", category: "DESTINATION_TRANSPORT", name: "Chattogram -> Dhaka Transport", bdtAmount: 44505.15 },
  { id: "ce-local", category: "LOCAL", name: "Local Cost", bdtAmount: 424116.0 },
];

function buildItems(receivedQuantity: "full" | "none" = "full") {
  return PRODUCTS.map((product, index) => ({
    id: product.id,
    productName: product.productName,
    quantity: D(product.quantity),
    usdUnitPrice: D(1),
    exchangeRate: D(125),
    calculatedBdtUnitPrice: D(125),
    acceptedBdtUnitPrice: null,
    totalPurchaseCostBdt: D(product.totalPurchaseCostBdt),
    weight: null,
    cbm: null,
    hsCode: null,
    receivedQuantity: receivedQuantity === "full" ? D(product.quantity) : D(0),
    landedCostAmount: null,
    landedCostPerUnit: null,
    profitMode: null,
    profitValue: null,
    sortOrder: index,
    allocations: [],
  }));
}

function buildCostEntries(items: ReturnType<typeof buildItems>, options: { fullyAllocated: boolean }) {
  return COST_ENTRIES.map((entry) => {
    const rows = allocateProportionally(
      entry.bdtAmount,
      items.map((item) => ({ id: item.id, basisValue: item.totalPurchaseCostBdt })),
    );
    const allocations = options.fullyAllocated
      ? rows.map((row) => ({
          id: `alloc-${entry.id}-${row.id}`,
          lcItemId: row.id,
          basisValue: row.basisValue,
          basisPercentage: row.basisPercentage,
          autoSuggestedAmount: row.amount,
          manualAmount: null,
          finalAmount: row.amount,
          isDirect: false,
          isOverridden: false,
          overrideReason: null,
        }))
      : [];

    return {
      id: entry.id,
      costHeadId: `head-${entry.id}`,
      costHead: { id: `head-${entry.id}`, name: entry.name, category: entry.category, fallbackAllocationMethod: null },
      shipmentId: null,
      vendorName: null,
      invoiceNumber: null,
      invoiceDate: null,
      currency: "BDT",
      foreignAmount: null,
      exchangeRate: null,
      bdtAmount: D(entry.bdtAmount),
      allocationMode: LcAllocationMode.AUTO,
      allocationBasis: "PURCHASE_VALUE",
      includeInLandedCost: true,
      attachmentUrl: null,
      attachmentName: null,
      remarks: null,
      isLocked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      allocations,
    };
  });
}

function buildLcFixture(options: { fullyAllocated: boolean; received: "full" | "none" }) {
  const items = buildItems(options.received);
  const costEntries = buildCostEntries(items, { fullyAllocated: options.fullyAllocated });
  return {
    id: "lc-1",
    workspaceId: "workspace-1",
    companyId: "company-1",
    tenantId: "tenant-1",
    lcNumber: "LC-0001",
    lcDate: new Date("2026-07-01"),
    supplierName: "Acme Supplier",
    purchasePaymentStatus: "PAID",
    purchasePaidAmount: D(2646801.26),
    paymentReference: null,
    paymentAllocations: [],
    purchaseGlVoucherId: "purchase-voucher-1",
    status: LcStatus.READY_TO_FINALIZE,
    supplier: null,
    destinationWarehouse: null,
    items,
    shipments: [],
    costEntries,
    grns: [],
    statusHistory: [],
    landedCost: null,
  };
}

function buildHarness(fixture: ReturnType<typeof buildLcFixture>, options: { managedLedgersExist?: boolean } = {}) {
  const managedLedgersExist = options.managedLedgersExist ?? true;
  const lcLandedCostUpsert = vi.fn(async () => ({ id: "landed-cost-1" }));
  const lcLandedCostItemCreateMany = vi.fn(async () => ({}));
  const tx = {
    lcLandedCost: { upsert: lcLandedCostUpsert },
    lcLandedCostItem: { deleteMany: vi.fn(async () => ({})), createMany: lcLandedCostItemCreateMany },
    lcItem: { update: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
    lcCostEntry: { updateMany: vi.fn(async () => ({})), update: vi.fn(async () => ({})) },
    lcCostAllocation: { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
    lcMaster: { update: vi.fn(async () => fixture) },
  };

  const prisma = {
    lcMaster: { findFirst: vi.fn(async () => fixture), delete: vi.fn(async () => ({})), update: vi.fn(async () => ({})) },
    lcCostEntry: { findUniqueOrThrow: vi.fn(async () => ({ costHead: { fallbackAllocationMethod: null } })) },
    lcStatusHistory: { create: vi.fn(async () => ({})) },
    account: {
      findFirst: vi.fn(async ({ where }: { where: { code?: string; managedRole?: string } }) => {
        if (where.code === "1210001") return { id: "acc-inventory-control", name: "Renamed Inventory", isSystem: true };
        if (where.code === "1250000") return { id: "cat-goods-in-transit", name: "Renamed Transit", isSystem: true };
        if (where.code === "2212000") return { id: "cat-others-payable", name: "Renamed Payable Parent", isSystem: true };
        if (managedLedgersExist && where.managedRole === "LC_GOODS_IN_TRANSIT") {
          return { id: "acc-goods-in-transit-lc", name: "Renamed LC Transit", managedRole: where.managedRole, level: "LEDGER", parentId: "cat-goods-in-transit", nature: "ASSET", status: "ACTIVE", isSystem: false };
        }
        if (managedLedgersExist && where.managedRole === "LC_IMPORT_COST_PAYABLE") {
          return { id: "acc-import-cost-payable", name: "Renamed LC Payable", managedRole: where.managedRole, level: "LEDGER", parentId: "cat-others-payable", nature: "LIABILITY", status: "ACTIVE", isSystem: false };
        }
        return null;
      }),
    },
    $transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  const accountsService = {
    createManagedAccount: vi.fn(async (_user: unknown, managedRole: string, dto: Record<string, unknown>) => ({
      id: `created-${managedRole}`,
      ...dto,
      managedRole,
      status: "ACTIVE",
      isSystem: false,
    })),
  };
  const vouchersService = { create: vi.fn<(currentUser: unknown, dto: unknown) => Promise<{ id: string }>>(async () => ({ id: "voucher-1" })) };
  const postingEngine = { transitionStatus: vi.fn(async () => ({})), reverseVoucher: vi.fn(async () => ({})) };
  const auditService = { log: vi.fn(async () => ({})) };
  const inventoryService = { reconcileMovingAverageLedger: vi.fn(async () => undefined) };

  const service = new LcService(prisma as never, accountsService as never, vouchersService as never, postingEngine as never, auditService as never, inventoryService as never);
  return { service, prisma, accountsService, vouchersService, postingEngine, inventoryService, tx, lcLandedCostUpsert };
}

const currentUser = { id: "user-1", tenantId: "tenant-1", companyId: "company-1", workspaceId: "workspace-1" } as never;

describe("LcService.finalizeLandedCost — acceptance dataset", () => {
  it("computes BDT 4,854,296.45 landed cost and posts only BDT 2,207,495.19 additional import cost", async () => {
    const fixture = buildLcFixture({ fullyAllocated: true, received: "full" });
    const { service, vouchersService } = buildHarness(fixture);

    await service.finalizeLandedCost(currentUser, "lc-1");

    expect(vouchersService.create).toHaveBeenCalledTimes(1);
    const voucherArgs = vouchersService.create.mock.calls[0][1] as { totalAmount: number; lines: Array<{ debit: number; credit: number }> };
    expect(voucherArgs.totalAmount).toBe(2207495.19);
    expect(voucherArgs.lines[0].debit).toBe(2207495.19);
    expect(voucherArgs.lines.slice(1).reduce((sum: number, line: { credit: number }) => sum + line.credit, 0)).toBe(2207495.19);
    expect((voucherArgs.lines[0] as { ledger?: string }).ledger).toBe("Renamed LC Transit");
    expect(voucherArgs.lines.slice(1).every((line) => (line as { ledger?: string }).ledger === "Renamed LC Payable")).toBe(true);
  });

  it("creates missing LC ledgers with stable roles and never promotes them to protected accounts", async () => {
    const fixture = buildLcFixture({ fullyAllocated: true, received: "full" });
    const { service, accountsService, prisma } = buildHarness(fixture, { managedLedgersExist: false });

    await service.finalizeLandedCost(currentUser, "lc-1");

    expect(accountsService.createManagedAccount).toHaveBeenCalledTimes(2);
    expect(accountsService.createManagedAccount.mock.calls.map((call) => call[1])).toEqual([
      "LC_GOODS_IN_TRANSIT",
      "LC_IMPORT_COST_PAYABLE",
    ]);
    expect(accountsService.createManagedAccount.mock.calls.every((call) => !("isSystem" in call[2]))).toBe(true);
    expect(prisma.account.findFirst.mock.calls.every((call) => !("name" in call[0].where))).toBe(true);
  });

  it("blocks finalization when a cost entry is not fully allocated", async () => {
    const fixture = buildLcFixture({ fullyAllocated: false, received: "full" });
    const { service } = buildHarness(fixture);

    await expect(service.finalizeLandedCost(currentUser, "lc-1")).rejects.toThrow(/not fully allocated/i);
  });

  it("blocks finalization when GRN received quantity is missing", async () => {
    const fixture = buildLcFixture({ fullyAllocated: true, received: "none" });
    const { service } = buildHarness(fixture);

    await expect(service.finalizeLandedCost(currentUser, "lc-1")).rejects.toThrow(/GRN received quantity/i);
  });

  it("blocks finalization while purchase payment is due", async () => {
    const fixture = buildLcFixture({ fullyAllocated: true, received: "full" });
    fixture.purchasePaymentStatus = "PARTIAL";
    fixture.purchasePaidAmount = D(1000000);
    const { service } = buildHarness(fixture);

    await expect(service.finalizeLandedCost(currentUser, "lc-1")).rejects.toThrow(/payment is still due/i);
  });

  it("rejects finalizing an already-finalized LC", async () => {
    const fixture = buildLcFixture({ fullyAllocated: true, received: "full" });
    (fixture as { landedCost: unknown }).landedCost = { status: LcLandedCostStatus.FINALIZED };
    const { service } = buildHarness(fixture);

    await expect(service.finalizeLandedCost(currentUser, "lc-1")).rejects.toThrow(/already finalized/i);
  });
});

describe("LcService.delete", () => {
  it("reverses the purchase GL voucher before deleting a draft LC", async () => {
    const fixture = buildLcFixture({ fullyAllocated: true, received: "full" });
    fixture.costEntries = [];
    const { service, prisma, postingEngine } = buildHarness(fixture);

    const result = await service.delete(currentUser, "lc-1");

    expect(result).toEqual({ success: true, id: "lc-1" });
    expect(postingEngine.reverseVoucher).toHaveBeenCalledWith(currentUser, "purchase-voucher-1", expect.stringContaining("LC-0001"));
    expect(prisma.lcMaster.delete).toHaveBeenCalledWith({ where: { id: "lc-1" } });
  });

  it("reverses the finalize GL voucher before deleting a finalized LC", async () => {
    const fixture = buildLcFixture({ fullyAllocated: true, received: "full" });
    fixture.costEntries = [];
    (fixture as { landedCost: unknown }).landedCost = { status: LcLandedCostStatus.FINALIZED, glVoucherId: "voucher-1" };
    const { service, prisma, postingEngine } = buildHarness(fixture);

    await service.delete(currentUser, "lc-1");

    expect(postingEngine.reverseVoucher).toHaveBeenCalledWith(currentUser, "voucher-1", expect.stringContaining("LC-0001"));
    expect(prisma.lcMaster.delete).toHaveBeenCalledWith({ where: { id: "lc-1" } });
  });

  it("blocks deleting an LC while any cost posting exists", async () => {
    const fixture = buildLcFixture({ fullyAllocated: true, received: "full" });
    const { service, prisma, postingEngine } = buildHarness(fixture);

    await expect(service.delete(currentUser, "lc-1")).rejects.toThrow(/7 cost postings/i);
    expect(postingEngine.reverseVoucher).not.toHaveBeenCalled();
    expect(prisma.lcMaster.delete).not.toHaveBeenCalled();
  });
});

describe("LcService.update — product edits", () => {
  const newItems = [
    { productName: "Forklift", quantity: 1, usdUnitPrice: 6000, unit: "pcs" },
    { productName: "New Generator", quantity: 2, usdUnitPrice: 1000, unit: "pcs" },
  ];

  it("reverses and reposts the purchase GL voucher when the product list changes", async () => {
    const fixture = buildLcFixture({ fullyAllocated: true, received: "full" });
    fixture.costEntries = [];
    fixture.grns = [];
    // The new, smaller product list's total is below the fixture's default
    // paid amount — reset to unpaid so the paid-vs-total guard doesn't fire
    // for a reason unrelated to what this test is checking.
    fixture.purchasePaymentStatus = "UNPAID";
    fixture.purchasePaidAmount = D(0);
    const { service, tx, postingEngine, vouchersService } = buildHarness(fixture);

    await service.update(currentUser, "lc-1", { exchangeRate: 125, items: newItems } as never);

    expect(postingEngine.reverseVoucher).toHaveBeenCalledWith(currentUser, "purchase-voucher-1", expect.stringContaining("products edited"));
    expect(tx.lcItem.deleteMany).toHaveBeenCalledWith({ where: { lcId: "lc-1" } });
    expect(tx.lcItem.createMany).toHaveBeenCalledTimes(1);
    // 1 pcs @ 6000*125 + 2 pcs @ 1000*125 = 750,000 + 250,000 = 1,000,000
    const repostCall = vouchersService.create.mock.calls.at(-1)![1] as { totalAmount: number };
    expect(repostCall.totalAmount).toBe(1000000);
  });

  it("blocks editing products once a GRN has been recorded", async () => {
    const fixture = buildLcFixture({ fullyAllocated: true, received: "full" });
    fixture.costEntries = [];
    (fixture as { grns: unknown[] }).grns = [{ id: "grn-1", items: [] }];
    const { service } = buildHarness(fixture);

    await expect(service.update(currentUser, "lc-1", { exchangeRate: 125, items: newItems } as never)).rejects.toThrow(/GRN has been recorded/i);
  });

  it("rejects combining product edits with payment allocation changes in the same call", async () => {
    const fixture = buildLcFixture({ fullyAllocated: true, received: "full" });
    fixture.costEntries = [];
    const { service } = buildHarness(fixture);

    await expect(
      service.update(currentUser, "lc-1", { items: newItems, paymentAllocations: [{ accountId: "acc-1", amount: 1000 }] } as never),
    ).rejects.toThrow(/product changes first/i);
  });
});
