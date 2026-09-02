import { MONEY_MINOR_UNIT_SCALE, moneyToMinorUnits } from "@/lib/money";

export type PaymentAllocationMismatch = {
  paymentAmount: number;
  allocatedAmount: number;
  difference: number;
};

/**
 * A Payment-Out may intentionally exceed the amount applied to bills; the
 * remainder is a supplier advance. That remains valid accounting, but it is
 * important enough to require an explicit acknowledgement before saving.
 */
export function getPaymentAllocationMismatch(
  paymentAmount: number,
  allocatedAmount: number,
  hasOutstandingBills: boolean,
): PaymentAllocationMismatch | null {
  if (!hasOutstandingBills || !Number.isFinite(paymentAmount) || !Number.isFinite(allocatedAmount)) return null;
  const paymentMinorUnits = moneyToMinorUnits(paymentAmount);
  const allocatedMinorUnits = moneyToMinorUnits(allocatedAmount);
  const differenceMinorUnits = paymentMinorUnits - allocatedMinorUnits;
  if (differenceMinorUnits === 0) return null;
  return {
    paymentAmount: paymentMinorUnits / MONEY_MINOR_UNIT_SCALE,
    allocatedAmount: allocatedMinorUnits / MONEY_MINOR_UNIT_SCALE,
    difference: differenceMinorUnits / MONEY_MINOR_UNIT_SCALE,
  };
}
