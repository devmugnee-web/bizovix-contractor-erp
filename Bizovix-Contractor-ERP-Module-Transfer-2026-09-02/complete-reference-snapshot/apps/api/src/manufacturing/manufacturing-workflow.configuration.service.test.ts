import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { PermissionsService } from "../common/services/permissions.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import { ManufacturingWorkflowService } from "./manufacturing-workflow.service.js";

const user: AuthenticatedRequestUser = {
  id: "user-1",
  email: "admin@example.com",
  name: "Admin",
  initials: "A",
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

function configurationRow(input?: {
  hiddenStepCodes?: string[];
  revision?: number;
  workflowDefinitionVersion?: string;
  updatedByUserId?: string;
}) {
  return {
    id: "configuration-1",
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    workspaceId: scope.id,
    settings: {
      schemaVersion: 1,
      workflowDefinitionVersion: input?.workflowDefinitionVersion ?? "2",
      hiddenStepCodes: input?.hiddenStepCodes ?? [],
      revision: input?.revision ?? 1,
      updatedByUserId: input?.updatedByUserId ?? user.id,
    },
    updatedAt: new Date("2026-09-01T10:00:00.000Z"),
  };
}

function harness(existing: ReturnType<typeof configurationRow> | null) {
  type SettingsUpsertArgs = {
    create?: { settings: unknown };
    update: { settings: unknown };
  };
  const safetyProbes = {
    definitionUpdate: vi.fn(),
    runStepUpdate: vi.fn(),
    postingUpdate: vi.fn(),
    stockUpdate: vi.fn(),
    voucherUpdate: vi.fn(),
    accountUpdate: vi.fn(),
  };
  const transactionClient = {
    workspaceAppSettings: {
      findUnique: vi.fn().mockResolvedValue(existing),
      upsert: vi.fn().mockImplementation(async (args: SettingsUpsertArgs) => ({
        id: existing?.id ?? "configuration-1",
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        settings: args.create?.settings ?? args.update.settings,
        updatedAt: new Date("2026-09-01T10:05:00.000Z"),
      })),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    manufacturingWorkflowStepDefinition: {
      updateMany: safetyProbes.definitionUpdate,
    },
    manufacturingRunStep: { updateMany: safetyProbes.runStepUpdate },
    manufacturingPostingLink: { updateMany: safetyProbes.postingUpdate },
    stockMovement: { updateMany: safetyProbes.stockUpdate },
    voucherEntry: { updateMany: safetyProbes.voucherUpdate },
    account: { updateMany: safetyProbes.accountUpdate },
  };
  const prisma = {
    workspace: { findFirst: vi.fn().mockResolvedValue(scope) },
    workspaceAppSettings: {
      findUnique: vi.fn().mockResolvedValue(existing),
    },
    $transaction: vi
      .fn()
      .mockImplementation(
        async (callback: (tx: typeof transactionClient) => unknown) =>
          callback(transactionClient),
      ),
  };
  const service = new ManufacturingWorkflowService(
    prisma as unknown as PrismaService,
    {} as PermissionsService,
    {} as ManufacturingElectronicSignatureService,
  );
  return { service, prisma, transactionClient, safetyProbes };
}

describe("ManufacturingWorkflowService workflow configuration", () => {
  it("defaults to all 159 controls visible without creating a settings row", async () => {
    const { service, prisma } = harness(null);

    await expect(service.getConfiguration(user, scope.id)).resolves.toEqual({
      workspaceId: scope.id,
      workflowDefinitionVersion: "2",
      totalSteps: 159,
      hiddenStepSerials: [],
      enabledStepSerials: Array.from({ length: 159 }, (_, index) => index + 1),
      revision: 0,
      updatedAt: null,
      updatedByUserId: null,
    });
    expect(prisma.workspaceAppSettings.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_namespace: {
            workspaceId: scope.id,
            namespace: "manufacturing-workflow-visibility-v1",
          },
        },
      }),
    );
  });

  it("maps stable stored step codes back to current catalog serials", async () => {
    const { service } = harness(
      configurationRow({
        hiddenStepCodes: ["01.07", "03.11", "10.01", "99.99"],
        revision: 4,
      }),
    );

    const result = await service.getConfiguration(user, scope.id);

    expect(result.hiddenStepSerials).toEqual([7, 39, 144]);
    expect(result.enabledStepSerials).not.toContain(7);
    expect(result.enabledStepSerials).toHaveLength(156);
    expect(result.revision).toBe(4);
  });

  it("keeps the safe all-visible default idempotent without creating a row", async () => {
    const { service, transactionClient } = harness(null);

    await expect(
      service.updateConfiguration(user, {
        workspaceId: scope.id,
        workflowDefinitionVersion: "2",
        hiddenStepSerials: [],
        expectedRevision: 0,
      }),
    ).resolves.toMatchObject({
      hiddenStepSerials: [],
      revision: 0,
      updatedAt: null,
      updatedByUserId: null,
    });
    expect(
      transactionClient.workspaceAppSettings.upsert,
    ).not.toHaveBeenCalled();
    expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
  });

  it("saves only presentation settings, increments revision and audits the change", async () => {
    const { service, transactionClient, safetyProbes } = harness(
      configurationRow({ hiddenStepCodes: ["01.07"], revision: 3 }),
    );

    const result = await service.updateConfiguration(user, {
      workspaceId: scope.id,
      workflowDefinitionVersion: "2",
      hiddenStepSerials: [144, 39],
      expectedRevision: 3,
    });

    expect(result).toMatchObject({
      hiddenStepSerials: [39, 144],
      revision: 4,
      updatedByUserId: user.id,
    });
    expect(transactionClient.workspaceAppSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          settings: expect.objectContaining({
            workflowDefinitionVersion: "2",
            hiddenStepCodes: ["03.11", "10.01"],
            revision: 4,
            updatedByUserId: user.id,
          }),
        },
      }),
    );
    expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "MANUFACTURING_WORKFLOW_CONFIGURATION_CHANGED",
        entityType: "WORKSPACE_APP_SETTINGS",
        newValues: expect.objectContaining({
          hiddenStepSerials: [39, 144],
          revision: 4,
          presentationOnly: true,
        }),
      }),
    });
    for (const probe of Object.values(safetyProbes))
      expect(probe).not.toHaveBeenCalled();
  });

  it("returns an idempotent replay but rejects a stale conflicting revision", async () => {
    const existing = configurationRow({
      hiddenStepCodes: ["01.07", "03.11"],
      revision: 5,
    });
    const replay = harness(existing);

    await expect(
      replay.service.updateConfiguration(user, {
        workspaceId: scope.id,
        workflowDefinitionVersion: "2",
        hiddenStepSerials: [39, 7],
        expectedRevision: 4,
      }),
    ).resolves.toMatchObject({ revision: 5, hiddenStepSerials: [7, 39] });
    expect(
      replay.transactionClient.workspaceAppSettings.upsert,
    ).not.toHaveBeenCalled();
    expect(replay.transactionClient.auditLog.create).not.toHaveBeenCalled();

    const conflict = harness(existing);
    await expect(
      conflict.service.updateConfiguration(user, {
        workspaceId: scope.id,
        workflowDefinitionVersion: "2",
        hiddenStepSerials: [144],
        expectedRevision: 4,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects stale definitions and hiding every workflow step", async () => {
    const { service } = harness(null);

    await expect(
      service.updateConfiguration(user, {
        workspaceId: scope.id,
        workflowDefinitionVersion: "1",
        hiddenStepSerials: [],
        expectedRevision: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.updateConfiguration(user, {
        workspaceId: scope.id,
        workflowDefinitionVersion: "2",
        hiddenStepSerials: Array.from({ length: 159 }, (_, index) => index + 1),
        expectedRevision: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
