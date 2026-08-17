import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";

const D = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);

export function addCalendarDays(date: Date, days: number) {
  if (!Number.isInteger(days) || days < 0)
    throw new BadRequestException("Duration must be a non-negative whole number of days");
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function retentionBalance(
  held: Prisma.Decimal | string | number,
  released: Prisma.Decimal | string | number,
) {
  const outstanding = D(held).sub(released);
  return outstanding.isNegative() ? D(0) : outstanding;
}

export function assertRetentionRelease(
  amount: Prisma.Decimal | string | number,
  outstanding: Prisma.Decimal | string | number,
) {
  const release = D(amount);
  if (release.lte(0))
    throw new BadRequestException("Retention release must be greater than zero");
  if (release.gt(outstanding))
    throw new BadRequestException("Retention release cannot exceed outstanding retention");
  return release;
}

export function profitMetrics(
  contractValue: Prisma.Decimal,
  certifiedRevenue: Prisma.Decimal,
  finalCost: Prisma.Decimal,
) {
  const grossProfit = certifiedRevenue.sub(finalCost);
  return {
    grossProfit,
    profitMarginPct: certifiedRevenue.isZero() ? null : grossProfit.mul(100).div(certifiedRevenue),
    contractValue,
  };
}
