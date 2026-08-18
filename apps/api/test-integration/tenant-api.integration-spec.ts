import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { validationExceptionFactory } from "../src/common/utils/validation-exception-factory";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { AccountingService } from "../src/modules/accounting/accounting.service";
import { createOrganizationFixture, resetTestDatabase } from "./fixtures";

describe("P0 tenant isolation and API authorization", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accounting: AccountingService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory }));
    await app.init();
    prisma = app.get(PrismaService);
    accounting = app.get(AccountingService);
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => { await resetTestDatabase(prisma); await app.close(); });

  async function token(email: string, password: string) {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password }).expect(201);
    return response.body.data.accessToken as string;
  }
  const auth = (value: string) => ({ Authorization: `Bearer ${value}` });

  it("rejects cross-tenant document Tender/Contract/ProjectBill references without leaking IDs", async () => {
    const a = await createOrganizationFixture(prisma, "DOCA");
    const b = await createOrganizationFixture(prisma, "DOCB");
    const billB = await prisma.projectBill.create({ data: { organizationId: b.organization.id, cmsWorkId: b.work.id, contractId: b.contract.id, billNo: "DOC-BILL-B", billDate: new Date(), status: "DRAFT" } });
    const access = await token(a.user.email, a.password);
    for (const relation of [{ tenderId: b.tender.id }, { contractId: b.contract.id }, { projectBillId: billB.id }]) {
      const response = await request(app.getHttpServer()).post("/api/v1/documents").set(auth(access)).field("name", "Attack document").field(Object.keys(relation)[0]!, Object.values(relation)[0]!).expect(404);
      expect(JSON.stringify(response.body)).not.toContain(b.organization.id);
    }
    expect(await prisma.document.count()).toBe(0);
  });

  it("rejects cross-tenant Receivable, BillAdjustment, Variation, EOT and Expense references", async () => {
    const a = await createOrganizationFixture(prisma, "FINA");
    const b = await createOrganizationFixture(prisma, "FINB");
    await accounting.ensureChart(b.organization.id);
    const ledgerB = await prisma.ledgerAccount.findFirstOrThrow({ where: { organizationId: b.organization.id, systemKey: "PROJECT_REVENUE" } });
    const billB = await prisma.projectBill.create({ data: { organizationId: b.organization.id, cmsWorkId: b.work.id, contractId: b.contract.id, billNo: "FIN-BILL-B", billDate: new Date(), status: "CERTIFIED", netCertifiedAmount: 100_000 } });
    const receivableB = await prisma.receivable.create({ data: { organizationId: b.organization.id, projectId: b.work.id, contractId: b.contract.id, projectBillId: billB.id, partyName: "B Client", billNo: billB.billNo, billDate: new Date(), amount: 100_000 } });
    const access = await token(a.user.email, a.password);
    await request(app.getHttpServer()).post("/api/v1/receipts").set(auth(access)).send({ receiptDate: "2026-02-01", receiptCategory: "PROJECT", receiptType: "BILL_COLLECTION", workId: a.work.id, receivableId: receivableB.id, receivedFrom: "Attack", amount: 1, receivedInAccountId: a.bank.id, paymentMethod: "BANK", status: "RECEIVED" }).expect(404);
    await request(app.getHttpServer()).post("/api/v1/project-bills").set(auth(access)).send({ contractId: a.contract.id, billDate: "2026-02-01", items: [{ boqItemId: a.boq.id, currentQty: 1 }], adjustments: [{ type: "OTHER", direction: "DEDUCTION", calculationType: "FIXED_AMOUNT", amount: 1, ledgerAccountId: ledgerB.id }] }).expect(400);
    await request(app.getHttpServer()).post("/api/v1/variation-orders").set(auth(access)).send({ contractId: a.contract.id, variationType: "QUANTITY_CHANGE", title: "Attack", reason: "Attack", requestDate: "2026-02-01", items: [{ boqItemId: b.boq.id, description: "Attack", revisedQty: 101, revisedRate: 100_000 }] }).expect(404);
    await request(app.getHttpServer()).post("/api/v1/time-extensions").set(auth(access)).send({ contractId: b.contract.id, requestDate: "2026-02-01", requestedDays: 10, reason: "Attack" }).expect(404);
    await request(app.getHttpServer()).post("/api/v1/general-expenses").set(auth(access)).send({ expenseDate: "2026-02-01", expenseHeadId: a.expenseHead.id, amount: 100, expenseById: a.user.id, paidFromAccountId: b.bank.id }).expect(404);
    expect(await prisma.receipt.count()).toBe(0);
    expect(await prisma.expense.count()).toBe(0);
  });

  it("returns not found for direct cross-tenant GET and PATCH", async () => {
    const a = await createOrganizationFixture(prisma, "GETA");
    const b = await createOrganizationFixture(prisma, "GETB");
    const billB = await prisma.projectBill.create({ data: { organizationId: b.organization.id, cmsWorkId: b.work.id, contractId: b.contract.id, billNo: "GET-BILL-B", billDate: new Date(), status: "DRAFT" } });
    const access = await token(a.user.email, a.password);
    await request(app.getHttpServer()).get(`/api/v1/project-bills/${billB.id}`).set(auth(access)).expect(404);
    await request(app.getHttpServer()).patch(`/api/v1/project-bills/${billB.id}`).set(auth(access)).send({ contractId: a.contract.id, billDate: "2026-02-01", items: [{ boqItemId: a.boq.id, currentQty: 1 }] }).expect(404);
  });

  it("viewer cannot close reopen or release closeout records", async () => {
    const viewer = await createOrganizationFixture(prisma, "VIEW", ["project_expense.read", "receipt.read", "accounts.read"]);
    const access = await token(viewer.user.email, viewer.password);
    await request(app.getHttpServer()).post("/api/v1/general-expenses").set(auth(access)).send({ expenseDate: "2026-02-01", expenseHeadId: viewer.expenseHead.id, amount: 100, expenseById: viewer.user.id, paidFromAccountId: viewer.bank.id }).expect(403);
    await request(app.getHttpServer()).post("/api/v1/receipts").set(auth(access)).send({ receiptDate: "2026-02-01", receiptCategory: "GENERAL", receiptType: "GENERAL_RECEIPT", receivedFrom: "Client", amount: 100, receivedInAccountId: viewer.bank.id, paymentMethod: "BANK" }).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/project-closing/${viewer.work.id}/close`).set(auth(access)).send({}).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/project-closing/${viewer.work.id}/reopen`).set(auth(access)).send({ reason: "No permission" }).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/project-closing/${viewer.work.id}/retention-releases`).set(auth(access)).send({ contractId: viewer.contract.id, amount: 1 }).expect(403);
  });

  it("project reopen requires permission and reason", async () => {
    const f = await createOrganizationFixture(prisma, "REOPEN");
    await prisma.cmsWork.update({ where: { id: f.work.id }, data: { status: "COMPLETED", closedAt: new Date(), closedById: f.user.id } });
    const access = await token(f.user.email, f.password);
    await request(app.getHttpServer()).post(`/api/v1/project-closing/${f.work.id}/reopen`).set(auth(access)).send({}).expect(400);
    await request(app.getHttpServer()).post(`/api/v1/project-closing/${f.work.id}/reopen`).set(auth(access)).send({ reason: "Authorized correction" }).expect(201);
    expect((await prisma.cmsWork.findUniqueOrThrow({ where: { id: f.work.id } })).status).toBe("CLOSEOUT_PENDING");
    expect(await prisma.auditLog.count({ where: { organizationId: f.organization.id, entityId: f.work.id, action: "PROJECT_REOPENED" } })).toBe(1);
  });

  it("blocks cross-tenant Completion, DLP, Defect, Retention, Handover and Closeout HTTP actions", async () => {
    const a = await createOrganizationFixture(prisma, "CLOSE-A");
    const b = await createOrganizationFixture(prisma, "CLOSE-B");
    const certificateB = await prisma.completionCertificate.create({ data: { organizationId: b.organization.id, workId: b.work.id, contractId: b.contract.id, certificateNo: "CC-B", applicationDate: new Date("2026-09-01"), actualCompletionDate: new Date("2026-09-01"), status: "APPROVED", createdById: b.user.id } });
    const dlpB = await prisma.defectLiabilityPeriod.create({ data: { organizationId: b.organization.id, workId: b.work.id, contractId: b.contract.id, completionCertificateId: certificateB.id, startDate: new Date("2026-09-01"), endDate: new Date("2027-09-01"), durationDays: 365, status: "ACTIVE", createdById: b.user.id } });
    const access = await token(a.user.email, a.password);
    await request(app.getHttpServer()).get(`/api/v1/project-closing/${b.work.id}`).set(auth(access)).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/project-closing/${a.work.id}/certificates`).set(auth(access)).send({ contractId: b.contract.id, applicationDate: "2026-09-01", actualCompletionDate: "2026-09-01" }).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/project-closing/${a.work.id}/dlp`).set(auth(access)).send({ completionCertificateId: certificateB.id, durationDays: 365 }).expect(400);
    await request(app.getHttpServer()).post(`/api/v1/project-closing/${a.work.id}/defects`).set(auth(access)).send({ dlpId: dlpB.id, description: "Attack", reportedDate: "2026-09-01" }).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/project-closing/${a.work.id}/retention-releases`).set(auth(access)).send({ contractId: b.contract.id, amount: 1 }).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/project-closing/${a.work.id}/handovers`).set(auth(access)).send({ contractId: b.contract.id, handoverDate: "2026-09-01", handedOverBy: "A", receivedBy: "B", authority: "Client" }).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/project-closing/${b.work.id}/close`).set(auth(access)).send({}).expect(404);
  });

  it("returns numerically balanced financial integrity diagnostics for a healthy empty fixture", async () => {
    const a = await createOrganizationFixture(prisma, "INT");
    const access = await token(a.user.email, a.password);
    const response = await request(app.getHttpServer()).get("/api/v1/accounts/integrity").set(auth(access)).expect(200);
    const data = response.body.data;
    expect(data.ar).toMatchObject({ glBalance: "0.00", subledgerBalance: "0.00", difference: "0.00", status: "BALANCED" });
    expect(data.ap).toMatchObject({ difference: "0.00", status: "BALANCED" });
    expect(data.retention).toMatchObject({ difference: "0.00", status: "BALANCED" });
    expect(data.banks.every((bank: { difference: string; status: string }) => bank.difference === "0.00" && bank.status === "BALANCED")).toBe(true);
    expect(data.unbalancedJournalCount).toBe(0);
  });
});
