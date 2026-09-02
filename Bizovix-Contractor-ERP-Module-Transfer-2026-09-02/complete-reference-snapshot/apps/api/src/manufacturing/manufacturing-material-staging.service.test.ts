import { describe, expect, it, vi } from "vitest";

import { Prisma } from "../generated/prisma/index.js";
import { ManufacturingMaterialsService } from "./manufacturing-materials.service.js";

const when = new Date("2026-09-15T00:00:00.000Z");
const scope = {
  id: "workspace-1",
  tenantId: "tenant-1",
  companyId: "company-1",
};
const user = {
  id: "operator-1",
  workspaceId: scope.id,
  tenantId: scope.tenantId,
  companyId: scope.companyId,
};

function requisition(quantity = 10) {
  const inventoryItem = {
    id: "raw-item-1",
    itemCode: "RM-001",
    itemName: "Raw material",
    unit: "pcs",
  };
  const releasedLot = {
    id: "released-lot-1",
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    workspaceId: scope.id,
    inventoryItemId: "raw-item-1",
    warehouseId: "warehouse-rm",
    locationId: "location-released",
    lotNumber: "RM-LOT-001",
    receivedQuantity: new Prisma.Decimal(50),
    availableQuantity: new Prisma.Decimal(50),
    reservedQuantity: new Prisma.Decimal(quantity),
    holdQuantity: new Prisma.Decimal(0),
    rejectedQuantity: new Prisma.Decimal(0),
    unit: "pcs",
    unitCost: new Prisma.Decimal("125.500000"),
    manufacturedAt: new Date("2026-08-01T00:00:00.000Z"),
    expiresAt: new Date("2027-08-01T00:00:00.000Z"),
    sourceTransactionLineId: null as string | null,
    location: {
      id: "location-released",
      code: "RM-REL",
      disposition: "RELEASED",
      isActive: true,
    },
    warehouse: {
      id: "warehouse-rm",
      isActive: true,
      deletedAt: null,
    },
  };
  return {
    id: "requisition-1",
    transactionNumber: "MRQ-2026-0001",
    transactionType: "MATERIAL_REQUISITION",
    status: "APPROVED",
    orderId: "order-1",
    reservationId: "reservation-1",
    order: {
      id: "order-1",
      status: "RESERVED",
      lots: [{ id: "order-lot-1" }],
    },
    reservation: {
      id: "reservation-1",
      status: "ACTIVE",
      lines: [
        {
          id: "reservation-line-1",
          orderMaterialId: "order-material-1",
          inventoryItemId: "raw-item-1",
          inventoryLotId: "released-lot-1",
          quantity: new Prisma.Decimal(quantity),
          issuedQuantity: new Prisma.Decimal(0),
          releasedQuantity: new Prisma.Decimal(0),
          unit: "pcs",
          inventoryItem,
          inventoryLot: releasedLot,
        },
      ],
    },
    lines: [
      {
        id: "requisition-line-1",
        transactionId: "requisition-1",
        reservationLineId: null,
        orderMaterialId: "order-material-1",
        inventoryItemId: "raw-item-1",
        inventoryItem,
        sourceInventoryLotId: "released-lot-1",
        quantity: new Prisma.Decimal(quantity),
        unit: "pcs",
        notes: null,
        sourceInventoryLot: releasedLot,
      },
    ],
  };
}

function stagedRequisition(quantity = 10) {
  const row = requisition(quantity);
  const reservationLine = row.reservation.lines[0];
  reservationLine.inventoryLotId = "staged-child-lot";
  reservationLine.inventoryLot = {
    ...reservationLine.inventoryLot,
    id: "staged-child-lot",
    lotNumber: "RM-LOT-001-STG-A1",
    locationId: "location-staging",
    sourceTransactionLineId: "staging-transfer-line-1",
    location: {
      id: "location-staging",
      code: "RM-STG",
      disposition: "STAGING",
      isActive: true,
    },
  };
  return row;
}

function harness(requestedQuantity = 10) {
  const auditCreate = vi.fn().mockImplementation(({ data }) => ({
    id: "review-1",
    workflowCode: data.workflowCode,
    entityId: data.entityId,
    evidence: data.evidence,
  }));
  const transactionCreate = vi.fn().mockImplementation(({ data }) => ({
    id: data.id,
    transactionNumber: data.transactionNumber,
    transactionType: data.transactionType,
  }));
  const tx = {
    manufacturingPeriod: { findUnique: vi.fn().mockResolvedValue(null) },
    manufacturingTransaction: {
      findFirst: vi.fn().mockResolvedValue(requisition()),
      create: transactionCreate,
    },
    manufacturingLocation: {
      findFirst: vi.fn().mockResolvedValue({
        id: "location-staging",
        code: "RM-STG",
        name: "Raw material staging",
        disposition: "STAGING",
        warehouseId: "warehouse-rm",
        isActive: true,
      }),
    },
    fiscalYear: {
      findFirst: vi.fn().mockResolvedValue({ id: "fiscal-year-2026" }),
    },
    manufacturingInventoryLot: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
    },
    manufacturingTransactionLine: {
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    manufacturingReservationLine: {
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    manufacturingReservation: {
      update: vi.fn().mockResolvedValue({}),
    },
    manufacturingGenealogy: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ parentInventoryLotId: "released-lot-1" }),
      create: vi.fn().mockResolvedValue({}),
    },
    manufacturingWorkflowReview: {
      findMany: vi.fn().mockResolvedValue([]),
      create: auditCreate,
    },
    workspaceMember: { findFirst: vi.fn() },
    stockMovement: { create: vi.fn() },
    voucherEntry: { create: vi.fn() },
  };
  const prisma = {
    workspace: { findFirst: vi.fn().mockResolvedValue(scope) },
    manufacturingWorkflowReview: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    manufacturingTransaction: { findFirst: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn().mockImplementation((operation) => operation(tx)),
  };
  const permissions = {
    getGrantedKeys: vi
      .fn()
      .mockResolvedValue(new Set(["manufacturing.material.issue"])),
  };
  const service = new ManufacturingMaterialsService(
    prisma as never,
    permissions as never,
  );
  const dto = {
    workspaceId: scope.id,
    requisitionId: "requisition-1",
    requisitionLineId: "reservation-line-1",
    orderLotId: "order-lot-1",
    stage: "STAGED" as const,
    barcode: "RM-001:RM-LOT-001",
    quantity: requestedQuantity,
    locationId: "location-staging",
    transactionDate: when.toISOString(),
    idempotencyKey: `stage-${requestedQuantity}`,
    note: "Stage reserved refrigerator material",
  };
  return { service, prisma, tx, dto, auditCreate, transactionCreate };
}

describe("real reserved-lot material staging", () => {
  it("derives each staged lot return maximum from posted issue minus posted return", async () => {
    const { service, prisma } = harness(10);
    const row = stagedRequisition(10);
    Object.assign(row, {
      transactionDate: when,
      fromWarehouseId: "warehouse-rm",
      fromLocationId: "location-released",
      notes: null,
      createdAt: when,
    });
    Object.assign(row.order, {
      orderNumber: "MO-2026-0001",
      transactions: [
        {
          orderLotId: "order-lot-1",
          transactionType: "MATERIAL_ISSUE",
          lines: [
            {
              inventoryItemId: "raw-item-1",
              orderMaterialId: "order-material-1",
              sourceInventoryLotId: "staged-child-lot",
              destinationInventoryLotId: null,
              quantity: new Prisma.Decimal(7),
            },
          ],
        },
        {
          orderLotId: "order-lot-1",
          transactionType: "MATERIAL_RETURN",
          lines: [
            {
              inventoryItemId: "raw-item-1",
              orderMaterialId: "order-material-1",
              sourceInventoryLotId: null,
              destinationInventoryLotId: "staged-child-lot",
              quantity: new Prisma.Decimal(2),
            },
          ],
        },
      ],
    });
    Object.assign(row.reservation, { reservationNumber: "RSV-2026-0001" });
    prisma.manufacturingTransaction.findMany.mockResolvedValue([row]);

    const [record] = await service.listRequisitions(user as never, {
      workspaceId: scope.id,
      status: "APPROVED",
    });

    expect(record.lines[0].inventoryLotId).toBe("staged-child-lot");
    expect(record.lines[0].lotBalances).toEqual([
      {
        orderLotId: "order-lot-1",
        issuedQuantity: 7,
        returnedQuantity: 2,
        returnableQuantity: 5,
      },
    ]);
  });

  it("posts an atomic same-warehouse LOCATION_TRANSFER without stock movement or GL", async () => {
    const { service, tx, dto, transactionCreate, auditCreate } = harness(10);

    const result = await service.recordHandlingEvidence(user as never, dto);

    expect(transactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionType: "LOCATION_TRANSFER",
          status: "POSTED",
          fromWarehouseId: "warehouse-rm",
          toWarehouseId: "warehouse-rm",
          fromLocationId: "location-released",
          toLocationId: "location-staging",
        }),
      }),
    );
    expect(transactionCreate.mock.calls[0][0].data).not.toHaveProperty(
      "voucherEntryId",
    );
    expect(tx.manufacturingInventoryLot.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "released-lot-1",
        availableQuantity: { gte: new Prisma.Decimal(10) },
        reservedQuantity: { gte: new Prisma.Decimal(10) },
      }),
      data: {
        availableQuantity: { decrement: new Prisma.Decimal(10) },
        reservedQuantity: { decrement: new Prisma.Decimal(10) },
      },
    });
    expect(tx.manufacturingInventoryLot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        warehouseId: "warehouse-rm",
        locationId: "location-staging",
        availableQuantity: new Prisma.Decimal(10),
        reservedQuantity: new Prisma.Decimal(10),
        unitCost: new Prisma.Decimal("125.500000"),
      }),
    });
    expect(tx.manufacturingReservationLine.update).toHaveBeenCalledWith({
      where: { id: "reservation-line-1" },
      data: { inventoryLotId: result.stagedInventoryLotId },
    });
    expect(tx.manufacturingGenealogy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parentInventoryLotId: "released-lot-1",
        childInventoryLotId: result.stagedInventoryLotId,
        relationshipType: "LOCATION_STAGING_SPLIT",
        quantity: new Prisma.Decimal(10),
      }),
    });
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.voucherEntry.create).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: expect.objectContaining({
            stockMovementIds: [],
            voucherEntryId: null,
            quantity: "10",
          }),
        }),
      }),
    );
  });

  it("splits only the live reservation while preserving the approved requisition snapshot", async () => {
    const { service, tx, dto } = harness(4);

    const result = await service.recordHandlingEvidence(user as never, dto);

    expect(tx.manufacturingReservationLine.update).toHaveBeenCalledWith({
      where: { id: "reservation-line-1" },
      data: { quantity: new Prisma.Decimal(6) },
    });
    expect(tx.manufacturingReservationLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inventoryLotId: result.stagedInventoryLotId,
        quantity: new Prisma.Decimal(4),
      }),
    });
    expect(tx.manufacturingTransactionLine.create).not.toHaveBeenCalled();
    expect(tx.manufacturingTransactionLine.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "requisition-line-1" } }),
    );
    expect(tx.manufacturingTransactionLine.update).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: expect.any(String) }),
      data: expect.objectContaining({
        reservationLineId: expect.any(String),
      }),
    });
  });

  it("fails closed before transfer when the manufacturing period is locked", async () => {
    const { service, tx, dto, transactionCreate } = harness(10);
    tx.manufacturingPeriod.findUnique.mockResolvedValue({
      status: "LOCKED",
      periodYear: 2026,
      periodMonth: 9,
    });

    await expect(
      service.recordHandlingEvidence(user as never, dto),
    ).rejects.toThrow("manufacturing period 2026-09 is LOCKED");
    expect(transactionCreate).not.toHaveBeenCalled();
    expect(tx.manufacturingInventoryLot.updateMany).not.toHaveBeenCalled();
  });

  it("verifies only the persisted staged child lot at its exact staging location", async () => {
    const { service, tx, dto, auditCreate } = harness(10);
    tx.manufacturingTransaction.findFirst.mockResolvedValue(
      stagedRequisition(),
    );
    tx.manufacturingWorkflowReview.findMany.mockResolvedValue([
      {
        evidence: {
          stage: "STAGED",
          sourceRequisitionLineId: "reservation-line-1",
          stagedRequisitionLineId: "reservation-line-1",
          orderLotId: "order-lot-1",
          inventoryItemId: "raw-item-1",
          stagedInventoryLotId: "staged-child-lot",
          stagedLocationId: "location-staging",
        },
      },
    ]);
    tx.workspaceMember.findFirst.mockResolvedValue({ id: "member-2" });

    const result = await service.recordHandlingEvidence(user as never, {
      ...dto,
      stage: "VERIFIED",
      quantity: undefined,
      barcode: "RM-001:RM-LOT-001-STG-A1",
      verifierUserId: "verifier-2",
      idempotencyKey: "verify-staged-child",
    });

    expect(result.stagedInventoryLotId).toBe("staged-child-lot");
    expect(tx.manufacturingInventoryLot.updateMany).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: expect.objectContaining({
            stage: "VERIFIED",
            stagedInventoryLotId: "staged-child-lot",
            stagedLocationId: "location-staging",
            verifierUserId: "verifier-2",
          }),
        }),
      }),
    );
  });

  it("accepts ISSUE_SCAN only for a posted issue sourced from that staged lot and location", async () => {
    const { service, tx, dto, auditCreate } = harness(10);
    tx.manufacturingTransaction.findFirst
      .mockResolvedValueOnce(stagedRequisition())
      .mockResolvedValueOnce({
        id: "material-issue-1",
        transactionType: "MATERIAL_ISSUE",
        orderId: "order-1",
        orderLotId: "order-lot-1",
        fromLocationId: "location-staging",
        toLocationId: "location-wip",
        lines: [{ id: "issue-line-1" }],
      });
    tx.manufacturingLocation.findFirst.mockResolvedValue({
      id: "location-wip",
      code: "WIP",
      name: "Work in progress",
      disposition: "WIP",
      warehouseId: "warehouse-wip",
      isActive: true,
    });
    tx.manufacturingWorkflowReview.findMany.mockResolvedValue([
      {
        evidence: {
          stage: "VERIFIED",
          sourceRequisitionLineId: "reservation-line-1",
          stagedRequisitionLineId: "reservation-line-1",
          orderLotId: "order-lot-1",
          inventoryItemId: "raw-item-1",
          stagedInventoryLotId: "staged-child-lot",
          stagedLocationId: "location-staging",
        },
      },
    ]);

    const result = await service.recordHandlingEvidence(user as never, {
      ...dto,
      stage: "ISSUE_SCAN",
      quantity: undefined,
      barcode: "RM-001:RM-LOT-001-STG-A1",
      locationId: "location-wip",
      transactionId: "material-issue-1",
      idempotencyKey: "scan-staged-child-issue",
    });

    expect(result.stagedInventoryLotId).toBe("staged-child-lot");
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: expect.objectContaining({
            stage: "ISSUE_SCAN",
            stagedInventoryLotId: "staged-child-lot",
            transactionId: "material-issue-1",
          }),
        }),
      }),
    );
  });

  it("accepts RETURN_SCAN only when the posted return lands back on the staged child lot", async () => {
    const { service, tx, dto, auditCreate } = harness(10);
    tx.manufacturingTransaction.findFirst
      .mockResolvedValueOnce(stagedRequisition())
      .mockResolvedValueOnce({
        id: "material-return-1",
        transactionType: "MATERIAL_RETURN",
        orderId: "order-1",
        orderLotId: "order-lot-1",
        fromLocationId: "location-wip",
        toLocationId: "location-staging",
        lines: [{ id: "return-line-1" }],
      });
    tx.manufacturingWorkflowReview.findMany.mockResolvedValue([
      {
        evidence: {
          stage: "VERIFIED",
          sourceRequisitionLineId: "reservation-line-1",
          stagedRequisitionLineId: "reservation-line-1",
          orderLotId: "order-lot-1",
          inventoryItemId: "raw-item-1",
          stagedInventoryLotId: "staged-child-lot",
          stagedLocationId: "location-staging",
        },
      },
    ]);

    const result = await service.recordHandlingEvidence(user as never, {
      ...dto,
      stage: "RETURN_SCAN",
      quantity: undefined,
      barcode: "RM-001:RM-LOT-001-STG-A1",
      transactionId: "material-return-1",
      idempotencyKey: "scan-staged-child-return",
    });

    expect(result.stagedInventoryLotId).toBe("staged-child-lot");
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: expect.objectContaining({
            stage: "RETURN_SCAN",
            stagedInventoryLotId: "staged-child-lot",
            stagedLocationId: "location-staging",
            transactionId: "material-return-1",
          }),
        }),
      }),
    );
  });
});
