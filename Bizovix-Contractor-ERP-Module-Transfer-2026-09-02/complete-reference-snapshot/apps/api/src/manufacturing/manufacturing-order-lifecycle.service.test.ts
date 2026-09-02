import { describe, expect, it, vi } from "vitest";

import { Prisma } from "../generated/prisma/index.js";
import { ManufacturingService } from "./manufacturing.service.js";

const scope = {
  id: "workspace-1",
  tenantId: "tenant-1",
  companyId: "company-1",
};
const user = { id: "checker-1" } as never;
const when = new Date("2026-09-01T00:00:00.000Z");

function lifecycleOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "MO-2026-000001",
    status: "RESERVED",
    createdByUserId: "maker-1",
    bomVersionId: "bom-version-1",
    plannedQuantity: new Prisma.Decimal(10),
    completedQuantity: new Prisma.Decimal(0),
    rejectedQuantity: new Prisma.Decimal(0),
    plannedStartDate: new Date("2026-09-01T00:00:00.000Z"),
    plannedEndDate: new Date("2026-09-10T00:00:00.000Z"),
    priority: 1,
    notes: "Original order",
    materials: [
      {
        id: "material-1",
        inventoryItemId: "raw-1",
        status: "RESERVED",
        plannedQuantity: new Prisma.Decimal(10),
        reservedQuantity: new Prisma.Decimal(10),
        issuedQuantity: new Prisma.Decimal(0),
        returnedQuantity: new Prisma.Decimal(0),
        consumedQuantity: new Prisma.Decimal(0),
        scrappedQuantity: new Prisma.Decimal(0),
      },
    ],
    lots: [
      {
        id: "lot-1",
        lotNumber: "LOT-01",
        status: "PLANNED",
        plannedQuantity: new Prisma.Decimal(4),
        completedQuantity: new Prisma.Decimal(0),
        rejectedQuantity: new Prisma.Decimal(0),
      },
      {
        id: "lot-2",
        lotNumber: "LOT-02",
        status: "PLANNED",
        plannedQuantity: new Prisma.Decimal(6),
        completedQuantity: new Prisma.Decimal(0),
        rejectedQuantity: new Prisma.Decimal(0),
      },
    ],
    reservations: [
      {
        id: "reservation-1",
        status: "ACTIVE",
        lines: [
          {
            id: "reservation-line-1",
            orderMaterialId: "material-1",
            inventoryItemId: "raw-1",
            inventoryLotId: null,
            quantity: new Prisma.Decimal(10),
            issuedQuantity: new Prisma.Decimal(0),
            releasedQuantity: new Prisma.Decimal(0),
          },
        ],
      },
    ],
    transactions: [
      {
        id: "transaction-draft-1",
        status: "DRAFT",
        voucherEntryId: null,
        voucherEntry: null,
        lines: [],
      },
    ],
    operationExecutions: [
      {
        id: "execution-1",
        orderLotId: "lot-1",
        status: "PENDING",
      },
      {
        id: "execution-2",
        orderLotId: "lot-2",
        status: "READY",
      },
    ],
    packagingOrders: [{ id: "packaging-1", status: "DRAFT" }],
    costSnapshots: [
      {
        id: "cost-1",
        status: "DRAFT",
        voucherEntryId: null,
        voucherEntry: null,
      },
    ],
    qualityInspections: [],
    serials: [],
    workflowReviews: [],
    ...overrides,
  };
}

function transaction(order = lifecycleOrder()) {
  return {
    manufacturingOrder: {
      findFirst: vi.fn().mockResolvedValue(order),
      update: vi.fn().mockResolvedValue({}),
    },
    manufacturingSettings: {
      findUnique: vi.fn().mockResolvedValue({
        mode: "GENERAL",
        approvalRequired: true,
        electronicSignatureRequired: true,
      }),
    },
    manufacturingPeriod: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    manufacturingControlRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    manufacturingBomVersion: {
      findFirst: vi.fn().mockResolvedValue({
        id: "bom-version-1",
        outputQuantity: new Prisma.Decimal(1),
        components: [
          {
            inventoryItemId: "raw-1",
            unit: "pcs",
            quantityPerOutput: new Prisma.Decimal(1),
            scrapPercent: new Prisma.Decimal(0),
          },
        ],
      }),
    },
    manufacturingSerialRule: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: "serial-rule-1", status: "DRAFT" }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    manufacturingReservationLine: {
      update: vi.fn().mockResolvedValue({}),
    },
    manufacturingReservation: {
      update: vi.fn().mockResolvedValue({}),
    },
    manufacturingInventoryLot: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    manufacturingTransaction: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    manufacturingPackagingOrder: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    manufacturingCostSnapshot: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    manufacturingOrderMaterial: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    manufacturingOrderLot: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    manufacturingOperationExecution: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    manufacturingWorkflowReview: {
      create: vi.fn().mockImplementation(({ data }) => ({
        id: "review-1",
        createdAt: when,
        createdBy: { name: "Checker" },
        ...data,
      })),
    },
  };
}

function executable(service: ManufacturingService) {
  return service as unknown as {
    executeAction: (
      tx: Prisma.TransactionClient,
      scopeValue: typeof scope,
      currentUser: typeof user,
      orderId: string,
      dto: Record<string, unknown>,
    ) => Promise<unknown>;
  };
}

describe("controlled production-order amendment", () => {
  it("releases reservations, recalculates materials/lots and returns the order to draft", async () => {
    const tx = transaction();
    const electronicSignature = { enforce: vi.fn().mockResolvedValue({}) };
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      {} as never,
      electronicSignature as never,
    );

    await executable(service).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      user,
      "order-1",
      {
        kind: "AMEND",
        idempotencyKey: "amend-1",
        transactionDate: when.toISOString(),
        signatureMeaning: "Amended",
        note: "Increase the approved plan after controlled review",
        payload: {
          plannedQuantity: 20,
          plannedStartDate: "2026-09-02",
          plannedEndDate: "2026-09-12",
          priority: 3,
          notes: "Controlled revision",
        },
      },
    );

    expect(electronicSignature.enforce).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ required: true, signatureMeaning: "Amended" }),
    );
    expect(tx.manufacturingReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reservation-1" },
        data: expect.objectContaining({ status: "RELEASED" }),
      }),
    );
    expect(tx.manufacturingOrderMaterial.update).toHaveBeenCalledWith({
      where: { id: "material-1" },
      data: expect.objectContaining({
        plannedQuantity: new Prisma.Decimal(20),
        reservedQuantity: 0,
        status: "PLANNED",
      }),
    });
    expect(tx.manufacturingOrderLot.update).toHaveBeenNthCalledWith(1, {
      where: { id: "lot-1" },
      data: expect.objectContaining({
        plannedQuantity: new Prisma.Decimal(8),
        status: "PLANNED",
      }),
    });
    expect(tx.manufacturingOrderLot.update).toHaveBeenNthCalledWith(2, {
      where: { id: "lot-2" },
      data: expect.objectContaining({
        plannedQuantity: new Prisma.Decimal(12),
        status: "PLANNED",
      }),
    });
    expect(tx.manufacturingOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({
        status: "DRAFT",
        plannedQuantity: new Prisma.Decimal(20),
        priority: 3,
        approvedByUserId: null,
        approvedAt: null,
      }),
    });
    expect(tx.manufacturingWorkflowReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: expect.objectContaining({
            lifecycle: "CONTROLLED_AMENDMENT",
            before: expect.objectContaining({ plannedQuantity: "10" }),
            after: expect.objectContaining({ plannedQuantity: "20" }),
            invalidated: expect.objectContaining({
              transactionIds: ["transaction-draft-1"],
              packagingOrderIds: ["packaging-1"],
              costSnapshotIds: ["cost-1"],
            }),
          }),
        }),
      }),
    );
  });

  it("rejects unsupported amendment fields before mutating dependent records", async () => {
    const tx = transaction(lifecycleOrder({ status: "DRAFT" }));
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      {} as never,
      { enforce: vi.fn().mockResolvedValue({}) } as never,
    );

    await expect(
      executable(service).executeAction(
        tx as unknown as Prisma.TransactionClient,
        scope,
        user,
        "order-1",
        {
          kind: "AMEND",
          idempotencyKey: "amend-invalid-1",
          transactionDate: when.toISOString(),
          signatureMeaning: "Amended",
          note: "Invalid field test",
          payload: { bomVersionId: "another-version" },
        },
      ),
    ).rejects.toThrow("Unsupported AMEND payload field");
    expect(tx.manufacturingReservation.update).not.toHaveBeenCalled();
    expect(tx.manufacturingOrder.update).not.toHaveBeenCalled();
  });
});

describe("controlled production-order cancellation", () => {
  it("releases active reservations and cancels only unposted dependent records", async () => {
    const tx = transaction();
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      {} as never,
      { enforce: vi.fn().mockResolvedValue({}) } as never,
    );

    await executable(service).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      user,
      "order-1",
      {
        kind: "CANCEL",
        idempotencyKey: "cancel-1",
        transactionDate: when.toISOString(),
        signatureMeaning: "Cancelled",
        note: "Demand was withdrawn before material issue",
      },
    );

    expect(tx.manufacturingTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["transaction-draft-1"] },
          status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] },
        }),
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
    expect(tx.manufacturingPackagingOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CANCELLED" } }),
    );
    expect(tx.manufacturingCostSnapshot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "VOIDED" }),
      }),
    );
    expect(tx.manufacturingOrderMaterial.updateMany).toHaveBeenCalledWith({
      where: { orderId: "order-1" },
      data: { status: "CANCELLED", reservedQuantity: 0 },
    });
    expect(tx.manufacturingOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "CANCELLED" },
    });
    expect(tx.manufacturingWorkflowReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: expect.objectContaining({
            lifecycle: "CONTROLLED_CANCELLATION",
            reversalRequired: false,
          }),
        }),
      }),
    );
  });

  it("refuses cancellation when posted stock or accounting effects exist", async () => {
    const postedOrder = lifecycleOrder({
      transactions: [
        {
          id: "posted-1",
          status: "POSTED",
          voucherEntryId: "voucher-1",
          voucherEntry: { id: "voucher-1" },
          lines: [{ stockMovements: [{ id: "movement-1" }] }],
        },
      ],
    });
    const tx = transaction(postedOrder);
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      {} as never,
      { enforce: vi.fn().mockResolvedValue({}) } as never,
    );

    await expect(
      executable(service).executeAction(
        tx as unknown as Prisma.TransactionClient,
        scope,
        user,
        "order-1",
        {
          kind: "CANCEL",
          idempotencyKey: "cancel-posted-1",
          transactionDate: when.toISOString(),
          signatureMeaning: "Cancelled",
          note: "Should require reversal",
        },
      ),
    ).rejects.toThrow("requires a controlled stock/accounting reversal");
    expect(tx.manufacturingReservation.update).not.toHaveBeenCalled();
    expect(tx.manufacturingOrder.update).not.toHaveBeenCalled();
    expect(tx.manufacturingWorkflowReview.create).not.toHaveBeenCalled();
  });
});
