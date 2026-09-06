import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { Prisma, TenderCostingApprovalStatus } from "@bizovix/database";
import { TendersService } from "./tenders.service";

function tenderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "tender-1",
    organizationId: "org-1",
    organizationMasterId: "master-1",
    egpTenderId: "TID-2026-0001",
    tenderIdNormalized: "TID-2026-0001",
    workName: "Supply of equipment",
    category: "Supply",
    contractValue: new Prisma.Decimal("1000.00"),
    payOrderAmount: null,
    estimatedTenderSecurityAmount: null,
    quotedAmount: null,
    lowestBidAmount: null,
    costingApprovalStatus: TenderCostingApprovalStatus.DRAFT,
    costingApprovedAt: null,
    costingApprovedById: null,
    version: 1,
    createdAt: new Date("2026-08-30T10:00:00.000Z"),
    organizationMaster: { id: "master-1", shortName: "CLIENT", fullName: "Demo Client" },
    createdBy: { id: "creator-1", name: "Creator" },
    foundBy: null,
    foundByName: null,
    costingSubmittedBy: null,
    costingApprovedBy: null,
    costingRejectedBy: null,
    ...overrides,
  };
}

function costingFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "costing-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    exchangeRate: new Prisma.Decimal("1"),
    estimatedValue: new Prisma.Decimal("1000"),
    estimatedCost: new Prisma.Decimal("0"),
    ourCost: new Prisma.Decimal("0"),
    marginPercent: new Prisma.Decimal("0"),
    freightCost: new Prisma.Decimal("0"),
    installationCost: new Prisma.Decimal("0"),
    otherCost: new Prisma.Decimal("0"),
    contingencyPercent: new Prisma.Decimal("0"),
    contingencyAmount: new Prisma.Decimal("0"),
    ...overrides,
  };
}

function setup() {
  const update = jest.fn();
  const tx = {
    organizationMaster: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({ id: "new-master" }) },
    tender: {
      update,
      create: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    tenderCosting: { upsert: jest.fn() },
    documentPurchaseRequest: { upsert: jest.fn() },
  };
  const prisma = {
    organizationMaster: { findFirst: jest.fn().mockResolvedValue({ id: "master-1" }) },
    organizationUser: {
      findFirst: jest.fn().mockResolvedValue({ id: "membership-1" }),
      findMany: jest.fn(),
    },
    tender: {
      findFirst: jest.fn(),
      update,
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const audit = { record: jest.fn() };
  const service = new TendersService(prisma as never, audit as never);
  return { service, prisma, tx, audit };
}

describe("TendersService costing intake workflow", () => {
  it("saves imported PA details, fees and meeting time with the tender in the same transaction", async () => {
    const { service, prisma, tx } = setup();
    prisma.tender.findFirst.mockResolvedValue(null);
    tx.tender.create.mockResolvedValue(tenderFixture({ documentFee: new Prisma.Decimal(2000) }));
    await service.create("org-1", "user-1", {
      egpTenderId: "123456", workName: "Equipment", noticeOrganization: "Port Authority",
      documentFee: 2000, estimatedTenderSecurityAmount: 50000,
      preBidEndDate: "2026-09-10T15:30:00+06:00", paName: "  Md Karim  ",
      paDesignation: "Engineer", paPhone: "01700123456", paAddress: "Port Road",
    });
    expect(tx.organizationMaster.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: "org-1" }),
    }));
    expect(tx.tender.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      organizationId: "org-1", organizationMasterId: "new-master", documentFee: 2000,
      estimatedTenderSecurityAmount: 50000, preBidEndDate: new Date("2026-09-10T09:30:00Z"),
      paName: "Md Karim", paPhone: "01700123456", paAddress: "Port Road",
    }) }));
  });

  it("reuses a tenant organization and explicitly clears optional notice values on edit", async () => {
    const { service, prisma, tx } = setup();
    prisma.tender.findFirst.mockResolvedValue(tenderFixture());
    tx.organizationMaster.findMany.mockResolvedValue([{ id: "master-1" }]);
    tx.tender.update.mockResolvedValue(tenderFixture());
    await service.update("org-1", "user-1", "tender-1", { noticeOrganization: "Client", paName: "", documentFee: null, preBidEndDate: null });
    expect(tx.organizationMaster.upsert).not.toHaveBeenCalled();
    expect(tx.tender.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      organizationMasterId: "master-1", paName: null, documentFee: null, preBidEndDate: null,
    }) }));
  });

  it("returns only active tenant users and the exact procurement whitelist", async () => {
    const { service, prisma } = setup();
    prisma.organizationUser.findMany.mockResolvedValue([
      { user: { id: "user-1", name: "A User" } },
    ]);
    await expect(service.options("org-1", "user-1")).resolves.toEqual({
      users: [{ id: "user-1", name: "A User" }],
      currentUserId: "user-1",
      procurementMethods: [
        "OTM",
        "RFQ",
        "LTM",
        "TSTM",
        "QCBS",
        "LCS",
        "SFB",
        "DC",
        "SBCQ",
        "SSS",
        "IC",
        "CSE",
        "DPM",
        "OSTETM",
        "RFQU",
        "RFQL",
      ],
    });
    expect(prisma.organizationUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", user: { isActive: true } } }),
    );
  });

  it("returns a friendly conflict with the Found By name for a duplicate normalized Tender ID", async () => {
    const { service, prisma } = setup();
    prisma.tender.findFirst.mockResolvedValue({
      id: "existing-1",
      egpTenderId: "tid  2026  1",
      tenderIdNormalized: "TID 2026 1",
      createdAt: new Date("2026-08-30T10:00:00.000Z"),
      workName: "Existing Work",
      createdBy: { id: "creator-1", name: "Creator Name", email: "creator@example.com" },
      foundBy: { id: "finder-1", name: "Finder Name", email: "finder@example.com" },
      foundByName: null,
      organizationMaster: {
        id: "master-1",
        shortName: "CLIENT",
        fullName: "Existing Client",
      },
    });

    let caught: unknown;
    try {
      await service.create("org-1", "user-1", {
        organizationMasterId: "master-1",
        egpTenderId: "  TID   2026  1 ",
        workName: "Work",
        category: "Supply",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toEqual({
      message: "Tender ID already exists",
      errors: {
        duplicateCode: ["DUPLICATE_TENDER_ID"],
        recordId: ["existing-1"],
        existingTenderId: ["TID 2026 1"],
        existingWorkName: ["Existing Work"],
        existingOrganizationId: ["master-1"],
        existingOrganizationShortName: ["CLIENT"],
        existingOrganizationFullName: ["Existing Client"],
        foundByName: ["Finder Name"],
        createdByName: ["Creator Name"],
        createdAt: ["2026-08-30T10:00:00.000Z"],
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("converts a concurrent normalized Tender ID P2002 into the same friendly conflict", async () => {
    const { service, prisma } = setup();
    const duplicate = {
      id: "existing-1",
      egpTenderId: "TID-1",
      tenderIdNormalized: "TID-1",
      workName: "Existing Work",
      createdAt: new Date("2026-08-30T10:00:00.000Z"),
      createdBy: { id: "creator-1", name: "Creator", email: "creator@example.com" },
      organizationMaster: { id: "master-1", shortName: "CLIENT", fullName: "Client" },
    };
    prisma.tender.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(duplicate);
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["organizationId", "tenderIdNormalized"] },
      }),
    );

    await expect(
      service.create("org-1", "user-1", {
        organizationMasterId: "master-1",
        egpTenderId: "tid-1",
        workName: "Work",
        category: "Supply",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.tender.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-1", tenderIdNormalized: "TID-1" }),
      }),
    );
  });

  it("requires a positive Pay Order amount and validates Search By as an active tenant member", async () => {
    const { service, prisma, tx } = setup();
    await expect(
      service.create("org-1", "user-1", {
        organizationMasterId: "master-1",
        egpTenderId: "TID-2",
        workName: "Work",
        category: "Supply",
        payOrderRequired: true,
      }),
    ).rejects.toThrow("Pay Order Amount must be greater than zero");

    prisma.tender.findFirst.mockResolvedValue(null);
    tx.tender.create.mockResolvedValue(tenderFixture({ foundByUserId: "finder-1" }));
    await service.create("org-1", "user-1", {
      organizationMasterId: "master-1",
      egpTenderId: "TID-3",
      workName: "Work",
      foundByUserId: " finder-1 ",
    });
    expect(prisma.organizationUser.findFirst).toHaveBeenCalledWith({
      where: { organizationId: "org-1", userId: "finder-1", user: { isActive: true } },
      select: { id: true },
    });
    expect(tx.tender.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ category: null }) }),
    );
  });

  it("creates a direct tender without an organization and stores a custom Found By name", async () => {
    const { service, prisma, tx } = setup();
    prisma.tender.findFirst.mockResolvedValue(null);
    tx.tender.create.mockResolvedValue(
      tenderFixture({
        organizationMasterId: null,
        organizationMaster: null,
        foundByUserId: null,
        foundByName: "External source",
      }),
    );

    await service.create("org-1", "user-1", {
      egpTenderId: "TID-4",
      workName: "Work",
      foundByName: " External source ",
    });

    expect(prisma.organizationMaster.findFirst).not.toHaveBeenCalled();
    expect(tx.tender.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationMasterId: null,
          foundByUserId: null,
          foundByName: "External source",
        }),
      }),
    );
  });

  it("excludes the current row from update duplicate checks and accepts a custom Search By", async () => {
    const { service, prisma } = setup();
    prisma.tender.findFirst.mockResolvedValueOnce(tenderFixture()).mockResolvedValueOnce(null);
    prisma.tender.update.mockResolvedValue(
      tenderFixture({
        tenderIdNormalized: "NEW-ID",
        egpTenderId: "new-id",
        foundByUserId: null,
        foundByName: "External source",
      }),
    );
    await service.update("org-1", "user-1", "tender-1", {
      egpTenderId: " new-id ",
      foundByUserId: "  ",
      foundByName: " External source ",
    });
    expect(prisma.tender.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          organizationId: "org-1",
          tenderIdNormalized: "NEW-ID",
          id: { not: "tender-1" },
        },
      }),
    );
    expect(prisma.tender.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          foundByUserId: null,
          foundByName: "External source",
          tenderIdNormalized: "NEW-ID",
        }),
      }),
    );
  });

  it("deletes an unused tenant-scoped tender before costing approval and records the audit", async () => {
    const { service, prisma, tx, audit } = setup();
    prisma.tender.findFirst.mockResolvedValue(
      tenderFixture({
        status: "DRAFT",
        createdById: "creator-1",
        costing: null,
        _count: {
          documentPurchases: 0,
          tenderSecurities: 0,
          creditCommitments: 0,
          performanceGuarantees: 0,
          receipts: 0,
          cmsWorks: 0,
          documents: 0,
          contracts: 0,
          workIous: 0,
        },
      }),
    );
    tx.tender.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.remove("org-1", "user-1", "tender-1")).resolves.toEqual({
      id: "tender-1",
    });
    expect(tx.tender.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "tender-1",
        organizationId: "org-1",
        costingApprovalStatus: { not: TenderCostingApprovalStatus.APPROVED },
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TENDER_DELETED", entityId: "tender-1" }),
      tx,
    );
  });

  it("allows deletion while costing approval is pending", async () => {
    const { service, prisma, tx } = setup();
    prisma.tender.findFirst.mockResolvedValue(
      tenderFixture({
        status: "DRAFT",
        costingApprovalStatus: TenderCostingApprovalStatus.PENDING_APPROVAL,
        costing: null,
        _count: {
          documentPurchases: 0,
          tenderSecurities: 0,
          creditCommitments: 0,
          performanceGuarantees: 0,
          receipts: 0,
          cmsWorks: 0,
          documents: 0,
          contracts: 0,
          workIous: 0,
        },
      }),
    );
    tx.tender.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.remove("org-1", "user-1", "tender-1")).resolves.toEqual({
      id: "tender-1",
    });
  });

  it("refuses to delete a tender after costing approval", async () => {
    const { service, prisma, tx } = setup();
    prisma.tender.findFirst.mockResolvedValue(
      tenderFixture({ costingApprovalStatus: TenderCostingApprovalStatus.APPROVED }),
    );

    await expect(service.remove("org-1", "user-1", "tender-1")).rejects.toThrow(
      "An approved tender cannot be deleted",
    );
    expect(tx.tender.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses to delete an unapproved tender with linked workflow records", async () => {
    const { service, prisma, tx } = setup();
    prisma.tender.findFirst.mockResolvedValue(
      tenderFixture({
        costing: null,
        _count: {
          documentPurchases: 1,
          tenderSecurities: 0,
          creditCommitments: 0,
          performanceGuarantees: 0,
          receipts: 0,
          cmsWorks: 0,
          documents: 0,
          contracts: 0,
          workIous: 0,
        },
      }),
    );

    await expect(service.remove("org-1", "user-1", "tender-1")).rejects.toThrow(
      "This tender has linked workflow records and cannot be deleted",
    );
    expect(tx.tender.deleteMany).not.toHaveBeenCalled();
  });

  it("fails closed if the tender becomes approved during deletion", async () => {
    const { service, prisma, tx, audit } = setup();
    prisma.tender.findFirst.mockResolvedValue(
      tenderFixture({
        costing: null,
        _count: {
          documentPurchases: 0,
          tenderSecurities: 0,
          creditCommitments: 0,
          performanceGuarantees: 0,
          receipts: 0,
          cmsWorks: 0,
          documents: 0,
          contracts: 0,
          workIous: 0,
        },
      }),
    );
    tx.tender.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove("org-1", "user-1", "tender-1")).rejects.toThrow(
      "An approved tender cannot be deleted",
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("uses versioned tenant-scoped CAS when submitting for costing approval", async () => {
    const { service, tx, audit } = setup();
    tx.tender.findFirst.mockResolvedValueOnce(tenderFixture()).mockResolvedValueOnce(
      tenderFixture({
        costingApprovalStatus: TenderCostingApprovalStatus.PENDING_APPROVAL,
        version: 2,
      }),
    );
    tx.tender.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.submitForCostingApproval("org-1", "user-1", "tender-1", { version: 1 }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "tender-1",
        costingApprovalStatus: TenderCostingApprovalStatus.PENDING_APPROVAL,
        version: 2,
      }),
    );
    expect(tx.tender.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "tender-1", organizationId: "org-1", version: 1 }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TENDER_SUBMITTED_FOR_COSTING_APPROVAL" }),
      tx,
    );
  });

  it("fails closed when the tender version changed during submit", async () => {
    const { service, tx, audit } = setup();
    tx.tender.findFirst.mockResolvedValueOnce(tenderFixture());
    tx.tender.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.submitForCostingApproval("org-1", "user-1", "tender-1", { version: 1 }),
    ).rejects.toThrow("Tender changed");
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("approves atomically and idempotently upserts one costing record", async () => {
    const { service, tx, audit } = setup();
    tx.tender.findFirst
      .mockResolvedValueOnce(
        tenderFixture({
          costingApprovalStatus: TenderCostingApprovalStatus.PENDING_APPROVAL,
        }),
      )
      .mockResolvedValueOnce(
        tenderFixture({
          costingApprovalStatus: TenderCostingApprovalStatus.APPROVED,
          costingApprovedAt: new Date("2026-08-30T11:00:00.000Z"),
          costingApprovedById: "approver-1",
          version: 2,
        }),
      );
    tx.tender.updateMany.mockResolvedValue({ count: 1 });
    tx.tenderCosting.upsert.mockResolvedValue(costingFixture());
    tx.documentPurchaseRequest.upsert.mockResolvedValue({ id: "request-1" });

    await expect(
      service.approveForCosting("org-1", "approver-1", "tender-1", { version: 1 }),
    ).resolves.toEqual({
      tender: expect.objectContaining({
        id: "tender-1",
        costingApprovalStatus: TenderCostingApprovalStatus.APPROVED,
      }),
      costing: expect.objectContaining({ id: "costing-1", estimatedValue: "1000.00" }),
    });
    expect(tx.tenderCosting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_tenderId: { organizationId: "org-1", tenderId: "tender-1" },
        },
      }),
    );
    expect(tx.documentPurchaseRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_tenderId: { organizationId: "org-1", tenderId: "tender-1" },
        },
        create: expect.objectContaining({ costingId: "costing-1", requestedById: "approver-1" }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TENDER_APPROVED_FOR_COSTING" }),
      tx,
    );
  });

  it("does not change or re-audit an already approved tender", async () => {
    const { service, tx, audit } = setup();
    tx.tender.findFirst.mockResolvedValue(
      tenderFixture({
        costingApprovalStatus: TenderCostingApprovalStatus.APPROVED,
        costingApprovedAt: new Date("2026-08-30T11:00:00.000Z"),
        costingApprovedById: "approver-1",
        version: 2,
      }),
    );
    tx.tenderCosting.upsert.mockResolvedValue(costingFixture());
    tx.documentPurchaseRequest.upsert.mockResolvedValue({ id: "request-1" });
    await service.approveForCosting("org-1", "approver-1", "tender-1", { version: 1 });
    expect(tx.tender.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(tx.tenderCosting.upsert).toHaveBeenCalledTimes(1);
    expect(tx.documentPurchaseRequest.upsert).toHaveBeenCalledTimes(1);
  });
});
