/**
 * Canonical precision for posted and displayed monetary values.
 *
 * Quantities, exchange rates and inventory valuation rates intentionally do
 * not use this helper because they may need more precision than a currency
 * amount. Only the resulting money value is normalized to two decimals.
 */
export const MONEY_DECIMAL_PLACES = 2;
export const MONEY_MINOR_UNIT_SCALE = 10 ** MONEY_DECIMAL_PLACES;

const DECIMAL_VALUE_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

interface DecimalParts {
  coefficient: bigint;
  decimalPlaces: number;
}

function parseDecimalParts(value: number | string | null | undefined): DecimalParts | null {
  if (value === null || value === undefined) return { coefficient: 0n, decimalPlaces: 0 };
  if (typeof value === "number" && !Number.isFinite(value)) return null;

  const source = String(value).trim().replace(/,/g, "");
  const match = DECIMAL_VALUE_PATTERN.exec(source);
  if (!match || !Number.isFinite(Number(source))) return null;

  const [, signToken, integerPart = "", trailingFraction = "", leadingFraction = "", exponentToken = "0"] = match;
  const fractionPart = trailingFraction || leadingFraction;
  const exponent = Number(exponentToken);
  if (!Number.isSafeInteger(exponent)) return null;

  const absoluteCoefficient = BigInt(`${integerPart || "0"}${fractionPart}`);
  return {
    coefficient: signToken === "-" && absoluteCoefficient !== 0n ? -absoluteCoefficient : absoluteCoefficient,
    decimalPlaces: fractionPart.length - exponent,
  };
}

function scaledIntegerToMinorUnits(coefficient: bigint, decimalPlaces: number): bigint {
  if (coefficient === 0n) return 0n;

  const negative = coefficient < 0n;
  const absoluteCoefficient = negative ? -coefficient : coefficient;
  const minorUnitShift = MONEY_DECIMAL_PLACES - decimalPlaces;

  let roundedAbsolute: bigint;
  if (minorUnitShift >= 0) {
    roundedAbsolute = absoluteCoefficient * (10n ** BigInt(minorUnitShift));
  } else {
    const divisor = 10n ** BigInt(-minorUnitShift);
    const quotient = absoluteCoefficient / divisor;
    const remainder = absoluteCoefficient % divisor;
    roundedAbsolute = quotient + (remainder * 2n >= divisor ? 1n : 0n);
  }

  return negative ? -roundedAbsolute : roundedAbsolute;
}

/**
 * Parse a decimal value and round it to integer paisa without first doing a
 * binary floating-point multiplication. JavaScript represents `10.075` a
 * little below the decimal midpoint, so `Math.round(value * 100)` is not a
 * reliable money rule. Working from the decimal representation also keeps
 * string and exponent inputs on the same ROUND_HALF_UP rule.
 */
function decimalToMinorUnits(value: number | string | null | undefined): bigint | null {
  const parts = parseDecimalParts(value);
  return parts === null ? null : scaledIntegerToMinorUnits(parts.coefficient, parts.decimalPlaces);
}

/** Add unrounded decimal sources exactly, then round the aggregate once. */
function aggregateMoneyToMinorUnits(values: Iterable<number | string | null | undefined>): bigint {
  const parsedValues: DecimalParts[] = [];
  let commonDecimalPlaces = 0;

  for (const value of values) {
    const parts = parseDecimalParts(value);
    if (parts === null) continue;
    parsedValues.push(parts);
    commonDecimalPlaces = Math.max(commonDecimalPlaces, parts.decimalPlaces);
  }

  const aggregate = parsedValues.reduce((total, parts) => (
    total + parts.coefficient * (10n ** BigInt(commonDecimalPlaces - parts.decimalPlaces))
  ), 0n);
  return scaledIntegerToMinorUnits(aggregate, commonDecimalPlaces);
}

function minorUnitsToMoney(value: bigint) {
  if (value === 0n) return 0;

  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(MONEY_DECIMAL_PLACES + 1, "0");
  const decimalIndex = digits.length - MONEY_DECIMAL_PLACES;
  const numericValue = Number(`${negative ? "-" : ""}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

/** Round a monetary value to the nearest paisa (half away from zero). */
export function roundMoney(value: number | string | null | undefined) {
  const minorUnits = decimalToMinorUnits(value);
  return minorUnits === null ? 0 : minorUnitsToMoney(minorUnits);
}

/** Convert money to an integer minor-unit value for exact comparisons/sums. */
export function moneyToMinorUnits(value: number | string | null | undefined) {
  const minorUnits = decimalToMinorUnits(value);
  if (minorUnits === null) return 0;
  const numericValue = Number(minorUnits);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

/** Sum monetary values in minor units so binary floating tails cannot leak in. */
export function sumMoney(values: Iterable<number | string | null | undefined>) {
  let totalMinorUnits = 0;
  for (const value of values) {
    totalMinorUnits += moneyToMinorUnits(value);
  }
  return totalMinorUnits / MONEY_MINOR_UNIT_SCALE;
}

export function moneyAmountsEqual(
  left: number | string | null | undefined,
  right: number | string | null | undefined,
) {
  return moneyToMinorUnits(left) === moneyToMinorUnits(right);
}

/**
 * Round voucher lines to paisa and absorb only the one-paisa split residue
 * created when an otherwise-balanced total is distributed across many rows.
 * A real source imbalance is deliberately left untouched for validation.
 */
export function normalizeBalancedMoneyLines<T extends { debit: number; credit: number }>(lines: T[]): T[] {
  const debitTarget = aggregateMoneyToMinorUnits(lines.map((line) => line.debit));
  const creditTarget = aggregateMoneyToMinorUnits(lines.map((line) => line.credit));
  const normalized = lines.map((line) => ({
    ...line,
    debit: roundMoney(line.debit),
    credit: roundMoney(line.credit),
  }));

  if (debitTarget !== creditTarget) return normalized;

  const reconcileSide = (side: "debit" | "credit", target: bigint) => {
    const current = normalized.reduce(
      (total, line) => total + (decimalToMinorUnits(line[side]) ?? 0n),
      0n,
    );
    const residue = target - current;
    if (residue === 0n) return;

    let index = -1;
    for (let candidate = lines.length - 1; candidate >= 0; candidate -= 1) {
      if (Number(lines[candidate][side] || 0) > 0) {
        index = candidate;
        break;
      }
    }
    if (index < 0) return;
    const lineMinorUnits = decimalToMinorUnits(normalized[index][side]) ?? 0n;
    normalized[index][side] = minorUnitsToMoney(lineMinorUnits + residue);
  };

  reconcileSide("debit", debitTarget);
  reconcileSide("credit", creditTarget);
  return normalized;
}
