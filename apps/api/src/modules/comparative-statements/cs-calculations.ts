import { Prisma } from "@bizovix/database";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

export function calculateEvaluatedTotal(quotedTotal: Prisma.Decimal | number, commercialAdjustment: Prisma.Decimal | number = 0): Prisma.Decimal {
  return D(quotedTotal).add(commercialAdjustment);
}

export interface RankInput {
  supplierId: string;
  evaluatedTotal: Prisma.Decimal;
}

/** Lowest evaluated total ranks 1st. Ties keep insertion order (stable sort) — the CS never
 * hides a tie, it just needs a deterministic display order. */
export function rankByEvaluatedTotal(entries: RankInput[]): Map<string, number> {
  const ranks = new Map<string, number>();
  [...entries].sort((a, b) => a.evaluatedTotal.cmp(b.evaluatedTotal)).forEach((entry, index) => ranks.set(entry.supplierId, index + 1));
  return ranks;
}

/** Never auto-awards — only tells the caller whether the chosen supplier happens to be the
 * lowest offer, so the service can require an explicit decision note when it isn't. */
export function isLowestEvaluatedTotal(supplierId: string, entries: RankInput[]): boolean {
  const ranks = rankByEvaluatedTotal(entries);
  return ranks.get(supplierId) === 1;
}
