import { describe, expect, it, vi } from "vitest";
import { VoucherEntryStatus, VoucherEntryType, VoucherWorkflowOrigin } from "../generated/prisma/index.js";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { CreateVoucherDto } from "./dto/create-voucher.dto.js";
import { VouchersService } from "./vouchers.service.js";

const currentUser: AuthenticatedRequestUser = {
  id: "user-1",
  email: "owner@example.com",
  name: "Owner",
  initials: "OW",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

/** These tests exercise voucher business logic, not the permission system —
 * stub it to always allow so existing scenarios keep testing what they were
 * written to test. */
const allowAllPermissions = {
  getGrantedKeys: vi.fn(async () => ({ has: () => true })),
  resolveScope: vi.fn(() => "full"),
};

function debitNoteDto(inventoryItems: CreateVoucherDto["inventoryItems"]): CreateVoucherDto {
  return {
    workspaceId: "workspace-1",
    voucherType: "debit-note",
    sourceVoucherId: "bill-1",
    voucherDate: "2026-08-15",
    partyName: "Supplier One",
    status: "pending",
    settlementMode: "accounts-payable",
    totalAmount: 700,
    inventoryItems,
    lines: [
      { id: "supplier", ledger: "Supplier One", description: "Payable reduced", debit: 700, credit: 0 },
      { id: "return", ledger: "Purchase Return", description: "Purchase return", debit: 0, credit: 700 },
    ],
  };
}

function inventoryLine(
  id: string,
  voucherId: string,
  quantity: number,
  sourceInventoryLineId: string | null,
) {
  return {
    id,
    voucherId,
    inventoryItemId: "item-1",
    warehouseId: "warehouse-1",
    sourceInventoryLineId,
    itemName: "Phone",
    quantity,
    unitPrice: 100,
    lineTotal: quantity * 100,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    inventoryItem: { id: "item-1", kind: "PRODUCT" },
    warehouse: { id: "warehouse-1" },
  };
}

function purchaseReturnHarness(options: {
  priorQuantity?: number;
  priorSourceLineId?: string;
  sourceStatus?: VoucherEntryStatus;
}) {
  const billLine = inventoryLine("bill-line", "bill-1", 10, "receipt-line");
  const receiptLine = inventoryLine("receipt-line", "receipt-1", 10, null);
  const lineageRows = new Map([
    [
      billLine.id,
      {
        ...billLine,
        voucher: {
          id: "bill-1",
          workspaceId: "workspace-1",
          voucherType: VoucherEntryType.PURCHASE,
          documentKind: "bill",
          sourceVoucherId: "receipt-1",
          warehouseId: "warehouse-1",
          status: VoucherEntryStatus.POSTED,
        },
      },
    ],
    [
      receiptLine.id,
      {
        ...receiptLine,
        voucher: {
          id: "receipt-1",
          workspaceId: "workspace-1",
          voucherType: VoucherEntryType.PURCHASE,
          documentKind: "receipt-note",
          sourceVoucherId: null,
          warehouseId: "warehouse-1",
          status: VoucherEntryStatus.POSTED,
        },
      },
    ],
  ]);
  const voucherFindMany = vi.fn(async () =>
    options.priorQuantity
      ? [
          {
            id: "return-previous",
            sourceVoucherId: "bill-1",
            inventoryItems: [
              {
                inventoryItemId: "item-1",
                sourceInventoryLineId: options.priorSourceLineId ?? "bill-line",
                itemName: "Phone",
                quantity: options.priorQuantity,
              },
            ],
          },
        ]
      : [],
  );
  const prisma = {
    voucherEntry: {
      findFirst: vi.fn(async () => ({
        id: "bill-1",
        workspaceId: "workspace-1",
        voucherType: VoucherEntryType.PURCHASE,
        documentKind: "bill",
        sourceVoucherId: "receipt-1",
        voucherNumber: "PB-2608-00001",
        voucherDate: new Date("2026-08-01T00:00:00.000Z"),
        partyName: "Supplier One",
        status: options.sourceStatus ?? VoucherEntryStatus.POSTED,
        warehouseId: "warehouse-1",
        totalAmount: 1_000,
        inventoryItems: [billLine],
        lines: [],
        warehouse: null,
      })),
      findMany: voucherFindMany,
    },
    voucherInventoryItem: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => lineageRows.get(id)).filter(Boolean),
      ),
    },
  };
  const service = new VouchersService(prisma as never, {} as never, {} as never, allowAllPermissions as never);
  const internals = service as unknown as {
    preparePurchaseReturn(dto: CreateVoucherDto, existingId?: string): Promise<void>;
  };
  return { internals, voucherFindMany };
}

describe("VouchersService purchase-return source hardening", () => {
  it("requires every returned inventory row to identify its source bill line", async () => {
    const { internals } = purchaseReturnHarness({});
    const dto = debitNoteDto([{ id: "row-1", itemName: "Phone", quantity: 1, unitPrice: 100 }]);

    await expect(internals.preparePurchaseReturn(dto)).rejects.toThrow("select the original Purchase Bill line");
  });

  it("requires the source Purchase Bill to be posted and prevents a backdated return", async () => {
    const approvedHarness = purchaseReturnHarness({ sourceStatus: VoucherEntryStatus.APPROVED });
    const approvedDto = debitNoteDto([
      { id: "row-1", sourceInventoryLineId: "bill-line", itemName: "Phone", quantity: 1, unitPrice: 100 },
    ]);
    approvedDto.totalAmount = 100;
    await expect(approvedHarness.internals.preparePurchaseReturn(approvedDto)).rejects.toThrow("posted Purchase Bill");

    const postedHarness = purchaseReturnHarness({});
    const backdatedDto = debitNoteDto([
      { id: "row-1", sourceInventoryLineId: "bill-line", itemName: "Phone", quantity: 1, unitPrice: 100 },
    ]);
    backdatedDto.voucherDate = "2026-07-31";
    backdatedDto.totalAmount = 100;
    await expect(postedHarness.internals.preparePurchaseReturn(backdatedDto)).rejects.toThrow(
      "cannot be earlier than the source Purchase Bill date",
    );
  });

  it("counts a previous live return linked to a Receipt Note ancestor", async () => {
    const { internals, voucherFindMany } = purchaseReturnHarness({
      priorQuantity: 4,
      priorSourceLineId: "receipt-line",
    });
    const dto = debitNoteDto([
      { id: "row-1", sourceInventoryLineId: "bill-line", itemName: "Phone", quantity: 7, unitPrice: 100 },
    ]);

    await expect(internals.preparePurchaseReturn(dto)).rejects.toThrow("maximum returnable quantity is 6");
    expect(voucherFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({
            notIn: expect.arrayContaining([VoucherEntryStatus.DRAFT, VoucherEntryStatus.REVERSED]),
          }),
        }),
      }),
    );
  });

  it("accepts the exact remaining quantity and preserves the bill-line link", async () => {
    const { internals } = purchaseReturnHarness({ priorQuantity: 4, priorSourceLineId: "receipt-line" });
    const dto = debitNoteDto([
      {
        id: "tampered-row-id",
        sourceInventoryLineId: "bill-line",
        itemName: "Phone",
        quantity: 6,
        unitPrice: 999,
        warehouseId: "tampered-warehouse",
      },
    ]);
    dto.totalAmount = 600;
    dto.lines[0]!.debit = 600;
    dto.lines[1]!.credit = 600;

    await internals.preparePurchaseReturn(dto);

    expect(dto.inventoryItems).toEqual([
      expect.objectContaining({
        id: "item-1",
        sourceInventoryLineId: "bill-line",
        itemName: "Phone",
        quantity: 6,
        unitPrice: 100,
        warehouseId: "warehouse-1",
      }),
    ]);
    expect(dto.lines).toEqual([
      expect.objectContaining({
        ledger: "Supplier One",
        debit: 600,
        credit: 0,
      }),
      expect.objectContaining({
        ledger: "Inventory Control",
        debit: 0,
        credit: 600,
      }),
    ]);
    expect(dto.lines.some((line) => line.ledger === "Purchase Return")).toBe(false);
  });

  it("keeps a verified Cash/Bank/MFS refund and credits Inventory Control", async () => {
    const { internals } = purchaseReturnHarness({});
    const dto = debitNoteDto([
      { id: "row-1", sourceInventoryLineId: "bill-line", itemName: "Phone", quantity: 1, unitPrice: 100 },
    ]);
    dto.totalAmount = 100;
    dto.settlementMode = "cash";
    dto.lines = [
      { id: "cash", accountId: "cash-1", moneyAccountType: "CASH", ledger: "Cash in Hand", description: "Cash refund", debit: 100, credit: 0 },
      { id: "return", ledger: "Purchase Return", description: "Purchase return", debit: 0, credit: 100 },
    ];

    await internals.preparePurchaseReturn(dto);

    expect(dto.paidAmount).toBe(100);
    expect(dto.lines).toEqual([
      expect.objectContaining({ accountId: "cash-1", ledger: "Cash in Hand", debit: 100, credit: 0 }),
      expect.objectContaining({ ledger: "Inventory Control", debit: 0, credit: 100 }),
    ]);
  });

  it("rejects a return total altered from the source bill's net item value", async () => {
    const { internals } = purchaseReturnHarness({});
    const dto = debitNoteDto([
      { id: "row-1", sourceInventoryLineId: "bill-line", itemName: "Phone", quantity: 1, unitPrice: 100 },
    ]);

    await expect(internals.preparePurchaseReturn(dto)).rejects.toThrow("Purchase Return total must be 100");
  });
});

describe("VouchersService purchase workflow lineage", () => {
  it("blocks changing a Purchase Order while its Receipt Note exists", async () => {
    const prisma = {
      voucherEntry: {
        findFirst: vi.fn(async () => ({ documentKind: "receipt-note", voucherNumber: "GRN-2608-00001" })),
      },
    };
    const service = new VouchersService(prisma as never, {} as never, {} as never, allowAllPermissions as never) as unknown as {
      assertPurchaseDocumentHasNoChild(
        entry: { id: string; workspaceId: string; voucherType: VoucherEntryType; documentKind: string; voucherNumber: string },
        operation: "edited",
      ): Promise<void>;
    };

    await expect(service.assertPurchaseDocumentHasNoChild({
      id: "po-1",
      workspaceId: "workspace-1",
      voucherType: VoucherEntryType.PURCHASE,
      documentKind: "purchase-order",
      voucherNumber: "PO-2608-00001",
    }, "edited")).rejects.toThrow("Delete the child document first");
  });

  it("allows the parent again after its child has been deleted", async () => {
    const prisma = { voucherEntry: { findFirst: vi.fn(async () => null) } };
    const service = new VouchersService(prisma as never, {} as never, {} as never, allowAllPermissions as never) as unknown as {
      assertPurchaseDocumentHasNoChild(
        entry: { id: string; workspaceId: string; voucherType: VoucherEntryType; documentKind: string },
        operation: "deleted",
      ): Promise<void>;
    };

    await expect(service.assertPurchaseDocumentHasNoChild({
      id: "receipt-1",
      workspaceId: "workspace-1",
      voucherType: VoucherEntryType.PURCHASE,
      documentKind: "receipt-note",
    }, "deleted")).resolves.toBeUndefined();
  });
});

describe("Delivery Challan source-order validation", () => {
  const sourceLine = {
    id: "order-line-1",
    inventoryItemId: "item-1",
    itemName: "Phone",
    quantity: 10,
    unitPrice: 150,
  };

  function buildService(sourceStatus: VoucherEntryStatus = VoucherEntryStatus.POSTED) {
    const findMany = vi.fn(async (): Promise<Array<{ inventoryItems: Array<{ sourceInventoryLineId: string; quantity: number }> }>> => []);
    const prisma = {
      voucherEntry: {
        findUnique: vi.fn(async () => ({
          id: "order-1",
          workspaceId: "workspace-1",
          documentKind: "sale-order",
          voucherNumber: "SO-001",
          voucherDate: new Date("2026-08-01T00:00:00.000Z"),
          partyName: "Customer One",
          status: sourceStatus,
          inventoryItems: [sourceLine],
        })),
        findMany,
      },
    };
    const service = new VouchersService(prisma as never, {} as never, {} as never, allowAllPermissions as never);
    return { service, findMany };
  }

  it("requires the exact order line and preserves its selling price", async () => {
    const { service } = buildService();
    const validate = (service as unknown as {
      assertDeliveryNoteAgainstSaleOrder(dto: CreateVoucherDto, items: Array<Record<string, unknown>>): Promise<void>;
    }).assertDeliveryNoteAgainstSaleOrder.bind(service);
    const dto = {
      workspaceId: "workspace-1",
      voucherType: "delivery-note",
      documentKind: "delivery-note",
      sourceVoucherId: "order-1",
      voucherDate: "2026-08-02",
      partyName: "Customer One",
      status: "pending",
      lines: [],
    } as CreateVoucherDto;

    await expect(validate(dto, [{
      inventoryItemId: "item-1",
      sourceInventoryLineId: "order-line-1",
      itemName: "Phone",
      quantity: 4,
      unitPrice: 999,
    }])).rejects.toThrow("price must match Sale Order SO-001");

    await expect(validate(dto, [{
      inventoryItemId: "item-1",
      sourceInventoryLineId: null,
      itemName: "Phone",
      quantity: 4,
      unitPrice: 150,
    }])).rejects.toThrow("select the exact Sale Order line");
  });

  it("reserves every active delivery against the exact source line", async () => {
    const { service, findMany } = buildService();
    findMany.mockResolvedValueOnce([{ inventoryItems: [{ sourceInventoryLineId: "order-line-1", quantity: 7 }] }]);
    const validate = (service as unknown as {
      assertDeliveryNoteAgainstSaleOrder(dto: CreateVoucherDto, items: Array<Record<string, unknown>>): Promise<void>;
    }).assertDeliveryNoteAgainstSaleOrder.bind(service);

    await expect(validate({
      workspaceId: "workspace-1",
      voucherType: "delivery-note",
      documentKind: "delivery-note",
      sourceVoucherId: "order-1",
      voucherDate: "2026-08-02",
      partyName: "Customer One",
      status: "pending",
      lines: [],
    } as CreateVoucherDto, [{
      inventoryItemId: "item-1",
      sourceInventoryLineId: "order-line-1",
      itemName: "Phone",
      quantity: 4,
      unitPrice: 150,
    }])).rejects.toThrow("only 3 more can be delivered");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: {
          notIn: expect.arrayContaining([
            VoucherEntryStatus.CANCELLED,
            VoucherEntryStatus.REVERSED,
          ]),
        },
      }),
    }));
  });

  it("requires a posted Sale Order for a new Delivery Note but permits an unchanged legacy source on edit", async () => {
    const { service } = buildService(VoucherEntryStatus.DRAFT);
    const validate = (service as unknown as {
      assertDeliveryNoteAgainstSaleOrder(
        dto: CreateVoucherDto,
        items: Array<Record<string, unknown>>,
        existingId?: string,
        existingSourceVoucherId?: string | null,
      ): Promise<void>;
    }).assertDeliveryNoteAgainstSaleOrder.bind(service);
    const input = {
      workspaceId: "workspace-1",
      voucherType: "delivery-note",
      documentKind: "delivery-note",
      sourceVoucherId: "order-1",
      voucherDate: "2026-08-02",
      partyName: "Customer One",
      status: "pending",
      lines: [],
    } as CreateVoucherDto;
    const items = [{
      inventoryItemId: "item-1",
      sourceInventoryLineId: "order-line-1",
      itemName: "Phone",
      quantity: 4,
      unitPrice: 150,
    }];

    await expect(validate(input, items)).rejects.toThrow("Sale Order SO-001 must be posted");
    await expect(validate(input, items, "delivery-existing", "order-1")).resolves.toBeUndefined();
  });
});

describe("VouchersService posted voucher hardening", () => {
  it.each([VoucherEntryStatus.POSTED, VoucherEntryStatus.APPROVED])(
    "deletes a %s voucher without creating a reversal",
    async (status) => {
      const findMany = vi.fn(async () => []);
      const transaction = vi.fn(async (callback) => callback({
        recycleBinEntry: { create: vi.fn() },
        stockMovement: { findMany: vi.fn(async () => []) },
        inventoryCostRevaluation: { deleteMany: vi.fn() },
        voucherInventoryItem: { deleteMany: vi.fn() },
        voucherEntryLine: { deleteMany: vi.fn() },
        voucherEntry: { delete: vi.fn() },
      }));
      const prisma = {
        voucherEntry: {
          findUnique: vi.fn(async () => ({
            id: "voucher-1",
            tenantId: "tenant-1",
            companyId: "company-1",
            workspaceId: "workspace-1",
            status,
            voucherNumber: "TXN-1",
            voucherType: VoucherEntryType.SALES,
            voucherDate: new Date("2026-08-15T00:00:00.000Z"),
            createdAt: new Date("2026-08-15T00:00:00.000Z"),
            partyName: "Customer One",
            totalAmount: 100,
            debit: 100,
            credit: 100,
            currency: "BDT",
            reference: null,
            settlementMode: null,
            inventoryItems: [],
            lines: [],
            warehouse: null,
          })),
          findMany,
        },
        workspaceMember: { findFirst: vi.fn(async () => ({ id: "membership-1" })) },
        $transaction: transaction,
      };
      const audit = { log: vi.fn() };
      const service = new VouchersService(prisma as never, {} as never, audit as never, allowAllPermissions as never);

      await service.remove(currentUser, "voucher-1", "workspace-1");

      expect(findMany).toHaveBeenCalled();
      expect(transaction).toHaveBeenCalledOnce();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "VOUCHER_DELETED" }));
    },
  );

  it("does not let an Owner edit a posted voucher that already moved stock", async () => {
    const repostVoucherMovements = vi.fn();
    const prisma = {
      voucherEntry: {
        findUnique: vi.fn(async () => ({
          id: "voucher-1",
          workspaceId: "workspace-1",
          voucherType: VoucherEntryType.PURCHASE,
          documentKind: "bill",
          sourceVoucherId: null,
          status: VoucherEntryStatus.POSTED,
        })),
      },
      workspaceMember: { findFirst: vi.fn(async () => ({ id: "membership-1" })) },
      tenantMember: { findFirst: vi.fn(async () => ({ id: "owner-membership" })) },
      stockMovement: { count: vi.fn(async () => 1) },
      inventoryCostRevaluation: { count: vi.fn(async () => 0) },
    };
    const service = new VouchersService(
      prisma as never,
      { repostVoucherMovements, assertEditable: vi.fn() } as never,
      {} as never,
      allowAllPermissions as never,
    );
    const dto = debitNoteDto(undefined);
    dto.voucherType = "purchase";
    dto.sourceVoucherId = undefined;

    await expect(service.update(currentUser, "voucher-1", dto)).rejects.toThrow(
      "posted stock-affecting voucher cannot be edited in place",
    );
    expect(repostVoucherMovements).not.toHaveBeenCalled();
  });
});

describe("VouchersService purchase workflow child identity", () => {
  const receiptDto = {
    workspaceId: "workspace-1",
    voucherType: "purchase",
    documentKind: "receipt-note",
    sourceVoucherId: "order-1",
    voucherDate: "2026-08-20",
    partyName: "Supplier One",
    status: "posted",
    lines: [],
  } as CreateVoucherDto;

  it("validates only the Purchase Order source before line-level partial receipt allocation", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ id: "order-1", voucherType: VoucherEntryType.PURCHASE, documentKind: "purchase-order", voucherNumber: "PO-1", sourceVoucherId: null, status: VoucherEntryStatus.POSTED });
    const service = new VouchersService({ voucherEntry: { findFirst } } as never, {} as never, {} as never, allowAllPermissions as never);
    const validate = (service as unknown as { validatePurchaseWorkflowLink(dto: CreateVoucherDto): Promise<void> }).validatePurchaseWorkflowLink.bind(service);

    await expect(validate({ ...receiptDto })).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "order-1",
        workspaceId: "workspace-1",
      }),
    }));
  });

  it("allows more than one Receipt Note because remaining quantities are checked per order line", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ id: "order-1", voucherType: VoucherEntryType.PURCHASE, documentKind: "purchase-order", voucherNumber: "PO-1", sourceVoucherId: null, status: VoucherEntryStatus.POSTED });
    const service = new VouchersService({ voucherEntry: { findFirst } } as never, {} as never, {} as never, allowAllPermissions as never);
    const validate = (service as unknown as { validatePurchaseWorkflowLink(dto: CreateVoucherDto): Promise<void> }).validatePurchaseWorkflowLink.bind(service);

    await expect(validate({ ...receiptDto })).resolves.toBeUndefined();
  });

  it.each([
    {
      label: "Receipt Note",
      sourceLabel: "Purchase Order",
      sourceKind: "purchase-order",
      input: { ...receiptDto },
    },
    {
      label: "Purchase Bill",
      sourceLabel: "Receipt Note",
      sourceKind: "receipt-note",
      input: { ...receiptDto, documentKind: "bill", sourceVoucherId: "receipt-1" },
    },
  ])("requires the source to be posted before creating a $label", async ({ sourceLabel, sourceKind, input }) => {
    const findFirst = vi.fn(async () => ({
      id: input.sourceVoucherId,
      voucherType: VoucherEntryType.PURCHASE,
      documentKind: sourceKind,
      voucherNumber: sourceKind === "purchase-order" ? "PO-DRAFT" : "GRN-DRAFT",
      sourceVoucherId: sourceKind === "receipt-note" ? "order-1" : null,
      status: VoucherEntryStatus.DRAFT,
    }));
    const service = new VouchersService({ voucherEntry: { findFirst } } as never, {} as never, {} as never, allowAllPermissions as never);
    const validate = (service as unknown as {
      validatePurchaseWorkflowLink(
        dto: CreateVoucherDto,
        origin: VoucherWorkflowOrigin,
        existingId?: string,
        existingSourceVoucherId?: string | null,
      ): Promise<void>;
    }).validatePurchaseWorkflowLink.bind(service);

    await expect(validate(input, VoucherWorkflowOrigin.ORDER_FLOW)).rejects.toThrow(
      `${sourceLabel} ${sourceKind === "purchase-order" ? "PO-DRAFT" : "GRN-DRAFT"} must be posted`,
    );
  });

  it("keeps an existing legacy Receipt Note editable when its unchanged source was not posted", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({
        id: "order-1",
        voucherType: VoucherEntryType.PURCHASE,
        documentKind: "purchase-order",
        voucherNumber: "PO-LEGACY",
        sourceVoucherId: null,
        status: VoucherEntryStatus.DRAFT,
      })
      .mockResolvedValueOnce(null);
    const service = new VouchersService({ voucherEntry: { findFirst } } as never, {} as never, {} as never, allowAllPermissions as never);
    const validate = (service as unknown as {
      validatePurchaseWorkflowLink(
        dto: CreateVoucherDto,
        origin: VoucherWorkflowOrigin,
        existingId?: string,
        existingSourceVoucherId?: string | null,
      ): Promise<void>;
    }).validatePurchaseWorkflowLink.bind(service);

    await expect(validate(
      { ...receiptDto },
      VoucherWorkflowOrigin.ORDER_FLOW,
      "receipt-existing",
      "order-1",
    )).resolves.toBeUndefined();
  });

  it("checks only Receipt Notes when deciding whether a Purchase Order can be edited or deleted", async () => {
    const findFirst = vi.fn(async () => null);
    const service = new VouchersService({ voucherEntry: { findFirst } } as never, {} as never, {} as never, allowAllPermissions as never);
    const assertNoChild = (service as unknown as {
      assertPurchaseDocumentHasNoChild(entry: Record<string, unknown>, operation: "edited"): Promise<void>;
    }).assertPurchaseDocumentHasNoChild.bind(service);

    await expect(assertNoChild({
      id: "order-1",
      workspaceId: "workspace-1",
      voucherType: VoucherEntryType.PURCHASE,
      documentKind: "purchase-order",
      voucherNumber: "PO-1",
    }, "edited")).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        voucherType: VoucherEntryType.PURCHASE,
        documentKind: "receipt-note",
      }),
    }));
  });
});

describe("VouchersService periodic sales-return posting", () => {
  it("allows a refund from actual inline Cash/Bank/MFS invoice postings when paidAmount is stale", async () => {
    const soldLine = {
      ...inventoryLine("sale-line-inline-paid", "sale-inline-paid", 2, null),
      unitPrice: 150,
      lineTotal: 300,
    };
    const prisma = {
      voucherEntry: {
        findFirst: vi.fn(async () => ({
          id: "sale-inline-paid",
          workspaceId: "workspace-1",
          voucherType: VoucherEntryType.SALES,
          documentKind: null,
          voucherNumber: "INV-INLINE-PAID",
          voucherDate: new Date("2026-08-01T00:00:00.000Z"),
          partyName: "Customer One",
          status: VoucherEntryStatus.POSTED,
          warehouseId: "warehouse-1",
          totalAmount: 300,
          paidAmount: 0,
          inventoryItems: [soldLine],
          lines: [{
            id: "invoice-cash-collection",
            accountId: "cash-account",
            moneyAccountType: "CASH",
            ledger: "Cash in Hand",
            description: "Cash customer collection",
            debit: 300,
            credit: 0,
          }],
          warehouse: null,
        })),
        findMany: vi.fn(async () => []),
      },
    };
    const service = new VouchersService(prisma as never, {} as never, {} as never, allowAllPermissions as never);
    const internals = service as unknown as {
      prepareSalesReturn(dto: CreateVoucherDto, existingId?: string): Promise<void>;
    };
    const dto: CreateVoucherDto = {
      workspaceId: "workspace-1",
      voucherType: "credit-note",
      sourceVoucherId: "sale-inline-paid",
      voucherDate: "2026-08-15",
      partyName: "Customer One",
      status: "pending",
      settlementMode: "cash",
      inventoryItems: [{
        id: "item-1",
        sourceInventoryLineId: "sale-line-inline-paid",
        itemName: "Phone",
        quantity: 1,
        unitPrice: 150,
        warehouseId: "warehouse-1",
      }],
      lines: [{
        id: "cash-refund",
        accountId: "cash-account",
        moneyAccountType: "CASH",
        ledger: "Cash in Hand",
        description: "Cash sales return refund",
        debit: 0,
        credit: 150,
      }],
    };

    await expect(internals.prepareSalesReturn(dto)).resolves.toBeUndefined();
    expect(dto.paidAmount).toBe(150);
    expect(dto.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: "cash-account", credit: 150 }),
    ]));
  });

  it("keeps the sales return financial pair but does not synthesize perpetual Inventory/COGS lines", async () => {
    const soldLine = {
      ...inventoryLine("sale-line", "sale-1", 2, null),
      unitPrice: 150,
      lineTotal: 300,
    };
    const earlierReturnsFindMany = vi.fn(async () => []);
    const prisma = {
      voucherEntry: {
        findFirst: vi.fn(async () => ({
          id: "sale-1",
          workspaceId: "workspace-1",
          voucherType: VoucherEntryType.SALES,
          documentKind: null,
          voucherNumber: "INV-2608-00001",
          voucherDate: new Date("2026-08-01T00:00:00.000Z"),
          partyName: "Customer One",
          status: VoucherEntryStatus.POSTED,
          warehouseId: "warehouse-1",
          totalAmount: 300,
          paidAmount: 300,
          inventoryItems: [soldLine],
          lines: [],
          warehouse: null,
        })),
        findMany: earlierReturnsFindMany,
      },
    };
    const service = new VouchersService(prisma as never, {} as never, {} as never, allowAllPermissions as never);
    const internals = service as unknown as {
      prepareSalesReturn(dto: CreateVoucherDto, existingId?: string): Promise<void>;
    };
    const dto: CreateVoucherDto = {
      workspaceId: "workspace-1",
      voucherType: "credit-note",
      sourceVoucherId: "sale-1",
      voucherDate: "2026-08-15",
      partyName: "Customer One",
      status: "pending",
      inventoryItems: [
        {
          id: "item-1",
          sourceInventoryLineId: "sale-line",
          itemName: "Phone",
          quantity: 1,
          unitPrice: 999,
          warehouseId: "warehouse-1",
        },
      ],
      lines: [],
    };

    await internals.prepareSalesReturn(dto);

    expect(dto.lines.map((line) => line.ledger)).toEqual(["Sales Return", "Customer One"]);
    expect(dto.lines.some((line) => line.ledger === "Inventory Control" || line.ledger === "Cost of Goods Sold")).toBe(false);
    expect(dto.inventoryItems).toEqual([
      expect.objectContaining({ sourceInventoryLineId: "sale-line", unitPrice: 150 }),
    ]);

    const refundDto: CreateVoucherDto = {
      ...dto,
      settlementMode: "cash",
      inventoryItems: [{
        id: "item-1",
        sourceInventoryLineId: "sale-line",
        itemName: "Phone",
        quantity: 1,
        unitPrice: 999,
        warehouseId: "warehouse-1",
      }],
      lines: [{
        id: "cash-refund",
        accountId: "cash-account",
        moneyAccountType: "CASH",
        ledger: "Cash in Hand",
        description: "Cash sales return refund",
        debit: 0,
        credit: 150,
      }],
    };
    await internals.prepareSalesReturn(refundDto);
    expect(refundDto.settlementMode).toBe("cash");
    expect(refundDto.paidAmount).toBe(150);
    expect(refundDto.lines).toEqual([
      expect.objectContaining({ ledger: "Sales Return", debit: 150, credit: 0 }),
      expect.objectContaining({ accountId: "cash-account", moneyAccountType: "CASH", debit: 0, credit: 150 }),
    ]);
    expect(earlierReturnsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({
            notIn: expect.arrayContaining([
              VoucherEntryStatus.DRAFT,
              VoucherEntryStatus.REJECTED,
              VoucherEntryStatus.SUPERSEDED_BY_ALTERATION,
            ]),
          }),
        }),
      }),
    );
  });

  it("restores the exact selected sale line when the same item has different issue-cost sources", async () => {
    const firstLine = { ...inventoryLine("sale-line-1", "sale-1", 1, null), unitPrice: 150, lineTotal: 150 };
    const secondLine = { ...inventoryLine("sale-line-2", "sale-1", 1, null), unitPrice: 250, lineTotal: 250 };
    const prisma = {
      voucherEntry: {
        findFirst: vi.fn(async () => ({
          id: "sale-1",
          workspaceId: "workspace-1",
          voucherType: VoucherEntryType.SALES,
          documentKind: null,
          voucherNumber: "INV-2608-00002",
          voucherDate: new Date("2026-08-01T00:00:00.000Z"),
          partyName: "Customer One",
          status: VoucherEntryStatus.POSTED,
          warehouseId: "warehouse-1",
          totalAmount: 400,
          inventoryItems: [firstLine, secondLine],
          lines: [],
          warehouse: null,
        })),
        findMany: vi.fn(async () => []),
      },
    };
    const service = new VouchersService(prisma as never, {} as never, {} as never, allowAllPermissions as never);
    const internals = service as unknown as {
      prepareSalesReturn(dto: CreateVoucherDto, existingId?: string): Promise<void>;
    };
    const dto: CreateVoucherDto = {
      workspaceId: "workspace-1",
      voucherType: "credit-note",
      sourceVoucherId: "sale-1",
      voucherDate: "2026-08-15",
      partyName: "Customer One",
      status: "pending",
      inventoryItems: [{
        id: "item-1",
        sourceInventoryLineId: "sale-line-2",
        itemName: "Phone",
        quantity: 1,
        unitPrice: 999,
        warehouseId: "warehouse-1",
      }],
      lines: [],
    };

    await internals.prepareSalesReturn(dto);

    expect(dto.inventoryItems).toEqual([
      expect.objectContaining({ sourceInventoryLineId: "sale-line-2", unitPrice: 250, quantity: 1 }),
    ]);
    expect(dto.totalAmount).toBe(250);
  });
});
