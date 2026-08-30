import { Prisma } from "@bizovix/database";

type DecimalInput = string | number | Prisma.Decimal;

export interface WorkIouCalculatedTotals {
  subtotal: Prisma.Decimal;
  otherCharges: Prisma.Decimal;
  discount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

function decimal(value: DecimalInput, label: string) {
  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new Error(`${label} must be a valid decimal number`);
  }
}

export function calculateWorkIouTotals(
  itemAmounts: DecimalInput[],
  otherChargesInput: DecimalInput = "0",
  discountInput: DecimalInput = "0",
): WorkIouCalculatedTotals {
  const amounts = itemAmounts.map((value) => decimal(value, "Item amount"));
  if (amounts.some((value) => !value.gt(0))) {
    throw new Error("Each item amount must be greater than zero");
  }

  const otherCharges = decimal(otherChargesInput, "Other charges");
  const discount = decimal(discountInput, "Discount");
  if (otherCharges.isNegative()) throw new Error("Other charges cannot be negative");
  if (discount.isNegative()) throw new Error("Discount cannot be negative");

  const subtotal = amounts.reduce(
    (total, amount) => total.add(amount),
    new Prisma.Decimal(0),
  );
  const beforeDiscount = subtotal.add(otherCharges);
  if (discount.gt(beforeDiscount)) {
    throw new Error("Discount cannot exceed subtotal plus other charges");
  }

  return {
    subtotal,
    otherCharges,
    discount,
    totalAmount: beforeDiscount.sub(discount),
  };
}

