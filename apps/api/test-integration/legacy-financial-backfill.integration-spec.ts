import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { CashBankService } from "../src/modules/cash-bank/cash-bank.service";
import { AccountingService } from "../src/modules/accounting/accounting.service";
import { LegacyFinancialBackfillService } from "../src/modules/accounting/legacy-financial-backfill.service";
import { createOrganizationFixture, mapExpenseHeadToPostingLedger, resetTestDatabase } from "./fixtures";

describe("legacy financial backfill", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accounting: AccountingService;
  let service: LegacyFinancialBackfillService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    accounting = app.get(AccountingService);
    service = new LegacyFinancialBackfillService(prisma, app.get(CashBankService), accounting);
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => { await resetTestDatabase(prisma); await app.close(); });

  it("replays provable legacy events once, preserves snapshots/allocations, skips ambiguity, and isolates tenants", async () => {
    const f = await createOrganizationFixture(prisma, "LEGACY");
    const other = await createOrganizationFixture(prisma, "OTHER");
    await mapExpenseHeadToPostingLedger(app, f.organization.id, f.user.id, f.expenseHead.id);
    await prisma.projectContract.update({ where: { id: f.contract.id }, data: { retentionPct: 25 } });
    await prisma.bankAccount.update({ where: { id: f.bank.id }, data: { currentBalance: 500 } });
    await prisma.financialTransaction.create({ data: { organizationId: f.organization.id, transactionNo: "FT-LEGACY-OPEN", accountId: f.bank.id, direction: "IN", amount: 500, balanceAfter: 500, sourceModule: "MAIN_CASH", sourceType: "Opening Float", sourceId: "legacy-opening", description: "Provable opening float", transactionDate: new Date("2024-01-01"), createdById: f.user.id } });
    const expense = await prisma.expense.create({ data: { organizationId: f.organization.id, workId: f.work.id, expenseHeadId: f.expenseHead.id, paidFromAccountId: f.bank.id, category: f.expenseHead.name, amount: 50, expenseDate: new Date("2024-01-02"), status: "APPROVED", referenceNo: "LEG-EXP", createdById: f.user.id } });
    const ambiguous = await prisma.expense.create({ data: { organizationId: f.organization.id, amount: 5, expenseDate: new Date("2024-01-02"), status: "APPROVED", referenceNo: "LEG-AMB", createdById: f.user.id } });
    await prisma.expense.create({ data: { organizationId: other.organization.id, amount: 999, expenseDate: new Date("2024-01-02"), status: "APPROVED", referenceNo: "OTHER-AMB", createdById: other.user.id } });
    const bill = await prisma.projectBill.create({ data: { organizationId: f.organization.id, cmsWorkId: f.work.id, contractId: f.contract.id, billNo: "LEG-BILL", billDate: new Date("2024-01-03"), grossWorkValue: 100, grossBillAmount: 100, retentionPct: 10, retentionAmount: 10, netCertifiedAmount: 90, receivedAmount: 20, status: "PARTIALLY_RECEIVED", createdById: f.user.id } });
    const receivable = await prisma.receivable.create({ data: { organizationId: f.organization.id, projectId: f.work.id, contractId: f.contract.id, projectBillId: bill.id, partyName: f.master.shortName, billNo: bill.billNo, billDate: bill.billDate, amount: 90, receivedAmount: 20, status: "PARTIALLY_RECEIVED", createdById: f.user.id } });
    const receipt = await prisma.receipt.create({ data: { organizationId: f.organization.id, workId: f.work.id, receiptNo: "LEG-REC", receiptCategory: "PROJECT", receiptType: "BILL_COLLECTION", receivedFrom: f.master.shortName, receivedInAccountId: f.bank.id, paymentMethod: "BANK", amount: 20, receiptDate: new Date("2024-01-04"), status: "RECEIVED", receivableId: receivable.id, createdById: f.user.id } });

    const dry = await service.plan(f.organization.id);
    expect(dry.proposed.journals).toBe(4);
    expect(dry.proposed.financialTransactions).toBe(2);
    expect(dry.manualReview.some((x) => x.id === ambiguous.id)).toBe(true);
    expect(dry.manualReview.some((x) => x.module === "EXPENSE" && x.amount === "999.00")).toBe(false);
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id } })).toBe(0);

    const first = await service.apply(f.organization.id, f.user.id);
    expect(first.created.journals).toBe(4);
    expect(first.created.financialTransactions).toBe(2);
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id, sourceModule: "PROJECT_EXPENSE", sourceId: expense.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id, sourceModule: "RECEIPT", sourceId: receipt.id } })).toBe(1);
    expect((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).receivedAmount.toNumber()).toBe(20);
    const billJournal = await prisma.journalEntry.findFirstOrThrow({ where: { organizationId: f.organization.id, sourceModule: "PROJECT_BILL", sourceId: bill.id }, include: { lines: { include: { account: true } } } });
    expect(billJournal.lines.find((x) => x.account.systemKey === "RETENTION_RECEIVABLE")?.debit.toNumber()).toBe(10);
    expect(billJournal.lines.find((x) => x.account.systemKey === "PROJECT_REVENUE")?.credit.toNumber()).toBe(100);
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: f.bank.id } })).currentBalance.toNumber()).toBe(470);
    const integrity = await accounting.integrity(f.organization.id);
    expect(integrity.ar.status).toBe("BALANCED");
    expect(integrity.ap.status).toBe("BALANCED");
    expect(integrity.retention.status).toBe("BALANCED");
    expect(integrity.banks.every((x) => x.status === "BALANCED")).toBe(true);
    const postedLines = await prisma.journalLine.findMany({ where: { journalEntry: { organizationId: f.organization.id, status: "POSTED" } } });
    expect(postedLines.reduce((sum, x) => sum + x.debit.toNumber() - x.credit.toNumber(), 0)).toBe(0);

    const second = await service.apply(f.organization.id, f.user.id);
    expect(second.created.journals).toBe(0);
    expect(second.created.financialTransactions).toBe(0);
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id } })).toBe(4);
    expect(await prisma.financialTransaction.count({ where: { organizationId: f.organization.id } })).toBe(3);
    expect(await prisma.journalEntry.count({ where: { organizationId: other.organization.id } })).toBe(0);
  });
});
