import { describe, expect, it, vi } from "vitest";

import { Prisma } from "../generated/prisma/index.js";
import {
  ManufacturingPackagingService,
  manufacturingSerialQcApprovalEntityId,
} from "./manufacturing-packaging.service.js";

const electronicSignature = {
  enforce: vi.fn().mockResolvedValue(null),
} as never;

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

type ReservationLineInput = {
  orderMaterialId: string;
  inventoryItemId: string;
  inventoryLotId: string | null;
  quantity: Prisma.Decimal;
  unit: string;
};

type ReservationCreateInput = {
  data: {
    reservationNumber: string;
    lines: { create: ReservationLineInput[] };
  };
};

function packagingOrder(id: string, plannedQuantity: string) {
  return {
    id,
    plannedQuantity: decimal(plannedQuantity),
    packagingConfiguration: {
      lines: [
        { inventoryItemId: "carton", quantity: decimal("1.0000"), unit: "pcs" },
        { inventoryItemId: "label", quantity: decimal("2.0000"), unit: "pcs" },
      ],
    },
  };
}

function materialRow(input: {
  id: string;
  inventoryItemId: string;
  plannedQuantity: string;
  bomComponentId?: string | null;
  issuedQuantity?: string;
  reservedQuantity?: string;
}) {
  return {
    id: input.id,
    orderId: "order-1",
    inventoryItemId: input.inventoryItemId,
    bomComponentId: input.bomComponentId ?? null,
    unit: "pcs",
    plannedQuantity: decimal(input.plannedQuantity),
    reservedQuantity: decimal(input.reservedQuantity ?? "0"),
    issuedQuantity: decimal(input.issuedQuantity ?? "0"),
    returnedQuantity: decimal("0"),
    consumedQuantity: decimal("0"),
    scrappedQuantity: decimal("0"),
    status: "PLANNED",
  };
}

describe("manufacturing packaging material bridge", () => {
  it("records pharmaceutical serial QC stage 1 without creating an inspection", async () => {
    const prisma = {
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue({ mode: "PHARMACEUTICAL" }),
      },
      manufacturingSerial: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "serial-1",
            orderId: "order-1",
            orderLotId: "lot-1",
            inventoryLotId: "inventory-lot-1",
            status: "QC_HOLD",
          },
        ]),
      },
    };
    const approvalWorkflow = {
      advance: vi.fn().mockResolvedValue({
        complete: false,
        totalStages: 2,
        completedStages: 1,
        nextStage: 2,
        stageApprovers: [
          {
            userId: "inspector-1",
            transactionDate: new Date("2026-09-22T00:00:00.000Z"),
          },
        ],
        review: { id: "serial-qc-stage-1", evidence: { complete: false } },
      }),
    };
    const tx = {
      manufacturingQualityInspection: { create: vi.fn() },
      manufacturingSerial: { update: vi.fn() },
    };
    const service = new ManufacturingPackagingService(
      prisma as never,
      {} as never,
      electronicSignature,
      approvalWorkflow as never,
    );
    vi.spyOn(service as any, "scope").mockResolvedValue({
      id: "workspace-1",
      tenantId: "tenant-1",
      companyId: "company-1",
    });
    vi.spyOn(service as any, "order").mockResolvedValue({
      id: "order-1",
      orderNumber: "MO-0001",
      createdByUserId: "maker-1",
      finishedProductId: "finished-1",
      lots: [{ id: "lot-1", lotNumber: "LOT-1" }],
    });
    vi.spyOn(service as any, "auditReplay").mockResolvedValue(null);
    vi.spyOn(service as any, "assertPeriodOpen").mockResolvedValue(undefined);
    vi.spyOn(service as any, "serializable").mockImplementation(((
      operation: (value: unknown) => Promise<unknown>,
    ) => operation(tx)) as any);

    const result = await service.recordSerialQuality(
      { id: "inspector-1" } as never,
      {
        workspaceId: "workspace-1",
        orderId: "order-1",
        orderLotId: "lot-1",
        idempotencyKey: "serial-qc-stage-1",
        transactionDate: "2026-09-22T00:00:00.000Z",
        signatureMeaning: "Inspected by QC",
        inspections: [
          {
            serialId: "serial-1",
            passed: true,
            results: [
              {
                parameterCode: "APPEARANCE",
                parameterName: "Appearance",
                actualText: "CLEAR",
                passed: true,
              },
            ],
          },
        ],
      },
    );

    expect(result.approvalProgress).toEqual({
      totalStages: 2,
      completedStages: 1,
      nextStage: 2,
      complete: false,
    });
    expect(result.inspections).toEqual([]);
    expect(tx.manufacturingQualityInspection.create).not.toHaveBeenCalled();
    expect(tx.manufacturingSerial.update).not.toHaveBeenCalled();
    expect(approvalWorkflow.advance).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        workflowScope: "QUALITY_RESULT",
        fallbackStages: [
          { permissionKey: "manufacturing.quality.inspect" },
          { permissionKey: "manufacturing.quality.release" },
        ],
        minimumStages: 2,
      }),
    );
  });

  it("records the independent final reviewer when staged pharmaceutical serial QC fails", async () => {
    const inspectorAt = new Date("2026-09-21T00:00:00.000Z");
    const reviewerAt = "2026-09-22T00:00:00.000Z";
    const prisma = {
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue({ mode: "PHARMACEUTICAL" }),
      },
      manufacturingSerial: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "serial-1",
            orderId: "order-1",
            orderLotId: "lot-1",
            inventoryLotId: "inventory-lot-1",
            status: "QC_HOLD",
          },
        ]),
      },
    };
    const approvalWorkflow = {
      advance: vi.fn().mockResolvedValue({
        complete: true,
        totalStages: 2,
        completedStages: 2,
        nextStage: null,
        stageApprovers: [
          { userId: "inspector-1", transactionDate: inspectorAt },
          { userId: "reviewer-1", transactionDate: new Date(reviewerAt) },
        ],
        review: { id: "serial-qc-stage-2", evidence: { complete: true } },
      }),
    };
    const createInspection = vi.fn().mockImplementation(({ data }) => ({
      id: data.id,
      ...data,
      results: [],
      serial: { serialNumber: "SER-0001" },
    }));
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([{ id: "qc-sequence-1" }]),
      manufacturingDocumentNumber: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => ({
          id: "number-1",
          documentNumber: "QCI-2026-0001",
          ...data,
        })),
      },
      manufacturingDocumentSequence: {
        findUnique: vi.fn().mockResolvedValue({
          id: "qc-sequence-1",
          isActive: true,
          prefix: "QCI",
          padding: 4,
          resetAnnually: true,
          resetPeriod: "ANNUAL",
          nextNumber: 1,
          lastIssuedPeriod: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      manufacturingQualityInspection: { create: createInspection },
      manufacturingSerial: { update: vi.fn().mockResolvedValue({}) },
      manufacturingWorkflowReview: { update: vi.fn().mockResolvedValue({}) },
    };
    const service = new ManufacturingPackagingService(
      prisma as never,
      {} as never,
      electronicSignature,
      approvalWorkflow as never,
    );
    vi.spyOn(service as any, "scope").mockResolvedValue({
      id: "workspace-1",
      tenantId: "tenant-1",
      companyId: "company-1",
    });
    vi.spyOn(service as any, "order").mockResolvedValue({
      id: "order-1",
      orderNumber: "MO-0001",
      createdByUserId: "maker-1",
      finishedProductId: "finished-1",
      lots: [{ id: "lot-1", lotNumber: "LOT-1" }],
    });
    vi.spyOn(service as any, "auditReplay").mockResolvedValue(null);
    vi.spyOn(service as any, "assertPeriodOpen").mockResolvedValue(undefined);
    vi.spyOn(service as any, "serializable").mockImplementation(((
      operation: (value: unknown) => Promise<unknown>,
    ) => operation(tx)) as any);

    await service.recordSerialQuality({ id: "reviewer-1" } as never, {
      workspaceId: "workspace-1",
      orderId: "order-1",
      orderLotId: "lot-1",
      idempotencyKey: "serial-qc-stage-2",
      transactionDate: reviewerAt,
      signatureMeaning: "Rejected by QA",
      inspections: [
        {
          serialId: "serial-1",
          passed: false,
          holdReason: "Visual defect",
          results: [
            {
              parameterCode: "APPEARANCE",
              parameterName: "Appearance",
              actualText: "DAMAGED",
              passed: false,
            },
          ],
        },
      ],
    });

    expect(createInspection).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          createdByUserId: "inspector-1",
          inspectedByUserId: "inspector-1",
          inspectedAt: inspectorAt,
          approvedByUserId: "reviewer-1",
          approvedAt: new Date(reviewerAt),
        }),
      }),
    );
  });

  it("keeps serial QC approval evidence stable across reviewer credentials and idempotency keys", () => {
    const common = {
      workspaceId: "workspace-1",
      orderId: "order-1",
      orderLotId: "lot-1",
      transactionDate: "2026-09-22T00:00:00.000Z",
      inspections: [
        {
          serialId: "serial-1",
          passed: true,
          results: [
            {
              parameterCode: "APPEARANCE",
              parameterName: "Appearance",
              actualText: "CLEAR",
              passed: true,
            },
          ],
        },
      ],
    };
    const first = manufacturingSerialQcApprovalEntityId(
      { id: "workspace-1", tenantId: "tenant-1", companyId: "company-1" },
      {
        ...common,
        idempotencyKey: "stage-1",
        signatureMeaning: "Inspected",
        reauthenticationPassword: "first-secret",
      },
    );
    const second = manufacturingSerialQcApprovalEntityId(
      { id: "workspace-1", tenantId: "tenant-1", companyId: "company-1" },
      {
        ...common,
        idempotencyKey: "stage-2",
        signatureMeaning: "Approved",
        reauthenticationPassword: "second-secret",
      },
    );

    expect(second).toBe(first);
    expect(first).not.toContain("first-secret");
    expect(second).not.toContain("second-secret");
  });

  it("blocks pharmaceutical packaging release readiness for legacy same-user serial QC", async () => {
    const prisma = {
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue({ mode: "PHARMACEUTICAL" }),
      },
      manufacturingSerial: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "serial-1",
            serialNumber: "SER-0001",
            inventoryLotId: "inventory-lot-1",
            status: "QC_HOLD",
            qualityInspections: [
              {
                status: "PASSED",
                inspectedByUserId: "user-1",
                approvedByUserId: "user-1",
              },
            ],
          },
        ]),
      },
      manufacturingTransaction: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "receipt-1",
            transactionDate: new Date("2026-09-21T12:00:00.000Z"),
            lines: [{ quantity: decimal("1") }],
          },
        ]),
      },
      $transaction: vi.fn(),
    };
    const service = new ManufacturingPackagingService(
      prisma as never,
      {} as never,
      electronicSignature,
      {} as never,
    );
    vi.spyOn(service as any, "requirePermission").mockResolvedValue(undefined);
    vi.spyOn(service as any, "scope").mockResolvedValue({
      id: "workspace-1",
      tenantId: "tenant-1",
      companyId: "company-1",
    });
    vi.spyOn(service as any, "assertPeriodOpen").mockResolvedValue(undefined);
    vi.spyOn(service as any, "packagingOrder").mockResolvedValue({
      id: "packaging-order-1",
      orderId: "order-1",
      orderLotId: null,
      status: "RECONCILED",
      plannedQuantity: decimal("1"),
      lineClearedAt: new Date("2026-09-21T00:00:00.000Z"),
      lineClearanceReference: "LC-1",
      order: {
        finishedProductId: "finished-1",
        completedQuantity: decimal("1"),
      },
      packagingConfiguration: {
        status: "APPROVED",
        inventoryItemId: "finished-1",
        approvedAt: new Date("2026-09-20T00:00:00.000Z"),
        effectiveFrom: null,
        effectiveTo: null,
        lines: [],
      },
      reconciliations: [],
      labels: [],
      packageUnits: [],
      events: [
        "LINE_CLEARANCE",
        "EXECUTION",
        "RECONCILIATION",
        "LABEL_CONTROL",
        "AGGREGATION",
      ].map((eventType) => ({ eventType })),
    });

    await expect(
      service.confirmReleaseReadiness(
        { id: "release-user" } as never,
        "packaging-order-1",
        {
          workspaceId: "workspace-1",
          idempotencyKey: "release-ready-1",
          transactionDate: "2026-09-22T00:00:00.000Z",
          signatureMeaning: "Released by QA",
        },
      ),
    ).rejects.toThrow("independently approved by a different authorized user");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates one order-material row per component for multiple packaging lots", async () => {
    const create = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: `material-${String(data.inventoryItemId)}`,
        ...data,
      }),
    );
    const tx = {
      manufacturingPackagingOrder: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            packagingOrder("pack-lot-01", "2.0000"),
            packagingOrder("pack-lot-02", "3.0000"),
          ]),
      },
      manufacturingOrderMaterial: {
        findMany: vi.fn().mockResolvedValue([]),
        create,
        update: vi.fn(),
      },
    };
    const service = new ManufacturingPackagingService(
      {} as never,
      {} as never,
      electronicSignature,
      {} as never,
    );

    const synced = await (
      service as unknown as {
        syncPackagingOrderMaterials(
          transaction: unknown,
          orderId: string,
        ): Promise<Array<{ inventoryItemId: string; plannedQuantity: string }>>;
      }
    ).syncPackagingOrderMaterials(tx, "order-1");

    expect(create).toHaveBeenCalledTimes(2);
    expect(
      create.mock.calls.map(([call]) => ({
        inventoryItemId: call.data.inventoryItemId,
        plannedQuantity: (call.data.plannedQuantity as Prisma.Decimal).toFixed(
          4,
        ),
      })),
    ).toEqual([
      { inventoryItemId: "carton", plannedQuantity: "5.0000" },
      { inventoryItemId: "label", plannedQuantity: "10.0000" },
    ]);
    expect(synced).toHaveLength(2);
  });

  it("reuses a BOM-backed packaging row and never reduces its approved baseline", async () => {
    const existing = materialRow({
      id: "material-carton",
      inventoryItemId: "carton",
      plannedQuantity: "10.0000",
      bomComponentId: "bom-component-carton",
    });
    const update = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...existing,
        ...data,
      }),
    );
    const tx = {
      manufacturingPackagingOrder: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...packagingOrder("pack-lot-01", "2.0000"),
            packagingConfiguration: {
              lines: [packagingOrder("x", "1").packagingConfiguration.lines[0]],
            },
          },
        ]),
      },
      manufacturingOrderMaterial: {
        findMany: vi.fn().mockResolvedValue([existing]),
        create: vi.fn(),
        update,
      },
    };
    const service = new ManufacturingPackagingService(
      {} as never,
      {} as never,
      electronicSignature,
      {} as never,
    );

    await (
      service as unknown as {
        syncPackagingOrderMaterials(
          transaction: unknown,
          orderId: string,
        ): Promise<unknown>;
      }
    ).syncPackagingOrderMaterials(tx, "order-1");

    expect(tx.manufacturingOrderMaterial.create).not.toHaveBeenCalled();
    expect(
      (update.mock.calls[0][0].data.plannedQuantity as Prisma.Decimal).toFixed(
        4,
      ),
    ).toBe("10.0000");
  });

  it("expands an existing derived row and reopens its issue status for the next lot", async () => {
    const existing = materialRow({
      id: "material-carton",
      inventoryItemId: "carton",
      plannedQuantity: "2.0000",
      issuedQuantity: "2.0000",
    });
    const update = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...existing,
        ...data,
      }),
    );
    const tx = {
      manufacturingPackagingOrder: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...packagingOrder("pack-lot-01", "2.0000"),
            packagingConfiguration: {
              lines: [packagingOrder("x", "1").packagingConfiguration.lines[0]],
            },
          },
          {
            ...packagingOrder("pack-lot-02", "3.0000"),
            packagingConfiguration: {
              lines: [packagingOrder("x", "1").packagingConfiguration.lines[0]],
            },
          },
        ]),
      },
      manufacturingOrderMaterial: {
        findMany: vi.fn().mockResolvedValue([existing]),
        create: vi.fn(),
        update,
      },
    };
    const service = new ManufacturingPackagingService(
      {} as never,
      {} as never,
      electronicSignature,
      {} as never,
    );

    await (
      service as unknown as {
        syncPackagingOrderMaterials(
          transaction: unknown,
          orderId: string,
        ): Promise<unknown>;
      }
    ).syncPackagingOrderMaterials(tx, "order-1");

    expect(
      (update.mock.calls[0][0].data.plannedQuantity as Prisma.Decimal).toFixed(
        4,
      ),
    ).toBe("5.0000");
    expect(update.mock.calls[0][0].data.status).toBe("PARTIALLY_ISSUED");
  });

  it("atomically reserves only the unreserved packaging top-up for a progressed order", async () => {
    const material = {
      ...materialRow({
        id: "material-carton",
        inventoryItemId: "carton",
        plannedQuantity: "5.0000",
        issuedQuantity: "2.0000",
      }),
      inventoryItem: {
        itemName: "Shipping carton",
        manufacturingProfile: {
          isActive: true,
          role: "PACKAGING_MATERIAL",
          lotTracked: false,
        },
      },
    };
    const createReservation = vi.fn(
      async ({ data }: ReservationCreateInput) => ({
        id: "reservation-1",
        reservationNumber: data.reservationNumber,
        lines: data.lines.create.map(
          (line: Record<string, unknown>, index: number) => ({
            id: `line-${index}`,
            ...line,
          }),
        ),
      }),
    );
    const updateMaterial = vi.fn();
    const updateOrder = vi.fn();
    const tx = {
      manufacturingOrderMaterial: {
        findMany: vi.fn().mockResolvedValue([material]),
        update: updateMaterial,
      },
      stockMovement: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { inventoryItemId: "carton", balanceQuantity: decimal("10.0000") },
          ]),
      },
      manufacturingReservationLine: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
      manufacturingInventoryLot: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      manufacturingReservation: { create: createReservation },
      manufacturingOrder: { update: updateOrder },
    };
    const service = new ManufacturingPackagingService(
      {} as never,
      {} as never,
      electronicSignature,
      {} as never,
    );

    const result = await (
      service as unknown as {
        reservePackagingMaterialTopUp(
          transaction: unknown,
          scope: { id: string; tenantId: string; companyId: string },
          user: { id: string },
          order: Record<string, unknown>,
          requirements: Array<Record<string, unknown>>,
          when: Date,
          idempotencyKey: string,
        ): Promise<{
          ready: boolean;
          reservation: { lines: Array<{ quantity: string }> } | null;
          shortages: Array<Record<string, unknown>>;
        }>;
      }
    ).reservePackagingMaterialTopUp(
      tx,
      { id: "workspace-1", tenantId: "tenant-1", companyId: "company-1" },
      { id: "user-1" },
      {
        id: "order-1",
        status: "IN_PRODUCTION",
        issueWarehouseId: "warehouse-rm",
        issueLocationId: null,
      },
      [
        {
          orderMaterialId: "material-carton",
          inventoryItemId: "carton",
          unit: "pcs",
          configurationRequiredQuantity: "5.0000",
          plannedQuantity: "5.0000",
          sourcePackagingOrderIds: ["pack-lot-01", "pack-lot-02"],
          created: false,
        },
      ],
      new Date("2026-09-20T00:00:00.000Z"),
      "package-key:PACKAGING-RESERVATION",
    );

    expect(result).toMatchObject({ ready: true, shortages: [] });
    expect(result.reservation?.lines).toEqual([
      expect.objectContaining({ quantity: "3.0000" }),
    ]);
    expect(
      (
        createReservation.mock.calls[0][0].data.lines.create[0]
          .quantity as Prisma.Decimal
      ).toFixed(4),
    ).toBe("3.0000");
    expect(updateMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "material-carton" },
        data: expect.objectContaining({
          reservedQuantity: { increment: expect.anything() },
        }),
      }),
    );
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it("uses released FEFO lots for a lot-tracked packaging reservation", async () => {
    const material = {
      ...materialRow({
        id: "material-label",
        inventoryItemId: "label",
        plannedQuantity: "2.0000",
      }),
      inventoryItem: {
        itemName: "Regulated label",
        manufacturingProfile: {
          isActive: true,
          role: "PACKAGING_MATERIAL",
          lotTracked: true,
        },
      },
    };
    const lots = [
      {
        id: "lot-later",
        inventoryItemId: "label",
        lotNumber: "LABEL-02",
        unit: "pcs",
        availableQuantity: decimal("2.0000"),
        reservedQuantity: decimal("0"),
        expiresAt: new Date("2027-06-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: "lot-sooner",
        inventoryItemId: "label",
        lotNumber: "LABEL-01",
        unit: "pcs",
        availableQuantity: decimal("1.5000"),
        reservedQuantity: decimal("0"),
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-02T00:00:00.000Z"),
      },
    ];
    const createReservation = vi.fn(
      async ({ data }: ReservationCreateInput) => ({
        id: "reservation-2",
        reservationNumber: data.reservationNumber,
        lines: data.lines.create.map(
          (line: Record<string, unknown>, index: number) => ({
            id: `line-${index}`,
            ...line,
          }),
        ),
      }),
    );
    const updateLot = vi.fn();
    const tx = {
      manufacturingOrderMaterial: {
        findMany: vi.fn().mockResolvedValue([material]),
        update: vi.fn(),
      },
      stockMovement: { findMany: vi.fn().mockResolvedValue([]) },
      manufacturingReservationLine: { groupBy: vi.fn().mockResolvedValue([]) },
      manufacturingInventoryLot: {
        findMany: vi.fn().mockResolvedValue(lots),
        update: updateLot,
      },
      manufacturingReservation: { create: createReservation },
      manufacturingOrder: { update: vi.fn() },
    };
    const service = new ManufacturingPackagingService(
      {} as never,
      {} as never,
      electronicSignature,
      {} as never,
    );

    await (
      service as unknown as {
        reservePackagingMaterialTopUp(
          transaction: unknown,
          scope: { id: string; tenantId: string; companyId: string },
          user: { id: string },
          order: Record<string, unknown>,
          requirements: Array<Record<string, unknown>>,
          when: Date,
          idempotencyKey: string,
        ): Promise<unknown>;
      }
    ).reservePackagingMaterialTopUp(
      tx,
      { id: "workspace-1", tenantId: "tenant-1", companyId: "company-1" },
      { id: "user-1" },
      {
        id: "order-1",
        status: "IN_PRODUCTION",
        issueWarehouseId: "warehouse-rm",
        issueLocationId: null,
      },
      [
        {
          orderMaterialId: "material-label",
          configurationRequiredQuantity: "2.0000",
        },
      ],
      new Date("2026-09-20T00:00:00.000Z"),
      "package-key:PACKAGING-RESERVATION",
    );

    const lines = createReservation.mock.calls[0][0].data.lines.create;
    expect(
      lines.map((line: ReservationLineInput) => ({
        inventoryLotId: line.inventoryLotId,
        quantity: line.quantity.toFixed(4),
      })),
    ).toEqual([
      { inventoryLotId: "lot-sooner", quantity: "1.5000" },
      { inventoryLotId: "lot-later", quantity: "0.5000" },
    ]);
    expect(updateLot).toHaveBeenCalledTimes(2);
  });

  it("returns exact shortage evidence without creating any partial reservation or stock mutation", async () => {
    const material = {
      ...materialRow({
        id: "material-carton",
        inventoryItemId: "carton",
        plannedQuantity: "5.0000",
      }),
      inventoryItem: {
        itemCode: "PK-CARTON",
        itemName: "Shipping carton",
        manufacturingProfile: {
          isActive: true,
          role: "PACKAGING_MATERIAL",
          lotTracked: false,
        },
      },
    };
    const tx = {
      manufacturingOrderMaterial: {
        findMany: vi.fn().mockResolvedValue([material]),
        update: vi.fn(),
      },
      stockMovement: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { inventoryItemId: "carton", balanceQuantity: decimal("2.0000") },
          ]),
      },
      manufacturingReservationLine: { groupBy: vi.fn().mockResolvedValue([]) },
      manufacturingInventoryLot: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      manufacturingReservation: { create: vi.fn() },
      manufacturingOrder: { update: vi.fn() },
    };
    const service = new ManufacturingPackagingService(
      {} as never,
      {} as never,
      electronicSignature,
      {} as never,
    );
    const result = await (
      service as unknown as {
        reservePackagingMaterialTopUp(
          transaction: unknown,
          scope: { id: string; tenantId: string; companyId: string },
          user: { id: string },
          order: Record<string, unknown>,
          requirements: Array<Record<string, unknown>>,
          when: Date,
          idempotencyKey: string,
        ): Promise<{
          ready: boolean;
          reservation: unknown;
          shortages: Array<Record<string, unknown>>;
        }>;
      }
    ).reservePackagingMaterialTopUp(
      tx,
      { id: "workspace-1", tenantId: "tenant-1", companyId: "company-1" },
      { id: "user-1" },
      {
        id: "order-1",
        status: "IN_PRODUCTION",
        issueWarehouseId: "warehouse-rm",
        issueLocationId: null,
      },
      [
        {
          orderMaterialId: "material-carton",
          configurationRequiredQuantity: "5.0000",
        },
      ],
      new Date("2026-09-20T00:00:00.000Z"),
      "package-short:PACKAGING-RESERVATION",
    );

    expect(result).toEqual({
      ready: false,
      reservation: null,
      shortages: [
        {
          orderMaterialId: "material-carton",
          inventoryItemId: "carton",
          itemCode: "PK-CARTON",
          itemName: "Shipping carton",
          lotTracked: false,
          requiredQuantity: "5.0000",
          availableQuantity: "2.0000",
          shortageQuantity: "3.0000",
          unit: "pcs",
          warehouseId: "warehouse-rm",
        },
      ],
    });
    expect(tx.manufacturingReservation.create).not.toHaveBeenCalled();
    expect(tx.manufacturingInventoryLot.update).not.toHaveBeenCalled();
    expect(tx.manufacturingOrderMaterial.update).not.toHaveBeenCalled();
    expect(tx.manufacturingOrder.update).not.toHaveBeenCalled();
  });

  it("moves MATERIAL_SHORT to DRAFT only after an atomic retry reservation succeeds", async () => {
    const prisma = {} as Record<string, unknown>;
    const service = new ManufacturingPackagingService(
      prisma as never,
      {} as never,
      electronicSignature,
      {} as never,
    );
    const current = {
      id: "packaging-order-1",
      orderId: "order-1",
      packagingOrderNumber: "PKO-0001",
      status: "MATERIAL_SHORT",
      materialShortage: {
        lines: [{ inventoryItemId: "carton", shortageQuantity: "3.0000" }],
      },
    };
    const ready = { ...current, status: "DRAFT", materialShortage: null };
    const tx = {
      manufacturingWorkflowReview: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue({ reservationRequired: true }),
      },
      manufacturingPackagingOrder: { update: vi.fn().mockResolvedValue(ready) },
    };
    vi.spyOn(service as any, "requirePermission").mockResolvedValue(undefined);
    vi.spyOn(service as any, "scope").mockResolvedValue({
      id: "workspace-1",
      tenantId: "tenant-1",
      companyId: "company-1",
    });
    vi.spyOn(service as any, "auditReplay").mockResolvedValue(null);
    vi.spyOn(service as any, "serializable").mockImplementation(
      async (operation: any) => operation(tx),
    );
    vi.spyOn(service as any, "assertPeriodOpen").mockResolvedValue(undefined);
    vi.spyOn(service as any, "packagingOrder")
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(ready);
    vi.spyOn(service as any, "order").mockResolvedValue({
      id: "order-1",
      status: "IN_PRODUCTION",
      issueWarehouseId: "warehouse-rm",
    });
    vi.spyOn(service as any, "syncPackagingOrderMaterials").mockResolvedValue(
      [],
    );
    vi.spyOn(service as any, "reservePackagingMaterialTopUp").mockResolvedValue(
      {
        ready: true,
        shortages: [],
        reservation: {
          reservationId: "reservation-1",
          reservationNumber: "PKR-1",
          warehouseId: "warehouse-rm",
          sourceLotIds: [],
          lines: [],
        },
      },
    );
    const audit = vi.spyOn(service as any, "audit").mockResolvedValue({});

    const result = await service.retryPackagingMaterialReservation(
      { id: "user-1" } as never,
      "packaging-order-1",
      {
        workspaceId: "workspace-1",
        idempotencyKey: "retry-1",
        transactionDate: "2026-09-21T00:00:00.000Z",
        signatureMeaning: "Packaging stock reservation retried",
      },
    );

    expect(tx.manufacturingPackagingOrder.update).toHaveBeenCalledWith({
      where: { id: "packaging-order-1" },
      data: { status: "DRAFT", materialShortage: Prisma.DbNull },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        workflowCode: "PACKAGING_MATERIAL_RESERVE",
        evidence: expect.objectContaining({ resultingStatus: "DRAFT" }),
      }),
    );
    expect(result.packagingOrder.status).toBe("DRAFT");
  });

  it("aggregates every lot's packaging issues for an order-level reconciliation", async () => {
    const current = {
      id: "packaging-order-all",
      orderId: "order-1",
      orderLotId: null,
      lineClearedAt: new Date("2026-09-20T00:00:00.000Z"),
      status: "LINE_CLEARED",
      plannedQuantity: decimal("10"),
      packagingConfiguration: {
        lines: [
          {
            inventoryItemId: "carton",
            quantity: decimal("1"),
            unit: "pcs",
            inventoryItem: { itemName: "Shipping carton" },
          },
        ],
      },
    };
    const transactions = ["lot-1", "lot-2", "lot-3", "lot-4"].map(
      (orderLotId, index) => ({
        id: `issue-${index + 1}`,
        orderLotId,
        transactionType: "PACKAGING_ISSUE",
        lines: [{ inventoryItemId: "carton", quantity: decimal("2.5") }],
      }),
    );
    const eventCreate = vi.fn().mockImplementation(({ data }) => ({
      id: `event-${data.sequence}`,
      ...data,
    }));
    const tx = {
      manufacturingPackagingEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        aggregate: vi.fn().mockResolvedValue({ _max: { sequence: 0 } }),
        create: eventCreate,
      },
      manufacturingPackagingReconciliation: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      manufacturingPackagingOrder: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      manufacturingTransaction: {
        findMany: vi.fn().mockResolvedValue(transactions),
      },
      $transaction: vi
        .fn()
        .mockImplementation(
          (operation: (transaction: unknown) => Promise<unknown>) =>
            operation(tx),
        ),
    };
    const service = new ManufacturingPackagingService(
      prisma as never,
      {} as never,
      electronicSignature,
      {} as never,
    );
    vi.spyOn(service as any, "requirePermission").mockResolvedValue(undefined);
    vi.spyOn(service as any, "scope").mockResolvedValue({
      id: "workspace-1",
      tenantId: "tenant-1",
      companyId: "company-1",
    });
    vi.spyOn(service as any, "assertPeriodOpen").mockResolvedValue(undefined);
    vi.spyOn(service as any, "packagingOrder").mockResolvedValue(current);

    await service.reconcilePackaging(
      { id: "user-1" } as never,
      "packaging-order-all",
      {
        workspaceId: "workspace-1",
        idempotencyKey: "reconcile-all",
        transactionDate: "2026-09-21T00:00:00.000Z",
        signatureMeaning: "Packaging reconciled",
        lines: [
          {
            inventoryItemId: "carton",
            usedQuantity: 10,
            returnedQuantity: 0,
            rejectedQuantity: 0,
            destroyedQuantity: 0,
            unit: "pcs",
          },
        ],
      },
    );

    const transactionWhere =
      prisma.manufacturingTransaction.findMany.mock.calls[0][0].where;
    expect(transactionWhere).not.toHaveProperty("orderLotId");
    expect(tx.manufacturingPackagingReconciliation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ issuedQuantity: decimal("10") }),
      }),
    );
  });

  it("keeps the reauthentication password out of packaging audit evidence and signature hashes", async () => {
    const create = vi
      .fn()
      .mockImplementation(({ data }) => ({ id: "review-1", ...data }));
    const safeElectronicSignature = {
      enforce: vi.fn().mockResolvedValue({
        policyRecordId: "policy-1",
        policyCode: "E-SIGN",
        policyVersion: 1,
        reauthenticated: true,
        sessionValidated: true,
      }),
    };
    const service = new ManufacturingPackagingService(
      {} as never,
      {} as never,
      safeElectronicSignature as never,
      {} as never,
    );
    const review = await (service as any).audit(
      { manufacturingWorkflowReview: { create } },
      { id: "workspace-1", tenantId: "tenant-1", companyId: "company-1" },
      { id: "checker-1" },
      {
        workflowCode: "PACKAGING_RELEASE_READY",
        entityType: "MANUFACTURING_PACKAGING_ORDER",
        entityId: "packaging-order-1",
        title: "Confirm packaging release readiness",
        evidence: { status: "RELEASE_READY" },
        dto: {
          workspaceId: "workspace-1",
          idempotencyKey: "release-ready-1",
          transactionDate: "2026-09-22T00:00:00.000Z",
          signatureMeaning: "Released",
          reauthenticationPassword: "do-not-persist-this-password",
        },
      },
    );

    expect(JSON.stringify(review.evidence)).not.toContain(
      "do-not-persist-this-password",
    );
    expect(review.signatureHash).not.toContain("do-not-persist-this-password");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: expect.objectContaining({
            status: "RELEASE_READY",
            electronicSignaturePolicy: expect.objectContaining({
              policyRecordId: "policy-1",
            }),
          }),
        }),
      }),
    );
  });

  it("enforces the approved signature policy for packaging events without persisting the password", async () => {
    const create = vi
      .fn()
      .mockImplementation(({ data }) => ({ id: "event-1", ...data }));
    const safeElectronicSignature = {
      enforce: vi.fn().mockResolvedValue({
        policyRecordId: "policy-1",
        policyCode: "E-SIGN",
        policyVersion: 1,
        reauthenticated: true,
        sessionValidated: true,
      }),
    };
    const service = new ManufacturingPackagingService(
      {} as never,
      {} as never,
      safeElectronicSignature as never,
      {} as never,
    );
    const result = await (service as any).appendEvent(
      {
        manufacturingPackagingEvent: {
          findUnique: vi.fn().mockResolvedValue(null),
          aggregate: vi.fn().mockResolvedValue({ _max: { sequence: null } }),
          create,
        },
      },
      { id: "workspace-1", tenantId: "tenant-1", companyId: "company-1" },
      { id: "checker-1" },
      "packaging-order-1",
      "RELEASE_READINESS",
      {
        workspaceId: "workspace-1",
        idempotencyKey: "release-ready-event-1",
        transactionDate: "2026-09-22T00:00:00.000Z",
        signatureMeaning: "Released",
        reauthenticationPassword: "do-not-persist-this-password",
      },
      { status: "RELEASE_READY" },
    );

    expect(safeElectronicSignature.enforce).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reauthenticationPassword: "do-not-persist-this-password",
        required: true,
      }),
    );
    expect(JSON.stringify(result.event.payload)).not.toContain(
      "do-not-persist-this-password",
    );
    expect(result.event.signatureHash).not.toContain(
      "do-not-persist-this-password",
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            status: "RELEASE_READY",
            electronicSignaturePolicy: expect.objectContaining({
              policyRecordId: "policy-1",
            }),
          }),
        }),
      }),
    );
  });
});
