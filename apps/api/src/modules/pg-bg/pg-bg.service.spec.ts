import "reflect-metadata";
import { Prisma } from "@bizovix/database";
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

  it("moves an accepted NOA into ongoing business and syncs the linked Tender", async () => {
    const existing = {
      id: "workflow-1",
      organizationId: "org-1",
      documentPurchaseId: "purchase-1",
      organizationMasterId: "master-1",
      status: "DRAFT",
      currentStep: 3,
      tenderSecurityAmount: new Prisma.Decimal("0"),
      noaDate: new Date("2026-09-10T00:00:00.000Z"),
      noaAmount: new Prisma.Decimal("500000"),
      workCategory: "IT",
      contactId: "contact-1",
      contact: null,
      contactSnapshot: {
        id: "contact-1",
        name: "Project Director",
        designation: "PD",
        mobile: "01700000000",
        address: "Dhaka",
        email: null,
      },
      cmsWork: null,
    };
    const tx = {
      pgBgWorkflow: {
        update: jest.fn().mockResolvedValue({
          ...existing,
          status: "NOA_ACCEPTED",
          acceptNoa: true,
          pgBgRequired: false,
        }),
      },
      documentPurchase: {
        findFirst: jest.fn().mockResolvedValue({
          id: "purchase-1",
          linkedTenderId: "tender-1",
          tenderWorkName: "Software implementation",
        }),
      },
      tender: { update: jest.fn().mockResolvedValue({ id: "tender-1" }) },
      cmsWork: { upsert: jest.fn().mockResolvedValue({ id: "work-1" }) },
    };
    const prisma = {
      pgBgWorkflow: { findFirst: jest.fn().mockResolvedValue(existing) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const audit = { record: jest.fn() };
    const service = new PgBgService(prisma as never, audit as never);

    await expect(
      service.acceptNoa("org-1", "user-1", "workflow-1", {
        acceptNoa: true,
        pgBgRequired: false,
      }),
    ).resolves.toMatchObject({ cmsWorkId: "work-1" });

    expect(tx.tender.update).toHaveBeenCalledWith({
      where: { id: "tender-1", organizationId: "org-1" },
      data: {
        status: "ONGOING",
        awardedAt: expect.any(Date),
        category: "IT",
        contractValue: new Prisma.Decimal("500000"),
      },
    });
    expect(tx.cmsWork.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          organizationId: "org-1",
          tenderId: "tender-1",
          workCategory: "IT",
          contractValue: new Prisma.Decimal("500000"),
        }),
      }),
    );
  });
});
