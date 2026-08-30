import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { SalesQuotationResultDto } from "./dto/sales-quotation.dto";
import { SalesQuotationsService } from "./sales-quotations.service";

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "quotation-1",
    organizationId: "org-1",
    quotationNo: "QT-2026-0001",
    quotationDate: new Date("2026-08-01T00:00:00.000Z"),
    validUntil: new Date("2099-08-31T00:00:00.000Z"),
    sentAt: new Date("2026-08-02T00:00:00.000Z"),
    grandTotal: new Prisma.Decimal("100.00"),
    items: [],
    overheads: [],
    followUps: [],
    statusHistory: [],
    ...overrides,
  };
}

function setup(record = fixture()) {
  const prisma = {
    salesQuotation: {
      findFirst: jest.fn().mockResolvedValue(record),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    salesQuotationItem: {
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new SalesQuotationsService(
    prisma as never,
    { record: jest.fn() } as never,
    {} as never,
  );
  return { service, prisma };
}

describe("SalesQuotationsService hardening", () => {
  it("returns tenant-scoped weighted costing aggregates as Decimal strings", async () => {
    const { service, prisma } = setup();
    prisma.salesQuotationItem.groupBy.mockResolvedValue([
      {
        description: "Excavation",
        unit: "LS",
        _sum: {
          quantity: new Prisma.Decimal("4.000"),
          totalCost: new Prisma.Decimal("100.00"),
          totalPrice: new Prisma.Decimal("160.00"),
          profit: new Prisma.Decimal("60.00"),
        },
      },
    ]);
    prisma.salesQuotationItem.aggregate.mockResolvedValue({
      _sum: {
        totalCost: new Prisma.Decimal("100.00"),
        totalPrice: new Prisma.Decimal("160.00"),
        profit: new Prisma.Decimal("60.00"),
      },
    });

    await expect(
      service.costingSummary("org-1", {
        page: 1,
        limit: 500,
        workName: "Office",
      }),
    ).resolves.toEqual({
      items: [{
        description: "Excavation",
        unit: "LS",
        quantity: "4.000",
        weightedUnitCost: "25.00",
        weightedUnitPrice: "40.00",
        marginPct: "37.5000",
        totalCost: "100.00",
        totalSelling: "160.00",
        profit: "60.00",
      }],
      totalCost: "100.00",
      totalSelling: "160.00",
      profit: "60.00",
    });
    expect(prisma.salesQuotationItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        where: {
          organizationId: "org-1",
          quotation: { is: expect.objectContaining({ organizationId: "org-1", workName: "Office" }) },
        },
      }),
    );
  });

  it("returns recent terminal decisions ordered by decision date with a capped limit", async () => {
    const { service, prisma } = setup();
    prisma.salesQuotation.findMany.mockResolvedValue([]);
    await expect(
      service.recentDecisions("org-1", { page: 1, limit: 100, workName: "Office" }),
    ).resolves.toEqual([]);
    expect(prisma.salesQuotation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          workName: "Office",
          status: { in: ["ACCEPTED", "REJECTED"] },
        }),
        orderBy: [{ decisionDate: "desc" }, { updatedAt: "desc" }],
        take: 20,
      }),
    );
  });

  it("rejects status overrides on the mixed recent-decisions endpoint", async () => {
    const { service, prisma } = setup();
    await expect(
      service.recentDecisions("org-1", { page: 1, limit: 5, status: "DRAFT" as never }),
    ).rejects.toThrow("does not accept status or decision filters");
    expect(prisma.salesQuotation.findMany).not.toHaveBeenCalled();
  });

  it("rejects conflicting status and decision filters before querying", async () => {
    const { service, prisma } = setup();
    await expect(
      service.findAll("org-1", {
        page: 1,
        limit: 20,
        status: "SENT" as never,
        decision: "PENDING" as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.salesQuotation.findMany).not.toHaveBeenCalled();
  });

  it("does not send a quotation without costing items", async () => {
    const { service, prisma } = setup();
    await expect(
      service.send("org-1", "user-1", "quotation-1", { expectedVersion: 1 }),
    ).rejects.toThrow("At least one costing item");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not send a quotation whose grand total is zero", async () => {
    const { service, prisma } = setup(
      fixture({ items: [{ id: "item-1" }], grandTotal: new Prisma.Decimal(0) }),
    );
    await expect(
      service.send("org-1", "user-1", "quotation-1", { expectedVersion: 1 }),
    ).rejects.toThrow("grand total must be greater than zero");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      {
        expectedVersion: 1,
        decision: SalesQuotationResultDto.ACCEPTED,
        decisionDate: "2026-08-03",
        acceptedAmount: "0",
        customerPoWoNo: "PO-1",
      },
      "greater than zero",
    ],
    [
      {
        expectedVersion: 1,
        decision: SalesQuotationResultDto.ACCEPTED,
        decisionDate: "2026-08-03",
        acceptedAmount: "101",
        customerPoWoNo: "PO-1",
      },
      "must not exceed",
    ],
    [
      {
        expectedVersion: 1,
        decision: SalesQuotationResultDto.ACCEPTED,
        decisionDate: "2026-08-03",
        acceptedAmount: "50",
        customerPoWoNo: "  ",
      },
      "PO/WO number is required",
    ],
    [
      {
        expectedVersion: 1,
        decision: SalesQuotationResultDto.REJECTED,
        decisionDate: "2026-08-03",
        rejectionReason: "  ",
      },
      "Rejection reason is required",
    ],
  ])("rejects invalid result payload %#", async (dto, message) => {
    const { service, prisma } = setup();
    await expect(service.result("org-1", "user-1", "quotation-1", dto as never)).rejects.toThrow(
      message as string,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
