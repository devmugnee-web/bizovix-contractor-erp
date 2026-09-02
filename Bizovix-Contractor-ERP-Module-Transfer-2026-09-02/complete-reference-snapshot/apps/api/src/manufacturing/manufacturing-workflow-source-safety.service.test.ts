import { describe, expect, it, vi } from "vitest";

import type { PermissionsService } from "../common/services/permissions.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import { ManufacturingWorkflowService } from "./manufacturing-workflow.service.js";

const run = {
  id: "run-1",
  tenantId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  workflowDefinitionId: "definition-1",
  workflowDefinitionVersion: 1,
  productionPlanId: "plan-1",
  productionOrderId: "order-1",
  productId: "product-1",
  manufacturingMode: "GENERAL",
  status: "PLANNED",
  currentGroup: "C",
  currentStepSerial: 27,
  version: 1,
  startedAt: new Date("2026-08-30T00:00:00.000Z"),
  completedAt: null,
  closedAt: null,
};

function step(
  flowSerial: number,
  input: Partial<{
    flowGroupCode: string;
    title: string;
    route: string;
  }> = {},
) {
  return {
    flowSerial,
    flowGroupCode: input.flowGroupCode ?? "C",
    title: input.title ?? `Step ${flowSerial}`,
    route:
      input.route ??
      "/app/manufacturing/dashboard?section=masters&view=bom-master-formula",
  };
}

function verifier(prisma: Record<string, unknown>) {
  const service = new ManufacturingWorkflowService(
    prisma as unknown as PrismaService,
    {} as PermissionsService,
    {} as ManufacturingElectronicSignatureService,
  );
  return service as unknown as {
    assertPersistedSource(
      db: unknown,
      workflowRun: unknown,
      runStep: unknown,
      sourceRecordType: string,
      sourceRecordId: string,
      requirePosted: boolean,
      action?: string,
    ): Promise<{ stockMovementId: string | null; journalId: string | null }>;
  };
}

describe("manufacturing workflow authoritative non-posting sources", () => {
  it("rejects a draft or product-mismatched BOM and accepts only an approved matching version", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "bom-version-1",
      status: "DRAFT",
      bom: { finishedProductId: "product-1" },
    });
    const db = { manufacturingBomVersion: { findFirst } };
    const source = verifier(db);

    await expect(
      source.assertPersistedSource(
        db,
        run,
        step(28),
        "MANUFACTURING_BOM_VERSION",
        "bom-version-1",
        false,
        "COMPLETE",
      ),
    ).rejects.toThrow(/requires an approved/i);

    findFirst.mockResolvedValueOnce({
      id: "bom-version-1",
      status: "APPROVED",
      bom: { finishedProductId: "different-product" },
    });
    await expect(
      source.assertPersistedSource(
        db,
        run,
        step(28),
        "MANUFACTURING_BOM_VERSION",
        "bom-version-1",
        false,
        "COMPLETE",
      ),
    ).rejects.toThrow(/finished product does not match/i);

    findFirst.mockResolvedValueOnce({
      id: "bom-version-1",
      status: "APPROVED",
      bom: { finishedProductId: "product-1" },
    });
    await expect(
      source.assertPersistedSource(
        db,
        run,
        step(28),
        "MANUFACTURING_BOM_VERSION",
        "bom-version-1",
        false,
        "COMPLETE",
      ),
    ).resolves.toEqual({ stockMovementId: null, journalId: null });
  });

  it("does not let one approved plan satisfy unrelated planning gates", async () => {
    const db = {
      manufacturingPlan: {
        findFirst: vi.fn().mockResolvedValue({
          id: "plan-1",
          status: "APPROVED",
          finishedProductId: "product-1",
        }),
      },
    };
    const source = verifier(db);

    await expect(
      source.assertPersistedSource(
        db,
        run,
        step(47, { flowGroupCode: "D" }),
        "MANUFACTURING_PLAN",
        "plan-1",
        false,
        "COMPLETE",
      ),
    ).rejects.toThrow(/not controlled evidence for Step 47/i);
    await expect(
      source.assertPersistedSource(
        db,
        run,
        step(46, { flowGroupCode: "D" }),
        "MANUFACTURING_PLAN",
        "plan-1",
        false,
        "COMPLETE",
      ),
    ).resolves.toEqual({ stockMovementId: null, journalId: null });
  });

  it("requires an approved review aligned to the exact step and run scope", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "review-1",
      companyId: "company-1",
      workflowGroup: "MASTERS_FORMULA",
      workflowCode: "bom-master-formula",
      entityType: "MANUFACTURING_RUN",
      entityId: "run-1",
      status: "PENDING",
    });
    const db = { manufacturingWorkflowReview: { findFirst } };
    const source = verifier(db);

    await expect(
      source.assertPersistedSource(
        db,
        run,
        step(28, { title: "BOM / Master Formula" }),
        "MANUFACTURING_WORKFLOW_REVIEW",
        "review-1",
        false,
        "COMPLETE",
      ),
    ).rejects.toThrow(/APPROVED/i);

    findFirst.mockResolvedValueOnce({
      id: "review-1",
      companyId: "company-1",
      workflowGroup: "PLANNING_MRP",
      workflowCode: "bom-master-formula",
      entityType: "MANUFACTURING_RUN",
      entityId: "run-1",
      status: "APPROVED",
    });
    await expect(
      source.assertPersistedSource(
        db,
        run,
        step(28),
        "MANUFACTURING_WORKFLOW_REVIEW",
        "review-1",
        false,
        "COMPLETE",
      ),
    ).rejects.toThrow(/not aligned/i);

    findFirst.mockResolvedValueOnce({
      id: "review-1",
      companyId: "company-1",
      workflowGroup: "MASTERS_FORMULA",
      workflowCode: "bom-master-formula",
      entityType: "MANUFACTURING_ORDER",
      entityId: "another-order",
      status: "APPROVED",
    });
    await expect(
      source.assertPersistedSource(
        db,
        run,
        step(28),
        "MANUFACTURING_WORKFLOW_REVIEW",
        "review-1",
        false,
        "COMPLETE",
      ),
    ).rejects.toThrow(/must link this exact/i);

    findFirst.mockResolvedValueOnce({
      id: "review-1",
      companyId: "company-1",
      workflowGroup: "MASTERS_FORMULA",
      workflowCode: "bom-master-formula",
      entityType: "MANUFACTURING_RUN",
      entityId: "run-1",
      status: "APPROVED",
    });
    await expect(
      source.assertPersistedSource(
        db,
        run,
        step(28),
        "MANUFACTURING_WORKFLOW_REVIEW",
        "review-1",
        false,
        "COMPLETE",
      ),
    ).resolves.toEqual({ stockMovementId: null, journalId: null });
  });

  it("does not accept arbitrary audit rows or unapproved settings as terminal evidence", async () => {
    const db = {
      manufacturingSettings: {
        findFirst: vi.fn().mockResolvedValue({ id: "settings-1" }),
      },
      auditLog: { findFirst: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    };
    const source = verifier(db);

    await expect(
      source.assertPersistedSource(
        db,
        run,
        step(8, {
          flowGroupCode: "B",
          route:
            "/app/manufacturing/dashboard?section=setup&view=manufacturing-settings",
        }),
        "MANUFACTURING_SETTINGS",
        "settings-1",
        false,
        "COMPLETE",
      ),
    ).rejects.toThrow(/no approved version state/i);
    await expect(
      source.assertPersistedSource(
        db,
        run,
        step(30),
        "UNRELATED_AUDIT_ENTITY",
        "anything",
        false,
        "COMPLETE",
      ),
    ).rejects.toThrow(/not authoritative controlled evidence/i);
    expect(db.auditLog.findFirst).not.toHaveBeenCalled();
  });
});
