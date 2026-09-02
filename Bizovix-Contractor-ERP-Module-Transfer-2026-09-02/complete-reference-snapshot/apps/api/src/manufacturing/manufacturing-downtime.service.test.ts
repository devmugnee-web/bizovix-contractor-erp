import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { PermissionsService } from "../common/services/permissions.service.js";
import { Prisma } from "../generated/prisma/index.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import {
  calculateDowntimeDurationMinutes,
  ManufacturingDowntimeService,
} from "./manufacturing-downtime.service.js";

const user: AuthenticatedRequestUser = {
  id: "user-1",
  email: "operator@example.com",
  name: "Operator",
  initials: "OP",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

const scope = {
  id: "workspace-1",
  tenantId: "tenant-1",
  companyId: "company-1",
};

const includedEvent = {
  id: "down-1",
  tenantId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  orderId: "order-1",
  operationExecutionId: "execution-1",
  resourceId: "resource-1",
  status: "OPEN",
  reasonCode: "BREAKDOWN",
  reason: "Drive motor stopped",
  startedAt: new Date("2026-09-10T08:00:00.000Z"),
  endedAt: null,
  durationMinutes: null,
  startIdempotencyKey: "start-key",
  endIdempotencyKey: null,
  startedByUserId: "user-1",
  endedByUserId: null,
  startSignatureMeaning: "Recorded",
  endSignatureMeaning: null,
  startSignatureHash: "start-hash",
  endSignatureHash: null,
  startSignatureEvidence: null,
  endSignatureEvidence: null,
  endNote: null,
  createdAt: new Date("2026-09-10T08:00:00.000Z"),
  updatedAt: new Date("2026-09-10T08:00:00.000Z"),
  order: {
    id: "order-1",
    orderNumber: "MO-001",
    status: "IN_PRODUCTION",
    finishedProduct: {
      id: "item-1",
      itemCode: "FRIDGE",
      itemName: "Fridge",
      unit: "pcs",
    },
  },
  operationExecution: {
    id: "execution-1",
    status: "PAUSED",
    routingOperation: { id: "operation-1", code: "ASM", name: "Assembly" },
  },
  resource: {
    id: "resource-1",
    code: "LINE-01",
    name: "Assembly Line 1",
    kind: "PRODUCTION_LINE",
  },
  startedBy: { id: "user-1", name: "Operator" },
  endedBy: null,
};

function permissions() {
  return {
    getGrantedKeys: vi
      .fn()
      .mockResolvedValue(
        new Set(["manufacturing.view", "manufacturing.production.execute"]),
      ),
  } as unknown as PermissionsService;
}

function signature() {
  return {
    enforce: vi.fn().mockResolvedValue(null),
  } as unknown as ManufacturingElectronicSignatureService;
}

describe("manufacturing downtime lifecycle", () => {
  it("calculates duration on the server to four decimal minutes", () => {
    expect(
      calculateDowntimeDurationMinutes(
        new Date("2026-09-10T08:00:00.000Z"),
        new Date("2026-09-10T09:30:30.000Z"),
      ),
    ).toBe("90.5000");
    expect(() =>
      calculateDowntimeDurationMinutes(
        new Date("2026-09-10T09:00:00.000Z"),
        new Date("2026-09-10T08:00:00.000Z"),
      ),
    ).toThrow(BadRequestException);
  });

  it("rejects a machine or line that is not assigned to the operation", async () => {
    const tx = {
      manufacturingDowntimeEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      manufacturingPeriod: { findUnique: vi.fn().mockResolvedValue(null) },
      manufacturingOperationExecution: {
        findFirst: vi.fn().mockResolvedValue({
          id: "execution-1",
          status: "IN_PROGRESS",
          routingOperationId: "operation-1",
          order: { id: "order-1", orderNumber: "MO-001" },
          routingOperation: { code: "ASM", name: "Assembly" },
        }),
      },
      manufacturingOperationResourceRequirement: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scope) },
      manufacturingDowntimeEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ManufacturingDowntimeService(
      prisma,
      permissions(),
      signature(),
    );

    await expect(
      service.start(user, {
        workspaceId: "workspace-1",
        orderId: "order-1",
        operationExecutionId: "execution-1",
        resourceId: "unassigned-resource",
        reason: "Drive stopped",
        transactionDate: "2026-09-10T08:00:00.000Z",
        idempotencyKey: "start-key",
      }),
    ).rejects.toThrow("assigned to this operation");
  });

  it("atomically pauses the operation and persists an audited open event", async () => {
    const tx = {
      manufacturingDowntimeEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(includedEvent),
      },
      manufacturingPeriod: { findUnique: vi.fn().mockResolvedValue(null) },
      manufacturingOperationExecution: {
        findFirst: vi.fn().mockResolvedValue({
          id: "execution-1",
          status: "IN_PROGRESS",
          routingOperationId: "operation-1",
          order: { id: "order-1", orderNumber: "MO-001" },
          routingOperation: { code: "ASM", name: "Assembly" },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      manufacturingOperationResourceRequirement: {
        findFirst: vi.fn().mockResolvedValue({
          resource: {
            id: "resource-1",
            code: "LINE-01",
            name: "Assembly Line 1",
            kind: "PRODUCTION_LINE",
          },
        }),
      },
      manufacturingControlRecord: {
        findFirst: vi.fn().mockResolvedValue({ id: "reason-1" }),
      },
      manufacturingSettings: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ electronicSignatureRequired: false }),
      },
      manufacturingWorkflowReview: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scope) },
      manufacturingDowntimeEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ManufacturingDowntimeService(
      prisma,
      permissions(),
      signature(),
    );

    const result = await service.start(user, {
      workspaceId: "workspace-1",
      orderId: "order-1",
      operationExecutionId: "execution-1",
      resourceId: "resource-1",
      reasonCode: "BREAKDOWN",
      reason: "Drive motor stopped",
      transactionDate: "2026-09-10T08:00:00.000Z",
      idempotencyKey: "start-key",
      signatureMeaning: "Recorded",
    });

    expect(result.status).toBe("OPEN");
    expect(tx.manufacturingOperationExecution.updateMany).toHaveBeenCalledWith({
      where: { id: "execution-1", status: "IN_PROGRESS" },
      data: { status: "PAUSED", pauseReason: "Drive motor stopped" },
    });
    expect(tx.manufacturingDowntimeEvent.create).toHaveBeenCalled();
    expect(tx.manufacturingWorkflowReview.create).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("ends the event, persists computed duration, and resumes the operation", async () => {
    const endedEvent = {
      ...includedEvent,
      status: "ENDED",
      endedAt: new Date("2026-09-10T09:30:30.000Z"),
      durationMinutes: new Prisma.Decimal("90.5000"),
      endIdempotencyKey: "end-key",
      endSignatureMeaning: "Resolved",
      endNote: "Motor reset",
      operationExecution: {
        ...includedEvent.operationExecution,
        status: "IN_PROGRESS",
      },
      endedBy: { id: "user-1", name: "Operator" },
    };
    const tx = {
      manufacturingDowntimeEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(includedEvent),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(endedEvent),
      },
      manufacturingPeriod: { findUnique: vi.fn().mockResolvedValue(null) },
      manufacturingSettings: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ electronicSignatureRequired: false }),
      },
      manufacturingOperationExecution: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      manufacturingWorkflowReview: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scope) },
      manufacturingDowntimeEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ManufacturingDowntimeService(
      prisma,
      permissions(),
      signature(),
    );

    const result = await service.end(user, "down-1", {
      workspaceId: "workspace-1",
      transactionDate: "2026-09-10T09:30:30.000Z",
      idempotencyKey: "end-key",
      endNote: "Motor reset",
      signatureMeaning: "Resolved",
    });

    expect(result.durationMinutes).toBe("90.5");
    expect(tx.manufacturingDowntimeEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "down-1", status: "OPEN" }),
        data: expect.objectContaining({
          status: "ENDED",
          endIdempotencyKey: "end-key",
          durationMinutes: new Prisma.Decimal("90.5000"),
        }),
      }),
    );
    expect(tx.manufacturingOperationExecution.updateMany).toHaveBeenCalledWith({
      where: {
        id: "execution-1",
        orderId: "order-1",
        status: "PAUSED",
      },
      data: { status: "IN_PROGRESS", pauseReason: null },
    });
  });

  it("does not resume downtime after the linked order leaves production", async () => {
    const tx = {
      manufacturingDowntimeEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue({
          ...includedEvent,
          order: { ...includedEvent.order, status: "CLOSED" },
        }),
      },
      manufacturingPeriod: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scope) },
      manufacturingDowntimeEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ManufacturingDowntimeService(
      prisma,
      permissions(),
      signature(),
    );

    await expect(
      service.end(user, "down-1", {
        workspaceId: "workspace-1",
        transactionDate: "2026-09-10T09:30:30.000Z",
        idempotencyKey: "end-key",
        signatureMeaning: "Resolved",
      }),
    ).rejects.toThrow("must remain IN_PRODUCTION");
  });

  it("rejects semantic reuse of a start idempotency key", async () => {
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scope) },
      manufacturingDowntimeEvent: {
        findUnique: vi.fn().mockResolvedValue(includedEvent),
      },
    } as unknown as PrismaService;
    const service = new ManufacturingDowntimeService(
      prisma,
      permissions(),
      signature(),
    );

    await expect(
      service.start(user, {
        workspaceId: "workspace-1",
        orderId: "order-1",
        operationExecutionId: "execution-1",
        resourceId: "resource-1",
        reasonCode: "POWER_FAILURE",
        reason: "Drive motor stopped",
        transactionDate: "2026-09-10T08:00:00.000Z",
        idempotencyKey: "start-key",
        signatureMeaning: "Recorded",
      }),
    ).rejects.toThrow("different details");

    await expect(
      service.start(user, {
        workspaceId: "workspace-1",
        orderId: "order-1",
        operationExecutionId: "execution-1",
        resourceId: "resource-1",
        reasonCode: "BREAKDOWN",
        reason: "Drive motor stopped",
        transactionDate: "2026-09-10T08:00:00.000Z",
        idempotencyKey: "start-key",
        signatureMeaning: "Different meaning",
      }),
    ).rejects.toThrow("different details");
  });

  it("rejects semantic reuse of an end idempotency key", async () => {
    const replay = {
      ...includedEvent,
      status: "ENDED",
      endedAt: new Date("2026-09-10T09:00:00.000Z"),
      endIdempotencyKey: "end-key",
      endNote: "Motor reset",
      endSignatureMeaning: "Resolved",
    };
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scope) },
      manufacturingDowntimeEvent: {
        findUnique: vi.fn().mockResolvedValue(replay),
      },
    } as unknown as PrismaService;
    const service = new ManufacturingDowntimeService(
      prisma,
      permissions(),
      signature(),
    );

    await expect(
      service.end(user, "down-1", {
        workspaceId: "workspace-1",
        transactionDate: "2026-09-10T09:00:00.000Z",
        idempotencyKey: "end-key",
        endNote: "Different resolution",
        signatureMeaning: "Resolved",
      }),
    ).rejects.toThrow("different details");

    await expect(
      service.end(user, "down-1", {
        workspaceId: "workspace-1",
        transactionDate: "2026-09-10T09:00:00.000Z",
        idempotencyKey: "end-key",
        endNote: "Motor reset",
        signatureMeaning: "Different meaning",
      }),
    ).rejects.toThrow("different details");
  });

  it("returns the latest effective approved reason-code version deterministically", async () => {
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(scope) },
      manufacturingControlRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "breakdown-v3",
            code: "BREAKDOWN",
            name: "Breakdown v3",
            payload: {},
            versionNumber: 3,
          },
          {
            id: "breakdown-v2",
            code: "BREAKDOWN",
            name: "Breakdown v2",
            payload: {},
            versionNumber: 2,
          },
          {
            id: "power-v1",
            code: "POWER",
            name: "Power failure",
            payload: {},
            versionNumber: 1,
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new ManufacturingDowntimeService(
      prisma,
      permissions(),
      signature(),
    );

    const result = await service.listReasonCodes(user, "workspace-1");

    expect(result.map((entry) => entry.id)).toEqual([
      "breakdown-v3",
      "power-v1",
    ]);
  });
});
