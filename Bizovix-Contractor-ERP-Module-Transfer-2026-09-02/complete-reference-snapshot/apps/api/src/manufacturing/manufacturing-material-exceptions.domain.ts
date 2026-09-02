import { Prisma } from "../generated/prisma/index.js";

export type MaterialQuantityBucket =
  "availableQuantity" | "holdQuantity" | "rejectedQuantity";

export type MaterialStatusTransferRule = {
  allowed: boolean;
  requiresQualityCase: boolean;
  reason: string | null;
};

export type MaterialLotRetestDateRule = {
  allowed: boolean;
  reason: string | null;
};

export function materialLotRetestDateRule(input: {
  actionDate: Date;
  nextRetestDueAt: Date;
  currentRetestDueAt?: Date | null;
  manufacturedAt?: Date | null;
  expiresAt?: Date | null;
}): MaterialLotRetestDateRule {
  if (input.nextRetestDueAt <= input.actionDate)
    return {
      allowed: false,
      reason:
        "The new retest-due date must be after the controlled action date.",
    };
  if (input.manufacturedAt && input.nextRetestDueAt <= input.manufacturedAt)
    return {
      allowed: false,
      reason: "The new retest-due date must be after the lot manufacture date.",
    };
  if (input.expiresAt && input.nextRetestDueAt > input.expiresAt)
    return {
      allowed: false,
      reason: "The retest-due date cannot extend beyond the lot expiry date.",
    };
  if (
    input.currentRetestDueAt &&
    input.nextRetestDueAt.getTime() === input.currentRetestDueAt.getTime()
  )
    return {
      allowed: false,
      reason:
        "The new retest-due date must change the current controlled date.",
    };
  return { allowed: true, reason: null };
}

export function qualityCaseReferencesExactLot(
  sourceReference: unknown,
  inventoryLotId: string,
  lotNumber: string,
) {
  if (typeof sourceReference !== "string") return false;
  const reference = sourceReference.trim();
  return reference === inventoryLotId || reference === lotNumber;
}

/**
 * Stock-status transfer is deliberately narrower than production/QC movements.
 * It may relocate stock inside the same quality class, or place RELEASED stock
 * into QC_HOLD/REJECTED when an approved quality case authorizes that exact
 * order/item. It never releases held/rejected stock and never handles scrap.
 */
export function materialStatusTransferRule(
  sourceDisposition: string,
  destinationDisposition: string,
): MaterialStatusTransferRule {
  if (["REJECTED", "SCRAP"].includes(sourceDisposition))
    return {
      allowed: false,
      requiresQualityCase: false,
      reason:
        "Rejected or scrap stock cannot move through stock-status transfer; rejected stock may only follow controlled destruction.",
    };
  if (destinationDisposition === "SCRAP")
    return {
      allowed: false,
      requiresQualityCase: false,
      reason:
        "Stock cannot be scrapped through stock-status transfer; use the controlled rejection/destruction workflow.",
    };
  if (sourceDisposition === destinationDisposition)
    return { allowed: true, requiresQualityCase: false, reason: null };
  if (
    sourceDisposition === "RELEASED" &&
    ["QC_HOLD", "REJECTED"].includes(destinationDisposition)
  )
    return { allowed: true, requiresQualityCase: true, reason: null };
  return {
    allowed: false,
    requiresQualityCase: false,
    reason: `${sourceDisposition} to ${destinationDisposition} requires its dedicated production or quality disposition workflow.`,
  };
}

export function materialQuantityBucketForDisposition(
  disposition: string,
): MaterialQuantityBucket | null {
  if (
    ["RELEASED", "RESERVED", "STAGING", "WIP", "REWORK"].includes(disposition)
  )
    return "availableQuantity";
  if (disposition === "QC_HOLD") return "holdQuantity";
  if (["REJECTED", "SCRAP"].includes(disposition)) return "rejectedQuantity";
  return null;
}

function decimal(value: Prisma.Decimal.Value | null | undefined) {
  return new Prisma.Decimal(value ?? 0);
}

export function totalActivePlannedMaterialQuantity(
  materials: Array<{
    inventoryItemId: string;
    status: string;
    plannedQuantity: Prisma.Decimal.Value;
  }>,
  inventoryItemId: string,
) {
  return materials
    .filter(
      (material) =>
        material.inventoryItemId === inventoryItemId &&
        material.status !== "CANCELLED",
    )
    .reduce(
      (total, material) => total.add(material.plannedQuantity),
      decimal(0),
    );
}

export function calculateMaterialReconciliation(input: {
  expectedQuantity: Prisma.Decimal.Value;
  issuedQuantity: Prisma.Decimal.Value;
  returnedQuantity: Prisma.Decimal.Value;
  consumedQuantity: Prisma.Decimal.Value;
  scrappedQuantity: Prisma.Decimal.Value;
}) {
  const expected = decimal(input.expectedQuantity);
  const issued = decimal(input.issuedQuantity);
  const returned = decimal(input.returnedQuantity);
  const consumed = decimal(input.consumedQuantity);
  const scrapped = decimal(input.scrappedQuantity);
  const unaccounted = issued.sub(returned).sub(consumed).sub(scrapped);
  return {
    expectedQuantity: expected,
    issuedQuantity: issued,
    returnedQuantity: returned,
    consumedQuantity: consumed,
    scrappedQuantity: scrapped,
    unaccountedQuantity: unaccounted,
    requirementVariance: consumed.add(scrapped).sub(expected),
    reconciled: unaccounted.isZero(),
  };
}
