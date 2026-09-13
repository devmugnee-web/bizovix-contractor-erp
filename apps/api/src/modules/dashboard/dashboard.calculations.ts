import { Prisma } from "@bizovix/database";

export function calculateAchievementRate(target: number, achievement: number): number {
  return target > 0 ? Number(((achievement / target) * 100).toFixed(2)) : 0;
}

export function outstandingRetention(
  retained: Prisma.Decimal,
  released: Prisma.Decimal,
): Prisma.Decimal {
  return Prisma.Decimal.max(0, retained.sub(released));
}

export function normalizeProgress(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function distributeTargetAmount(totalAmount: number, monthCount: number): string[] {
  if (!Number.isInteger(monthCount) || monthCount < 1) {
    throw new Error("Target period must include at least one month");
  }
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / monthCount);
  const remainderCents = totalCents % monthCount;
  return Array.from({ length: monthCount }, (_, index) =>
    ((baseCents + (index < remainderCents ? 1 : 0)) / 100).toFixed(2),
  );
}
