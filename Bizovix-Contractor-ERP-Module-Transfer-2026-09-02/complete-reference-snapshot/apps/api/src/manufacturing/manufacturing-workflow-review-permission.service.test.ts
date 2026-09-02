import { describe, expect, it, vi } from "vitest";

import { ManufacturingService } from "./manufacturing.service.js";

describe("manufacturing workflow-review permissions", () => {
  it("rejects evidence creation without manufacturing.audit.review", async () => {
    const user = {
      id: "user-1",
      tenantId: "tenant-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
    } as never;
    const create = vi.fn();
    const getGrantedKeys = vi.fn().mockResolvedValue(new Set<string>());
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "workspace-1",
          tenantId: "tenant-1",
          companyId: "company-1",
        }),
      },
      manufacturingWorkflowReview: { create },
    };
    const service = new ManufacturingService(
      prisma as never,
      { getGrantedKeys } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.createWorkflowReview(user, {
        workspaceId: "workspace-1",
        group: "QUALITY_COMPLIANCE",
        workflowKey: "zero-exception-review",
        outcome: "ZERO_REVIEW",
        reason: "No open exceptions after review.",
        transactionDate: "2026-09-29T00:00:00.000Z",
        idempotencyKey: "workflow-review-1",
      }),
    ).rejects.toThrow("Permission required: manufacturing.audit.review");

    expect(getGrantedKeys).toHaveBeenCalledWith(user);
    expect(create).not.toHaveBeenCalled();
  });
});
