import { Prisma } from "../generated/prisma/index.js";

export class ManufacturingPackagingDomainError extends Error {}

const QUANTITY_SCALE = 4;

export type PackagingMaterialRequirementSource = {
  sourceId: string;
  plannedQuantity: Prisma.Decimal.Value;
  components: Array<{
    inventoryItemId: string;
    quantityPerFinishedUnit: Prisma.Decimal.Value;
    unit: string;
  }>;
};

export type PackagingMaterialRequirement = {
  inventoryItemId: string;
  unit: string;
  requiredQuantity: Prisma.Decimal;
  sourceIds: string[];
};

export function packagingCoverageOverlaps(
  existingOrderLotId: string | null,
  requestedOrderLotId: string | null,
) {
  return (
    existingOrderLotId === null ||
    requestedOrderLotId === null ||
    existingOrderLotId === requestedOrderLotId
  );
}

/**
 * Builds the order-level packaging requirement from the approved configuration
 * selected for every packaging order/lot. Multiplication and aggregation stay
 * in Decimal space; database-scale rounding happens once, after every lot has
 * been accumulated, so several fractional lot requirements cannot introduce
 * per-lot rounding drift.
 */
export function calculatePackagingMaterialRequirements(
  sources: PackagingMaterialRequirementSource[],
): PackagingMaterialRequirement[] {
  const requirements = new Map<
    string,
    {
      inventoryItemId: string;
      unit: string;
      exactQuantity: Prisma.Decimal;
      sourceIds: string[];
    }
  >();

  for (const source of sources) {
    const plannedQuantity = new Prisma.Decimal(source.plannedQuantity);
    if (!plannedQuantity.isFinite() || plannedQuantity.lessThanOrEqualTo(0)) {
      throw new ManufacturingPackagingDomainError(
        "Packaging planned quantity must be greater than zero.",
      );
    }
    for (const component of source.components) {
      const inventoryItemId = component.inventoryItemId.trim();
      const unit = component.unit.trim();
      const perFinishedUnit = new Prisma.Decimal(
        component.quantityPerFinishedUnit,
      );
      if (
        !inventoryItemId ||
        !unit ||
        !perFinishedUnit.isFinite() ||
        perFinishedUnit.lessThanOrEqualTo(0)
      ) {
        throw new ManufacturingPackagingDomainError(
          "Every packaging component requires an item, unit and positive per-unit quantity.",
        );
      }
      const existing = requirements.get(inventoryItemId);
      if (existing && existing.unit.toLowerCase() !== unit.toLowerCase()) {
        throw new ManufacturingPackagingDomainError(
          `Packaging component ${inventoryItemId} uses conflicting units (${existing.unit} and ${unit}).`,
        );
      }
      const requirement = perFinishedUnit.mul(plannedQuantity);
      if (existing) {
        existing.exactQuantity = existing.exactQuantity.add(requirement);
        if (!existing.sourceIds.includes(source.sourceId))
          existing.sourceIds.push(source.sourceId);
      } else {
        requirements.set(inventoryItemId, {
          inventoryItemId,
          unit,
          exactQuantity: requirement,
          sourceIds: [source.sourceId],
        });
      }
    }
  }

  return [...requirements.values()].map((requirement) => ({
    inventoryItemId: requirement.inventoryItemId,
    unit: requirement.unit,
    requiredQuantity: requirement.exactQuantity.toDecimalPlaces(
      QUANTITY_SCALE,
      Prisma.Decimal.ROUND_HALF_UP,
    ),
    sourceIds: requirement.sourceIds,
  }));
}

/**
 * Allocates an order-level packaging component requirement across production
 * lots. Every lot except the last receives its rounded proportional share;
 * the last receives the exact residual so all lot limits always add back to
 * the order-level requirement at the database quantity scale.
 */
export function calculateOrderLevelPackagingLotRequirement(input: {
  componentQuantityPerFinishedUnit: Prisma.Decimal.Value;
  packagingPlannedQuantity: Prisma.Decimal.Value;
  orderPlannedQuantity: Prisma.Decimal.Value;
  lots: Array<{ id: string; plannedQuantity: Prisma.Decimal.Value }>;
  orderLotId: string;
}) {
  const componentQuantity = new Prisma.Decimal(
    input.componentQuantityPerFinishedUnit,
  );
  const packagingQuantity = new Prisma.Decimal(input.packagingPlannedQuantity);
  const orderQuantity = new Prisma.Decimal(input.orderPlannedQuantity);
  if (
    !componentQuantity.isFinite() ||
    componentQuantity.lessThanOrEqualTo(0) ||
    !packagingQuantity.isFinite() ||
    packagingQuantity.lessThanOrEqualTo(0) ||
    !orderQuantity.isFinite() ||
    orderQuantity.lessThanOrEqualTo(0) ||
    !input.lots.length
  ) {
    throw new ManufacturingPackagingDomainError(
      "Order-level packaging allocation requires positive component, order and lot quantities.",
    );
  }
  const targetIndex = input.lots.findIndex(
    (lot) => lot.id === input.orderLotId,
  );
  if (targetIndex < 0)
    throw new ManufacturingPackagingDomainError(
      "Packaging allocation lot does not belong to the production order.",
    );
  const lotTotal = input.lots.reduce(
    (total, lot) => total.add(lot.plannedQuantity),
    new Prisma.Decimal(0),
  );
  if (!lotTotal.equals(orderQuantity)) {
    throw new ManufacturingPackagingDomainError(
      "Production lot quantities must exactly reconcile to the order quantity before order-level packaging can be issued.",
    );
  }
  const totalRequirement = componentQuantity
    .mul(packagingQuantity)
    .toDecimalPlaces(QUANTITY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
  let allocated = new Prisma.Decimal(0);
  for (let index = 0; index < input.lots.length; index += 1) {
    const lot = input.lots[index];
    const share =
      index === input.lots.length - 1
        ? totalRequirement.sub(allocated)
        : totalRequirement
            .mul(lot.plannedQuantity)
            .div(orderQuantity)
            .toDecimalPlaces(QUANTITY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
    if (index === targetIndex) return share;
    allocated = allocated.add(share);
  }
  throw new ManufacturingPackagingDomainError(
    "Packaging allocation lot could not be resolved.",
  );
}

function fixedQuantity(value: string | number): bigint {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,4})?$/.test(text)) {
    throw new ManufacturingPackagingDomainError(
      "Quantity must be non-negative with no more than four decimals.",
    );
  }
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(QUANTITY_SCALE, "0"));
}

export function buildSerialNumber(input: {
  prefix: string;
  suffix?: string | null;
  value: number;
  padding: number;
}) {
  if (!Number.isSafeInteger(input.value) || input.value < 0) {
    throw new ManufacturingPackagingDomainError(
      "Serial sequence value must be a non-negative safe integer.",
    );
  }
  if (
    !Number.isInteger(input.padding) ||
    input.padding < 1 ||
    input.padding > 18
  ) {
    throw new ManufacturingPackagingDomainError(
      "Serial padding must be between 1 and 18.",
    );
  }
  return `${input.prefix}${String(input.value).padStart(input.padding, "0")}${input.suffix ?? ""}`;
}

export function allocateSerialRange(input: {
  prefix: string;
  suffix?: string | null;
  nextNumber: number;
  endNumber: number;
  padding: number;
  quantity: number;
}) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new ManufacturingPackagingDomainError(
      "Serial allocation quantity must be a positive integer.",
    );
  }
  const last = input.nextNumber + input.quantity - 1;
  if (!Number.isSafeInteger(last) || last > input.endNumber) {
    throw new ManufacturingPackagingDomainError(
      "The serial rule does not have enough unused numbers.",
    );
  }
  return Array.from({ length: input.quantity }, (_, index) =>
    buildSerialNumber({
      prefix: input.prefix,
      suffix: input.suffix,
      value: input.nextNumber + index,
      padding: input.padding,
    }),
  );
}

export function evaluatePackagingReconciliation(input: {
  issuedQuantity: string | number;
  usedQuantity: string | number;
  returnedQuantity: string | number;
  rejectedQuantity: string | number;
  destroyedQuantity: string | number;
}) {
  const issued = fixedQuantity(input.issuedQuantity);
  const accounted =
    fixedQuantity(input.usedQuantity) +
    fixedQuantity(input.returnedQuantity) +
    fixedQuantity(input.rejectedQuantity) +
    fixedQuantity(input.destroyedQuantity);
  return {
    ready: issued === accounted,
    varianceScaled: issued - accounted,
    issue:
      issued === accounted
        ? null
        : "Issued packaging must equal used + returned + rejected + destroyed.",
  };
}

export type PackagingHierarchyUnit = {
  id: string;
  level: "UNIT" | "CARTON" | "SHIPPER" | "PALLET";
  parentId?: string | null;
  serialId?: string | null;
};

export function evaluatePackagingHierarchy(input: {
  serialIds: string[];
  usedLabelSerialIds: string[];
  units: PackagingHierarchyUnit[];
}) {
  const issues: string[] = [];
  const requiredSerials = new Set(input.serialIds);
  const usedLabelCounts = new Map<string, number>();
  for (const serialId of input.usedLabelSerialIds)
    usedLabelCounts.set(serialId, (usedLabelCounts.get(serialId) ?? 0) + 1);
  const unitById = new Map(input.units.map((unit) => [unit.id, unit]));
  const packageUnitBySerial = new Map(
    input.units
      .filter((unit) => unit.level === "UNIT" && unit.serialId)
      .map((unit) => [unit.serialId!, unit]),
  );

  for (const serialId of requiredSerials) {
    if ((usedLabelCounts.get(serialId) ?? 0) !== 1)
      issues.push(`Serial ${serialId} must have exactly one used label.`);
    const unit = packageUnitBySerial.get(serialId);
    if (!unit) {
      issues.push(`Serial ${serialId} is not assigned to a unit package.`);
      continue;
    }
    const parent = unit.parentId ? unitById.get(unit.parentId) : null;
    if (!parent || parent.level !== "CARTON") {
      issues.push(`Serial ${serialId} unit package must belong to a carton.`);
    }
  }

  for (const serialId of usedLabelCounts.keys()) {
    if (!requiredSerials.has(serialId))
      issues.push(
        `Used label references serial ${serialId}, which is outside this packaging order.`,
      );
  }

  for (const unit of input.units) {
    if (unit.level !== "UNIT" && unit.serialId)
      issues.push(
        `${unit.level} package ${unit.id} cannot directly own a serial.`,
      );
    if (!unit.parentId) continue;
    const parent = unitById.get(unit.parentId);
    if (!parent) {
      issues.push(`Package ${unit.id} has an unknown parent.`);
      continue;
    }
    const allowed =
      (unit.level === "UNIT" && parent.level === "CARTON") ||
      (unit.level === "CARTON" &&
        ["SHIPPER", "PALLET"].includes(parent.level)) ||
      (unit.level === "SHIPPER" && parent.level === "PALLET");
    if (!allowed)
      issues.push(
        `Package ${unit.id} has an invalid ${unit.level} to ${parent.level} relationship.`,
      );
  }

  return { ready: issues.length === 0, issues };
}
