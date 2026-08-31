import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { TenderCostingsService } from "./tender-costings.service";

describe("TenderCostingsService budget gate", () => {
  it("blocks detailed costing saves until a Tender Costing Budget is saved", async () => {
    const prisma = {
      tenderCosting: {
        findFirst: jest.fn().mockResolvedValue({
          id: "costing-1",
          organizationId: "org-1",
          status: "READY",
          costingBudget: null,
          tender: { egpTenderId: "TID-1", contractValue: 100000 },
        }),
      },
    };
    const auditLog = { record: jest.fn() };
    const service = new TenderCostingsService(prisma as never, auditLog as never);

    await expect(
      service.save("org-1", "user-1", "costing-1", {
        version: 1,
        status: "IN_PROGRESS" as never,
        costingDate: "2026-08-31",
        currency: "BDT",
        exchangeRate: 1,
        costingVersion: 1,
        freightCost: 0,
        installationCost: 0,
        otherCost: 0,
        contingencyPercent: 0,
        items: [],
      }),
    ).rejects.toThrow(
      new BadRequestException(
        "Enter and save the Tender Costing Budget before preparing the costing",
      ),
    );
  });
});
