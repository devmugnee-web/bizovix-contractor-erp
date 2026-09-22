import { BadRequestException, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@bizovix/database";
import { AppModule } from "../src/app.module";
import { validationExceptionFactory } from "../src/common/utils/validation-exception-factory";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { GeneralExpensesService } from "../src/modules/general-expenses/general-expenses.service";
import { ProjectExpensesService } from "../src/modules/project-expenses/project-expenses.service";
import { ReceiptsService } from "../src/modules/receipts/receipts.service";
import { ProjectBillsService } from "../src/modules/project-bills/project-bills.service";
import { BoqService } from "../src/modules/boq/boq.service";
import { VariationOrdersService } from "../src/modules/variation-orders/variation-orders.service";
import { ProjectClosingService } from "../src/modules/project-closing/project-closing.service";
import { AccountingService } from "../src/modules/accounting/accounting.service";
import { CashBankService } from "../src/modules/cash-bank/cash-bank.service";
import { createOrganizationFixture, mapExpenseHeadToPostingLedger, resetTestDatabase } from "./fixtures";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

describe("P0 financial PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let generalExpenses: GeneralExpensesService;
  let projectExpenses: ProjectExpensesService;
  let receipts: ReceiptsService;
  let bills: ProjectBillsService;
  let boqService: BoqService;
  let variations: VariationOrdersService;
  let closing: ProjectClosingService;
  let accounting: AccountingService;
  let cashBank: CashBankService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory }));
    await app.init();
    prisma = app.get(PrismaService);
    generalExpenses = app.get(GeneralExpensesService);
    projectExpenses = app.get(ProjectExpensesService);
    receipts = app.get(ReceiptsService);
    bills = app.get(ProjectBillsService);
    boqService = app.get(BoqService);
    variations = app.get(VariationOrdersService);
    closing = app.get(ProjectClosingService);
    accounting = app.get(AccountingService);
    cashBank = app.get(CashBankService);
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => { await resetTestDatabase(prisma); await app.close(); });

  async function certify(f: Awaited<ReturnType<typeof createOrganizationFixture>>, qty: number) {
    const draft = await bills.saveDraft(f.organization.id, f.user.id, null, { contractId: f.contract.id, billDate: "2026-02-01", items: [{ boqItemId: f.boq.id, currentQty: qty }] });
    await bills.submit(f.organization.id, f.user.id, draft.id);
    return bills.certify(f.organization.id, f.user.id, draft.id);
  }

  it("creates, amends and cancels general/project expenses without losing posted history", async () => {
    const f = await createOrganizationFixture(prisma, "EXP");
    await mapExpenseHeadToPostingLedger(app, f.organization.id, f.user.id, f.expenseHead.id);
    const general = await generalExpenses.create(f.organization.id, f.user.id, { expenseDate: "2026-02-01", expenseHeadId: f.expenseHead.id, amount: 100_000, expenseById: f.user.id, paidFromAccountId: f.bank.id, description: "Original" });
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: f.bank.id } })).currentBalance.toNumber()).toBe(-100_000);
    const journal = await prisma.journalEntry.findFirstOrThrow({ where: { sourceModule: "GENERAL_EXPENSE", sourceId: general.id }, include: { lines: true } });
    expect(journal.lines.reduce((sum, line) => sum.add(line.debit).sub(line.credit), D(0)).isZero()).toBe(true);
    expect(await prisma.auditLog.count({ where: { organizationId: f.organization.id, entityId: general.id } })).toBeGreaterThan(0);

    const amended = await generalExpenses.update(f.organization.id, f.user.id, general.id, { amount: 120_000 });
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: general.id } })).status).toBe("AMENDED");
    expect(amended.replacesExpenseId).toBe(general.id);
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: f.bank.id } })).currentBalance.toNumber()).toBe(-120_000);
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id, OR: [{ sourceModule: "GENERAL_EXPENSE" }, { sourceModule: "JOURNAL_REVERSAL" }] } })).toBe(3);
    await generalExpenses.remove(f.organization.id, f.user.id, amended.id);
    await generalExpenses.remove(f.organization.id, f.user.id, amended.id);
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: f.bank.id } })).currentBalance.toNumber()).toBe(0);

    const project = await projectExpenses.create(f.organization.id, f.user.id, { workId: f.work.id, expenseDate: "2026-02-02", expenseHeadId: f.expenseHead.id, amount: 100_000, expenseById: f.user.id, paidFromAccountId: f.bank.id });
    const projectAmended = await projectExpenses.update(f.organization.id, f.user.id, project.id, { amount: 120_000 });
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: project.id } })).status).toBe("AMENDED");
    expect(projectAmended.replacesExpenseId).toBe(project.id);
    await projectExpenses.remove(f.organization.id, f.user.id, projectAmended.id);
    const cancelled = await projectExpenses.remove(f.organization.id, f.user.id, projectAmended.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(await prisma.expense.count({ where: { id: project.id } })).toBe(1);
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: f.bank.id } })).currentBalance.toNumber()).toBe(0);
  });

  it("applies partial/final receipts and safely cancels/amends allocations", async () => {
    const f = await createOrganizationFixture(prisma, "REC");
    await prisma.projectContract.update({ where: { id: f.contract.id }, data: { retentionPct: null } });
    const bill = await certify(f, 8);
    const receivable = await prisma.receivable.findUniqueOrThrow({ where: { projectBillId: bill.id } });
    expect(receivable.amount.toNumber()).toBe(800_000);
    const base = { receiptDate: "2026-02-05", receiptCategory: "PROJECT" as const, receiptType: "BILL_COLLECTION", workId: f.work.id, receivableId: receivable.id, receivedFrom: "Client", receivedInAccountId: f.bank.id, paymentMethod: "BANK", status: "RECEIVED" as const };
    const first = await receipts.create(f.organization.id, f.user.id, { ...base, amount: 500_000 });
    expect((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).receivedAmount.toNumber()).toBe(500_000);
    expect((await prisma.projectBill.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("PARTIALLY_RECEIVED");
    const second = await receipts.create(f.organization.id, f.user.id, { ...base, amount: 300_000 });
    expect((await prisma.projectBill.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("RECEIVED");
    await receipts.cancel(f.organization.id, f.user.id, second.id);
    await receipts.cancel(f.organization.id, f.user.id, second.id);
    expect((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).receivedAmount.toNumber()).toBe(500_000);
    expect((await prisma.projectBill.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("PARTIALLY_RECEIVED");
    const replacement = await receipts.update(f.organization.id, f.user.id, first.id, { amount: 450_000, grossAmount: 450_000 });
    expect(replacement.replacesReceiptId).toBe(first.id);
    expect((await prisma.receipt.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("CANCELLED");
    expect((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).receivedAmount.toNumber()).toBe(450_000);
  });

  it("prevents concurrent over-allocation in real PostgreSQL", async () => {
    const f = await createOrganizationFixture(prisma, "RACE");
    const bill = await prisma.projectBill.create({ data: { organizationId: f.organization.id, cmsWorkId: f.work.id, contractId: f.contract.id, billNo: "RACE-BILL", billDate: new Date(), grossWorkValue: 100_000, grossBillAmount: 100_000, netCertifiedAmount: 100_000, status: "CERTIFIED", createdById: f.user.id } });
    const receivable = await prisma.receivable.create({ data: { organizationId: f.organization.id, projectId: f.work.id, contractId: f.contract.id, projectBillId: bill.id, partyName: "Client", billNo: bill.billNo, billDate: new Date(), amount: 100_000 } });
    const base = { receiptDate: "2026-02-05", receiptCategory: "PROJECT" as const, receiptType: "BILL_COLLECTION", workId: f.work.id, receivableId: receivable.id, receivedFrom: "Client", receivedInAccountId: f.bank.id, paymentMethod: "BANK", status: "RECEIVED" as const };
    const results = await Promise.allSettled([receipts.create(f.organization.id, f.user.id, { ...base, amount: 80_000 }), receipts.create(f.organization.id, f.user.id, { ...base, amount: 50_000 })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).receivedAmount.toNumber()).toBeLessThanOrEqual(100_000);
  });

  it("retains certified quantity after partial/full collection", async () => {
    const f = await createOrganizationFixture(prisma, "QTY");
    await prisma.projectContract.update({ where: { id: f.contract.id }, data: { retentionPct: null } });
    const firstBill = await certify(f, 30);
    const receivable = await prisma.receivable.findUniqueOrThrow({ where: { projectBillId: firstBill.id } });
    const base = { receiptDate: "2026-02-05", receiptCategory: "PROJECT" as const, receiptType: "BILL_COLLECTION", workId: f.work.id, receivableId: receivable.id, receivedFrom: "Client", receivedInAccountId: f.bank.id, paymentMethod: "BANK", status: "RECEIVED" as const };
    await receipts.create(f.organization.id, f.user.id, { ...base, amount: 1_000_000 });
    await expect(bills.saveDraft(f.organization.id, f.user.id, null, { contractId: f.contract.id, billDate: "2026-03-01", items: [{ boqItemId: f.boq.id, currentQty: 80 }] })).rejects.toBeInstanceOf(BadRequestException);
    await receipts.create(f.organization.id, f.user.id, { ...base, amount: receivable.amount.sub(1_000_000).toNumber() });
    await expect(bills.saveDraft(f.organization.id, f.user.id, null, { contractId: f.contract.id, billDate: "2026-03-01", items: [{ boqItemId: f.boq.id, currentQty: 80 }] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("locks billed BOQ values and applies only backend-authoritative variation impact", async () => {
    const f = await createOrganizationFixture(prisma, "VAR");
    await certify(f, 10);
    await expect(boqService.update(f.organization.id, f.user.id, f.work.id, f.boq.id, { contractQty: 110 })).rejects.toBeInstanceOf(BadRequestException);
    const variation = await variations.saveDraft(f.organization.id, f.user.id, null, { contractId: f.contract.id, variationType: "QUANTITY_CHANGE", title: "Increase", reason: "Approved scope", requestDate: "2026-03-01", items: [{ boqItemId: f.boq.id, description: f.boq.description, revisedQty: 110, revisedRate: 100_000 }] });
    await variations.submit(f.organization.id, f.user.id, variation.id);
    await expect(variations.approve(f.organization.id, f.user.id, variation.id, { approvedAmount: 999 })).rejects.toBeInstanceOf(BadRequestException);
    await variations.approve(f.organization.id, f.user.id, variation.id, { approvedAmount: 1_000_000 });
    const [boq, contract] = await Promise.all([prisma.boqItem.findUniqueOrThrow({ where: { id: f.boq.id } }), prisma.projectContract.findUniqueOrThrow({ where: { id: f.contract.id } })]);
    expect(boq.contractQty.toNumber()).toBe(110); expect(boq.originalQty.toNumber()).toBe(100);
    expect(contract.currentContractValue.toNumber()).toBe(11_000_000); expect(contract.originalContractValue.toNumber()).toBe(10_000_000);
  });

  it("concurrent retention releases cannot exceed outstanding retention", async () => {
    const f = await createOrganizationFixture(prisma, "RET");
    await certify(f, 100);
    const release1 = await closing.createRetentionRelease(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, amount: 600_000 });
    await closing.releaseRetention(f.organization.id, f.user.id, release1.id);
    await expect(closing.createRetentionRelease(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, amount: 500_000 })).rejects.toBeInstanceOf(BadRequestException);
    const [release2, release3] = await Promise.all([
      closing.createRetentionRelease(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, amount: 300_000 }),
      closing.createRetentionRelease(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, amount: 300_000 }),
    ]);
    const concurrent = await Promise.allSettled([
      closing.releaseRetention(f.organization.id, f.user.id, release2.id),
      closing.releaseRetention(f.organization.id, f.user.id, release3.id),
    ]);
    expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await closing.retentionSummary(f.organization.id, f.work.id)).outstandingRetention).toBe("100000.00");
    const finalRelease = await closing.createRetentionRelease(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, amount: 100_000 });
    await closing.releaseRetention(f.organization.id, f.user.id, finalRelease.id);
    const summary = await closing.retentionSummary(f.organization.id, f.work.id);
    expect(summary.outstandingRetention).toBe("0.00");
    expect((await prisma.projectBill.aggregate({ where: { organizationId: f.organization.id }, _sum: { retentionReleasedAmount: true } }))._sum.retentionReleasedAmount?.toNumber()).toBe(1_000_000);
    expect((await accounting.integrity(f.organization.id)).retention.status).toBe("BALANCED");
  });

  it("reconciles AR/AP/banks, protects control accounts, balances trial balance and computes ledger opening", async () => {
    const f = await createOrganizationFixture(prisma, "RECGL");
    await prisma.projectContract.update({ where: { id: f.contract.id }, data: { retentionPct: null } });
    const bill = await certify(f, 5);
    const receivable = await prisma.receivable.findUniqueOrThrow({ where: { projectBillId: bill.id } });
    await receipts.create(f.organization.id, f.user.id, { receiptDate: "2026-02-05", receiptCategory: "PROJECT", receiptType: "BILL_COLLECTION", workId: f.work.id, receivableId: receivable.id, receivedFrom: "Client", amount: 200_000, receivedInAccountId: f.bank.id, paymentMethod: "BANK", status: "RECEIVED" });
    const payable = await accounting.createPayable(f.organization.id, f.user.id, { partyName: "Supplier", billNo: "AP-1", billDate: "2026-02-01", amount: 300_000 });
    await accounting.payPayable(f.organization.id, f.user.id, payable.id, { accountId: f.bank.id, amount: 100_000, paymentDate: "2026-02-10" });
    const totalBeforeTransfer = (await prisma.bankAccount.aggregate({ where: { organizationId: f.organization.id }, _sum: { currentBalance: true } }))._sum.currentBalance?.toNumber();
    await cashBank.transfer(f.organization.id, f.user.id, { fromAccountId: f.bank.id, toAccountId: f.secondBank.id, amount: 100_000, bankCharge: 0, transferDate: "2026-02-11", description: "Internal transfer" });
    const totalAfterTransfer = (await prisma.bankAccount.aggregate({ where: { organizationId: f.organization.id }, _sum: { currentBalance: true } }))._sum.currentBalance?.toNumber();
    expect(totalAfterTransfer).toBe(totalBeforeTransfer);
    const integrity = await accounting.integrity(f.organization.id);
    expect(integrity.ar.status).toBe("BALANCED"); expect(integrity.ap.status).toBe("BALANCED"); expect(integrity.banks.every((bank) => bank.status === "BALANCED")).toBe(true);
    const ar = await prisma.ledgerAccount.findFirstOrThrow({ where: { organizationId: f.organization.id, systemKey: "ACCOUNTS_RECEIVABLE" } });
    const ap = await prisma.ledgerAccount.findFirstOrThrow({ where: { organizationId: f.organization.id, systemKey: "ACCOUNTS_PAYABLE" } });
    const revenue = await prisma.ledgerAccount.findFirstOrThrow({ where: { organizationId: f.organization.id, systemKey: "PROJECT_REVENUE" } });
    await expect(accounting.createJournal(f.organization.id, f.user.id, { journalDate: "2026-02-01", description: "Unsafe AR", post: true, lines: [{ accountId: ar.id, debit: 1, credit: 0 }, { accountId: revenue.id, debit: 0, credit: 1 }] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(accounting.createJournal(f.organization.id, f.user.id, { journalDate: "2026-02-01", description: "Unsafe AP", post: true, lines: [{ accountId: revenue.id, debit: 1, credit: 0 }, { accountId: ap.id, debit: 0, credit: 1 }] })).rejects.toBeInstanceOf(BadRequestException);
    const assetParent = await prisma.ledgerAccount.findFirstOrThrow({ where: { organizationId: f.organization.id, systemKey: "ASSETS" } });
    const equityParent = await prisma.ledgerAccount.findFirstOrThrow({ where: { organizationId: f.organization.id, systemKey: "EQUITY" } });
    const asset = await accounting.createAccount(f.organization.id, f.user.id, { code: "1901", name: "Test Asset", accountType: "ASSET", normalBalance: "DEBIT", parentId: assetParent.id });
    const equity = await accounting.createAccount(f.organization.id, f.user.id, { code: "3901", name: "Test Equity", accountType: "EQUITY", normalBalance: "CREDIT", parentId: equityParent.id });
    await accounting.createJournal(f.organization.id, f.user.id, { journalDate: "2026-01-10", description: "January", post: true, lines: [{ accountId: asset.id, debit: 100_000, credit: 0 }, { accountId: equity.id, debit: 0, credit: 100_000 }] });
    await accounting.createJournal(f.organization.id, f.user.id, { journalDate: "2026-02-10", description: "February", post: true, lines: [{ accountId: asset.id, debit: 0, credit: 20_000 }, { accountId: equity.id, debit: 20_000, credit: 0 }] });
    const ledger = await accounting.ledger(f.organization.id, { accountId: asset.id, dateFrom: "2026-02-01" });
    expect(ledger.summary.openingBalance).toBe("100000.00"); expect(ledger.summary.closingBalance).toBe("80000.00");
    const creditLedger = await accounting.ledger(f.organization.id, { accountId: equity.id, dateFrom: "2026-02-01" });
    expect(creditLedger.summary.openingBalance).toBe("-100000.00"); expect(creditLedger.summary.closingBalance).toBe("-80000.00");
    const lines = await prisma.journalLine.findMany({ where: { journalEntry: { organizationId: f.organization.id, status: "POSTED" } } });
    expect(lines.reduce((sum, line) => sum.add(line.debit).sub(line.credit), D(0)).isZero()).toBe(true);
  });
});
