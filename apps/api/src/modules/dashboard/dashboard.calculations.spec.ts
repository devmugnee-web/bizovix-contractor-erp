import { Prisma } from "@bizovix/database";
import {
  calculateAchievementRate,
  distributeTargetAmount,
  normalizeProgress,
  outstandingRetention,
} from "./dashboard.calculations";

describe("dashboard calculations", () => {
  it("does not report a misleading achievement percentage without a target", () => {
    expect(calculateAchievementRate(0, 2_176_363.64)).toBe(0);
  });

  it("calculates the achievement percentage when a target exists", () => {
    expect(calculateAchievementRate(1_000_000, 750_000)).toBe(75);
  });

  it("uses only unreleased certified retention as held security deposit", () => {
    expect(
      outstandingRetention(new Prisma.Decimal(100_000), new Prisma.Decimal(25_000)).toFixed(2),
    ).toBe("75000.00");
    expect(
      outstandingRetention(new Prisma.Decimal(100_000), new Prisma.Decimal(120_000)).toFixed(2),
    ).toBe("0.00");
  });

  it("keeps project progress within the visible zero-to-one-hundred range", () => {
    expect(normalizeProgress(-5)).toBe(0);
    expect(normalizeProgress(42.5)).toBe(42.5);
    expect(normalizeProgress(140)).toBe(100);
  });

  it("distributes a period target across months without losing any cents", () => {
    const monthlyAmounts = distributeTargetAmount(100, 12);
    expect(monthlyAmounts).toHaveLength(12);
    expect(monthlyAmounts.reduce((sum, amount) => sum + Math.round(Number(amount) * 100), 0)).toBe(
      10_000,
    );
    expect(new Set(monthlyAmounts)).toEqual(new Set(["8.34", "8.33"]));
  });
});
