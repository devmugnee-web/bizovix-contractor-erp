import { describe, expect, it } from "vitest";

import { evaluateManufacturingPackagingReleasePolicy } from "./manufacturing-packaging-release-policy.domain.js";

const at = new Date("2026-09-30T12:00:00.000Z");
const receiptAt = new Date("2026-09-30T10:00:00.000Z");

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluateManufacturingPackagingReleasePolicy({
    orderId: "order-1",
    finishedProductId: "fridge-1",
    requiredQuantity: 10,
    at,
    configurations: [
      {
        id: "config-1",
        inventoryItemId: "fridge-1",
        status: "APPROVED",
        effectiveFrom: null,
        effectiveTo: null,
      },
    ],
    naEvidence: [],
    packagingOrders: [
      {
        id: "pack-1",
        orderId: "order-1",
        orderLotId: null,
        packagingConfigurationId: "config-1",
        status: "RELEASE_READY",
        plannedQuantity: 10,
        releaseReadyAt: new Date("2026-09-30T11:00:00.000Z"),
      },
    ],
    finishedGoodsReceipts: [
      {
        id: "fgr-1",
        orderId: "order-1",
        status: "POSTED",
        transactionDate: receiptAt,
        quantity: 10,
      },
    ],
    ...overrides,
  });
}

describe("manufacturing packaging release policy", () => {
  it("fails closed when neither an approved configuration nor exact N/A exists", () => {
    const result = evaluate({ configurations: [], packagingOrders: [] });
    expect(result.ready).toBe(false);
    expect(result.issues.join(" ")).toContain("No effective APPROVED");
  });

  it("rejects partial and other-order packaging coverage", () => {
    const result = evaluate({
      packagingOrders: [
        {
          id: "partial",
          orderId: "order-1",
          orderLotId: null,
          packagingConfigurationId: "config-1",
          status: "RELEASE_READY",
          plannedQuantity: 5,
          releaseReadyAt: at,
        },
        {
          id: "other-order",
          orderId: "order-2",
          orderLotId: null,
          packagingConfigurationId: "config-1",
          status: "RELEASE_READY",
          plannedQuantity: 5,
          releaseReadyAt: at,
        },
      ],
    });
    expect(result.ready).toBe(false);
    expect(result.packagingQuantity).toBe("5");
  });

  it("rejects RELEASE_READY recorded before the finished-goods receipt", () => {
    const result = evaluate({
      packagingOrders: [
        {
          id: "pack-1",
          orderId: "order-1",
          orderLotId: null,
          packagingConfigurationId: "config-1",
          status: "RELEASE_READY",
          plannedQuantity: 10,
          releaseReadyAt: new Date("2026-09-30T09:00:00.000Z"),
        },
      ],
    });
    expect(result.ready).toBe(false);
    expect(result.issues.join(" ")).toContain("after the latest posted");
  });

  it("accepts exact order-level packaging after an exact posted FGR", () => {
    const result = evaluate();
    expect(result.ready).toBe(true);
    expect(result.packagingQuantity).toBe("10");
    expect(result.receiptQuantity).toBe("10");
  });

  it("preserves genuinely non-packaged products through exact approved N/A evidence", () => {
    const result = evaluate({
      configurations: [],
      packagingOrders: [],
      finishedGoodsReceipts: [],
      naEvidence: [
        {
          workflowGroup: "PACKAGING_RELEASE",
          workflowCode: "qa-release",
          entityType: "MANUFACTURING_ORDER",
          entityId: "order-1",
          outcome: "NOT_APPLICABLE",
          status: "APPROVED",
          transactionDate: at,
          createdByUserId: "maker-1",
          approvedByUserId: "checker-1",
          approvedAt: at,
          signatureHash: "signed-review-hash",
        },
      ],
    });
    expect(result).toMatchObject({
      required: false,
      ready: true,
      naEvidenceAccepted: true,
    });
  });

  it.each([
    {
      label: "unsigned",
      evidence: {
        createdByUserId: "maker-1",
        approvedByUserId: "checker-1",
        approvedAt: at,
        signatureHash: null,
      },
    },
    {
      label: "self-approved",
      evidence: {
        createdByUserId: "maker-1",
        approvedByUserId: "maker-1",
        approvedAt: at,
        signatureHash: "signed-review-hash",
      },
    },
    {
      label: "future-approved",
      evidence: {
        createdByUserId: "maker-1",
        approvedByUserId: "checker-1",
        approvedAt: new Date("2026-10-01T00:00:00.000Z"),
        signatureHash: "signed-review-hash",
      },
    },
  ])("rejects $label packaging N/A evidence", ({ evidence }) => {
    const result = evaluate({
      configurations: [],
      packagingOrders: [],
      naEvidence: [
        {
          workflowGroup: "PACKAGING_RELEASE",
          workflowCode: "qa-release",
          entityType: "MANUFACTURING_ORDER",
          entityId: "order-1",
          outcome: "NOT_APPLICABLE",
          status: "APPROVED",
          transactionDate: at,
          ...evidence,
        },
      ],
    });

    expect(result.ready).toBe(false);
    expect(result.naEvidenceAccepted).toBe(false);
  });
});
