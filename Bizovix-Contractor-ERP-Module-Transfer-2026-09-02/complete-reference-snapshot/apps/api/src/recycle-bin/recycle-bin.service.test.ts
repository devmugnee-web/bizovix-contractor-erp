import { describe, expect, it, vi } from "vitest";

import {
  RecycleBinEntryKind,
  VoucherEntryType,
  VoucherWorkflowOrigin,
} from "../generated/prisma/index.js";
import { RecycleBinService } from "./recycle-bin.service.js";

type RestoreInternals = {
  restoreVoucher(snapshot: Record<string, unknown>): Promise<void>;
};

function voucherSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "invoice-1",
    tenantId: "tenant-1",
    companyId: "company-1",
    workspaceId: "workspace-1",
    createdByUserId: "user-1",
    voucherType: VoucherEntryType.SALES,
    documentKind: null,
    sourceVoucherId: "source-1",
    voucherNumber: "SI-LEGACY-1",
    voucherDate: "2026-08-31T00:00:00.000Z",
    partyName: "Customer One",
    totalAmount: 100,
    lines: [
      { accountId: "customer-ledger-1", ledger: "Customer One", debit: 100, credit: 0 },
      { accountId: "sales-ledger-1", ledger: "Sales Account", debit: 0, credit: 100 },
    ],
    inventoryItems: [],
    ...overrides,
  };
}

function restoreHarness(
  source?: { voucherType: VoucherEntryType; documentKind: string | null },
  accounts: Array<{ id: string; companyId: string; name: string }> = [
    { id: "customer-ledger-1", companyId: "company-1", name: "Customer One (renamed)" },
    { id: "sales-ledger-1", companyId: "company-1", name: "Sales Account" },
  ],
) {
  const create = vi.fn(async () => ({}));
  const inventoryCreate = vi.fn(async (args: { data: Record<string, unknown> }) => {
    void args;
    return {};
  });
  const findUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
    if (where.id === "invoice-1") return null;
    if (where.id === "source-1") return source ?? null;
    return null;
  });
  const prisma = {
    voucherEntry: { findUnique, create },
    voucherInventoryItem: {
      create: inventoryCreate,
      findUnique: vi.fn(async () => ({
        voucher: { workspaceId: "workspace-1", companyId: "company-1" },
      })),
    },
    account: {
      findMany: vi.fn(async ({ where }: { where: { companyId: string; id: { in: string[] } } }) =>
        accounts.filter((account) => account.companyId === where.companyId && where.id.in.includes(account.id))),
    },
    recycleBinEntry: { findFirst: vi.fn(async () => null) },
  };
  const service = new RecycleBinService(prisma as never) as unknown as RestoreInternals;
  return { service, create, inventoryCreate, findUnique };
}

describe("RecycleBinService voucher workflow restoration", () => {
  it("preserves an origin already captured in the recycle snapshot", async () => {
    const { service, create, findUnique } = restoreHarness();

    await service.restoreVoucher(voucherSnapshot({
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
    }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW }),
    }));
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["legacy Sales Order source", "sale-order", VoucherWorkflowOrigin.DIRECT],
    ["Delivery Note source", "delivery-note", VoucherWorkflowOrigin.ORDER_FLOW],
  ] as const)("derives the safe origin for a pre-origin snapshot with a %s", async (_label, sourceKind, expected) => {
    const { service, create } = restoreHarness({
      voucherType: VoucherEntryType.SALES,
      documentKind: sourceKind,
    });

    await service.restoreVoucher(voucherSnapshot());

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workflowOrigin: expected }),
    }));
  });

  it("restores lines by captured Account id and refreshes only their display captions", async () => {
    const { service, create } = restoreHarness();

    await service.restoreVoucher(voucherSnapshot());

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lines: {
          create: expect.arrayContaining([
            expect.objectContaining({ accountId: "customer-ledger-1", ledger: "Customer One (renamed)", debit: 100 }),
            expect.objectContaining({ accountId: "sales-ledger-1", ledger: "Sales Account", credit: 100 }),
          ]),
        },
      }),
    }));
  });

  it("rejects a legacy non-zero line that has no Account id instead of matching by ledger name", async () => {
    const { service, create } = restoreHarness();

    await expect(service.restoreVoucher(voucherSnapshot({
      lines: [
        { ledger: "Customer One", debit: 100, credit: 0 },
        { accountId: "sales-ledger-1", ledger: "Sales Account", debit: 0, credit: 100 },
      ],
    }))).rejects.toThrow(/every non-zero line has a Chart of Accounts ledger ID/);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a captured Account id that is not a ledger in the voucher company", async () => {
    const { service, create } = restoreHarness(undefined, [
      { id: "customer-ledger-1", companyId: "other-company", name: "Foreign Customer" },
      { id: "sales-ledger-1", companyId: "company-1", name: "Sales Account" },
    ]);

    await expect(service.restoreVoucher(voucherSnapshot())).rejects.toThrow(/missing or foreign Chart of Accounts ledger/);
    expect(create).not.toHaveBeenCalled();
  });

  it("restores the exact inventory-line identity and captured source/lot/serial/batch/date lineage", async () => {
    const { service, inventoryCreate } = restoreHarness();

    await service.restoreVoucher(voucherSnapshot({
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
      inventoryItems: [{
        id: "invoice-line-1",
        inventoryItemId: "item-1",
        warehouseId: "warehouse-1",
        sourceInventoryLineId: "secondary-dn-line-1",
        manufacturingInventoryLotId: "lot-1",
        manufacturingSerialIds: ["serial-1", "serial-2"],
        itemName: "Widget",
        quantity: 2,
        unitPrice: 40,
        lineTotal: 80,
        batchNumber: "BATCH-1",
        manufacturedAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2027-08-01T00:00:00.000Z",
        createdAt: "2026-08-30T10:00:00.000Z",
        updatedAt: "2026-08-30T11:00:00.000Z",
      }],
    }));

    expect(inventoryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "invoice-line-1",
        voucherId: "invoice-1",
        inventoryItemId: "item-1",
        warehouseId: "warehouse-1",
        sourceInventoryLineId: "secondary-dn-line-1",
        manufacturingInventoryLotId: "lot-1",
        manufacturingSerialIds: ["serial-1", "serial-2"],
        batchNumber: "BATCH-1",
        manufacturedAt: new Date("2026-08-01T00:00:00.000Z"),
        expiresAt: new Date("2027-08-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-30T10:00:00.000Z"),
        updatedAt: new Date("2026-08-30T11:00:00.000Z"),
      }),
    });
  });

  it("remains backward-compatible with old inventory snapshots that have no line id or lineage fields", async () => {
    const { service, inventoryCreate } = restoreHarness();

    await service.restoreVoucher(voucherSnapshot({
      workflowOrigin: VoucherWorkflowOrigin.DIRECT,
      inventoryItems: [{ itemName: "Legacy Widget", quantity: 3, unitPrice: 10 }],
    }));

    const data = inventoryCreate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).not.toHaveProperty("id");
    expect(data).toMatchObject({
      voucherId: "invoice-1",
      sourceInventoryLineId: null,
      manufacturingInventoryLotId: null,
      manufacturingSerialIds: [],
      batchNumber: null,
      manufacturedAt: null,
      expiresAt: null,
      lineTotal: 30,
    });
  });
});

describe("RecycleBinService voucher dependency restoration", () => {
  it("restores every header and secondary-line source before the selected invoice", async () => {
    const makeEntry = (id: string, snapshot: Record<string, unknown>) => ({
      id: `recycle-${id}`,
      entityId: id,
      tenantId: "tenant-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      kind: RecycleBinEntryKind.VOUCHER,
      transactionDate: new Date("2026-08-31T00:00:00.000Z"),
      refNo: id,
      partyName: "Customer One",
      txnType: "SALES",
      paymentType: "CASH",
      amount: 0,
      deletedOn: new Date("2026-08-31T00:00:00.000Z"),
      deletedByUserId: "user-1",
      snapshot,
    });
    const base = (id: string, voucherNumber: string, inventoryItems: Record<string, unknown>[]) => voucherSnapshot({
      id,
      voucherNumber,
      sourceVoucherId: null,
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
      lines: [],
      totalAmount: 0,
      inventoryItems,
    });
    const primary = makeEntry("primary-dn", base("primary-dn", "DN-1", [{
      id: "primary-dn-line",
      itemName: "Widget",
      quantity: 1,
      unitPrice: 10,
      lineTotal: 10,
    }]));
    const secondary = makeEntry("secondary-dn", base("secondary-dn", "DN-2", [{
      id: "secondary-dn-line",
      itemName: "Widget",
      quantity: 1,
      unitPrice: 10,
      lineTotal: 10,
    }]));
    const invoice = makeEntry("invoice-1", base("invoice-1", "SI-1", [{
      id: "invoice-line",
      sourceInventoryLineId: "secondary-dn-line",
      itemName: "Widget",
      quantity: 1,
      unitPrice: 10,
      lineTotal: 10,
    }]));
    (invoice.snapshot as Record<string, unknown>).sourceVoucherId = "primary-dn";
    const recycled = [invoice, secondary, primary];
    const restoredVouchers: string[] = [];
    const liveInventoryLines = new Map<string, { workspaceId: string; companyId: string }>();
    const deleteMany = vi.fn(async () => ({ count: 3 }));
    const prisma: Record<string, unknown> = {
      workspaceMember: { findFirst: vi.fn(async () => ({ id: "membership-1" })) },
      account: { findMany: vi.fn(async () => []) },
      voucherEntry: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: { id: string } }) => {
          restoredVouchers.push(data.id);
          return data;
        }),
      },
      voucherInventoryItem: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const owner = liveInventoryLines.get(where.id);
          return owner ? { voucher: owner } : null;
        }),
        create: vi.fn(async ({ data }: { data: { id?: string } }) => {
          if (data.id) liveInventoryLines.set(data.id, { workspaceId: "workspace-1", companyId: "company-1" });
          return data;
        }),
      },
      recycleBinEntry: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          recycled.find((entry) => entry.id === where.id) ?? null),
        findMany: vi.fn(async () => recycled),
        findFirst: vi.fn(async () => null),
        deleteMany,
      },
    };
    prisma.$transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma));
    const service = new RecycleBinService(prisma as never);

    await service.restore({ id: "user-1", companyId: "company-1", workspaceId: "workspace-1" } as never, invoice.id);

    expect(restoredVouchers.at(-1)).toBe("invoice-1");
    expect(restoredVouchers.slice(0, -1).sort()).toEqual(["primary-dn", "secondary-dn"]);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: expect.arrayContaining([primary.id, secondary.id, invoice.id]) } },
    });
  });
});
