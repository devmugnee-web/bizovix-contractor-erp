import { describe, expect, it, vi } from "vitest";

import { Prisma } from "../generated/prisma/index.js";
import { ManufacturingService } from "./manufacturing.service.js";

const scope = {
  id: "workspace-1",
  tenantId: "tenant-1",
  companyId: "company-1",
};
const when = new Date("2026-09-12T00:00:00.000Z");
const operator = { id: "operator-1" } as never;

const specification = {
  id: "quality-specification-1",
  code: "IPQC-FRIDGE",
  versionNumber: 3,
};

function service() {
  return new ManufacturingService(
    {} as never,
    {} as never,
    { advance: vi.fn() } as never,
    { enforce: vi.fn().mockResolvedValue({ policyId: "policy-1" }) } as never,
  );
}

function internals(instance: ManufacturingService) {
  return instance as unknown as {
    resolveApplicableQualitySpecification: (
      ...args: unknown[]
    ) => Promise<typeof specification>;
    assertOperationIpcPassed: (
      tx: Prisma.TransactionClient,
      scopeValue: typeof scope,
      order: Record<string, unknown>,
      execution: Record<string, unknown>,
      goodQuantity: Prisma.Decimal,
      transactionDate: Date,
    ) => Promise<Record<string, unknown>>;
    assertResponsibleOperationQualification: (
      tx: Prisma.TransactionClient,
      scopeValue: typeof scope,
      settings: Record<string, unknown>,
      execution: Record<string, unknown>,
      responsibleUserId: string,
      transactionDate: Date,
    ) => Promise<Record<string, unknown>>;
    materializeOperationWipOutput: (
      tx: Prisma.TransactionClient,
      scopeValue: typeof scope,
      currentUser: typeof operator,
      order: Record<string, unknown>,
      settings: Record<string, unknown>,
      execution: Record<string, unknown>,
      inputQuantity: Prisma.Decimal,
      goodQuantity: Prisma.Decimal,
      hasNextOperation: boolean,
      transactionDate: Date,
    ) => Promise<Record<string, unknown>>;
    activeWarehouse: (...args: unknown[]) => Promise<Record<string, unknown>>;
    activeLocation: (...args: unknown[]) => Promise<Record<string, unknown>>;
    applyInventoryLotTransfer: (
      tx: Prisma.TransactionClient,
      workspaceId: string,
      lines: Array<Record<string, unknown>>,
      fromWarehouseId: string,
      toWarehouseId: string,
      transactionType: "MATERIAL_ISSUE",
      transactionDate: Date,
    ) => Promise<void>;
    executeAction: (
      tx: Prisma.TransactionClient,
      scopeValue: typeof scope,
      currentUser: typeof operator,
      orderId: string,
      dto: Record<string, unknown>,
    ) => Promise<unknown>;
  };
}

function operation(input?: {
  id?: string;
  code?: string;
  sequence?: number;
  status?: string;
  qcRequired?: boolean;
  responsibleUserId?: string | null;
}) {
  return {
    id: input?.id ?? "execution-mix",
    orderId: "order-1",
    orderLotId: "order-lot-1",
    status: input?.status ?? "IN_PROGRESS",
    plannedQuantity: new Prisma.Decimal(10),
    routingOperation: {
      id: `routing-${input?.id ?? "mix"}`,
      code: input?.code ?? "MIX",
      name: input?.code ?? "Mixing",
      sequence: input?.sequence ?? 1,
      qcRequired: input?.qcRequired ?? true,
      responsibleUserId: input?.responsibleUserId ?? "operator-1",
    },
  };
}

function passingInspection() {
  return {
    id: "inspection-pass-1",
    inspectionType: "IN_PROCESS",
    status: "PASSED",
    orderId: "order-1",
    orderLotId: "order-lot-1",
    operationExecutionId: "execution-mix",
    sampleQuantity: new Prisma.Decimal(9),
    acceptedQuantity: new Prisma.Decimal(9),
    rejectedQuantity: new Prisma.Decimal(0),
    inspectedAt: when,
    createdAt: when,
    results: [{ parameterCode: "TEMP", passed: true }],
  };
}

function approvedInspectionReview() {
  return {
    id: "ipqc-review-1",
    workflowCode: "ORDER_ACTION",
    status: "APPROVED",
    evidence: {
      kind: "RECORD_IN_PROCESS_RESULT",
      inProcessInspection: {
        inspectionId: "inspection-pass-1",
        inspectionStatus: "PASSED",
        operationExecutionId: "execution-mix",
        orderLotId: "order-lot-1",
        qualitySpecificationId: specification.id,
      },
    },
  };
}

function orderRecord(overrides: Record<string, unknown> = {}) {
  const currentOperation = operation();
  return {
    id: "order-1",
    orderNumber: "MO-001",
    status: "IN_PRODUCTION",
    createdByUserId: "maker-1",
    fiscalYearId: "fy-1",
    finishedProductId: "finished-1",
    finishedProduct: {
      manufacturingProfile: {
        isActive: true,
        role: "INTERMEDIATE",
        shelfLifeDays: null,
      },
    },
    unit: "pcs",
    plannedQuantity: new Prisma.Decimal(10),
    actualStartAt: when,
    materials: [],
    reservations: [],
    transactions: [],
    qualityInspections: [passingInspection()],
    serials: [],
    packagingOrders: [],
    costSnapshots: [],
    workflowReviews: [approvedInspectionReview()],
    lots: [
      {
        id: "order-lot-1",
        lotNumber: "LOT-001",
        plannedQuantity: new Prisma.Decimal(10),
        status: "IN_PRODUCTION",
      },
    ],
    operationExecutions: [currentOperation],
    ...overrides,
  };
}

describe("operation completion controls", () => {
  it("fails closed unless the latest exact operation/lot IPC is an approved current-spec PASS matching good output", async () => {
    const instance = service();
    const subject = internals(instance);
    vi.spyOn(
      subject,
      "resolveApplicableQualitySpecification",
    ).mockResolvedValue(specification);
    const currentOperation = operation();
    const passingOrder = orderRecord();

    await expect(
      subject.assertOperationIpcPassed(
        {} as Prisma.TransactionClient,
        scope,
        passingOrder,
        currentOperation,
        new Prisma.Decimal(9),
        when,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        required: true,
        inspectionId: "inspection-pass-1",
        qualitySpecificationId: specification.id,
      }),
    );

    const failedInspection = {
      ...passingInspection(),
      id: "inspection-failed-latest",
      status: "FAILED",
      inspectedAt: new Date("2026-09-12T01:00:00.000Z"),
      createdAt: new Date("2026-09-12T01:00:00.000Z"),
      results: [{ parameterCode: "TEMP", passed: false }],
    };
    await expect(
      subject.assertOperationIpcPassed(
        {} as Prisma.TransactionClient,
        scope,
        orderRecord({
          qualityInspections: [passingInspection(), failedInspection],
        }),
        currentOperation,
        new Prisma.Decimal(9),
        when,
      ),
    ).rejects.toThrow("latest in-process result");

    await expect(
      subject.assertOperationIpcPassed(
        {} as Prisma.TransactionClient,
        scope,
        orderRecord(),
        currentOperation,
        new Prisma.Decimal(8),
        when,
      ),
    ).rejects.toThrow("must exactly match 8 good output");
  });

  it("materializes one idempotent, traceable intermediate WIP lot from exact good quantity/cost and creates no stock or GL posting", async () => {
    const instance = service();
    const subject = internals(instance);
    vi.spyOn(subject, "activeWarehouse").mockResolvedValue({
      id: "warehouse-wip",
    });
    vi.spyOn(subject, "activeLocation").mockResolvedValue({
      id: "location-wip",
      disposition: "WIP",
    });
    const currentOperation = operation({ qcRequired: false });
    const nextOperation = operation({
      id: "execution-pack",
      code: "PACK",
      sequence: 2,
      status: "PENDING",
      qcRequired: false,
    });
    const order = orderRecord({
      operationExecutions: [currentOperation, nextOperation],
      transactions: [
        {
          status: "POSTED",
          transactionType: "MATERIAL_ISSUE",
          orderLotId: "order-lot-1",
          lines: [{ totalCost: new Prisma.Decimal(1_000) }],
        },
      ],
    });
    let replayRecord: Record<string, unknown> | null = null;
    const transactionCreate = vi.fn().mockImplementation(({ data }) => {
      replayRecord = {
        id: data.id,
        status: "POSTED",
        orderId: data.orderId,
        orderLotId: data.orderLotId,
        operationExecutionId: data.operationExecutionId,
        lines: [
          {
            id: data.lines.create[0].id,
            quantity: data.lines.create[0].quantity,
            totalCost: data.lines.create[0].totalCost,
            destinationInventoryLotId: "created-output-lot",
          },
        ],
      };
      return { id: data.id };
    });
    const inventoryLotCreate = vi.fn().mockResolvedValue({
      id: "created-output-lot",
    });
    const tx = {
      manufacturingTransaction: {
        findUnique: vi.fn().mockImplementation(() => replayRecord),
        create: transactionCreate,
      },
      manufacturingInventoryLot: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          id: "created-output-lot",
          lotNumber: "LOT-001-MIX-WIP",
          receivedQuantity: new Prisma.Decimal(9),
        }),
        create: inventoryLotCreate,
        updateMany: vi.fn(),
      },
      manufacturingTransactionLine: { update: vi.fn().mockResolvedValue({}) },
      manufacturingGenealogy: { create: vi.fn().mockResolvedValue({}) },
    };
    const settings = {
      defaultWipWarehouseId: "warehouse-wip",
      defaultWipLocationId: "location-wip",
    };

    const first = await subject.materializeOperationWipOutput(
      tx as unknown as Prisma.TransactionClient,
      scope,
      operator,
      order,
      settings,
      currentOperation,
      new Prisma.Decimal(10),
      new Prisma.Decimal(9),
      true,
      when,
    );
    const replay = await subject.materializeOperationWipOutput(
      tx as unknown as Prisma.TransactionClient,
      scope,
      operator,
      order,
      settings,
      currentOperation,
      new Prisma.Decimal(10),
      new Prisma.Decimal(9),
      true,
      when,
    );

    expect(first).toEqual(
      expect.objectContaining({
        quantity: "9",
        postedWipCost: "1000.000000",
        noStockMovement: true,
        noGeneralLedgerEntry: true,
      }),
    );
    expect(replay).toEqual(expect.objectContaining({ replayed: true }));
    expect(transactionCreate).toHaveBeenCalledTimes(1);
    expect(inventoryLotCreate).toHaveBeenCalledTimes(1);
    expect(inventoryLotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inventoryItemId: "finished-1",
        receivedQuantity: new Prisma.Decimal(9),
        availableQuantity: new Prisma.Decimal(9),
        unitCost: new Prisma.Decimal("111.111111"),
      }),
    });
    expect(transactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        transactionType: "LOCATION_TRANSFER",
        status: "POSTED",
        orderId: "order-1",
        orderLotId: "order-lot-1",
        operationExecutionId: "execution-mix",
      }),
    });
    const postedTransaction = transactionCreate.mock.calls[0][0].data;
    expect(postedTransaction).not.toHaveProperty("voucherEntryId");
  });

  it("does not create another inventory lot for the final operation", async () => {
    const instance = service();
    const subject = internals(instance);
    vi.spyOn(subject, "activeWarehouse").mockResolvedValue({
      id: "warehouse-wip",
    });
    vi.spyOn(subject, "activeLocation").mockResolvedValue({
      id: "location-wip",
      disposition: "WIP",
    });
    const currentOperation = operation({ qcRequired: false });
    const tx = {
      manufacturingTransaction: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      manufacturingInventoryLot: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
    };

    const result = await subject.materializeOperationWipOutput(
      tx as unknown as Prisma.TransactionClient,
      scope,
      operator,
      orderRecord({ operationExecutions: [currentOperation] }),
      {
        defaultWipWarehouseId: "warehouse-wip",
        defaultWipLocationId: "location-wip",
      },
      currentOperation,
      new Prisma.Decimal(10),
      new Prisma.Decimal(10),
      false,
      when,
    );

    expect(result).toEqual(
      expect.objectContaining({
        transactionId: null,
        finalOperationExcluded: true,
      }),
    );
    expect(tx.manufacturingTransaction.create).not.toHaveBeenCalled();
    expect(tx.manufacturingInventoryLot.create).not.toHaveBeenCalled();
  });

  it("allows only the assigned current workspace member to start a READY operation", async () => {
    const startOperation = operation({ status: "READY", qcRequired: false });
    const order = orderRecord({
      qualityInspections: [],
      workflowReviews: [],
      operationExecutions: [startOperation],
    });
    const operationUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      manufacturingOrder: {
        findFirst: vi.fn().mockResolvedValue(order),
      },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue({
          approvalRequired: false,
          electronicSignatureRequired: false,
        }),
      },
      manufacturingPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
      workspaceMember: {
        findUnique: vi.fn().mockResolvedValue({ id: "member-1" }),
      },
      manufacturingOperationResourceRequirement: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      manufacturingOperationExecution: { update: operationUpdate },
      manufacturingWorkflowReview: {
        create: vi.fn().mockImplementation(({ data }) => ({
          id: "start-review-1",
          transactionDate: when,
          createdAt: when,
          createdBy: { name: "Operator" },
          ...data,
        })),
      },
    };
    const instance = service();
    await internals(instance).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      operator,
      "order-1",
      {
        kind: "START_OPERATION",
        idempotencyKey: "start-operation-1",
        transactionDate: when.toISOString(),
        payload: { operationExecutionId: startOperation.id },
      },
    );

    expect(tx.workspaceMember.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_userId: {
          workspaceId: "workspace-1",
          userId: "operator-1",
        },
      },
      select: { id: true },
    });
    expect(operationUpdate).toHaveBeenCalledWith({
      where: { id: "execution-mix" },
      data: expect.objectContaining({
        status: "IN_PROGRESS",
        startedByUserId: "operator-1",
      }),
    });

    const blockedTx = {
      ...tx,
      manufacturingOperationExecution: { update: vi.fn() },
    };
    await expect(
      internals(service()).executeAction(
        blockedTx as unknown as Prisma.TransactionClient,
        scope,
        { id: "different-operator" } as never,
        "order-1",
        {
          kind: "START_OPERATION",
          idempotencyKey: "start-operation-wrong-user",
          transactionDate: when.toISOString(),
          payload: { operationExecutionId: startOperation.id },
        },
      ),
    ).rejects.toThrow("Only the responsible person");
    expect(
      blockedTx.manufacturingOperationExecution.update,
    ).not.toHaveBeenCalled();
  });

  it("requires a current QUALIFIED training record for pharmaceutical/hybrid operation start", async () => {
    const instance = service();
    const subject = internals(instance);
    const currentOperation = operation({ status: "READY", qcRequired: false });
    const qualifiedRecord = {
      id: "training-record-1",
      code: "TRN-MIX-001",
      versionNumber: 2,
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
      payload: {
        details: {
          documentType: "TRAINING_RECORD",
          subjectUserId: "operator-1",
          qualificationScope: "MIX",
          qualificationOutcome: "QUALIFIED",
        },
      },
    };
    const controlRecordFindMany = vi.fn().mockResolvedValue([qualifiedRecord]);

    await expect(
      subject.assertResponsibleOperationQualification(
        {
          manufacturingControlRecord: { findMany: controlRecordFindMany },
        } as unknown as Prisma.TransactionClient,
        scope,
        { mode: "PHARMACEUTICAL" },
        currentOperation,
        "operator-1",
        when,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        required: true,
        trainingRecordId: "training-record-1",
        qualificationOutcome: "QUALIFIED",
      }),
    );
    expect(controlRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace-1",
          kind: "VALIDATION_DOCUMENT",
          status: "APPROVED",
        }),
      }),
    );

    for (const record of [
      {
        ...qualifiedRecord,
        effectiveFrom: new Date("2026-09-13T00:00:00.000Z"),
      },
      {
        ...qualifiedRecord,
        effectiveTo: new Date("2026-09-11T00:00:00.000Z"),
      },
      {
        ...qualifiedRecord,
        payload: {
          details: {
            ...qualifiedRecord.payload.details,
            qualificationOutcome: "EXPIRED",
          },
        },
      },
    ]) {
      await expect(
        subject.assertResponsibleOperationQualification(
          {
            manufacturingControlRecord: {
              findMany: vi.fn().mockResolvedValue([record]),
            },
          } as unknown as Prisma.TransactionClient,
          scope,
          { mode: "HYBRID" },
          currentOperation,
          "operator-1",
          when,
        ),
      ).rejects.toThrow(/TRAINING_RECORD/);
    }
  });

  it("blocks material issue after the source lot retest-due date", async () => {
    const instance = service();
    const inventoryLotUpdate = vi.fn();
    const tx = {
      manufacturingInventoryLot: {
        findFirst: vi.fn().mockResolvedValue({
          id: "raw-lot-1",
          inventoryItemId: "raw-item-1",
          warehouseId: "warehouse-rm",
          lotNumber: "RM-LOT-001",
          availableQuantity: new Prisma.Decimal(10),
          reservedQuantity: new Prisma.Decimal(0),
          holdQuantity: new Prisma.Decimal(0),
          unit: "kg",
          expiresAt: null,
          retestDueAt: new Date("2026-09-11T00:00:00.000Z"),
          inventoryItem: { unit: "kg" },
        }),
        update: inventoryLotUpdate,
      },
    };

    await expect(
      internals(instance).applyInventoryLotTransfer(
        tx as unknown as Prisma.TransactionClient,
        "workspace-1",
        [
          {
            inventoryItemId: "raw-item-1",
            inventoryLotId: "raw-lot-1",
            quantity: new Prisma.Decimal(1),
            unit: "kg",
          },
        ],
        "warehouse-rm",
        "warehouse-wip",
        "MATERIAL_ISSUE",
        when,
      ),
    ).rejects.toThrow("passed its retest-due date");
    expect(inventoryLotUpdate).not.toHaveBeenCalled();
  });
});
