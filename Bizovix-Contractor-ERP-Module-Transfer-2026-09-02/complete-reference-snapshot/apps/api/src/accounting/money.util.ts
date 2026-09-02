import { Prisma } from "../generated/prisma/index.js";

/**
 * One authoritative monetary precision rule for accounting values.
 *
 * Database columns intentionally remain Decimal(18,4) because quantities and
 * rates elsewhere may need four decimal places. Voucher money, however, is
 * posted and compared in the currency minor unit (paisa): round-half-up to two
 * decimal places before it reaches the ledger.
 */
export type MoneyLike = Prisma.Decimal | number | string | null | undefined;

const PAISA_PER_BDT = new Prisma.Decimal(100);

function toDecimal(value: MoneyLike): Prisma.Decimal {
  if (value === null || value === undefined || value === "") return new Prisma.Decimal(0);
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function roundMoneyDecimal(value: MoneyLike): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function roundMoney(value: MoneyLike): number {
  return roundMoneyDecimal(value).toNumber();
}

/** Exact integer-paisa representation used for equality and balance checks. */
export function toPaisa(value: MoneyLike): bigint {
  return BigInt(roundMoneyDecimal(value).mul(PAISA_PER_BDT).toFixed(0));
}

/**
 * Adds already-postable monetary values as integer paisa. Each line is rounded
 * first, matching what is persisted, so validation and stored totals cannot
 * disagree because of IEEE-754 residue.
 */
export function sumMoney(values: MoneyLike[]): number {
  const paisa = values.reduce((total, value) => total + toPaisa(value), 0n);
  return Number(paisa) / 100;
}

export function moneyEquals(left: MoneyLike, right: MoneyLike): boolean {
  return toPaisa(left) === toPaisa(right);
}

interface MoneyLine {
  debit: MoneyLike;
  credit: MoneyLike;
}

function aggregatePaisa(values: MoneyLike[]): bigint {
  const total = values.reduce<Prisma.Decimal>((sum, value) => sum.add(toDecimal(value)), new Prisma.Decimal(0));
  return toPaisa(total);
}

/**
 * Normalizes line amounts and absorbs only the rounding residue created by
 * splitting an otherwise-balanced aggregate across several lines. A genuine
 * one-paisa (or larger) source imbalance is never repaired and remains for the
 * posting validator to reject.
 */
export function normalizeBalancedMoneyLines<T extends MoneyLine>(lines: T[]): T[] {
  const debitTarget = aggregatePaisa(lines.map((line) => line.debit));
  const creditTarget = aggregatePaisa(lines.map((line) => line.credit));
  const normalized = lines.map((line) => ({
    ...line,
    debit: roundMoney(line.debit),
    credit: roundMoney(line.credit),
  })) as Array<Omit<T, "debit" | "credit"> & { debit: number; credit: number }>;

  // Do not hide an actual imbalance. assertBalanced() will return the useful
  // validation error after both sides have been normalized.
  if (debitTarget !== creditTarget) return normalized as T[];

  const reconcileSide = (side: "debit" | "credit", target: bigint) => {
    const current = normalized.reduce((total, line) => total + toPaisa(line[side]), 0n);
    const residue = target - current;
    if (residue === 0n) return;
    let index = -1;
    for (let candidate = lines.length - 1; candidate >= 0; candidate -= 1) {
      if (Number(lines[candidate][side] ?? 0) > 0) {
        index = candidate;
        break;
      }
    }
    if (index < 0) return;
    normalized[index][side] = roundMoney(normalized[index][side] + Number(residue) / 100);
  };

  reconcileSide("debit", debitTarget);
  reconcileSide("credit", creditTarget);
  return normalized as T[];
}
