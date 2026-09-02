import { describe, expect, it, vi } from "vitest";

import {
  calculateMovingAverage,
  readMovingAverageCosts,
  rebuildMovingAverageCosts,
  type MovingAverageMovement,
} from "./moving-average.js";

function movement(
  id: string,
  date: string,
  type: "IN" | "OUT",
  quantity: number,
  inputUnitCost: number | null = null,
  overrides: Partial<MovingAverageMovement> = {},
): MovingAverageMovement {
  return {
    id,
    warehouseId: "warehouse-a",
    inventoryItemId: "item-1",
    transactionType: type === "IN" ? "PURCHASE" : "SALES",
    transactionId: id,
    transactionLineId: id,
    movementType: type,
    quantity,
    inputUnitCost,
    transactionDate: new Date(`${date}T00:00:00.000Z`),
    createdAt: new Date(`${date}T01:00:00.000Z`),
    ...overrides,
  };
}

describe("moving weighted average valuation", () => {
  it("blends purchases and issues sales at the current average, never the selling price", () => {
    const result = calculateMovingAverage([
      movement("opening", "2026-01-01", "IN", 10, 100, { transactionType: "OPENING_STOCK" }),
      movement("purchase", "2026-01-02", "IN", 10, 200),
      movement("sale", "2026-01-03", "OUT", 6, 350),
    ]);

    expect(result.movements.find((row) => row.id === "purchase")).toMatchObject({ averageCost: 150, balanceValue: 3000 });
    expect(result.movements.find((row) => row.id === "sale")).toMatchObject({ unitCost: 150, movementValue: 900, balanceQuantity: 14, balanceValue: 2100, averageCost: 150 });
  });

  it("forces value and average to zero when the final unit is issued", () => {
    const result = calculateMovingAverage([
      movement("opening", "2026-01-01", "IN", 3, 100.333333, { transactionType: "OPENING_STOCK" }),
      movement("sale", "2026-01-02", "OUT", 3),
    ]);
    expect(result.balances.get("warehouse-a:item-1")).toMatchObject({ quantity: 0, value: 0, averageCost: 0 });
  });

  it("replays a backdated purchase before later issues", () => {
    const result = calculateMovingAverage([
      movement("opening", "2026-01-01", "IN", 10, 100, { transactionType: "OPENING_STOCK" }),
      movement("sale", "2026-01-10", "OUT", 5),
      movement("later-purchase", "2026-01-20", "IN", 10, 200),
      movement("backdated-purchase", "2026-01-05", "IN", 10, 300),
    ]);
    expect(result.movements.find((row) => row.id === "sale")?.movementValue).toBe(1000);
    expect(result.balances.get("warehouse-a:item-1")).toMatchObject({ quantity: 25, value: 5000, averageCost: 200 });
  });

  it("relieves a purchase return at the current warehouse moving average", () => {
    const result = calculateMovingAverage([
      movement("purchase-100", "2026-01-01", "IN", 10, 100),
      movement("purchase-200", "2026-01-02", "IN", 10, 200),
      movement("return", "2026-01-03", "OUT", 5, null, {
        transactionType: "DEBIT_NOTE",
      }),
    ]);
    expect(result.movements.find((row) => row.id === "return")).toMatchObject({ unitCost: 150, movementValue: 750 });
    expect(result.balances.get("warehouse-a:item-1")).toMatchObject({ quantity: 15, value: 2250, averageCost: 150 });
  });

  it("does not strand value when the final mixed-cost unit is purchase-returned", () => {
    const result = calculateMovingAverage([
      movement("cheap-purchase", "2026-01-01", "IN", 1, 1),
      movement("expensive-purchase", "2026-01-02", "IN", 1, 100),
      movement("sale", "2026-01-03", "OUT", 1),
      movement("purchase-return", "2026-01-04", "OUT", 1, null, { transactionType: "DEBIT_NOTE" }),
    ]);

    expect(result.movements.find((row) => row.id === "purchase-return")).toMatchObject({
      unitCost: 50.5,
      movementValue: 50.5,
    });
    expect(result.balances.get("warehouse-a:item-1")).toMatchObject({ quantity: 0, value: 0, averageCost: 0 });
  });

  it("restores a sales return at the original sale issue cost", () => {
    const result = calculateMovingAverage([
      movement("purchase-1", "2026-01-01", "IN", 20, 150),
      movement("sale", "2026-01-02", "OUT", 6),
      movement("purchase-2", "2026-01-03", "IN", 10, 300),
      movement("return", "2026-01-04", "IN", 2, null, {
        transactionType: "CREDIT_NOTE",
        costSourceMovementId: "sale",
      }),
    ]);
    expect(result.movements.find((row) => row.id === "return")?.unitCost).toBe(150);
    expect(result.balances.get("warehouse-a:item-1")).toMatchObject({ quantity: 26, value: 5400, averageCost: 207.692308 });
  });

  it("carries transfer cost between warehouses without changing company value", () => {
    const result = calculateMovingAverage([
      movement("a-opening", "2026-01-01", "IN", 10, 100),
      movement("b-opening", "2026-01-01", "IN", 10, 200, { warehouseId: "warehouse-b" }),
      movement("transfer-out", "2026-01-02", "OUT", 4, null, {
        transactionType: "STOCK_TRANSFER_OUT",
        transactionId: "transfer-1",
        transactionLineId: "transfer-line-1",
      }),
      movement("transfer-in", "2026-01-02", "IN", 4, null, {
        warehouseId: "warehouse-b",
        transactionType: "STOCK_TRANSFER_IN",
        transactionId: "transfer-1",
        transactionLineId: "transfer-line-1",
      }),
    ]);
    expect(result.balances.get("warehouse-a:item-1")).toMatchObject({ quantity: 6, value: 600, averageCost: 100 });
    expect(result.balances.get("warehouse-b:item-1")).toMatchObject({ quantity: 14, value: 2400, averageCost: 171.428571 });
    expect([...result.balances.values()].reduce((sum, row) => sum + row.value, 0)).toBe(3000);
  });

  it("reverses the exact original movement value", () => {
    const result = calculateMovingAverage([
      movement("opening", "2026-01-01", "IN", 10, 125, { transactionType: "OPENING_STOCK" }),
      movement("reversal", "2026-01-02", "OUT", 10, null, { reversalOfId: "opening", transactionType: "OPENING_STOCK_REVERSAL" }),
    ]);
    expect(result.movements.find((row) => row.id === "reversal")).toMatchObject({ unitCost: 125, movementValue: 1250 });
    expect(result.balances.get("warehouse-a:item-1")).toMatchObject({ quantity: 0, value: 0, averageCost: 0 });
  });

  it("rejects explicit source references that cannot be replayed", () => {
    expect(() => calculateMovingAverage([
      movement("return", "2026-01-02", "IN", 1, null, {
        transactionType: "CREDIT_NOTE",
        costSourceMovementId: "missing-sale",
      }),
    ])).toThrow("cannot find its source-cost movement missing-sale");

    expect(() => calculateMovingAverage([
      movement("transfer-in", "2026-01-02", "IN", 1, null, {
        warehouseId: "warehouse-b",
        transactionType: "STOCK_TRANSFER_IN",
        transactionId: "transfer-1",
        transactionLineId: "transfer-line-1",
      }),
    ])).toThrow("has no matching transfer-out cost");
  });

  it("uses a deterministic chronological order for same-date movements regardless of input order", () => {
    const purchase = movement("purchase", "2026-01-01", "IN", 10, 200, {
      createdAt: new Date("2026-01-01T08:00:00.000Z"),
    });
    const sale = movement("sale", "2026-01-01", "OUT", 5, 999, {
      createdAt: new Date("2026-01-01T09:00:00.000Z"),
    });

    const forward = calculateMovingAverage([purchase, sale]);
    const reversedInput = calculateMovingAverage([sale, purchase]);

    expect(forward.movements.map((row) => row.id)).toEqual(["purchase", "sale"]);
    expect(reversedInput.movements.map((row) => row.id)).toEqual(["purchase", "sale"]);
    expect(reversedInput.movements.find((row) => row.id === "sale")).toMatchObject({
      unitCost: 200,
      movementValue: 1000,
      balanceQuantity: 5,
      balanceValue: 1000,
    });
  });

  it("uses the stable movement id as the final same-timestamp tie breaker", () => {
    const timestamp = new Date("2026-01-01T08:00:00.000Z");
    const result = calculateMovingAverage([
      movement("b-sale", "2026-01-01", "OUT", 2, null, { createdAt: timestamp }),
      movement("a-purchase", "2026-01-01", "IN", 5, 40, { createdAt: timestamp }),
    ]);

    expect(result.movements.map((row) => row.id)).toEqual(["a-purchase", "b-sale"]);
    expect(result.balances.get("warehouse-a:item-1")).toMatchObject({ quantity: 3, value: 120, averageCost: 40 });
  });

  it("keeps six-decimal precision during repeating-average issues and clears the final rounding residue", () => {
    const partial = calculateMovingAverage([
      movement("purchase-a", "2026-01-01", "IN", 2, 100),
      movement("purchase-b", "2026-01-02", "IN", 1, 101),
      movement("sale-a", "2026-01-03", "OUT", 1),
    ]);
    expect(partial.movements.find((row) => row.id === "purchase-b")?.averageCost).toBe(100.333333);
    expect(partial.movements.find((row) => row.id === "sale-a")).toMatchObject({
      unitCost: 100.333333,
      movementValue: 100.333333,
      balanceQuantity: 2,
      balanceValue: 200.666667,
      averageCost: 100.333334,
    });

    const fullyIssued = calculateMovingAverage([
      ...partial.movements.map(({ unitCost: _unitCost, movementValue: _movementValue, balanceQuantity: _balanceQuantity, balanceValue: _balanceValue, averageCost: _averageCost, ...row }) => row),
      movement("sale-b", "2026-01-04", "OUT", 2),
    ]);
    expect(fullyIssued.balances.get("warehouse-a:item-1")).toEqual({
      warehouseId: "warehouse-a",
      inventoryItemId: "item-1",
      quantity: 0,
      value: 0,
      averageCost: 0,
    });
  });

  it("rejects a negative historical balance even if a later receipt would cover it", () => {
    expect(() => calculateMovingAverage([
      movement("future-receipt", "2026-01-10", "IN", 10, 100),
      movement("backdated-sale", "2026-01-05", "OUT", 5),
    ])).toThrow("makes historical warehouse stock negative");
  });

  it("freezes the last positive cost while stock is negative and resets cost after a receipt crosses zero", () => {
    const result = calculateMovingAverage([
      movement("opening", "2026-01-01", "IN", 10, 100, { transactionType: "OPENING_STOCK" }),
      movement("delivery", "2026-01-02", "OUT", 15),
      movement("receipt", "2026-01-03", "IN", 12, 130),
    ], true);

    expect(result.movements.find((row) => row.id === "delivery")).toMatchObject({
      unitCost: 100,
      balanceQuantity: -5,
      balanceValue: -500,
      averageCost: 100,
    });
    expect(result.movements.find((row) => row.id === "receipt")).toMatchObject({
      movementValue: 1410,
      balanceQuantity: 7,
      balanceValue: 910,
      averageCost: 130,
    });
  });

  it("keeps the frozen cost when a receipt does not fully clear negative stock", () => {
    const result = calculateMovingAverage([
      movement("opening", "2026-01-01", "IN", 10, 100, { transactionType: "OPENING_STOCK" }),
      movement("delivery", "2026-01-02", "OUT", 15),
      movement("partial-receipt", "2026-01-03", "IN", 3, 130),
    ], true);

    expect(result.balances.get("warehouse-a:item-1")).toMatchObject({
      quantity: -2,
      value: -200,
      averageCost: 100,
    });
  });

  it("resolves a return through an intermediate sourced bill line to the physical receipt cost", async () => {
    const rows: Array<Record<string, unknown>> = [
      movement("receipt-movement", "2026-01-01", "IN", 10, 200, {
        transactionType: "RECEIPT_NOTE",
        transactionId: "receipt",
        transactionLineId: "receipt-line",
      }),
      movement("return-movement", "2026-01-02", "OUT", 4, null, {
        transactionType: "DEBIT_NOTE",
        transactionId: "return",
        transactionLineId: "return-line",
      }),
    ];
    const db = {
      workspace: { findUnique: async () => ({ companyId: "company-1" }) },
      accountingSettings: { findUnique: async () => ({ costingMethod: "MOVING_WEIGHTED_AVERAGE" }) },
      stockMovement: {
        findMany: async () => rows,
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = rows.find((entry) => entry.id === where.id);
          Object.assign(row!, data);
          return row;
        },
      },
      voucherInventoryItem: {
        findMany: async () => [
          { id: "receipt-line", voucherId: "receipt", inventoryItemId: "item-1", warehouseId: "warehouse-a", itemName: "Phone", quantity: 10, unitPrice: 200, sourceInventoryLineId: null, createdAt: new Date("2026-01-01T00:00:00Z"), voucher: { sourceVoucherId: null, discountAmount: 0 } },
          { id: "bill-line", voucherId: "bill", inventoryItemId: "item-1", warehouseId: "warehouse-a", itemName: "Phone", quantity: 10, unitPrice: 200, sourceInventoryLineId: "receipt-line", createdAt: new Date("2026-01-01T01:00:00Z"), voucher: { sourceVoucherId: "receipt", discountAmount: 0 } },
          { id: "return-line", voucherId: "return", inventoryItemId: "item-1", warehouseId: "warehouse-a", itemName: "Phone", quantity: 4, unitPrice: 200, sourceInventoryLineId: "bill-line", createdAt: new Date("2026-01-02T00:00:00Z"), voucher: { sourceVoucherId: "bill", discountAmount: 0 } },
        ],
      },
      inventoryAdjustment: { findMany: async () => [] },
      inventoryCostRevaluation: { findMany: async () => [] },
      inventoryItem: { findMany: async () => [{ id: "item-1", openingRate: 0 }] },
    };

    const result = await rebuildMovingAverageCosts(db as never, "workspace-1", ["item-1"]);

    expect(result.movements.find((row) => row.id === "return-movement")).toMatchObject({
      unitCost: 200,
      movementValue: 800,
      balanceQuantity: 6,
      balanceValue: 1200,
    });
  });

  it("rejects ambiguous legacy return lineage instead of guessing a source line", async () => {
    const rows: Array<Record<string, unknown>> = [
      movement("purchase-a", "2026-01-01", "IN", 2, 100, {
        transactionId: "purchase",
        transactionLineId: "purchase-line-a",
      }),
      movement("purchase-b", "2026-01-01", "IN", 2, 200, {
        transactionId: "purchase",
        transactionLineId: "purchase-line-b",
        createdAt: new Date("2026-01-01T02:00:00.000Z"),
      }),
      movement("return", "2026-01-02", "OUT", 1, null, {
        transactionType: "DEBIT_NOTE",
        transactionId: "return-voucher",
        transactionLineId: "return-line",
      }),
    ];
    const db = {
      workspace: { findUnique: async () => ({ companyId: "company-1" }) },
      accountingSettings: { findUnique: async () => ({ costingMethod: "MOVING_WEIGHTED_AVERAGE" }) },
      stockMovement: { findMany: async () => rows, update: async () => null },
      voucherInventoryItem: {
        findMany: async () => [
          { id: "purchase-line-a", voucherId: "purchase", inventoryItemId: "item-1", warehouseId: "warehouse-a", itemName: "Phone", quantity: 2, unitPrice: 100, sourceInventoryLineId: null, createdAt: new Date("2026-01-01T00:00:00Z"), voucher: { sourceVoucherId: null, discountAmount: 0 } },
          { id: "purchase-line-b", voucherId: "purchase", inventoryItemId: "item-1", warehouseId: "warehouse-a", itemName: "Phone", quantity: 2, unitPrice: 200, sourceInventoryLineId: null, createdAt: new Date("2026-01-01T00:01:00Z"), voucher: { sourceVoucherId: null, discountAmount: 0 } },
          { id: "return-line", voucherId: "return-voucher", inventoryItemId: "item-1", warehouseId: "warehouse-a", itemName: "Phone", quantity: 1, unitPrice: 200, sourceInventoryLineId: null, createdAt: new Date("2026-01-02T00:00:00Z"), voucher: { sourceVoucherId: "purchase", discountAmount: 0 } },
        ],
      },
      inventoryAdjustment: { findMany: async () => [] },
      inventoryCostRevaluation: { findMany: async () => [] },
      inventoryItem: { findMany: async () => [{ id: "item-1", openingRate: 0 }] },
    };

    await expect(rebuildMovingAverageCosts(db as never, "workspace-1", ["item-1"]))
      .rejects.toThrow("has multiple possible source lines");
  });

  it("re-reads pending movements after acquiring the workspace costing lock", async () => {
    const first = movement("purchase-a", "2026-01-01", "IN", 1, 100, {
      transactionLineId: "line-a",
      costingVersion: 0,
    });
    const concurrent = movement("purchase-b", "2026-01-02", "IN", 1, 200, {
      transactionLineId: "line-b",
      costingVersion: 0,
    });
    let reads = 0;
    const updates: string[] = [];
    const lock = vi.fn(async () => []);
    const db = {
      workspace: { findUnique: async () => ({ companyId: "company-1" }) },
      accountingSettings: { findUnique: async () => ({ costingMethod: "MOVING_WEIGHTED_AVERAGE" }) },
      $executeRaw: lock,
      stockMovement: {
        findMany: async () => (++reads === 1 ? [first] : [first, concurrent]),
        update: async ({ where }: { where: { id: string } }) => updates.push(where.id),
      },
      voucherInventoryItem: {
        findMany: async () => [
          { id: "line-a", voucherId: "purchase-a", inventoryItemId: "item-1", warehouseId: "warehouse-a", itemName: "Phone", quantity: 1, unitPrice: 100, sourceInventoryLineId: null, createdAt: new Date("2026-01-01T00:00:00Z"), voucher: { sourceVoucherId: null, discountAmount: 0 } },
          { id: "line-b", voucherId: "purchase-b", inventoryItemId: "item-1", warehouseId: "warehouse-a", itemName: "Phone", quantity: 1, unitPrice: 200, sourceInventoryLineId: null, createdAt: new Date("2026-01-02T00:00:00Z"), voucher: { sourceVoucherId: null, discountAmount: 0 } },
        ],
      },
      inventoryAdjustment: { findMany: async () => [] },
      inventoryCostRevaluation: { findMany: async () => [] },
      inventoryItem: { findMany: async () => [{ id: "item-1", openingRate: 0 }] },
    };

    const result = await rebuildMovingAverageCosts(db as never, "workspace-1", ["item-1"]);

    expect(lock).toHaveBeenCalledTimes(1);
    expect(reads).toBe(2);
    expect(updates).toEqual(["purchase-a", "purchase-b"]);
    expect(result.balances.get("warehouse-a:item-1")).toMatchObject({ quantity: 2, value: 300, averageCost: 150 });
  });

  it("reads a current persisted valuation without rewriting stock movements", async () => {
    const update = vi.fn();
    const rows = [
      {
        ...movement("purchase", "2026-01-01", "IN", 2, 100),
        costingVersion: 2,
        unitCost: 100,
        movementValue: 200,
        balanceQuantity: 2,
        balanceValue: 200,
        averageCost: 100,
      },
    ];
    const db = {
      workspace: { findUnique: async () => ({ companyId: "company-1" }) },
      accountingSettings: {
        findUnique: async () => ({
          costingMethod: "MOVING_WEIGHTED_AVERAGE",
          negativeStockPolicy: "BLOCKED",
        }),
      },
      stockMovement: { findMany: async () => rows, update },
    };

    const result = await readMovingAverageCosts(
      db as never,
      "workspace-1",
      ["item-1"],
    );

    expect(result.balances.get("warehouse-a:item-1")).toMatchObject({
      quantity: 2,
      value: 200,
      averageCost: 100,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects stale valuation on a read instead of repairing it", async () => {
    const update = vi.fn();
    const rows = [
      {
        ...movement("purchase", "2026-01-01", "IN", 2, 100),
        costingVersion: 0,
        unitCost: 100,
        movementValue: 200,
        balanceQuantity: 2,
        balanceValue: 200,
        averageCost: 100,
      },
    ];
    const db = {
      workspace: { findUnique: async () => ({ companyId: "company-1" }) },
      accountingSettings: {
        findUnique: async () => ({
          costingMethod: "MOVING_WEIGHTED_AVERAGE",
          negativeStockPolicy: "BLOCKED",
        }),
      },
      stockMovement: { findMany: async () => rows, update },
    };

    await expect(
      readMovingAverageCosts(db as never, "workspace-1", ["item-1"]),
    ).rejects.toThrow("pending reconciliation");
    expect(update).not.toHaveBeenCalled();
  });
});
