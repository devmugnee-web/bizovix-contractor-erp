import { describe, expect, it, vi } from "vitest";

import { Prisma } from "../generated/prisma/index.js";
import { ManufacturingService } from "./manufacturing.service.js";

const scope = {
  id: "workspace-1",
  tenantId: "tenant-1",
  companyId: "company-1",
};
const user = { id: "inspector-1" } as never;
const transactionDate = new Date("2026-09-11T00:00:00.000Z");

const specification = {
  id: "quality-specification-1",
  code: "FG-FRIDGE-IPQC",
  name: "Fridge in-process specification",
  versionNumber: 1,
  effectiveFrom: null,
  effectiveTo: null,
  approvedAt: transactionDate.toISOString(),
  parameters: [
    {
      parameterCode: "FG-FRIDGE-IPQC-01",
      parameterName: "Operating current",
      sequence: 1,
      resultType: "NUMERIC",
      unit: "A",
      testMethodRecordId: "test-method-1",
      testMethodCode: "CURRENT",
      testMethodName: "Current test",
      testMethodVersion: 1,
      testMethodSnapshot: "CURRENT v1 - Current test",
      lowerLimit: "1.5",
      upperLimit: "2.5",
      expectedText: null,
      expectedBoolean: null,
      critical: true,
      specificationText: "1.5 to 2.5",
    },
  ],
} as const;

function order(options?: {
  status?: string;
  executionStatus?: string;
  qualityInspections?: Array<Record<string, unknown>>;
}) {
  return {
    id: "order-1",
    orderNumber: "MO-2026-000001",
    status: options?.status ?? "IN_PRODUCTION",
    createdByUserId: "maker-1",
    finishedProductId: "finished-fridge-1",
    finishedProduct: { manufacturingProfile: { serialTracked: true } },
    plannedQuantity: new Prisma.Decimal(10),
    materials: [],
    reservations: [],
    transactions: [],
    qualityInspections: options?.qualityInspections ?? [],
    serials: [],
    packagingOrders: [],
    costSnapshots: [],
    workflowReviews: [],
    lots: [
      {
        id: "lot-a",
        lotNumber: "LOT-A",
        plannedQuantity: new Prisma.Decimal(2),
        completedQuantity: new Prisma.Decimal(0),
        rejectedQuantity: new Prisma.Decimal(0),
        status: "IN_PRODUCTION",
      },
    ],
    operationExecutions: [
      {
        id: "execution-a-assembly",
        orderId: "order-1",
        orderLotId: "lot-a",
        status: options?.executionStatus ?? "IN_PROGRESS",
        plannedQuantity: new Prisma.Decimal(2),
        inputQuantity: new Prisma.Decimal(0),
        routingOperation: {
          id: "routing-operation-1",
          code: "ASSEMBLY",
          name: "Assembly",
          sequence: 1,
        },
      },
    ],
  };
}

function transaction(orderRecord = order()) {
  const qualityInspectionCreate = vi
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: "inspection-1",
      ...data,
    }));
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([{ id: "qc-sequence-1" }]),
    manufacturingOrder: {
      findFirst: vi.fn().mockResolvedValue(orderRecord),
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
    manufacturingQualityInspection: {
      findMany: vi.fn().mockResolvedValue(orderRecord.qualityInspections),
      create: qualityInspectionCreate,
    },
    manufacturingDocumentNumber: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          id: "document-number-1",
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
    manufacturingWorkflowReview: {
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          id: "action-review-1",
          transactionDate,
          createdAt: transactionDate,
          createdBy: { name: "Inspector" },
          ...data,
        })),
      update: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          id: "action-review-1",
          transactionDate,
          createdAt: transactionDate,
          createdBy: { name: "Inspector" },
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
    ) => Promise<{
      review: { evidence: Record<string, unknown> };
      transactionIds: string[];
      stockMovementIds: string[];
    }>;
  };
}

function action(actualValue: string, quantities?: Record<string, unknown>) {
  return {
    kind: "RECORD_IN_PROCESS_RESULT",
    idempotencyKey: `ipqc-${actualValue}`,
    transactionDate: transactionDate.toISOString(),
    signatureMeaning: "Inspected during assembly",
    reauthenticationPassword: "not-persisted",
    payload: {
      operationExecutionId: "execution-a-assembly",
      orderLotId: "lot-a",
      qualitySpecificationId: specification.id,
      results: [
        {
          parameterCode: "FG-FRIDGE-IPQC-01",
          actualValue,
        },
      ],
      ...quantities,
    },
  };
}

function serviceWithSpecification() {
  const electronicSignature = {
    enforce: vi.fn().mockResolvedValue({ policyId: "policy-1" }),
  };
  const approvalWorkflow = {
    advance: vi.fn().mockResolvedValue({
      complete: true,
      totalStages: 1,
      completedStages: 1,
      nextStage: null,
      stageApprovers: [{ userId: "inspector-1", transactionDate }],
      review: {
        id: "action-review-1",
        transactionDate,
        createdAt: transactionDate,
        createdBy: { name: "Inspector" },
        evidence: {
          approvalWorkflowScope: "QUALITY_RESULT",
          electronicSignaturePolicy: { policyId: "policy-1" },
        },
      },
    }),
  };
  const service = new ManufacturingService(
    {} as never,
    {} as never,
    approvalWorkflow as never,
    electronicSignature as never,
  );
  const qualitySpecificationResolver = service as unknown as {
    resolveApplicableQualitySpecification: (
      ...args: unknown[]
    ) => Promise<typeof specification>;
  };
  vi.spyOn(
    qualitySpecificationResolver,
    "resolveApplicableQualitySpecification",
  ).mockResolvedValue(specification);
  return { service, approvalWorkflow };
}

describe("operation-scoped in-process quality results", () => {
  it("server-evaluates a critical failure, creates IN_PROCESS evidence and holds the order", async () => {
    const tx = transaction();
    const { service, approvalWorkflow } = serviceWithSpecification();

    const result = await executable(service).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      user,
      "order-1",
      action("3.1", {
        sampleQuantity: 2,
        acceptedQuantity: 1,
        rejectedQuantity: 1,
        holdQuantity: 0,
      }),
    );

    expect(tx.manufacturingQualityInspection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inspectionType: "IN_PROCESS",
        status: "FAILED",
        orderId: "order-1",
        orderLotId: "lot-a",
        operationExecutionId: "execution-a-assembly",
        inventoryItemId: "finished-fridge-1",
        sampleQuantity: new Prisma.Decimal(2),
        acceptedQuantity: new Prisma.Decimal(1),
        rejectedQuantity: new Prisma.Decimal(1),
        holdReason: expect.stringContaining("Operating current"),
        results: {
          create: [expect.objectContaining({ passed: false })],
        },
      }),
    });
    expect(tx.manufacturingOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "QC_HOLD" },
    });
    expect(approvalWorkflow.advance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workflowScope: "QUALITY_RESULT",
        fallbackPermissionKey: "manufacturing.quality.inspect",
        fallbackElectronicSignatureRequired: true,
        signatureMeaning: "Inspected during assembly",
        reauthenticationPassword: "not-persisted",
        evidence: expect.objectContaining({
          qcSubmission: expect.objectContaining({
            operationExecutionId: "execution-a-assembly",
          }),
        }),
      }),
    );
    expect(result.review.evidence).toEqual(
      expect.objectContaining({
        kind: "RECORD_IN_PROCESS_RESULT",
        toStatus: "QC_HOLD",
        inProcessInspection: expect.objectContaining({
          operationExecutionId: "execution-a-assembly",
          criticalFailedParameterCodes: ["FG-FRIDGE-IPQC-01"],
        }),
      }),
    );
  });

  it("waits for a configured QUALITY_RESULT approval before writing IPQC evidence", async () => {
    const tx = transaction();
    const { service, approvalWorkflow } = serviceWithSpecification();
    approvalWorkflow.advance.mockResolvedValueOnce({
      complete: false,
      totalStages: 2,
      completedStages: 1,
      nextStage: 2,
      stageApprovers: [{ userId: "inspector-1", transactionDate }],
      review: {
        id: "action-review-stage-1",
        transactionDate,
        createdAt: transactionDate,
        createdBy: { name: "Inspector" },
        evidence: { approvalWorkflowScope: "QUALITY_RESULT" },
      },
    });

    await executable(service).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      user,
      "order-1",
      action("2.0"),
    );

    expect(tx.manufacturingQualityInspection.create).not.toHaveBeenCalled();
    expect(tx.manufacturingOrder.update).not.toHaveBeenCalled();
  });

  it("allows a later passing result to release only its resolved IPQC hold", async () => {
    const tx = transaction(
      order({
        status: "QC_HOLD",
        executionStatus: "PAUSED",
        qualityInspections: [
          {
            id: "inspection-failed",
            inspectionType: "IN_PROCESS",
            status: "FAILED",
            operationExecutionId: "execution-a-assembly",
            inspectedAt: new Date("2026-09-10T00:00:00.000Z"),
            createdAt: new Date("2026-09-10T00:00:00.000Z"),
          },
        ],
      }),
    );
    const { service } = serviceWithSpecification();

    await executable(service).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      user,
      "order-1",
      action("2.0"),
    );

    expect(tx.manufacturingQualityInspection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inspectionType: "IN_PROCESS",
        status: "PASSED",
        operationExecutionId: "execution-a-assembly",
        sampleQuantity: new Prisma.Decimal(0),
      }),
    });
    expect(tx.manufacturingOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "IN_PRODUCTION" },
    });
  });

  it("keeps QC_HOLD when a passing operation still has an unrelated quality hold", async () => {
    const tx = transaction(
      order({
        status: "QC_HOLD",
        qualityInspections: [
          {
            inspectionType: "IN_PROCESS",
            status: "FAILED",
            operationExecutionId: "execution-a-assembly",
          },
          {
            inspectionType: "FINISHED_GOOD",
            status: "HOLD",
            operationExecutionId: null,
          },
        ],
      }),
    );
    const { service } = serviceWithSpecification();

    await executable(service).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      user,
      "order-1",
      action("2.0"),
    );

    expect(tx.manufacturingOrder.update).not.toHaveBeenCalled();
  });

  it("rejects unreconciled supplied quantities before creating an inspection", async () => {
    const tx = transaction();
    const { service } = serviceWithSpecification();

    await expect(
      executable(service).executeAction(
        tx as unknown as Prisma.TransactionClient,
        scope,
        user,
        "order-1",
        action("2.0", {
          sampleQuantity: 2,
          acceptedQuantity: 1,
          rejectedQuantity: 0,
          holdQuantity: 0,
        }),
      ),
    ).rejects.toThrow(
      "acceptedQuantity + rejectedQuantity + holdQuantity must exactly equal sampleQuantity",
    );
    expect(tx.manufacturingQualityInspection.create).not.toHaveBeenCalled();
  });

  it("rejects an operation outside IN_PROGRESS or PAUSED", async () => {
    const tx = transaction(order({ executionStatus: "COMPLETED" }));
    const { service } = serviceWithSpecification();

    await expect(
      executable(service).executeAction(
        tx as unknown as Prisma.TransactionClient,
        scope,
        user,
        "order-1",
        action("2.0"),
      ),
    ).rejects.toThrow("must be IN_PROGRESS or PAUSED");
    expect(tx.manufacturingQualityInspection.create).not.toHaveBeenCalled();
  });
});
