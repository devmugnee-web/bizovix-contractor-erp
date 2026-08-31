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
  const tx = {
    tender: {
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    tenderCosting: { upsert: jest.fn() },
  };
  const prisma = {
    organizationMaster: { findFirst: jest.fn().mockResolvedValue({ id: "master-1" }) },
    organizationUser: {
      findFirst: jest.fn().mockResolvedValue({ id: "membership-1" }),
      findMany: jest.fn(),
    },
    tender: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const audit = { record: jest.fn() };
  const service = new TendersService(prisma as never, audit as never);
  return { service, prisma, tx, audit };
}

describe("TendersService costing intake workflow", () => {
  it("returns only active tenant users and the exact procurement whitelist", async () => {
    const { service, prisma } = setup();
    prisma.organizationUser.findMany.mockResolvedValue([
      { user: { id: "user-1", name: "A User" } },
    ]);
    await expect(service.options("org-1")).resolves.toEqual({
      users: [{ id: "user-1", name: "A User" }],
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

  it("deletes only an unused tenant-scoped draft tender and records the audit", async () => {
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
    tx.tender.delete.mockResolvedValue({ id: "tender-1" });

    await expect(service.remove("org-1", "user-1", "tender-1")).resolves.toEqual({
      id: "tender-1",
    });
    expect(tx.tender.delete).toHaveBeenCalledWith({
      where: { organizationId_id: { organizationId: "org-1", id: "tender-1" } },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TENDER_DELETED", entityId: "tender-1" }),
      tx,
    );
  });

  it("refuses to delete a tender that has already entered the workflow", async () => {
    const { service, prisma, tx } = setup();
    prisma.tender.findFirst.mockResolvedValue(tenderFixture({ status: "ONGOING" }));

    await expect(service.remove("org-1", "user-1", "tender-1")).rejects.toThrow(
      "Only an unused draft tender can be deleted",
    );
    expect(tx.tender.delete).not.toHaveBeenCalled();
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
    await service.approveForCosting("org-1", "approver-1", "tender-1", { version: 1 });
    expect(tx.tender.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(tx.tenderCosting.upsert).toHaveBeenCalledTimes(1);
  });
});
