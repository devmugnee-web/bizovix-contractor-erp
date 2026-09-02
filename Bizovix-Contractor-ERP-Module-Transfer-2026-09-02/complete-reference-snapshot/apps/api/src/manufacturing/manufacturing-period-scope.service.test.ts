import { describe, expect, it } from "vitest";

import { manufacturingPeriodOrderActivityScope } from "./manufacturing-blueprint.service.js";

describe("manufacturing period order activity scope", () => {
  it("includes actual execution and every linked in-period manufacturing artifact", () => {
    const start = new Date("2026-09-01T00:00:00.000Z");
    const end = new Date("2026-09-30T23:59:59.999Z");
    const next = new Date("2026-10-01T00:00:00.000Z");
    const withinPeriod = { gte: start, lt: next };

    const where = manufacturingPeriodOrderActivityScope(
      "workspace-1",
      start,
      end,
      next,
    );
    const alternatives = where.OR ?? [];

    expect(where.workspaceId).toBe("workspace-1");
    expect(alternatives).toContainEqual({
      AND: [
        { actualStartAt: { lt: next } },
        { OR: [{ actualEndAt: null }, { actualEndAt: { gte: start } }] },
      ],
    });
    expect(alternatives).toContainEqual({
      transactions: { some: { transactionDate: withinPeriod } },
    });
    expect(alternatives).toContainEqual({
      actualCostPostings: { some: { transactionDate: withinPeriod } },
    });
    expect(alternatives).toContainEqual({
      reservations: {
        some: {
          AND: [
            { reservedAt: { lt: next } },
            { OR: [{ releasedAt: null }, { releasedAt: { gte: start } }] },
          ],
        },
      },
    });
    expect(alternatives).toContainEqual({
      operationExecutions: {
        some: expect.objectContaining({ OR: expect.any(Array) }),
      },
    });
    expect(alternatives).toContainEqual({
      qualityInspections: {
        some: expect.objectContaining({ OR: expect.any(Array) }),
      },
    });
    expect(alternatives).toContainEqual({
      workflowReviews: { some: { transactionDate: withinPeriod } },
    });
    expect(alternatives).toContainEqual({
      packagingOrders: {
        some: expect.objectContaining({ OR: expect.any(Array) }),
      },
    });
    expect(alternatives).toContainEqual({
      downtimeEvents: {
        some: {
          AND: [
            { startedAt: { lt: next } },
            { OR: [{ endedAt: null }, { endedAt: { gte: start } }] },
          ],
        },
      },
    });
  });
});
