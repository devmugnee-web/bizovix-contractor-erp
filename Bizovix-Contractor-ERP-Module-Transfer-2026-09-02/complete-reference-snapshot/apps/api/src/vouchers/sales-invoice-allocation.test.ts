import { describe, expect, it, vi } from "vitest";

import { VoucherEntryStatus, VoucherEntryType } from "../generated/prisma/index.js";
import { assertSalesInvoiceAllocation } from "./sales-invoice-allocation.js";

function sourceLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "dn-line-a",
    inventoryItemId: "item-a",
    warehouseId: "warehouse-a",
    manufacturingInventoryLotId: null,
    manufacturingSerialIds: [],
    itemName: "Item A",
    quantity: 10,
    voucher: {
      id: "dn-a",
      workspaceId: "workspace-1",
      companyId: "company-1",
      voucherType: VoucherEntryType.SALES,
      documentKind: "delivery-note",
      sourceVoucherId: "order-a",
      voucherNumber: "DN-A",
      voucherDate: new Date("2026-08-10T00:00:00.000Z"),
      partyId: "customer-1",
      partyName: "Customer One",
      warehouseId: "warehouse-a",
      status: VoucherEntryStatus.POSTED,
    },
    ...overrides,
  };
}

function requestedLine(overrides: Record<string, unknown> = {}) {
  return {
    sourceInventoryLineId: "dn-line-a",
    inventoryItemId: "item-a",
    warehouseId: "warehouse-a",
    manufacturingInventoryLotId: null,
    manufacturingSerialIds: [],
    itemName: "Item A",
    quantity: 3,
    ...overrides,
  };
}

function harness(options: {
  sources?: ReturnType<typeof sourceLine>[];
  prior?: Array<Record<string, unknown>>;
} = {}) {
  const sources = options.sources ?? [sourceLine()];
  const prior = options.prior ?? [];
  const executeRaw = vi.fn(async (query: unknown) => {
    void query;
    return 1;
  });
  const tx = {
    $executeRaw: executeRaw,
    voucherInventoryItem: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) =>
        "id" in args.where ? sources : prior,
      ),
    },
    voucherEntry: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id })),
      ),
    },
  };
  return { tx, executeRaw };
}

const request = {
  workspaceId: "workspace-1",
  companyId: "company-1",
  partyId: "customer-1",
  partyName: "Customer One",
  voucherDate: new Date("2026-08-12T00:00:00.000Z"),
};

describe("Sales Invoice Delivery Note allocations", () => {
  it("supports a partial invoice combining exact lines from several Delivery Notes", async () => {
    const second = sourceLine({
      id: "dn-line-b",
      inventoryItemId: "item-b",
      warehouseId: "warehouse-b",
      itemName: "Item B",
      quantity: 4,
      voucher: {
        ...sourceLine().voucher,
        id: "dn-b",
        sourceVoucherId: "order-b",
        voucherNumber: "DN-B",
        warehouseId: "warehouse-b",
      },
    });
    const { tx } = harness({
      sources: [sourceLine(), second],
      prior: [{
        sourceInventoryLineId: "dn-line-a",
        quantity: 6,
        manufacturingSerialIds: [],
        voucher: { voucherNumber: "SI-EARLIER" },
      }],
    });

    await expect(assertSalesInvoiceAllocation(tx as never, {
      ...request,
      lines: [
        requestedLine({ quantity: 4 }),
        requestedLine({
          sourceInventoryLineId: "dn-line-b",
          inventoryItemId: "item-b",
          warehouseId: "warehouse-b",
          itemName: "Item B",
          quantity: 4,
        }),
      ],
    })).resolves.toBeUndefined();
  });

  it("rejects cumulative invoice quantity above the exact Delivery Note line", async () => {
    const { tx } = harness({
      prior: [{
        sourceInventoryLineId: "dn-line-a",
        quantity: 7,
        manufacturingSerialIds: [],
        voucher: { voucherNumber: "SI-EARLIER" },
      }],
    });

    await expect(assertSalesInvoiceAllocation(tx as never, {
      ...request,
      lines: [requestedLine({ quantity: 4 })],
    })).rejects.toThrow("only 3 of Delivery Note DN-A remains uninvoiced");
  });

  it("requires the legacy header source to be one of the line-level Delivery Notes", async () => {
    const { tx } = harness();
    await expect(assertSalesInvoiceAllocation(tx as never, {
      ...request,
      headerSourceVoucherId: "different-delivery-note",
      lines: [requestedLine()],
    })).rejects.toThrow("header source must be one of its selected Delivery Notes");
  });

  it.each<[string, Partial<typeof request>, string, Record<string, unknown>?]>([
    ["customer", { partyId: "customer-2" }, "Customer must match Delivery Note"],
    ["warehouse", {}, "warehouse must match its Delivery Note line", { warehouseId: "warehouse-b" }],
    ["item", {}, "item must match its Delivery Note line", { inventoryItemId: "item-b" }],
    ["date", { voucherDate: new Date("2026-08-09T00:00:00.000Z") }, "cannot be before Delivery Note"],
  ])("rejects a mismatched %s", async (_label, requestOverrides, message, lineOverrides = {}) => {
    const { tx } = harness();
    await expect(assertSalesInvoiceAllocation(tx as never, {
      ...request,
      ...requestOverrides,
      lines: [requestedLine(lineOverrides)],
    })).rejects.toThrow(message);
  });

  it("locks source line ids in deterministic order at the posting boundary", async () => {
    const second = sourceLine({ id: "dn-line-b" });
    const first = sourceLine({ id: "dn-line-a" });
    const { tx, executeRaw } = harness({ sources: [first, second] });

    await assertSalesInvoiceAllocation(tx as never, {
      ...request,
      lines: [
        requestedLine({ sourceInventoryLineId: "dn-line-b", quantity: 1 }),
        requestedLine({ sourceInventoryLineId: "dn-line-a", quantity: 1 }),
      ],
    }, { posting: true });

    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect((executeRaw.mock.calls[0]?.[0] as { values?: unknown[] }).values).toContain(
      "sales-invoice-allocation:workspace-1:dn-line-a",
    );
    expect((executeRaw.mock.calls[1]?.[0] as { values?: unknown[] }).values).toContain(
      "sales-invoice-allocation:workspace-1:dn-line-b",
    );
  });

  it("prevents a serialized unit from being allocated twice", async () => {
    const serialized = sourceLine({
      quantity: 2,
      manufacturingInventoryLotId: "lot-1",
      manufacturingSerialIds: ["serial-1", "serial-2"],
    });
    const { tx } = harness({
      sources: [serialized],
      prior: [{
        sourceInventoryLineId: "dn-line-a",
        quantity: 1,
        manufacturingSerialIds: ["serial-1"],
        voucher: { voucherNumber: "SI-EARLIER" },
      }],
    });

    await expect(assertSalesInvoiceAllocation(tx as never, {
      ...request,
      lines: [requestedLine({
        quantity: 1,
        manufacturingInventoryLotId: "lot-1",
        manufacturingSerialIds: ["serial-1"],
      })],
    })).rejects.toThrow("serial-1 has already been invoiced");
  });
});
