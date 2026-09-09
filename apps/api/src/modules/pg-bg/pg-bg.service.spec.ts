import "reflect-metadata";
import { PgBgService } from "./pg-bg.service";

describe("PgBgService", () => {
  it("lists only tenders that completed Tender Security and Credit Commitment", async () => {
    const prisma = {
      documentPurchase: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new PgBgService(prisma as never, {} as never);

    await service.eligibleTenders("org-1", { page: 1, limit: 5 });

    expect(prisma.documentPurchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          purchaseType: "EGP",
          tenderSecurityStatus: { in: ["CREATED", "NOT_REQUIRED"] },
          creditCommitmentItems: { some: {} },
        }),
      }),
    );
  });

  it("blocks a direct PG/BG draft before the Tender Security decision", async () => {
    const prisma = {
      documentPurchase: {
        findFirst: jest.fn().mockResolvedValue({
          id: "purchase-1",
          purchaseType: "EGP",
          tenderSecurityStatus: "PENDING",
          creditCommitmentItems: [],
          cmsWork: null,
          linkedTender: null,
          category: "IT",
        }),
      },
    };
    const service = new PgBgService(prisma as never, {} as never);

    await expect(
      service.saveDraft("org-1", "user-1", { documentPurchaseId: "purchase-1" }),
    ).rejects.toThrow("Complete the Tender Security decision before continuing PG/BG");
  });

  it("blocks a direct PG/BG draft before Credit Commitment is completed", async () => {
    const prisma = {
      documentPurchase: {
        findFirst: jest.fn().mockResolvedValue({
          id: "purchase-1",
          purchaseType: "EGP",
          tenderSecurityStatus: "CREATED",
          creditCommitmentItems: [],
          cmsWork: null,
          linkedTender: null,
          category: "IT",
        }),
      },
    };
    const service = new PgBgService(prisma as never, {} as never);

    await expect(
      service.saveDraft("org-1", "user-1", { documentPurchaseId: "purchase-1" }),
    ).rejects.toThrow("Complete the Credit Commitment charge before continuing PG/BG");
  });
});
