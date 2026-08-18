import { BadRequestException, INestApplication, NotFoundException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { validationExceptionFactory } from "../src/common/utils/validation-exception-factory";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { PartiesService } from "../src/modules/parties/parties.service";
import { ItemsService } from "../src/modules/items/items.service";
import { UomsService } from "../src/modules/uoms/uoms.service";
import { PaymentTermsService } from "../src/modules/payment-terms/payment-terms.service";
import { DocumentsService } from "../src/modules/documents/documents.service";
import { AccountingService } from "../src/modules/accounting/accounting.service";
import { createOrganizationFixture, resetTestDatabase } from "./fixtures";

describe("P0 Masters (Vendor/Supplier/Subcontractor/Item) PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let parties: PartiesService;
  let items: ItemsService;
  let uoms: UomsService;
  let paymentTerms: PaymentTermsService;
  let documents: DocumentsService;
  let accounting: AccountingService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory }));
    await app.init();
    prisma = app.get(PrismaService);
    parties = app.get(PartiesService);
    items = app.get(ItemsService);
    uoms = app.get(UomsService);
    paymentTerms = app.get(PaymentTermsService);
    documents = app.get(DocumentsService);
    accounting = app.get(AccountingService);
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => { await resetTestDatabase(prisma); await app.close(); });

  async function token(email: string, password: string) {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password }).expect(201);
    return response.body.data.accessToken as string;
  }
  const auth = (value: string) => ({ Authorization: `Bearer ${value}` });

  // A. Vendor create/read/update
  it("creates, reads and updates a vendor", async () => {
    const f = await createOrganizationFixture(prisma, "MASTA");
    const created = await parties.create(f.organization.id, f.user.id, { name: "Test Vendor Co", roles: ["VENDOR"], phone: "0170000000" });
    expect(created.code).toMatch(/^VEN-/);
    expect(created.status).toBe("ACTIVE");

    const fetched = await parties.findOne(f.organization.id, created.id);
    expect(fetched.name).toBe("Test Vendor Co");
    expect(fetched.linked.payables).toEqual([]);

    const updated = await parties.update(f.organization.id, f.user.id, created.id, { name: "Test Vendor Co (Renamed)", phone: "0170000001" });
    expect(updated.name).toBe("Test Vendor Co (Renamed)");
    expect(updated.phone).toBe("0170000001");
    expect(await prisma.auditLog.count({ where: { organizationId: f.organization.id, entityId: created.id, action: "VENDOR_CREATED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { organizationId: f.organization.id, entityId: created.id, action: "VENDOR_UPDATED" } })).toBe(1);
  });

  // B. Vendor code unique per tenant / C. same code allowed in a different tenant
  it("enforces vendor code uniqueness per tenant but allows the same code across tenants", async () => {
    const a = await createOrganizationFixture(prisma, "MASTB1");
    const b = await createOrganizationFixture(prisma, "MASTB2");

    await parties.create(a.organization.id, a.user.id, { code: "VEN-9999", name: "Vendor One", roles: ["VENDOR"] });
    await expect(parties.create(a.organization.id, a.user.id, { code: "VEN-9999", name: "Vendor Duplicate", roles: ["VENDOR"] })).rejects.toBeInstanceOf(BadRequestException);

    // Same manual code in a different tenant must succeed — uniqueness is scoped by organizationId.
    const crossTenant = await parties.create(b.organization.id, b.user.id, { code: "VEN-9999", name: "Vendor In Org B", roles: ["VENDOR"] });
    expect(crossTenant.code).toBe("VEN-9999");
  });

  // D. Cross-tenant vendor read blocked / E. Cross-tenant vendor mutation blocked
  it("blocks cross-tenant vendor read and mutation over HTTP without leaking IDs", async () => {
    const a = await createOrganizationFixture(prisma, "MASTD1");
    const b = await createOrganizationFixture(prisma, "MASTD2");
    const vendorB = await parties.create(b.organization.id, b.user.id, { name: "Org B Vendor", roles: ["VENDOR"] });
    const access = await token(a.user.email, a.password);

    const getResponse = await request(app.getHttpServer()).get(`/api/v1/parties/${vendorB.id}`).set(auth(access)).expect(404);
    expect(JSON.stringify(getResponse.body)).not.toContain(b.organization.id);

    await request(app.getHttpServer()).patch(`/api/v1/parties/${vendorB.id}`).set(auth(access)).send({ name: "Hijacked" }).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/parties/${vendorB.id}/status`).set(auth(access)).send({ status: "ARCHIVED" }).expect(404);

    expect((await prisma.party.findUniqueOrThrow({ where: { id: vendorB.id } })).name).toBe("Org B Vendor");
  });

  // F. Subcontractor create/update
  it("creates and updates a subcontractor with its extension profile", async () => {
    const f = await createOrganizationFixture(prisma, "MASTF");
    const created = await parties.create(f.organization.id, f.user.id, {
      name: "Test Subcontractor",
      roles: ["SUBCONTRACTOR"],
      subcontractor: { specialization: "Electrical", defaultRetentionPct: 5 },
    });
    expect(created.code).toMatch(/^SUB-/);
    expect(created.subcontractorProfile?.specialization).toBe("Electrical");
    expect(created.subcontractorProfile?.defaultRetentionPct).toBe("5.00");

    const updated = await parties.update(f.organization.id, f.user.id, created.id, { subcontractor: { specialization: "Electrical & Mechanical", performanceRating: 4.5 } });
    expect(updated.subcontractorProfile?.specialization).toBe("Electrical & Mechanical");
    expect(updated.subcontractorProfile?.performanceRating).toBe("4.50");
    expect(await prisma.auditLog.count({ where: { organizationId: f.organization.id, entityId: created.id, action: "SUBCONTRACTOR_CREATED" } })).toBe(1);
  });

  // G. Item create / H. Item code uniqueness
  it("creates items and enforces item code uniqueness per tenant", async () => {
    const f = await createOrganizationFixture(prisma, "MASTG");
    const uom = await uoms.create(f.organization.id, f.user.id, { code: "PCS", name: "Pieces" });
    const created = await items.create(f.organization.id, f.user.id, { itemCode: "ITM-9001", itemName: "Test Material", uomId: uom.id });
    expect(created.itemCode).toBe("ITM-9001");

    await expect(items.create(f.organization.id, f.user.id, { itemCode: "ITM-9001", itemName: "Duplicate Item" })).rejects.toBeInstanceOf(BadRequestException);

    const autoNumbered = await items.create(f.organization.id, f.user.id, { itemName: "Auto Numbered Item" });
    expect(autoNumbered.itemCode).toMatch(/^ITM-/);
  });

  // I. UOM validation
  it("validates UOM code uniqueness per tenant", async () => {
    const f = await createOrganizationFixture(prisma, "MASTI");
    await uoms.create(f.organization.id, f.user.id, { code: "KG", name: "Kilogram" });
    await expect(uoms.create(f.organization.id, f.user.id, { code: "kg", name: "Kilogram Duplicate" })).rejects.toBeInstanceOf(BadRequestException);
  });

  // J. Payment Term validation
  it("validates payment term name uniqueness per tenant", async () => {
    const f = await createOrganizationFixture(prisma, "MASTJ");
    await paymentTerms.create(f.organization.id, f.user.id, { name: "30 Days", days: 30 });
    await expect(paymentTerms.create(f.organization.id, f.user.id, { name: "30 Days", days: 30 })).rejects.toBeInstanceOf(BadRequestException);
  });

  // K. Vendor Document link tenant-safe
  it("rejects a document linked to a cross-tenant vendor without leaking IDs", async () => {
    const a = await createOrganizationFixture(prisma, "MASTK1");
    const b = await createOrganizationFixture(prisma, "MASTK2");
    const vendorB = await parties.create(b.organization.id, b.user.id, { name: "Org B Vendor For Docs", roles: ["VENDOR"] });
    const access = await token(a.user.email, a.password);

    const response = await request(app.getHttpServer()).post("/api/v1/documents").set(auth(access)).field("name", "Attack document").field("partyId", vendorB.id).expect(404);
    expect(JSON.stringify(response.body)).not.toContain(b.organization.id);
    expect(await prisma.document.count()).toBe(0);
  });

  // L. Payable linked to Vendor remains tenant-safe
  it("rejects a payable linked to a cross-tenant vendor", async () => {
    const a = await createOrganizationFixture(prisma, "MASTL1");
    const b = await createOrganizationFixture(prisma, "MASTL2");
    const vendorB = await parties.create(b.organization.id, b.user.id, { name: "Org B Vendor For Payables", roles: ["VENDOR"] });

    await expect(
      accounting.createPayable(a.organization.id, a.user.id, { partyId: vendorB.id, partyName: "Attack", billNo: "ATK-1", billDate: "2026-02-01", amount: 100 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.payable.count()).toBe(0);
  });

  // M. Archived Vendor cannot be used for new future transaction linkage — but historical
  // linkage set before archiving must keep working for unrelated edits.
  it("blocks new linkage of an archived vendor while preserving historical linkage", async () => {
    const f = await createOrganizationFixture(prisma, "MASTM");
    const vendor = await parties.create(f.organization.id, f.user.id, { name: "Soon Archived Vendor", roles: ["VENDOR"] });

    // Link while still active — must succeed.
    const doc = await documents.create(f.organization.id, f.user.id, f.user.name, { name: "Trade License", partyId: vendor.id });
    await accounting.createPayable(f.organization.id, f.user.id, { partyId: vendor.id, partyName: vendor.name, billNo: "PRE-ARCHIVE-1", billDate: "2026-02-01", amount: 1000 });

    await parties.changeStatus(f.organization.id, f.user.id, vendor.id, { status: "ARCHIVED" });

    // New linkage after archiving must be rejected.
    await expect(
      accounting.createPayable(f.organization.id, f.user.id, { partyId: vendor.id, partyName: vendor.name, billNo: "POST-ARCHIVE-1", billDate: "2026-02-02", amount: 1000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(documents.create(f.organization.id, f.user.id, f.user.name, { name: "New Doc", partyId: vendor.id })).rejects.toBeInstanceOf(BadRequestException);

    // An unrelated edit to the document created BEFORE archiving must not be blocked by the
    // now-archived, already-linked party.
    const untouched = await documents.update(f.organization.id, f.user.id, doc.id, { description: "Renewed note" });
    expect(untouched.description).toBe("Renewed note");
    expect(untouched.partyId).toBe(vendor.id);
  });

  // N. Master records cannot be hard-deleted through the application
  it("exposes no delete route for parties or items even when referenced", async () => {
    const f = await createOrganizationFixture(prisma, "MASTN");
    const vendor = await parties.create(f.organization.id, f.user.id, { name: "Undeletable Vendor", roles: ["VENDOR"] });
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Undeletable Item" });
    const access = await token(f.user.email, f.password);

    await request(app.getHttpServer()).delete(`/api/v1/parties/${vendor.id}`).set(auth(access)).expect(404);
    await request(app.getHttpServer()).delete(`/api/v1/items/${item.id}`).set(auth(access)).expect(404);

    expect(await prisma.party.count({ where: { id: vendor.id } })).toBe(1);
    expect(await prisma.item.count({ where: { id: item.id } })).toBe(1);
  });

  // O. Viewer cannot mutate masters
  it("blocks a read-only viewer from mutating vendors, subcontractors or items over HTTP", async () => {
    const viewer = await createOrganizationFixture(prisma, "MASTO", ["vendor.read", "subcontractor.read", "item.read", "masters.read"]);
    const access = await token(viewer.user.email, viewer.password);

    await request(app.getHttpServer()).post("/api/v1/parties").set(auth(access)).send({ name: "Should Fail", roles: ["VENDOR"] }).expect(403);
    await request(app.getHttpServer()).post("/api/v1/items").set(auth(access)).send({ itemName: "Should Fail" }).expect(403);
    await request(app.getHttpServer()).post("/api/v1/uoms").set(auth(access)).send({ code: "XX", name: "Should Fail" }).expect(403);
    await request(app.getHttpServer()).post("/api/v1/payment-terms").set(auth(access)).send({ name: "Should Fail" }).expect(403);

    expect(await prisma.party.count({ where: { organizationId: viewer.organization.id } })).toBe(0);
    expect(await prisma.item.count({ where: { organizationId: viewer.organization.id } })).toBe(0);
  });
});
