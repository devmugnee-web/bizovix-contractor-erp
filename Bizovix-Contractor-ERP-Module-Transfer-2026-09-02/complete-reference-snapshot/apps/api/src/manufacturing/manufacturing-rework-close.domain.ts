import { Prisma } from "../generated/prisma/index.js";

export type ManufacturingReworkDispositionForClose = {
  reviewId: string;
  linkedOrderId: string | null;
  quantity: Prisma.Decimal.Value;
};

export type ManufacturingLinkedReworkOrderForClose = {
  id: string;
  type: string;
  status: string;
  plannedQuantity: Prisma.Decimal.Value;
};

const REWORK_ORDER_TYPES = new Set(["REWORK", "REPROCESSING"]);

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

export function evaluateOpenReworkDispositions(input: {
  dispositions: ManufacturingReworkDispositionForClose[];
  linkedOrders: ManufacturingLinkedReworkOrderForClose[];
}) {
  const linkedOrders = new Map(
    input.linkedOrders.map((order) => [order.id, order]),
  );
  const unresolved: Array<{
    reviewId: string;
    linkedOrderId: string | null;
    quantity: string;
    reason:
      | "MISSING_LINK"
      | "LINK_NOT_FOUND"
      | "INVALID_LINKED_ORDER"
      | "QUANTITY_MISMATCH"
      | "LINKED_ORDER_OPEN"
      | "CANCELLED_WITHOUT_DISPOSITION";
  }> = [];
  let openQuantity = decimal(0);

  for (const disposition of input.dispositions) {
    const quantity = decimal(disposition.quantity);
    if (!quantity.isFinite() || quantity.lessThanOrEqualTo(0)) {
      throw new Error(
        `Rework disposition ${disposition.reviewId} has an invalid disposed quantity.`,
      );
    }
    const addUnresolved = (reason: (typeof unresolved)[number]["reason"]) => {
      openQuantity = openQuantity.add(quantity);
      unresolved.push({
        reviewId: disposition.reviewId,
        linkedOrderId: disposition.linkedOrderId,
        quantity: quantity.toString(),
        reason,
      });
    };
    if (!disposition.linkedOrderId) {
      addUnresolved("MISSING_LINK");
      continue;
    }
    const linkedOrder = linkedOrders.get(disposition.linkedOrderId);
    if (!linkedOrder) {
      addUnresolved("LINK_NOT_FOUND");
      continue;
    }
    if (!REWORK_ORDER_TYPES.has(linkedOrder.type)) {
      addUnresolved("INVALID_LINKED_ORDER");
      continue;
    }
    if (!decimal(linkedOrder.plannedQuantity).equals(quantity)) {
      addUnresolved("QUANTITY_MISMATCH");
      continue;
    }
    if (linkedOrder.status === "CLOSED") continue;
    if (linkedOrder.status !== "CANCELLED") {
      addUnresolved("LINKED_ORDER_OPEN");
      continue;
    }
    // A cancelled child order is not proof that the disposition quantity was
    // processed. Close remains fail-closed until that linked order completes
    // its own controlled lifecycle and reaches CLOSED.
    addUnresolved("CANCELLED_WITHOUT_DISPOSITION");
  }

  return { openQuantity, unresolved };
}
