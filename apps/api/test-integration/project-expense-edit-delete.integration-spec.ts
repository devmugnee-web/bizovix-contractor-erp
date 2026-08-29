import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { validationExceptionFactory } from "../src/common/utils/validation-exception-factory";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { createOrganizationFixture, resetTestDatabase } from "./fixtures";

/** Reproduces the exact Project Expense edit/delete flow the UI performs, over real HTTP, and
 * asserts the resulting database state — active row count, amended/cancelled rows, GL net and
 * bank net — rather than trusting the response body. */
describe("Project Expense edit + delete over HTTP", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory }));
    await app.init();
    prisma = app.get(PrismaService);
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => {
    await resetTestDatabase(prisma);
    await app.close();
  });

  it("amends on PATCH and cancels on DELETE, leaving exactly one active row then none, with GL and bank netting to zero", async () => {
    const f = await createOrganizationFixture(prisma, "PEXP");
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: f.user.email, password: f.password }).expect(201);
    const auth = { Authorization: `Bearer ${login.body.data.accessToken as string}` };

    const secondHead = await prisma.expenseHead.create({ data: { organizationId: f.organization.id, name: "Accommodation" } });

    const activeCount = () => prisma.expense.count({ where: { organizationId: f.organization.id, workId: f.work.id, status: { notIn: ["CANCELLED", "AMENDED"] } } });
    const glNet = async () => {
      const lines = await prisma.journalLine.findMany({
        where: { journalEntry: { organizationId: f.organization.id, status: { in: ["POSTED", "REVERSED"] } }, account: { systemKey: "PROJECT_EXPENSE" } },
        select: { debit: true, credit: true },
      });
      return lines.reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0);
    };
    const bankNet = async () => {
      const rows = await prisma.financialTransaction.findMany({ where: { organizationId: f.organization.id, sourceModule: { in: ["PROJECT_EXPENSE", "PROJECT_EXPENSE_REVERSAL"] } }, select: { direction: true, amount: true } });
      return rows.reduce((sum, row) => sum + (row.direction === "OUT" ? -Number(row.amount) : Number(row.amount)), 0);
    };

    // --- 1. CREATE 30,000 -----------------------------------------------------------------
    const created = await request(app.getHttpServer())
      .post("/api/v1/project-expenses")
      .set(auth)
      .send({
        workId: f.work.id,
        expenseDate: "2026-05-01",
        expenseHeadId: f.expenseHead.id,
        amount: 30000,
        expenseById: f.user.id,
        paidFromAccountId: f.bank.id,
        description: "Original expense test",
      })
      .expect(201);
    const originalId = created.body.data.id as string;
    expect(await activeCount()).toBe(1);
    expect(await glNet()).toBeCloseTo(30000, 2);
    expect(await bankNet()).toBeCloseTo(-30000, 2);

    // --- 2. EDIT via PATCH (the exact call the UI makes) ------------------------------------
    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/project-expenses/${originalId}`)
      .set(auth)
      .send({
        workId: f.work.id,
        expenseDate: "2026-05-01",
        expenseHeadId: secondHead.id,
        amount: 30000,
        expenseById: f.user.id,
        paidFromAccountId: f.bank.id,
        description: "Updated expense test",
      })
      .expect(200);

    const replacementId = patched.body.data.id as string;
    // Amendment architecture: the PATCH returns the replacement, not the original.
    expect(replacementId).not.toBe(originalId);
    expect(patched.body.data.expenseHead.name).toBe("Accommodation");
    expect(patched.body.data.expenseBy.name).toBe(f.user.name);
    expect(patched.body.data.description).toBe("Updated expense test");

    const originalRow = await prisma.expense.findUniqueOrThrow({ where: { id: originalId } });
    expect(originalRow.status).toBe("AMENDED");
    const replacementRow = await prisma.expense.findUniqueOrThrow({ where: { id: replacementId } });
    expect(replacementRow.status).toBe("APPROVED");
    expect(replacementRow.replacesExpenseId).toBe(originalId);

    // Active list must show exactly one row — the replacement, not both.
    expect(await activeCount()).toBe(1);
    const listAfterUpdate = await request(app.getHttpServer()).get("/api/v1/project-expenses").query({ workId: f.work.id, limit: 50 }).set(auth).expect(200);
    expect(listAfterUpdate.body.data).toHaveLength(1);
    expect(listAfterUpdate.body.data[0].id).toBe(replacementId);
    expect(listAfterUpdate.body.data[0].expenseHead.name).toBe("Accommodation");

    // Not duplicated: the reversal cancels the original posting, so net stays 30,000.
    expect(await glNet()).toBeCloseTo(30000, 2);
    expect(await bankNet()).toBeCloseTo(-30000, 2);

    // --- 3. DELETE (cancel) ------------------------------------------------------------------
    await request(app.getHttpServer()).delete(`/api/v1/project-expenses/${replacementId}`).set(auth).expect(200);

    const cancelledRow = await prisma.expense.findUniqueOrThrow({ where: { id: replacementId } });
    expect(cancelledRow.status).toBe("CANCELLED");
    expect(cancelledRow.cancelledAt).not.toBeNull();

    expect(await activeCount()).toBe(0);
    const listAfterDelete = await request(app.getHttpServer()).get("/api/v1/project-expenses").query({ workId: f.work.id, limit: 50 }).set(auth).expect(200);
    expect(listAfterDelete.body.data).toHaveLength(0);

    // Audit rows survive, financial effect nets to zero.
    expect(await prisma.expense.count({ where: { organizationId: f.organization.id } })).toBe(2);
    expect(await glNet()).toBeCloseTo(0, 2);
    expect(await bankNet()).toBeCloseTo(0, 2);
  });

  it("creates every batch row with separate financial postings and audit logs", async () => {
    const f = await createOrganizationFixture(prisma, "PEXB");
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: f.user.email, password: f.password }).expect(201);
    const auth = { Authorization: `Bearer ${login.body.data.accessToken as string}` };

    const response = await request(app.getHttpServer())
      .post("/api/v1/project-expenses/batch")
      .set(auth)
      .send({
        expenses: [
          {
            workId: f.work.id,
            expenseDate: "2026-05-02",
            expenseHeadId: f.expenseHead.id,
            amount: 12000,
            expenseById: f.user.id,
            paidFromAccountId: f.bank.id,
            description: "First batch expense",
          },
          {
            workId: f.work.id,
            expenseDate: "2026-05-02",
            expenseHeadId: f.expenseHead.id,
            amount: 8000,
            expenseById: f.user.id,
            paidFromAccountId: f.bank.id,
            description: "Second batch expense",
          },
        ],
      })
      .expect(201);

    expect(response.body.data).toHaveLength(2);
    expect(new Set(response.body.data.map((item: { referenceNo: string }) => item.referenceNo)).size).toBe(2);
    expect(await prisma.expense.count({ where: { organizationId: f.organization.id, workId: f.work.id, status: "APPROVED" } })).toBe(2);
    expect(await prisma.financialTransaction.count({ where: { organizationId: f.organization.id, sourceModule: "PROJECT_EXPENSE" } })).toBe(2);
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id, sourceModule: "PROJECT_EXPENSE", status: "POSTED" } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { organizationId: f.organization.id, entityType: "ProjectExpense", action: "create" } })).toBe(2);
  });

  it("rolls back the whole batch when any row has an invalid tenant-scoped reference", async () => {
    const f = await createOrganizationFixture(prisma, "PEXR");
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: f.user.email, password: f.password }).expect(201);
    const auth = { Authorization: `Bearer ${login.body.data.accessToken as string}` };

    await request(app.getHttpServer())
      .post("/api/v1/project-expenses/batch")
      .set(auth)
      .send({
        expenses: [
          {
            workId: f.work.id,
            expenseDate: "2026-05-03",
            expenseHeadId: f.expenseHead.id,
            amount: 5000,
            expenseById: f.user.id,
            paidFromAccountId: f.bank.id,
          },
          {
            workId: f.work.id,
            expenseDate: "2026-05-03",
            expenseHeadId: "not-a-valid-expense-head",
            amount: 7000,
            expenseById: f.user.id,
            paidFromAccountId: f.bank.id,
          },
        ],
      })
      .expect(404);

    expect(await prisma.expense.count({ where: { organizationId: f.organization.id } })).toBe(0);
    expect(await prisma.financialTransaction.count({ where: { organizationId: f.organization.id, sourceModule: "PROJECT_EXPENSE" } })).toBe(0);
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id, sourceModule: "PROJECT_EXPENSE" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { organizationId: f.organization.id, entityType: "ProjectExpense", action: "create" } })).toBe(0);
  });
});
