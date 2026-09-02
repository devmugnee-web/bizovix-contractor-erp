import { describe, expect, it, vi } from "vitest";

import { Prisma } from "../generated/prisma/index.js";
import {
  ManufacturingService,
  manufacturingActionApprovalEntityId,
} from "./manufacturing.service.js";

const scope = {
  id: "workspace-1",
  tenantId: "tenant-1",
  companyId: "company-1",
};
const user = { id: "checker-1" } as never;
const transactionDate = new Date("2026-09-01T00:00:00.000Z");

function review(id: string, complete: boolean) {
  return {
    id,
    orderId: "order-1",
    transactionDate,
    createdAt: transactionDate,
    createdBy: { name: "Checker" },
    evidence: {
      approvalWorkflowScope: "PRODUCTION_COMPLETION",
      totalStages: 2,
      completedStages: complete ? 2 : 1,
      nextStage: complete ? null : 2,
      complete,
    },
  };
}

function baseOrder() {
  return {
    id: "order-1",
    orderNumber: "MO-2026-000001",
    status: "IN_PRODUCTION",
    createdByUserId: "maker-1",
    plannedQuantity: new Prisma.Decimal(10),
    materials: [],
    reservations: [],
    transactions: [],
    qualityInspections: [],
    serials: [],
    packagingOrders: [],
    costSnapshots: [],
    workflowReviews: [],
    lots: [
      {
        id: "lot-1",
        lotNumber: "LOT-001",
        plannedQuantity: new Prisma.Decimal(10),
        completedQuantity: new Prisma.Decimal(0),
        rejectedQuantity: new Prisma.Decimal(0),
        status: "IN_PRODUCTION",
        startedAt: transactionDate,
      },
    ],
    operationExecutions: [
      {
        id: "execution-1",
        orderLotId: "lot-1",
        status: "COMPLETED",
        inputQuantity: new Prisma.Decimal(10),
        goodQuantity: new Prisma.Decimal(10),
        rejectedQuantity: new Prisma.Decimal(0),
        scrapQuantity: new Prisma.Decimal(0),
        reworkQuantity: new Prisma.Decimal(0),
        routingOperation: { sequence: 1, code: "PACK" },
      },
    ],
  };
}

function transaction(order = baseOrder()) {
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
        allowPartialCompletion: true,
      }),
    },
    manufacturingPeriod: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    manufacturingOrderLot: {
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([
        {
          completedQuantity: new Prisma.Decimal(10),
          rejectedQuantity: new Prisma.Decimal(0),
        },
      ]),
    },
    manufacturingWorkflowReview: {
      update: vi.fn().mockImplementation(({ data }) => ({
        ...review(
          "review-updated",
          Boolean((data.evidence as Record<string, unknown>).complete),
        ),
        evidence: data.evidence,
      })),
    },
    manufacturingControlRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    manufacturingPackagingOrder: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    manufacturingQualityInspection: {
      create: vi.fn().mockResolvedValue({ id: "inspection-1" }),
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
      review: { evidence: unknown };
      transactionIds: string[];
      stockMovementIds: string[];
    }>;
  };
}

describe("staged production action approvals", () => {
  it("blocks QA release of a legacy pharmaceutical lot approved by its own inspector", async () => {
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      {} as never,
      { enforce: vi.fn().mockResolvedValue(null) } as never,
    );
    vi.spyOn(service as any, "activeWarehouse").mockResolvedValue({});
    vi.spyOn(service as any, "activeLocation").mockResolvedValue({});
    vi.spyOn(service as any, "activeLedger").mockResolvedValue({
      id: "account-finished-goods",
    });
    vi.spyOn(
      service as any,
      "protectedInventoryControlLedger",
    ).mockResolvedValue({ id: "account-finished-goods" });
    vi.spyOn(service as any, "openFiscalYear").mockResolvedValue({
      id: "fiscal-year-1",
    });
    const tx = {
      manufacturingInventoryLot: {
        findFirst: vi.fn().mockResolvedValue({
          id: "inventory-lot-1",
          lotNumber: "FG-LOT-1",
          warehouseId: "warehouse-fgq",
          locationId: "location-fgq",
          receivedQuantity: new Prisma.Decimal(10),
          holdQuantity: new Prisma.Decimal(10),
          availableQuantity: new Prisma.Decimal(0),
          serials: [],
          sourceTransactionLine: {
            transaction: {
              orderId: "order-1",
              orderLotId: "lot-1",
              transactionType: "PRODUCTION_RECEIPT",
              status: "POSTED",
            },
          },
        }),
      },
    };
    const order = {
      ...baseOrder(),
      status: "COMPLETED",
      finishedProductId: "finished-1",
      finishedProduct: { manufacturingProfile: { serialTracked: false } },
      completedQuantity: new Prisma.Decimal(10),
      qualityInspections: [
        {
          id: "legacy-inspection-1",
          orderLotId: "lot-1",
          inspectionType: "FINISHED_GOOD",
          serialId: null,
          status: "PASSED",
          sampleQuantity: new Prisma.Decimal(10),
          acceptedQuantity: new Prisma.Decimal(10),
          rejectedQuantity: new Prisma.Decimal(0),
          inspectedByUserId: "legacy-user-1",
          approvedByUserId: "legacy-user-1",
          inspectedAt: transactionDate,
          createdAt: transactionDate,
        },
      ],
    };

    await expect(
      (service as any).postQaRelease(
        tx,
        scope,
        user,
        order,
        {
          mode: "PHARMACEUTICAL",
          requireQcBeforeRelease: true,
          requireSerialBeforeRelease: false,
          defaultFinishedGoodsWarehouseId: "warehouse-fgq",
          defaultFinishedGoodsReleasedWarehouseId: "warehouse-fgr",
          defaultFinishedGoodsReleaseLocationId: "location-fgr",
          finishedGoodsInventoryAccountId: "account-finished-goods",
        },
        {
          kind: "QA_RELEASE",
          idempotencyKey: "qa-release-legacy-qc",
          transactionDate: transactionDate.toISOString(),
          lines: [
            {
              inventoryLotId: "inventory-lot-1",
              quantity: 10,
              destinationWarehouseId: "warehouse-fgr",
              destinationLocationId: "location-fgr",
            },
          ],
        },
        transactionDate,
      ),
    ).rejects.toThrow("independently approved by a different authorized user");
  });

  it("records pharmaceutical lot QC stage 1 without mutating inspection or order state", async () => {
    const order = { ...baseOrder(), status: "COMPLETED" };
    const tx = transaction(order);
    tx.manufacturingSettings.findUnique.mockResolvedValue({
      mode: "PHARMACEUTICAL",
      approvalRequired: true,
      electronicSignatureRequired: true,
      allowPartialCompletion: true,
    });
    const approvalWorkflow = {
      advance: vi.fn().mockResolvedValue({
        complete: false,
        totalStages: 2,
        completedStages: 1,
        nextStage: 2,
        stageApprovers: [{ userId: "inspector-1", transactionDate }],
        review: review("lot-qc-stage-1", false),
      }),
    };
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      approvalWorkflow as never,
      { enforce: vi.fn().mockResolvedValue(null) } as never,
    );

    const result = await executable(service).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      { id: "inspector-1" } as never,
      "order-1",
      {
        kind: "RECORD_QUALITY_RESULT",
        idempotencyKey: "lot-qc-stage-1",
        transactionDate: transactionDate.toISOString(),
        signatureMeaning: "Inspected by QC",
        payload: {
          orderLotId: "lot-1",
          qualitySpecificationId: "spec-1",
          sampleQuantity: 10,
          acceptedQuantity: 10,
          rejectedQuantity: 0,
          holdQuantity: 0,
          results: [{ parameterCode: "APPEARANCE", actualText: "CLEAR" }],
        },
      },
    );

    expect(result.transactionIds).toEqual([]);
    expect(tx.manufacturingQualityInspection.create).not.toHaveBeenCalled();
    expect(tx.manufacturingOrder.update).not.toHaveBeenCalled();
    expect(approvalWorkflow.advance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workflowScope: "QUALITY_RESULT",
        fallbackStages: [
          { permissionKey: "manufacturing.quality.inspect" },
          { permissionKey: "manufacturing.quality.release" },
        ],
        minimumStages: 2,
        evidence: expect.objectContaining({
          qcSubmission: expect.objectContaining({
            qualitySpecificationId: "spec-1",
          }),
        }),
      }),
    );
  });

  it("records the independent final reviewer even when pharmaceutical lot QC fails", async () => {
    const order = {
      ...baseOrder(),
      status: "COMPLETED",
      lots: [
        {
          ...baseOrder().lots[0],
          completedQuantity: new Prisma.Decimal(10),
          status: "COMPLETED",
        },
      ],
    };
    const tx = transaction(order) as ReturnType<typeof transaction> &
      Record<string, any>;
    tx.manufacturingSettings.findUnique.mockResolvedValue({
      mode: "PHARMACEUTICAL",
      approvalRequired: true,
      electronicSignatureRequired: true,
      allowPartialCompletion: true,
    });
    tx.$executeRaw = vi.fn().mockResolvedValue(1);
    tx.$queryRaw = vi.fn().mockResolvedValue([{ id: "qc-sequence-1" }]);
    tx.manufacturingDocumentNumber = {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          id: "qc-number-1",
          documentNumber: "QCI-2026-0001",
          ...data,
        })),
    };
    tx.manufacturingDocumentSequence = {
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
    };
    const approvalWorkflow = {
      advance: vi.fn().mockResolvedValue({
        complete: true,
        totalStages: 2,
        completedStages: 2,
        nextStage: null,
        stageApprovers: [
          {
            userId: "inspector-1",
            transactionDate: new Date("2026-08-31T00:00:00.000Z"),
          },
          { userId: "checker-1", transactionDate },
        ],
        review: review("lot-qc-stage-2", true),
      }),
    };
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      approvalWorkflow as never,
      { enforce: vi.fn().mockResolvedValue(null) } as never,
    );
    vi.spyOn(
      service as any,
      "resolveApplicableQualitySpecification",
    ).mockResolvedValue({
      id: "spec-1",
      code: "FG-SPEC",
      name: "Finished product specification",
      versionNumber: 1,
      effectiveFrom: null,
      effectiveTo: null,
      approvedAt: transactionDate.toISOString(),
      parameters: [
        {
          parameterCode: "APPEARANCE",
          parameterName: "Appearance",
          sequence: 1,
          resultType: "TEXT",
          unit: null,
          testMethodRecordId: "method-1",
          testMethodCode: "VISUAL",
          testMethodName: "Visual inspection",
          testMethodVersion: 1,
          testMethodSnapshot: "VISUAL v1",
          lowerLimit: null,
          upperLimit: null,
          expectedText: "CLEAR",
          expectedBoolean: null,
          critical: true,
          specificationText: "Must be clear",
        },
      ],
    });

    await executable(service).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      user,
      "order-1",
      {
        kind: "RECORD_QUALITY_RESULT",
        idempotencyKey: "lot-qc-stage-2",
        transactionDate: transactionDate.toISOString(),
        signatureMeaning: "Approved by QA",
        payload: {
          orderLotId: "lot-1",
          qualitySpecificationId: "spec-1",
          sampleQuantity: 10,
          acceptedQuantity: 9,
          rejectedQuantity: 1,
          holdQuantity: 0,
          results: [{ parameterCode: "APPEARANCE", actualText: "CLOUDY" }],
        },
      },
    );

    expect(tx.manufacturingQualityInspection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "FAILED",
        createdByUserId: "inspector-1",
        inspectedByUserId: "inspector-1",
        inspectedAt: new Date("2026-08-31T00:00:00.000Z"),
        approvedByUserId: "checker-1",
        approvedAt: transactionDate,
      }),
    });
  });

  it("returns an interim approval without mutating lot or order state", async () => {
    const tx = transaction();
    const approvalWorkflow = {
      advance: vi.fn().mockResolvedValue({
        complete: false,
        totalStages: 2,
        completedStages: 1,
        nextStage: 2,
        review: review("review-stage-1", false),
      }),
    };
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      approvalWorkflow as never,
      { enforce: vi.fn().mockResolvedValue(null) } as never,
    );

    const result = await executable(service).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      user,
      "order-1",
      {
        kind: "COMPLETE_PRODUCTION",
        idempotencyKey: "completion-stage-1",
        transactionDate: transactionDate.toISOString(),
        signatureMeaning: "Reviewed",
        lines: [
          {
            orderLotId: "lot-1",
            quantity: 10,
            payload: { rejectedQuantity: 0 },
          },
        ],
      },
    );

    expect(result.transactionIds).toEqual([]);
    expect(result.stockMovementIds).toEqual([]);
    expect(tx.manufacturingOrderLot.update).not.toHaveBeenCalled();
    expect(tx.manufacturingOrder.update).not.toHaveBeenCalled();
    expect(tx.manufacturingWorkflowReview.update).toHaveBeenCalledOnce();
  });

  it("executes the action only on the final stage and updates that same review", async () => {
    const tx = transaction();
    const approvalWorkflow = {
      advance: vi.fn().mockResolvedValue({
        complete: true,
        totalStages: 2,
        completedStages: 2,
        nextStage: null,
        review: review("review-stage-2", true),
      }),
    };
    const service = new ManufacturingService(
      {} as never,
      {} as never,
      approvalWorkflow as never,
      { enforce: vi.fn().mockResolvedValue(null) } as never,
    );

    await executable(service).executeAction(
      tx as unknown as Prisma.TransactionClient,
      scope,
      user,
      "order-1",
      {
        kind: "COMPLETE_PRODUCTION",
        idempotencyKey: "completion-stage-2",
        transactionDate: transactionDate.toISOString(),
        signatureMeaning: "Approved",
        lines: [
          {
            orderLotId: "lot-1",
            quantity: 10,
            payload: { rejectedQuantity: 0 },
          },
        ],
      },
    );

    expect(tx.manufacturingOrderLot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lot-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
    expect(tx.manufacturingOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
    expect(tx.manufacturingWorkflowReview.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "review-stage-2" },
        data: expect.objectContaining({
          evidence: expect.objectContaining({
            complete: true,
            toStatus: "COMPLETED",
          }),
        }),
      }),
    );
  });

  it("uses one stable fingerprint for reordered lines but separates later lots", () => {
    const first = manufacturingActionApprovalEntityId({
      orderId: "order-1",
      action: "ISSUE_MATERIALS",
      transactionDate,
      lines: [
        { orderLotId: "lot-1", orderMaterialId: "material-2", quantity: 2 },
        { orderLotId: "lot-1", orderMaterialId: "material-1", quantity: 1 },
      ],
      payload: { orderLotId: "lot-1" },
    });
    const reordered = manufacturingActionApprovalEntityId({
      orderId: "order-1",
      action: "ISSUE_MATERIALS",
      transactionDate,
      lines: [
        { quantity: 1, orderMaterialId: "material-1", orderLotId: "lot-1" },
        { quantity: 2, orderMaterialId: "material-2", orderLotId: "lot-1" },
      ],
      payload: { orderLotId: "lot-1" },
    });
    const laterLot = manufacturingActionApprovalEntityId({
      orderId: "order-1",
      action: "ISSUE_MATERIALS",
      transactionDate,
      lines: [
        { orderLotId: "lot-2", orderMaterialId: "material-1", quantity: 1 },
      ],
      payload: { orderLotId: "lot-2" },
    });

    expect(reordered).toBe(first);
    expect(laterLot).not.toBe(first);
  });

  it.each([
    { allReleased: true, expectedCloseCalls: 1 },
    { allReleased: false, expectedCloseCalls: 0 },
  ])(
    "closes only RELEASE_READY packaging orders when QA release is fully posted (allReleased=$allReleased)",
    async ({ allReleased, expectedCloseCalls }) => {
      const order = { ...baseOrder(), status: "COMPLETED" };
      const tx = transaction(order);
      const approvalWorkflow = {
        advance: vi.fn().mockResolvedValue({
          complete: true,
          totalStages: 1,
          completedStages: 1,
          nextStage: null,
          review: review("review-final-release", true),
        }),
      };
      const service = new ManufacturingService(
        {} as never,
        {} as never,
        approvalWorkflow as never,
        { enforce: vi.fn().mockResolvedValue(null) } as never,
      );
      vi.spyOn(service as any, "postQaRelease").mockResolvedValue({
        transactionIds: ["transaction-1"],
        stockMovementIds: ["movement-1"],
        allReleased,
      } as never);

      await executable(service).executeAction(
        tx as unknown as Prisma.TransactionClient,
        scope,
        user,
        "order-1",
        {
          kind: "QA_RELEASE",
          idempotencyKey: `qa-release-${String(allReleased)}`,
          transactionDate: transactionDate.toISOString(),
          signatureMeaning: "Released by QA",
          reauthenticationPassword: "not-persisted-password",
          lines: [{ orderLotId: "lot-1", quantity: 10 }],
        },
      );

      expect(tx.manufacturingPackagingOrder.updateMany).toHaveBeenCalledTimes(
        expectedCloseCalls,
      );
      if (allReleased) {
        expect(tx.manufacturingPackagingOrder.updateMany).toHaveBeenCalledWith({
          where: {
            workspaceId: scope.id,
            orderId: "order-1",
            status: "RELEASE_READY",
          },
          data: { status: "CLOSED", closedAt: transactionDate },
        });
      }
    },
  );
});

describe("order-action idempotent replay permissions", () => {
  it.each([
    {
      kind: "COMPLETE_PRODUCTION" as const,
      stagePermission: "configured.production.completion.approve",
      expectedPermission: "configured.production.completion.approve",
    },
    {
      kind: "APPROVE" as const,
      stagePermission: null,
      expectedPermission: "manufacturing.order.approve",
    },
  ])(
    "rechecks $expectedPermission before returning a $kind replay",
    async ({ kind, stagePermission, expectedPermission }) => {
      const replayUser = {
        id: "checker-1",
        workspaceId: scope.id,
        tenantId: scope.tenantId,
        companyId: scope.companyId,
      } as never;
      const actionApprovalEntityId =
        kind === "COMPLETE_PRODUCTION"
          ? manufacturingActionApprovalEntityId({
              orderId: "order-1",
              action: kind,
              transactionDate,
              payload: {},
            })
          : null;
      const orderLookup = vi.fn();
      const prisma = {
        workspace: { findFirst: vi.fn().mockResolvedValue(scope) },
        manufacturingOrder: { findFirst: orderLookup },
        manufacturingWorkflowReview: {
          findUnique: vi.fn().mockResolvedValue({
            id: "review-replay-1",
            orderId: "order-1",
            workflowCode: "ORDER_ACTION",
            transactionDate,
            createdAt: transactionDate,
            createdBy: { name: "Checker" },
            evidence: {
              kind,
              fromStatus: "SUBMITTED",
              toStatus: "SUBMITTED",
              actionApprovalEntityId,
              stagePermission,
              transactionIds: [],
              stockMovementIds: [],
            },
          }),
        },
      };
      const permissions = {
        getGrantedKeys: vi.fn().mockResolvedValue(new Set()),
      };
      const service = new ManufacturingService(
        prisma as never,
        permissions as never,
        {} as never,
        {} as never,
      );

      await expect(
        service.performOrderAction(replayUser, "order-1", {
          kind,
          idempotencyKey: "action-replay-1",
          transactionDate: transactionDate.toISOString(),
        }),
      ).rejects.toThrow(`Permission required: ${expectedPermission}`);
      expect(permissions.getGrantedKeys).toHaveBeenCalledWith(replayUser);
      expect(orderLookup).not.toHaveBeenCalled();
    },
  );
});
