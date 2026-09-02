import { Prisma } from "../generated/prisma/index.js";

export type ManufacturingUnitDefinition = {
  id?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  unit: string;
  alternateUnit?: string | null;
  alternateUnitConversion?: Prisma.Decimal.Value | null;
};

export type ManufacturingUnitConversionDirection =
  | "BASE_TO_BASE"
  | "BASE_TO_ALTERNATE"
  | "ALTERNATE_TO_BASE"
  | "ALTERNATE_TO_ALTERNATE";

export type ManufacturingUnitConversionEvidence = {
  inventoryItemId: string | null;
  itemCode: string | null;
  itemName: string | null;
  sourceQuantity: string;
  sourceUnit: string;
  targetQuantity: string;
  targetUnit: string;
  baseQuantity: string;
  baseUnit: string;
  alternateUnit: string | null;
  conversionFactor: string | null;
  direction: ManufacturingUnitConversionDirection;
  storedQuantity?: string;
  storageDecimalPlaces?: number;
  storageRoundingMode?: "ROUND_HALF_UP";
  storageRoundingApplied?: boolean;
};

export class ManufacturingUnitConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManufacturingUnitConversionError";
  }
}

function canonicalUnit(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function comparableUnit(value: string | null | undefined): string {
  return canonicalUnit(value).toLocaleLowerCase("en-US");
}

function itemLabel(item: ManufacturingUnitDefinition): string {
  return (
    canonicalUnit(item.itemCode) ||
    canonicalUnit(item.itemName) ||
    canonicalUnit(item.id) ||
    "inventory item"
  );
}

function parseQuantity(value: Prisma.Decimal.Value): Prisma.Decimal {
  let quantity: Prisma.Decimal;
  try {
    quantity = new Prisma.Decimal(value);
  } catch {
    throw new ManufacturingUnitConversionError(
      "Manufacturing quantity must be a valid decimal value.",
    );
  }
  if (!quantity.isFinite() || quantity.isNegative()) {
    throw new ManufacturingUnitConversionError(
      "Manufacturing quantity must be a finite non-negative decimal value.",
    );
  }
  return quantity;
}

function unitConfiguration(item: ManufacturingUnitDefinition) {
  const baseUnit = canonicalUnit(item.unit);
  const alternateUnit = canonicalUnit(item.alternateUnit);
  const baseKey = comparableUnit(baseUnit);
  const alternateKey = comparableUnit(alternateUnit);
  if (!baseUnit) {
    throw new ManufacturingUnitConversionError(
      `${itemLabel(item)} has no stock/base unit configured.`,
    );
  }
  if (alternateUnit && alternateKey === baseKey) {
    throw new ManufacturingUnitConversionError(
      `${itemLabel(item)} has an ambiguous unit configuration because its stock/base and alternate units are both ${baseUnit}.`,
    );
  }

  let factor: Prisma.Decimal | null = null;
  if (
    item.alternateUnitConversion !== null &&
    item.alternateUnitConversion !== undefined
  ) {
    try {
      factor = new Prisma.Decimal(item.alternateUnitConversion);
    } catch {
      throw new ManufacturingUnitConversionError(
        `${itemLabel(item)} has an invalid alternate-unit conversion factor.`,
      );
    }
    if (!factor.isFinite() || factor.lessThanOrEqualTo(0)) {
      throw new ManufacturingUnitConversionError(
        `${itemLabel(item)} alternate-unit conversion factor must be greater than zero.`,
      );
    }
  }

  return {
    baseUnit,
    alternateUnit: alternateUnit || null,
    baseKey,
    alternateKey,
    factor,
  };
}

/**
 * Converts between an inventory item's canonical stock/base unit and its one
 * configured alternate unit. Inventory semantics are: 1 base unit = factor
 * alternate units. Decimal arithmetic is retained end-to-end; no Number
 * coercion or implicit quantity rounding is performed here.
 */
export function convertManufacturingQuantity(
  item: ManufacturingUnitDefinition,
  value: Prisma.Decimal.Value,
  sourceUnitValue: string,
  targetUnitValue: string,
): {
  quantity: Prisma.Decimal;
  unit: string;
  evidence: ManufacturingUnitConversionEvidence;
} {
  const quantity = parseQuantity(value);
  const sourceUnit = canonicalUnit(sourceUnitValue);
  const targetUnit = canonicalUnit(targetUnitValue);
  const sourceKey = comparableUnit(sourceUnit);
  const targetKey = comparableUnit(targetUnit);
  const config = unitConfiguration(item);

  if (!sourceUnit || !targetUnit) {
    throw new ManufacturingUnitConversionError(
      `A source and target unit are required for ${itemLabel(item)}.`,
    );
  }
  const sourceIsBase = sourceKey === config.baseKey;
  const sourceIsAlternate = Boolean(
    config.alternateUnit && sourceKey === config.alternateKey,
  );
  const targetIsBase = targetKey === config.baseKey;
  const targetIsAlternate = Boolean(
    config.alternateUnit && targetKey === config.alternateKey,
  );

  if (!sourceIsBase && !sourceIsAlternate) {
    throw new ManufacturingUnitConversionError(
      `${sourceUnit} is not a configured unit for ${itemLabel(item)}. Stock/base unit is ${config.baseUnit}${config.alternateUnit ? ` and alternate unit is ${config.alternateUnit}` : ""}.`,
    );
  }
  if (!targetIsBase && !targetIsAlternate) {
    throw new ManufacturingUnitConversionError(
      `${targetUnit} is not a configured unit for ${itemLabel(item)}. Stock/base unit is ${config.baseUnit}${config.alternateUnit ? ` and alternate unit is ${config.alternateUnit}` : ""}.`,
    );
  }

  const alternateUnitUsed = sourceIsAlternate || targetIsAlternate;
  if (alternateUnitUsed && (!config.alternateUnit || !config.factor)) {
    throw new ManufacturingUnitConversionError(
      `${itemLabel(item)} does not have a complete alternate-unit conversion. Configure both alternate unit and conversion factor before using ${sourceUnit}.`,
    );
  }

  let converted = quantity;
  let direction: ManufacturingUnitConversionDirection;
  if (sourceIsBase && targetIsAlternate) {
    converted = quantity.mul(config.factor!);
    direction = "BASE_TO_ALTERNATE";
  } else if (sourceIsAlternate && targetIsBase) {
    converted = quantity.div(config.factor!);
    direction = "ALTERNATE_TO_BASE";
  } else if (sourceIsAlternate) {
    direction = "ALTERNATE_TO_ALTERNATE";
  } else {
    direction = "BASE_TO_BASE";
  }

  const canonicalTargetUnit = targetIsBase
    ? config.baseUnit
    : config.alternateUnit!;
  const baseQuantity = targetIsBase
    ? converted
    : sourceIsBase
      ? quantity
      : quantity.div(config.factor!);
  return {
    quantity: converted,
    unit: canonicalTargetUnit,
    evidence: {
      inventoryItemId: item.id ?? null,
      itemCode: item.itemCode ?? null,
      itemName: item.itemName ?? null,
      sourceQuantity: quantity.toString(),
      sourceUnit: sourceIsBase ? config.baseUnit : config.alternateUnit!,
      targetQuantity: converted.toString(),
      targetUnit: canonicalTargetUnit,
      baseQuantity: baseQuantity.toString(),
      baseUnit: config.baseUnit,
      alternateUnit: config.alternateUnit,
      conversionFactor: config.factor?.toString() ?? null,
      direction,
    },
  };
}

export function normalizeManufacturingQuantityToBase(
  item: ManufacturingUnitDefinition,
  value: Prisma.Decimal.Value,
  sourceUnit: string,
) {
  return convertManufacturingQuantity(item, value, sourceUnit, item.unit);
}

export function convertManufacturingQuantityFromBase(
  item: ManufacturingUnitDefinition,
  value: Prisma.Decimal.Value,
  targetUnit: string,
) {
  return convertManufacturingQuantity(item, value, item.unit, targetUnit);
}

/** Validates a unit without changing the submitted quantity representation. */
export function assertManufacturingUnitSupported(
  item: ManufacturingUnitDefinition,
  unit: string,
): void {
  convertManufacturingQuantity(item, 0, unit, unit);
}
