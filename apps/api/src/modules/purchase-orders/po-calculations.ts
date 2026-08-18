import { Prisma } from "@bizovix/database";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

export interface PoItemLine {
  grossAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  lineAmount: Prisma.Decimal;
  netRate: Prisma.Decimal;
}

/** Backend-authoritative PO line math — never trusted from the frontend. */
export function calculatePoItemLine(orderedQty: Prisma.Decimal | number, unitRate: Prisma.Decimal | number, discountAmount: Prisma.Decimal | number = 0): PoItemLine {
  const qty = D(orderedQty);
  const grossAmount = qty.mul(unitRate);
  const discount = D(discountAmount);
  const lineAmount = grossAmount.sub(discount);
  const netRate = qty.gt(0) ? lineAmount.div(qty) : D(unitRate);
  return { grossAmount, discountAmount: discount, lineAmount, netRate };
}

export interface PoTotals {
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
}

/** taxPct comes from the caller's configurable-rate lookup (DeductionConfig "VAT") — this
 * function never applies a rate on its own, so a missing config naturally yields zero tax
 * rather than a fabricated percentage. */
export function calculatePoTotals(lines: PoItemLine[], taxPct: Prisma.Decimal | number = 0, otherCharges: Prisma.Decimal | number = 0): PoTotals {
  const subtotal = lines.reduce((sum, line) => sum.add(line.grossAmount), D(0));
  const discountAmount = lines.reduce((sum, line) => sum.add(line.discountAmount), D(0));
  const netAfterDiscount = subtotal.sub(discountAmount);
  const taxAmount = netAfterDiscount.mul(taxPct).div(100);
  const grandTotal = netAfterDiscount.add(taxAmount).add(otherCharges);
  return { subtotal, discountAmount, taxAmount, grandTotal };
}
