import { describe, expect, it, vi } from "vitest";

import { Prisma } from "../generated/prisma/index.js";
import { resolveApprovedMaterialVariances } from "./manufacturing-material-variance.service.js";

const actionDate = new Date("2026-08-30T10:00:00.000Z");
const material = {
  id: "order-material-1",
  inventoryItemId: "item-1",
  unit: "PCS",
  requiredQuantity: new Prisma.Decimal(10),
  consumedQuantity: new Prisma.Decimal(11),
  scrappedQuantity: new Prisma.Decimal(0),
};

function approvedCase(overrides: Record<string, unknown> = {}) {
  return {
    id: "case-1",
    inventoryItemId: "item-1",
    createdByUserId: "maker",
    approvedByUserId: "checker",
    approvedAt: new Date("2026-08-30T09:00:00.000Z"),
    payload: {
      details: {
        caseType: "DEVIATION",
        state: "CLOSED",
        orderId: "order-1",
        productionOrderId: "order-1",
        orderMaterialId: "order-material-1",
        inventoryItemId: "item-1",
        sourceReference: "order-material-1",
        approvedVarianceQuantity: 1,
        approvedVarianceUnit: "PCS",
        varianceReason: "Validated process over-consumption",
        ...overrides,
      },
    },
  };
}

function db(cases = [approvedCase()], approvals: unknown[] = [
  {
    entityId: "case-1",
    approvedByUserId: "checker",
    approvedAt: new Date("2026-08-30T09:00:00.000Z"),
    signatureHash: "signed-hash",
  },
]) {
  return {
    manufacturingControlRecord: { findMany: vi.fn().mockResolvedValue(cases) },
    manufacturingWorkflowReview: { findMany: vi.fn().mockResolvedValue(approvals) },
  };
}

type MockDb = ReturnType<typeof db>;

async function resolve(mockDb: MockDb, materials = [material]) {
  return resolveApprovedMaterialVariances(mockDb as unknown as Prisma.TransactionClient, {
    workspaceId: "workspace-1",
    orderId: "order-1",
    actionDate,
    materials,
  });
}

describe("resolveApprovedMaterialVariances", () => {
  it("maps the UI contract's canonical productionOrderId and numeric quantity", async () => {
    const result = await resolve(db([approvedCase({ orderId: undefined })]));
    expect(result.get(material.id)).toBe("case-1");
  });

  it.each([
    ["wrong material", { orderMaterialId: "other", sourceReference: "other" }],
    ["wrong item", { inventoryItemId: "other" }],
    ["wrong order", { orderId: "other", productionOrderId: "other" }],
    ["wrong quantity", { approvedVarianceQuantity: "2" }],
    ["wrong unit", { approvedVarianceUnit: "KG" }],
    ["missing reason", { varianceReason: "" }],
    ["generic case", { caseType: "CAPA" }],
    ["open case", { state: "OPEN" }],
  ])("fails closed for %s evidence", async (_name, override) => {
    expect(await resolve(db([approvedCase(override)]))).toEqual(new Map());
  });

  it("rejects unsigned, unapproved or non-independent evidence", async () => {
    expect(await resolve(db([approvedCase()], []))).toEqual(new Map());
    expect(
      await resolve(
        db([{ ...approvedCase(), approvedByUserId: "maker" }]),
      ),
    ).toEqual(new Map());
  });

  it("is deterministic on replay and cannot reuse one case for two rows", async () => {
    const mockDb = db();
    expect(await resolve(mockDb)).toEqual(await resolve(mockDb));
    const second = { ...material, id: "order-material-2" };
    const result = await resolve(mockDb, [material, second]);
    expect(result.size).toBe(1);
    expect(result.get(material.id)).toBe("case-1");
  });

  it("does not query approvals for a no-variance close", async () => {
    const mockDb = db();
    const result = await resolve(mockDb, [
      { ...material, consumedQuantity: new Prisma.Decimal(10) },
    ]);
    expect(result).toEqual(new Map());
    expect(mockDb.manufacturingControlRecord.findMany).not.toHaveBeenCalled();
    expect(mockDb.manufacturingWorkflowReview.findMany).not.toHaveBeenCalled();
  });
});
