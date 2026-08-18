import { Prisma } from "@bizovix/database";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

/** Backend-authoritative line amount: qty * rate, less a percentage discount, plus a
 * percentage tax on the discounted base — never trusted from the frontend. */
export function calculateQuotationLineAmount(
  offeredQty: Prisma.Decimal | number,
  unitRate: Prisma.Decimal | number,
  discountPct: Prisma.Decimal | number = 0,
  taxPct: Prisma.Decimal | number = 0,
): Prisma.Decimal {
  const gross = D(offeredQty).mul(unitRate);
  const afterDiscount = gross.sub(gross.mul(discountPct).div(100));
  return afterDiscount.add(afterDiscount.mul(taxPct).div(100));
}

export function calculateQuotationTotal(lineAmounts: Array<Prisma.Decimal | number>): Prisma.Decimal {
  return lineAmounts.reduce((sum: Prisma.Decimal, amount) => sum.add(amount), D(0));
}
