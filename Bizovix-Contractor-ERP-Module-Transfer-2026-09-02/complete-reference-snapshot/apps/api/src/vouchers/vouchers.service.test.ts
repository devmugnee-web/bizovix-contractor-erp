import { describe, expect, it, vi } from "vitest";
import { SettlementMode, TransactionWorkflowPolicy, VoucherEntryStatus, VoucherWorkflowOrigin } from "../generated/prisma/index.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { CreateVoucherDto } from "./dto/create-voucher.dto.js";
import { VouchersService } from "./vouchers.service.js";

interface WarehouseFixture {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  deletedAt: Date | null;
}

interface SourceInventoryLine {
  id: string;
  inventoryItemId: string | null;
  itemName: string;
  warehouseId: string | null;
  quantity?: number;
  unitPrice?: number;
}

interface SourceVoucherFixture {
  id: string;
  voucherNumber: string;
  documentKind: string;
  sourceVoucherId: string | null;
  status: VoucherEntryStatus;
  settlementMode: SettlementMode | null;
  warehouseId: string | null;
  inventoryItems: SourceInventoryLine[];
}

interface InventoryCreateInput {
  inventoryItemId: string | null;
  warehouseId: string | null;
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface LineCreateInput {
  accountId: string | null;
  ledger: string;
  description: string | null;
  debit: number;
  credit: number;
  costCenter: string | null;
  project: string | null;
  billReference: string | null;
}

const currentUser: AuthenticatedRequestUser = {
  id: "user-1",
  email: "tester@example.com",
  name: "Test User",
  initials: "TU",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

function purchaseDto(overrides: Partial<CreateVoucherDto> = {}): CreateVoucherDto {
  return {
    workspaceId: "workspace-1",
    voucherType: "purchase",
    documentKind: "receipt-note",
    voucherNumber: "GRN-2608-00101",
    voucherDate: "2026-08-12",
    partyName: "Supplier One",
    status: "draft",
    settlementMode: "accounts-payable",
    totalAmount: 288_000,
    lines: [
      { id: "debit", ledger: "Purchase Account", description: "Purchase", debit: 288_000, credit: 0 },
      { id: "credit", ledger: "Supplier One", description: "Payable", debit: 0, credit: 288_000 },
    ],
    inventoryItems: [
      { id: "product-fridge", itemName: "Fridge", quantity: 5, unitPrice: 52_000 },
      { id: "product-tv", itemName: "Television", quantity: 1, unitPrice: 28_000 },
    ],
    ...overrides,
  };
}

function buildHarness(options: {
  warehouses: WarehouseFixture[];
  sourceVouchers?: SourceVoucherFixture[];
  purchaseWorkflow?: TransactionWorkflowPolicy;
}) {
  const warehouseById = new Map(options.warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const sourceVoucherById = new Map((options.sourceVouchers ?? []).map((voucher) => [voucher.id, voucher]));
  let createdData: Record<string, unknown> | undefined;

  const voucherEntryCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    createdData = data;
    const inventoryRelation = data.inventoryItems as { create?: InventoryCreateInput[] } | undefined;
    const lineRelation = data.lines as { create: LineCreateInput[] };
    const rootWarehouseId = typeof data.warehouseId === "string" ? data.warehouseId : null;
    const rootWarehouse = rootWarehouseId ? warehouseById.get(rootWarehouseId) : null;

    return {
      ...data,
      id: "voucher-created",
      createdAt: new Date("2026-08-12T06:00:00.000Z"),
      updatedAt: new Date("2026-08-12T06:00:00.000Z"),
      currency: "BDT",
      warehouse: rootWarehouse ? { id: rootWarehouse.id, name: rootWarehouse.name, code: rootWarehouse.code } : null,
      inventoryItems: (inventoryRelation?.create ?? []).map((item, index) => {
        const lineWarehouse = item.warehouseId ? warehouseById.get(item.warehouseId) : null;
        return {
          ...item,
          id: `persisted-item-${index + 1}`,
          voucherId: "voucher-created",
          createdAt: new Date("2026-08-12T06:00:00.000Z"),
          updatedAt: new Date("2026-08-12T06:00:00.000Z"),
          inventoryItem: null,
          warehouse: lineWarehouse ? { id: lineWarehouse.id, name: lineWarehouse.name, code: lineWarehouse.code } : null,
        };
      }),
      lines: lineRelation.create.map((line, index) => ({
        ...line,
        id: `persisted-line-${index + 1}`,
        voucherId: "voucher-created",
        createdAt: new Date("2026-08-12T06:00:00.000Z"),
        updatedAt: new Date("2026-08-12T06:00:00.000Z"),
      })),
    };
  });

  const voucherEntryFindFirst = vi.fn(async (args: {
    where?: { id?: string; sourceVoucherId?: string };
  }) => {
    if (args.where?.sourceVoucherId) return null;
    return args.where?.id ? sourceVoucherById.get(args.where.id) ?? null : null;
  });

  const prisma = {
    workspaceMember: { findFirst: vi.fn(async () => ({ id: "membership-1" })) },
    workspace: { findUnique: vi.fn(async () => ({ id: "workspace-1", companyId: "company-1", tenantId: "tenant-1" })) },
    company: {
      findUnique: vi.fn(async () => ({
        purchaseWorkflow: options.purchaseWorkflow ?? TransactionWorkflowPolicy.BOTH,
        salesWorkflow: TransactionWorkflowPolicy.BOTH,
      })),
    },
    warehouse: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => options.warehouses.map(({ id, isActive, deletedAt }) => ({ id, isActive, deletedAt }))),
    },
    voucherEntry: {
      findFirst: voucherEntryFindFirst,
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const source = sourceVoucherById.get(where.id);
        return source
          ? {
              ...source,
              workspaceId: "workspace-1",
              voucherType: "PURCHASE",
              partyName: "Supplier One",
              voucherDate: new Date("2026-08-11"),
            }
          : null;
      }),
      findMany: vi.fn(async () => []),
      create: voucherEntryCreate,
    },
    voucherInventoryItem: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        const exists = [...sourceVoucherById.values()].some((voucher) =>
          voucher.inventoryItems.some((line) => line.id === where.id),
        );
        return exists ? { id: where.id } : null;
      }),
    },
    account: {
      findMany: vi.fn(async ({ where }: { where: { code?: { in: string[] }; id?: { in: string[] } } }) => {
        const codes = where.code?.in ?? [];
        if (codes.length) {
          return codes.map((code) => ({
            id: `system-account-${code}`,
            code,
            name: code === "1210001" ? "Inventory Control" : code === "2212001" ? "Purchase Bill Pending" : code,
          }));
        }
        return (where.id?.in ?? []).map((id) => id === "supplier-ledger"
          ? { id, code: "2211001", name: "Supplier One" }
          : {
              id,
              code: id.replace("system-account-", ""),
              name: id === "system-account-1210001" ? "Inventory Control" : id === "system-account-2212001" ? "Purchase Bill Pending" : id,
            });
      }),
    },
    party: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => ({
        id: "supplier-1",
        name: "Supplier One",
        type: "SUPPLIER",
        ledgerAccount: {
          id: "supplier-ledger",
          name: "Supplier One",
          companyId: "company-1",
          level: "LEDGER",
          status: "ACTIVE",
          accountGroup: { code: "AP" },
        },
      })),
    },
    inventoryItem: {
      findUnique: vi.fn(async ({ where }: { where: { workspaceId_itemName: { itemName: string } } }) => ({
        id: where.workspaceId_itemName.itemName === "Fridge" ? "product-fridge" : "product-tv",
      })),
      update: vi.fn(async () => ({})),
    },
  };
  const postingEngine = {
    assertDirectlySettable: vi.fn(),
    normalizeLines: vi.fn((lines: CreateVoucherDto["lines"]) => lines),
    assertBalanced: vi.fn(),
    assertPostableAccounts: vi.fn(async () => undefined),
  };
  const auditService = { log: vi.fn(async () => undefined) };
  const permissionsService = { getGrantedKeys: vi.fn(async () => ({ has: () => true })), resolveScope: vi.fn(() => "full") };
  const service = new VouchersService(prisma as never, postingEngine as never, auditService as never, permissionsService as never);

  return {
    service,
    prisma,
    createdData: () => createdData,
  };
}

function persistedInventoryItems(data: Record<string, unknown> | undefined) {
  const inventoryRelation = data?.inventoryItems as { create?: InventoryCreateInput[] } | undefined;
  return inventoryRelation?.create ?? [];
}

describe("VouchersService line warehouses", () => {
  it("persists a source-free Purchase Bill as DIRECT without replacing its balanced GL lines", async () => {
    const warehouses: WarehouseFixture[] = [
      { id: "warehouse-main", name: "Main Warehouse", code: "MAIN", isActive: true, deletedAt: null },
    ];
    const harness = buildHarness({ warehouses });
    const result = await harness.service.create(currentUser, purchaseDto({
      documentKind: "bill",
      voucherNumber: "PB-2608-00100",
      sourceVoucherId: undefined,
      warehouseId: "warehouse-main",
      totalAmount: 100,
      lines: [
        { id: "inventory", ledger: "Inventory Control", description: "Direct stock purchase", debit: 100, credit: 0 },
        { id: "supplier", ledger: "Supplier One", description: "Supplier payable", debit: 0, credit: 100 },
      ],
      inventoryItems: [
        { id: "product-fridge", itemName: "Fridge", quantity: 1, unitPrice: 100, warehouseId: "warehouse-main" },
      ],
    }));

    expect(harness.createdData()).toEqual(expect.objectContaining({
      workflowOrigin: VoucherWorkflowOrigin.DIRECT,
      sourceVoucherId: null,
    }));
    expect(result.workflowOrigin).toBe(VoucherWorkflowOrigin.DIRECT);
    expect(result.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: "system-account-1210001", ledger: "Inventory Control", debit: 100, credit: 0 }),
      expect.objectContaining({ accountId: "supplier-ledger", ledger: "Supplier One", debit: 0, credit: 100 }),
    ]));
  });

  it("rejects a new source-free Purchase Bill when the company is Order Based", async () => {
    const harness = buildHarness({
      warehouses: [{ id: "warehouse-main", name: "Main Warehouse", code: "MAIN", isActive: true, deletedAt: null }],
      purchaseWorkflow: TransactionWorkflowPolicy.ORDER_BASED,
    });

    await expect(harness.service.create(currentUser, purchaseDto({
      documentKind: "bill",
      sourceVoucherId: undefined,
      warehouseId: "warehouse-main",
    }))).rejects.toThrow("Purchase workflow is Order Based");
  });

  it("persists and serializes each Receipt Note item with its selected warehouse", async () => {
    const warehouses: WarehouseFixture[] = [
      { id: "warehouse-main", name: "Main Warehouse", code: "MAIN", isActive: true, deletedAt: null },
      { id: "warehouse-fridge", name: "Fridge Warehouse", code: "FRIDGE", isActive: true, deletedAt: null },
      { id: "warehouse-tv", name: "Television Warehouse", code: "TV", isActive: true, deletedAt: null },
    ];
    const purchaseOrder: SourceVoucherFixture = {
      id: "purchase-order-1",
      voucherNumber: "PO-2608-00101",
      documentKind: "purchase-order",
      sourceVoucherId: null,
      status: VoucherEntryStatus.POSTED,
      settlementMode: SettlementMode.ACCOUNTS_PAYABLE,
      warehouseId: "warehouse-main",
      inventoryItems: [
        { id: "po-fridge", inventoryItemId: "product-fridge", itemName: "Fridge", warehouseId: "warehouse-fridge", quantity: 5, unitPrice: 52_000 },
        { id: "po-tv", inventoryItemId: "product-tv", itemName: "Television", warehouseId: "warehouse-tv", quantity: 1, unitPrice: 28_000 },
      ],
    };
    const harness = buildHarness({ warehouses, sourceVouchers: [purchaseOrder] });
    const result = await harness.service.create(currentUser, purchaseDto({
      sourceVoucherId: "purchase-order-1",
      warehouseId: "warehouse-main",
      inventoryItems: [
        { id: "product-fridge", sourceInventoryLineId: "po-fridge", itemName: "Fridge", quantity: 5, unitPrice: 52_000, warehouseId: "warehouse-fridge" },
        { id: "product-tv", sourceInventoryLineId: "po-tv", itemName: "Television", quantity: 1, unitPrice: 28_000, warehouseId: "warehouse-tv" },
      ],
    }));

    expect(persistedInventoryItems(harness.createdData())).toEqual([
      expect.objectContaining({ inventoryItemId: "product-fridge", warehouseId: "warehouse-fridge", itemName: "Fridge" }),
      expect.objectContaining({ inventoryItemId: "product-tv", warehouseId: "warehouse-tv", itemName: "Television" }),
    ]);
    expect(result.inventoryItems).toEqual([
      expect.objectContaining({ warehouseId: "warehouse-fridge", warehouse: { id: "warehouse-fridge", name: "Fridge Warehouse", code: "FRIDGE" } }),
      expect.objectContaining({ warehouseId: "warehouse-tv", warehouse: { id: "warehouse-tv", name: "Television Warehouse", code: "TV" } }),
    ]);
  });

  it("inherits historical line warehouses for a Purchase Bill even after those warehouses are inactive", async () => {
    const warehouses: WarehouseFixture[] = [
      { id: "warehouse-main", name: "Main Warehouse", code: "MAIN", isActive: false, deletedAt: null },
      { id: "warehouse-fridge", name: "Fridge Warehouse", code: "FRIDGE", isActive: false, deletedAt: null },
      { id: "warehouse-tv", name: "Television Warehouse", code: "TV", isActive: false, deletedAt: null },
    ];
    const purchaseOrder: SourceVoucherFixture = {
      id: "purchase-order-1",
      voucherNumber: "PO-2608-00101",
      documentKind: "purchase-order",
      sourceVoucherId: null,
      status: VoucherEntryStatus.POSTED,
      settlementMode: SettlementMode.ACCOUNTS_PAYABLE,
      warehouseId: "warehouse-main",
      inventoryItems: [],
    };
    const receiptNote: SourceVoucherFixture = {
      id: "receipt-note-1",
      voucherNumber: "GRN-2608-00101",
      documentKind: "receipt-note",
      sourceVoucherId: "purchase-order-1",
      status: VoucherEntryStatus.POSTED,
      settlementMode: SettlementMode.ACCOUNTS_PAYABLE,
      warehouseId: "warehouse-main",
      inventoryItems: [
        { id: "source-fridge-line", inventoryItemId: "product-fridge", itemName: "Fridge", warehouseId: "warehouse-fridge" },
        { id: "source-tv-line", inventoryItemId: "product-tv", itemName: "Television", warehouseId: "warehouse-tv" },
      ],
    };
    const harness = buildHarness({ warehouses, sourceVouchers: [purchaseOrder, receiptNote] });
    const result = await harness.service.create(currentUser, purchaseDto({
      documentKind: "bill",
      voucherNumber: "PB-2608-00101",
      sourceVoucherId: "receipt-note-1",
      warehouseId: undefined,
      inventoryItems: [
        { id: "product-fridge", sourceInventoryLineId: "source-fridge-line", itemName: "Fridge", quantity: 5, unitPrice: 52_000 },
        { id: "product-tv", sourceInventoryLineId: "source-tv-line", itemName: "Television", quantity: 1, unitPrice: 28_000 },
      ],
    }));

    expect(persistedInventoryItems(harness.createdData()).map((item) => item.warehouseId)).toEqual([
      "warehouse-fridge",
      "warehouse-tv",
    ]);
    expect(result.warehouseId).toBe("warehouse-main");
    expect(result.inventoryItems.map((item) => item.warehouseId)).toEqual(["warehouse-fridge", "warehouse-tv"]);
    expect(harness.prisma.warehouse.findFirst).not.toHaveBeenCalled();
  });
});

describe("VouchersService inventory-line dependency deletion", () => {
  it("finds a secondary Delivery Note through the invoice line and deletes every line child-first", async () => {
    const inventoryLine = (id: string, sourceInventoryLineId: string | null) => ({
      id,
      voucherId: "",
      inventoryItemId: "item-1",
      warehouseId: "warehouse-1",
      sourceInventoryLineId,
      manufacturingInventoryLotId: null,
      manufacturingSerialIds: [],
      itemName: "Widget",
      quantity: 1,
      unitPrice: 10,
      lineTotal: 10,
      batchNumber: null,
      manufacturedAt: null,
      expiresAt: null,
      createdAt: new Date("2026-08-31T00:00:00.000Z"),
      updatedAt: new Date("2026-08-31T00:00:00.000Z"),
      inventoryItem: null,
      warehouse: null,
    });
    const voucher = (
      id: string,
      voucherNumber: string,
      documentKind: string,
      sourceVoucherId: string | null,
      item: ReturnType<typeof inventoryLine>,
    ) => ({
      id,
      tenantId: "tenant-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      createdByUserId: "user-1",
      voucherType: "SALES",
      documentKind,
      sourceVoucherId,
      workflowOrigin: VoucherWorkflowOrigin.ORDER_FLOW,
      voucherNumber,
      voucherDate: new Date("2026-08-31T00:00:00.000Z"),
      partyName: "Customer One",
      partyId: "customer-1",
      reference: null,
      narration: null,
      status: VoucherEntryStatus.DRAFT,
      settlementMode: null,
      paidAmount: null,
      supplierAddress: null,
      condition: null,
      buyerSignature: null,
      sellerSignature: null,
      attachmentImageUrl: null,
      attachmentDocumentUrl: null,
      attachmentDocumentName: null,
      discountType: null,
      discountAmount: null,
      roundOffAmount: null,
      loyaltyPointsEarned: 0,
      loyaltyPointsRedeemed: 0,
      loyaltyDiscountAmount: 0,
      subtotal: 10,
      totalAmount: 10,
      debit: 10,
      credit: 10,
      currency: "BDT",
      fiscalYearId: null,
      branchId: null,
      warehouseId: "warehouse-1",
      sourceType: null,
      sourceId: null,
      postingVersion: 1,
      approvedByUserId: null,
      approvedAt: null,
      postedAt: null,
      idempotencyKey: null,
      reversalOfId: null,
      revisionGroupId: null,
      previousRevisionId: null,
      createdAt: new Date("2026-08-31T00:00:00.000Z"),
      updatedAt: new Date("2026-08-31T00:00:00.000Z"),
      warehouse: null,
      lines: [],
      inventoryItems: [{ ...item, voucherId: id }],
    });
    const secondaryDelivery = voucher(
      "secondary-dn",
      "DN-SECONDARY",
      "delivery-note",
      "sales-order-2",
      inventoryLine("secondary-dn-line", null),
    );
    const invoice = voucher(
      "sales-invoice",
      "SI-1",
      "sales-invoice",
      "primary-dn",
      inventoryLine("invoice-line", "secondary-dn-line"),
    );
    const salesReturn = voucher(
      "sales-return",
      "SR-1",
      "sales-return",
      "sales-invoice",
      inventoryLine("return-line", "invoice-line"),
    );
    const findMany = vi.fn()
      .mockResolvedValueOnce([invoice])
      .mockResolvedValueOnce([salesReturn])
      .mockResolvedValueOnce([]);
    const inventoryDeleteBatches: string[][] = [];
    const deletedVoucherIds: string[] = [];
    const recycleCreate = vi.fn(async () => ({}));
    const prisma: Record<string, unknown> = {
      voucherEntry: {
        findMany,
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
          deletedVoucherIds.push(where.id);
          return {};
        }),
      },
      recycleBinEntry: { create: recycleCreate },
      stockMovement: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      inventoryCostRevaluation: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      voucherInventoryItem: {
        deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
          inventoryDeleteBatches.push(where.id.in);
          return { count: where.id.in.length };
        }),
      },
      voucherEntryLine: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    };
    prisma.$transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma));
    const auditService = { log: vi.fn(async () => undefined) };
    const service = new VouchersService(
      prisma as never,
      {} as never,
      auditService as never,
      {} as never,
    ) as unknown as {
      deleteVoucherWithDependencies(
        user: AuthenticatedRequestUser,
        root: typeof secondaryDelivery,
        workspaceId: string,
      ): Promise<unknown>;
    };

    await service.deleteVoucherWithDependencies(currentUser, secondaryDelivery, "workspace-1");

    expect(findMany.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{
          inventoryItems: { some: { sourceInventoryLineId: { in: ["secondary-dn-line"] } } },
        }]),
      }),
    }));
    expect(inventoryDeleteBatches).toEqual([
      ["return-line"],
      ["invoice-line"],
      ["secondary-dn-line"],
    ]);
    expect(deletedVoucherIds).toEqual(["sales-return", "sales-invoice", "secondary-dn"]);
    expect(recycleCreate).toHaveBeenCalledTimes(3);
  });
});
