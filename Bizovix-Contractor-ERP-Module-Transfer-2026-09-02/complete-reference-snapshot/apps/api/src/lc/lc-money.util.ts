import { moneyEquals, roundMoney, roundMoneyDecimal } from "../accounting/money.util.js";
import { Prisma } from "../generated/prisma/index.js";

/**
 * Decimal-safe money helpers for the LC module. Every landed-cost/allocation
 * number must go through Prisma.Decimal (decimal.js under the hood, already
 * the project's convention — see inventory.service.ts) so nothing rounds
 * through binary floating point before it's persisted.
 */

export type DecimalLike = Prisma.Decimal | number | string | null | undefined;

export function toDecimal(value: DecimalLike): Prisma.Decimal {
  if (value === null || value === undefined || value === "") return new Prisma.Decimal(0);
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function sumDecimals(values: DecimalLike[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((total, value) => total.add(toDecimal(value)), new Prisma.Decimal(0));
}

/** Uses the accounting-wide 2dp ROUND_HALF_UP monetary rule. */
export function round2(value: DecimalLike): Prisma.Decimal {
  return roundMoneyDecimal(value);
}

export function toNumber2(value: DecimalLike): number {
  return roundMoney(value);
}

export function isZero(value: DecimalLike, tolerance?: number): boolean {
  if (tolerance !== undefined) return toDecimal(value).abs().lessThanOrEqualTo(tolerance);
  return moneyEquals(value, 0);
}
