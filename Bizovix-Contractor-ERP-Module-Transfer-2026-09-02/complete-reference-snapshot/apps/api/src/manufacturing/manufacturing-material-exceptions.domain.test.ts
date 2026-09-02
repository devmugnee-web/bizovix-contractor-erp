import { describe, expect, it } from "vitest";

import {
  calculateMaterialReconciliation,
  materialLotRetestDateRule,
  materialQuantityBucketForDisposition,
  materialStatusTransferRule,
  qualityCaseReferencesExactLot,
  totalActivePlannedMaterialQuantity,
} from "./manufacturing-material-exceptions.domain.js";

describe("manufacturing material exception invariants", () => {
  it.each([
    ["RELEASED", "availableQuantity"],
    ["STAGING", "availableQuantity"],
    ["WIP", "availableQuantity"],
    ["QC_HOLD", "holdQuantity"],
    ["REJECTED", "rejectedQuantity"],
    ["SCRAP", "rejectedQuantity"],
  ] as const)("maps %s to its persisted lot balance", (disposition, bucket) => {
    expect(materialQuantityBucketForDisposition(disposition)).toBe(bucket);
  });

  it("rejects unsupported status buckets instead of assuming released stock", () => {
    expect(materialQuantityBucketForDisposition("UNKNOWN")).toBeNull();
  });

  it.each([
    ["REJECTED", "RELEASED"],
    ["REJECTED", "REJECTED"],
    ["SCRAP", "SCRAP"],
    ["QC_HOLD", "RELEASED"],
    ["STAGING", "WIP"],
    ["RELEASED", "SCRAP"],
  ])("fails closed for unsupported %s to %s status transfers", (from, to) => {
    expect(materialStatusTransferRule(from, to).allowed).toBe(false);
  });

  it.each([
    ["RELEASED", "RELEASED"],
    ["QC_HOLD", "QC_HOLD"],
    ["STAGING", "STAGING"],
  ])("allows same-class %s relocation without a QC release", (from, to) => {
    expect(materialStatusTransferRule(from, to)).toEqual({
      allowed: true,
      requiresQualityCase: false,
      reason: null,
    });
  });

  it.each(["QC_HOLD", "REJECTED"])(
    "requires approved quality evidence for RELEASED to %s",
    (to) => {
      expect(materialStatusTransferRule("RELEASED", to)).toEqual({
        allowed: true,
        requiresQualityCase: true,
        reason: null,
      });
    },
  );

  it("extends an item cap only with active approved top-up snapshot lines", () => {
    expect(
      totalActivePlannedMaterialQuantity(
        [
          {
            inventoryItemId: "raw-1",
            status: "ISSUED",
            plannedQuantity: "10.0000",
          },
          {
            inventoryItemId: "raw-1",
            status: "RESERVED",
            plannedQuantity: "2.0000",
          },
          {
            inventoryItemId: "raw-1",
            status: "CANCELLED",
            plannedQuantity: "99.0000",
          },
          {
            inventoryItemId: "raw-2",
            status: "PLANNED",
            plannedQuantity: "50.0000",
          },
        ],
        "raw-1",
      ).toFixed(4),
    ).toBe("12.0000");
  });

  it("reconciles posted issue exactly to consumption, return and scrap", () => {
    const result = calculateMaterialReconciliation({
      expectedQuantity: "10.0000",
      issuedQuantity: "12.0000",
      consumedQuantity: "9.0000",
      returnedQuantity: "2.0000",
      scrappedQuantity: "1.0000",
    });
    expect(result.reconciled).toBe(true);
    expect(result.unaccountedQuantity.toFixed(4)).toBe("0.0000");
    expect(result.requirementVariance.toFixed(4)).toBe("0.0000");
  });

  it("reports a real unaccounted balance without inventing consumption", () => {
    const result = calculateMaterialReconciliation({
      expectedQuantity: "10.0000",
      issuedQuantity: "12.0000",
      consumedQuantity: "8.5000",
      returnedQuantity: "2.0000",
      scrappedQuantity: "1.0000",
    });
    expect(result.reconciled).toBe(false);
    expect(result.unaccountedQuantity.toFixed(4)).toBe("0.5000");
    expect(result.requirementVariance.toFixed(4)).toBe("-0.5000");
  });

  it("accepts only an exact lot ID or lot-number quality-case reference", () => {
    expect(qualityCaseReferencesExactLot("lot-id-1", "lot-id-1", "LOT-1")).toBe(
      true,
    );
    expect(qualityCaseReferencesExactLot(" LOT-1 ", "lot-id-1", "LOT-1")).toBe(
      true,
    );
    expect(
      qualityCaseReferencesExactLot("Order 1 / LOT-1", "lot-id-1", "LOT-1"),
    ).toBe(false);
  });

  it("allows a changed future retest date inside manufacture/expiry bounds", () => {
    expect(
      materialLotRetestDateRule({
        actionDate: new Date("2026-08-30T00:00:00.000Z"),
        nextRetestDueAt: new Date("2026-10-01T00:00:00.000Z"),
        currentRetestDueAt: new Date("2026-08-29T00:00:00.000Z"),
        manufacturedAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-12-31T00:00:00.000Z"),
      }),
    ).toEqual({ allowed: true, reason: null });
  });

  it.each([
    ["not after action", "2026-08-30", "2026-08-30", null, null, null],
    [
      "not after manufacture",
      "2026-08-30",
      "2026-09-01",
      null,
      "2026-09-01",
      null,
    ],
    [
      "past expiry",
      "2026-08-30",
      "2027-01-01",
      null,
      "2026-01-01",
      "2026-12-31",
    ],
    [
      "unchanged",
      "2026-08-30",
      "2026-09-30",
      "2026-09-30",
      "2026-01-01",
      "2026-12-31",
    ],
  ])(
    "fails closed when a retest date is %s",
    (_label, action, next, current, manufactured, expires) => {
      expect(
        materialLotRetestDateRule({
          actionDate: new Date(`${action}T00:00:00.000Z`),
          nextRetestDueAt: new Date(`${next}T00:00:00.000Z`),
          currentRetestDueAt: current
            ? new Date(`${current}T00:00:00.000Z`)
            : null,
          manufacturedAt: manufactured
            ? new Date(`${manufactured}T00:00:00.000Z`)
            : null,
          expiresAt: expires ? new Date(`${expires}T00:00:00.000Z`) : null,
        }).allowed,
      ).toBe(false);
    },
  );
});
