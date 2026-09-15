import "reflect-metadata";
import { Prisma } from "@bizovix/database";
import { DashboardService } from "./dashboard.service";

type BusinessByCategoryResult = {
  items: Array<{ category: string; amount: string; percentage: number; color: string }>;
  totalBusiness: string;
};

type BusinessByCategoryReader = {
  getBusinessByCategory(
    organizationId: string,
    range?: { from: Date; to: Date },
  ): Promise<BusinessByCategoryResult>;
};

type TenderPerformanceReader = {
  getTenderPerformance(
    organizationId: string,
    range?: { from: Date; to: Date },
  ): Promise<{ submitted: number; noaAwarded: number; successRate: number; underProcess: number }>;
};

describe("DashboardService business by category", () => {
  it("groups real project business by work category within the selected period", async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { workCategory: "IT", _sum: { contractValue: new Prisma.Decimal("750000") } },
      { workCategory: "Electrical", _sum: { contractValue: new Prisma.Decimal("250000") } },
    ]);
    const service = new DashboardService({ cmsWork: { groupBy } } as never, {} as never);
    const reader = service as unknown as BusinessByCategoryReader;
    const range = {
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-12-31T23:59:59.999Z"),
    };

    await expect(reader.getBusinessByCategory("org-1", range)).resolves.toEqual({
      items: [
        { category: "IT", amount: "750000", percentage: 75, color: "#7C3AED" },
        { category: "Electrical", amount: "250000", percentage: 25, color: "#16A34A" },
      ],
      totalBusiness: "1000000",
    });
    expect(groupBy).toHaveBeenCalledWith({
      by: ["workCategory"],
      where: {
        organizationId: "org-1",
        status: { not: "CANCELLED" },
        OR: [
          { startDate: { gte: range.from, lte: range.to } },
          { startDate: null, createdAt: { gte: range.from, lte: range.to } },
        ],
      },
      _sum: { contractValue: true },
    });
  });
});

describe("DashboardService tender performance", () => {
  it("counts awarded workflow tenders even when the legacy submission timestamp is absent", async () => {
    const wonStatuses = ["NOA", "AWARDED", "ONGOING", "COMPLETED"];
    const count = jest
      .fn()
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(0);
    const service = new DashboardService({ tender: { count } } as never, {} as never);
    const reader = service as unknown as TenderPerformanceReader;
    const range = {
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-12-31T23:59:59.999Z"),
    };
    const period = { gte: range.from, lte: range.to };

    await expect(reader.getTenderPerformance("org-1", range)).resolves.toEqual({
      submitted: 9,
      noaAwarded: 9,
      successRate: 100,
      underProcess: 0,
    });
    expect(count).toHaveBeenNthCalledWith(1, {
      where: {
        organizationId: "org-1",
        OR: [
          { submittedAt: period },
          { submittedAt: null, awardedAt: period, status: { in: wonStatuses } },
        ],
      },
    });
    expect(count).toHaveBeenNthCalledWith(2, {
      where: { organizationId: "org-1", awardedAt: period, status: { in: wonStatuses } },
    });
  });
});
