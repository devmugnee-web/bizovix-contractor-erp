import { describe, expect, it, vi } from "vitest";
import { validate } from "class-validator";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { PermissionsService } from "../common/services/permissions.service.js";
import { Prisma } from "../generated/prisma/index.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import { TransitionManufacturingRunStepDto } from "./manufacturing-workflow.dto.js";
import { ManufacturingWorkflowService } from "./manufacturing-workflow.service.js";

const electronicSignature = {} as ManufacturingElectronicSignatureService;
const user: AuthenticatedRequestUser = {
  id: "user-1",
  email: "maker@example.com",
  name: "Maker",
  initials: "M",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

const boundRun = {
  id: "run-1",
  tenantId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  productionOrderId: "order-1",
};

const aggregateSettings = {
  defaultWipWarehouseId: "warehouse-wip",
  defaultWipLocationId: "location-wip",
  defaultFinishedGoodsWarehouseId: "warehouse-fg-q",
  defaultFinishedGoodsReleasedWarehouseId: "warehouse-fg-r",
  defaultFinishedGoodsHoldLocationId: "location-fg-q",
  defaultFinishedGoodsReleaseLocationId: "location-fg-r",
  rawMaterialInventoryAccountId: "account-rm",
  packagingInventoryAccountId: "account-packaging",
  wipInventoryAccountId: "account-wip",
  finishedGoodsInventoryAccountId: "account-fg",
  requireSerialBeforeRelease: false,
};

function postedVoucher(input: {
  id: string;
  transactionId: string;
  transactionType:
    | "MATERIAL_ISSUE"
    | "MATERIAL_RETURN"
    | "PACKAGING_ISSUE"
    | "PACKAGING_RETURN"
    | "PRODUCTION_RECEIPT"
    | "SCRAP_RECEIPT";
  amount: Prisma.Decimal.Value;
  debitAccountId: string;
  creditAccountId: string;
}) {
  const amount = decimal(input.amount);
  return {
    id: input.id,
    workspaceId: "workspace-1",
    companyId: "company-1",
    voucherType: "JOURNAL",
    documentKind: input.transactionType,
    status: "POSTED",
    sourceType: `MANUFACTURING_${input.transactionType}`,
    sourceId: input.transactionId,
    totalAmount: amount,
    debit: amount,
    credit: amount,
    lines: [
      {
        accountId: input.debitAccountId,
        debit: amount,
        credit: decimal(0),
      },
      {
        accountId: input.creditAccountId,
        debit: decimal(0),
        credit: amount,
      },
    ],
  };
}

function transferMovements(input: {
  id: string;
  inventoryItemId: string;
  quantity: Prisma.Decimal.Value;
  value: Prisma.Decimal.Value;
  fromWarehouseId: string;
  toWarehouseId: string;
  transactionType: string;
  transactionLineId: string;
}) {
  return [
    {
      id: `${input.id}-out`,
      warehouseId: input.fromWarehouseId,
      inventoryItemId: input.inventoryItemId,
      transactionType: "STOCK_TRANSFER_OUT",
      transactionId: input.id,
      transactionLineId: input.transactionLineId,
      movementType: "OUT",
      quantity: decimal(input.quantity),
      movementValue: decimal(input.value),
    },
    {
      id: `${input.id}-in`,
      warehouseId: input.toWarehouseId,
      inventoryItemId: input.inventoryItemId,
      transactionType: "STOCK_TRANSFER_IN",
      transactionId: input.id,
      transactionLineId: input.transactionLineId,
      movementType: "IN",
      quantity: decimal(input.quantity),
      movementValue: decimal(input.value),
    },
  ];
}

function issueTransaction(input: {
  id: string;
  orderLotId: string;
  transactionType: "MATERIAL_ISSUE" | "PACKAGING_ISSUE";
  inventoryItemId: string;
  orderMaterialId: string;
  quantity: Prisma.Decimal.Value;
  value: Prisma.Decimal.Value;
  creditAccountId: string;
}) {
  const movements = transferMovements({
    id: input.id,
    inventoryItemId: input.inventoryItemId,
    quantity: input.quantity,
    value: input.value,
    fromWarehouseId: "warehouse-rm",
    toWarehouseId: "warehouse-wip",
    transactionType: input.transactionType,
    transactionLineId: `${input.id}-line`,
  });
  const voucher = postedVoucher({
    id: `${input.id}-voucher`,
    transactionId: input.id,
    transactionType: input.transactionType,
    amount: input.value,
    debitAccountId: "account-wip",
    creditAccountId: input.creditAccountId,
  });
  return {
    id: input.id,
    companyId: "company-1",
    workspaceId: "workspace-1",
    transactionType: input.transactionType,
    status: "POSTED",
    orderId: "order-1",
    orderLotId: input.orderLotId,
    fromWarehouseId: "warehouse-rm",
    toWarehouseId: "warehouse-wip",
    fromLocationId: "location-rm",
    toLocationId: "location-wip",
    voucherEntryId: voucher.id,
    voucherEntry: voucher,
    transactionDate: new Date("2026-08-30T00:00:00.000Z"),
    createdAt: new Date("2026-08-30T00:00:00.000Z"),
    lines: [
      {
        id: `${input.id}-line`,
        inventoryItemId: input.inventoryItemId,
        orderMaterialId: input.orderMaterialId,
        sourceInventoryLotId: `${input.orderLotId}-source-lot`,
        destinationInventoryLotId: null,
        quantity: decimal(input.quantity),
        totalCost: decimal(input.value),
        stockMovements: movements,
        serialMovements: [],
        sourceInventoryLot: null,
        destinationInventoryLot: null,
      },
    ],
  };
}

function returnTransaction(input: {
  id: string;
  orderLotId: string;
  transactionType: "MATERIAL_RETURN" | "PACKAGING_RETURN";
  inventoryItemId: string;
  orderMaterialId: string;
  quantity: Prisma.Decimal.Value;
  value: Prisma.Decimal.Value;
  debitAccountId: string;
}) {
  const movements = transferMovements({
    id: input.id,
    inventoryItemId: input.inventoryItemId,
    quantity: input.quantity,
    value: input.value,
    fromWarehouseId: "warehouse-wip",
    toWarehouseId: "warehouse-rm",
    transactionType: input.transactionType,
    transactionLineId: `${input.id}-line`,
  });
  const voucher = postedVoucher({
    id: `${input.id}-voucher`,
    transactionId: input.id,
    transactionType: input.transactionType,
    amount: input.value,
    debitAccountId: input.debitAccountId,
    creditAccountId: "account-wip",
  });
  return {
    id: input.id,
    companyId: "company-1",
    workspaceId: "workspace-1",
    transactionType: input.transactionType,
    status: "POSTED",
    orderId: "order-1",
    orderLotId: input.orderLotId,
    fromWarehouseId: "warehouse-wip",
    toWarehouseId: "warehouse-rm",
    fromLocationId: "location-wip",
    toLocationId: "location-rm",
    voucherEntryId: voucher.id,
    voucherEntry: voucher,
    transactionDate: new Date("2026-08-30T00:30:00.000Z"),
    createdAt: new Date("2026-08-30T00:30:00.000Z"),
    lines: [
      {
        id: `${input.id}-line`,
        inventoryItemId: input.inventoryItemId,
        orderMaterialId: input.orderMaterialId,
        sourceInventoryLotId: null,
        destinationInventoryLotId: `${input.orderLotId}-source-lot`,
        quantity: decimal(input.quantity),
        totalCost: decimal(input.value),
        stockMovements: movements,
        serialMovements: [],
        sourceInventoryLot: null,
        destinationInventoryLot: null,
      },
    ],
  };
}

function receiptTransaction(input: {
  id: string;
  orderLotId: string;
  quantity: Prisma.Decimal.Value;
  value: Prisma.Decimal.Value;
}) {
  const voucher = postedVoucher({
    id: `${input.id}-voucher`,
    transactionId: input.id,
    transactionType: "PRODUCTION_RECEIPT",
    amount: input.value,
    debitAccountId: "account-fg",
    creditAccountId: "account-wip",
  });
  return {
    id: input.id,
    companyId: "company-1",
    workspaceId: "workspace-1",
    transactionType: "PRODUCTION_RECEIPT",
    status: "POSTED",
    orderId: "order-1",
    orderLotId: input.orderLotId,
    fromWarehouseId: "warehouse-wip",
    toWarehouseId: "warehouse-fg-q",
    fromLocationId: "location-wip",
    toLocationId: "location-fg-q",
    voucherEntryId: voucher.id,
    voucherEntry: voucher,
    transactionDate: new Date("2026-08-30T00:00:00.000Z"),
    createdAt: new Date("2026-08-30T00:00:00.000Z"),
    lines: [
      {
        id: `${input.id}-input`,
        inventoryItemId: "RM-1",
        orderMaterialId: "material-rm",
        sourceInventoryLotId: `${input.orderLotId}-wip-lot`,
        destinationInventoryLotId: null,
        quantity: decimal(input.quantity),
        totalCost: decimal(input.value),
        stockMovements: [
          {
            id: `${input.id}-wip-out`,
            warehouseId: "warehouse-wip",
            inventoryItemId: "RM-1",
            transactionType: "PRODUCTION_RECEIPT_INPUT",
            transactionId: input.id,
            transactionLineId: `${input.id}-input`,
            movementType: "OUT",
            quantity: decimal(input.quantity),
            movementValue: decimal(input.value),
          },
        ],
        serialMovements: [],
        sourceInventoryLot: null,
        destinationInventoryLot: null,
      },
      {
        id: `${input.id}-output`,
        inventoryItemId: "FG-1",
        orderMaterialId: null,
        sourceInventoryLotId: null,
        destinationInventoryLotId: `${input.orderLotId}-fg-lot`,
        quantity: decimal(input.quantity),
        totalCost: decimal(input.value),
        stockMovements: [
          {
            id: `${input.id}-fgq-in`,
            warehouseId: "warehouse-fg-q",
            inventoryItemId: "FG-1",
            transactionType: "PRODUCTION_RECEIPT",
            transactionId: input.id,
            transactionLineId: `${input.id}-output`,
            movementType: "IN",
            quantity: decimal(input.quantity),
            movementValue: decimal(input.value),
          },
        ],
        serialMovements: [],
        sourceInventoryLot: null,
        destinationInventoryLot: {
          id: `${input.orderLotId}-fg-lot`,
          warehouseId: "warehouse-fg-q",
          locationId: "location-fg-q",
          receivedQuantity: decimal(input.quantity),
          serials: [],
        },
      },
    ],
  };
}

function qaReleaseTransaction(input: {
  id: string;
  orderLotId: string;
  quantity: Prisma.Decimal.Value;
  value: Prisma.Decimal.Value;
}) {
  const lotId = `${input.orderLotId}-fg-lot`;
  return {
    id: input.id,
    companyId: "company-1",
    workspaceId: "workspace-1",
    transactionType: "QA_RELEASE",
    status: "POSTED",
    orderId: "order-1",
    orderLotId: input.orderLotId,
    fromWarehouseId: "warehouse-fg-q",
    toWarehouseId: "warehouse-fg-r",
    fromLocationId: "location-fg-q",
    toLocationId: "location-fg-r",
    voucherEntryId: null,
    voucherEntry: null,
    transactionDate: new Date("2026-08-30T01:00:00.000Z"),
    createdAt: new Date("2026-08-30T01:00:00.000Z"),
    lines: [
      {
        id: `${input.id}-line`,
        inventoryItemId: "FG-1",
        orderMaterialId: null,
        sourceInventoryLotId: lotId,
        destinationInventoryLotId: lotId,
        quantity: decimal(input.quantity),
        totalCost: decimal(input.value),
        stockMovements: transferMovements({
          id: input.id,
          inventoryItemId: "FG-1",
          quantity: input.quantity,
          value: input.value,
          fromWarehouseId: "warehouse-fg-q",
          toWarehouseId: "warehouse-fg-r",
          transactionType: "QA_RELEASE",
          transactionLineId: `${input.id}-line`,
        }),
        serialMovements: [],
        sourceInventoryLot: {
          id: lotId,
          warehouseId: "warehouse-fg-r",
          locationId: "location-fg-r",
          receivedQuantity: decimal(input.quantity),
          serials: [],
        },
        destinationInventoryLot: {
          id: lotId,
          warehouseId: "warehouse-fg-r",
          locationId: "location-fg-r",
          receivedQuantity: decimal(input.quantity),
          serials: [],
        },
      },
    ],
  };
}

const aggregateOrder = {
  id: "order-1",
  issueWarehouseId: "warehouse-rm",
  issueLocationId: "location-rm",
  plannedQuantity: decimal(10),
  completedQuantity: decimal(10),
  finishedProductId: "FG-1",
  finishedProduct: { manufacturingProfile: { serialTracked: false } },
  lots: [
    {
      id: "lot-a",
      lotNumber: "LOT-A",
      plannedQuantity: decimal(5),
      completedQuantity: decimal(5),
    },
    {
      id: "lot-b",
      lotNumber: "LOT-B",
      plannedQuantity: decimal(5),
      completedQuantity: decimal(5),
    },
  ],
  materials: [
    {
      id: "material-rm",
      inventoryItemId: "RM-1",
      status: "PLANNED",
      plannedQuantity: decimal(10),
      inventoryItem: {
        manufacturingProfile: { role: "RAW_MATERIAL", lotTracked: true },
      },
    },
  ],
  packagingOrders: [],
};

describe("ManufacturingWorkflowService definition contract", () => {
  it("publishes IDs and mapping for the append-only v2 definition", () => {
    const service = new ManufacturingWorkflowService(
      {} as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const definition = service.getActiveDefinition();
    const steps = definition.groups.flatMap((group) => group.steps);

    expect(definition).toMatchObject({
      id: "mwf-a-k-v2",
      version: "2",
      effectiveFrom: "2026-09-01",
      totalGroups: 11,
      totalSteps: 159,
    });
    expect(definition.groups.map((group) => group.id)).toEqual(
      "ABCDEFGHIJK".split("").map((code) => `mwfg-a-k-v2-${code}`),
    );
    expect(steps).toHaveLength(159);
    expect(steps.map((step) => step.id)).toEqual(
      Array.from(
        { length: 159 },
        (_, index) => `mwfs-a-k-v2-${String(index + 1).padStart(3, "0")}`,
      ),
    );
  });

  it("selects one deterministic primary order branch and lets a bound order type override mode defaults", () => {
    const service = new ManufacturingWorkflowService(
      {} as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const selector = service as unknown as {
      primaryOrderStepSerial(
        orderType: "ASSEMBLY" | "PHARMACEUTICAL" | "SUBCONTRACT" | null,
        mode: "GENERAL" | "PHARMACEUTICAL" | "HYBRID",
      ): number;
    };

    expect(selector.primaryOrderStepSerial(null, "GENERAL")).toBe(50);
    expect(selector.primaryOrderStepSerial(null, "PHARMACEUTICAL")).toBe(51);
    expect(selector.primaryOrderStepSerial(null, "HYBRID")).toBe(51);
    expect(selector.primaryOrderStepSerial("ASSEMBLY", "HYBRID")).toBe(50);
    expect(selector.primaryOrderStepSerial("SUBCONTRACT", "GENERAL")).toBe(52);
  });

  it("translates a serializable transaction conflict into a safe retry response", () => {
    const service = new ManufacturingWorkflowService(
      {} as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const handler = service as unknown as {
      workflowUnavailable(error: unknown): never;
    };
    const conflict = new Prisma.PrismaClientKnownRequestError(
      "Transaction conflict",
      { code: "P2034", clientVersion: "6.19.3" },
    );

    expect(() => handler.workflowUnavailable(conflict)).toThrow(
      /workflow changed concurrently.*same idempotency key/i,
    );
  });

  it("hydrates group and prerequisite metadata from the run's pinned definition", async () => {
    const historicalSteps = [
      {
        id: "historical-step-8",
        runId: "historical-run",
        stepDefinitionId: "historical-definition-step-8",
        occurrenceKey: "PRIMARY",
        status: "COMPLETED",
        applicable: true,
        blockerReason: null,
        naReason: null,
        sourceRecordType: "MANUFACTURING_SETTINGS",
        sourceRecordId: "settings-1",
        startedAt: new Date("2026-08-30T00:00:00.000Z"),
        completedAt: new Date("2026-08-30T01:00:00.000Z"),
        completedBy: "user-1",
        approvedBy: null,
        signatureReference: null,
        version: 2,
        flowSerial: 8,
        legacyStepCode: "11.01",
        flowGroupCode: "B",
        flowGroupName: "Historical Setup Group",
        flowGroupOrder: 2,
        title: "Historical Manufacturing Settings",
        route:
          "/app/manufacturing/dashboard?section=setup&view=historical-settings",
        postingEffect: "NONE",
        permissionKey: "manufacturing.configure",
        completionRule: {
          kind: "DOMAIN_COMPLETION",
          requiredStatus: "COMPLETED",
        },
        applicabilityType: "REQUIRED",
        stepType: "CONTROL",
        repeatable: false,
        isBlocking: true,
      },
      {
        id: "historical-step-9",
        runId: "historical-run",
        stepDefinitionId: "historical-definition-step-9",
        occurrenceKey: "PRIMARY",
        status: "READY",
        applicable: true,
        blockerReason: null,
        naReason: null,
        sourceRecordType: null,
        sourceRecordId: null,
        startedAt: null,
        completedAt: null,
        completedBy: null,
        approvedBy: null,
        signatureReference: null,
        version: 1,
        flowSerial: 9,
        legacyStepCode: "11.02",
        flowGroupCode: "B",
        flowGroupName: "Historical Setup Group",
        flowGroupOrder: 2,
        title: "Historical Approval Workflow",
        route:
          "/app/manufacturing/dashboard?section=setup&view=historical-approval",
        postingEffect: "NONE",
        permissionKey: "manufacturing.configure",
        completionRule: { kind: "APPROVAL", requiredStatus: "APPROVED" },
        applicabilityType: "REQUIRED",
        stepType: "APPROVAL",
        repeatable: false,
        isBlocking: true,
      },
    ];
    const historicalDependencies = [
      {
        stepFlowSerial: 9,
        prerequisiteFlowSerial: 8,
        requiredStatus: "COMPLETED",
        dependencyType: "HARD",
        conditionExpression: null,
      },
    ];
    const db = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce(historicalSteps)
        .mockResolvedValueOnce(historicalDependencies),
    };
    const service = new ManufacturingWorkflowService(
      {} as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const hydrator = service as unknown as {
      hydrateRun(
        database: unknown,
        run: unknown,
      ): Promise<{
        groups: Array<{ name: string }>;
        steps: Array<{
          flowSerial: number;
          title: string;
          prerequisites: Array<{ title: string; actualStatus: string }>;
        }>;
      }>;
    };

    const result = await hydrator.hydrateRun(db, {
      id: "historical-run",
      tenantId: "tenant-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      workflowDefinitionId: "mwf-a-k-v0",
      workflowDefinitionVersion: 0,
      productionPlanId: null,
      productionOrderId: null,
      productId: null,
      manufacturingMode: "GENERAL",
      status: "PLANNED",
      currentGroup: "B",
      currentStepSerial: 9,
      version: 1,
      startedAt: new Date("2026-08-30T00:00:00.000Z"),
      completedAt: null,
      closedAt: null,
    });

    expect(result.groups).toEqual([
      expect.objectContaining({ name: "Historical Setup Group" }),
    ]);
    expect(result.steps.find((step) => step.flowSerial === 9)).toMatchObject({
      title: "Historical Approval Workflow",
      prerequisites: [
        {
          title: "Historical Manufacturing Settings",
          actualStatus: "COMPLETED",
        },
      ],
    });
  });

  it("keeps v1 report rows observable and removes their historical close-out deadlock at runtime", async () => {
    const reportStep = {
      flowSerial: 144,
      applicabilityType: "REQUIRED",
      isBlocking: true,
    };
    const persistedDependencies = [
      {
        stepFlowSerial: 155,
        prerequisiteFlowSerial: 144,
        requiredStatus: "COMPLETED",
        dependencyType: "HARD",
        conditionExpression: null,
      },
      {
        stepFlowSerial: 156,
        prerequisiteFlowSerial: 154,
        requiredStatus: "COMPLETED",
        dependencyType: "HARD",
        conditionExpression: null,
      },
      {
        stepFlowSerial: 156,
        prerequisiteFlowSerial: 155,
        requiredStatus: "COMPLETED",
        dependencyType: "HARD",
        conditionExpression: null,
      },
    ];
    const db = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([reportStep])
        .mockResolvedValueOnce(persistedDependencies),
    };
    const service = new ManufacturingWorkflowService(
      {} as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const compatibility = service as unknown as {
      runSteps(
        database: unknown,
        run: unknown,
      ): Promise<Array<Record<string, unknown>>>;
      dependencies(
        database: unknown,
        run: unknown,
      ): Promise<Array<Record<string, unknown>>>;
    };
    const run = {
      id: "historical-v1-run",
      workflowDefinitionId: "mwf-a-k-v1",
      workflowDefinitionVersion: 1,
    };

    await expect(compatibility.runSteps(db, run)).resolves.toEqual([
      expect.objectContaining({
        flowSerial: 144,
        applicabilityType: "MONITORING",
        isBlocking: false,
      }),
    ]);
    const dependencies = await compatibility.dependencies(db, run);
    expect(dependencies).not.toContainEqual(
      expect.objectContaining({
        stepFlowSerial: 155,
        prerequisiteFlowSerial: 144,
      }),
    );
    expect(dependencies).not.toContainEqual(
      expect.objectContaining({
        stepFlowSerial: 156,
        prerequisiteFlowSerial: 154,
      }),
    );
    expect(dependencies).toContainEqual({
      stepFlowSerial: 155,
      prerequisiteFlowSerial: 143,
      requiredStatus: "COMPLETED",
      dependencyType: "HARD",
      conditionExpression: null,
    });
  });

  it("reports an MFA-required signature policy as fail-closed", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "workspace-1",
          tenantId: "tenant-1",
          companyId: "company-1",
        }),
      },
      manufacturingSettings: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ electronicSignatureRequired: true }),
      },
      manufacturingControlRecord: {
        findFirst: vi.fn().mockResolvedValue({
          id: "policy-1",
          code: "ESIG-001",
          versionNumber: 3,
          payload: {
            signatureMeanings: ["Approved"],
            reauthenticationRequired: true,
            sessionTimeoutMinutes: 15,
            mfaRequired: true,
          },
        }),
      },
    };
    const service = new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );

    await expect(
      service.getElectronicSignatureContext(user, "workspace-1"),
    ).resolves.toMatchObject({
      required: true,
      policyReady: true,
      allowedMeanings: ["Approved"],
      reauthenticationRequired: true,
      mfaRequired: true,
      mfaAvailable: false,
      blockedReason: expect.stringMatching(/MFA.*not configured/i),
    });
    const policyQuery = prisma.manufacturingControlRecord.findFirst.mock
      .calls[0]![0] as {
      where: {
        AND: [
          { OR: [unknown, { effectiveFrom: { lte: Date } }] },
          { OR: [unknown, { effectiveTo: { gte: Date } }] },
        ];
      };
    };
    const effectiveFrom = policyQuery.where.AND[0].OR[1].effectiveFrom.lte;
    const effectiveTo = policyQuery.where.AND[1].OR[1].effectiveTo.gte;
    expect(effectiveFrom).toBeInstanceOf(Date);
    expect(effectiveFrom).toEqual(effectiveTo);
    expect(effectiveFrom.getUTCHours()).toBe(0);
  });

  it("strips a client-authored signature reference from transition input", async () => {
    const dto = Object.assign(new TransitionManufacturingRunStepDto(), {
      workspaceId: "workspace-1",
      idempotencyKey: "approve-step-9",
      action: "APPROVE",
      signatureReference: "fake-client-reference",
      signatureMeaning: "Approved",
    });

    await expect(validate(dto, { whitelist: true })).resolves.toEqual([]);
    expect(
      (dto as unknown as Record<string, unknown>).signatureReference,
    ).toBeUndefined();
    expect(dto.signatureMeaning).toBe("Approved");
  });

  it("accepts only a real posted, correctly typed transaction for posting reconciliation", async () => {
    const transaction = issueTransaction({
      id: "additional-issue-1",
      orderLotId: "lot-a",
      transactionType: "MATERIAL_ISSUE",
      inventoryItemId: "RM-1",
      orderMaterialId: "material-rm",
      quantity: 1,
      value: 10,
      creditAccountId: "account-rm",
    });
    const findFirst = vi.fn().mockResolvedValue(transaction);
    const prisma = {
      manufacturingTransaction: {
        findFirst,
      },
      manufacturingOrder: {
        findFirst: vi.fn().mockResolvedValue(aggregateOrder),
      },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue(aggregateSettings),
      },
    };
    const service = new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const verifier = service as unknown as {
      assertPersistedSource(
        db: unknown,
        run: unknown,
        step: unknown,
        sourceRecordType: string,
        sourceRecordId: string,
        requirePosted: boolean,
      ): Promise<{ stockMovementId: string | null; journalId: string | null }>;
    };
    const run = boundRun;

    await expect(
      verifier.assertPersistedSource(
        prisma,
        run,
        { flowSerial: 72 },
        "MANUFACTURING_TRANSACTION",
        "transaction-1",
        true,
      ),
    ).resolves.toEqual({
      stockMovementId: "additional-issue-1-in",
      journalId: "additional-issue-1-voucher",
    });

    findFirst.mockResolvedValue({
      ...transaction,
      transactionType: "QA_RELEASE",
    });
    await expect(
      verifier.assertPersistedSource(
        prisma,
        run,
        { flowSerial: 72 },
        "MANUFACTURING_TRANSACTION",
        "transaction-1",
        true,
      ),
    ).rejects.toThrow(/requires MATERIAL_ISSUE/i);
  });

  it("rechecks no-GL location routes and exact scrap stock/GL evidence for shallow posting steps", async () => {
    const transactionBase = {
      companyId: "company-1",
      workspaceId: "workspace-1",
      status: "POSTED",
      orderId: "order-1",
      orderLotId: "lot-a",
      transactionDate: new Date("2026-08-30T00:00:00.000Z"),
      createdAt: new Date("2026-08-30T00:00:00.000Z"),
    };
    const staging = {
      ...transactionBase,
      id: "staging-1",
      transactionType: "LOCATION_TRANSFER",
      fromWarehouseId: "warehouse-rm",
      toWarehouseId: "warehouse-rm",
      fromLocationId: "location-rm",
      toLocationId: "location-stage",
      voucherEntryId: null,
      voucherEntry: null,
      lines: [
        {
          id: "staging-line",
          inventoryItemId: "RM-1",
          orderMaterialId: "material-rm",
          sourceInventoryLotId: "raw-lot",
          destinationInventoryLotId: "staged-lot",
          quantity: decimal(1),
          totalCost: decimal(10),
          stockMovements: [],
          serialMovements: [],
          sourceInventoryLot: null,
          destinationInventoryLot: null,
        },
      ],
    };
    const wipTransfer = {
      ...staging,
      id: "wip-transfer-1",
      fromWarehouseId: "warehouse-wip",
      toWarehouseId: "warehouse-wip",
      fromLocationId: "location-wip-a",
      toLocationId: "location-wip-b",
      lines: [
        {
          ...staging.lines[0],
          id: "wip-transfer-line",
          inventoryItemId: "INT-1",
          orderMaterialId: null,
          sourceInventoryLotId: "wip-lot-a",
          destinationInventoryLotId: "wip-lot-b",
        },
      ],
    };
    const scrapVoucher = postedVoucher({
      id: "scrap-voucher",
      transactionId: "scrap-1",
      transactionType: "SCRAP_RECEIPT",
      amount: 10,
      debitAccountId: "account-scrap",
      creditAccountId: "account-wip",
    });
    const scrap = {
      ...transactionBase,
      id: "scrap-1",
      transactionType: "SCRAP_RECEIPT",
      fromWarehouseId: "warehouse-wip",
      toWarehouseId: "warehouse-scrap",
      fromLocationId: "location-wip",
      toLocationId: "location-scrap",
      voucherEntryId: scrapVoucher.id,
      voucherEntry: scrapVoucher,
      lines: [
        {
          id: "scrap-line",
          inventoryItemId: "SCRAP-1",
          orderMaterialId: null,
          sourceInventoryLotId: null,
          destinationInventoryLotId: "scrap-lot",
          quantity: decimal(1),
          totalCost: decimal(10),
          stockMovements: [
            {
              id: "scrap-in",
              warehouseId: "warehouse-scrap",
              inventoryItemId: "SCRAP-1",
              transactionType: "SCRAP_RECEIPT",
              transactionId: "scrap-1",
              transactionLineId: "scrap-line",
              movementType: "IN",
              quantity: decimal(1),
              movementValue: decimal(10),
            },
          ],
          serialMovements: [],
          sourceInventoryLot: null,
          destinationInventoryLot: null,
        },
      ],
    };
    const prisma = {
      manufacturingTransaction: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(staging)
          .mockResolvedValueOnce(wipTransfer)
          .mockResolvedValueOnce(scrap),
      },
      manufacturingOrder: {
        findFirst: vi.fn().mockResolvedValue({
          issueWarehouseId: "warehouse-rm",
          materials: [{ id: "material-rm", inventoryItemId: "RM-1" }],
        }),
      },
      manufacturingWorkflowReview: {
        findFirst: vi.fn().mockResolvedValue({ id: "wip-route-review" }),
      },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue({
          defaultWipWarehouseId: "warehouse-wip",
          defaultWipLocationId: "location-wip",
          defaultScrapWarehouseId: "warehouse-scrap",
          scrapRecoveryAccountId: "account-scrap",
          wipInventoryAccountId: "account-wip",
        }),
      },
    };
    const service = new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const verifier = service as unknown as {
      assertPersistedSource(
        db: unknown,
        run: unknown,
        step: unknown,
        sourceRecordType: string,
        sourceRecordId: string,
        requirePosted: boolean,
      ): Promise<unknown>;
    };

    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 67 },
        "MANUFACTURING_TRANSACTION",
        "staging-1",
        true,
      ),
    ).resolves.toEqual({ stockMovementId: null, journalId: null });
    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 86 },
        "MANUFACTURING_TRANSACTION",
        "wip-transfer-1",
        true,
      ),
    ).resolves.toEqual({ stockMovementId: null, journalId: null });
    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 91 },
        "MANUFACTURING_TRANSACTION",
        "scrap-1",
        true,
      ),
    ).resolves.toEqual({
      stockMovementId: "scrap-in",
      journalId: "scrap-voucher",
    });
  });

  it("rejects unposted or unresolvable workflow posting sources", async () => {
    const prisma = {
      manufacturingTransaction: {
        findFirst: vi.fn().mockResolvedValue({
          status: "APPROVED",
          transactionType: "SCRAP_RECEIPT",
          voucherEntryId: null,
          lines: [],
        }),
      },
      auditLog: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const verifier = service as unknown as {
      assertPersistedSource(
        db: unknown,
        run: unknown,
        step: unknown,
        sourceRecordType: string,
        sourceRecordId: string,
        requirePosted: boolean,
      ): Promise<unknown>;
    };
    const run = { workspaceId: "workspace-1", productionOrderId: "order-1" };

    await expect(
      verifier.assertPersistedSource(
        prisma,
        run,
        { flowSerial: 91 },
        "MANUFACTURING_TRANSACTION",
        "receipt-1",
        true,
      ),
    ).rejects.toThrow(/has not been posted/i);
    await expect(
      verifier.assertPersistedSource(
        prisma,
        run,
        { flowSerial: 121 },
        "UNVERIFIED_RECORD",
        "fake-1",
        true,
      ),
    ).rejects.toThrow(/requires posting source MANUFACTURING_TRANSACTION/i);
  });

  it("fails closed when a posting step is given a source type from another posting flow", async () => {
    const service = new ManufacturingWorkflowService(
      {} as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const verifier = service as unknown as {
      assertPersistedSource(
        db: unknown,
        run: unknown,
        step: unknown,
        sourceRecordType: string,
        sourceRecordId: string,
        requirePosted: boolean,
      ): Promise<unknown>;
    };

    await expect(
      verifier.assertPersistedSource(
        {},
        boundRun,
        { flowSerial: 70 },
        "MANUFACTURING_COST_SNAPSHOT",
        "snapshot-1",
        true,
      ),
    ).rejects.toThrow(
      /Step 70 requires posting source MANUFACTURING_TRANSACTION/i,
    );
    await expect(
      verifier.assertPersistedSource(
        {},
        boundRun,
        { flowSerial: 139 },
        "MANUFACTURING_TRANSACTION",
        "transaction-1",
        true,
      ),
    ).rejects.toThrow(/Step 139 requires posting source/i);
    await expect(
      verifier.assertPersistedSource(
        {},
        boundRun,
        { flowSerial: 77 },
        "MANUFACTURING_TRANSACTION",
        "transaction-1",
        true,
      ),
    ).rejects.toThrow(
      /Step 77 requires posting source MANUFACTURING_WORKFLOW_REVIEW/i,
    );
  });

  it("accepts Step 139 only with an exact actual-cost voucher and rejects a draft snapshot", async () => {
    const amount = decimal("125.50");
    const actualCostVoucher = {
      id: "actual-cost-voucher",
      workspaceId: "workspace-1",
      companyId: "company-1",
      voucherType: "JOURNAL",
      documentKind: "MANUFACTURING_ACTUAL_COST",
      status: "POSTED",
      sourceType: "MANUFACTURING_ACTUAL_COST",
      sourceId: "order-1",
      totalAmount: amount,
      debit: amount,
      credit: amount,
      lines: [
        {
          accountId: "account-wip",
          debit: amount,
          credit: decimal(0),
        },
        {
          accountId: "account-clearing",
          debit: decimal(0),
          credit: amount,
        },
      ],
    };
    const prisma = {
      manufacturingActualCostPosting: {
        findFirst: vi.fn().mockResolvedValue({
          id: "actual-cost-1",
          companyId: "company-1",
          orderId: "order-1",
          amount,
          wipAccountId: "account-wip",
          clearingAccountId: "account-clearing",
          voucherEntryId: actualCostVoucher.id,
          voucherEntry: actualCostVoucher,
        }),
      },
      manufacturingCostSnapshot: {
        findFirst: vi.fn().mockResolvedValue({
          id: "snapshot-draft",
          companyId: "company-1",
          orderId: "order-1",
          status: "DRAFT",
          finalizedByUserId: null,
          finalizedAt: null,
          voucherEntryId: null,
          voucherEntry: null,
        }),
      },
    };
    const service = new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const verifier = service as unknown as {
      assertPersistedSource(
        db: unknown,
        run: unknown,
        step: unknown,
        sourceRecordType: string,
        sourceRecordId: string,
        requirePosted: boolean,
      ): Promise<unknown>;
    };

    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 139 },
        "MANUFACTURING_ACTUAL_COST_POSTING",
        "actual-cost-1",
        true,
      ),
    ).resolves.toEqual({
      stockMovementId: null,
      journalId: "actual-cost-voucher",
    });
    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 139 },
        "MANUFACTURING_COST_SNAPSHOT",
        "snapshot-draft",
        true,
      ),
    ).rejects.toThrow(/authoritative finalized manufacturing cost snapshot/i);
  });

  it("reconciles Steps 76 and 77 only through approved material-control decision evidence", async () => {
    const destructionAmount = decimal(10);
    const statusReview = {
      id: "decision-status",
      companyId: "company-1",
      entityId: "request-status",
      approvedByUserId: "checker-1",
      approvedAt: new Date("2026-08-30T00:00:00.000Z"),
      signatureHash: "status-signature",
      evidence: {
        action: "APPROVE",
        input: { kind: "STATUS_TRANSFER", orderId: "order-1" },
        result: {
          sourceInventoryLotId: "raw-lot-rejected",
          destinationInventoryLotId: "raw-lot-released",
          quantity: "1.0000",
          stockMovementPosted: false,
          journalPosted: false,
        },
      },
    };
    const destructionReview = {
      id: "decision-destruction",
      companyId: "company-1",
      entityId: "request-destruction",
      approvedByUserId: "checker-1",
      approvedAt: new Date("2026-08-30T00:00:00.000Z"),
      signatureHash: "destruction-signature",
      evidence: {
        action: "APPROVE",
        input: { kind: "DESTRUCTION", orderId: "order-1" },
        result: {
          inventoryLotId: "raw-lot-rejected",
          quantity: "1.0000",
          stockMovementId: "destruction-out",
          voucherEntryId: "destruction-voucher",
          writeOffAmount: "10.00",
        },
      },
    };
    const destructionVoucher = {
      id: "destruction-voucher",
      workspaceId: "workspace-1",
      companyId: "company-1",
      voucherType: "JOURNAL",
      documentKind: "MANUFACTURING_MATERIAL_DESTRUCTION",
      status: "POSTED",
      sourceType: "MANUFACTURING_MATERIAL_DESTRUCTION",
      sourceId: "request-destruction",
      totalAmount: destructionAmount,
      debit: destructionAmount,
      credit: destructionAmount,
      lines: [
        {
          accountId: "account-variance",
          debit: destructionAmount,
          credit: decimal(0),
        },
        {
          accountId: "account-rm",
          debit: decimal(0),
          credit: destructionAmount,
        },
      ],
    };
    const prisma = {
      manufacturingWorkflowReview: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(statusReview)
          .mockResolvedValueOnce(destructionReview),
      },
      manufacturingGenealogy: {
        findFirst: vi.fn().mockResolvedValue({ id: "status-genealogy" }),
      },
      stockMovement: {
        findFirst: vi.fn().mockResolvedValue({
          id: "destruction-out",
          companyId: "company-1",
          quantity: decimal(1),
          movementValue: destructionAmount,
          inventoryItem: {
            manufacturingProfile: { role: "RAW_MATERIAL" },
          },
        }),
      },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue({
          manufacturingVarianceAccountId: "account-variance",
          rawMaterialInventoryAccountId: "account-rm",
          packagingInventoryAccountId: "account-packaging",
        }),
      },
      voucherEntry: {
        findFirst: vi.fn().mockResolvedValue(destructionVoucher),
      },
    };
    const service = new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const verifier = service as unknown as {
      assertPersistedSource(
        db: unknown,
        run: unknown,
        step: unknown,
        sourceRecordType: string,
        sourceRecordId: string,
        requirePosted: boolean,
      ): Promise<unknown>;
    };

    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 76 },
        "MANUFACTURING_WORKFLOW_REVIEW",
        "decision-status",
        true,
      ),
    ).resolves.toEqual({ stockMovementId: null, journalId: null });
    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 77 },
        "MANUFACTURING_WORKFLOW_REVIEW",
        "decision-destruction",
        true,
      ),
    ).resolves.toEqual({
      stockMovementId: "destruction-out",
      journalId: "destruction-voucher",
    });
  });

  it("rejects aggregate posting reconciliation for an unbound run or a wrong-order source", async () => {
    const prisma = {
      manufacturingOrder: {
        findFirst: vi.fn().mockResolvedValue(aggregateOrder),
      },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue(aggregateSettings),
      },
      manufacturingTransaction: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const verifier = service as unknown as {
      assertPersistedSource(
        db: unknown,
        run: unknown,
        step: unknown,
        sourceRecordType: string,
        sourceRecordId: string,
        requirePosted: boolean,
      ): Promise<unknown>;
    };

    await expect(
      verifier.assertPersistedSource(
        prisma,
        { ...boundRun, productionOrderId: null },
        { flowSerial: 121 },
        "MANUFACTURING_TRANSACTION",
        "receipt-other-order",
        true,
      ),
    ).rejects.toThrow(/bound to one production order/i);
    expect(prisma.manufacturingOrder.findFirst).not.toHaveBeenCalled();

    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 121 },
        "MANUFACTURING_TRANSACTION",
        "receipt-other-order",
        true,
      ),
    ).rejects.toThrow(/belonging to this run's bound production order/i);
  });

  it("binds each primary order step only to its matching order type and mode", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "subcontract-order",
      type: "SUBCONTRACT",
    });
    const prisma = { manufacturingOrder: { findFirst } };
    const service = new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const verifier = service as unknown as {
      assertPersistedSource(
        db: unknown,
        run: unknown,
        step: unknown,
        sourceRecordType: string,
        sourceRecordId: string,
        requirePosted: boolean,
      ): Promise<unknown>;
    };
    const unboundGeneralRun = {
      ...boundRun,
      productionOrderId: null,
      manufacturingMode: "GENERAL",
    };

    await expect(
      verifier.assertPersistedSource(
        prisma,
        unboundGeneralRun,
        { flowSerial: 50 },
        "MANUFACTURING_ORDER",
        "subcontract-order",
        false,
      ),
    ).rejects.toThrow(/Step 50 requires an? ASSEMBLY production order/i);
    await expect(
      verifier.assertPersistedSource(
        prisma,
        unboundGeneralRun,
        { flowSerial: 52 },
        "MANUFACTURING_ORDER",
        "subcontract-order",
        false,
      ),
    ).resolves.toEqual({ stockMovementId: null, journalId: null });

    findFirst.mockResolvedValue({ id: "pharma-order", type: "PHARMACEUTICAL" });
    await expect(
      verifier.assertPersistedSource(
        prisma,
        unboundGeneralRun,
        { flowSerial: 51 },
        "MANUFACTURING_ORDER",
        "pharma-order",
        false,
      ),
    ).rejects.toThrow(/incompatible with GENERAL manufacturing mode/i);
  });

  it("does not let COMPLETE bypass an approval step's submit/checker path", async () => {
    const run = {
      ...boundRun,
      workflowDefinitionId: "definition-1",
      workflowDefinitionVersion: 1,
      productionPlanId: null,
      productId: null,
      manufacturingMode: "GENERAL",
      status: "PLANNED",
      currentGroup: "B",
      currentStepSerial: 9,
      version: 1,
      startedAt: new Date("2026-08-30T00:00:00.000Z"),
      completedAt: null,
      closedAt: null,
    };
    const approvalStep = {
      id: "run-step-9",
      runId: run.id,
      stepDefinitionId: "step-definition-9",
      status: "READY",
      applicable: true,
      blockerReason: null,
      naReason: null,
      sourceRecordType: null,
      sourceRecordId: null,
      startedAt: null,
      completedAt: null,
      completedBy: null,
      approvedBy: null,
      signatureReference: null,
      version: 1,
      flowSerial: 9,
      legacyStepCode: "11.02",
      flowGroupCode: "B",
      flowGroupName: "Setup, Workflow & Security",
      title: "Approval Workflow",
      route: "/app/manufacturing/dashboard?view=approval-workflow",
      postingEffect: "NONE",
      permissionKey: "manufacturing.configure",
      completionRule: { kind: "APPROVAL", requiredStatus: "APPROVED" },
      applicabilityType: "REQUIRED",
      stepType: "APPROVAL",
      repeatable: false,
      isBlocking: true,
    };
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([run])
        .mockResolvedValueOnce([approvalStep])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([approvalStep]),
    };
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "workspace-1",
          tenantId: "tenant-1",
          companyId: "company-1",
        }),
      },
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const permissions = {
      getGrantedKeys: vi
        .fn()
        .mockResolvedValue(new Set(["manufacturing.configure"])),
    };
    const service = new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      permissions as unknown as PermissionsService,
      electronicSignature,
    );

    await expect(
      service.transitionStep(user, run.id, approvalStep.id, {
        workspaceId: "workspace-1",
        idempotencyKey: "approval-bypass-attempt",
        action: "COMPLETE",
      }),
    ).rejects.toThrow(/must go through SUBMIT then APPROVE/i);

    const heldStep = {
      ...approvalStep,
      status: "IN_PROGRESS",
      completionRule: {
        kind: "DOMAIN_COMPLETION",
        requiredStatus: "COMPLETED",
      },
    };
    tx.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([run])
      .mockResolvedValueOnce([heldStep])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([heldStep]);
    await expect(
      service.transitionStep(user, run.id, heldStep.id, {
        workspaceId: "workspace-1",
        idempotencyKey: "hold-without-reason",
        action: "HOLD",
      }),
    ).rejects.toThrow(/HOLD requires a reason/i);

    tx.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([run])
      .mockResolvedValueOnce([heldStep])
      .mockResolvedValueOnce([]);
    await expect(
      service.transitionStep(user, run.id, heldStep.id, {
        workspaceId: "workspace-1",
        idempotencyKey: "generic-step-cancel-attempt",
        action: "CANCEL" as never,
      }),
    ).rejects.toThrow(/individual A-to-K run step cannot be cancelled/i);
  });

  it("keeps a POSTING step actionable in Next and exposes pinned step metadata", () => {
    const service = new ManufacturingWorkflowService(
      {} as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const verifier = service as unknown as {
      nextAction(
        runId: string,
        steps: unknown[],
        dependencies: unknown[],
      ): { state: string; step: Record<string, unknown> };
    };
    const postingStep = {
      id: "run-step-70",
      runId: "run-1",
      stepDefinitionId: "step-definition-70",
      status: "POSTING",
      applicable: true,
      blockerReason: null,
      naReason: null,
      sourceRecordType: "MANUFACTURING_TRANSACTION",
      sourceRecordId: "issue-a",
      startedAt: new Date("2026-08-30T00:00:00.000Z"),
      completedAt: null,
      completedBy: null,
      approvedBy: null,
      signatureReference: null,
      version: 2,
      flowSerial: 70,
      legacyStepCode: "05.12",
      flowGroupCode: "F",
      flowGroupName: "Raw Material Quality & Material Preparation",
      title: "Material Issue",
      route: "/app/manufacturing/dashboard?view=material-issue",
      postingEffect: "INVENTORY_AND_GL",
      permissionKey: "manufacturing.material.issue",
      completionRule: { kind: "DOMAIN_POSTING", requiredStatus: "POSTED" },
      applicabilityType: "REQUIRED",
      stepType: "POSTING",
      repeatable: true,
      isBlocking: true,
    };

    expect(verifier.nextAction("run-1", [postingStep], [])).toMatchObject({
      state: "READY",
      step: {
        flowSerial: 70,
        status: "POSTING",
        completionRule: {
          kind: "DOMAIN_POSTING",
          requiredStatus: "POSTED",
        },
        applicabilityType: "REQUIRED",
        stepType: "POSTING",
        repeatable: true,
      },
    });
  });

  it("keeps Step 70 blocked until every bound order lot is exactly issued, then returns every issue link", async () => {
    const issues = [
      issueTransaction({
        id: "issue-a",
        orderLotId: "lot-a",
        transactionType: "MATERIAL_ISSUE",
        inventoryItemId: "RM-1",
        orderMaterialId: "material-rm",
        quantity: 6,
        value: 60,
        creditAccountId: "account-rm",
      }),
      issueTransaction({
        id: "issue-b",
        orderLotId: "lot-b",
        transactionType: "MATERIAL_ISSUE",
        inventoryItemId: "RM-1",
        orderMaterialId: "material-rm",
        quantity: 5,
        value: 50,
        creditAccountId: "account-rm",
      }),
    ];
    const materialReturn = returnTransaction({
      id: "return-a",
      orderLotId: "lot-a",
      transactionType: "MATERIAL_RETURN",
      inventoryItemId: "RM-1",
      orderMaterialId: "material-rm",
      quantity: 1,
      value: 10,
      debitAccountId: "account-rm",
    });
    const allTransactions = [...issues, materialReturn];
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([issues[0]])
      .mockResolvedValue(allTransactions);
    const prisma = {
      manufacturingOrder: {
        findFirst: vi.fn().mockResolvedValue(aggregateOrder),
      },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue(aggregateSettings),
      },
      manufacturingTransaction: { findMany },
    };
    const service = new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const verifier = service as unknown as {
      assertPersistedSource(
        db: unknown,
        run: unknown,
        step: unknown,
        sourceRecordType: string,
        sourceRecordId: string,
        requirePosted: boolean,
      ): Promise<{
        postingLinks: Array<{
          sourceDocumentId: string;
          stockMovementId: string | null;
          journalId: string | null;
        }>;
      }>;
    };

    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 70 },
        "MANUFACTURING_TRANSACTION",
        "issue-a",
        true,
      ),
    ).rejects.toThrow(/every bound order lot is exactly issued/i);

    materialReturn.lines[0]!.orderMaterialId = "material-from-other-order";
    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 70 },
        "MANUFACTURING_TRANSACTION",
        "issue-b",
        true,
      ),
    ).rejects.toThrow(/order-material link outside the bound order/i);
    materialReturn.lines[0]!.orderMaterialId = "material-rm";

    materialReturn.voucherEntry.lines[0]!.accountId = "account-wip";
    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 70 },
        "MANUFACTURING_TRANSACTION",
        "issue-b",
        true,
      ),
    ).rejects.toThrow(/exact workspace-scoped.*posting voucher/i);
    materialReturn.voucherEntry.lines[0]!.accountId = "account-rm";

    issues[1]!.fromWarehouseId = "warehouse-from-other-order";
    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 70 },
        "MANUFACTURING_TRANSACTION",
        "issue-b",
        true,
      ),
    ).rejects.toThrow(/configured issue-to-WIP warehouse\/location/i);
    issues[1]!.fromWarehouseId = "warehouse-rm";

    const result = await verifier.assertPersistedSource(
      prisma,
      boundRun,
      { flowSerial: 70 },
      "MANUFACTURING_TRANSACTION",
      "issue-b",
      true,
    );
    expect(result.postingLinks).toEqual([
      expect.objectContaining({
        sourceDocumentId: "issue-a",
        stockMovementId: "issue-a-in",
        journalId: "issue-a-voucher",
      }),
      expect.objectContaining({
        sourceDocumentId: "issue-b",
        stockMovementId: "issue-b-in",
        journalId: "issue-b-voucher",
      }),
    ]);
  });

  it("reconciles Step 113 against every real lot packaging requirement", async () => {
    const packagingOrder = {
      ...aggregateOrder,
      materials: [
        {
          id: "material-packaging",
          inventoryItemId: "PACK-1",
          status: "PLANNED",
          plannedQuantity: decimal(10),
          inventoryItem: {
            manufacturingProfile: {
              role: "PACKAGING_MATERIAL",
              lotTracked: true,
            },
          },
        },
      ],
      packagingOrders: [
        {
          orderLotId: null,
          plannedQuantity: decimal(10),
          packagingConfiguration: {
            lines: [{ inventoryItemId: "PACK-1", quantity: decimal(1) }],
          },
        },
      ],
    };
    const transactions = [
      issueTransaction({
        id: "pack-a",
        orderLotId: "lot-a",
        transactionType: "PACKAGING_ISSUE",
        inventoryItemId: "PACK-1",
        orderMaterialId: "material-packaging",
        quantity: 6,
        value: 18,
        creditAccountId: "account-packaging",
      }),
      issueTransaction({
        id: "pack-b",
        orderLotId: "lot-b",
        transactionType: "PACKAGING_ISSUE",
        inventoryItemId: "PACK-1",
        orderMaterialId: "material-packaging",
        quantity: 5,
        value: 15,
        creditAccountId: "account-packaging",
      }),
      returnTransaction({
        id: "pack-return-a",
        orderLotId: "lot-a",
        transactionType: "PACKAGING_RETURN",
        inventoryItemId: "PACK-1",
        orderMaterialId: "material-packaging",
        quantity: 1,
        value: 3,
        debitAccountId: "account-packaging",
      }),
    ];
    const prisma = {
      manufacturingOrder: {
        findFirst: vi.fn().mockResolvedValue(packagingOrder),
      },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue(aggregateSettings),
      },
      manufacturingTransaction: {
        findMany: vi.fn().mockResolvedValue(transactions),
      },
    };
    const service = new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const verifier = service as unknown as {
      assertPersistedSource(
        db: unknown,
        run: unknown,
        step: unknown,
        sourceRecordType: string,
        sourceRecordId: string,
        requirePosted: boolean,
      ): Promise<{ postingLinks: unknown[] }>;
    };

    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 113 },
        "MANUFACTURING_TRANSACTION",
        "pack-b",
        true,
      ),
    ).resolves.toMatchObject({ postingLinks: [{}, {}] });
  });

  it("blocks the first-lot Step 121 receipt and links every exact FG-Q receipt only after aggregate completion", async () => {
    const receipts = [
      receiptTransaction({
        id: "receipt-a",
        orderLotId: "lot-a",
        quantity: 5,
        value: 50,
      }),
      receiptTransaction({
        id: "receipt-b",
        orderLotId: "lot-b",
        quantity: 5,
        value: 50,
      }),
    ];
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([receipts[0]])
      .mockResolvedValue(receipts);
    const prisma = {
      manufacturingOrder: {
        findFirst: vi.fn().mockResolvedValue(aggregateOrder),
      },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue(aggregateSettings),
      },
      manufacturingTransaction: { findMany },
    };
    const service = new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const verifier = service as unknown as {
      assertPersistedSource(
        db: unknown,
        run: unknown,
        step: unknown,
        sourceRecordType: string,
        sourceRecordId: string,
        requirePosted: boolean,
      ): Promise<{
        stockMovementId: string | null;
        postingLinks: Array<{
          sourceDocumentId: string;
          stockMovementId: string | null;
        }>;
      }>;
      persistPostingLinks(
        db: unknown,
        run: unknown,
        step: unknown,
        idempotencyKey: string,
        sourceRecordType: string,
        sourceRecordId: string,
        source: unknown,
      ): Promise<void>;
    };

    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 121 },
        "MANUFACTURING_TRANSACTION",
        "receipt-a",
        true,
      ),
    ).rejects.toThrow(/every completed production lot/i);

    const result = await verifier.assertPersistedSource(
      prisma,
      boundRun,
      { flowSerial: 121 },
      "MANUFACTURING_TRANSACTION",
      "receipt-b",
      true,
    );
    expect(result.stockMovementId).toBe("receipt-b-fgq-in");
    expect(result.postingLinks.map((link) => link.sourceDocumentId)).toEqual([
      "receipt-a",
      "receipt-b",
    ]);
    expect(result.postingLinks.map((link) => link.stockMovementId)).toEqual([
      "receipt-a-fgq-in",
      "receipt-b-fgq-in",
    ]);

    const postingDb = { $executeRaw: vi.fn().mockResolvedValue(1) };
    await verifier.persistPostingLinks(
      postingDb,
      boundRun,
      { flowSerial: 121 },
      "workflow-receipts",
      "MANUFACTURING_TRANSACTION",
      "receipt-b",
      result,
    );
    expect(postingDb.$executeRaw).toHaveBeenCalledTimes(2);

    const conflictingDb = { $executeRaw: vi.fn().mockResolvedValue(0) };
    await expect(
      verifier.persistPostingLinks(
        conflictingDb,
        boundRun,
        { flowSerial: 121 },
        "workflow-receipts-repeat",
        "MANUFACTURING_TRANSACTION",
        "receipt-b",
        result,
      ),
    ).rejects.toThrow(/different or reversed posting evidence/i);
  });

  it("requires every Step 126 lot transfer, both stock legs, released state and no GL", async () => {
    const receipts = [
      receiptTransaction({
        id: "receipt-a",
        orderLotId: "lot-a",
        quantity: 5,
        value: 50,
      }),
      receiptTransaction({
        id: "receipt-b",
        orderLotId: "lot-b",
        quantity: 5,
        value: 50,
      }),
    ];
    const releases = [
      qaReleaseTransaction({
        id: "release-a",
        orderLotId: "lot-a",
        quantity: 5,
        value: 50,
      }),
      qaReleaseTransaction({
        id: "release-b",
        orderLotId: "lot-b",
        quantity: 5,
        value: 50,
      }),
    ];
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([...receipts, releases[0]])
      .mockResolvedValue([...receipts, ...releases]);
    const prisma = {
      manufacturingOrder: {
        findFirst: vi.fn().mockResolvedValue(aggregateOrder),
      },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue(aggregateSettings),
      },
      manufacturingTransaction: { findMany },
    };
    const service = new ManufacturingWorkflowService(
      prisma as unknown as PrismaService,
      {} as PermissionsService,
      electronicSignature,
    );
    const verifier = service as unknown as {
      assertPersistedSource(
        db: unknown,
        run: unknown,
        step: unknown,
        sourceRecordType: string,
        sourceRecordId: string,
        requirePosted: boolean,
      ): Promise<{
        postingLinks: Array<{
          sourceDocumentId: string;
          stockMovementId: string | null;
          journalId: string | null;
        }>;
      }>;
    };

    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 126 },
        "MANUFACTURING_TRANSACTION",
        "release-a",
        true,
      ),
    ).rejects.toThrow(/every FG-Q receipt lot/i);

    const result = await verifier.assertPersistedSource(
      prisma,
      boundRun,
      { flowSerial: 126 },
      "MANUFACTURING_TRANSACTION",
      "release-b",
      true,
    );
    expect(result.postingLinks).toEqual([
      expect.objectContaining({
        sourceDocumentId: "release-a",
        stockMovementId: "release-a-in",
        journalId: null,
      }),
      expect.objectContaining({
        sourceDocumentId: "release-b",
        stockMovementId: "release-b-in",
        journalId: null,
      }),
    ]);

    releases[1].voucherEntryId = "unexpected-qa-voucher" as never;
    await expect(
      verifier.assertPersistedSource(
        prisma,
        boundRun,
        { flowSerial: 126 },
        "MANUFACTURING_TRANSACTION",
        "release-b",
        true,
      ),
    ).rejects.toThrow(/no-GL FG-Q to FG-R/i);
  });
});
