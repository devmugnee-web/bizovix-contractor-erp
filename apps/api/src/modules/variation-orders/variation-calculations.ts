import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";

const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);

/** Net variation amount for a single BOQ line (master task section 30): the delta between
 * revised and original quantity x rate. For a brand-new item (no original), the full revised
 * value is the amount. Pure function — no I/O. */
export function calculateVariationItemAmount(
  originalQty: Prisma.Decimal | number | null,
  originalRate: Prisma.Decimal | number | null,
  revisedQty: Prisma.Decimal | number,
  revisedRate: Prisma.Decimal | number,
): Prisma.Decimal {
  const revisedValue = D(revisedQty).mul(revisedRate);
  if (originalQty === null || originalRate === null) return revisedValue;
  const originalValue = D(originalQty).mul(originalRate);
  return revisedValue.sub(originalValue);
}

/** Current/Revised Contract Value formula (master task section 30): Original Contract Value
 * never changes; it's recomputed from scratch as original + sum of every APPROVED variation's
 * signed net amount, never as an incremental running update (which would drift on retries). */
export function calculateCurrentContractValue(
  originalContractValue: Prisma.Decimal | number,
  approvedVariationAmounts: Array<Prisma.Decimal | number | null>,
): Prisma.Decimal {
  return approvedVariationAmounts.reduce((sum: Prisma.Decimal, amount) => sum.add(amount ?? 0), D(originalContractValue));
}

/** OMISSION-type variations must reduce contract value — this normalizes the sign so the
 * stored requestedAmount/approvedAmount is always consistent regardless of how individual
 * item deltas were entered. */
export function signVariationAmount(variationType: string, amount: Prisma.Decimal): Prisma.Decimal {
  if (variationType === "OMISSION" && amount.gt(0)) {
    throw new BadRequestException("An Omission variation must reduce contract value — check the revised quantities/rates");
  }
  return variationType === "OMISSION" ? amount.abs().neg() : amount;
}
