import { describe, expect, it } from "vitest";

import { evaluateOpenReworkDispositions } from "./manufacturing-rework-close.domain.js";

describe("manufacturing rework close reconciliation", () => {
  it("resolves only a matching, closed rework order", () => {
    const result = evaluateOpenReworkDispositions({
      dispositions: [
        { reviewId: "review-1", linkedOrderId: "rework-1", quantity: 2 },
      ],
      linkedOrders: [
        {
          id: "rework-1",
          type: "REWORK",
          status: "CLOSED",
          plannedQuantity: 2,
        },
      ],
    });

    expect(result.openQuantity.toString()).toBe("0");
    expect(result.unresolved).toEqual([]);
  });

  it("keeps missing, active and unqualified cancelled links open", () => {
    const result = evaluateOpenReworkDispositions({
      dispositions: [
        { reviewId: "missing", linkedOrderId: null, quantity: 1 },
        { reviewId: "active", linkedOrderId: "rework-active", quantity: 2 },
        {
          reviewId: "cancelled",
          linkedOrderId: "rework-cancelled",
          quantity: 3,
        },
      ],
      linkedOrders: [
        {
          id: "rework-active",
          type: "REPROCESSING",
          status: "IN_PRODUCTION",
          plannedQuantity: 2,
        },
        {
          id: "rework-cancelled",
          type: "REWORK",
          status: "CANCELLED",
          plannedQuantity: 3,
        },
      ],
    });

    expect(result.openQuantity.toString()).toBe("6");
    expect(result.unresolved.map((entry) => entry.reason)).toEqual([
      "MISSING_LINK",
      "LINKED_ORDER_OPEN",
      "CANCELLED_WITHOUT_DISPOSITION",
    ]);
  });

  it("keeps a cancelled link open until the linked order is CLOSED", () => {
    const result = evaluateOpenReworkDispositions({
      dispositions: [
        { reviewId: "review-1", linkedOrderId: "rework-1", quantity: 2 },
      ],
      linkedOrders: [
        {
          id: "rework-1",
          type: "REWORK",
          status: "CANCELLED",
          plannedQuantity: 2,
        },
      ],
    });

    expect(result.openQuantity.toString()).toBe("2");
    expect(result.unresolved).toEqual([
      {
        reviewId: "review-1",
        linkedOrderId: "rework-1",
        quantity: "2",
        reason: "CANCELLED_WITHOUT_DISPOSITION",
      },
    ]);
  });
});
