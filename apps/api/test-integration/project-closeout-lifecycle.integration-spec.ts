import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { TendersService } from "../src/modules/tenders/tenders.service";
import { DocumentPurchasesService } from "../src/modules/document-purchases/document-purchases.service";
import { PgBgService } from "../src/modules/pg-bg/pg-bg.service";
import { ContractsService } from "../src/modules/contracts/contracts.service";
import { ProjectBudgetsService } from "../src/modules/project-budgets/project-budgets.service";
import { BoqService } from "../src/modules/boq/boq.service";
import { ProjectBillsService } from "../src/modules/project-bills/project-bills.service";
import { ReceiptsService } from "../src/modules/receipts/receipts.service";
import { ProjectClosingService } from "../src/modules/project-closing/project-closing.service";
import { AccountingService } from "../src/modules/accounting/accounting.service";
import { createIdentityFixture, resetTestDatabase } from "./fixtures";

describe("Full service-driven Tender to Project Close lifecycle", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenders: TendersService;
  let purchases: DocumentPurchasesService;
  let pgBg: PgBgService;
  let contracts: ContractsService;
  let budgets: ProjectBudgetsService;
  let boq: BoqService;
  let bills: ProjectBillsService;
  let receipts: ReceiptsService;
  let closing: ProjectClosingService;
  let accounting: AccountingService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); await app.init();
    prisma = app.get(PrismaService); tenders = app.get(TendersService); purchases = app.get(DocumentPurchasesService);
    pgBg = app.get(PgBgService); contracts = app.get(ContractsService); budgets = app.get(ProjectBudgetsService);
    boq = app.get(BoqService); bills = app.get(ProjectBillsService); receipts = app.get(ReceiptsService);
    closing = app.get(ProjectClosingService); accounting = app.get(AccountingService);
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => { await resetTestDatabase(prisma); await app.close(); });

  it("closes a financially reconciled Tender to Project lifecycle using authoritative business services", async () => {
    const f = await createIdentityFixture(prisma, "E2E");
    const tender = await tenders.create(f.organization.id, f.user.id, { organizationMasterId: f.master.id, egpTenderId: "E2E-001", workName: "Service-driven closeout", category: "Civil Works", contractValue: 1_000_000, status: "DRAFT", submissionDeadline: "2026-01-10" });
    await tenders.submit(f.organization.id, f.user.id, tender.id, { submissionDate: "2026-01-09", submissionMethod: "e-GP", quotedAmount: 1_000_000, submittedByName: f.user.name, submissionReference: "SUB-E2E" });
    const purchase = await purchases.create(f.organization.id, f.user.id, { purchaseType: "EGP", tenderId: "E2E-001", linkedTenderId: tender.id, organizationMasterId: f.master.id, tenderWorkName: tender.workName, purchaseDate: "2026-01-02", documentPrice: 1, paymentFromAccountId: f.bank.id, category: "Civil Works" });
    const workflow = await pgBg.saveDraft(f.organization.id, f.user.id, { documentPurchaseId: purchase.id, noaDate: "2026-01-15", noaAmount: 1_000_000, pgBgRequired: true, contact: { name: "Project Director", designation: "PD", mobile: "01700000000", address: "Dhaka" } });
    expect(workflow.workCategory).toBe("Civil Works");
    const accepted = await pgBg.acceptNoa(f.organization.id, f.user.id, workflow.id, { acceptNoa: true, pgBgRequired: true });
    expect(accepted.cmsWorkId).toBeNull();
    const guarantee = await pgBg.finalize(f.organization.id, f.user.id, workflow.id, { type: "PG", bankAccountId: f.bank.id, instrumentNo: "PG-E2E-001", amount: 100_000, issueDate: "2026-01-16", expiryDate: "2027-12-31" });
    const work = await prisma.cmsWork.findFirstOrThrow({ where: { organizationId: f.organization.id, pgBgWorkflowId: workflow.id } });
    expect(guarantee.cmsWorkId).toBe(work.id);
    const repeatedFinalize = await pgBg.finalize(f.organization.id, f.user.id, workflow.id, { type: "PG", bankAccountId: f.bank.id, instrumentNo: "PG-E2E-001", amount: 100_000, issueDate: "2026-01-16", expiryDate: "2027-12-31" });
    expect(repeatedFinalize.id).toBe(guarantee.id);
    expect(repeatedFinalize.cmsWorkId).toBe(work.id);
    const contract = await contracts.create(f.organization.id, f.user.id, { cmsWorkId: work.id, tenderId: tender.id, pgBgWorkflowId: workflow.id, contractNo: "CON-E2E-001", issueDate: "2026-01-16", contractDate: "2026-01-16", originalContractValue: 1_000_000, commencementDate: "2026-01-20", originalCompletionDate: "2026-12-31", dlpDays: 30, retentionPct: 10, status: "DRAFT" });
    await contracts.activate(f.organization.id, f.user.id, contract.id);
    const budget = await budgets.saveDraft(f.organization.id, f.user.id, work.id, { lines: [{ category: "Execution", description: "Approved execution budget", amount: 800_000 }] });
    await budgets.approve(f.organization.id, f.user.id, work.id, budget.id);
    const item = await boq.create(f.organization.id, f.user.id, work.id, { itemCode: "BOQ-E2E", description: "Complete works", unit: "Lot", contractQty: 10, unitRate: 100_000 });

    const certifyAndCollect = async (billType: "RUNNING" | "FINAL", qty: number, date: string) => {
      const draft = await bills.saveDraft(f.organization.id, f.user.id, null, { contractId: contract.id, billType, billDate: date, items: [{ boqItemId: item.id, currentQty: qty }] });
      await bills.submit(f.organization.id, f.user.id, draft.id);
      const certified = await bills.certify(f.organization.id, f.user.id, draft.id);
      const receivable = await prisma.receivable.findUniqueOrThrow({ where: { projectBillId: certified.id } });
      await receipts.create(f.organization.id, f.user.id, { receiptDate: date, receiptCategory: "PROJECT", receiptType: "BILL_COLLECTION", workId: work.id, receivableId: receivable.id, receivedFrom: f.master.shortName, amount: receivable.amount.toNumber(), receivedInAccountId: f.bank.id, paymentMethod: "BANK", status: "RECEIVED" });
      return certified;
    };
    await certifyAndCollect("RUNNING", 4, "2026-06-30");
    await certifyAndCollect("FINAL", 6, "2026-12-31");

    const certificate = await closing.saveCertificate(f.organization.id, f.user.id, work.id, { contractId: contract.id, applicationDate: "2026-12-31", actualCompletionDate: "2026-12-31", certifiedCompletionDate: "2026-12-31", certificateDate: "2027-01-02", issuingAuthority: "Project Director" });
    await closing.certificateStatus(f.organization.id, f.user.id, certificate.id, { status: "SUBMITTED" });
    await closing.certificateStatus(f.organization.id, f.user.id, certificate.id, { status: "APPROVED" });
    const dlp = await closing.createDlp(f.organization.id, f.user.id, work.id, { completionCertificateId: certificate.id, durationDays: 30 });
    await closing.completeDlp(f.organization.id, f.user.id, dlp.id);

    const retention = await closing.createRetentionRelease(f.organization.id, f.user.id, work.id, { contractId: contract.id, amount: 100_000, reference: "RET-E2E" });
    await closing.releaseRetention(f.organization.id, f.user.id, retention.id);
    const retentionReceivable = await prisma.receivable.findFirstOrThrow({ where: { organizationId: f.organization.id, projectId: work.id, billNo: retention.releaseNo } });
    await receipts.create(f.organization.id, f.user.id, { receiptDate: "2027-02-01", receiptCategory: "PROJECT", receiptType: "RETENTION_COLLECTION", workId: work.id, receivableId: retentionReceivable.id, receivedFrom: f.master.shortName, amount: retentionReceivable.amount.toNumber(), receivedInAccountId: f.bank.id, paymentMethod: "BANK", status: "RECEIVED" });
    await pgBg.requestRelease(f.organization.id, f.user.id, guarantee.id, { releaseRequestDate: "2027-02-01", remarks: "DLP complete" });
    await pgBg.release(f.organization.id, f.user.id, guarantee.id, { releaseDate: "2027-02-02", releaseReference: "PG-REL-E2E" });
    const handover = await closing.createHandover(f.organization.id, f.user.id, work.id, { contractId: contract.id, completionCertificateId: certificate.id, handoverType: "FINAL", handoverDate: "2027-02-02", handedOverBy: "Contractor", receivedBy: "Client", authority: "Project Director" });
    await closing.completeHandover(f.organization.id, f.user.id, handover.id);

    expect((await closing.readiness(f.organization.id, work.id)).status).toBe("READY_TO_CLOSE");
    const concurrentClose = await Promise.allSettled([
      closing.close(f.organization.id, f.user.id, work.id, {}, false),
      closing.close(f.organization.id, f.user.id, work.id, {}, false),
    ]);
    expect(concurrentClose.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(concurrentClose.filter((result) => result.status === "rejected")).toHaveLength(1);
    const closed = concurrentClose.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<ProjectClosingService["close"]>>> => result.status === "fulfilled")!.value;
    expect(closed.status).toBe("COMPLETED");
    const closeEvents = await prisma.projectClosureEvent.findMany({ where: { organizationId: f.organization.id, workId: work.id, action: "CLOSE" } });
    expect(closeEvents.filter((event) => event.readinessSnapshot !== null)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { organizationId: f.organization.id, entityId: work.id, action: "PROJECT_CLOSED" } })).toBe(1);
    const integrity = await accounting.integrity(f.organization.id);
    expect([integrity.ar.status, integrity.ap.status, integrity.retention.status]).toEqual(["BALANCED", "BALANCED", "BALANCED"]);
    expect(integrity.banks.every((bank) => bank.status === "BALANCED")).toBe(true);
    expect(integrity.unbalancedJournalCount).toBe(0);
    const totals = await prisma.journalLine.aggregate({ where: { journalEntry: { organizationId: f.organization.id, status: "POSTED" } }, _sum: { debit: true, credit: true } });
    expect(totals._sum.debit?.equals(totals._sum.credit ?? 0)).toBe(true);
    const projectReceivables = await prisma.receivable.findMany({ where: { organizationId: f.organization.id, projectId: work.id } });
    expect(projectReceivables.every((row) => row.receivedAmount.gte(row.amount))).toBe(true);
    expect((await closing.retentionSummary(f.organization.id, work.id)).outstandingRetention).toBe("0.00");
    expect((await prisma.performanceGuarantee.findUniqueOrThrow({ where: { id: guarantee.id } })).status).toBe("RELEASED");
    expect((await prisma.projectHandover.findUniqueOrThrow({ where: { id: handover.id } })).status).toBe("COMPLETED");
    expect((await prisma.defectLiabilityPeriod.findUniqueOrThrow({ where: { id: dlp.id } })).status).toBe("COMPLETED");
    const duplicateSources = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM (SELECT "sourceModule", "sourceType", "sourceId", COUNT(*) FROM "journal_entries" WHERE "organizationId" = ${f.organization.id} GROUP BY 1,2,3 HAVING COUNT(*) > 1) duplicates`;
    expect(Number(duplicateSources[0]?.count ?? 0)).toBe(0);
  });

  it("keeps no-PG work creation and rejected NOA decisions terminal and idempotent", async () => {
    const f = await createIdentityFixture(prisma, "PG-BG-STATES");
    const createWorkflow = async (suffix: string) => {
      const tender = await tenders.create(f.organization.id, f.user.id, {
        organizationMasterId: f.master.id,
        egpTenderId: `PG-BG-${suffix}`,
        workName: `PG/BG state ${suffix}`,
        category: "Electrical Works",
        contractValue: 250_000,
        status: "DRAFT",
        submissionDeadline: "2026-03-10",
      });
      const purchase = await purchases.create(f.organization.id, f.user.id, {
        purchaseType: "EGP",
        tenderId: `PG-BG-${suffix}`,
        linkedTenderId: tender.id,
        organizationMasterId: f.master.id,
        tenderWorkName: tender.workName,
        purchaseDate: "2026-03-01",
        documentPrice: 1,
        paymentFromAccountId: f.bank.id,
        category: "Electrical Works",
      });
      const workflow = await pgBg.saveDraft(f.organization.id, f.user.id, {
        documentPurchaseId: purchase.id,
        noaDate: "2026-03-12",
        noaAmount: 250_000,
        contact: {
          name: "Project Engineer",
          designation: "PE",
          mobile: `01700000${suffix}`,
          address: "Dhaka",
        },
      });
      return { purchase, workflow };
    };

    const direct = await createWorkflow("101");
    const created = await pgBg.acceptNoa(
      f.organization.id,
      f.user.id,
      direct.workflow.id,
      { acceptNoa: true, pgBgRequired: false },
    );
    expect(created.cmsWorkId).not.toBeNull();
    const retried = await pgBg.acceptNoa(
      f.organization.id,
      f.user.id,
      direct.workflow.id,
      { acceptNoa: true, pgBgRequired: false },
    );
    expect(retried.cmsWorkId).toBe(created.cmsWorkId);
    expect(
      await prisma.cmsWork.count({
        where: { organizationId: f.organization.id, documentPurchaseId: direct.purchase.id },
      }),
    ).toBe(1);
    await expect(
      pgBg.saveDraft(f.organization.id, f.user.id, {
        documentPurchaseId: direct.purchase.id,
        noaAmount: 260_000,
      }),
    ).rejects.toThrow("already been moved to Ongoing Works");

    const rejected = await createWorkflow("102");
    const rejectedDecision = await pgBg.acceptNoa(
      f.organization.id,
      f.user.id,
      rejected.workflow.id,
      { acceptNoa: false, pgBgRequired: false },
    );
    expect(rejectedDecision.cmsWorkId).toBeNull();
    const repeatedRejection = await pgBg.acceptNoa(
      f.organization.id,
      f.user.id,
      rejected.workflow.id,
      { acceptNoa: false, pgBgRequired: false },
    );
    expect(repeatedRejection.cmsWorkId).toBeNull();
    await expect(
      pgBg.acceptNoa(f.organization.id, f.user.id, rejected.workflow.id, {
        acceptNoa: true,
        pgBgRequired: false,
      }),
    ).rejects.toThrow("cannot be changed");
    expect(
      await prisma.cmsWork.count({
        where: { organizationId: f.organization.id, documentPurchaseId: rejected.purchase.id },
      }),
    ).toBe(0);

    const eligible = await pgBg.eligibleTenders(f.organization.id, { page: 1, limit: 10 });
    expect(eligible.items.map((item) => item.id)).not.toContain(direct.purchase.id);
    expect(eligible.items.map((item) => item.id)).not.toContain(rejected.purchase.id);
  });
});
