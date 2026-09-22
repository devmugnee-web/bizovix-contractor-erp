import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma, PurchaseType } from "@bizovix/database";
import { AppModule } from "../src/app.module";
import { AccountingService } from "../src/modules/accounting/accounting.service";
import { CashBankService } from "../src/modules/cash-bank/cash-bank.service";
import { DocumentPurchasesService } from "../src/modules/document-purchases/document-purchases.service";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { FinanceSettingsService } from "../src/modules/settings-finance/finance-settings.service";
import { ReportsService } from "../src/modules/reports/reports.service";
import { assertIsolatedTestDatabase, createIdentityFixture } from "./fixtures";

describe("Document Purchase payment accounting", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let purchases: DocumentPurchasesService;
  let cashBank: CashBankService;
  let accounting: AccountingService;
  let finance: FinanceSettingsService;
  let reports: ReportsService;
  const fixtures: Awaited<ReturnType<typeof createIdentityFixture>>[] = [];
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await assertIsolatedTestDatabase(prisma);
    purchases = app.get(DocumentPurchasesService);
    cashBank = app.get(CashBankService);
    accounting = app.get(AccountingService);
    finance = app.get(FinanceSettingsService);
    reports = app.get(ReportsService);
    for (const tenant of ["a", "b"]) fixtures.push(await createIdentityFixture(prisma, `dp-charge-${tenant}-${randomUUID()}`, []));
  });

  afterAll(async () => {
    if (prisma) {
      await assertIsolatedTestDatabase(prisma);
      for (const fixture of fixtures) {
        await prisma.organization.delete({ where: { id: fixture.organization.id } });
        await prisma.user.delete({ where: { id: fixture.user.id } });
      }
    }
    await app?.close();
  });

  it("posts the price and charge together and safely adjusts, moves, clears and deletes them", async () => {
    const owner = fixtures[0]!;
    const org = owner.organization.id;
    const user = owner.user.id;
    const bank = await cashBank.createBankAccount(org, user, {
      accountName: "Funded Bank", bankName: "Test Bank", accountNumber: randomUUID(), branch: "Test",
      bankAccountType: "Current", openingBalance: 10000, openingBalanceDate: today,
    });
    const payload = {
      purchaseType: PurchaseType.MANUAL, organizationMasterId: owner.master.id,
      tenderWorkName: "Bank charge verification", purchaseDate: today, documentPrice: 1500,
      paymentFromAccountId: bank.id, category: "Supply", estimatedTenderAmount: 10000,
    };
    const zero = await purchases.create(org, user, payload);
    expect(zero.bankCharge.toFixed(2)).toBe("0.00");
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).currentBalance.toFixed(2)).toBe("8500.00");
    await purchases.remove(org, user, zero.id);

    const record = await purchases.create(org, user, { ...payload, linkedTenderId: zero.linkedTenderId!, bankCharge: 17.25 });
    const chargeAccount = await prisma.ledgerAccount.findFirstOrThrow({ where: { organizationId: org, systemKey: "BANK_CHARGES" } });
    expect(chargeAccount).toMatchObject({ code: "44100001", name: "Bank Charges", isSystem: true, accountType: "EXPENSE" });
    const scheduleAccount = await prisma.ledgerAccount.findFirstOrThrow({ where: { organizationId: org, systemKey: "TENDER_SCHEDULE_PURCHASE" }, include: { parent: true } });
    expect(scheduleAccount).toMatchObject({ code: "41100002", name: "Tender Schedule Purchase", isSystem: true, accountType: "EXPENSE", parent: { code: "4100000", name: "Project Expenses" } });
    const sourceWhere = { organizationId: org, sourceModule: "DOCUMENT_PURCHASE", OR: [{ sourceId: record.id }, { sourceId: { startsWith: `${record.id}:` } }] };
    const journals = () => prisma.journalEntry.findMany({ where: sourceWhere, include: { lines: true }, orderBy: { createdAt: "asc" } });
    const verify = async (firstBalance: string, secondBalance: string, charge: string, price: string) => {
      expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).currentBalance.toFixed(2)).toBe(firstBalance);
      expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: owner.bank.id } })).currentBalance.toFixed(2)).toBe(secondBalance);
      const rows = await journals();
      const expense = rows.flatMap((row) => row.lines).filter((line) => line.accountId === chargeAccount.id)
        .reduce((sum, line) => sum.add(line.debit).sub(line.credit), new Prisma.Decimal(0));
      expect(expense.toFixed(2)).toBe(charge);
      const schedule = rows.flatMap((row) => row.lines).filter((line) => line.accountId === scheduleAccount.id)
        .reduce((sum, line) => sum.add(line.debit).sub(line.credit), new Prisma.Decimal(0));
      expect(schedule.toFixed(2)).toBe(price);
      const chart = await accounting.chart(org);
      expect(chart.find((row) => row.id === scheduleAccount.id)?.balance).toBe(price);
      expect(chart.find((row) => row.code === "4100000")?.balance).toBe(price);
      const reportNet = async (accountId?: string) => (await reports.run(org, "cash-bank", "bank-charges", { accountId }))
        .kpis.find((kpi) => kpi.label === "Net Bank Charges")?.value;
      expect(await reportNet()).toBe(charge);
      expect(await reportNet(bank.id)).toBe(firstBalance === "10000.00" ? "0.00" : charge);
      expect(await reportNet(owner.bank.id)).toBe(secondBalance === "0.00" ? "0.00" : charge);
      for (const row of rows) expect(row.lines.reduce((sum, line) => sum.add(line.debit).sub(line.credit), new Prisma.Decimal(0)).isZero()).toBe(true);
      const integrity = await accounting.integrity(org);
      expect(integrity.unbalancedJournalCount).toBe(0);
      expect(integrity.banks.every((item) => item.status === "BALANCED")).toBe(true);
    };
    await verify("8482.75", "0.00", "17.25", "1500.00");
    const initial = (await journals())[0]!;
    expect(initial.lines).toHaveLength(3);
    expect(initial.lines.find((line) => line.accountId === chargeAccount.id)!.debit.toFixed(2)).toBe("17.25");
    expect(initial.lines.find((line) => line.accountId === scheduleAccount.id)!.debit.toFixed(2)).toBe("1500.00");
    expect(initial.lines.find((line) => line.credit.gt(0))!.credit.toFixed(2)).toBe("1517.25");
    const report = await reports.run(org, "cash-bank", "bank-charges", { accountId: bank.id, dateFrom: today, dateTo: today, search: "Funded Bank" });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ account: "Funded Bank", charge: "17.25", reversal: "0.00", netCharge: "17.25" });
    expect((await reports.run(org, "cash-bank", "bank-charges", { dateTo: "2000-01-01" })).rows).toEqual([]);
    expect((await reports.run(fixtures[1]!.organization.id, "cash-bank", "bank-charges", { accountId: bank.id })).rows).toEqual([]);
    const csv = await reports.export(org, user, "cash-bank", "bank-charges", { accountId: bank.id });
    expect(csv.content).toContain('"17.25"');
    expect(csv.content).not.toContain('"1517.25"');
    await Promise.all([purchases.update(org, user, record.id, { bankCharge: 150 }), purchases.update(org, user, record.id, { bankCharge: 150 })]);
    expect(await journals()).toHaveLength(2);
    await purchases.update(org, user, record.id, { remarks: "Metadata edit" });
    expect(await journals()).toHaveLength(2);
    await verify("8350.00", "0.00", "150.00", "1500.00");
    await purchases.update(org, user, record.id, { documentPrice: 1750, bankCharge: 100 });
    await verify("8150.00", "0.00", "100.00", "1750.00");
    const cashCount = await prisma.financialTransaction.count({ where: sourceWhere });
    await purchases.update(org, user, record.id, { documentPrice: 1775, bankCharge: 75 });
    expect(await prisma.financialTransaction.count({ where: sourceWhere })).toBe(cashCount);
    await verify("8150.00", "0.00", "75.00", "1775.00");
    await purchases.update(org, user, record.id, { bankCharge: 60 });
    await verify("8165.00", "0.00", "60.00", "1775.00");
    await purchases.update(org, user, record.id, { paymentFromAccountId: owner.bank.id });
    await verify("10000.00", "-1835.00", "60.00", "1775.00");
    await purchases.update(org, user, record.id, { purchaseDate: "2026-01-01" });
    await verify("10000.00", "-1835.00", "60.00", "1775.00");
    await purchases.update(org, user, record.id, { bankCharge: 0 });
    await verify("10000.00", "-1775.00", "0.00", "1775.00");
    await purchases.update(org, user, record.id, { bankCharge: 20 });
    await purchases.remove(org, user, record.id);
    await verify("10000.00", "0.00", "0.00", "0.00");
    expect(await prisma.ledgerAccount.findUniqueOrThrow({ where: { id: chargeAccount.id } })).toMatchObject({ code: chargeAccount.code, name: chargeAccount.name, isSystem: true, isActive: true });
  });

  it("repairs legacy charge-only and unposted purchases once without duplicating bank charges", async () => {
    const { organization, user, master, bank } = fixtures[0]!;
    for (const chargePosted of [true, false]) {
      // Represent the persisted output of the previous application version.
      const legacy = await prisma.documentPurchase.create({ data: {
        organizationId: organization.id, createdById: user.id, organizationMasterId: master.id,
        purchaseType: "MANUAL", tenderWorkName: "Legacy schedule purchase", purchaseDate: new Date(today),
        documentPrice: 1500, bankCharge: 17.25, paymentFromAccountId: bank.id,
      } });
      if (chargePosted) await prisma.$transaction(async (tx) => {
        await cashBank.post(tx, { organizationId: organization.id, accountId: bank.id, direction: "OUT", amount: 17.25,
          sourceModule: "DOCUMENT_PURCHASE", sourceType: "BANK_CHARGE", sourceId: legacy.id,
          description: "Legacy bank charge", transactionDate: legacy.purchaseDate, createdById: user.id });
        await accounting.post(tx, { organizationId: organization.id, userId: user.id, journalDate: legacy.purchaseDate,
          sourceModule: "DOCUMENT_PURCHASE", sourceType: "BANK_CHARGE", sourceId: legacy.id, description: "Legacy bank charge",
          lines: [{ systemKey: "BANK_CHARGES", debit: 17.25, credit: 0 }, { bankAccountId: bank.id, debit: 0, credit: 17.25 }] });
      });
      const before = await prisma.journalEntry.findMany({ where: { sourceId: legacy.id, organizationId: organization.id }, include: { lines: true } });
      expect(await Promise.all([
        purchases.reconcilePayment(organization.id, user.id, legacy.id),
        purchases.reconcilePayment(organization.id, user.id, legacy.id),
      ])).toEqual(expect.arrayContaining([true, false]));
      expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).currentBalance.toFixed(2)).toBe("-1517.25");
      if (chargePosted) expect(await prisma.journalEntry.findUnique({ where: { id: before[0]!.id }, include: { lines: true } })).toEqual(before[0]);
      expect(await purchases.reconcilePayment(organization.id, user.id, legacy.id)).toBe(false);
      expect((await reports.run(organization.id, "cash-bank", "bank-charges", { accountId: bank.id }))
        .kpis.find((kpi) => kpi.label === "Net Bank Charges")?.value).toBe("17.25");
      await purchases.update(organization.id, user.id, legacy.id, { documentPrice: 1700 });
      expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).currentBalance.toFixed(2)).toBe("-1717.25");
      await purchases.remove(organization.id, user.id, legacy.id);
      expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).currentBalance.toFixed(2)).toBe("0.00");
      expect((await accounting.integrity(organization.id)).banks.every((item) => item.status === "BALANCED")).toBe(true);
    }
  });

  it("rejects invalid charges and cross-tenant accounts, and rolls back when posting is locked", async () => {
    const owner = fixtures[0]!;
    const org = owner.organization.id;
    const user = owner.user.id;
    const payload = {
      purchaseType: PurchaseType.MANUAL, organizationMasterId: owner.master.id,
      tenderWorkName: "Rejected charge", purchaseDate: "2000-01-01", documentPrice: 1500,
      paymentFromAccountId: owner.bank.id, category: "Supply", estimatedTenderAmount: 10000,
    };
    for (const bankCharge of [-1, 0.001, Number.NaN]) {
      await expect(purchases.create(org, user, { ...payload, bankCharge })).rejects.toThrow("Bank charge must be non-negative");
    }
    await expect(purchases.create(org, user, { ...payload, bankCharge: 10, paymentFromAccountId: fixtures[1]!.bank.id })).rejects.toThrow("Payment account not found");
    const period = await finance.createPeriod(org, user, { label: "Locked test period", startDate: "2000-01-01", endDate: "2000-12-31" });
    await finance.setPeriodStatus(org, user, period.id, "LOCKED");
    const snapshot = async () => ({
      purchases: await prisma.documentPurchase.count({ where: { organizationId: org } }),
      tenders: await prisma.tender.count({ where: { organizationId: org } }),
      cashTransactions: await prisma.financialTransaction.count({ where: { organizationId: org } }),
      balance: (await prisma.bankAccount.findUniqueOrThrow({ where: { id: owner.bank.id } })).currentBalance.toFixed(2),
    });
    const before = await snapshot();
    await expect(purchases.create(org, user, { ...payload, bankCharge: 10 })).rejects.toThrow("locked for posting");
    expect(await snapshot()).toEqual(before);
    expect(await prisma.journalEntry.count({ where: { organizationId: fixtures[1]!.organization.id, sourceModule: "DOCUMENT_PURCHASE" } })).toBe(0);
  });

  it("reports transfer charges against the paying bank and totals all filtered pages", async () => {
    const { organization, user, bank } = fixtures[1]!;
    const destination = await cashBank.createBankAccount(organization.id, user.id, {
      accountName: "Transfer destination", bankName: "Test Bank", accountNumber: randomUUID(),
      branch: "Test", bankAccountType: "Current", openingBalance: 0, openingBalanceDate: today,
    });
    for (const bankCharge of [17.25, 2.75]) await cashBank.transfer(organization.id, user.id, {
      fromAccountId: bank.id, toAccountId: destination.id, amount: 500, bankCharge, transferDate: today,
    });
    const query = { accountId: bank.id, page: 1, limit: 1 };
    const first = await reports.run(organization.id, "cash-bank", "bank-charges", query);
    expect(first.meta).toMatchObject({ total: 2, totalPages: 2 });
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0]).toMatchObject({ account: bank.accountName, source: "BANK TRANSFER" });
    expect(first.kpis.find((kpi) => kpi.label === "Net Bank Charges")?.value).toBe("20.00");
    const second = await reports.run(organization.id, "cash-bank", "bank-charges", { ...query, page: 2 });
    expect(second.rows[0]!.journal).not.toBe(first.rows[0]!.journal);
    expect(second.kpis).toEqual(first.kpis);
    expect((await reports.run(organization.id, "cash-bank", "bank-charges", { accountId: destination.id })).rows).toEqual([]);
    const csv = await reports.export(organization.id, user.id, "cash-bank", "bank-charges", query);
    expect(csv.content).toContain('"17.25"');
    expect(csv.content).toContain('"2.75"');
    expect(csv.content).not.toContain('"500.00"');
  });
});
