import "reflect-metadata";
import { Prisma } from "@bizovix/database";
import { BadRequestException } from "@nestjs/common";
import { CreateTenderSecurityDto } from "./dto/create-tender-security.dto";
import { TenderSecuritiesService } from "./tender-securities.service";

describe("TenderSecuritiesService", () => {
  it.each([undefined, null, "", "   ", 123])("rejects missing or blank references before database access: %p", async (referenceNo) => {
    const prisma = { $transaction: jest.fn() };
    const service = new TenderSecuritiesService(prisma as never, {} as never, {} as never, {} as never, {} as never);
    const dto = {
      items: [
        { documentPurchaseId: "purchase-1", securityAmount: 60000, marginPercentage: 5, referenceNo: "PO-001" },
        { documentPurchaseId: "purchase-2", securityAmount: 40000, marginPercentage: 5, referenceNo },
      ],
    } as unknown as CreateTenderSecurityDto;

    await expect(service.create("org-1", "user-1", dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("shows only document-purchased tenders waiting for security by default", async () => {
    const prisma = {
      tender: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const settings = {
      get: jest.fn().mockResolvedValue({ tsDefaultSecurityPct: new Prisma.Decimal(3) }),
    };
    const service = new TenderSecuritiesService(prisma as never, {} as never, settings as never, {} as never, {} as never);

    await service.pending("org-1", { page: 1, limit: 5 });

    expect(prisma.tender.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          documentPurchases: {
            some: { tenderSecurityStatus: "PENDING" },
            none: { tenderSecurityStatus: "CREATED" },
          },
        }),
      }),
    );
  });
});
