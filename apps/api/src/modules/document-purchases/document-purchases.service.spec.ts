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

function requestFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    costingId: "costing-1",
    status: "PENDING_APPROVAL",
    requestedById: "requester-1",
    approvedById: null,
    approvedAt: null,
    rejectedById: null,
    rejectedAt: null,
    rejectionReason: null,
    documentPurchaseId: null,
    version: 1,
    createdAt: new Date("2026-09-06T10:00:00.000Z"),
    updatedAt: new Date("2026-09-06T10:00:00.000Z"),
    tender: {
      id: "tender-1",
      egpTenderId: "EGP-2026-1",
      workName: "Supply equipment",
      category: "Supply",
      documentFee: new Prisma.Decimal("100"),
      contractValue: new Prisma.Decimal("2500"),
      documentPurchaseDeadline: null,
      submissionDeadline: null,
      openingDate: null,
      organizationMaster: { id: "master-1", shortName: "CLIENT", fullName: "Client" },
    },
    costing: { id: "costing-1", status: "APPROVED" },
    requestedBy: { id: "requester-1", name: "Requester" },
    approvedBy: null,
    rejectedBy: null,
    ...overrides,
  };
}

function setup() {
  const tx = {
    documentPurchase: {
      create: jest.fn(),
      update: jest.fn(),
    },
    documentPurchaseRequest: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
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
  it("approves a pending request with optimistic concurrency and an audit trail", async () => {
    const { service, tx, audit } = setup();
    tx.documentPurchaseRequest.findFirst
      .mockResolvedValueOnce(requestFixture())
      .mockResolvedValueOnce(
        requestFixture({
          status: "APPROVED",
          version: 2,
          approvedById: "approver-1",
          approvedBy: { id: "approver-1", name: "Approver" },
        }),
      );
    tx.documentPurchaseRequest.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.approveRequest("org-1", "approver-1", "request-1", { version: 1 })).resolves.toMatchObject({
      id: "request-1",
      status: "APPROVED",
      version: 2,
      tender: { documentFee: "100.00", contractValue: "2500.00" },
    });
    expect(tx.documentPurchaseRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "request-1", organizationId: "org-1", version: 1 }),
        data: expect.objectContaining({ status: "APPROVED", approvedById: "approver-1" }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DOCUMENT_PURCHASE_REQUEST_APPROVED", entityId: "request-1" }),
      tx,
    );
  });

  it("rejects only a pending request and records the reason", async () => {
    const { service, tx, audit } = setup();
    tx.documentPurchaseRequest.findFirst
      .mockResolvedValueOnce(requestFixture())
      .mockResolvedValueOnce(
        requestFixture({
          status: "REJECTED",
          version: 2,
          rejectedById: "approver-1",
          rejectedBy: { id: "approver-1", name: "Approver" },
          rejectionReason: "Budget needs review",
        }),
      );
    tx.documentPurchaseRequest.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.rejectRequest("org-1", "approver-1", "request-1", {
        version: 1,
        reason: "  Budget needs review  ",
      }),
    ).resolves.toMatchObject({ status: "REJECTED", rejectionReason: "Budget needs review", version: 2 });
    expect(tx.documentPurchaseRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rejectionReason: "Budget needs review" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DOCUMENT_PURCHASE_REQUEST_REJECTED", entityId: "request-1" }),
      tx,
    );
  });

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

  it("blocks a linked costing tender until its document purchase request is approved", async () => {
    const { service, prisma, tx } = setup();
    prisma.tender.findFirst.mockResolvedValue({ id: "existing-tender" });
    tx.documentPurchaseRequest.findFirst.mockResolvedValue({
      id: "request-1",
      organizationId: "org-1",
      tenderId: "existing-tender",
      status: "PENDING_APPROVAL",
      version: 1,
      tender: { organizationMasterId: "master-1" },
    });

    await expect(
      service.create(
        "org-1",
        "user-1",
        input({ linkedTenderId: "existing-tender", requestId: "request-1" }) as never,
      ),
    ).rejects.toThrow("Approve the document purchase request before purchasing");
    expect(tx.documentPurchase.create).not.toHaveBeenCalled();
  });

  it("creates the purchase and completes an approved request atomically", async () => {
    const { service, prisma, tx } = setup();
    prisma.tender.findFirst.mockResolvedValue({ id: "existing-tender" });
    tx.documentPurchaseRequest.findFirst.mockResolvedValue({
      id: "request-1",
      organizationId: "org-1",
      tenderId: "existing-tender",
      status: "APPROVED",
      version: 2,
      tender: {
        egpTenderId: "EGP-2026-1",
        organizationMasterId: "master-1",
        workName: "Authoritative work name",
        contractValue: new Prisma.Decimal("2500"),
        category: "Supply",
        submissionDeadline: null,
        openingDate: null,
      },
    });
    tx.documentPurchase.create.mockResolvedValue(
      purchaseFixture({ linkedTenderId: "existing-tender", tenderWorkName: "Authoritative work name" }),
    );
    tx.documentPurchaseRequest.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.create(
        "org-1",
        "user-1",
        input({ linkedTenderId: "existing-tender", requestId: "request-1" }) as never,
      ),
    ).resolves.toMatchObject({ id: "dp-1", linkedTenderId: "existing-tender" });
    expect(tx.documentPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenderWorkName: "Authoritative work name",
          estimatedTenderAmount: new Prisma.Decimal("2500"),
        }),
      }),
    );
    expect(tx.documentPurchaseRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "request-1", version: 2, status: "APPROVED" }),
        data: expect.objectContaining({ status: "PURCHASED", documentPurchaseId: "dp-1" }),
      }),
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
