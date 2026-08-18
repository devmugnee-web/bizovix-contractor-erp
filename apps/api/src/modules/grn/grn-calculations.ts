import { BadRequestException } from "@nestjs/common";
import { GrnInspectionStatus, Prisma } from "@bizovix/database";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

export interface GrnCeiling {
  itemName: string;
  unit: string;
  orderedQty: Prisma.Decimal | number;
}

export interface GrnLineResult {
  cumulativeReceivedQty: Prisma.Decimal;
  remainingQty: Prisma.Decimal;
}

/** Backend-authoritative partial-receipt ceiling check, mirroring the BOQ over-billing guard:
 * cumulative received quantity across ALL GRNs against a PO line may never exceed the ordered
 * quantity unless a controlled PO amendment raises it (not built this phase). */
export function calculateGrnItemLine(
  ceiling: GrnCeiling,
  previouslyReceivedQty: Prisma.Decimal | number,
  currentReceivedQty: Prisma.Decimal | number,
): GrnLineResult {
  const current = D(currentReceivedQty);
  if (current.lt(0)) throw new BadRequestException(`Current received quantity for "${ceiling.itemName}" cannot be negative`);
  const previous = D(previouslyReceivedQty);
  const cumulative = previous.add(current);
  const ordered = D(ceiling.orderedQty);
  if (cumulative.gt(ordered)) {
    throw new BadRequestException(
      `"${ceiling.itemName}" would be received to ${cumulative.toFixed(3)} ${ceiling.unit}, exceeding the ordered quantity of ${ordered.toFixed(3)} ${ceiling.unit}. Raise a controlled PO amendment to increase the ordered quantity first.`,
    );
  }
  return { cumulativeReceivedQty: cumulative, remainingQty: ordered.sub(cumulative) };
}

export interface GrnItemQtyBreakdown {
  currentReceivedQty: Prisma.Decimal | number;
  acceptedQty: Prisma.Decimal | number;
  rejectedQty: Prisma.Decimal | number;
  damagedQty: Prisma.Decimal | number;
}

/** Accepted + Rejected + Damaged must always account for the whole received quantity — nothing
 * received is left uncategorized. */
export function assertQtyBreakdownBalanced(itemName: string, breakdown: GrnItemQtyBreakdown) {
  const total = D(breakdown.acceptedQty).add(breakdown.rejectedQty).add(breakdown.damagedQty);
  if (!total.eq(breakdown.currentReceivedQty)) {
    throw new BadRequestException(`For "${itemName}", Accepted + Rejected + Damaged (${total.toFixed(3)}) must equal the current received quantity (${D(breakdown.currentReceivedQty).toFixed(3)})`);
  }
}

/** Computed immediately from the entered quantities — the current single-step creation flow
 * never leaves a GRN at PENDING (that value is reserved for a future two-step inspection flow). */
export function computeInspectionStatus(items: GrnItemQtyBreakdown[]): GrnInspectionStatus {
  const allAccepted = items.every((item) => D(item.rejectedQty).isZero() && D(item.damagedQty).isZero() && D(item.acceptedQty).eq(item.currentReceivedQty));
  if (allAccepted) return GrnInspectionStatus.ACCEPTED;
  const allRejected = items.every((item) => D(item.acceptedQty).isZero() && D(item.currentReceivedQty).gt(0));
  if (allRejected) return GrnInspectionStatus.REJECTED;
  return GrnInspectionStatus.PARTIAL;
}
