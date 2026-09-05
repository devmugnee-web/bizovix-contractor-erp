import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { CERTIFIED_BILL_HISTORY_STATUSES } from "./bill-calculations";

export const PENDING_BILL_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW"] as const;
export const COMMITTED_BILL_STATUSES = [...CERTIFIED_BILL_HISTORY_STATUSES, ...PENDING_BILL_STATUSES];

export function billQuantities(contractQty: Prisma.Decimal, rows: { currentQty: Prisma.Decimal; bill: { status: string } }[]) {
  let previous = new Prisma.Decimal(0);
  let pending = new Prisma.Decimal(0);
  for (const row of rows) {
    if ((CERTIFIED_BILL_HISTORY_STATUSES as readonly string[]).includes(row.bill.status)) previous = previous.add(row.currentQty);
    else if ((PENDING_BILL_STATUSES as readonly string[]).includes(row.bill.status)) pending = pending.add(row.currentQty);
  }
  return { previous, pending, remaining: Prisma.Decimal.max(0, contractQty.sub(previous).sub(pending)) };
}

export function assertBillQuantities(items: { boqItemId: string; currentQty: number }[]) {
  if (!items.length || !items.some((item) => item.currentQty > 0)) throw new BadRequestException("Enter a billing quantity for at least one BOQ item");
  if (new Set(items.map((item) => item.boqItemId)).size !== items.length) throw new BadRequestException("A BOQ item can appear only once in a bill");
  if (items.some((item) => !Number.isFinite(item.currentQty) || item.currentQty < 0)) throw new BadRequestException("Billing quantities must be valid non-negative numbers");
}
