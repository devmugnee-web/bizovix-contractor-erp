import { Prisma } from "../generated/prisma/index.js";
import { paisaToDecimal } from "./domain.js";
import { toPaisa } from "../accounting/money.util.js";

export type CostDriverBasis =
  | "FLAT"
  | "OUTPUT_QUANTITY"
  | "LABOUR_HOURS"
  | "MACHINE_HOURS"
  | "MATERIAL_COST_PERCENT"
  | "PRIME_COST_PERCENT";

export type PostableManufacturingCostType =
  "LABOUR" | "MACHINE" | "OVERHEAD" | "SUBCONTRACT" | "OTHER";

export interface CostDriverCalculationInput {
  basis: CostDriverBasis;
  rate: Prisma.Decimal.Value;
  basisQuantity?: Prisma.Decimal.Value | null;
  materialCost?: Prisma.Decimal.Value | null;
  postedLabourCost?: Prisma.Decimal.Value | null;
  postedMachineCost?: Prisma.Decimal.Value | null;
}

function decimal(
  value: Prisma.Decimal.Value | null | undefined,
  label: string,
) {
  let result: Prisma.Decimal;
  try {
    result = new Prisma.Decimal(value ?? 0);
  } catch {
    throw new Error(`${label} must be a finite number.`);
  }
  if (!result.isFinite()) throw new Error(`${label} must be a finite number.`);
  return result;
}

export function assertPostableCostType(
  value: string,
): asserts value is PostableManufacturingCostType {
  if (
    !["LABOUR", "MACHINE", "OVERHEAD", "SUBCONTRACT", "OTHER"].includes(value)
  ) {
    throw new Error(
      "Actual cost postings support LABOUR, MACHINE, OVERHEAD, SUBCONTRACT or OTHER only.",
    );
  }
}

/**
 * Calculates a driver's six-decimal evidence amount and its authoritative
 * currency-minor-unit posting amount. All journal and reconciliation checks use
 * `amountPaisa`; floating-point arithmetic is never used.
 */
export function calculateCostDriverAmount(input: CostDriverCalculationInput) {
  const rate = decimal(input.rate, "rate");
  if (rate.lessThan(0)) throw new Error("rate cannot be negative.");
  const quantity = decimal(input.basisQuantity ?? 1, "basisQuantity");
  if (quantity.lessThanOrEqualTo(0))
    throw new Error("basisQuantity must be greater than zero.");
  const materialCost = decimal(input.materialCost, "materialCost");
  const postedLabourCost = decimal(input.postedLabourCost, "postedLabourCost");
  const postedMachineCost = decimal(
    input.postedMachineCost,
    "postedMachineCost",
  );

  let exactAmount: Prisma.Decimal;
  switch (input.basis) {
    case "FLAT":
      exactAmount = rate;
      break;
    case "OUTPUT_QUANTITY":
    case "LABOUR_HOURS":
    case "MACHINE_HOURS":
      exactAmount = rate.mul(quantity);
      break;
    case "MATERIAL_COST_PERCENT":
      exactAmount = materialCost.mul(rate).div(100);
      break;
    case "PRIME_COST_PERCENT":
      exactAmount = materialCost
        .add(postedLabourCost)
        .add(postedMachineCost)
        .mul(rate)
        .div(100);
      break;
    default:
      throw new Error(
        `Unsupported manufacturing cost-driver basis: ${String(input.basis)}`,
      );
  }

  exactAmount = exactAmount.toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
  const amountPaisa = toPaisa(exactAmount);
  if (amountPaisa <= 0n)
    throw new Error("The calculated actual cost must be at least BDT 0.01.");
  return {
    exactAmount,
    amountPaisa,
    postingAmount: paisaToDecimal(amountPaisa),
  };
}

export interface WeightedCostTarget {
  id: string;
  weight: Prisma.Decimal.Value;
}

/** Deterministic largest-remainder allocation that always sums to exact paisa. */
export function allocatePaisaByWeight(
  totalPaisa: bigint,
  targets: WeightedCostTarget[],
) {
  if (totalPaisa < 0n) throw new Error("totalPaisa cannot be negative.");
  if (!targets.length)
    throw new Error("At least one allocation target is required.");
  const normalized = targets.map((target) => {
    const weight = decimal(target.weight, `weight:${target.id}`);
    if (weight.lessThanOrEqualTo(0))
      throw new Error(`weight:${target.id} must be greater than zero.`);
    return { id: target.id, weight };
  });
  const totalWeight = normalized.reduce(
    (sum, target) => sum.add(target.weight),
    new Prisma.Decimal(0),
  );
  const total = new Prisma.Decimal(totalPaisa.toString());
  const provisional = normalized.map((target, index) => {
    const raw = total.mul(target.weight).div(totalWeight);
    const floor = BigInt(raw.floor().toFixed(0));
    return {
      id: target.id,
      index,
      amountPaisa: floor,
      remainder: raw.sub(floor.toString()),
    };
  });
  let residue =
    totalPaisa -
    provisional.reduce((sum, target) => sum + target.amountPaisa, 0n);
  const byRemainder = [...provisional].sort((left, right) => {
    const comparison = right.remainder.comparedTo(left.remainder);
    return comparison || left.index - right.index;
  });
  let cursor = 0;
  while (residue > 0n) {
    byRemainder[cursor % byRemainder.length].amountPaisa += 1n;
    residue -= 1n;
    cursor += 1;
  }
  const byId = new Map(
    byRemainder.map((target) => [target.id, target.amountPaisa]),
  );
  return normalized.map((target) => ({
    id: target.id,
    amountPaisa: byId.get(target.id)!,
  }));
}

export interface SnapshotComponents {
  materialCost: Prisma.Decimal.Value;
  labourCost: Prisma.Decimal.Value;
  machineCost: Prisma.Decimal.Value;
  overheadCost: Prisma.Decimal.Value;
  packagingCost: Prisma.Decimal.Value;
  subcontractCost: Prisma.Decimal.Value;
  otherCost: Prisma.Decimal.Value;
  scrapRecovery?: Prisma.Decimal.Value;
  allocationVariance?: Prisma.Decimal.Value;
}

export function calculateFinalSnapshot(
  input: SnapshotComponents,
  standardOrderCost?: Prisma.Decimal.Value | null,
) {
  const components = {
    materialCost: decimal(input.materialCost, "materialCost"),
    labourCost: decimal(input.labourCost, "labourCost"),
    machineCost: decimal(input.machineCost, "machineCost"),
    overheadCost: decimal(input.overheadCost, "overheadCost"),
    packagingCost: decimal(input.packagingCost, "packagingCost"),
    subcontractCost: decimal(input.subcontractCost, "subcontractCost"),
    otherCost: decimal(input.otherCost, "otherCost"),
    scrapRecovery: decimal(input.scrapRecovery, "scrapRecovery"),
    allocationVariance: decimal(input.allocationVariance, "allocationVariance"),
  };
  for (const [key, value] of Object.entries(components)) {
    if (key !== "allocationVariance" && value.lessThan(0))
      throw new Error(`${key} cannot be negative.`);
  }
  const totalCost = components.materialCost
    .add(components.labourCost)
    .add(components.machineCost)
    .add(components.overheadCost)
    .add(components.packagingCost)
    .add(components.subcontractCost)
    .add(components.otherCost)
    .sub(components.scrapRecovery)
    .add(components.allocationVariance)
    .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
  if (totalCost.lessThan(0))
    throw new Error("Final manufacturing cost cannot be negative.");
  const varianceAmount =
    standardOrderCost == null
      ? new Prisma.Decimal(0)
      : totalCost
          .sub(decimal(standardOrderCost, "standardOrderCost"))
          .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
  return { ...components, totalCost, varianceAmount };
}
