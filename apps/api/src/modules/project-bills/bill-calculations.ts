import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";

const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
export const CERTIFIED_BILL_HISTORY_STATUSES = ["CERTIFIED", "PARTIALLY_RECEIVED", "RECEIVED"] as const;

export interface BoqCeiling {
  id: string;
  description: string;
  unit: string;
  contractQty: Prisma.Decimal;
  unitRate: Prisma.Decimal;
}

export interface CalculatedBillItem {
  boqItemId: string;
  description: string;
  unit: string;
  approvedRate: Prisma.Decimal;
  contractQty: Prisma.Decimal;
  previousQty: Prisma.Decimal;
  currentQty: Prisma.Decimal;
  cumulativeQty: Prisma.Decimal;
  previousValue: Prisma.Decimal;
  currentValue: Prisma.Decimal;
  cumulativeValue: Prisma.Decimal;
}

/** The core over-billing guard (master task section 11/56): rejects any item whose
 * cumulative certified quantity would exceed the BOQ's current approved ceiling, unless an
 * approved Variation Order has already raised that ceiling. Pure function — no I/O — so it
 * can be unit tested directly against the exact logic the certification transaction uses. */
export function calculateBillItem(boqItem: BoqCeiling, previousQty: Prisma.Decimal | number, currentQty: Prisma.Decimal | number): CalculatedBillItem {
  const current = D(currentQty);
  if (current.lt(0)) {
    throw new BadRequestException(`Current executed quantity for "${boqItem.description}" cannot be negative`);
  }
  const previous = D(previousQty);
  const cumulative = previous.add(current);
  if (cumulative.gt(boqItem.contractQty)) {
    throw new BadRequestException(
      `"${boqItem.description}" would be billed to ${cumulative.toFixed(3)} ${boqItem.unit}, exceeding the approved BOQ quantity of ${boqItem.contractQty.toFixed(3)} ${boqItem.unit}. Raise an approved Variation Order to increase the authorized quantity first.`,
    );
  }
  const rate = boqItem.unitRate;
  return {
    boqItemId: boqItem.id,
    description: boqItem.description,
    unit: boqItem.unit,
    approvedRate: rate,
    contractQty: boqItem.contractQty,
    previousQty: previous,
    currentQty: current,
    cumulativeQty: cumulative,
    previousValue: previous.mul(rate),
    currentValue: current.mul(rate),
    cumulativeValue: cumulative.mul(rate),
  };
}

export interface BillSummary {
  grossWorkValue: Prisma.Decimal;
  approvedAdditions: Prisma.Decimal;
  grossBillAmount: Prisma.Decimal;
  retentionAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  aitAmount: Prisma.Decimal;
  otherDeductionAmount: Prisma.Decimal;
  netCertifiedAmount: Prisma.Decimal;
}

/** Bill Summary formula (master task section 19): Gross Work Value + Approved Additions =
 * Gross Bill Amount; minus Retention/VAT/AIT/Other Deductions = Net Certified Amount.
 * Retention is calculated on certified work value only (not on additions like advances) —
 * a documented, configurable convention, not a claimed universal rule. */
export function summarizeBill(
  items: Array<{ currentValue: Prisma.Decimal | number }>,
  adjustments: Array<{ direction: "ADDITION" | "DEDUCTION"; amount: Prisma.Decimal | number }>,
  retentionPct: Prisma.Decimal | number | null,
  vatRate: Prisma.Decimal | number | null,
  aitRate: Prisma.Decimal | number | null,
): BillSummary {
  const grossWorkValue = items.reduce((sum, i) => sum.add(i.currentValue), D(0));
  const approvedAdditions = adjustments.filter((a) => a.direction === "ADDITION").reduce((sum, a) => sum.add(a.amount), D(0));
  const otherDeductionAmount = adjustments.filter((a) => a.direction === "DEDUCTION").reduce((sum, a) => sum.add(a.amount), D(0));
  const grossBillAmount = grossWorkValue.add(approvedAdditions);
  const retentionAmount = retentionPct ? grossWorkValue.mul(retentionPct).div(100) : D(0);
  const vatAmount = vatRate ? grossBillAmount.mul(vatRate).div(100) : D(0);
  const aitAmount = aitRate ? grossBillAmount.mul(aitRate).div(100) : D(0);
  const netCertifiedAmount = grossBillAmount.sub(retentionAmount).sub(vatAmount).sub(aitAmount).sub(otherDeductionAmount);
  return { grossWorkValue, approvedAdditions, grossBillAmount, retentionAmount, vatAmount, aitAmount, otherDeductionAmount, netCertifiedAmount };
}
