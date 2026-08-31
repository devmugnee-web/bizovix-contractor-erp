import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { Prisma, PurchaseType } from "@bizovix/database";
import { DocumentPurchasesService } from "./document-purchases.service";

function purchaseFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "dp-1",
    organizationId: "org-1",
    purchaseType: PurchaseType.EGP,
    egpTenderId: "EGP-2026-1",
    linkedTenderId: null,
    organizationMasterId: "master-1",
    paymentFromAccountId: "account-1",
    tenderWorkName: "Supply equipment",
    purchaseDate: new Date("2026-08-30T00:00:00.000Z"),
    documentPrice: new Prisma.Decimal("100.00"),
    estimatedTenderAmount: new Prisma.Decimal("1000.00"),
    category: "Supply",
    submissionDate: null,
    openingDate: null,
    remarks: null,
    tenderSecurityStatus: "PENDING",
    createdById: "user-1",
    createdAt: new Date("2026-08-30T10:00:00.000Z"),
    updatedAt: new Date("2026-08-30T10:00:00.000Z"),
    organizationMaster: { id: "master-1", shortName: "CLIENT", fullName: "Client" },
    paymentFromAccount: { id: "account-1", accountName: "Main Bank" },
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    purchaseType: PurchaseType.EGP,
    tenderId: " EGP   2026  1 ",
    organizationMasterId: "master-1",
    tenderWorkName: "Supply equipment",
    purchaseDate: "2026-08-30",
    documentPrice: 100,
    paymentFromAccountId: "account-1",
    category: "Supply",
    estimatedTenderAmount: 1000,
    ...overrides,
  };
}

function setup() {
  const tx = {
    documentPurchase: {
      create: jest.fn(),
      update: jest.fn(),
    },
    tender: { create: jest.fn() },
  };
  const prisma = {
    organizationMaster: { findFirst: jest.fn().mockResolvedValue({ id: "master-1" }) },
    bankAccount: { findFirst: jest.fn().mockResolvedValue({ id: "account-1" }) },
    tender: { findFirst: jest.fn() },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const audit = { record: jest.fn() };
  const service = new DocumentPurchasesService(prisma as never, audit as never);
  return { service, prisma, tx, audit };
}

describe("DocumentPurchasesService Tender business ID compatibility", () => {
  it("normalizes the supplied e-GP ID when auto-creating a Tender", async () => {
    const { service, prisma, tx } = setup();
    prisma.tender.findFirst.mockResolvedValue(null);
    tx.documentPurchase.create.mockResolvedValue(purchaseFixture());
    tx.tender.create.mockResolvedValue({ id: "tender-1" });
    tx.documentPurchase.update.mockResolvedValue(
      purchaseFixture({ egpTenderId: "EGP   2026  1", linkedTenderId: "tender-1" }),
    );

    await expect(service.create("org-1", "user-1", input() as never)).resolves.toMatchObject({
      id: "dp-1",
      tenderId: "EGP   2026  1",
      linkedTenderId: "tender-1",
    });
    expect(prisma.tender.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", tenderIdNormalized: "EGP 2026 1" } }),
    );
    expect(tx.tender.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        egpTenderId: "EGP   2026  1",
        tenderIdNormalized: "EGP 2026 1",
        status: "DOCUMENT_PURCHASED",
      }),
    });
  });

  it("derives a Manual Tender ID only from the authoritative Document Purchase primary key", async () => {
    const { service, prisma, tx } = setup();
    const manualPurchase = purchaseFixture({
      id: "dp-manual-abc",
      purchaseType: PurchaseType.MANUAL,
      egpTenderId: null,
    });
    tx.documentPurchase.create.mockResolvedValue(manualPurchase);
    tx.tender.create.mockResolvedValue({ id: "tender-manual-1" });
    tx.documentPurchase.update.mockResolvedValue(
      purchaseFixture({
        id: "dp-manual-abc",
        purchaseType: PurchaseType.MANUAL,
        egpTenderId: null,
        linkedTenderId: "tender-manual-1",
      }),
    );

    await expect(
      service.create(
        "org-1",
        "user-1",
        input({ purchaseType: PurchaseType.MANUAL, tenderId: undefined }) as never,
      ),
    ).resolves.toMatchObject({ tenderId: null, linkedTenderId: "tender-manual-1" });
    expect(prisma.tender.findFirst).not.toHaveBeenCalled();
    expect(tx.tender.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        egpTenderId: "MANUAL-DP-dp-manual-abc",
        tenderIdNormalized: "MANUAL-DP-DP-MANUAL-ABC",
      }),
    });
    expect(tx.documentPurchase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dp-manual-abc", organizationId: "org-1" },
        data: { linkedTenderId: "tender-manual-1" },
      }),
    );
  });

  it("keeps an explicitly linked Tender and does not create another one", async () => {
    const { service, prisma, tx } = setup();
    prisma.tender.findFirst.mockResolvedValue({ id: "existing-tender" });
    tx.documentPurchase.create.mockResolvedValue(
      purchaseFixture({ linkedTenderId: "existing-tender", egpTenderId: "EGP 2026 1" }),
    );

    await service.create("org-1", "user-1", input({ linkedTenderId: "existing-tender" }) as never);
    expect(tx.tender.create).not.toHaveBeenCalled();
    expect(tx.documentPurchase.update).not.toHaveBeenCalled();
    expect(tx.documentPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ linkedTenderId: "existing-tender" }) }),
    );
  });

  it("rejects an unlinked duplicate e-GP Tender ID before writing a purchase", async () => {
    const { service, prisma } = setup();
    prisma.tender.findFirst.mockResolvedValue({
      id: "existing-tender",
      egpTenderId: "EGP 2026 1",
      workName: "Existing work",
      createdAt: new Date("2026-08-30T10:00:00.000Z"),
      createdBy: { name: "Existing User" },
    });

    await expect(service.create("org-1", "user-1", input() as never)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rolls back and returns a friendly conflict for a concurrent duplicate", async () => {
    const { service, prisma } = setup();
    prisma.tender.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "existing-tender",
        egpTenderId: "EGP 2026 1",
        workName: "Existing work",
        createdAt: new Date("2026-08-30T10:00:00.000Z"),
        createdBy: { name: "Existing User" },
      });
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["organizationId", "tenderIdNormalized"] },
      }),
    );

    await expect(service.create("org-1", "user-1", input() as never)).rejects.toMatchObject({ status: 409 });
    expect(prisma.tender.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", tenderIdNormalized: "EGP 2026 1" } }),
    );
  });
});
