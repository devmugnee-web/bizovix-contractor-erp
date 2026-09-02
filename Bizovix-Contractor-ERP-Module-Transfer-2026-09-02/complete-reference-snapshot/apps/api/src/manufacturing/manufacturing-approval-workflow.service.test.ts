import { describe, expect, it, vi } from "vitest";

import { ManufacturingApprovalWorkflowService } from "./manufacturing-approval-workflow.service.js";

const scope = {
  id: "workspace-1",
  tenantId: "tenant-1",
  companyId: "company-1",
};
const user = { id: "checker-1" } as never;
const electronicSignature = {
  enforce: vi.fn().mockResolvedValue(null),
} as never;

function transaction(existing: unknown[] = []) {
  return {
    manufacturingControlRecord: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "workflow-1",
          code: "PO-APPROVAL",
          versionNumber: 1,
          payload: {
            workflowScope: "PRODUCTION_ORDER",
            stages: [
              {
                sequence: 1,
                permissionKey: "stage.one",
                signatureMeaning: "Reviewed",
              },
              {
                sequence: 2,
                permissionKey: "stage.two",
                signatureMeaning: "Approved",
              },
            ],
          },
        },
      ]),
    },
    manufacturingSettings: {
      findUnique: vi.fn().mockResolvedValue({
        approvalRequired: true,
        electronicSignatureRequired: true,
      }),
    },
    manufacturingWorkflowReview: {
      findMany: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockImplementation(({ data }) => ({
        id: "review-new",
        ...data,
        createdAt: new Date(),
        createdBy: { name: "Checker" },
      })),
    },
  } as never;
}

describe("persisted manufacturing approval stages", () => {
  it("records only the next stage and returns interim progress", async () => {
    const service = new ManufacturingApprovalWorkflowService(
      {} as never,
      {
        getGrantedKeys: vi.fn().mockResolvedValue(new Set(["stage.one"])),
      } as never,
      electronicSignature,
    );
    const tx = transaction();
    const result = await service.advance(tx, {
      scope,
      user,
      workflowScope: "PRODUCTION_ORDER",
      workflowGroup: "PRODUCTION_BATCH_ORDERS",
      workflowCode: "ORDER_ACTION",
      entityType: "MANUFACTURING_ORDER",
      entityId: "order-1",
      entityLabel: "production order PO-1",
      makerUserId: "maker-1",
      transactionDate: new Date("2026-09-01"),
      idempotencyKey: "stage-1",
      signatureMeaning: "Reviewed",
    });
    expect(result).toMatchObject({
      completedStages: 1,
      totalStages: 2,
      complete: false,
      nextStage: 2,
    });
    expect(
      (tx as any).manufacturingWorkflowReview.create,
    ).toHaveBeenCalledOnce();
  });

  it("rejects an inexact signature meaning", async () => {
    const service = new ManufacturingApprovalWorkflowService(
      {} as never,
      {
        getGrantedKeys: vi.fn().mockResolvedValue(new Set(["stage.one"])),
      } as never,
      electronicSignature,
    );
    await expect(
      service.advance(transaction(), {
        scope,
        user,
        workflowScope: "PRODUCTION_ORDER",
        workflowGroup: "PRODUCTION_BATCH_ORDERS",
        workflowCode: "ORDER_ACTION",
        entityType: "MANUFACTURING_ORDER",
        entityId: "order-1",
        entityLabel: "production order PO-1",
        makerUserId: "maker-1",
        transactionDate: new Date("2026-09-01"),
        idempotencyKey: "stage-1",
        signatureMeaning: "Wrong",
      }),
    ).rejects.toThrow("exact signature meaning: Reviewed");
  });

  it("enforces maker-checker before recording a stage", async () => {
    const service = new ManufacturingApprovalWorkflowService(
      {} as never,
      { getGrantedKeys: vi.fn() } as never,
      electronicSignature,
    );
    await expect(
      service.advance(transaction(), {
        scope,
        user,
        workflowScope: "PRODUCTION_ORDER",
        workflowGroup: "PRODUCTION_BATCH_ORDERS",
        workflowCode: "ORDER_ACTION",
        entityType: "MANUFACTURING_ORDER",
        entityId: "order-1",
        entityLabel: "production order PO-1",
        makerUserId: "checker-1",
        transactionDate: new Date("2026-09-01"),
        idempotencyKey: "stage-1",
        signatureMeaning: "Reviewed",
      }),
    ).rejects.toThrow("record creator cannot approve");
  });

  it("records the final configured stage as complete", async () => {
    const firstStage = {
      id: "review-stage-1",
      idempotencyKey: "stage-1",
      evidence: { approvalWorkflowScope: "PRODUCTION_ORDER" },
    };
    const service = new ManufacturingApprovalWorkflowService(
      {} as never,
      {
        getGrantedKeys: vi.fn().mockResolvedValue(new Set(["stage.two"])),
      } as never,
      electronicSignature,
    );
    const tx = transaction([firstStage]);
    const result = await service.advance(tx, {
      scope,
      user,
      workflowScope: "PRODUCTION_ORDER",
      workflowGroup: "PRODUCTION_BATCH_ORDERS",
      workflowCode: "ORDER_ACTION",
      entityType: "MANUFACTURING_ORDER",
      entityId: "order-1",
      orderId: "order-1",
      entityLabel: "production order PO-1",
      makerUserId: "maker-1",
      transactionDate: new Date("2026-09-01"),
      idempotencyKey: "stage-2",
      signatureMeaning: "Approved",
    });

    expect(result).toMatchObject({
      completedStages: 2,
      totalStages: 2,
      complete: true,
      nextStage: null,
    });
    expect((tx as any).manufacturingWorkflowReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: "order-1" }),
      }),
    );
  });

  it("requires a different user at every configured approval stage", async () => {
    const firstStage = {
      id: "review-stage-1",
      idempotencyKey: "stage-1",
      approvedByUserId: "checker-1",
      evidence: { approvalWorkflowScope: "PRODUCTION_ORDER" },
    };
    const service = new ManufacturingApprovalWorkflowService(
      {} as never,
      {
        getGrantedKeys: vi.fn().mockResolvedValue(new Set(["stage.two"])),
      } as never,
      electronicSignature,
    );

    await expect(
      service.advance(transaction([firstStage]), {
        scope,
        user,
        workflowScope: "PRODUCTION_ORDER",
        workflowGroup: "PRODUCTION_BATCH_ORDERS",
        workflowCode: "ORDER_ACTION",
        entityType: "MANUFACTURING_ORDER",
        entityId: "order-1",
        entityLabel: "production order PO-1",
        makerUserId: "maker-1",
        transactionDate: new Date("2026-09-01"),
        idempotencyKey: "stage-2",
        signatureMeaning: "Approved",
      }),
    ).rejects.toThrow("distinct approver");
  });

  it("rechecks the configured stage permission before returning an idempotent replay", async () => {
    const replay = {
      id: "review-stage-1",
      idempotencyKey: "stage-1",
      approvedByUserId: "checker-1",
      transactionDate: new Date("2026-09-01"),
      evidence: { approvalWorkflowScope: "PRODUCTION_ORDER" },
    };
    const permissions = {
      getGrantedKeys: vi.fn().mockResolvedValue(new Set()),
    };
    const service = new ManufacturingApprovalWorkflowService(
      {} as never,
      permissions as never,
      electronicSignature,
    );

    await expect(
      service.advance(transaction([replay]), {
        scope,
        user,
        workflowScope: "PRODUCTION_ORDER",
        workflowGroup: "PRODUCTION_BATCH_ORDERS",
        workflowCode: "ORDER_ACTION",
        entityType: "MANUFACTURING_ORDER",
        entityId: "order-1",
        entityLabel: "production order PO-1",
        makerUserId: "maker-1",
        transactionDate: new Date("2026-09-01"),
        idempotencyKey: "stage-1",
        signatureMeaning: "Reviewed",
      }),
    ).rejects.toThrow("Permission required: stage.one");
    expect(permissions.getGrantedKeys).toHaveBeenCalledWith(user);
  });

  it("preserves static permission without adding maker-checker or e-signature to material issue fallback", async () => {
    const tx = transaction();
    (tx as any).manufacturingControlRecord.findMany.mockResolvedValue([]);
    const service = new ManufacturingApprovalWorkflowService(
      {} as never,
      {
        getGrantedKeys: vi
          .fn()
          .mockResolvedValue(new Set(["manufacturing.material.issue"])),
      } as never,
      electronicSignature,
    );

    const result = await service.advance(tx, {
      scope,
      user: { id: "maker-1" } as never,
      workflowScope: "MATERIAL_ISSUE",
      workflowGroup: "MATERIALS_DISPENSING",
      workflowCode: "ORDER_ACTION",
      entityType: "MANUFACTURING_ORDER_ACTION",
      entityId: "issue-fingerprint-1",
      orderId: "order-1",
      entityLabel: "material issue for PO-1",
      makerUserId: "maker-1",
      transactionDate: new Date("2026-09-01"),
      idempotencyKey: "issue-1",
      fallbackPermissionKey: "manufacturing.material.issue",
      fallbackMakerCheckerRequired: false,
      fallbackElectronicSignatureRequired: false,
    });

    expect(result).toMatchObject({ complete: true, totalStages: 1 });
  });

  it("still rejects material issue fallback when the static permission is absent", async () => {
    const tx = transaction();
    (tx as any).manufacturingControlRecord.findMany.mockResolvedValue([]);
    const service = new ManufacturingApprovalWorkflowService(
      {} as never,
      { getGrantedKeys: vi.fn().mockResolvedValue(new Set()) } as never,
      electronicSignature,
    );

    await expect(
      service.advance(tx, {
        scope,
        user,
        workflowScope: "MATERIAL_ISSUE",
        workflowGroup: "MATERIALS_DISPENSING",
        workflowCode: "ORDER_ACTION",
        entityType: "MANUFACTURING_ORDER_ACTION",
        entityId: "issue-fingerprint-2",
        orderId: "order-1",
        entityLabel: "material issue for PO-1",
        makerUserId: "maker-1",
        transactionDate: new Date("2026-09-01"),
        idempotencyKey: "issue-2",
        fallbackPermissionKey: "manufacturing.material.issue",
        fallbackMakerCheckerRequired: false,
        fallbackElectronicSignatureRequired: false,
      }),
    ).rejects.toThrow("Permission required: manufacturing.material.issue");
  });

  it("keeps the existing e-signature requirement for final-release fallback", async () => {
    const tx = transaction();
    (tx as any).manufacturingControlRecord.findMany.mockResolvedValue([]);
    const service = new ManufacturingApprovalWorkflowService(
      {} as never,
      {
        getGrantedKeys: vi
          .fn()
          .mockResolvedValue(new Set(["manufacturing.quality.release"])),
      } as never,
      electronicSignature,
    );

    await expect(
      service.advance(tx, {
        scope,
        user,
        workflowScope: "FINAL_RELEASE",
        workflowGroup: "QUALITY_COMPLIANCE",
        workflowCode: "ORDER_ACTION",
        entityType: "MANUFACTURING_ORDER_ACTION",
        entityId: "release-fingerprint-1",
        orderId: "order-1",
        entityLabel: "final release for PO-1",
        makerUserId: "maker-1",
        transactionDate: new Date("2026-09-01"),
        idempotencyKey: "release-1",
        fallbackPermissionKey: "manufacturing.quality.release",
        fallbackMakerCheckerRequired: false,
        fallbackElectronicSignatureRequired: true,
      }),
    ).rejects.toThrow("Electronic-signature meaning is required");
  });
});
