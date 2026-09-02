import { describe, expect, it } from "vitest";

import { resolveManufacturingStatusPolicy } from "./manufacturing-status-configuration.domain.js";

const record = {
  id: "status-policy-1",
  effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
  effectiveTo: null,
  payload: {
    details: {
      workflowScope: "PRODUCTION_ORDER",
      transitions: [
        {
          from: "DRAFT",
          to: "SUBMITTED",
          permissionKey: "manufacturing.order.create",
        },
      ],
    },
  },
};

describe("manufacturing status configuration", () => {
  it("adds a restrictive permission to an explicitly configured transition", () => {
    expect(
      resolveManufacturingStatusPolicy([record], {
        workflowScope: "PRODUCTION_ORDER",
        fromStatus: "DRAFT",
        toStatus: "SUBMITTED",
        at: new Date("2026-09-02T00:00:00.000Z"),
      }),
    ).toEqual({
      configured: true,
      allowed: true,
      permissionKey: "manufacturing.order.create",
      recordId: "status-policy-1",
    });
  });

  it("fails closed when an active configuration omits the transition", () => {
    expect(
      resolveManufacturingStatusPolicy([record], {
        workflowScope: "PRODUCTION_ORDER",
        fromStatus: "SUBMITTED",
        toStatus: "APPROVED",
        at: new Date("2026-09-02T00:00:00.000Z"),
      }),
    ).toMatchObject({ configured: true, allowed: false });
  });

  it("does not let a future policy affect the fixed baseline", () => {
    expect(
      resolveManufacturingStatusPolicy([record], {
        workflowScope: "PRODUCTION_ORDER",
        fromStatus: "DRAFT",
        toStatus: "SUBMITTED",
        at: new Date("2026-08-31T00:00:00.000Z"),
      }),
    ).toEqual({
      configured: false,
      allowed: true,
      permissionKey: null,
      recordId: null,
    });
  });
});
