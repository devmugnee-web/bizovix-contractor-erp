import { Prisma } from "../generated/prisma/index.js";

import { round2, toDecimal, type DecimalLike } from "./lc-money.util.js";

export interface AllocationTarget {
  id: string;
  basisValue: DecimalLike;
}

export interface ProportionalAllocationRow {
  id: string;
  basisValue: Prisma.Decimal;
  basisPercentage: Prisma.Decimal;
  amount: Prisma.Decimal;
}

/**
 * Splits `totalAmount` across `targets` proportional to each target's
 * basisValue, using the largest-remainder method (at 2dp, i.e. paisa/cent
 * units) so SUM(amount) === totalAmount exactly — never a rounding residual.
 * If every target's basisValue is zero (e.g. no item has a weight entered
 * yet), falls back to an equal split so the caller's fallback-basis logic
 * still has *something* sane to show instead of dividing by zero.
 */
export function allocateProportionally(totalAmount: DecimalLike, targets: AllocationTarget[]): ProportionalAllocationRow[] {
  const total = round2(totalAmount);
  const basisValues = targets.map((target) => toDecimal(target.basisValue));
  const basisTotal = basisValues.reduce((sum, value) => sum.add(value), new Prisma.Decimal(0));

  if (targets.length === 0) {
    return [];
  }

  if (total.equals(0)) {
    return targets.map((target, index) => ({
      id: target.id,
      basisValue: basisValues[index],
      basisPercentage: new Prisma.Decimal(0),
      amount: new Prisma.Decimal(0),
    }));
  }

  if (basisTotal.lessThanOrEqualTo(0)) {
    const equalRows = allocateProportionally(
      total,
      targets.map((target) => ({ id: target.id, basisValue: 1 })),
    );
    return equalRows.map((row, index) => ({ ...row, basisValue: basisValues[index] }));
  }

  const CENT = new Prisma.Decimal(100);
  const totalCents = total.mul(CENT).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

  const rawShares = basisValues.map((value) => total.mul(value).div(basisTotal));
  const flooredCents = rawShares.map((share) => share.mul(CENT).toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN));
  const flooredCentsTotal = flooredCents.reduce((sum, value) => sum.add(value), new Prisma.Decimal(0));

  let remainderCents = totalCents.sub(flooredCentsTotal).toNumber();

  const fractionalRemainders = rawShares
    .map((share, index) => ({ index, remainder: share.mul(CENT).sub(flooredCents[index]) }))
    .sort((left, right) => right.remainder.cmp(left.remainder) || left.index - right.index);

  const finalCents = [...flooredCents];
  for (let i = 0; i < fractionalRemainders.length && remainderCents > 0; i += 1) {
    const { index } = fractionalRemainders[i];
    finalCents[index] = finalCents[index].add(1);
    remainderCents -= 1;
  }
  // Defensive: only reachable if totalCents < flooredCentsTotal, which the
  // floor-based construction above should never produce, but guards against
  // ever returning a sum that silently drifts from totalAmount.
  for (let i = fractionalRemainders.length - 1; i >= 0 && remainderCents < 0; i -= 1) {
    const { index } = fractionalRemainders[i];
    finalCents[index] = finalCents[index].sub(1);
    remainderCents += 1;
  }

  return targets.map((target, index) => ({
    id: target.id,
    basisValue: basisValues[index],
    basisPercentage: basisValues[index].mul(100).div(basisTotal),
    amount: finalCents[index].div(CENT),
  }));
}

/**
 * Hybrid allocation: rows with a manual amount are fixed as-is; the remaining
 * amount (total minus the sum of fixed rows) is proportionally split among
 * the rest using `basisValue`. Matches the spec's example exactly (Forklift
 * fixed 250,000 + Fishing Boat fixed 100,000 out of 700,000 -> remaining
 * 350,000 auto-allocated among the other five products).
 */
export function allocateHybrid(
  totalAmount: DecimalLike,
  targets: Array<AllocationTarget & { manualAmount?: DecimalLike }>,
): ProportionalAllocationRow[] {
  const total = round2(totalAmount);
  const fixed = targets.filter((target) => target.manualAmount !== undefined && target.manualAmount !== null);
  const flexible = targets.filter((target) => target.manualAmount === undefined || target.manualAmount === null);

  const fixedRows: ProportionalAllocationRow[] = fixed.map((target) => ({
    id: target.id,
    basisValue: toDecimal(target.basisValue),
    basisPercentage: new Prisma.Decimal(0),
    amount: round2(target.manualAmount),
  }));
  const fixedTotal = fixedRows.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));
  const remaining = total.sub(fixedTotal);

  const flexibleRows = allocateProportionally(
    remaining,
    flexible.map((target) => ({ id: target.id, basisValue: target.basisValue })),
  );

  const byId = new Map<string, ProportionalAllocationRow>();
  for (const row of [...fixedRows, ...flexibleRows]) byId.set(row.id, row);
  return targets.map((target) => byId.get(target.id)!);
}

/** The basis metric value for one LC item, given an allocation basis. */
export function basisValueFor(
  basis: "PURCHASE_VALUE" | "USD_VALUE" | "QUANTITY" | "WEIGHT" | "CBM" | "EQUAL",
  item: { totalPurchaseCostBdt: DecimalLike; usdUnitPrice: DecimalLike; quantity: DecimalLike; weight: DecimalLike; cbm: DecimalLike },
): Prisma.Decimal {
  switch (basis) {
    case "PURCHASE_VALUE":
      return toDecimal(item.totalPurchaseCostBdt);
    case "USD_VALUE":
      return toDecimal(item.usdUnitPrice).mul(toDecimal(item.quantity));
    case "QUANTITY":
      return toDecimal(item.quantity);
    case "WEIGHT":
      return toDecimal(item.weight);
    case "CBM":
      return toDecimal(item.cbm);
    case "EQUAL":
      return new Prisma.Decimal(1);
    default:
      return new Prisma.Decimal(0);
  }
}
