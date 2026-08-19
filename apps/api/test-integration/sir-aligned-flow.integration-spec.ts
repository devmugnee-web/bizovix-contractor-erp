import { BadRequestException, INestApplication, NotFoundException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PurchaseType } from "@bizovix/database";
import { AppModule } from "../src/app.module";
import { validationExceptionFactory } from "../src/common/utils/validation-exception-factory";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { DocumentPurchasesService } from "../src/modules/document-purchases/document-purchases.service";
import { TendersService } from "../src/modules/tenders/tenders.service";
import { CmsWorksService } from "../src/modules/cms-works/cms-works.service";
import { createOrganizationFixture, resetTestDatabase } from "./fixtures";

/**
 * Sir-aligned simplification phase: Bank Instruments is the pre-award entry point, and awarding a
 * tender must hand off cleanly into CMS without ever requiring the same tender to be entered
 * twice. These scenarios cover the two behaviors that changed this phase: Document Purchase
 * auto-creating/reusing the internal Tender record, and the explicit Award -> CMS handoff on
 * CmsWorksService.create().
 */
describe("Sir-aligned ERP flow: Bank Instruments -> Award -> CMS handoff PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let documentPurchases: DocumentPurchasesService;
  let tenders: TendersService;
  let cmsWorks: CmsWorksService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    documentPurchases = app.get(DocumentPurchasesService);
    tenders = app.get(TendersService);
    cmsWorks = app.get(CmsWorksService);
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => {
    await resetTestDatabase(prisma);
    await app.close();
  });

  // A. Document Purchase without an explicit link auto-creates the internal Tender
  it("auto-creates the internal Tender when a Document Purchase is recorded without linking to an existing one", async () => {
    const f = await createOrganizationFixture(prisma, "SIRA");

    const purchase = await documentPurchases.create(f.organization.id, f.user.id, {
      purchaseType: PurchaseType.MANUAL,
      organizationMasterId: f.master.id,
      tenderWorkName: "New Culvert Construction",
      purchaseDate: "2026-03-01",
      documentPrice: 5000,
      paymentFromAccountId: f.bank.id,
      category: "Civil",
      estimatedTenderAmount: 2_000_000,
      submissionDate: "2026-03-20",
      openingDate: "2026-03-25",
      remarks: "Auto tender test",
    });

    const createdTender = await prisma.tender.findFirst({
      where: { organizationId: f.organization.id, workName: "New Culvert Construction" },
    });
    expect(createdTender).not.toBeNull();
    expect(createdTender!.status).toBe("DOCUMENT_PURCHASED");
    expect(createdTender!.category).toBe("Civil");
    expect(Number(createdTender!.contractValue)).toBe(2_000_000);
    expect(createdTender!.organizationMasterId).toBe(f.master.id);
    expect(createdTender!.submissionDeadline?.toISOString().slice(0, 10)).toBe("2026-03-20");

    const stored = await prisma.documentPurchase.findFirst({ where: { organizationId: f.organization.id, id: purchase.id } });
    expect(stored!.linkedTenderId).toBe(createdTender!.id);
    expect(stored!.category).toBe("Civil");
  });

  // B. Document Purchase explicitly linked to an existing Tender must not create a duplicate
  it("does not create a duplicate Tender when a Document Purchase explicitly links to an existing one", async () => {
    const f = await createOrganizationFixture(prisma, "SIRB");
    const before = await prisma.tender.count({ where: { organizationId: f.organization.id } });

    await documentPurchases.create(f.organization.id, f.user.id, {
      purchaseType: PurchaseType.MANUAL,
      linkedTenderId: f.tender.id,
      organizationMasterId: f.master.id,
      tenderWorkName: f.tender.workName,
      purchaseDate: "2026-03-01",
      documentPrice: 3000,
      paymentFromAccountId: f.bank.id,
    });

    const after = await prisma.tender.count({ where: { organizationId: f.organization.id } });
    expect(after).toBe(before);
  });

  // C. Award -> CMS handoff: real FK lineage carried forward, tender advances, no duplicate work
  it("creates an Ongoing Work from an awarded Tender, carries forward FK lineage, advances the tender, and blocks a duplicate work", async () => {
    const f = await createOrganizationFixture(prisma, "SIRC");
    const tender = await prisma.tender.create({
      data: {
        organizationId: f.organization.id,
        organizationMasterId: f.master.id,
        workName: "Fresh Awarded Tender",
        category: "Civil",
        contractValue: 5_000_000,
        status: "AWARDED",
        createdById: f.user.id,
      },
    });
    const purchase = await prisma.documentPurchase.create({
      data: {
        organizationId: f.organization.id,
        purchaseType: "MANUAL",
        linkedTenderId: tender.id,
        organizationMasterId: f.master.id,
        paymentFromAccountId: f.bank.id,
        tenderWorkName: tender.workName,
        purchaseDate: new Date("2026-01-05"),
        documentPrice: 2000,
        createdById: f.user.id,
      },
    });

    const work = await cmsWorks.create(f.organization.id, f.user.id, {
      organizationMasterId: f.master.id,
      workName: tender.workName,
      workCategory: "Civil",
      contractValue: 5_000_000,
      tenderId: tender.id,
    });

    const stored = await prisma.cmsWork.findUnique({ where: { id: work.id } });
    expect(stored!.tenderId).toBe(tender.id);
    expect(stored!.documentPurchaseId).toBe(purchase.id);

    const updatedTender = await prisma.tender.findUnique({ where: { id: tender.id } });
    expect(updatedTender!.status).toBe("ONGOING");
    expect(updatedTender!.awardedAt).not.toBeNull();

    await expect(
      cmsWorks.create(f.organization.id, f.user.id, {
        organizationMasterId: f.master.id,
        workName: "Duplicate attempt",
        workCategory: "Civil",
        contractValue: 1,
        tenderId: tender.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // D. Lost tender: no CMS work is ever created, history is preserved
  it("does not create any CMS work when a tender is marked not-awarded, and preserves the historical record", async () => {
    const f = await createOrganizationFixture(prisma, "SIRD");
    const tender = await prisma.tender.create({
      data: {
        organizationId: f.organization.id,
        organizationMasterId: f.master.id,
        workName: "Lost Tender",
        category: "Civil",
        contractValue: 1_000_000,
        status: "SUBMITTED",
        submittedAt: new Date(),
        createdById: f.user.id,
      },
    });

    const result = await tenders.recordOpening(f.organization.id, f.user.id, tender.id, {
      openingDate: "2026-03-10",
      status: "REJECTED",
      openingResult: "2nd Lowest",
    });
    expect(result.status).toBe("REJECTED");

    const works = await prisma.cmsWork.count({ where: { organizationId: f.organization.id, tenderId: tender.id } });
    expect(works).toBe(0);

    const stillReadable = await prisma.tender.findUnique({ where: { id: tender.id } });
    expect(stillReadable).not.toBeNull();
    expect(stillReadable!.status).toBe("REJECTED");
  });

  // E. Tenant isolation on the Award -> CMS handoff
  it("rejects creating an Ongoing Work from a Tender belonging to a different tenant", async () => {
    const a = await createOrganizationFixture(prisma, "SIRE1");
    const b = await createOrganizationFixture(prisma, "SIRE2");

    await expect(
      cmsWorks.create(a.organization.id, a.user.id, {
        organizationMasterId: a.master.id,
        workName: "Cross-tenant",
        workCategory: "Civil",
        contractValue: 1,
        tenderId: b.tender.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
