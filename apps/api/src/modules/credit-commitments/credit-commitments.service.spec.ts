import "reflect-metadata";
import { CreditCommitmentsService } from "./credit-commitments.service";

describe("CreditCommitmentsService", () => {
  it("lists only uncharged purchases with a completed Tender Security decision", async () => {
    const prisma = {
      documentPurchase: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new CreditCommitmentsService(prisma as never, {} as never);

    await service.pending("org-1", { page: 1, limit: 5 });

    expect(prisma.documentPurchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          tenderSecurityStatus: { in: ["CREATED", "NOT_REQUIRED"] },
          creditCommitmentItems: { none: {} },
        }),
      }),
    );
  });

  it("rejects a direct create request when Tender Security is not completed", async () => {
    const prisma = {
      bankAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: "payment-account" }),
        findMany: jest.fn().mockResolvedValue([{ id: "bank-1" }]),
      },
      documentPurchase: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new CreditCommitmentsService(prisma as never, {} as never);

    await expect(
      service.create("org-1", "user-1", {
        paymentFromAccountId: "payment-account",
        paymentDate: "2026-09-09",
        items: [{ documentPurchaseId: "purchase-1", bankAccountId: "bank-1", chargeAmount: 100 }],
      }),
    ).rejects.toThrow("One or more selected tenders are not eligible");

    expect(prisma.documentPurchase.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["purchase-1"] },
        organizationId: "org-1",
        tenderSecurityStatus: { in: ["CREATED", "NOT_REQUIRED"] },
        creditCommitmentItems: { none: {} },
      },
    });
  });
});
