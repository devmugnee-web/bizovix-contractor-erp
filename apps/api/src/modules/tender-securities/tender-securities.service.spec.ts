import "reflect-metadata";
import { Prisma } from "@bizovix/database";
import { TenderSecuritiesService } from "./tender-securities.service";

describe("TenderSecuritiesService", () => {
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
    const service = new TenderSecuritiesService(prisma as never, {} as never, settings as never);

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
