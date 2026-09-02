/**
 * Positional chart-of-accounts numbering — a fixed-width 7-digit code where
 * each category depth owns one digit position (zero-padded when a branch
 * doesn't go that deep), and a Ledger uses the remaining digits after the
 * category positions as a running counter. e.g. Assets = 1000000, its 2nd
 * Category = 1200000, a Ledger directly under Assets = 1000001.
 *
 * A Category nests under a Main Category or another Category to unlimited
 * depth, but only the first `POSITIONAL_CATEGORY_DIGITS` depths (1=Main,
 * 2-4=Category) fit in the fixed-width scheme — a Category or Ledger deeper
 * than that has no positional slot left, so `pickCategoryCode`/`pickLedgerCode`
 * return null and the caller falls back to a non-positional code (see
 * `computeAccountCode` in accounts.service.ts).
 *
 * Pure, side-effect-free digit-picking so the live service, the new-company
 * seed, and the one-off data migration all derive codes the same way.
 */
export const POSITIONAL_CODE_WIDTH = 7;
export const POSITIONAL_CATEGORY_DIGITS = 4;

// The digit a Main Category's nature maps to. Both expense natures share block
// 5 — Direct/Indirect Expenses are Categories under one "Expenses" Main
// Category, never separate Main Categories, so this never collides in practice.
export const MAIN_CATEGORY_NATURE_DIGIT: Record<string, number> = {
  ASSET: 1,
  LIABILITY: 2,
  EQUITY: 3,
  INCOME: 4,
  DIRECT_EXPENSE: 5,
  INDIRECT_EXPENSE: 5,
};

function digitsInUse(codes: string[], position: number, prefix: string): Set<number> {
  const used = new Set<number>();
  for (const code of codes) {
    if (code.length !== POSITIONAL_CODE_WIDTH || !/^\d+$/.test(code) || !code.startsWith(prefix)) {
      continue;
    }
    used.add(Number(code[position - 1]));
  }
  return used;
}

function firstFreeDigit(used: Set<number>, preferred?: number): number | null {
  if (preferred && !used.has(preferred)) {
    return preferred;
  }
  for (let candidate = 1; candidate <= 9; candidate += 1) {
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Picks a Main Category's code: prefers its nature's canonical digit, and
 * falls back to the next free 1-9 slot if that digit is already taken by a
 * sibling (e.g. a second Main Category sharing the same nature). Returns null
 * once all 9 slots at this position are full.
 */
export function pickMainCategoryCode(nature: string, siblingCodes: string[]): string | null {
  const used = digitsInUse(siblingCodes, 1, "");
  const digit = firstFreeDigit(used, MAIN_CATEGORY_NATURE_DIGIT[nature]);
  if (!digit) {
    return null;
  }
  return String(digit) + "0".repeat(POSITIONAL_CODE_WIDTH - 1);
}

/**
 * Picks a Category's code under `parentCode`, as the next free digit (1-9)
 * at its position among `siblingCodes` sharing the same prefix. `depth` is
 * this Category's own depth in the tree (2 for a Category directly under a
 * Main Category, 3 for its children, and so on — see
 * `AccountsService.computeDepth`). Returns null when `parentCode` isn't a
 * valid 7-digit positional code, `depth` is beyond the positional scheme's
 * reach (deeper than `POSITIONAL_CATEGORY_DIGITS`), or all 9 slots at this
 * position are already taken.
 */
export function pickCategoryCode(depth: number, parentCode: string, siblingCodes: string[]): string | null {
  if (depth <= 1 || depth > POSITIONAL_CATEGORY_DIGITS) {
    return null;
  }
  if (!/^\d{7}$/.test(parentCode)) {
    return null;
  }

  const position = depth;
  const prefix = parentCode.slice(0, position - 1);
  const digit = firstFreeDigit(digitsInUse(siblingCodes, position, prefix));
  if (!digit) {
    return null;
  }
  return prefix + String(digit) + "0".repeat(POSITIONAL_CODE_WIDTH - prefix.length - 1);
}

/**
 * Picks a Ledger's code: the parent category's digits (padded to
 * `POSITIONAL_CATEGORY_DIGITS`, zero-filled if the parent doesn't go that
 * deep) plus the next free counter among `siblingLedgerCodes` under that same
 * parent. A null `parentCode` (Ledger with no category parent) counts from an
 * all-zero prefix. `parentDepth` is the parent Category's own depth (see
 * `pickCategoryCode`) — returns null once the counter range is exhausted, or
 * if the parent itself sits deeper than the positional scheme reaches.
 */
export function pickLedgerCode(parentCode: string | null, parentDepth: number | null, siblingLedgerCodes: string[]): string | null {
  const counterWidth = POSITIONAL_CODE_WIDTH - POSITIONAL_CATEGORY_DIGITS;

  let categoryPrefix = "";
  if (parentCode) {
    if (!/^\d{7}$/.test(parentCode)) {
      return null;
    }
    if (!parentDepth || parentDepth > POSITIONAL_CATEGORY_DIGITS) {
      return null;
    }
    categoryPrefix = parentCode.slice(0, parentDepth);
  }
  const fixedPart = categoryPrefix.padEnd(POSITIONAL_CATEGORY_DIGITS, "0");

  let maxCounter = 0;
  for (const code of siblingLedgerCodes) {
    if (code.length !== POSITIONAL_CODE_WIDTH || !/^\d+$/.test(code) || !code.startsWith(fixedPart)) {
      continue;
    }
    const counter = Number(code.slice(POSITIONAL_CATEGORY_DIGITS));
    if (counter > maxCounter) {
      maxCounter = counter;
    }
  }

  const nextCounter = maxCounter + 1;
  if (nextCounter > 10 ** counterWidth - 1) {
    return null;
  }
  return fixedPart + String(nextCounter).padStart(counterWidth, "0");
}
