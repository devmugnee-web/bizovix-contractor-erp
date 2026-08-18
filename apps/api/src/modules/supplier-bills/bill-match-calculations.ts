import { BillMatchStatus, Prisma } from "@bizovix/database";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

/** Severity order used both per-item and for the bill's own rolled-up matchStatus — the most
 * severe status any line carries becomes the bill's overall status. Hard stops (MISSING_RECEIPT,
 * BLOCKED) prevent approval; the rest are informational only. */
const SEVERITY: Record<BillMatchStatus, number> = {
  MISSING_RECEIPT: 5,
  BLOCKED: 4,
  QUANTITY_VARIANCE: 3,
  RATE_VARIANCE: 2,
  AMOUNT_VARIANCE: 1,
  MATCHED: 0,
};

export function overallMatchStatus(statuses: BillMatchStatus[]): BillMatchStatus {
  return statuses.reduce((worst, status) => (SEVERITY[status] > SEVERITY[worst] ? status : worst), "MATCHED" as BillMatchStatus);
}

export function isBlockingMatchStatus(status: BillMatchStatus): boolean {
  return status === "MISSING_RECEIPT" || status === "BLOCKED";
}

export interface MatchBillItemInput {
  itemName: string;
  unit: string;
  orderedQty: Prisma.Decimal | number;
  /** SUM of GrnItem.acceptedQty across every GRN recorded against this PO item. */
  acceptedQty: Prisma.Decimal | number;
  /** Cumulative currentBilledQty from every prior APPROVED bill against this PO item. */
  previouslyBilledQty: Prisma.Decimal | number;
  currentBilledQty: Prisma.Decimal | number;
  poRate: Prisma.Decimal | number;
  invoiceRate: Prisma.Decimal | number;
  discountAmount?: Prisma.Decimal | number;
  /** Tenant-configurable — null/undefined means zero tolerance (any rate difference is flagged). */
  rateTolerancePct?: Prisma.Decimal | number | null;
}

export interface MatchBillItemResult {
  grossAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  lineAmount: Prisma.Decimal;
  netRate: Prisma.Decimal;
  remainingBillableQty: Prisma.Decimal;
  matchStatus: BillMatchStatus;
}

/** Backend-authoritative per-line 3-way-match outcome — never trusted from the frontend.
 * Never throws; the caller decides whether a returned BLOCKED/MISSING_RECEIPT status should
 * prevent a status transition (submit/approve), matching how the bill's own service layer
 * needs to still *display* a blocked line before rejecting the action. */
export function matchBillItem(input: MatchBillItemInput): MatchBillItemResult {
  const currentBilledQty = D(input.currentBilledQty);
  if (currentBilledQty.lt(0)) throw new Error(`Current billed quantity for "${input.itemName}" cannot be negative`);

  const orderedQty = D(input.orderedQty);
  const acceptedQty = D(input.acceptedQty);
  const previouslyBilledQty = D(input.previouslyBilledQty);
  const poRate = D(input.poRate);
  const invoiceRate = D(input.invoiceRate);
  const discountAmount = D(input.discountAmount ?? 0);
  const tolerance = D(input.rateTolerancePct ?? 0);

  const grossAmount = currentBilledQty.mul(invoiceRate);
  const lineAmount = grossAmount.sub(discountAmount);
  const netRate = currentBilledQty.gt(0) ? lineAmount.div(currentBilledQty) : invoiceRate;

  // Available BEFORE this bill is what the ceiling check compares against; remainingBillableQty
  // is the post-this-bill figure shown to the user (mirrors GRN's remainingQty semantics).
  const availableBeforeThisBill = acceptedQty.sub(previouslyBilledQty);
  const remainingBillableQty = Prisma.Decimal.max(0, availableBeforeThisBill.sub(currentBilledQty));

  let matchStatus: BillMatchStatus;
  if (acceptedQty.lte(0)) {
    matchStatus = "MISSING_RECEIPT";
  } else if (currentBilledQty.gt(availableBeforeThisBill)) {
    matchStatus = "BLOCKED";
  } else if (currentBilledQty.gt(orderedQty.sub(previouslyBilledQty))) {
    // Billing beyond the PO's own ordered quantity — even if an over-receipt made it technically
    // "available" — is a genuine quantity variance distinct from the hard billable-ceiling stop.
    matchStatus = "QUANTITY_VARIANCE";
  } else {
    const rateDiffPct = poRate.eq(0) ? (invoiceRate.eq(0) ? D(0) : D(100)) : invoiceRate.sub(poRate).abs().div(poRate).mul(100);
    if (rateDiffPct.gt(tolerance)) {
      matchStatus = "RATE_VARIANCE";
    } else {
      const expectedAmount = currentBilledQty.mul(poRate);
      const amountDiffPct = expectedAmount.eq(0) ? (lineAmount.eq(0) ? D(0) : D(100)) : lineAmount.sub(expectedAmount).abs().div(expectedAmount).mul(100);
      matchStatus = amountDiffPct.gt(tolerance) ? "AMOUNT_VARIANCE" : "MATCHED";
    }
  }

  return { grossAmount, discountAmount, lineAmount, netRate, remainingBillableQty, matchStatus };
}

export interface BillTotals {
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxableBase: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  aitAmount: Prisma.Decimal;
  otherDeductionAmount: Prisma.Decimal;
  netPayable: Prisma.Decimal;
}

/** taxPct/aitPct come from the caller's DeductionConfigsService.effectiveConfig() lookup — this
 * function never applies a rate on its own, so an unconfigured deduction naturally yields zero
 * rather than a fabricated percentage. VAT is treated as part of the cost (no recoverable
 * input-VAT-asset workflow exists yet); AIT is withheld from the supplier and owed to the tax
 * authority separately — see SupplierBillsService's accounting-policy comment for the full
 * rationale. */
export function calculateBillTotals(
  lines: Array<{ grossAmount: Prisma.Decimal | number; discountAmount: Prisma.Decimal | number }>,
  vatRatePct: Prisma.Decimal | number = 0,
  aitRatePct: Prisma.Decimal | number = 0,
  otherDeductionAmount: Prisma.Decimal | number = 0,
): BillTotals {
  const subtotal = lines.reduce((sum, line) => sum.add(line.grossAmount), D(0));
  const discountAmount = lines.reduce((sum, line) => sum.add(line.discountAmount), D(0));
  const taxableBase = subtotal.sub(discountAmount);
  const vatAmount = taxableBase.mul(vatRatePct).div(100);
  const aitAmount = taxableBase.mul(aitRatePct).div(100);
  const otherDeduction = D(otherDeductionAmount);
  const netPayable = taxableBase.add(vatAmount).sub(aitAmount).sub(otherDeduction);
  return { subtotal, discountAmount, taxableBase, vatAmount, aitAmount, otherDeductionAmount: otherDeduction, netPayable };
}
