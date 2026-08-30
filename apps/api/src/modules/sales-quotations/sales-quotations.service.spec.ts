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
