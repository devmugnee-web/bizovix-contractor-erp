import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { seedDemoBankAccounts } from "../../../packages/database/src/demo-bank-seed";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { AccountingService } from "../src/modules/accounting/accounting.service";
import { DashboardService } from "../src/modules/dashboard/dashboard.service";
import { DemoBankCleanupService } from "../src/modules/accounting/demo-bank-cleanup.service";
import { createOrganizationFixture, resetTestDatabase } from "./fixtures";

describe("development demo bank normalization", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accounting: AccountingService;
  let dashboard: DashboardService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    accounting = app.get(AccountingService);
    dashboard = app.get(DashboardService);
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => { await resetTestDatabase(prisma); await app.close(); });

  it("seeds bank identities idempotently, migrates references, preserves settings, and excludes archived balances", async () => {
    const f = await createOrganizationFixture(prisma, "BANKSEED");
    const first = await seedDemoBankAccounts(prisma, f.organization.id);
    const snapshot = async () => ({
      banks: await prisma.bankAccount.count({ where: { organizationId: f.organization.id } }),
      transactions: await prisma.financialTransaction.count({ where: { organizationId: f.organization.id } }),
      journals: await prisma.journalEntry.count({ where: { organizationId: f.organization.id } }),
      balances: (await prisma.bankAccount.findMany({ where: { organizationId: f.organization.id }, orderBy: { id: "asc" }, select: { id: true, currentBalance: true } })).map((x) => `${x.id}:${x.currentBalance.toFixed(2)}`),
    });
    const once = await snapshot();
    await seedDemoBankAccounts(prisma, f.organization.id);
    expect(await snapshot()).toEqual(once);

    const duplicate = await prisma.bankAccount.create({ data: { organizationId: f.organization.id, accountName: "DBBL duplicate", accountType: "BANK", bankName: "Dutch-Bangla Bank", accountNumber: "1012000045781", openingBalance: 0, currentBalance: 999_999 } });
    const expense = await prisma.expense.create({ data: { organizationId: f.organization.id, paidFromAccountId: duplicate.id, amount: 10, expenseDate: new Date("2024-01-01"), status: "PENDING", referenceNo: "DUP-REF" } });
    const mainLedger = await prisma.$transaction((tx) => accounting.bankLedgerAccount(tx, f.organization.id, first.cash.id));
    await prisma.financeSetting.create({ data: { organizationId: f.organization.id, defaultCashAccountId: mainLedger.id } });

    const cleanup = new DemoBankCleanupService(prisma, accounting);
    const dry = await cleanup.plan(f.organization.id);
    const dbblGroup = dry.groups.find((x) => x.identity === "BANK:1012000045781")!;
    expect(dbblGroup.sourceIds).toHaveLength(1);
    await cleanup.apply(f.organization.id);
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: dbblGroup.sourceIds[0]! } })).isActive).toBe(false);
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })).paidFromAccountId).toBe(dbblGroup.canonicalId);
    const setting = await prisma.financeSetting.findUniqueOrThrow({ where: { organizationId: f.organization.id } });
    expect((await prisma.ledgerAccount.findUniqueOrThrow({ where: { id: setting.defaultCashAccountId! } })).linkedBankAccountId).toBe(first.cash.id);

    await prisma.bankAccount.update({ where: { id: dbblGroup.sourceIds[0]! }, data: { currentBalance: 999_999 } });
    const activeTotal = (await prisma.bankAccount.findMany({ where: { organizationId: f.organization.id, isActive: true } })).reduce((sum, x) => sum + x.currentBalance.toNumber(), 0);
    expect(Number((await dashboard.getDashboard(f.organization.id)).kpis.bankAndCash.amount)).toBe(activeTotal);
    expect((await accounting.integrity(f.organization.id)).banks.every((x) => x.status === "BALANCED")).toBe(true);

    const afterCleanup = await snapshot();
    await seedDemoBankAccounts(prisma, f.organization.id);
    expect(await snapshot()).toEqual(afterCleanup);
  });
});
