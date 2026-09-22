import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PurchaseType } from "@bizovix/database";
import { AppModule } from "../src/app.module";
import { AccountingService } from "../src/modules/accounting/accounting.service";
import { CashBankService } from "../src/modules/cash-bank/cash-bank.service";
import { CmsWorksService } from "../src/modules/cms-works/cms-works.service";
import { DocumentPurchasesService } from "../src/modules/document-purchases/document-purchases.service";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { ReportsService } from "../src/modules/reports/reports.service";
import { FinanceSettingsService } from "../src/modules/settings-finance/finance-settings.service";
import { CreateTenderSecurityDto } from "../src/modules/tender-securities/dto/create-tender-security.dto";
import { TenderSecuritiesService } from "../src/modules/tender-securities/tender-securities.service";
import { assertIsolatedTestDatabase, createIdentityFixture } from "./fixtures";

describe("Tender Security bank margin accounting", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let security: TenderSecuritiesService;
  let purchases: DocumentPurchasesService;
  let cashBank: CashBankService;
  let accounting: AccountingService;
  let reports: ReportsService;
  let finance: FinanceSettingsService;
  const fixtures: Awaited<ReturnType<typeof createIdentityFixture>>[] = [];
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await assertIsolatedTestDatabase(prisma);
    security = app.get(TenderSecuritiesService);
    purchases = app.get(DocumentPurchasesService);
    cashBank = app.get(CashBankService);
    accounting = app.get(AccountingService);
    reports = app.get(ReportsService);
    finance = app.get(FinanceSettingsService);
    for (const tenant of ["a", "b"]) fixtures.push(await createIdentityFixture(prisma, `margin-${tenant}-${randomUUID()}`, []));
  });

  afterAll(async () => {
    if (prisma) {
      await assertIsolatedTestDatabase(prisma);
      for (const fixture of fixtures) {
        await prisma.tenderSecurity.deleteMany({ where: { organizationId: fixture.organization.id } });
        await prisma.organization.delete({ where: { id: fixture.organization.id } });
        await prisma.user.delete({ where: { id: fixture.user.id } });
      }
    }
    await app?.close();
  });

  async function purchase(owner = fixtures[0]!, bankId = owner.bank.id) {
    return purchases.create(owner.organization.id, owner.user.id, {
      purchaseType: PurchaseType.EGP, tenderId: `M-${randomUUID()}`,
      organizationMasterId: owner.master.id, tenderWorkName: "Margin accounting test",
      purchaseDate: today, documentPrice: 100, bankCharge: 10, paymentFromAccountId: bankId,
      category: "Supply", estimatedTenderAmount: 2000000,
    });
  }
  function payload(ids: string[], bankId = fixtures[0]!.bank.id): CreateTenderSecurityDto {
    return {
      securityType: "PAY_ORDER", fundingType: "LOAN", bankId, chargeFromAccountId: bankId,
      issueDate: today, expiryDate: "2030-12-31", validityMonths: 6, interestRate: 15,
      items: ids.map((id, index) => ({ documentPurchaseId: id, securityAmount: index ? 20000 : 60000, marginPercentage: 5, referenceNo: `PO-${id}` })),
    };
  }
  const balance = async (id: string) => (await prisma.bankAccount.findUniqueOrThrow({ where: { id } })).currentBalance;

  it("finances the full security, deducts only margin and reconciles bank-wise reports to the GL", async () => {
    const { organization, user, bank } = fixtures[0]!;
    const first = await purchase();
    const second = await purchase();
    const before = await balance(bank.id);
    const input = payload([first.id, second.id]);
    const created = await security.create(organization.id, user.id, input);
    expect(created).toMatchObject({ amount: "80000.00", bankFinanceAmount: "80000.00", marginAmount: "4000.00" });
    expect(created.items.find((item) => item.documentPurchaseId === first.id)).toMatchObject({ bankFinanceAmount: "60000.00", marginAmount: "3000.00", referenceNo: `PO-${first.id}` });
    expect((await balance(bank.id)).sub(before).toFixed(2)).toBe("-4000.00");
    const chart = await accounting.chart(organization.id);
    const margin = chart.find((account) => account.systemKey === "BANK_MARGIN")!;
    expect(margin).toMatchObject({ name: "Margin Amount", accountType: "ASSET", isSystem: true, isControlAccount: true, balance: "4000.00" });
    const entries = await prisma.journalEntry.findMany({ where: { organizationId: organization.id, sourceModule: "TENDER_SECURITY" }, include: { lines: { include: { account: true } } } });
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.lines).toHaveLength(2);
      expect(entry.lines.find((line) => line.account.systemKey === "BANK_MARGIN")!.debit.toFixed(2))
        .toBe(entry.lines.find((line) => line.account.linkedBankAccountId === bank.id)!.credit.toFixed(2));
    }
    await expect(security.create(organization.id, user.id, input)).rejects.toThrow("not eligible");
    expect((await balance(bank.id)).sub(before).toFixed(2)).toBe("-4000.00");
    const bank2 = await cashBank.createBankAccount(organization.id, user.id, {
      accountName: "Second Margin Bank", bankName: "Second Bank", accountNumber: randomUUID(),
      branch: "Test", bankAccountType: "Current", openingBalance: 20000, openingBalanceDate: today,
    });
    const third = await purchase(fixtures[0]!, bank2.id);
    const thirdInput = payload([third.id], bank2.id);
    thirdInput.items[0]!.securityAmount = 10000;
    await security.create(organization.id, user.id, thirdInput);
    const summary = await reports.run(organization.id, "cash-bank", "bank-margin-amount", { page: 1, limit: 1 });
    expect(summary.meta).toMatchObject({ total: 2, totalPages: 2 });
    expect(summary.kpis.find((kpi) => kpi.label === "Net Margin Amount")?.value).toBe("4500.00");
    const detail = await reports.run(organization.id, "cash-bank", "bank-margin-amount", { accountId: bank.id, page: 1, limit: 1 });
    expect(detail.meta).toMatchObject({ total: 2, totalPages: 2 });
    expect(detail.kpis.find((kpi) => kpi.label === "Net Margin Amount")?.value).toBe("4000.00");
    const item = created.items.find((row) => row.documentPurchaseId === first.id)!;
    const drilldown = await reports.run(organization.id, "cash-bank", "bank-margin-amount", { tenderSecurityItemId: item.id });
    expect(drilldown.rows).toHaveLength(1);
    expect(drilldown.rows[0]).toMatchObject({ accountId: bank.id, reference: `PO-${first.id}`, margin: "3000.00", tender: first.tenderId });
    expect((await reports.run(organization.id, "cash-bank", "bank-margin-amount", { dateTo: "2000-01-01" })).rows).toEqual([]);
    expect((await reports.run(fixtures[1]!.organization.id, "cash-bank", "bank-margin-amount", { accountId: bank.id, tenderSecurityItemId: item.id })).rows).toEqual([]);
    const csv = await reports.export(organization.id, user.id, "cash-bank", "bank-margin-amount", { accountId: bank.id, limit: 1 });
    expect(csv.content).toContain(`PO-${first.id}`);
    expect(csv.content).toContain(`PO-${second.id}`);
    const charges = await reports.run(organization.id, "cash-bank", "bank-charges", { accountId: bank.id });
    expect(charges.kpis.find((kpi) => kpi.label === "Net Bank Charges")?.value).toBe("20.00");
    const integrity = await accounting.integrity(organization.id);
    expect(integrity.unbalancedJournalCount).toBe(0);
    expect(integrity.banks.every((row) => row.status === "BALANCED")).toBe(true);
    const work = await app.get(CmsWorksService).create(organization.id, user.id, {
      organizationMasterId: fixtures[0]!.master.id, workName: "Margin stays an asset", workCategory: "Supply",
      contractValue: 2000000, tenderId: first.linkedTenderId!,
    });
    const [project] = await accounting.projectAccounts(organization.id, { projectId: work.id });
    expect(project!.tenderSecurityCost.toFixed(2)).toBe("0.00");
    await expect(accounting.createJournal(organization.id, user.id, {
      journalDate: today, description: "Cannot bypass margin workflow", post: true,
      lines: [{ accountId: margin.id, debit: 1, credit: 0 }, { accountId: chart.find((account) => account.systemKey === "GENERAL_EXPENSE")!.id, debit: 0, credit: 1 }],
    })).rejects.toThrow("control account");
  });

  it("rejects cross-tenant inputs and invalid percentages and rolls everything back in a locked period", async () => {
    const { organization, user, bank } = fixtures[0]!;
    const row = await purchase();
    const input = payload([row.id]);
    const before = await balance(bank.id);
    await expect(security.create(organization.id, user.id, { ...input, bankId: fixtures[1]!.bank.id })).rejects.toThrow("Bank not found");
    await expect(security.create(organization.id, user.id, { ...input, chargeFromAccountId: fixtures[1]!.bank.id })).rejects.toThrow("Charge account not found");
    for (const marginPercentage of [-1, 101]) await expect(security.create(organization.id, user.id, { ...input, items: [{ ...input.items[0]!, marginPercentage }] })).rejects.toThrow("Margin percentage");
    const period = await finance.createPeriod(organization.id, user.id, { label: "Margin locked test", startDate: "2000-01-01", endDate: "2000-12-31" });
    await finance.setPeriodStatus(organization.id, user.id, period.id, "LOCKED");
    await expect(security.create(organization.id, user.id, { ...input, issueDate: "2000-01-01" })).rejects.toThrow("locked for posting");
    expect((await balance(bank.id)).toFixed(2)).toBe(before.toFixed(2));
    expect(await prisma.tenderSecurityItem.count({ where: { documentPurchaseId: row.id } })).toBe(0);
    expect((await prisma.documentPurchase.findUniqueOrThrow({ where: { id: row.id } })).tenderSecurityStatus).toBe("PENDING");
  });

  it("deducts once on concurrent saves and rounds each margin before summing and posting", async () => {
    const owner = fixtures[1]!;
    const row = await purchase(owner);
    const input = payload([row.id], owner.bank.id);
    input.items[0]!.securityAmount = 100.10;
    const before = await balance(owner.bank.id);
    const results = await Promise.allSettled([
      security.create(owner.organization.id, owner.user.id, input),
      security.create(owner.organization.id, owner.user.id, input),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await balance(owner.bank.id)).sub(before).toFixed(2)).toBe("-5.01");
    const saved = await prisma.tenderSecurityItem.findUniqueOrThrow({ where: { documentPurchaseId: row.id } });
    expect(saved.marginAmount.toFixed(2)).toBe("5.01");
    expect(saved.bankFinanceAmount.toFixed(2)).toBe("100.10");
    expect(await prisma.financialTransaction.count({ where: { organizationId: owner.organization.id, sourceModule: "TENDER_SECURITY", sourceId: saved.id } })).toBe(1);
  });

  it("keeps zero-margin saves valid and cash funding at zero bank finance", async () => {
    const owner = fixtures[1]!;
    const row = await purchase(owner);
    const input = payload([row.id], owner.bank.id);
    input.fundingType = "CASH";
    input.items[0]!.marginPercentage = 0;
    const before = await balance(owner.bank.id);
    const result = await security.create(owner.organization.id, owner.user.id, input);
    expect(result).toMatchObject({ bankFinanceAmount: "0.00", marginAmount: "0.00" });
    expect((await balance(owner.bank.id)).toFixed(2)).toBe(before.toFixed(2));
    expect(await prisma.financialTransaction.count({ where: { sourceId: result.items[0]!.id } })).toBe(0);
  });
});
