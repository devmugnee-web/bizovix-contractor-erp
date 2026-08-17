import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import {
  addCalendarDays,
  assertRetentionRelease,
  profitMetrics,
  retentionBalance,
} from "./closing-calculations";

describe("project closing calculations", () => {
  test("DLP uses real calendar-day arithmetic across a leap day", () => {
    expect(addCalendarDays(new Date("2028-02-28T00:00:00.000Z"), 2).toISOString()).toBe(
      "2028-03-01T00:00:00.000Z",
    );
  });
  test("DLP uses real calendar-day arithmetic across month end", () => {
    expect(addCalendarDays(new Date("2026-01-31T00:00:00.000Z"), 1).toISOString()).toBe(
      "2026-02-01T00:00:00.000Z",
    );
  });
  test("partial retention release leaves authoritative outstanding balance", () => {
    expect(retentionBalance("1000000", "500000").toFixed(2)).toBe("500000.00");
  });
  test("retention over-release is rejected", () => {
    expect(() => assertRetentionRelease("500000.01", "500000")).toThrow(BadRequestException);
  });
  test("zero retention release is rejected", () => {
    expect(() => assertRetentionRelease(0, 1)).toThrow(BadRequestException);
  });
  test("profit uses certified revenue and actual cost, not contract value", () => {
    const result = profitMetrics(
      new Prisma.Decimal(1200),
      new Prisma.Decimal(1000),
      new Prisma.Decimal(750),
    );
    expect(result.grossProfit.toFixed(2)).toBe("250.00");
    expect(result.profitMarginPct?.toFixed(2)).toBe("25.00");
  });
  test("zero certified revenue returns no fabricated margin", () => {
    expect(
      profitMetrics(new Prisma.Decimal(100), new Prisma.Decimal(0), new Prisma.Decimal(20))
        .profitMarginPct,
    ).toBeNull();
  });
});
