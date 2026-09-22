import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { validationExceptionFactory } from "../src/common/utils/validation-exception-factory";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { createIdentityFixture, resetTestDatabase } from "./fixtures";

describe("Sales quotations lifecycle over HTTP", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => {
    await resetTestDatabase(prisma);
    await app.close();
  });

  async function auth(email: string, password: string) {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(201);
    return { Authorization: `Bearer ${login.body.data.accessToken as string}` };
  }

  async function createQuotation(
    authorization: { Authorization: string },
    customerId: string,
    workName: string,
  ) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/sales-quotations")
      .set(authorization)
      .send({
        customerId,
        workName,
        quotationDate: new Date().toISOString().slice(0, 10),
        validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
        currency: "bdt",
      })
      .expect(201);
    return response.body.data as {
      id: string;
      version: number;
      status: string;
      quotationNo: string;
    };
  }

  async function saveCosting(
    authorization: { Authorization: string },
    id: string,
    expectedVersion: number,
  ) {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/sales-quotations/${id}/costing`)
      .set(authorization)
      .send({
        expectedVersion,
        items: [
          {
            description: "Civil work",
            quantity: "2",
            unit: "LS",
            unitCost: "100",
            taxPct: "10",
            unitPrice: "150",
          },
        ],
        overheads: [{ description: "Supervision", amount: "20" }],
        vatApplicable: true,
        vatRate: "15",
      })
      .expect(200);
    return response.body.data as {
      id: string;
      version: number;
      status: string;
      grandTotal: string;
    };
  }

  async function sendQuotation(
    authorization: { Authorization: string },
    id: string,
    expectedVersion: number,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/sales-quotations/${id}/send`)
      .set(authorization)
      .send({ expectedVersion })
      .expect(201);
    return response.body.data as { id: string; version: number; status: string; sentAt: string };
  }

  it("isolates tenants and applies compare-and-swap updates without stale writes", async () => {
    const owner = await createIdentityFixture(prisma, "SQ-TENANT-A");
    const outsider = await createIdentityFixture(prisma, "SQ-TENANT-B");
    const ownerAuth = await auth(owner.user.email, owner.password);
    const outsiderAuth = await auth(outsider.user.email, outsider.password);

    await request(app.getHttpServer())
      .post("/api/v1/sales-quotations")
      .set(ownerAuth)
      .send({
        customerId: outsider.master.id,
        workName: "Cross-tenant customer",
        quotationDate: "2026-08-01",
        validUntil: "2026-09-01",
      })
      .expect(404);

    const created = await createQuotation(ownerAuth, owner.master.id, "Tenant-safe quotation");
    expect(created.version).toBe(1);
    await request(app.getHttpServer())
      .get(`/api/v1/sales-quotations/${created.id}`)
      .set(outsiderAuth)
      .expect(404);
    const outsiderList = await request(app.getHttpServer())
      .get("/api/v1/sales-quotations")
      .set(outsiderAuth)
      .expect(200);
    expect(outsiderList.body.data).toHaveLength(0);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/sales-quotations/${created.id}`)
      .set(ownerAuth)
      .send({ expectedVersion: 1, workName: "Updated once" })
      .expect(200);
    expect(updated.body.data.version).toBe(2);

    await request(app.getHttpServer())
      .patch(`/api/v1/sales-quotations/${created.id}`)
      .set(ownerAuth)
      .send({ expectedVersion: 1, workName: "Stale overwrite" })
      .expect(409);
    const stored = await prisma.salesQuotation.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.workName).toBe("Updated once");
    expect(stored.organizationId).toBe(owner.organization.id);
  });

  it("calculates costing authoritatively, replaces child rows atomically, and preserves them after a stale rollback", async () => {
    const fixture = await createIdentityFixture(prisma, "SQ-COST");
    const authorization = await auth(fixture.user.email, fixture.password);
    const created = await createQuotation(authorization, fixture.master.id, "Costing lifecycle");

    const first = await request(app.getHttpServer())
      .put(`/api/v1/sales-quotations/${created.id}/costing`)
      .set(authorization)
      .send({
        expectedVersion: 1,
        items: [
          {
            description: "Item A",
            quantity: "2",
            unit: "Nos",
            unitCost: "100",
            taxPct: "10",
            unitPrice: "150",
          },
          {
            description: "Item B",
            quantity: "1",
            unit: "LS",
            unitCost: "50",
            taxPct: "0",
            unitPrice: "80",
          },
        ],
        overheads: [{ description: "Transport", amount: "20" }],
        vatApplicable: true,
        vatRate: "15",
      })
      .expect(200);
    expect(first.body.data).toMatchObject({
      version: 2,
      totalCost: "250.00",
      itemTaxTotal: "20.00",
      totalSelling: "380.00",
      overheadTotal: "20.00",
      subtotalBeforeVat: "420.00",
      vatAmount: "63.00",
      grandTotal: "483.00",
    });

    const replacement = await request(app.getHttpServer())
      .put(`/api/v1/sales-quotations/${created.id}/costing`)
      .set(authorization)
      .send({
        expectedVersion: 2,
        items: [
          {
            description: "Replacement",
            quantity: "1",
            unit: "LS",
            unitCost: "10",
            taxPct: "5",
            unitPrice: "20",
          },
        ],
        overheads: [],
        vatApplicable: false,
        vatRate: "15",
      })
      .expect(200);
    expect(replacement.body.data).toMatchObject({
      version: 3,
      totalCost: "10.00",
      itemTaxTotal: "0.50",
      totalSelling: "20.00",
      overheadTotal: "0.00",
      vatAmount: "0.00",
      grandTotal: "20.50",
    });
    expect(await prisma.salesQuotationItem.count({ where: { quotationId: created.id } })).toBe(1);
    expect(await prisma.salesQuotationOverhead.count({ where: { quotationId: created.id } })).toBe(
      0,
    );

    await request(app.getHttpServer())
      .put(`/api/v1/sales-quotations/${created.id}/costing`)
      .set(authorization)
      .send({
        expectedVersion: 2,
        items: [
          {
            description: "Must roll back",
            quantity: "9",
            unit: "LS",
            unitCost: "9",
            unitPrice: "9",
          },
        ],
      })
      .expect(409);
    const rows = await prisma.salesQuotationItem.findMany({ where: { quotationId: created.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.description).toBe("Replacement");
  });

  it("enforces send preconditions and makes SENT quotations immutable to draft edits", async () => {
    const fixture = await createIdentityFixture(prisma, "SQ-SEND");
    const authorization = await auth(fixture.user.email, fixture.password);
    const empty = await createQuotation(authorization, fixture.master.id, "Empty quotation");
    await request(app.getHttpServer())
      .post(`/api/v1/sales-quotations/${empty.id}/send`)
      .set(authorization)
      .send({ expectedVersion: 1 })
      .expect(400);

    const costed = await saveCosting(authorization, empty.id, 1);
    const sent = await sendQuotation(authorization, empty.id, costed.version);
    expect(sent.status).toBe("SENT");
    expect(sent.version).toBe(3);
    expect(sent.sentAt).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/api/v1/sales-quotations/${empty.id}/send`)
      .set(authorization)
      .send({ expectedVersion: sent.version })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/v1/sales-quotations/${empty.id}`)
      .set(authorization)
      .send({ expectedVersion: sent.version, workName: "Forbidden edit" })
      .expect(409);
    await request(app.getHttpServer())
      .put(`/api/v1/sales-quotations/${empty.id}/costing`)
      .set(authorization)
      .send({
        expectedVersion: sent.version,
        items: [
          {
            description: "Forbidden costing",
            quantity: "1",
            unit: "LS",
            unitCost: "1",
            unitPrice: "2",
          },
        ],
      })
      .expect(409);
  });

  it("validates accepted and rejected results, keeps decisions terminal, and creates no project or accounting records", async () => {
    const fixture = await createIdentityFixture(prisma, "SQ-RESULT");
    const authorization = await auth(fixture.user.email, fixture.password);
    const before = {
      works: await prisma.cmsWork.count({ where: { organizationId: fixture.organization.id } }),
      contracts: await prisma.projectContract.count({
        where: { organizationId: fixture.organization.id },
      }),
      journals: await prisma.journalEntry.count({
        where: { organizationId: fixture.organization.id },
      }),
      transactions: await prisma.financialTransaction.count({
        where: { organizationId: fixture.organization.id },
      }),
    };

    const acceptedDraft = await createQuotation(
      authorization,
      fixture.master.id,
      "Accepted quotation",
    );
    const acceptedCost = await saveCosting(authorization, acceptedDraft.id, acceptedDraft.version);
    const acceptedSent = await sendQuotation(authorization, acceptedDraft.id, acceptedCost.version);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-quotations/${acceptedDraft.id}/result`)
      .set(authorization)
      .send({
        expectedVersion: acceptedSent.version,
        decision: "ACCEPTED",
        decisionDate: new Date().toISOString(),
      })
      .expect(400);
    const accepted = await request(app.getHttpServer())
      .post(`/api/v1/sales-quotations/${acceptedDraft.id}/result`)
      .set(authorization)
      .send({
        expectedVersion: acceptedSent.version,
        decision: "ACCEPTED",
        decisionDate: new Date().toISOString(),
        acceptedAmount: "320.00",
        customerPoWoNo: "PO-RESULT-1",
      })
      .expect(201);
    expect(accepted.body.data).toMatchObject({
      status: "ACCEPTED",
      decision: "ACCEPTED",
      acceptedAmount: "320.00",
      customerPoWoNo: "PO-RESULT-1",
    });
    expect(accepted.body.data.decisionBy.id).toBe(fixture.user.id);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-quotations/${acceptedDraft.id}/follow-ups`)
      .set(authorization)
      .send({
        expectedVersion: accepted.body.data.version,
        followedUpAt: new Date().toISOString(),
        notes: "Terminal follow-up must reject",
      })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-quotations/${acceptedDraft.id}/result`)
      .set(authorization)
      .send({
        expectedVersion: accepted.body.data.version,
        decision: "REJECTED",
        decisionDate: new Date().toISOString(),
        rejectionReason: "Cannot change terminal result",
      })
      .expect(409);

    const rejectedDraft = await createQuotation(
      authorization,
      fixture.master.id,
      "Rejected quotation",
    );
    const rejectedCost = await saveCosting(authorization, rejectedDraft.id, rejectedDraft.version);
    const rejectedSent = await sendQuotation(authorization, rejectedDraft.id, rejectedCost.version);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-quotations/${rejectedDraft.id}/result`)
      .set(authorization)
      .send({
        expectedVersion: rejectedSent.version,
        decision: "REJECTED",
        decisionDate: new Date().toISOString(),
      })
      .expect(400);
    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/sales-quotations/${rejectedDraft.id}/result`)
      .set(authorization)
      .send({
        expectedVersion: rejectedSent.version,
        decision: "REJECTED",
        decisionDate: new Date().toISOString(),
        rejectionReason: "Budget constraint",
      })
      .expect(201);
    expect(rejected.body.data).toMatchObject({
      status: "REJECTED",
      decision: "REJECTED",
      rejectionReason: "Budget constraint",
      acceptedAmount: null,
      customerPoWoNo: null,
    });

    expect(await prisma.cmsWork.count({ where: { organizationId: fixture.organization.id } })).toBe(
      before.works,
    );
    expect(
      await prisma.projectContract.count({ where: { organizationId: fixture.organization.id } }),
    ).toBe(before.contracts);
    expect(
      await prisma.journalEntry.count({ where: { organizationId: fixture.organization.id } }),
    ).toBe(before.journals);
    expect(
      await prisma.financialTransaction.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(before.transactions);
  });

  it("allows follow-ups only while SENT and exposes tenant-filtered pending, summary, options and safe exports", async () => {
    const fixture = await createIdentityFixture(prisma, "SQ-QUERY");
    const authorization = await auth(fixture.user.email, fixture.password);
    const draft = await createQuotation(authorization, fixture.master.id, "Draft result");
    await request(app.getHttpServer())
      .post(`/api/v1/sales-quotations/${draft.id}/follow-ups`)
      .set(authorization)
      .send({
        expectedVersion: draft.version,
        followedUpAt: new Date().toISOString(),
        notes: "Draft must reject",
      })
      .expect(409);

    const sentDraft = await createQuotation(authorization, fixture.master.id, "=2+3");
    const sentCost = await saveCosting(authorization, sentDraft.id, sentDraft.version);
    const sent = await sendQuotation(authorization, sentDraft.id, sentCost.version);
    const followedUpAt = new Date(Date.now() + 60_000).toISOString();
    const nextFollowUpAt = new Date(Date.now() + 86_400_000).toISOString();
    const followUp = await request(app.getHttpServer())
      .post(`/api/v1/sales-quotations/${sent.id}/follow-ups`)
      .set(authorization)
      .send({
        expectedVersion: sent.version,
        followedUpAt,
        nextFollowUpAt,
        notes: "Customer requested a callback",
      })
      .expect(201);
    expect(followUp.body.data.createdBy.id).toBe(fixture.user.id);
    expect(followUp.body.data.notes).toBe("Customer requested a callback");
    await request(app.getHttpServer())
      .post(`/api/v1/sales-quotations/${sent.id}/follow-ups`)
      .set(authorization)
      .send({
        expectedVersion: sent.version,
        followedUpAt,
        notes: "Stale follow-up",
      })
      .expect(409);
    const followUps = await request(app.getHttpServer())
      .get(`/api/v1/sales-quotations/${sent.id}/follow-ups`)
      .set(authorization)
      .expect(200);
    expect(followUps.body.data).toHaveLength(1);

    const acceptedDraft = await createQuotation(
      authorization,
      fixture.master.id,
      "Accepted result",
    );
    const acceptedCost = await saveCosting(authorization, acceptedDraft.id, acceptedDraft.version);
    const acceptedSent = await sendQuotation(authorization, acceptedDraft.id, acceptedCost.version);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-quotations/${acceptedDraft.id}/result`)
      .set(authorization)
      .send({
        expectedVersion: acceptedSent.version,
        decision: "ACCEPTED",
        decisionDate: new Date().toISOString(),
        acceptedAmount: "320.00",
        customerPoWoNo: "PO-QUERY-1",
      })
      .expect(201);

    const pending = await request(app.getHttpServer())
      .get("/api/v1/sales-quotations")
      .query({ decision: "PENDING", limit: 20 })
      .set(authorization)
      .expect(200);
    expect(
      new Set((pending.body.data as Array<{ status: string }>).map((row) => row.status)),
    ).toEqual(new Set(["DRAFT", "SENT"]));
    expect(pending.body.meta.total).toBe(2);
    const filtered = await request(app.getHttpServer())
      .get("/api/v1/sales-quotations")
      .query({ customerId: fixture.master.id, workName: "Accepted result" })
      .set(authorization)
      .expect(200);
    expect(filtered.body.data).toHaveLength(1);

    const summary = await request(app.getHttpServer())
      .get("/api/v1/sales-quotations/summary")
      .set(authorization)
      .expect(200);
    expect(summary.body.data).toMatchObject({
      total: 3,
      draft: 1,
      sent: 1,
      accepted: 1,
      rejected: 0,
      pending: 2,
      acceptedValue: "320.00",
    });
    const options = await request(app.getHttpServer())
      .get("/api/v1/sales-quotations/options")
      .set(authorization)
      .expect(200);
    expect(options.body.data.customers).toContainEqual({
      id: fixture.master.id,
      name: fixture.master.fullName,
      shortName: fixture.master.shortName,
    });
    expect(options.body.data.salesPeople).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.user.id, name: fixture.user.name }),
      ]),
    );
    expect(options.body.data.workNames).toEqual(
      expect.arrayContaining(["Draft result", "=2+3", "Accepted result"]),
    );
    expect(options.body.data.projectNames).toEqual(options.body.data.workNames);

    const exported = await request(app.getHttpServer())
      .get("/api/v1/sales-quotations/export")
      .query({ decision: "PENDING" })
      .set(authorization)
      .expect(200);
    expect(exported.body.data.filename).toMatch(/^sales-quotations-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(exported.body.data.content).toContain("Draft result");
    expect(exported.body.data.content).not.toContain("Accepted result");
    expect(exported.body.data.content).not.toMatch(/(?:^|,)"[=+\-@]/m);
  });
});
