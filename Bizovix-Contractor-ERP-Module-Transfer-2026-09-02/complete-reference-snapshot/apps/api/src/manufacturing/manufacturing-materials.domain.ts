export type MaterialLotAllocationMethod = "FIFO" | "FEFO";

export type MaterialLotCandidate = {
  id: string;
  lotNumber: string;
  availableQuantity: number;
  reservedQuantity: number;
  receivedAt: Date;
  retestDueAt?: Date | null;
  expiresAt?: Date | null;
};

export type MaterialLotAllocation = MaterialLotCandidate & {
  allocatableQuantity: number;
  suggestedQuantity: number;
};

/**
 * Deterministic source-lot allocation. FEFO prefers an expiry date and then
 * falls back to receipt order; FIFO always uses receipt order. The function is
 * deliberately pure so the database service can run the same rule before it
 * takes serializable row locks and persists reservations.
 */
export function allocateMaterialLots(
  candidates: MaterialLotCandidate[],
  requiredQuantity: number,
  method: MaterialLotAllocationMethod,
) {
  const required = Math.max(0, requiredQuantity);
  const sorted = [...candidates]
    .map((candidate) => ({
      ...candidate,
      allocatableQuantity: Math.max(
        0,
        candidate.availableQuantity - candidate.reservedQuantity,
      ),
    }))
    .filter((candidate) => candidate.allocatableQuantity > 0)
    .sort((left, right) => {
      if (method === "FEFO") {
        const leftExpiry = Math.min(
          left.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY,
          left.retestDueAt?.getTime() ?? Number.POSITIVE_INFINITY,
        );
        const rightExpiry = Math.min(
          right.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY,
          right.retestDueAt?.getTime() ?? Number.POSITIVE_INFINITY,
        );
        if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;
      }
      const receivedDifference =
        left.receivedAt.getTime() - right.receivedAt.getTime();
      return (
        receivedDifference ||
        left.lotNumber.localeCompare(right.lotNumber) ||
        left.id.localeCompare(right.id)
      );
    });

  let remaining = required;
  const allocations: MaterialLotAllocation[] = sorted.map((candidate) => {
    const suggestedQuantity = Math.min(
      candidate.allocatableQuantity,
      remaining,
    );
    remaining = Math.max(0, remaining - suggestedQuantity);
    return { ...candidate, suggestedQuantity };
  });

  return {
    method,
    requiredQuantity: required,
    allocatedQuantity: required - remaining,
    shortageQuantity: remaining,
    allocations,
  };
}

export type IncomingInspectionDecision = "RELEASED" | "REJECTED";

export function manufacturingOrderStatusAfterReservation<
  TStatus extends string,
>(currentStatus: TStatus, fullyReserved: boolean): TStatus | "RESERVED" {
  return fullyReserved && currentStatus === "APPROVED"
    ? "RESERVED"
    : currentStatus;
}

export function validateMaterialHandlingIdentity(input: {
  requisitionLineId: string;
  expectedRequisitionLineId: string;
  inventoryItemId: string;
  expectedInventoryItemId: string;
  inventoryLotId: string;
  expectedInventoryLotId: string;
  itemCode: string;
  lotNumber: string;
  scannedCode: string;
}) {
  const issues: string[] = [];
  if (input.requisitionLineId !== input.expectedRequisitionLineId)
    issues.push("Handling evidence references a different requisition line.");
  if (input.inventoryItemId !== input.expectedInventoryItemId)
    issues.push("Handling evidence references a different material.");
  if (input.inventoryLotId !== input.expectedInventoryLotId)
    issues.push(
      "Handling evidence references a different source inventory lot.",
    );
  const scanned = input.scannedCode.trim().toUpperCase();
  const lot = input.lotNumber.trim().toUpperCase();
  const composite = `${input.itemCode}:${input.lotNumber}`.toUpperCase();
  if (scanned !== lot && scanned !== composite)
    issues.push(
      "Scanned code does not match the persisted material source lot.",
    );
  return issues;
}

export function validateIncomingInspection(input: {
  heldQuantity: number;
  sampleQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  decision: IncomingInspectionDecision;
  results: Array<{
    passed?: boolean | null;
    actualValue?: number | null;
    actualText?: string | null;
  }>;
  reason?: string | null;
}) {
  const issues: string[] = [];
  const held = input.heldQuantity;
  if (!(input.sampleQuantity > 0) || input.sampleQuantity > held) {
    issues.push(
      "Sample quantity must be greater than zero and cannot exceed the quarantined quantity.",
    );
  }
  if (input.acceptedQuantity < 0 || input.rejectedQuantity < 0) {
    issues.push("Accepted and rejected quantities cannot be negative.");
  }
  if (
    Math.abs(input.acceptedQuantity + input.rejectedQuantity - held) > 0.00005
  ) {
    issues.push(
      "Accepted plus rejected quantity must exactly reconcile the quarantined quantity.",
    );
  }
  if (!input.results.length)
    issues.push("At least one actual inspection result is required.");
  if (input.results.some((result) => result.passed == null)) {
    issues.push(
      "Every inspection result requires an explicit pass/fail decision.",
    );
  }
  if (
    input.results.some(
      (result) => result.actualValue == null && !result.actualText?.trim(),
    )
  ) {
    issues.push(
      "Every inspection result requires an actual numeric or text result.",
    );
  }
  if (input.decision === "RELEASED") {
    if (input.rejectedQuantity !== 0 || input.acceptedQuantity !== held) {
      issues.push(
        "A RELEASED decision must release the full quarantined quantity with zero rejection.",
      );
    }
    if (input.results.some((result) => result.passed !== true)) {
      issues.push(
        "A RELEASED decision requires every recorded result to pass.",
      );
    }
  } else {
    if (input.acceptedQuantity !== 0 || input.rejectedQuantity !== held) {
      issues.push(
        "A REJECTED decision must reject the full quarantined quantity with zero acceptance.",
      );
    }
    if (!input.results.some((result) => result.passed === false)) {
      issues.push("A REJECTED decision requires at least one failed result.");
    }
    if (!input.reason?.trim()) issues.push("A rejection reason is required.");
  }
  return issues;
}
