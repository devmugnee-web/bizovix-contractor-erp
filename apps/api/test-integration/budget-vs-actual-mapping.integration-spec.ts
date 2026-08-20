import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { ProjectBudgetsService } from "../src/modules/project-budgets/project-budgets.service";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { createOrganizationFixture, resetTestDatabase } from "./fixtures";

describe("Budget vs Actual - real service mapping", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: ProjectBudgetsService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    service = app.get(ProjectBudgetsService);
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => { await resetTestDatabase(prisma); await app.close(); });

  async function setup(suffix: string) {
    const f = await createOrganizationFixture(prisma, suffix);
    await prisma.expenseHead.update({ where: { id: f.expenseHead.id }, data: { name: "Material Purchase", budgetCategory: "Material" } });
    await prisma.projectBudget.create({ data: { organizationId: f.organization.id, cmsWorkId: f.work.id, version: 1, status: "APPROVED", totalBudget: 100000, lines: { create: [{ expenseHeadId: f.expenseHead.id, category: "Material", amount: 100000 }] } } });
    return f;
  }

  async function expense(f: Awaited<ReturnType<typeof setup>>, headId: string, amount: number, status: "APPROVED" | "AMENDED" | "CANCELLED", referenceNo: string) {
    return prisma.expense.create({ data: { organizationId: f.organization.id, workId: f.work.id, expenseHeadId: headId, expenseById: f.user.id, paidFromAccountId: f.bank.id, amount, expenseDate: new Date(), status, referenceNo, category: "test" } });
  }

  it("A: maps Material Purchase into Material without a raw-head row", async () => {
    const f = await setup("MAP-A");
    await expense(f, f.expenseHead.id, 30000, "APPROVED", "EXP-A");
    const result = await service.budgetVsActual(f.organization.id, f.work.id);
    expect(result.rows).toContainEqual(expect.objectContaining({ category: "Material", budget: "100000.00", actual: "30000.00", variance: "70000.00" }));
    expect(result.rows.some((row) => row.category === "Material Purchase")).toBe(false);
  });

  it("B: aggregates multiple heads mapped to Material", async () => {
    const f = await setup("MAP-B");
    const second = await prisma.expenseHead.create({ data: { organizationId: f.organization.id, name: "LED Module Purchase", budgetCategory: "Material" } });
    await expense(f, f.expenseHead.id, 20000, "APPROVED", "EXP-B1");
    await expense(f, second.id, 15000, "APPROVED", "EXP-B2");
    const result = await service.budgetVsActual(f.organization.id, f.work.id);
    expect(result.rows.filter((row) => row.category === "Material")).toEqual([expect.objectContaining({ actual: "35000.00" })]);
  });

  it("C: returns mapped Accommodation as an unbudgeted canonical category", async () => {
    const f = await setup("MAP-C");
    const head = await prisma.expenseHead.create({ data: { organizationId: f.organization.id, name: "Accommodation", budgetCategory: "Accommodation" } });
    await expense(f, head.id, 25000, "APPROVED", "EXP-C");
    const result = await service.budgetVsActual(f.organization.id, f.work.id);
    expect(result.rows).toContainEqual(expect.objectContaining({ category: "Accommodation", budget: "0.00", actual: "25000.00", variance: "-25000.00", status: "Over Budget" }));
  });

  it("D/E: excludes AMENDED and CANCELLED expenses", async () => {
    const f = await setup("MAP-DE");
    await expense(f, f.expenseHead.id, 40000, "AMENDED", "EXP-D");
    await expense(f, f.expenseHead.id, 35000, "CANCELLED", "EXP-E");
    const result = await service.budgetVsActual(f.organization.id, f.work.id);
    expect(result.rows.find((row) => row.category === "Material")?.actual).toBe("0.00");
    expect(result.totals.actual).toBe("0.00");
  });

  it("F: includes NULL mappings explicitly and in totals", async () => {
    const f = await setup("MAP-F");
    const head = await prisma.expenseHead.create({ data: { organizationId: f.organization.id, name: "Needs Review", budgetCategory: null } });
    await expense(f, head.id, 30000, "APPROVED", "EXP-F");
    const result = await service.budgetVsActual(f.organization.id, f.work.id);
    expect(result.rows).toContainEqual(expect.objectContaining({ category: "Unmapped / Unbudgeted", budget: "0.00", actual: "30000.00", variance: "-30000.00", status: "Unbudgeted" }));
    expect(result.totals).toEqual({ budget: "100000.00", actual: "30000.00", variance: "70000.00" });
  });
});
