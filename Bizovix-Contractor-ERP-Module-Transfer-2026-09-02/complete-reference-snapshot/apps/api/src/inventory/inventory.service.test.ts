import { describe, expect, it, vi } from "vitest";
import {
  ManufacturingItemRole,
  ManufacturingLocationDisposition,
  ManufacturingMakeBuy,
  ManufacturingSerialStatus,
  StockMovementType,
  VoucherEntryStatus,
  VoucherEntryType,
  VoucherWorkflowOrigin,
} from "../generated/prisma/index.js";
import { InventoryService } from "./inventory.service.js";

function voucher(overrides: Record<string, unknown> = {}) {
  return {
    id: "voucher-1", tenantId: "tenant-1", companyId: "company-1", workspaceId: "workspace-1",
    voucherType: VoucherEntryType.PURCHASE, documentKind: "receipt-note", sourceVoucherId: null,
    workflowOrigin: VoucherWorkflowOrigin.DIRECT,
    voucherNumber: "RN-0001", voucherDate: new Date("2026-08-12"), warehouseId: "warehouse-1",
    status: VoucherEntryStatus.PENDING, debit: 0, credit: 0, lines: [],
    warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
    discountAmount: 0,
    inventoryItems: [{ id: "line-1", inventoryItemId: "item-1", warehouseId: "warehouse-1", itemName: "Phone", quantity: 10, unitPrice: 100, warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null }, inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs", openingRate: 100 } }],
    ...overrides,
  };
}

function postedVoucher(overrides: Record<string, unknown> = {}) {
  return {
    ...voucher(),
    createdByUserId: "user-1",
    workflowOrigin: VoucherWorkflowOrigin.DIRECT,
    status: VoucherEntryStatus.POSTED,
    partyName: "Walk-in Customer",
    currency: "BDT",
    fiscalYearId: null,
    branchId: null,
    reversalOfId: null,
    sourceType: null,
    sourceId: null,
    postingVersion: 1,
    ...overrides,
  };
}

const CHART_ACCOUNTS: Record<string, { id: string; code: string; name: string; isSystem: true; level: "LEDGER"; status: "ACTIVE" }> = {
  "5110001": { id: "account-cogs", code: "5110001", name: "Cost of Goods Sold", isSystem: true, level: "LEDGER", status: "ACTIVE" },
  "1210001": { id: "account-inventory", code: "1210001", name: "Inventory Control", isSystem: true, level: "LEDGER", status: "ACTIVE" },
  "1232001": { id: "account-delivered-pending", code: "1232001", name: "Inventory Delivered Pending Invoice", isSystem: true, level: "LEDGER", status: "ACTIVE" },
  "2212001": { id: "account-purchase-pending", code: "2212001", name: "Purchase Bill Pending", isSystem: true, level: "LEDGER", status: "ACTIVE" },
  "3100001": { id: "account-opening-equity", code: "3100001", name: "Opening Balance Equity", isSystem: true, level: "LEDGER", status: "ACTIVE" },
  "4200001": { id: "account-adjustment-gain", code: "4200001", name: "Inventory Adjustment Gain", isSystem: true, level: "LEDGER", status: "ACTIVE" },
  "5210008": { id: "account-adjustment-loss", code: "5210008", name: "Inventory Adjustment Loss", isSystem: true, level: "LEDGER", status: "ACTIVE" },
};

function fakeTx(currentIn = 0, currentOut = 0, record = voucher()) {
  const movementKeys = new Set<string>();
  const creates: Array<Record<string, unknown>> = [];
  const revaluations: Array<Record<string, unknown>> = [];
  const ledgerLines: Array<Record<string, unknown>> = [];
  const voucherRecords: Array<Record<string, unknown>> = [Object.assign({
    tenantId: "tenant-1",
    companyId: "company-1",
    workspaceId: "workspace-1",
    createdByUserId: "user-1",
    workflowOrigin: "DIRECT",
    status: VoucherEntryStatus.POSTED,
    partyName: "Walk-in Customer",
    currency: "BDT",
    fiscalYearId: null,
    branchId: null,
    reversalOfId: null,
    sourceType: null,
    sourceId: null,
    postingVersion: 1,
    debit: 0,
    credit: 0,
  }, record)];
  const inventoryLineRecords: Array<Record<string, unknown>> = record.inventoryItems.map((line) => ({
    ...line,
    voucherId: record.id,
    sourceInventoryLineId: (line as typeof line & { sourceInventoryLineId?: string | null }).sourceInventoryLineId ?? null,
  }));
  const withLedgerLines = (entry: Record<string, unknown>) => ({
    ...entry,
    lines: ledgerLines.filter((line) => line.voucherId === entry.id),
    inventoryItems: inventoryLineRecords.filter((line) => line.voucherId === entry.id),
  });
  const tx = {
    voucherEntry: {
      findUniqueOrThrow: vi.fn(async () => record),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = voucherRecords.find((entry) => entry.id === where.id);
        return found ? withLedgerLines(found) : null;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const idFilter = where.id as { in?: string[] } | undefined;
        const statusFilter = where.status as { in?: string[] } | undefined;
        const orFilters = where.OR as Array<Record<string, unknown>> | undefined;
        return voucherRecords.filter((entry) => {
          if (idFilter?.in && !idFilter.in.includes(String(entry.id))) return false;
          if (statusFilter?.in && !statusFilter.in.includes(String(entry.status))) return false;
          if (orFilters?.length) {
            const matchesOr = orFilters.some((filter) => {
              const reversalFilter = filter.reversalOfId as { in?: string[] } | undefined;
              if (reversalFilter?.in) return reversalFilter.in.includes(String(entry.reversalOfId));
              const sourceIdFilter = filter.sourceId as { in?: string[] } | undefined;
              return filter.sourceType === entry.sourceType && Boolean(sourceIdFilter?.in?.includes(String(entry.sourceId)));
            });
            if (!matchesOr) return false;
          }
          return true;
        }).map(withLedgerLines);
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> & { lines?: { create?: Array<Record<string, unknown>> } } }) => {
        const created = { id: `voucher-created-${voucherRecords.length}`, ...data };
        voucherRecords.push(created);
        ledgerLines.push(...(data.lines?.create ?? []).map((line) => ({ ...line, voucherId: created.id })));
        return withLedgerLines(created);
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const target = voucherRecords.find((entry) => entry.id === where.id);
        if (!target) return null;
        for (const [key, value] of Object.entries(data)) {
          const increment = value && typeof value === "object" && "increment" in value
            ? Number((value as { increment: unknown }).increment)
            : null;
          target[key] = increment === null ? value : Number(target[key] ?? 0) + increment;
        }
        return withLedgerLines(target);
      }),
    },
    account: { findUnique: vi.fn(async ({ where }: { where: { companyId_code: { code: string } } }) => CHART_ACCOUNTS[where.companyId_code.code] ?? null) },
    company: { findUnique: vi.fn(async () => ({ currencyCode: "BDT" })) },
    voucherEntryLine: {
      findFirst: vi.fn(async ({ where }: { where: { voucherId: string } }) => ledgerLines.find((line) => line.voucherId === where.voucherId) ?? null),
      findMany: vi.fn(async ({ where }: { where: { voucherId: string; costCenter?: string } }) => ledgerLines.filter((line) =>
        line.voucherId === where.voucherId && (!where.costCenter || line.costCenter === where.costCenter),
      )),
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        ledgerLines.push(...data);
        return { count: data.length };
      }),
    },
    workspace: { findUnique: vi.fn(async () => ({ companyId: "company-1" })) },
    accountingSettings: { findUnique: vi.fn(async () => ({ negativeStockPolicy: "BLOCKED" })) },
    voucherInventoryItem: {
      findFirst: vi.fn(async () => null),
      aggregate: vi.fn(async () => ({ _sum: { quantity: 0 } })),
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        const where = args?.where ?? {};
        const idFilter = where.id as { in?: string[] } | undefined;
        const voucherIdFilter = where.voucherId as { in?: string[] } | string | undefined;
        const sourceLineFilter = where.sourceInventoryLineId as { in?: string[] } | undefined;
        return inventoryLineRecords.filter((line) => {
          if (idFilter?.in && !idFilter.in.includes(String(line.id))) return false;
          if (typeof voucherIdFilter === "string" && line.voucherId !== voucherIdFilter) return false;
          if (typeof voucherIdFilter === "object" && voucherIdFilter.in && !voucherIdFilter.in.includes(String(line.voucherId))) return false;
          if (sourceLineFilter?.in && !sourceLineFilter.in.includes(String(line.sourceInventoryLineId))) return false;
          return true;
        }).map((line, index) => {
          const parent: Record<string, unknown> = voucherRecords.find((entry) => entry.id === line.voucherId) ?? record;
          return {
            ...line,
            createdAt: line.createdAt ?? new Date(`2026-08-12T01:00:0${index}.000Z`),
            voucher: {
              id: parent.id,
              companyId: parent.companyId,
              workspaceId: parent.workspaceId,
              voucherType: parent.voucherType,
              documentKind: parent.documentKind,
              sourceVoucherId: parent.sourceVoucherId ?? null,
              workflowOrigin: parent.workflowOrigin,
              voucherNumber: parent.voucherNumber,
              voucherDate: parent.voucherDate,
              partyId: parent.partyId ?? null,
              partyName: parent.partyName,
              warehouseId: parent.warehouseId ?? null,
              status: parent.status,
              discountAmount: parent.discountAmount ?? 0,
            },
          };
        });
      }),
    },
    inventoryAdjustment: { findMany: vi.fn(async () => []) },
    manufacturingSettings: {
      findUnique: vi.fn(async () => ({
        defaultFinishedGoodsReleasedWarehouseId: "warehouse-1",
        defaultFinishedGoodsReleaseLocationId: "fg-r-location",
        requireSerialBeforeRelease: false,
      })),
    },
    manufacturingInventoryLot: {
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    manufacturingSerial: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    inventoryCostRevaluation: {
      findMany: vi.fn(async (args?: {
        where?: {
          workspaceId?: string;
          sourceMovementId?: { in: string[] };
          billingVoucherId?: string | { in?: string[]; not?: string };
          isActive?: boolean;
        };
      }) => revaluations.filter((row) => {
        const where = args?.where;
        if (!where) return row.isActive !== false;
        if (where.workspaceId && row.workspaceId !== where.workspaceId) return false;
        if (where.sourceMovementId?.in && !where.sourceMovementId.in.includes(String(row.sourceMovementId))) return false;
        if (typeof where.billingVoucherId === "string" && row.billingVoucherId !== where.billingVoucherId) return false;
        if (typeof where.billingVoucherId === "object") {
          if (where.billingVoucherId.in && !where.billingVoucherId.in.includes(String(row.billingVoucherId))) return false;
          if (where.billingVoucherId.not && row.billingVoucherId === where.billingVoucherId.not) return false;
        }
        if (where.isActive !== undefined && row.isActive !== where.isActive) return false;
        return true;
      })),
      upsert: vi.fn(async ({ where, update, create }: {
        where: { workspaceId_idempotencyKey: { idempotencyKey: string } };
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }) => {
        const key = where.workspaceId_idempotencyKey.idempotencyKey;
        const existing = revaluations.find((row) => row.idempotencyKey === key);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = {
          id: `revaluation-${revaluations.length + 1}`,
          createdAt: new Date("2026-08-12T02:00:00.000Z"),
          isActive: true,
          ...create,
        };
        revaluations.push(created);
        return created;
      }),
    },
    inventoryItem: { findMany: vi.fn(async () => record.inventoryItems.map((line) => ({ id: line.inventoryItemId, openingRate: line.inventoryItem?.openingRate ?? 0 }))) },
    stockMovement: {
      groupBy: vi.fn(async () => [
        { movementType: StockMovementType.IN, _sum: { quantity: currentIn } },
        { movementType: StockMovementType.OUT, _sum: { quantity: currentOut } },
      ]),
      upsert: vi.fn(async ({ where, create }: { where: { workspaceId_idempotencyKey: { idempotencyKey: string } }; create: Record<string, unknown> }) => {
        if (!movementKeys.has(where.workspaceId_idempotencyKey.idempotencyKey)) {
          movementKeys.add(where.workspaceId_idempotencyKey.idempotencyKey);
          creates.push({ id: `movement-${creates.length + 1}`, createdAt: new Date("2026-08-12T01:00:00Z"), inputUnitCost: null, reversalOfId: null, ...create });
        }
        return create;
      }),
      findFirst: vi.fn(async ({ where }: { where: { transactionLineId: string } }) =>
        creates.find((entry) => entry.transactionLineId === where.transactionLineId && entry.reversalOfId == null) ?? null,
      ),
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        const where = args?.where ?? {};
        return creates.filter((entry) => {
          if (typeof where.workspaceId === "string" && entry.workspaceId !== where.workspaceId) return false;
          if (typeof where.transactionId === "string" && entry.transactionId !== where.transactionId) return false;
          if (where.transactionId && typeof where.transactionId === "object" && "in" in where.transactionId) {
            if (!(where.transactionId as { in: unknown[] }).in.includes(entry.transactionId)) return false;
          }
          if (typeof where.transactionLineId === "string" && entry.transactionLineId !== where.transactionLineId) return false;
          if (where.transactionLineId && typeof where.transactionLineId === "object" && "in" in where.transactionLineId) {
            if (!(where.transactionLineId as { in: unknown[] }).in.includes(entry.transactionLineId)) return false;
          }
          if (typeof where.transactionType === "string" && entry.transactionType !== where.transactionType) return false;
          if (typeof where.movementType === "string" && entry.movementType !== where.movementType) return false;
          if (typeof where.inventoryItemId === "string" && entry.inventoryItemId !== where.inventoryItemId) return false;
          if (where.inventoryItemId && typeof where.inventoryItemId === "object" && "in" in where.inventoryItemId) {
            if (!(where.inventoryItemId as { in: unknown[] }).in.includes(entry.inventoryItemId)) return false;
          }
          if (where.idempotencyKey && typeof where.idempotencyKey === "object" && "in" in where.idempotencyKey) {
            if (!(where.idempotencyKey as { in: unknown[] }).in.includes(entry.idempotencyKey)) return false;
          }
          if (where.reversalOfId === null && entry.reversalOfId != null) return false;
          if (where.reversalOfId && typeof where.reversalOfId === "object" && "in" in where.reversalOfId) {
            if (!(where.reversalOfId as { in: unknown[] }).in.includes(entry.reversalOfId)) return false;
          }
          if (where.voidedAt === null && entry.voidedAt != null) return false;
          return true;
        });
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => {
        const targets = creates.filter((entry) => where.id.in.includes(String(entry.id)));
        targets.forEach((entry) => Object.assign(entry, data));
        return { count: targets.length };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const target = creates.find((entry) => entry.id === where.id);
        if (target) Object.assign(target, data);
        return target;
      }),
    },
  };
  return { tx, creates, revaluations, ledgerLines, inventoryLineRecords, voucherRecords };
}

function valuedMovement(overrides: Record<string, unknown> = {}) {
  return {
    id: "stock-movement-1",
    tenantId: "tenant-1",
    companyId: "company-1",
    workspaceId: "workspace-1",
    warehouseId: "warehouse-1",
    transactionId: "inventory-source-1",
    transactionType: "OPENING_STOCK",
    movementType: StockMovementType.IN,
    movementValue: 1_000,
    transactionDate: new Date("2026-01-01T00:00:00.000Z"),
    postedByUserId: "user-1",
    referenceNo: "ITEM-001",
    ...overrides,
  };
}

describe("InventoryService voucher stock posting", () => {
  const service = new InventoryService({} as never, {} as never);

  it("posts a Receipt Note once even when the same request is retried", async () => {
    const { tx, creates } = fakeTx();
    await service.postVoucherMovements(tx as never, "voucher-1", "user-1");
    await service.postVoucherMovements(tx as never, "voucher-1", "user-1");
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ warehouseId: "warehouse-1", movementType: StockMovementType.IN, quantity: 10 });
  });

  it("posts a Direct Purchase Bill as one stock receipt", async () => {
    const directBill = voucher({
      id: "direct-bill-1",
      documentKind: "bill",
      sourceVoucherId: null,
      voucherNumber: "PB-2608-00001",
    });
    const { tx, creates } = fakeTx(0, 0, directBill);

    await service.postVoucherMovements(tx as never, "direct-bill-1", "user-1");

    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({
      transactionId: "direct-bill-1",
      movementType: StockMovementType.IN,
      quantity: 10,
    });
  });

  it("recognizes exact Delivery Note cost on a sourced Invoice without moving stock again", async () => {
    const linkedInvoice = voucher({
      id: "invoice-1",
      voucherType: VoucherEntryType.SALES,
      documentKind: null,
      sourceVoucherId: "delivery-note-1",
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
      voucherNumber: "SI-2608-00001",
      inventoryItems: [{
        id: "invoice-line-1", inventoryItemId: "item-1", warehouseId: "warehouse-1",
        sourceInventoryLineId: "delivery-line-1", itemName: "Phone", quantity: 4, unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
        inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs", openingRate: 100 },
      }],
    });
    const { tx, creates, inventoryLineRecords, ledgerLines, voucherRecords } = fakeTx(10, 0, linkedInvoice);
    voucherRecords.push(postedVoucher({
      id: "delivery-note-1",
      voucherType: VoucherEntryType.SALES,
      documentKind: "delivery-note",
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
      voucherNumber: "DN-0001",
    }));
    inventoryLineRecords.push({
      id: "delivery-line-1",
      voucherId: "delivery-note-1",
      inventoryItemId: "item-1",
      warehouseId: "warehouse-1",
      itemName: "Phone",
      quantity: 10,
    });
    creates.push({
      id: "delivery-movement-1", companyId: "company-1", workspaceId: "workspace-1",
      transactionId: "delivery-note-1", transactionLineId: "delivery-line-1",
      transactionType: "DELIVERY_NOTE", movementType: StockMovementType.OUT,
      quantity: 10, unitCost: 80, movementValue: 800, reversalOfId: null,
    });

    await service.postVoucherMovements(tx as never, "invoice-1", "user-1");
    await service.postVoucherMovements(tx as never, "invoice-1", "user-1");

    expect(tx.stockMovement.upsert).not.toHaveBeenCalled();
    expect(tx.voucherEntryLine.createMany).toHaveBeenCalledTimes(1);
    expect(ledgerLines.filter((line) => line.voucherId === "invoice-1")).toEqual([
      expect.objectContaining({ accountId: "account-cogs", debit: 320, credit: 0 }),
      expect.objectContaining({ accountId: "account-delivered-pending", debit: 0, credit: 320 }),
    ]);
  });

  it("uses the immediate exact source movement for a partial Invoice spanning multiple Delivery Notes", async () => {
    const multiInvoice = voucher({
      id: "invoice-multi-dn",
      voucherType: VoucherEntryType.SALES,
      documentKind: null,
      sourceVoucherId: "delivery-note-a",
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
      voucherNumber: "SI-MULTI-DN",
      inventoryItems: [
        {
          id: "invoice-line-a", inventoryItemId: "item-a", warehouseId: "warehouse-1",
          sourceInventoryLineId: "delivery-line-a", itemName: "Phone", quantity: 2, unitPrice: 500,
          warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
          inventoryItem: { id: "item-a", kind: "PRODUCT", unit: "pcs", openingRate: 100 },
        },
        {
          id: "invoice-line-b", inventoryItemId: "item-b", warehouseId: "warehouse-1",
          sourceInventoryLineId: "delivery-line-b", itemName: "TV", quantity: 3, unitPrice: 400,
          warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
          inventoryItem: { id: "item-b", kind: "PRODUCT", unit: "pcs", openingRate: 70 },
        },
      ],
    });
    const { tx, creates, inventoryLineRecords, ledgerLines, voucherRecords } = fakeTx(0, 0, multiInvoice);
    voucherRecords.push(
      postedVoucher({ id: "delivery-note-a", voucherType: VoucherEntryType.SALES, documentKind: "delivery-note", workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW, voucherNumber: "DN-A" }),
      postedVoucher({ id: "delivery-note-b", voucherType: VoucherEntryType.SALES, documentKind: "delivery-note", workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW, voucherNumber: "DN-B" }),
    );
    inventoryLineRecords.push(
      { id: "delivery-line-a", voucherId: "delivery-note-a", inventoryItemId: "item-a", itemName: "Phone", quantity: 10 },
      { id: "delivery-line-b", voucherId: "delivery-note-b", inventoryItemId: "item-b", itemName: "TV", quantity: 8 },
    );
    creates.push(
      {
        id: "delivery-movement-a", companyId: "company-1", workspaceId: "workspace-1",
        transactionId: "delivery-note-a", transactionLineId: "delivery-line-a",
        transactionType: "DELIVERY_NOTE", movementType: StockMovementType.OUT,
        quantity: 10, unitCost: 100, movementValue: 1_000, reversalOfId: null,
      },
      {
        id: "delivery-movement-b", companyId: "company-1", workspaceId: "workspace-1",
        transactionId: "delivery-note-b", transactionLineId: "delivery-line-b",
        transactionType: "DELIVERY_NOTE", movementType: StockMovementType.OUT,
        quantity: 8, unitCost: 70, movementValue: 560, reversalOfId: null,
      },
    );

    await service.postVoucherMovements(tx as never, "invoice-multi-dn", "user-1");

    expect(tx.stockMovement.upsert).not.toHaveBeenCalled();
    expect(ledgerLines.filter((line) => line.voucherId === "invoice-multi-dn")).toEqual([
      expect.objectContaining({ accountId: "account-cogs", debit: 410, credit: 0 }),
      expect.objectContaining({ accountId: "account-delivered-pending", debit: 0, credit: 410 }),
    ]);
  });

  it("allocates a document discount proportionally into each purchased product's acquisition cost", async () => {
    const record = voucher({
      discountAmount: 50,
      inventoryItems: [
        { id: "phone-line", inventoryItemId: "phone", warehouseId: "warehouse-1", itemName: "Phone", quantity: 2, unitPrice: 100, warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null }, inventoryItem: { id: "phone", kind: "PRODUCT", unit: "pcs", openingRate: 0 } },
        { id: "tv-line", inventoryItemId: "tv", warehouseId: "warehouse-1", itemName: "Television", quantity: 1, unitPrice: 300, warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null }, inventoryItem: { id: "tv", kind: "PRODUCT", unit: "pcs", openingRate: 0 } },
      ],
    });
    const { tx, creates } = fakeTx(0, 0, record);

    await service.postVoucherMovements(tx as never, "voucher-1", "user-1");

    expect(creates).toEqual(expect.arrayContaining([
      expect.objectContaining({ transactionLineId: "phone-line", inputUnitCost: 90, movementValue: 180, balanceValue: 180, averageCost: 90 }),
      expect.objectContaining({ transactionLineId: "tv-line", inputUnitCost: 270, movementValue: 270, balanceValue: 270, averageCost: 270 }),
    ]));
    expect(creates.reduce((total, row) => total + Number(row.movementValue ?? 0), 0)).toBe(450);
  });

  function seedOpeningPurchase(creates: Array<Record<string, unknown>>) {
    creates.push({
      id: "opening-purchase", tenantId: "tenant-1", companyId: "company-1", workspaceId: "workspace-1",
      warehouseId: "warehouse-1", inventoryItemId: "item-1", transactionType: "PURCHASE",
      transactionId: "purchase-voucher", transactionLineId: "purchase-line",
      movementType: StockMovementType.IN, quantity: 10, unit: "pcs",
      inputUnitCost: 100, reversalOfId: null,
      transactionDate: new Date("2026-08-01T00:00:00.000Z"),
      createdAt: new Date("2026-08-01T01:00:00.000Z"),
    });
  }

  it("posts a real Cost of Goods Sold / Inventory Control ledger pair for a sale, at the MWA cost not the selling price", async () => {
    const saleRecord = voucher({
      id: "sale-1",
      voucherType: VoucherEntryType.SALES,
      documentKind: null,
      inventoryItems: [{
        id: "sale-line-1", inventoryItemId: "item-1", warehouseId: "warehouse-1", itemName: "Phone", quantity: 4, unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
        inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs", openingRate: 100 },
      }],
    });
    const { tx, creates } = fakeTx(10, 0, saleRecord);
    seedOpeningPurchase(creates);

    await service.postVoucherMovements(tx as never, "sale-1", "user-1");

    expect(tx.voucherEntryLine.createMany).toHaveBeenCalledTimes(1);
    const [{ data: ledgerLines }] = tx.voucherEntryLine.createMany.mock.calls[0] as [{ data: Array<Record<string, unknown>> }];
    expect(ledgerLines).toEqual([
      expect.objectContaining({ voucherId: "sale-1", accountId: "account-cogs", ledger: "Cost of Goods Sold", debit: 400, credit: 0 }),
      expect.objectContaining({ voucherId: "sale-1", accountId: "account-inventory", ledger: "Inventory Control", debit: 0, credit: 400 }),
    ]);
  });

  it("holds Delivery Note cost in Delivered Inventory Pending Invoice and never recognizes COGS early", async () => {
    const deliveryNote = voucher({
      id: "delivery-note-base",
      voucherType: VoucherEntryType.SALES,
      documentKind: "delivery-note",
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
      voucherNumber: "DN-BASE",
      inventoryItems: [{
        id: "delivery-line-base", inventoryItemId: "item-1", warehouseId: "warehouse-1",
        itemName: "Phone", quantity: 4, unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
        inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs", openingRate: 100 },
      }],
    });
    const { tx, creates, ledgerLines } = fakeTx(10, 0, deliveryNote);
    seedOpeningPurchase(creates);

    await service.postVoucherMovements(tx as never, "delivery-note-base", "user-1");
    await service.postVoucherMovements(tx as never, "delivery-note-base", "user-1");

    expect(creates.filter((movement) => movement.transactionId === "delivery-note-base")).toHaveLength(1);
    expect(tx.voucherEntryLine.createMany).toHaveBeenCalledTimes(1);
    expect(ledgerLines.filter((line) => line.voucherId === "delivery-note-base")).toEqual([
      expect.objectContaining({
        accountId: "account-delivered-pending",
        debit: 400,
        credit: 0,
        costCenter: "DELIVERY_NOTE_INVENTORY_VALUATION",
      }),
      expect.objectContaining({
        accountId: "account-inventory",
        debit: 0,
        credit: 400,
        costCenter: "DELIVERY_NOTE_INVENTORY_VALUATION",
      }),
    ]);
    expect(ledgerLines.some((line) => line.voucherId === "delivery-note-base" && line.accountId === "account-cogs")).toBe(false);
  });

  it("fails Delivery Note posting when the protected Delivered Inventory Pending ledger is missing", async () => {
    const deliveryNote = voucher({
      id: "delivery-note-missing-ledger",
      voucherType: VoucherEntryType.SALES,
      documentKind: "delivery-note",
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
      voucherNumber: "DN-MISSING-LEDGER",
    });
    const { tx, creates } = fakeTx(10, 0, deliveryNote);
    seedOpeningPurchase(creates);
    tx.account.findUnique.mockImplementation((async ({ where }: { where: { companyId_code: { code: string } } }) =>
      where.companyId_code.code === "1232001" ? null : CHART_ACCOUNTS[where.companyId_code.code] ?? null
    ) as never);

    await expect(
      service.postVoucherMovements(tx as never, "delivery-note-missing-ledger", "user-1"),
    ).rejects.toThrow("Required Inventory Control or Delivered Inventory Pending system account is missing");
    expect(tx.voucherEntryLine.createMany).not.toHaveBeenCalled();
  });

  it("does not duplicate the Cost of Goods Sold / Inventory Control ledger pair when a sale posting is retried", async () => {
    const saleRecord = voucher({
      id: "sale-1",
      voucherType: VoucherEntryType.SALES,
      documentKind: null,
      inventoryItems: [{
        id: "sale-line-1", inventoryItemId: "item-1", warehouseId: "warehouse-1", itemName: "Phone", quantity: 4, unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
        inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs", openingRate: 100 },
      }],
    });
    const { tx, creates } = fakeTx(10, 0, saleRecord);
    seedOpeningPurchase(creates);

    await service.postVoucherMovements(tx as never, "sale-1", "user-1");
    await service.postVoucherMovements(tx as never, "sale-1", "user-1");

    expect(tx.voucherEntryLine.createMany).toHaveBeenCalledTimes(1);
  });

  it("posts immutable account-ID-based delta journals when a backdated replay changes an earlier sale cost", async () => {
    const saleRecord = voucher({
      id: "sale-recost",
      voucherType: VoucherEntryType.SALES,
      voucherNumber: "SI-RECOST",
      voucherDate: new Date("2026-08-15T00:00:00.000Z"),
    });
    const { tx, ledgerLines, voucherRecords } = fakeTx(0, 0, saleRecord);
    ledgerLines.push(
      { voucherId: "sale-recost", accountId: "account-cogs", description: "Cost of goods sold — SI-RECOST", costCenter: "INVENTORY_VALUATION", debit: 400, credit: 0 },
      { voucherId: "sale-recost", accountId: "account-inventory", description: "Inventory issued — SI-RECOST", costCenter: "INVENTORY_VALUATION", debit: 0, credit: 400 },
    );
    const movement = {
      transactionId: "sale-recost",
      transactionType: "SALES",
      movementType: StockMovementType.OUT,
      movementValue: 600,
    };

    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [movement], "user-1");
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [movement], "user-1");

    expect(tx.voucherEntry.create).toHaveBeenCalledTimes(1);
    const adjustment = voucherRecords.find((entry) => entry.sourceType === "INVENTORY_COST_REVALUATION");
    expect(adjustment).toMatchObject({
      voucherType: VoucherEntryType.JOURNAL,
      status: VoucherEntryStatus.POSTED,
      sourceId: "sale-recost",
      postingVersion: 1,
      totalAmount: 200,
      debit: 200,
      credit: 200,
    });
    expect(ledgerLines.filter((line) => line.voucherId === "sale-recost")).toEqual([
      expect.objectContaining({ accountId: "account-cogs", debit: 400, credit: 0 }),
      expect.objectContaining({ accountId: "account-inventory", debit: 0, credit: 400 }),
    ]);
    expect(ledgerLines.filter((line) => line.voucherId === adjustment?.id)).toEqual([
      expect.objectContaining({ accountId: "account-cogs", debit: 200, credit: 0 }),
      expect.objectContaining({ accountId: "account-inventory", debit: 0, credit: 200 }),
    ]);
  });

  it("keeps every recost revision and posts only the next delta instead of rewriting history", async () => {
    const saleRecord = voucher({
      id: "sale-recost-revision",
      voucherType: VoucherEntryType.SALES,
      voucherNumber: "SI-RECOST-REVISION",
    });
    const { tx, ledgerLines, voucherRecords } = fakeTx(0, 0, saleRecord);
    ledgerLines.push(
      { voucherId: "sale-recost-revision", accountId: "account-cogs", description: "Cost of goods sold", costCenter: "INVENTORY_VALUATION", debit: 400, credit: 0 },
      { voucherId: "sale-recost-revision", accountId: "account-inventory", description: "Inventory issued", costCenter: "INVENTORY_VALUATION", debit: 0, credit: 400 },
    );
    const valuation = (movementValue: number) => [{
      transactionId: "sale-recost-revision",
      transactionType: "SALES",
      movementType: StockMovementType.OUT,
      movementValue,
    }];

    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", valuation(600), "user-1");
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", valuation(500), "user-1");
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", valuation(500), "user-1");

    const adjustments = voucherRecords.filter((entry) => entry.sourceType === "INVENTORY_COST_REVALUATION");
    expect(tx.voucherEntry.create).toHaveBeenCalledTimes(2);
    expect(adjustments).toEqual([
      expect.objectContaining({ postingVersion: 1, totalAmount: 200 }),
      expect.objectContaining({ postingVersion: 2, totalAmount: 100 }),
    ]);
    expect(ledgerLines.filter((line) => line.voucherId === adjustments[1]?.id)).toEqual([
      expect.objectContaining({ accountId: "account-inventory", debit: 100, credit: 0 }),
      expect.objectContaining({ accountId: "account-cogs", debit: 0, credit: 100 }),
    ]);
  });

  it("anticipates PostingEngine's base voucher mirror and reverses only accumulated recost deltas", async () => {
    const saleRecord = voucher({
      id: "sale-recost-to-reverse",
      voucherType: VoucherEntryType.SALES,
      voucherNumber: "SI-RECOST-TO-REVERSE",
    });
    const { tx, ledgerLines, voucherRecords } = fakeTx(0, 0, saleRecord);
    ledgerLines.push(
      { voucherId: "sale-recost-to-reverse", accountId: "account-cogs", description: "Cost of goods sold", costCenter: "INVENTORY_VALUATION", debit: 400, credit: 0 },
      { voucherId: "sale-recost-to-reverse", accountId: "account-inventory", description: "Inventory issued", costCenter: "INVENTORY_VALUATION", debit: 0, credit: 400 },
    );
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [{
      transactionId: "sale-recost-to-reverse",
      transactionType: "SALES",
      movementType: StockMovementType.OUT,
      movementValue: 600,
    }], "user-1");

    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [
      { transactionId: "sale-recost-to-reverse", transactionType: "SALES", movementType: StockMovementType.OUT, movementValue: 600 },
      { transactionId: "sale-recost-to-reverse", transactionType: "SALES_REVERSAL", movementType: StockMovementType.IN, movementValue: 600 },
    ], "user-1", "sale-recost-to-reverse");

    const adjustments = voucherRecords.filter((entry) => entry.sourceType === "INVENTORY_COST_REVALUATION");
    expect(adjustments).toHaveLength(2);
    expect(adjustments[1]).toMatchObject({ postingVersion: 2, totalAmount: 200 });
    expect(ledgerLines.filter((line) => line.voucherId === adjustments[1]?.id)).toEqual([
      expect.objectContaining({ accountId: "account-inventory", debit: 200, credit: 0 }),
      expect.objectContaining({ accountId: "account-cogs", debit: 0, credit: 200 }),
    ]);
  });

  it("repairs a posted historical receipt-backed bill with immutable variance journals and cancels them on reversal", async () => {
    const historicalBill = voucher({
      id: "historical-receipt-bill",
      documentKind: "bill",
      sourceVoucherId: "receipt-a",
      voucherNumber: "PB-HISTORICAL",
      status: VoucherEntryStatus.POSTED,
    });
    const { tx, revaluations, ledgerLines, voucherRecords } = fakeTx(0, 0, historicalBill);
    revaluations.push(
      {
        id: "historical-revaluation-a",
        workspaceId: "workspace-1",
        sourceMovementId: "receipt-movement-a",
        billingVoucherId: "historical-receipt-bill",
        varianceAmount: 120,
        isActive: true,
      },
      {
        id: "historical-revaluation-b",
        workspaceId: "workspace-1",
        sourceMovementId: "receipt-movement-b",
        billingVoucherId: "historical-receipt-bill",
        varianceAmount: -20,
        isActive: true,
      },
    );
    const impactedReceipt = valuedMovement({
      id: "receipt-movement-a",
      transactionId: "receipt-a",
      transactionType: "RECEIPT_NOTE",
      movementType: StockMovementType.IN,
      movementValue: 520,
    });

    // Only one GRN is in this targeted replay, but the correction must include
    // every active revaluation on the same multi-GRN bill: 120 - 20 = 100.
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [impactedReceipt], "repair-user");
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [impactedReceipt], "repair-user");

    let corrections = voucherRecords.filter((entry) => entry.sourceType === "PURCHASE_BILL_COST_VARIANCE");
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      sourceId: "historical-receipt-bill",
      postingVersion: 1,
      status: VoucherEntryStatus.POSTED,
      totalAmount: 100,
      debit: 100,
      credit: 100,
      createdByUserId: "repair-user",
      idempotencyKey: "purchase-bill-cost-variance:historical-receipt-bill:1",
    });
    expect(ledgerLines.filter((line) => line.voucherId === corrections[0]?.id)).toEqual([
      expect.objectContaining({
        accountId: "account-inventory",
        debit: 100,
        credit: 0,
        costCenter: "PURCHASE_COST_VARIANCE",
      }),
      expect.objectContaining({
        accountId: "account-purchase-pending",
        debit: 0,
        credit: 100,
        costCenter: "PURCHASE_COST_VARIANCE",
      }),
    ]);
    expect(ledgerLines.filter((line) => line.voucherId === "historical-receipt-bill")).toEqual([]);
    expect(tx.voucherEntryLine.createMany).not.toHaveBeenCalled();
    expect(tx.voucherEntry.update).not.toHaveBeenCalled();

    revaluations.forEach((revaluation) => {
      revaluation.isActive = false;
    });
    await service.reconcileMovingAverageLedger(
      tx as never,
      "workspace-1",
      [impactedReceipt],
      "reversal-user",
      "historical-receipt-bill",
    );
    await service.reconcileMovingAverageLedger(
      tx as never,
      "workspace-1",
      [impactedReceipt],
      "reversal-user",
      "historical-receipt-bill",
    );

    corrections = voucherRecords.filter((entry) => entry.sourceType === "PURCHASE_BILL_COST_VARIANCE");
    expect(corrections).toHaveLength(2);
    expect(corrections[1]).toMatchObject({
      sourceId: "historical-receipt-bill",
      postingVersion: 2,
      totalAmount: 100,
      createdByUserId: "reversal-user",
      idempotencyKey: "purchase-bill-cost-variance:historical-receipt-bill:2",
    });
    expect(ledgerLines.filter((line) => line.voucherId === corrections[1]?.id)).toEqual([
      expect.objectContaining({ accountId: "account-purchase-pending", debit: 100, credit: 0 }),
      expect.objectContaining({ accountId: "account-inventory", debit: 0, credit: 100 }),
    ]);
    expect(ledgerLines.filter((line) => line.voucherId === "historical-receipt-bill")).toEqual([]);
  });

  it("propagates a Delivery Note recost into independent DN and whole multi-DN Invoice delta journals", async () => {
    const deliveryA = voucher({
      id: "delivery-recost-a",
      voucherType: VoucherEntryType.SALES,
      documentKind: "delivery-note",
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
      voucherNumber: "DN-RECOST-A",
      status: VoucherEntryStatus.POSTED,
      inventoryItems: [{
        id: "delivery-recost-line-a", inventoryItemId: "item-a", warehouseId: "warehouse-1",
        itemName: "Phone", quantity: 10, unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
        inventoryItem: { id: "item-a", kind: "PRODUCT", unit: "pcs", openingRate: 100 },
      }],
    });
    const { tx, creates, inventoryLineRecords, ledgerLines, voucherRecords } = fakeTx(0, 0, deliveryA);
    voucherRecords.push(
      postedVoucher({
        id: "delivery-recost-b", voucherType: VoucherEntryType.SALES, documentKind: "delivery-note",
        workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW, voucherNumber: "DN-RECOST-B",
      }),
      postedVoucher({
        id: "invoice-recost", voucherType: VoucherEntryType.SALES, documentKind: null,
        workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW, voucherNumber: "SI-RECOST-DN",
      }),
    );
    inventoryLineRecords.push(
      { id: "delivery-recost-line-b", voucherId: "delivery-recost-b", inventoryItemId: "item-b", itemName: "TV", quantity: 5 },
      { id: "invoice-recost-line-a", voucherId: "invoice-recost", sourceInventoryLineId: "delivery-recost-line-a", inventoryItemId: "item-a", itemName: "Phone", quantity: 4 },
      { id: "invoice-recost-line-b", voucherId: "invoice-recost", sourceInventoryLineId: "delivery-recost-line-b", inventoryItemId: "item-b", itemName: "TV", quantity: 2 },
    );
    creates.push(
      {
        id: "delivery-recost-movement-a", companyId: "company-1", workspaceId: "workspace-1",
        transactionId: "delivery-recost-a", transactionLineId: "delivery-recost-line-a",
        transactionType: "DELIVERY_NOTE", movementType: StockMovementType.OUT,
        quantity: 10, unitCost: 120, movementValue: 1_200, reversalOfId: null,
      },
      {
        id: "delivery-recost-movement-b", companyId: "company-1", workspaceId: "workspace-1",
        transactionId: "delivery-recost-b", transactionLineId: "delivery-recost-line-b",
        transactionType: "DELIVERY_NOTE", movementType: StockMovementType.OUT,
        quantity: 5, unitCost: 70, movementValue: 350, reversalOfId: null,
      },
    );
    ledgerLines.push(
      { voucherId: "delivery-recost-a", accountId: "account-delivered-pending", description: "Inventory delivered pending invoice", costCenter: "DELIVERY_NOTE_INVENTORY_VALUATION", debit: 1_000, credit: 0 },
      { voucherId: "delivery-recost-a", accountId: "account-inventory", description: "Inventory issued", costCenter: "DELIVERY_NOTE_INVENTORY_VALUATION", debit: 0, credit: 1_000 },
      { voucherId: "invoice-recost", accountId: "account-cogs", description: "Delivered inventory recognized as COGS", costCenter: "SALES_INVOICE_DELIVERY_COST", debit: 540, credit: 0 },
      { voucherId: "invoice-recost", accountId: "account-delivered-pending", description: "Delivered inventory cleared on invoice", costCenter: "SALES_INVOICE_DELIVERY_COST", debit: 0, credit: 540 },
    );
    const affectedMovement = valuedMovement({
      id: "delivery-recost-movement-a",
      transactionId: "delivery-recost-a",
      transactionLineId: "delivery-recost-line-a",
      transactionType: "DELIVERY_NOTE",
      movementType: StockMovementType.OUT,
      unitCost: 120,
      movementValue: 1_200,
    });

    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [affectedMovement], "user-1");
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [affectedMovement], "user-1");

    const deliveryCorrections = voucherRecords.filter((entry) => entry.sourceType === "DELIVERY_NOTE_INVENTORY_REVALUATION");
    const invoiceCorrections = voucherRecords.filter((entry) => entry.sourceType === "SALES_INVOICE_DELIVERY_COST_REVALUATION");
    expect(deliveryCorrections).toEqual([
      expect.objectContaining({ sourceId: "delivery-recost-a", postingVersion: 1, totalAmount: 200, currency: "BDT" }),
    ]);
    expect(invoiceCorrections).toEqual([
      expect.objectContaining({ sourceId: "invoice-recost", postingVersion: 1, totalAmount: 80, currency: "BDT" }),
    ]);
    expect(ledgerLines.filter((line) => line.voucherId === deliveryCorrections[0]?.id)).toEqual([
      expect.objectContaining({ accountId: "account-inventory", debit: 0, credit: 200 }),
      expect.objectContaining({ accountId: "account-delivered-pending", debit: 200, credit: 0 }),
    ]);
    expect(ledgerLines.filter((line) => line.voucherId === invoiceCorrections[0]?.id)).toEqual([
      expect.objectContaining({ accountId: "account-delivered-pending", debit: 0, credit: 80 }),
      expect.objectContaining({ accountId: "account-cogs", debit: 80, credit: 0 }),
    ]);
  });

  it("repairs historical Delivery Note COGS timing and a missing sourced-Invoice cost pair without rewriting either voucher", async () => {
    const historicalDelivery = voucher({
      id: "historical-delivery",
      voucherType: VoucherEntryType.SALES,
      documentKind: "delivery-note",
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
      voucherNumber: "DN-HISTORICAL",
      status: VoucherEntryStatus.POSTED,
      inventoryItems: [{
        id: "historical-delivery-line", inventoryItemId: "item-1", warehouseId: "warehouse-1",
        itemName: "Phone", quantity: 10, unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
        inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs", openingRate: 100 },
      }],
    });
    const { tx, creates, inventoryLineRecords, ledgerLines, voucherRecords } = fakeTx(0, 0, historicalDelivery);
    voucherRecords.push(postedVoucher({
      id: "historical-sourced-invoice",
      voucherType: VoucherEntryType.SALES,
      documentKind: null,
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
      voucherNumber: "SI-HISTORICAL",
    }));
    inventoryLineRecords.push({
      id: "historical-invoice-line",
      voucherId: "historical-sourced-invoice",
      sourceInventoryLineId: "historical-delivery-line",
      inventoryItemId: "item-1",
      itemName: "Phone",
      quantity: 4,
    });
    creates.push({
      id: "historical-delivery-movement", companyId: "company-1", workspaceId: "workspace-1",
      transactionId: "historical-delivery", transactionLineId: "historical-delivery-line",
      transactionType: "DELIVERY_NOTE", movementType: StockMovementType.OUT,
      quantity: 10, unitCost: 100, movementValue: 1_000, reversalOfId: null,
    });
    ledgerLines.push(
      { voucherId: "historical-delivery", accountId: "account-cogs", description: "Cost of goods sold", costCenter: "INVENTORY_VALUATION", debit: 1_000, credit: 0 },
      { voucherId: "historical-delivery", accountId: "account-inventory", description: "Inventory issued", costCenter: "INVENTORY_VALUATION", debit: 0, credit: 1_000 },
    );
    const movement = valuedMovement({
      id: "historical-delivery-movement",
      transactionId: "historical-delivery",
      transactionLineId: "historical-delivery-line",
      transactionType: "DELIVERY_NOTE",
      movementType: StockMovementType.OUT,
      unitCost: 100,
      movementValue: 1_000,
    });

    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [movement]);
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [movement]);

    const deliveryCorrection = voucherRecords.find((entry) => entry.sourceType === "DELIVERY_NOTE_INVENTORY_REVALUATION");
    const invoiceCorrection = voucherRecords.find((entry) => entry.sourceType === "SALES_INVOICE_DELIVERY_COST_REVALUATION");
    expect(ledgerLines.filter((line) => line.voucherId === deliveryCorrection?.id)).toEqual([
      expect.objectContaining({ accountId: "account-delivered-pending", debit: 1_000, credit: 0 }),
      expect.objectContaining({ accountId: "account-cogs", debit: 0, credit: 1_000 }),
    ]);
    expect(ledgerLines.filter((line) => line.voucherId === invoiceCorrection?.id)).toEqual([
      expect.objectContaining({ accountId: "account-delivered-pending", debit: 0, credit: 400 }),
      expect.objectContaining({ accountId: "account-cogs", debit: 400, credit: 0 }),
    ]);
    expect(ledgerLines.filter((line) => line.voucherId === "historical-delivery")).toEqual([
      expect.objectContaining({ accountId: "account-cogs", debit: 1_000, credit: 0 }),
      expect.objectContaining({ accountId: "account-inventory", debit: 0, credit: 1_000 }),
    ]);
    expect(ledgerLines.filter((line) => line.voucherId === "historical-sourced-invoice")).toEqual([]);
    expect(tx.voucherEntryLine.createMany).not.toHaveBeenCalled();
    expect(tx.voucherEntry.update).not.toHaveBeenCalled();
  });

  it("cancels only sourced-Invoice recost journals on stockless SI reversal and leaves the base pair for the generic mirror", async () => {
    const sourcedInvoice = voucher({
      id: "invoice-to-reverse",
      voucherType: VoucherEntryType.SALES,
      documentKind: null,
      sourceVoucherId: "delivery-for-invoice-reversal",
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
      voucherNumber: "SI-TO-REVERSE",
      status: VoucherEntryStatus.POSTED,
      inventoryItems: [{
        id: "invoice-reversal-line", inventoryItemId: "item-1", warehouseId: "warehouse-1",
        sourceInventoryLineId: "delivery-reversal-source-line", itemName: "Phone", quantity: 4, unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
        inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs", openingRate: 100 },
      }],
    });
    const { tx, ledgerLines, voucherRecords } = fakeTx(0, 0, sourcedInvoice);
    const priorCorrection = postedVoucher({
      id: "invoice-recost-correction-1",
      voucherType: VoucherEntryType.JOURNAL,
      documentKind: "sales-invoice-delivery-cost-adjustment",
      voucherNumber: "SIC-invoice-to-reverse-1",
      sourceType: "SALES_INVOICE_DELIVERY_COST_REVALUATION",
      sourceId: "invoice-to-reverse",
      postingVersion: 1,
    });
    voucherRecords.push(priorCorrection);
    ledgerLines.push(
      { voucherId: "invoice-to-reverse", accountId: "account-cogs", costCenter: "SALES_INVOICE_DELIVERY_COST", debit: 400, credit: 0 },
      { voucherId: "invoice-to-reverse", accountId: "account-delivered-pending", costCenter: "SALES_INVOICE_DELIVERY_COST", debit: 0, credit: 400 },
      { voucherId: "invoice-recost-correction-1", accountId: "account-cogs", costCenter: "SALES_INVOICE_DELIVERY_COST", debit: 80, credit: 0 },
      { voucherId: "invoice-recost-correction-1", accountId: "account-delivered-pending", costCenter: "SALES_INVOICE_DELIVERY_COST", debit: 0, credit: 80 },
    );

    await service.reverseVoucherMovements(tx as never, "invoice-to-reverse", "reversal-user");

    const corrections = voucherRecords.filter((entry) => entry.sourceType === "SALES_INVOICE_DELIVERY_COST_REVALUATION");
    expect(corrections).toHaveLength(2);
    expect(corrections[1]).toMatchObject({
      sourceId: "invoice-to-reverse",
      postingVersion: 2,
      totalAmount: 80,
      createdByUserId: "reversal-user",
    });
    expect(ledgerLines.filter((line) => line.voucherId === corrections[1]?.id)).toEqual([
      expect.objectContaining({ accountId: "account-delivered-pending", debit: 80, credit: 0 }),
      expect.objectContaining({ accountId: "account-cogs", debit: 0, credit: 80 }),
    ]);
    expect(ledgerLines.filter((line) => line.voucherId === "invoice-to-reverse")).toEqual([
      expect.objectContaining({ accountId: "account-cogs", debit: 400, credit: 0 }),
      expect.objectContaining({ accountId: "account-delivered-pending", debit: 0, credit: 400 }),
    ]);
    expect(tx.stockMovement.upsert).not.toHaveBeenCalled();
  });

  it("cancels Delivery Note recost journals before the generic DN mirror reverses Pending/Inventory", async () => {
    const delivery = voucher({
      id: "delivery-to-reverse",
      voucherType: VoucherEntryType.SALES,
      documentKind: "delivery-note",
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
      voucherNumber: "DN-TO-REVERSE",
      status: VoucherEntryStatus.POSTED,
    });
    const { tx, ledgerLines, voucherRecords } = fakeTx(0, 0, delivery);
    voucherRecords.push(postedVoucher({
      id: "delivery-recost-correction-1",
      voucherType: VoucherEntryType.JOURNAL,
      documentKind: "delivery-note-inventory-adjustment",
      voucherNumber: "DNV-delivery-to-reverse-1",
      sourceType: "DELIVERY_NOTE_INVENTORY_REVALUATION",
      sourceId: "delivery-to-reverse",
      postingVersion: 1,
    }));
    ledgerLines.push(
      { voucherId: "delivery-to-reverse", accountId: "account-delivered-pending", costCenter: "DELIVERY_NOTE_INVENTORY_VALUATION", debit: 1_000, credit: 0 },
      { voucherId: "delivery-to-reverse", accountId: "account-inventory", costCenter: "DELIVERY_NOTE_INVENTORY_VALUATION", debit: 0, credit: 1_000 },
      { voucherId: "delivery-recost-correction-1", accountId: "account-delivered-pending", costCenter: "DELIVERY_NOTE_INVENTORY_VALUATION", debit: 200, credit: 0 },
      { voucherId: "delivery-recost-correction-1", accountId: "account-inventory", costCenter: "DELIVERY_NOTE_INVENTORY_VALUATION", debit: 0, credit: 200 },
    );
    const original = valuedMovement({
      id: "delivery-to-reverse-movement",
      transactionId: "delivery-to-reverse",
      transactionLineId: "delivery-to-reverse-line",
      transactionType: "DELIVERY_NOTE",
      movementType: StockMovementType.OUT,
      movementValue: 1_200,
    });
    const reversal = valuedMovement({
      id: "delivery-to-reverse-movement-reversal",
      transactionId: "delivery-to-reverse",
      transactionLineId: "delivery-to-reverse-line",
      transactionType: "DELIVERY_NOTE_REVERSAL",
      movementType: StockMovementType.IN,
      movementValue: 1_200,
    });

    await service.reconcileMovingAverageLedger(
      tx as never,
      "workspace-1",
      [original, reversal],
      "reversal-user",
      "delivery-to-reverse",
    );
    await service.reconcileMovingAverageLedger(
      tx as never,
      "workspace-1",
      [original, reversal],
      "reversal-user",
      "delivery-to-reverse",
    );

    const corrections = voucherRecords.filter((entry) => entry.sourceType === "DELIVERY_NOTE_INVENTORY_REVALUATION");
    expect(corrections).toHaveLength(2);
    expect(corrections[1]).toMatchObject({ postingVersion: 2, totalAmount: 200 });
    expect(ledgerLines.filter((line) => line.voucherId === corrections[1]?.id)).toEqual([
      expect.objectContaining({ accountId: "account-inventory", debit: 200, credit: 0 }),
      expect.objectContaining({ accountId: "account-delivered-pending", debit: 0, credit: 200 }),
    ]);
  });

  it("posts opening stock to Inventory Control and Opening Balance Equity once, then zeroes it with an immutable delta", async () => {
    const { tx, ledgerLines, voucherRecords } = fakeTx();
    const opening = valuedMovement();

    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [opening], "user-1");
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [opening], "user-1");

    let openingJournals = voucherRecords.filter((entry) => entry.sourceType === "INVENTORY_OPENING_VALUATION");
    expect(openingJournals).toHaveLength(1);
    expect(openingJournals[0]).toMatchObject({
      sourceId: "stock-movement-1",
      postingVersion: 1,
      totalAmount: 1_000,
    });
    expect(ledgerLines.filter((line) => line.voucherId === openingJournals[0]?.id)).toEqual([
      expect.objectContaining({ accountId: "account-inventory", debit: 1_000, credit: 0 }),
      expect.objectContaining({ accountId: "account-opening-equity", debit: 0, credit: 1_000 }),
    ]);

    const zeroedOpening = { ...opening, movementValue: 0 };
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [zeroedOpening], "user-1");
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [zeroedOpening], "user-1");

    openingJournals = voucherRecords.filter((entry) => entry.sourceType === "INVENTORY_OPENING_VALUATION");
    expect(openingJournals).toHaveLength(2);
    expect(openingJournals[1]).toMatchObject({ postingVersion: 2, totalAmount: 1_000 });
    expect(ledgerLines.filter((line) => line.voucherId === openingJournals[1]?.id)).toEqual([
      expect.objectContaining({ accountId: "account-inventory", debit: 0, credit: 1_000 }),
      expect.objectContaining({ accountId: "account-opening-equity", debit: 1_000, credit: 0 }),
    ]);
  });

  it("uses the earliest workspace member as the audit actor for a legacy migration opening", async () => {
    const { tx, voucherRecords } = fakeTx();
    const workspaceMember = {
      findFirst: vi.fn(async () => ({ userId: "workspace-founder" })),
    };
    Object.assign(tx, { workspaceMember });
    const migrationOpening = valuedMovement({
      id: "migration-opening",
      transactionType: "MIGRATION_OPENING",
      postedByUserId: null,
    });

    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [migrationOpening]);

    expect(voucherRecords.find((entry) => entry.sourceId === "migration-opening")).toMatchObject({
      sourceType: "INVENTORY_OPENING_VALUATION",
      createdByUserId: "workspace-founder",
      approvedByUserId: "workspace-founder",
    });
    expect(workspaceMember.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1" },
      orderBy: { joinedAt: "asc" },
      select: { userId: true },
    });
  });

  it("uses Gain for positive adjustments and Loss for negative adjustments with authoritative account IDs", async () => {
    const { tx, ledgerLines, voucherRecords } = fakeTx();
    const adjustmentIn = valuedMovement({
      id: "adjustment-in",
      transactionId: "adjustment-source-in",
      transactionType: "STOCK_ADJUSTMENT",
      movementType: StockMovementType.IN,
      movementValue: 300,
      referenceNo: "Stock count gain",
    });
    const adjustmentOut = valuedMovement({
      id: "adjustment-out",
      transactionId: "adjustment-source-out",
      transactionType: "STOCK_ADJUSTMENT",
      movementType: StockMovementType.OUT,
      movementValue: 120,
      referenceNo: "Stock count loss",
    });

    await service.reconcileMovingAverageLedger(
      tx as never,
      "workspace-1",
      [adjustmentIn, adjustmentOut],
      "user-1",
    );

    const adjustmentJournals = voucherRecords.filter((entry) => entry.sourceType === "INVENTORY_ADJUSTMENT_VALUATION");
    const inJournal = adjustmentJournals.find((entry) => entry.sourceId === "adjustment-in");
    const outJournal = adjustmentJournals.find((entry) => entry.sourceId === "adjustment-out");
    expect(ledgerLines.filter((line) => line.voucherId === inJournal?.id)).toEqual([
      expect.objectContaining({ accountId: "account-inventory", debit: 300, credit: 0 }),
      expect.objectContaining({ accountId: "account-adjustment-gain", debit: 0, credit: 300 }),
    ]);
    expect(ledgerLines.filter((line) => line.voucherId === outJournal?.id)).toEqual([
      expect.objectContaining({ accountId: "account-inventory", debit: 0, credit: 120 }),
      expect.objectContaining({ accountId: "account-adjustment-loss", debit: 120, credit: 0 }),
    ]);
  });

  it("mirrors the original Gain/Loss side for stock-adjustment reversals", async () => {
    const { tx, ledgerLines, voucherRecords } = fakeTx();
    const reverseGain = valuedMovement({
      id: "reverse-gain",
      transactionId: "adjustment-source-in",
      transactionType: "STOCK_ADJUSTMENT_REVERSAL",
      movementType: StockMovementType.OUT,
      movementValue: 300,
    });
    const reverseLoss = valuedMovement({
      id: "reverse-loss",
      transactionId: "adjustment-source-out",
      transactionType: "STOCK_ADJUSTMENT_REVERSAL",
      movementType: StockMovementType.IN,
      movementValue: 120,
    });

    await service.reconcileMovingAverageLedger(
      tx as never,
      "workspace-1",
      [reverseGain, reverseLoss],
      "user-1",
    );

    const journals = voucherRecords.filter((entry) => entry.sourceType === "INVENTORY_ADJUSTMENT_VALUATION");
    const gainReversal = journals.find((entry) => entry.sourceId === "reverse-gain");
    const lossReversal = journals.find((entry) => entry.sourceId === "reverse-loss");
    expect(ledgerLines.filter((line) => line.voucherId === gainReversal?.id)).toEqual([
      expect.objectContaining({ accountId: "account-inventory", debit: 0, credit: 300 }),
      expect.objectContaining({ accountId: "account-adjustment-gain", debit: 300, credit: 0 }),
    ]);
    expect(ledgerLines.filter((line) => line.voucherId === lossReversal?.id)).toEqual([
      expect.objectContaining({ accountId: "account-inventory", debit: 120, credit: 0 }),
      expect.objectContaining({ accountId: "account-adjustment-loss", debit: 0, credit: 120 }),
    ]);
  });

  it("posts only the later MWA delta when an adjustment issue is recosted", async () => {
    const { tx, ledgerLines, voucherRecords } = fakeTx();
    const issue = valuedMovement({
      id: "adjustment-recost",
      transactionType: "STOCK_ADJUSTMENT",
      movementType: StockMovementType.OUT,
      movementValue: 100,
    });
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [issue], "user-1");
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [{ ...issue, movementValue: 140 }], "user-1");
    await service.reconcileMovingAverageLedger(tx as never, "workspace-1", [{ ...issue, movementValue: 140 }], "user-1");

    const journals = voucherRecords.filter((entry) => entry.sourceType === "INVENTORY_ADJUSTMENT_VALUATION");
    expect(journals).toEqual([
      expect.objectContaining({ postingVersion: 1, totalAmount: 100 }),
      expect.objectContaining({ postingVersion: 2, totalAmount: 40 }),
    ]);
    expect(ledgerLines.filter((line) => line.voucherId === journals[1]?.id)).toEqual([
      expect.objectContaining({ accountId: "account-inventory", debit: 0, credit: 40 }),
      expect.objectContaining({ accountId: "account-adjustment-loss", debit: 40, credit: 0 }),
    ]);
  });

  it("blocks a sales issue from a warehouse that is not enabled for sales", async () => {
    const saleRecord = voucher({
      id: "sale-disabled-warehouse",
      voucherType: VoucherEntryType.SALES,
      documentKind: null,
      inventoryItems: [{
        id: "sale-disabled-line",
        inventoryItemId: "item-1",
        warehouseId: "warehouse-1",
        itemName: "Phone",
        quantity: 1,
        unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Receiving Only", allowSales: false, isActive: true, deletedAt: null },
        inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs", openingRate: 100 },
      }],
    });
    const { tx } = fakeTx(10, 0, saleRecord);

    await expect(service.postVoucherMovements(tx as never, "sale-disabled-warehouse", "user-1")).rejects.toThrow(
      "Receiving Only is not enabled for sales",
    );
    expect(tx.stockMovement.upsert).not.toHaveBeenCalled();
  });

  const manufacturedFinishedGoodProfile = {
    role: ManufacturingItemRole.FINISHED_GOOD,
    makeBuy: ManufacturingMakeBuy.MAKE,
    lotTracked: true,
    serialTracked: true,
    isActive: true,
  };

  it("rejects FG-Q / held manufactured finished goods even when aggregate warehouse stock exists", async () => {
    const saleRecord = voucher({
      id: "sale-held",
      voucherType: VoucherEntryType.SALES,
      documentKind: null,
      inventoryItems: [{
        id: "sale-held-line",
        inventoryItemId: "finished-good-1",
        warehouseId: "warehouse-1",
        manufacturingInventoryLotId: "held-lot",
        manufacturingSerialIds: ["held-serial"],
        itemName: "Manufactured Fridge",
        quantity: 1,
        unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "FG Warehouse", allowSales: true, isActive: true, deletedAt: null },
        inventoryItem: { id: "finished-good-1", kind: "PRODUCT", unit: "pcs", openingRate: 100, manufacturingProfile: manufacturedFinishedGoodProfile },
      }],
    });
    const { tx } = fakeTx(5, 0, saleRecord);
    tx.manufacturingInventoryLot.findFirst.mockResolvedValue({
      id: "held-lot",
      lotNumber: "FG-Q-001",
      workspaceId: "workspace-1",
      inventoryItemId: "finished-good-1",
      warehouseId: "warehouse-1",
      locationId: "fg-q-location",
      receivedQuantity: 1,
      availableQuantity: 0,
      reservedQuantity: 0,
      holdQuantity: 1,
      rejectedQuantity: 0,
      location: {
        id: "fg-q-location",
        workspaceId: "workspace-1",
        warehouseId: "warehouse-1",
        disposition: ManufacturingLocationDisposition.QC_HOLD,
        isActive: true,
      },
    } as never);

    await expect(service.postVoucherMovements(tx as never, "sale-held", "user-1")).rejects.toThrow(
      "not in the active FG-R released location",
    );
    expect(tx.stockMovement.upsert).not.toHaveBeenCalled();
  });

  it("allows an explicit FG-R released lot and consumes its exact released serial once", async () => {
    const saleRecord = voucher({
      id: "sale-released",
      voucherType: VoucherEntryType.SALES,
      documentKind: null,
      inventoryItems: [{
        id: "sale-released-line",
        inventoryItemId: "finished-good-1",
        warehouseId: "warehouse-1",
        manufacturingInventoryLotId: "released-lot",
        manufacturingSerialIds: ["released-serial"],
        itemName: "Manufactured Fridge",
        quantity: 1,
        unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "FG-R Warehouse", allowSales: true, isActive: true, deletedAt: null },
        inventoryItem: { id: "finished-good-1", kind: "PRODUCT", unit: "pcs", openingRate: 100, manufacturingProfile: manufacturedFinishedGoodProfile },
      }],
    });
    const { tx, creates } = fakeTx(5, 0, saleRecord);
    const releasedLot = {
      id: "released-lot",
      lotNumber: "FG-R-001",
      workspaceId: "workspace-1",
      inventoryItemId: "finished-good-1",
      warehouseId: "warehouse-1",
      locationId: "fg-r-location",
      receivedQuantity: 2,
      availableQuantity: 2,
      reservedQuantity: 0,
      holdQuantity: 0,
      rejectedQuantity: 0,
      location: {
        id: "fg-r-location",
        workspaceId: "workspace-1",
        warehouseId: "warehouse-1",
        disposition: ManufacturingLocationDisposition.RELEASED,
        isActive: true,
      },
    };
    tx.manufacturingInventoryLot.findFirst.mockResolvedValue(releasedLot as never);
    tx.manufacturingSerial.findMany.mockResolvedValue([{
      id: "released-serial",
      workspaceId: "workspace-1",
      inventoryItemId: "finished-good-1",
      inventoryLotId: "released-lot",
      warehouseId: "warehouse-1",
      locationId: "fg-r-location",
      status: ManufacturingSerialStatus.RELEASED,
    }] as never);
    tx.manufacturingInventoryLot.updateMany.mockResolvedValue({ count: 1 } as never);
    tx.manufacturingSerial.updateMany.mockResolvedValue({ count: 1 } as never);
    creates.push({
      id: "fg-release-receipt",
      tenantId: "tenant-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      warehouseId: "warehouse-1",
      inventoryItemId: "finished-good-1",
      transactionType: "QA_RELEASE_TRANSFER",
      transactionId: "qa-release-1",
      transactionLineId: "qa-release-line",
      movementType: StockMovementType.IN,
      quantity: 2,
      unit: "pcs",
      inputUnitCost: 100,
      reversalOfId: null,
      transactionDate: new Date("2026-08-01T00:00:00.000Z"),
      createdAt: new Date("2026-08-01T01:00:00.000Z"),
    });

    await service.postVoucherMovements(tx as never, "sale-released", "user-1");

    expect(tx.manufacturingInventoryLot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { availableQuantity: { decrement: expect.anything() } },
    }));
    expect(tx.manufacturingSerial.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ManufacturingSerialStatus.CONSUMED }),
    }));
    expect(creates).toEqual(expect.arrayContaining([
      expect.objectContaining({ transactionLineId: "sale-released-line", movementType: StockMovementType.OUT }),
    ]));
  });

  it("blocks over-sale and an atomic double-consume race on a released manufacturing lot", async () => {
    const saleRecord = voucher({
      id: "sale-race",
      voucherType: VoucherEntryType.SALES,
      documentKind: null,
      inventoryItems: [{
        id: "sale-race-line",
        inventoryItemId: "finished-good-1",
        warehouseId: "warehouse-1",
        manufacturingInventoryLotId: "released-lot",
        manufacturingSerialIds: ["released-serial"],
        itemName: "Manufactured Fridge",
        quantity: 1,
        unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "FG-R Warehouse", allowSales: true, isActive: true, deletedAt: null },
        inventoryItem: { id: "finished-good-1", kind: "PRODUCT", unit: "pcs", openingRate: 100, manufacturingProfile: manufacturedFinishedGoodProfile },
      }],
    });
    const { tx } = fakeTx(5, 0, saleRecord);
    const releasedLot = {
      id: "released-lot",
      lotNumber: "FG-R-001",
      workspaceId: "workspace-1",
      inventoryItemId: "finished-good-1",
      warehouseId: "warehouse-1",
      locationId: "fg-r-location",
      receivedQuantity: 1,
      availableQuantity: 1,
      reservedQuantity: 0,
      holdQuantity: 0,
      rejectedQuantity: 0,
      location: { id: "fg-r-location", workspaceId: "workspace-1", warehouseId: "warehouse-1", disposition: ManufacturingLocationDisposition.RELEASED, isActive: true },
    };
    tx.manufacturingInventoryLot.findFirst
      .mockResolvedValueOnce({ ...releasedLot, availableQuantity: 0 } as never)
      .mockResolvedValue(releasedLot as never);
    tx.manufacturingSerial.findMany.mockResolvedValue([{
      id: "released-serial",
      workspaceId: "workspace-1",
      inventoryItemId: "finished-good-1",
      inventoryLotId: "released-lot",
      warehouseId: "warehouse-1",
      locationId: "fg-r-location",
      status: ManufacturingSerialStatus.RELEASED,
    }] as never);
    await expect(service.postVoucherMovements(tx as never, "sale-race", "user-1")).rejects.toThrow(
      "has 0 available",
    );

    // Another concurrent transaction won the compare-and-decrement first.
    tx.manufacturingInventoryLot.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(service.postVoucherMovements(tx as never, "sale-race", "user-1")).rejects.toThrow(
      "availability changed",
    );
    expect(tx.manufacturingSerial.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.upsert).not.toHaveBeenCalled();
  });

  it("restores only the exact source lot and consumed serial on a manufacturing sales return", async () => {
    const returnRecord = voucher({
      id: "return-manufactured",
      voucherType: VoucherEntryType.CREDIT_NOTE,
      documentKind: null,
      inventoryItems: [{
        id: "return-manufactured-line",
        sourceInventoryLineId: "source-sale-line",
        inventoryItemId: "finished-good-1",
        warehouseId: "warehouse-1",
        manufacturingInventoryLotId: "released-lot",
        manufacturingSerialIds: ["consumed-serial"],
        itemName: "Manufactured Fridge",
        quantity: 1,
        unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "FG-R Warehouse", allowSales: true, isActive: true, deletedAt: null },
        inventoryItem: { id: "finished-good-1", kind: "PRODUCT", unit: "pcs", openingRate: 100, manufacturingProfile: manufacturedFinishedGoodProfile },
      }],
    });
    const { tx, creates, ledgerLines, voucherRecords } = fakeTx(1, 1, returnRecord);
    voucherRecords.push({
      id: "source-sale",
      tenantId: "tenant-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      createdByUserId: "user-1",
      workflowOrigin: "DIRECT",
      voucherNumber: "SI-SOURCE",
      voucherDate: new Date("2026-08-11T00:00:00.000Z"),
      partyName: "Customer",
      currency: "BDT",
      fiscalYearId: null,
      branchId: null,
      warehouseId: "warehouse-1",
      status: VoucherEntryStatus.POSTED,
      sourceType: null,
      sourceId: null,
      reversalOfId: null,
      postingVersion: 1,
    });
    ledgerLines.push(
      { voucherId: "source-sale", accountId: "account-cogs", description: "Cost of goods sold — SI-SOURCE", costCenter: "INVENTORY_VALUATION", debit: 100, credit: 0 },
      { voucherId: "source-sale", accountId: "account-inventory", description: "Inventory issued — SI-SOURCE", costCenter: "INVENTORY_VALUATION", debit: 0, credit: 100 },
    );
    tx.voucherInventoryItem.findFirst.mockResolvedValue({
      id: "source-sale-line",
      inventoryItemId: "finished-good-1",
      warehouseId: "warehouse-1",
      quantity: 1,
      manufacturingInventoryLotId: "released-lot",
      manufacturingSerialIds: ["consumed-serial"],
      voucher: { voucherType: VoucherEntryType.SALES, status: VoucherEntryStatus.POSTED },
    } as never);
    tx.manufacturingInventoryLot.findFirst.mockResolvedValue({
      id: "released-lot",
      lotNumber: "FG-R-001",
      workspaceId: "workspace-1",
      inventoryItemId: "finished-good-1",
      warehouseId: "warehouse-1",
      locationId: "fg-r-location",
      receivedQuantity: 1,
      availableQuantity: 0,
      reservedQuantity: 0,
      holdQuantity: 0,
      rejectedQuantity: 0,
      location: {
        id: "fg-r-location",
        workspaceId: "workspace-1",
        warehouseId: "warehouse-1",
        disposition: ManufacturingLocationDisposition.RELEASED,
        isActive: true,
      },
    } as never);
    tx.manufacturingSerial.findMany.mockResolvedValue([{
      id: "consumed-serial",
      workspaceId: "workspace-1",
      inventoryItemId: "finished-good-1",
      inventoryLotId: "released-lot",
      warehouseId: "warehouse-1",
      locationId: "fg-r-location",
      status: ManufacturingSerialStatus.CONSUMED,
    }] as never);
    tx.manufacturingInventoryLot.updateMany.mockResolvedValue({ count: 1 } as never);
    tx.manufacturingSerial.updateMany.mockResolvedValue({ count: 1 } as never);
    tx.voucherInventoryItem.findMany.mockResolvedValue([
      {
        id: "source-sale-line",
        voucherId: "source-sale",
        inventoryItemId: "finished-good-1",
        warehouseId: "warehouse-1",
        itemName: "Manufactured Fridge",
        quantity: 1,
        unitPrice: 500,
        sourceInventoryLineId: null,
        createdAt: new Date("2026-08-11T01:00:00.000Z"),
        voucher: { sourceVoucherId: null, discountAmount: 0 },
      },
      {
        id: "return-manufactured-line",
        voucherId: "return-manufactured",
        inventoryItemId: "finished-good-1",
        warehouseId: "warehouse-1",
        itemName: "Manufactured Fridge",
        quantity: 1,
        unitPrice: 500,
        sourceInventoryLineId: "source-sale-line",
        createdAt: new Date("2026-08-12T01:00:00.000Z"),
        voucher: { sourceVoucherId: "source-sale", discountAmount: 0 },
      },
    ] as never);
    creates.push(
      {
        id: "fg-opening",
        tenantId: "tenant-1",
        companyId: "company-1",
        workspaceId: "workspace-1",
        warehouseId: "warehouse-1",
        inventoryItemId: "finished-good-1",
        transactionType: "OPENING_STOCK",
        transactionId: "fg-opening",
        transactionLineId: "fg-opening-line",
        movementType: StockMovementType.IN,
        quantity: 1,
        unit: "pcs",
        inputUnitCost: 100,
        reversalOfId: null,
        transactionDate: new Date("2026-08-10T00:00:00.000Z"),
        createdAt: new Date("2026-08-10T01:00:00.000Z"),
      },
      {
        id: "source-sale-movement",
        tenantId: "tenant-1",
        companyId: "company-1",
        workspaceId: "workspace-1",
        warehouseId: "warehouse-1",
        inventoryItemId: "finished-good-1",
        transactionType: "SALES",
        transactionId: "source-sale",
        transactionLineId: "source-sale-line",
        movementType: StockMovementType.OUT,
        quantity: 1,
        unit: "pcs",
        inputUnitCost: null,
        reversalOfId: null,
        transactionDate: new Date("2026-08-11T00:00:00.000Z"),
        createdAt: new Date("2026-08-11T01:00:00.000Z"),
      },
    );

    await service.postVoucherMovements(tx as never, "return-manufactured", "user-1");

    expect(tx.manufacturingInventoryLot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { availableQuantity: { increment: expect.anything() } },
    }));
    expect(tx.manufacturingSerial.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: ManufacturingSerialStatus.CONSUMED }),
      data: { status: ManufacturingSerialStatus.RELEASED, consumedAt: null },
    }));
  });

  it("restores a reversed manufacturing sale exactly once when reversal is retried", async () => {
    const saleRecord = voucher({
      id: "sale-to-reverse",
      voucherType: VoucherEntryType.SALES,
      documentKind: null,
      inventoryItems: [{
        id: "sale-to-reverse-line",
        inventoryItemId: "finished-good-1",
        warehouseId: "warehouse-1",
        manufacturingInventoryLotId: "released-lot",
        manufacturingSerialIds: ["consumed-serial"],
        itemName: "Manufactured Fridge",
        quantity: 1,
        unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "FG-R Warehouse", allowSales: true, isActive: true, deletedAt: null },
        inventoryItem: { id: "finished-good-1", kind: "PRODUCT", unit: "pcs", openingRate: 100, manufacturingProfile: manufacturedFinishedGoodProfile },
      }],
    });
    const { tx, creates } = fakeTx(1, 1, saleRecord);
    creates.push({
      id: "fg-opening",
      tenantId: "tenant-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      warehouseId: "warehouse-1",
      inventoryItemId: "finished-good-1",
      transactionType: "OPENING_STOCK",
      transactionId: "fg-opening",
      transactionLineId: "fg-opening-line",
      referenceNo: "OPENING",
      movementType: StockMovementType.IN,
      quantity: 1,
      unit: "pcs",
      unitConversion: 1,
      inputUnitCost: 100,
      reversalOfId: null,
      voidedAt: null,
      transactionDate: new Date("2026-08-11T00:00:00.000Z"),
      createdAt: new Date("2026-08-11T01:00:00.000Z"),
    }, {
      id: "sale-stock-movement",
      tenantId: "tenant-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      warehouseId: "warehouse-1",
      inventoryItemId: "finished-good-1",
      transactionType: "SALES",
      transactionId: "sale-to-reverse",
      transactionLineId: "sale-to-reverse-line",
      referenceNo: "SI-0001",
      movementType: StockMovementType.OUT,
      quantity: 1,
      unit: "pcs",
      unitConversion: 1,
      inputUnitCost: null,
      reversalOfId: null,
      voidedAt: null,
      transactionDate: new Date("2026-08-12T00:00:00.000Z"),
      createdAt: new Date("2026-08-12T01:00:00.000Z"),
    });
    tx.voucherInventoryItem.findMany.mockResolvedValue([{
      id: "sale-to-reverse-line",
      inventoryItemId: "finished-good-1",
      warehouseId: "warehouse-1",
      sourceInventoryLineId: null,
      manufacturingInventoryLotId: "released-lot",
      manufacturingSerialIds: ["consumed-serial"],
      itemName: "Manufactured Fridge",
      quantity: 1,
      inventoryItem: { id: "finished-good-1", unit: "pcs", manufacturingProfile: manufacturedFinishedGoodProfile },
      voucher: { voucherType: VoucherEntryType.SALES },
    }] as never);
    tx.manufacturingInventoryLot.findFirst.mockResolvedValue({
      id: "released-lot",
      lotNumber: "FG-R-001",
      workspaceId: "workspace-1",
      inventoryItemId: "finished-good-1",
      warehouseId: "warehouse-1",
      locationId: "fg-r-location",
      receivedQuantity: 1,
      availableQuantity: 0,
      reservedQuantity: 0,
      holdQuantity: 0,
      rejectedQuantity: 0,
      location: {
        id: "fg-r-location",
        workspaceId: "workspace-1",
        warehouseId: "warehouse-1",
        disposition: ManufacturingLocationDisposition.RELEASED,
        isActive: true,
      },
    } as never);
    tx.manufacturingSerial.findMany.mockResolvedValue([{
      id: "consumed-serial",
      workspaceId: "workspace-1",
      inventoryItemId: "finished-good-1",
      inventoryLotId: "released-lot",
      warehouseId: "warehouse-1",
      locationId: "fg-r-location",
      status: ManufacturingSerialStatus.CONSUMED,
    }] as never);
    tx.manufacturingInventoryLot.updateMany.mockResolvedValue({ count: 1 } as never);
    tx.manufacturingSerial.updateMany.mockResolvedValue({ count: 1 } as never);

    await service.reverseVoucherMovements(tx as never, "sale-to-reverse", "user-1");
    await service.reverseVoucherMovements(tx as never, "sale-to-reverse", "user-1");

    expect(tx.manufacturingInventoryLot.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.manufacturingSerial.updateMany).toHaveBeenCalledTimes(1);
    expect(creates.filter((movement) => movement.reversalOfId === "sale-stock-movement")).toHaveLength(1);
  });

  it("posts the mirror Inventory Control / Cost of Goods Sold entry for a sales return, at the original sale's cost", async () => {
    const returnRecord = voucher({
      id: "return-1", voucherType: VoucherEntryType.CREDIT_NOTE, documentKind: null,
      inventoryItems: [{
        id: "return-line-1", inventoryItemId: "item-1", warehouseId: "warehouse-1", itemName: "Phone", quantity: 1, unitPrice: 500,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
        inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs", openingRate: 100 },
      }],
    });
    const { tx, creates } = fakeTx(10, 0, returnRecord);
    seedOpeningPurchase(creates);

    await service.postVoucherMovements(tx as never, "return-1", "user-1");

    expect(tx.voucherEntryLine.createMany).toHaveBeenCalledTimes(1);
    const [{ data: ledgerLines }] = tx.voucherEntryLine.createMany.mock.calls[0] as [{ data: Array<Record<string, unknown>> }];
    expect(ledgerLines).toEqual([
      expect.objectContaining({ voucherId: "return-1", accountId: "account-inventory", ledger: "Inventory Control", debit: 100, credit: 0 }),
      expect.objectContaining({ voucherId: "return-1", accountId: "account-cogs", ledger: "Cost of Goods Sold", debit: 0, credit: 100 }),
    ]);
  });

  it("posts each Receipt Note product to its own line warehouse", async () => {
    const record = voucher({
      inventoryItems: [
        { id: "fridge-line", inventoryItemId: "fridge", warehouseId: "fridge-warehouse", itemName: "Fridge", quantity: 2, warehouse: { id: "fridge-warehouse", workspaceId: "workspace-1", name: "Fridge Warehouse", isActive: true, deletedAt: null }, inventoryItem: { id: "fridge", kind: "PRODUCT", unit: "pcs" } },
        { id: "tv-line", inventoryItemId: "tv", warehouseId: "tv-warehouse", itemName: "Television", quantity: 3, warehouse: { id: "tv-warehouse", workspaceId: "workspace-1", name: "Television Warehouse", isActive: true, deletedAt: null }, inventoryItem: { id: "tv", kind: "PRODUCT", unit: "pcs" } },
      ],
    });
    const { tx, creates } = fakeTx(0, 0, record);
    await service.postVoucherMovements(tx as never, "voucher-1", "user-1");
    expect(creates).toHaveLength(2);
    expect(creates).toEqual(expect.arrayContaining([
      expect.objectContaining({ inventoryItemId: "fridge", warehouseId: "fridge-warehouse", quantity: 2 }),
      expect.objectContaining({ inventoryItemId: "tv", warehouseId: "tv-warehouse", quantity: 3 }),
    ]));
  });

  it("revalues the exact Receipt Note line without posting Purchase Bill quantity twice", async () => {
    const record = voucher({
      id: "bill-1",
      documentKind: "bill",
      sourceVoucherId: "receipt-1",
      voucherNumber: "PB-0001",
      debit: 1_250,
      credit: 1_250,
      inventoryItems: [{
        id: "bill-line-1", inventoryItemId: "item-1", warehouseId: "warehouse-1", sourceInventoryLineId: "receipt-line-1",
        itemName: "Phone", quantity: 10, unitPrice: 125,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
        inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs", openingRate: 100 },
      }],
    });
    const { tx, creates, ledgerLines, voucherRecords } = fakeTx(0, 0, record);
    tx.voucherEntry.findUnique.mockResolvedValue({ documentKind: "receipt-note" } as never);
    tx.voucherInventoryItem.findFirst.mockResolvedValue({
      id: "receipt-line-1",
      inventoryItemId: "item-1",
      warehouseId: "warehouse-1",
      sourceInventoryLineId: null,
      voucher: { status: "POSTED", documentKind: "receipt-note" },
    } as never);
    creates.push({
      id: "receipt-movement-1", tenantId: "tenant-1", companyId: "company-1", workspaceId: "workspace-1",
      warehouseId: "warehouse-1", inventoryItemId: "item-1", transactionType: "RECEIPT_NOTE",
      transactionId: "receipt-1", transactionLineId: "receipt-line-1", referenceNo: "RN-0001",
      movementType: StockMovementType.IN, quantity: 10, unit: "pcs", inputUnitCost: 100,
      unitCost: 100, movementValue: 1000, balanceQuantity: 10, balanceValue: 1000, averageCost: 100,
      costingVersion: 2, reversalOfId: null, transactionDate: new Date("2026-08-11T00:00:00.000Z"),
      createdAt: new Date("2026-08-11T01:00:00.000Z"),
    });

    await service.postVoucherMovements(tx as never, "bill-1", "user-1");

    expect(tx.stockMovement.upsert).not.toHaveBeenCalled();
    expect(tx.inventoryCostRevaluation.upsert).toHaveBeenCalledTimes(1);
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ transactionId: "receipt-1", quantity: 10 });
    expect(ledgerLines.filter((line) => line.voucherId === "bill-1")).toEqual([
      expect.objectContaining({ accountId: "account-inventory", debit: 250, credit: 0, costCenter: "PURCHASE_COST_VARIANCE" }),
      expect.objectContaining({ accountId: "account-purchase-pending", debit: 0, credit: 250, costCenter: "PURCHASE_COST_VARIANCE" }),
    ]);
    expect(voucherRecords.find((entry) => entry.id === "bill-1")).toMatchObject({ debit: 1_500, credit: 1_500 });
  });

  it("sums exact partial variances across multiple Receipt Notes and remains idempotent", async () => {
    const record = voucher({
      id: "bill-multi-grn",
      documentKind: "bill",
      sourceVoucherId: "receipt-a",
      voucherNumber: "PB-MULTI-GRN",
      debit: 660,
      credit: 660,
      inventoryItems: [
        {
          id: "bill-line-a", inventoryItemId: "item-a", warehouseId: "warehouse-1", sourceInventoryLineId: "receipt-line-a",
          itemName: "Phone", quantity: 4, unitPrice: 130,
          warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
          inventoryItem: { id: "item-a", kind: "PRODUCT", unit: "pcs", openingRate: 100 },
        },
        {
          id: "bill-line-b", inventoryItemId: "item-b", warehouseId: "warehouse-1", sourceInventoryLineId: "receipt-line-b",
          itemName: "Television", quantity: 2, unitPrice: 70,
          warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
          inventoryItem: { id: "item-b", kind: "PRODUCT", unit: "pcs", openingRate: 80 },
        },
      ],
    });
    const { tx, creates, ledgerLines, voucherRecords } = fakeTx(0, 0, record);
    tx.voucherEntry.findUnique.mockResolvedValue({ documentKind: "receipt-note" } as never);
    tx.voucherInventoryItem.findFirst.mockImplementation((async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      inventoryItemId: where.id === "receipt-line-a" ? "item-a" : "item-b",
      warehouseId: "warehouse-1",
      sourceInventoryLineId: null,
      voucher: { status: "POSTED", documentKind: "receipt-note" },
    })) as never);
    creates.push(
      {
        id: "receipt-movement-a", tenantId: "tenant-1", companyId: "company-1", workspaceId: "workspace-1",
        warehouseId: "warehouse-1", inventoryItemId: "item-a", transactionType: "RECEIPT_NOTE",
        transactionId: "receipt-a", transactionLineId: "receipt-line-a", referenceNo: "RN-A",
        movementType: StockMovementType.IN, quantity: 10, unit: "pcs", inputUnitCost: 100,
        unitCost: 100, movementValue: 1_000, balanceQuantity: 10, balanceValue: 1_000, averageCost: 100,
        costingVersion: 2, reversalOfId: null, transactionDate: new Date("2026-08-10T00:00:00.000Z"),
        createdAt: new Date("2026-08-10T01:00:00.000Z"),
      },
      {
        id: "receipt-movement-b", tenantId: "tenant-1", companyId: "company-1", workspaceId: "workspace-1",
        warehouseId: "warehouse-1", inventoryItemId: "item-b", transactionType: "RECEIPT_NOTE",
        transactionId: "receipt-b", transactionLineId: "receipt-line-b", referenceNo: "RN-B",
        movementType: StockMovementType.IN, quantity: 5, unit: "pcs", inputUnitCost: 80,
        unitCost: 80, movementValue: 400, balanceQuantity: 5, balanceValue: 400, averageCost: 80,
        costingVersion: 2, reversalOfId: null, transactionDate: new Date("2026-08-11T00:00:00.000Z"),
        createdAt: new Date("2026-08-11T01:00:00.000Z"),
      },
    );

    await service.postVoucherMovements(tx as never, "bill-multi-grn", "user-1");
    await service.postVoucherMovements(tx as never, "bill-multi-grn", "user-1");

    expect(tx.inventoryCostRevaluation.upsert).toHaveBeenCalledTimes(4);
    const firstPass = tx.inventoryCostRevaluation.upsert.mock.calls.slice(0, 2).map((call) =>
      Number((call[0] as unknown as { create: { varianceAmount: unknown } }).create.varianceAmount),
    );
    expect(firstPass).toEqual([120, -20]);
    expect(tx.voucherEntryLine.createMany).toHaveBeenCalledTimes(1);
    expect(tx.voucherEntry.update).toHaveBeenCalledTimes(1);
    expect(ledgerLines.filter((line) => line.voucherId === "bill-multi-grn")).toEqual([
      expect.objectContaining({ accountId: "account-inventory", debit: 100, credit: 0 }),
      expect.objectContaining({ accountId: "account-purchase-pending", debit: 0, credit: 100 }),
    ]);
    expect(voucherRecords.find((entry) => entry.id === "bill-multi-grn")).toMatchObject({ debit: 760, credit: 760 });
  });

  it("reverses the Inventory/Purchase Bill Pending pair when the billed receipt cost decreases", async () => {
    const record = voucher({
      id: "bill-cost-decrease",
      documentKind: "bill",
      sourceVoucherId: "receipt-decrease",
      voucherNumber: "PB-COST-DECREASE",
      inventoryItems: [{
        id: "bill-line-decrease", inventoryItemId: "item-1", warehouseId: "warehouse-1", sourceInventoryLineId: "receipt-line-decrease",
        itemName: "Phone", quantity: 5, unitPrice: 90,
        warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null },
        inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs", openingRate: 100 },
      }],
    });
    const { tx, creates, ledgerLines } = fakeTx(0, 0, record);
    tx.voucherEntry.findUnique.mockResolvedValue({ documentKind: "receipt-note" } as never);
    tx.voucherInventoryItem.findFirst.mockResolvedValue({
      id: "receipt-line-decrease",
      inventoryItemId: "item-1",
      warehouseId: "warehouse-1",
      sourceInventoryLineId: null,
      voucher: { status: "POSTED", documentKind: "receipt-note" },
    } as never);
    creates.push({
      id: "receipt-movement-decrease", tenantId: "tenant-1", companyId: "company-1", workspaceId: "workspace-1",
      warehouseId: "warehouse-1", inventoryItemId: "item-1", transactionType: "RECEIPT_NOTE",
      transactionId: "receipt-decrease", transactionLineId: "receipt-line-decrease", referenceNo: "RN-DECREASE",
      movementType: StockMovementType.IN, quantity: 5, unit: "pcs", inputUnitCost: 100,
      unitCost: 100, movementValue: 500, balanceQuantity: 5, balanceValue: 500, averageCost: 100,
      costingVersion: 2, reversalOfId: null, transactionDate: new Date("2026-08-11T00:00:00.000Z"),
      createdAt: new Date("2026-08-11T01:00:00.000Z"),
    });

    await service.postVoucherMovements(tx as never, "bill-cost-decrease", "user-1");

    expect(ledgerLines.filter((line) => line.voucherId === "bill-cost-decrease")).toEqual([
      expect.objectContaining({ accountId: "account-purchase-pending", debit: 50, credit: 0 }),
      expect.objectContaining({ accountId: "account-inventory", debit: 0, credit: 50 }),
    ]);
  });

  it("deducts only from the selected warehouse and blocks insufficient stock", async () => {
    const record = voucher({ voucherType: VoucherEntryType.SALES, documentKind: "delivery-note", inventoryItems: [{ id: "line-1", inventoryItemId: "item-1", warehouseId: "warehouse-1", itemName: "Phone", quantity: 5, warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null }, inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs" } }] });
    const { tx } = fakeTx(4, 0, record);
    await expect(service.postVoucherMovements(tx as never, "voucher-1", "user-1")).rejects.toThrow("Insufficient stock in Mobile Warehouse. Available: 4, Required: 5.");
  });

  it("checks the combined quantity when duplicate rows use the same item and warehouse", async () => {
    const lineWarehouse = { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null };
    const item = { id: "item-1", kind: "PRODUCT", unit: "pcs" };
    const record = voucher({
      voucherType: VoucherEntryType.SALES,
      documentKind: "delivery-note",
      inventoryItems: [
        { id: "line-1", inventoryItemId: "item-1", warehouseId: "warehouse-1", itemName: "Phone", quantity: 3, warehouse: lineWarehouse, inventoryItem: item },
        { id: "line-2", inventoryItemId: "item-1", warehouseId: "warehouse-1", itemName: "Phone", quantity: 3, warehouse: lineWarehouse, inventoryItem: item },
      ],
    });
    const { tx } = fakeTx(5, 0, record);
    await expect(service.postVoucherMovements(tx as never, "voucher-1", "user-1")).rejects.toThrow("Insufficient stock in Mobile Warehouse. Available: 5, Required: 6.");
  });

  it("blocks a backdated sale that is only covered by a later receipt", async () => {
    const record = voucher({
      voucherType: VoucherEntryType.SALES,
      documentKind: "delivery-note",
      voucherDate: new Date("2026-01-05T00:00:00.000Z"),
      inventoryItems: [{ id: "sale-line", inventoryItemId: "item-1", warehouseId: "warehouse-1", itemName: "Phone", quantity: 5, unitPrice: 500, warehouse: { id: "warehouse-1", workspaceId: "workspace-1", name: "Mobile Warehouse", isActive: true, deletedAt: null }, inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs", openingRate: 0 } }],
    });
    // The aggregate pre-check sees 10 units, but all ten arrived after this sale's
    // transaction date. The chronological valuation guard must still reject it.
    const { tx, creates } = fakeTx(10, 0, record);
    creates.push({
      id: "future-receipt",
      tenantId: "tenant-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      warehouseId: "warehouse-1",
      inventoryItemId: "item-1",
      transactionType: "PURCHASE",
      transactionId: "future-purchase",
      transactionLineId: "future-purchase-line",
      movementType: StockMovementType.IN,
      quantity: 10,
      unit: "pcs",
      inputUnitCost: 100,
      transactionDate: new Date("2026-01-10T00:00:00.000Z"),
      createdAt: new Date("2026-01-10T01:00:00.000Z"),
      reversalOfId: null,
    });

    await expect(service.postVoucherMovements(tx as never, "voucher-1", "user-1")).rejects.toThrow(
      "historical warehouse stock negative",
    );
  });

  it("blocks reversing an inbound purchase when later issues leave too little stock", async () => {
    const rows: Array<Record<string, unknown>> = [
      {
        id: "purchase-movement", tenantId: "tenant-1", companyId: "company-1", workspaceId: "workspace-1",
        warehouseId: "warehouse-1", inventoryItemId: "item-1", transactionType: "PURCHASE",
        transactionId: "purchase-voucher", transactionLineId: "purchase-line", referenceNo: "PB-1",
        movementType: StockMovementType.IN, quantity: 10, unit: "pcs", unitConversion: null,
        inputUnitCost: 100, reversalOfId: null, transactionDate: new Date("2026-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T01:00:00.000Z"),
      },
      {
        id: "sale-movement", tenantId: "tenant-1", companyId: "company-1", workspaceId: "workspace-1",
        warehouseId: "warehouse-1", inventoryItemId: "item-1", transactionType: "SALES",
        transactionId: "sale-voucher", transactionLineId: "sale-line", referenceNo: "SI-1",
        movementType: StockMovementType.OUT, quantity: 8, unit: "pcs", unitConversion: null,
        inputUnitCost: null, reversalOfId: null, transactionDate: new Date("2026-01-02T00:00:00.000Z"),
        createdAt: new Date("2026-01-02T01:00:00.000Z"),
      },
    ];
    const movementKeys = new Set<string>();
    const tx = {
      workspace: { findUnique: vi.fn(async () => ({ companyId: "company-1" })) },
      accountingSettings: { findUnique: vi.fn(async () => ({ negativeStockPolicy: "BLOCKED" })) },
      voucherInventoryItem: { findMany: vi.fn(async () => []) },
      inventoryAdjustment: { findMany: vi.fn(async () => []) },
      inventoryCostRevaluation: { findMany: vi.fn(async () => []) },
      inventoryItem: { findMany: vi.fn(async () => [{ id: "item-1", openingRate: 0 }]) },
      stockMovement: {
        findMany: vi.fn(async ({ where }: { where: { transactionId?: string } }) =>
          where.transactionId ? rows.filter((row) => row.transactionId === where.transactionId && row.reversalOfId == null) : rows,
        ),
        upsert: vi.fn(async ({ where, create }: { where: { workspaceId_idempotencyKey: { idempotencyKey: string } }; create: Record<string, unknown> }) => {
          const key = where.workspaceId_idempotencyKey.idempotencyKey;
          if (!movementKeys.has(key)) {
            movementKeys.add(key);
            rows.push({ id: `reversal-${rows.length}`, createdAt: new Date("2026-08-15T01:00:00.000Z"), ...create });
          }
          return create;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const target = rows.find((row) => row.id === where.id);
          Object.assign(target!, data);
          return target;
        }),
      },
    };

    await expect(service.reverseVoucherMovements(tx as never, "purchase-voucher", "user-1")).rejects.toThrow(
      "historical warehouse stock negative",
    );
  });

  it("rejects a line warehouse from another workspace", async () => {
    const record = voucher({
      inventoryItems: [{ id: "line-1", inventoryItemId: "item-1", warehouseId: "foreign-warehouse", itemName: "Phone", quantity: 1, warehouse: { id: "foreign-warehouse", workspaceId: "workspace-2", name: "Foreign Warehouse", isActive: true, deletedAt: null }, inventoryItem: { id: "item-1", kind: "PRODUCT", unit: "pcs" } }],
    });
    const { tx } = fakeTx(0, 0, record);
    await expect(service.postVoucherMovements(tx as never, "voucher-1", "user-1")).rejects.toThrow("Select an active warehouse for Phone before posting this stock transaction");
  });

  it("never creates movements for service lines", async () => {
    const record = voucher({ inventoryItems: [{ id: "service-line", inventoryItemId: "service-1", warehouseId: null, itemName: "Installation", quantity: 3, warehouse: null, inventoryItem: { id: "service-1", kind: "SERVICE", unit: "hour" } }] });
    const { tx, creates } = fakeTx(0, 0, record);
    await service.postVoucherMovements(tx as never, "voucher-1", "user-1");
    expect(creates).toHaveLength(0);
  });
});

describe("InventoryService generic warehouse transfer manufacturing safety", () => {
  function harness(input: {
    wipWarehouseId?: string | null;
    activeLot?: Record<string, unknown> | null;
    activeSerial?: Record<string, unknown> | null;
  }) {
    const manufacturingSettingsFindFirst = vi
      .fn()
      .mockResolvedValue(
        input.wipWarehouseId === undefined
          ? null
          : { defaultWipWarehouseId: input.wipWarehouseId },
      );
    const manufacturingLotFindFirst = vi
      .fn()
      .mockResolvedValue(input.activeLot ?? null);
    const manufacturingSerialFindFirst = vi
      .fn()
      .mockResolvedValue(input.activeSerial ?? null);
    const service = new InventoryService(
      {} as never,
      {} as never,
    ) as unknown as {
      assertGenericTransferManufacturingSafety: (
        tx: unknown,
        workspaceId: string,
        companyId: string,
        fromWarehouseId: string,
        toWarehouseId: string,
        inventoryItemIds: string[],
      ) => Promise<void>;
    };
    const tx = {
      manufacturingSettings: { findFirst: manufacturingSettingsFindFirst },
      manufacturingInventoryLot: { findFirst: manufacturingLotFindFirst },
      manufacturingSerial: { findFirst: manufacturingSerialFindFirst },
    };
    const check = (fromWarehouseId: string, toWarehouseId: string) =>
      service.assertGenericTransferManufacturingSafety(
        tx,
        "workspace-1",
        "company-1",
        fromWarehouseId,
        toWarehouseId,
        ["item-1"],
      );
    return {
      check,
      manufacturingSettingsFindFirst,
      manufacturingLotFindFirst,
      manufacturingSerialFindFirst,
    };
  }

  it.each([
    ["warehouse-wip", "warehouse-general"],
    ["warehouse-general", "warehouse-wip"],
  ])(
    "blocks a generic transfer when configured WIP is endpoint %s -> %s",
    async (fromWarehouseId, toWarehouseId) => {
      const test = harness({ wipWarehouseId: "warehouse-wip" });

      await expect(
        test.check(fromWarehouseId, toWarehouseId),
      ).rejects.toThrow("configured WIP warehouse");
      expect(test.manufacturingSettingsFindFirst).toHaveBeenCalledWith({
        where: { workspaceId: "workspace-1", companyId: "company-1" },
        select: { defaultWipWarehouseId: true },
      });
      expect(test.manufacturingLotFindFirst).not.toHaveBeenCalled();
      expect(test.manufacturingSerialFindFirst).not.toHaveBeenCalled();
    },
  );

  it("blocks source stock represented by an active manufacturing lot", async () => {
    const test = harness({
      activeLot: {
        id: "lot-1",
        inventoryItemId: "item-1",
        lotNumber: "LOT-001",
      },
    });

    await expect(
      test.check("warehouse-source", "warehouse-destination"),
    ).rejects.toThrow("active manufacturing lot or serial records");
    expect(test.manufacturingLotFindFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        companyId: "company-1",
        warehouseId: "warehouse-source",
        inventoryItemId: { in: ["item-1"] },
        OR: [
          { availableQuantity: { gt: 0 } },
          { reservedQuantity: { gt: 0 } },
          { holdQuantity: { gt: 0 } },
          { rejectedQuantity: { gt: 0 } },
        ],
      },
      select: { id: true, inventoryItemId: true, lotNumber: true },
    });
  });

  it("blocks source stock represented by an active manufacturing serial", async () => {
    const test = harness({
      activeSerial: {
        id: "serial-1",
        inventoryItemId: "item-1",
        serialNumber: "SER-001",
      },
    });

    await expect(
      test.check("warehouse-source", "warehouse-destination"),
    ).rejects.toThrow("active manufacturing lot or serial records");
    expect(test.manufacturingSerialFindFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        companyId: "company-1",
        warehouseId: "warehouse-source",
        inventoryItemId: { in: ["item-1"] },
        status: {
          in: [
            ManufacturingSerialStatus.CREATED,
            ManufacturingSerialStatus.QC_HOLD,
            ManufacturingSerialStatus.RELEASED,
            ManufacturingSerialStatus.REWORK,
          ],
        },
      },
      select: { id: true, inventoryItemId: true, serialNumber: true },
    });
  });

  it("allows ordinary non-WIP stock before manufacturing lot or serial registration", async () => {
    const test = harness({ wipWarehouseId: "warehouse-wip" });

    await expect(
      test.check("packaging-source", "raw-material-destination"),
    ).resolves.toBeUndefined();
    expect(test.manufacturingLotFindFirst).toHaveBeenCalledTimes(1);
    expect(test.manufacturingSerialFindFirst).toHaveBeenCalledTimes(1);
  });
});

describe("InventoryService startup valuation repair discovery", () => {
  it("includes already-current stock ledgers and active bill revaluation workspaces so legacy missing GL is repaired", async () => {
    const stockMovementFindMany = vi.fn(async () => []);
    const revaluationFindMany = vi.fn(async () => [{ workspaceId: "historical-bill-workspace" }]);
    const transaction = vi.fn(async () => undefined);
    const service = new InventoryService({
      stockMovement: { findMany: stockMovementFindMany },
      inventoryCostRevaluation: { findMany: revaluationFindMany },
      $transaction: transaction,
    } as never, {} as never);

    await service.onApplicationBootstrap();

    expect(stockMovementFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        voidedAt: null,
        OR: expect.arrayContaining([
          expect.objectContaining({ costingVersion: expect.any(Object) }),
          expect.objectContaining({
            transactionType: {
              in: expect.arrayContaining([
                "OPENING_STOCK",
                "MIGRATION_OPENING",
                "STOCK_ADJUSTMENT",
                "STOCK_ADJUSTMENT_REVERSAL",
                "DELIVERY_NOTE",
                "DELIVERY_NOTE_REVERSAL",
              ]),
            },
          }),
        ]),
      }),
      distinct: ["workspaceId"],
      select: { workspaceId: true },
    }));
    expect(revaluationFindMany).toHaveBeenCalledWith({
      where: { isActive: true },
      distinct: ["workspaceId"],
      select: { workspaceId: true },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe("InventoryService stock summary as-of reads", () => {
  it("uses the last persisted balance on or before the cutoff without rewriting costing", async () => {
    const update = vi.fn();
    const movements = [
      {
        id: "movement-july",
        warehouseId: "warehouse-1",
        inventoryItemId: "item-1",
        transactionType: "PURCHASE",
        transactionId: "purchase-july",
        transactionLineId: "line-july",
        movementType: StockMovementType.IN,
        quantity: 10,
        inputUnitCost: 100,
        unitCost: 100,
        movementValue: 1_000,
        balanceQuantity: 10,
        balanceValue: 1_000,
        averageCost: 100,
        costingVersion: 2,
        reversalOfId: null,
        costSourceMovementId: null,
        exactSourceUnitCost: null,
        transactionDate: new Date("2026-07-31T12:00:00.000Z"),
        createdAt: new Date("2026-07-31T12:00:00.000Z"),
      },
      {
        id: "movement-august",
        warehouseId: "warehouse-1",
        inventoryItemId: "item-1",
        transactionType: "PURCHASE",
        transactionId: "purchase-august",
        transactionLineId: "line-august",
        movementType: StockMovementType.IN,
        quantity: 5,
        inputUnitCost: 200,
        unitCost: 200,
        movementValue: 1_000,
        balanceQuantity: 15,
        balanceValue: 2_000,
        averageCost: 133.333333,
        costingVersion: 2,
        reversalOfId: null,
        costSourceMovementId: null,
        exactSourceUnitCost: null,
        transactionDate: new Date("2026-08-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ];
    const tx = {
      workspace: { findUnique: vi.fn(async () => ({ companyId: "company-1" })) },
      accountingSettings: {
        findUnique: vi.fn(async () => ({
          costingMethod: "MOVING_WEIGHTED_AVERAGE",
          negativeStockPolicy: "BLOCKED",
        })),
      },
      stockMovement: { findMany: vi.fn(async () => movements), update },
    };
    const prisma = {
      workspace: { findFirst: vi.fn(async () => ({ id: "workspace-1" })) },
      warehouse: {
        findMany: vi.fn(async () => [{ id: "warehouse-1", name: "Main Warehouse", code: "MAIN" }]),
      },
      inventoryItem: {
        findMany: vi.fn(async () => [{ id: "item-1", itemCode: "ITEM-1", itemName: "Item 1", category: "General", unit: "pcs" }]),
      },
      $transaction: vi.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    };
    const service = new InventoryService(prisma as never, {} as never);

    const result = await service.stockSummary(
      { id: "user-1", tenantId: "tenant-1", companyId: "company-1" } as never,
      "workspace-1",
      undefined,
      undefined,
      "2026-07-31",
    );

    expect(result).toEqual([
      expect.objectContaining({
        warehouseId: "warehouse-1",
        inventoryItemId: "item-1",
        quantity: 10,
        averageCost: 100,
        stockValue: 1_000,
      }),
    ]);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("InventoryService stock ledger dates", () => {
  it("includes the complete selected to-date", async () => {
    const ledgerFindMany = vi.fn(async (args: unknown) => {
      void args;
      return [];
    });
    const tx = {
      workspace: { findUnique: vi.fn(async () => ({ companyId: "company-1" })) },
      accountingSettings: {
        findUnique: vi.fn(async () => ({
          costingMethod: "MOVING_WEIGHTED_AVERAGE",
          negativeStockPolicy: "BLOCKED",
        })),
      },
      stockMovement: { findMany: vi.fn(async () => []) },
    };
    const prisma = {
      workspace: { findFirst: vi.fn(async () => ({ id: "workspace-1" })) },
      stockMovement: { findMany: ledgerFindMany },
      $transaction: vi.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    };
    const service = new InventoryService(prisma as never, {} as never);
    const currentUser = {
      id: "user-1",
      tenantId: "tenant-1",
      companyId: "company-1",
    } as never;

    await service.ledger(currentUser, "workspace-1", { from: "2026-07-01", to: "2026-07-31" });

    const args = ledgerFindMany.mock.calls[0]?.[0] as unknown as { where: { transactionDate: { gte: Date; lte: Date } } };
    expect(args.where.transactionDate.gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(args.where.transactionDate.lte.toISOString()).toBe("2026-07-31T23:59:59.999Z");
  });
});
