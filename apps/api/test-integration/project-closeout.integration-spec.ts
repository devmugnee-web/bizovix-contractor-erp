import { BadRequestException, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { ProjectClosingService } from "../src/modules/project-closing/project-closing.service";
import { ProjectBillsService } from "../src/modules/project-bills/project-bills.service";
import { ReceiptsService } from "../src/modules/receipts/receipts.service";
import { AccountingService } from "../src/modules/accounting/accounting.service";
import { RemindersService } from "../src/modules/reminders/reminders.service";
import { ReportsService } from "../src/modules/reports/reports.service";
import { createOrganizationFixture, resetTestDatabase } from "./fixtures";

describe("Project closeout PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let closing: ProjectClosingService;
  let bills: ProjectBillsService;
  let receipts: ReceiptsService;
  let accounting: AccountingService;
  let reminders: RemindersService;
  let reports: ReportsService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    closing = app.get(ProjectClosingService);
    bills = app.get(ProjectBillsService);
    receipts = app.get(ReceiptsService);
    accounting = app.get(AccountingService);
    reminders = app.get(RemindersService);
    reports = app.get(ReportsService);
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => { await resetTestDatabase(prisma); await app.close(); });

  async function approvedCertificate(f: Awaited<ReturnType<typeof createOrganizationFixture>>) {
    const certificate = await closing.saveCertificate(f.organization.id, f.user.id, f.work.id, {
      contractId: f.contract.id, applicationDate: "2026-09-01", actualCompletionDate: "2026-09-01",
      certifiedCompletionDate: "2026-09-01", certificateDate: "2026-09-02", issuingAuthority: "Project Director",
    });
    await closing.certificateStatus(f.organization.id, f.user.id, certificate.id, { status: "SUBMITTED" });
    return closing.certificateStatus(f.organization.id, f.user.id, certificate.id, { status: "APPROVED" });
  }

  it("cannot close without approved Completion Certificate", async () => {
    const f = await createOrganizationFixture(prisma, "CC");
    await expect(closing.close(f.organization.id, f.user.id, f.work.id, {}, false)).rejects.toThrow();
    const certificate = await approvedCertificate(f);
    expect(certificate.status).toBe("APPROVED");
    expect(certificate.contractId).toBe(f.contract.id);
    expect(await prisma.auditLog.count({ where: { organizationId: f.organization.id, entityId: certificate.id } })).toBe(3);
  });

  it("cannot close without required Final Bill", async () => {
    const f = await createOrganizationFixture(prisma, "NO-FINAL");
    await prisma.projectContract.update({ where: { id: f.contract.id }, data: { retentionPct: null, dlpDays: null } });
    await approvedCertificate(f);
    const handover = await closing.createHandover(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, handoverDate: "2026-09-03", handedOverBy: "Contractor", receivedBy: "Client", authority: "Project Director" });
    await closing.completeHandover(f.organization.id, f.user.id, handover.id);
    expect((await closing.readiness(f.organization.id, f.work.id)).items.find((item) => item.key === "final_bill")?.passed).toBe(false);
    await expect(closing.close(f.organization.id, f.user.id, f.work.id, {}, false)).rejects.toThrow();
  });

  it("cannot close while applicable DLP is active", async () => {
    const f = await createOrganizationFixture(prisma, "ACTIVE-DLP");
    const certificate = await approvedCertificate(f);
    await closing.createDlp(f.organization.id, f.user.id, f.work.id, { completionCertificateId: certificate.id, durationDays: 30 });
    expect((await closing.readiness(f.organization.id, f.work.id)).items.find((item) => item.key === "dlp")?.passed).toBe(false);
    await expect(closing.close(f.organization.id, f.user.id, f.work.id, {}, false)).rejects.toThrow();
  });

  it("cannot release retention above available outstanding retention", async () => {
    const f = await createOrganizationFixture(prisma, "OVER-RET");
    await expect(closing.createRetentionRelease(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, amount: 1 })).rejects.toThrow();
  });

  it("cannot close with required PG/BG still pending", async () => {
    const f = await createOrganizationFixture(prisma, "PG-PENDING");
    const purchase = await prisma.documentPurchase.create({ data: { organizationId: f.organization.id, purchaseType: "MANUAL", linkedTenderId: f.tender.id, organizationMasterId: f.master.id, paymentFromAccountId: f.bank.id, tenderWorkName: f.tender.workName, purchaseDate: new Date("2026-01-01"), documentPrice: 0, createdById: f.user.id } });
    const workflow = await prisma.pgBgWorkflow.create({ data: { organizationId: f.organization.id, documentPurchaseId: purchase.id, organizationMasterId: f.master.id, pgBgRequired: true, status: "FINALIZED", createdById: f.user.id } });
    await prisma.cmsWork.update({ where: { id: f.work.id }, data: { pgBgWorkflowId: workflow.id } });
    await prisma.projectContract.update({ where: { id: f.contract.id }, data: { pgBgWorkflowId: workflow.id } });
    expect((await closing.readiness(f.organization.id, f.work.id)).items.find((item) => item.key === "guarantee")?.passed).toBe(false);
    await expect(closing.close(f.organization.id, f.user.id, f.work.id, {}, false)).rejects.toThrow();
  });

  it("cannot close without required final Handover", async () => {
    const f = await createOrganizationFixture(prisma, "NO-HANDOVER");
    expect((await closing.readiness(f.organization.id, f.work.id)).items.find((item) => item.key === "handover")?.passed).toBe(false);
    await expect(closing.close(f.organization.id, f.user.id, f.work.id, {}, false)).rejects.toThrow();
  });

  it("cannot close when financial integrity is out of balance", async () => {
    const f = await createOrganizationFixture(prisma, "BAD-GL");
    const account = await prisma.ledgerAccount.create({ data: { organizationId: f.organization.id, code: "BAD-GL", name: "Bad GL", accountType: "ASSET", normalBalance: "DEBIT" } });
    await prisma.journalEntry.create({ data: { organizationId: f.organization.id, journalNo: "BAD-GL", journalDate: new Date(), description: "Mismatch fixture", sourceModule: "TEST", sourceType: "MISMATCH", sourceId: "bad-gl", status: "POSTED", lines: { create: [{ accountId: account.id, debit: 1, credit: 0 }] } } });
    await expect(closing.close(f.organization.id, f.user.id, f.work.id, {}, false)).rejects.toThrow("financial integrity");
  });

  it("successful project close creates one audit record and readiness snapshot", async () => {
    const f = await createOrganizationFixture(prisma, "CLOSE-EVIDENCE");
    await closing.close(f.organization.id, f.user.id, f.work.id, { override: true, reason: "Acceptance evidence fixture" }, true);
    expect(await prisma.auditLog.count({ where: { organizationId: f.organization.id, entityId: f.work.id, action: "PROJECT_CLOSED" } })).toBe(1);
    const events = await prisma.projectClosureEvent.findMany({ where: { organizationId: f.organization.id, workId: f.work.id, action: "CLOSE" } });
    expect(events).toHaveLength(1);
    expect(events[0]?.readinessSnapshot).not.toBeNull();
  });

  it("Archived project remains readable and reportable", async () => {
    const f = await createOrganizationFixture(prisma, "ARCHIVE-READ");
    const certificate = await approvedCertificate(f);
    const bill = await bills.saveDraft(f.organization.id, f.user.id, null, {
      contractId: f.contract.id,
      billType: "FINAL",
      billDate: "2026-09-01",
      items: [{ boqItemId: f.boq.id, currentQty: 10 }],
    });
    const document = await prisma.document.create({
      data: {
        organizationId: f.organization.id,
        name: "Project closeout record",
        relatedModule: "PROJECT_CLOSEOUT",
        relatedEntityId: f.work.id,
        workId: f.work.id,
        contractId: f.contract.id,
        completionCertificateId: certificate.id,
        createdById: f.user.id,
      },
    });
    await closing.close(f.organization.id, f.user.id, f.work.id, { override: true, reason: "Archive readability fixture" }, true);
    await closing.archive(f.organization.id, f.user.id, f.work.id, { reason: "Historical archive" });
    const overview = await closing.overview(f.organization.id, f.work.id);
    expect(overview.readiness.project.status).toBe("ARCHIVED");
    expect(overview.certificates.some((item) => item.id === certificate.id)).toBe(true);
    expect(await prisma.projectContract.count({ where: { organizationId: f.organization.id, cmsWorkId: f.work.id } })).toBe(1);
    expect(await prisma.boqItem.count({ where: { organizationId: f.organization.id, cmsWorkId: f.work.id } })).toBe(1);
    expect((await prisma.projectBill.findFirstOrThrow({ where: { organizationId: f.organization.id, cmsWorkId: f.work.id, id: bill.id } })).id).toBe(bill.id);
    expect((await prisma.document.findFirstOrThrow({ where: { organizationId: f.organization.id, workId: f.work.id, id: document.id } })).id).toBe(document.id);
    const report = await reports.run(f.organization.id, "projects", "closeout-status", {});
    expect(report.rows.some((row) => row.project === f.work.workName)).toBe(true);
    await expect(closing.saveCertificate(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, applicationDate: "2026-09-01", actualCompletionDate: "2026-09-01" })).rejects.toThrow("Reopen the project");
  });

  it("DLP extension preserves original end date", async () => {
    const f = await createOrganizationFixture(prisma, "DLP");
    const certificate = await approvedCertificate(f);
    const dlp = await closing.createDlp(f.organization.id, f.user.id, f.work.id, { completionCertificateId: certificate.id, durationDays: 365 });
    expect(dlp.endDate.toISOString().slice(0, 10)).toBe("2027-09-01");
    const extended = await closing.extendDlp(f.organization.id, f.user.id, dlp.id, { extensionDays: 30, reason: "Approved rectification extension" });
    expect(extended.endDate.toISOString().slice(0, 10)).toBe("2027-10-01");
    const history = await prisma.dlpExtension.findFirstOrThrow({ where: { dlpId: dlp.id } });
    expect(history.previousEndDate.toISOString().slice(0, 10)).toBe("2027-09-01");
    expect((await prisma.defectLiabilityPeriod.findUniqueOrThrow({ where: { id: dlp.id } })).originalEndDate?.toISOString().slice(0, 10)).toBe("2027-09-01");
  });

  it("cannot close with an open blocking defect", async () => {
    const f = await createOrganizationFixture(prisma, "DEF");
    const certificate = await approvedCertificate(f);
    const dlp = await closing.createDlp(f.organization.id, f.user.id, f.work.id, { completionCertificateId: certificate.id, durationDays: 365 });
    const defect = await closing.createDefect(f.organization.id, f.user.id, f.work.id, { dlpId: dlp.id, description: "Water leakage", reportedDate: "2026-10-01", mandatory: true, priority: "CRITICAL" });
    expect((await closing.readiness(f.organization.id, f.work.id)).items.find((item) => item.key === "defects")?.passed).toBe(false);
    await closing.defectStatus(f.organization.id, f.user.id, defect.id, { status: "IN_PROGRESS" });
    await closing.defectStatus(f.organization.id, f.user.id, defect.id, { status: "RECTIFIED" });
    await closing.defectStatus(f.organization.id, f.user.id, defect.id, { status: "VERIFIED" });
    await closing.defectStatus(f.organization.id, f.user.id, defect.id, { status: "CLOSED" });
    await closing.completeDlp(f.organization.id, f.user.id, dlp.id);
    expect((await closing.readiness(f.organization.id, f.work.id)).items.find((item) => item.key === "defects")?.passed).toBe(true);
  });

  it("Final Bill remains constrained by current approved BOQ ceiling", async () => {
    const f = await createOrganizationFixture(prisma, "FINAL");
    const payload = { contractId: f.contract.id, billType: "FINAL" as const, billDate: "2026-09-01", items: [{ boqItemId: f.boq.id, currentQty: 10 }] };
    await bills.saveDraft(f.organization.id, f.user.id, null, payload);
    await expect(bills.saveDraft(f.organization.id, f.user.id, null, payload)).rejects.toBeDefined();
  });

  it("uses authoritative cost, certified revenue and cash separately in profitability", async () => {
    const f = await createOrganizationFixture(prisma, "PROFIT");
    await prisma.expense.create({ data: { organizationId: f.organization.id, workId: f.work.id, category: "Cost", amount: 400_000, expenseDate: new Date("2026-09-01"), status: "APPROVED", createdById: f.user.id } });
    await prisma.projectBill.create({ data: { organizationId: f.organization.id, cmsWorkId: f.work.id, contractId: f.contract.id, billNo: "FINAL-PROFIT", billType: "FINAL", billDate: new Date("2026-09-01"), grossBillAmount: 800_000, grossWorkValue: 800_000, netCertifiedAmount: 700_000, status: "CERTIFIED", createdById: f.user.id } });
    await prisma.receipt.create({ data: { organizationId: f.organization.id, workId: f.work.id, receiptDate: new Date("2026-09-02"), receiptCategory: "PROJECT", receiptType: "BILL_COLLECTION", receivedFrom: "Client", amount: 500_000, receivedInAccountId: f.bank.id, paymentMethod: "BANK", status: "RECEIVED", createdById: f.user.id } });
    const result = await closing.profitability(f.organization.id, f.work.id);
    expect(result.finalProjectCost).toBe("400000.00");
    expect(result.totalCertified).toBe("800000.00");
    expect(result.totalReceived).toBe("500000.00");
    expect(result.grossProfitLoss).toBe("400000.00");
  });

  it("cross-tenant closeout mutation is rejected", async () => {
    const a = await createOrganizationFixture(prisma, "TEN-A");
    const b = await createOrganizationFixture(prisma, "TEN-B");
    await expect(closing.saveCertificate(a.organization.id, a.user.id, a.work.id, { contractId: b.contract.id, applicationDate: "2026-09-01", actualCompletionDate: "2026-09-01" })).rejects.toThrow();
    const certificate = await approvedCertificate(b);
    await expect(closing.createDlp(a.organization.id, a.user.id, a.work.id, { completionCertificateId: certificate.id, durationDays: 365 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(closing.createHandover(a.organization.id, a.user.id, a.work.id, { contractId: b.contract.id, handoverDate: "2026-09-01", handedOverBy: "A", receivedBy: "B", authority: "Client" })).rejects.toThrow();
  });

  it("fully satisfied project can close", async () => {
    const f = await createOrganizationFixture(prisma, "CLOSE");
    await prisma.projectContract.update({ where: { id: f.contract.id }, data: { retentionPct: null, dlpDays: null } });
    await approvedCertificate(f);
    const draft = await bills.saveDraft(f.organization.id, f.user.id, null, { contractId: f.contract.id, billType: "FINAL", billDate: "2026-09-01", items: [{ boqItemId: f.boq.id, currentQty: 10 }] });
    await bills.submit(f.organization.id, f.user.id, draft.id);
    const finalBill = await bills.certify(f.organization.id, f.user.id, draft.id);
    const receivable = await prisma.receivable.findUniqueOrThrow({ where: { projectBillId: finalBill.id } });
    await receipts.create(f.organization.id, f.user.id, { receiptDate: "2026-09-05", receiptCategory: "PROJECT", receiptType: "BILL_COLLECTION", workId: f.work.id, receivableId: receivable.id, receivedFrom: "Client", amount: receivable.amount.toNumber(), receivedInAccountId: f.bank.id, paymentMethod: "BANK", status: "RECEIVED" });
    const handover = await closing.createHandover(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, handoverDate: "2026-09-03", handedOverBy: "Contractor", receivedBy: "Client", authority: "Project Director" });
    await closing.completeHandover(f.organization.id, f.user.id, handover.id);
    expect((await closing.readiness(f.organization.id, f.work.id)).status).toBe("READY_TO_CLOSE");
    await reminders.syncOrganization(f.organization.id);
    await reminders.syncOrganization(f.organization.id);
    const readyReminders = await prisma.reminder.findMany({ where: { organizationId: f.organization.id, sourceModule: "PROJECT_CLOSEOUT", sourceId: f.work.id } });
    expect(readyReminders).toHaveLength(1);
    expect(readyReminders[0]?.description).toContain(`/cms/ongoing-works/${f.work.id}`);
    expect(await prisma.notification.count({ where: { organizationId: f.organization.id, reminderId: readyReminders[0]!.id } })).toBe(1);
    const closed = await closing.close(f.organization.id, f.user.id, f.work.id, {}, false);
    expect(closed.status).toBe("COMPLETED");
    expect(closed.closedAt).not.toBeNull();
    const snapshot = await closing.latestReadinessSnapshot(f.organization.id, f.work.id);
    expect(snapshot.readinessSnapshot).toMatchObject({ status: "READY_TO_CLOSE", closedBy: f.user.id });
    await expect(closing.close(f.organization.id, f.user.id, f.work.id, {}, false)).rejects.toThrow("already closed");
    await expect(closing.saveCertificate(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, applicationDate: "2026-09-10", actualCompletionDate: "2026-09-10" })).rejects.toThrow("Reopen the project");
    expect((await closing.overview(f.organization.id, f.work.id)).readiness.project.status).toBe("COMPLETED");
    expect(await prisma.auditLog.count({ where: { organizationId: f.organization.id, entityId: f.work.id, action: "PROJECT_CLOSED" } })).toBe(1);
    await reminders.syncOrganization(f.organization.id);
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: readyReminders[0]!.id } })).isResolved).toBe(true);
    const reopened = await closing.reopen(f.organization.id, f.user.id, f.work.id, { reason: "Approved post-close correction" });
    expect(reopened.status).toBe("CLOSEOUT_PENDING");
    expect(await prisma.projectClosureEvent.count({ where: { organizationId: f.organization.id, workId: f.work.id } })).toBe(2);
    const integrity = await accounting.integrity(f.organization.id);
    expect([integrity.ar.status, integrity.ap.status, integrity.retention.status]).toEqual(["BALANCED", "BALANCED", "BALANCED"]);
    expect(integrity.banks.every((bank) => bank.status === "BALANCED")).toBe(true);
  });

  it("financial integrity blocker cannot be overridden", async () => {
    const f = await createOrganizationFixture(prisma, "NO-FORCE");
    const mismatchAccount = await prisma.ledgerAccount.create({ data: { organizationId: f.organization.id, code: "TEST-MISMATCH", name: "Intentional mismatch", accountType: "ASSET", normalBalance: "DEBIT" } });
    await prisma.journalEntry.create({ data: { organizationId: f.organization.id, journalNo: "BROKEN-1", journalDate: new Date("2026-09-01"), description: "Intentional test mismatch", sourceModule: "TEST", sourceType: "MISMATCH", sourceId: "mismatch", status: "POSTED", createdById: f.user.id, postedById: f.user.id, postedAt: new Date(), lines: { create: [{ accountId: mismatchAccount.id, debit: 100, credit: 0 }] } } });
    const readiness = await closing.readiness(f.organization.id, f.work.id);
    expect(readiness.items.find((item) => item.key === "financial_integrity")?.passed).toBe(false);
    await expect(closing.close(f.organization.id, f.user.id, f.work.id, { override: true, reason: "Privileged override attempt" }, true)).rejects.toThrow("financial integrity");
  });

  it("cannot close with outstanding mandatory Accounts Receivable", async () => {
    const f = await createOrganizationFixture(prisma, "BLOCKERS");
    await prisma.receivable.create({ data: { organizationId: f.organization.id, projectId: f.work.id, contractId: f.contract.id, partyName: f.master.shortName, billNo: "AR-BLOCK", billDate: new Date("2026-09-01"), amount: 1000 } });
    const purchase = await prisma.documentPurchase.create({ data: { organizationId: f.organization.id, purchaseType: "MANUAL", linkedTenderId: f.tender.id, organizationMasterId: f.master.id, paymentFromAccountId: f.bank.id, tenderWorkName: f.tender.workName, purchaseDate: new Date("2026-01-01"), documentPrice: 0, createdById: f.user.id } });
    const workflow = await prisma.pgBgWorkflow.create({ data: { organizationId: f.organization.id, documentPurchaseId: purchase.id, organizationMasterId: f.master.id, pgBgRequired: true, status: "FINALIZED", createdById: f.user.id } });
    await prisma.cmsWork.update({ where: { id: f.work.id }, data: { pgBgWorkflowId: workflow.id } });
    await prisma.projectContract.update({ where: { id: f.contract.id }, data: { pgBgWorkflowId: workflow.id } });
    const readiness = await closing.readiness(f.organization.id, f.work.id);
    expect(readiness.items.find((item) => item.key === "receivable")?.passed).toBe(false);
    expect(readiness.items.find((item) => item.key === "guarantee")?.passed).toBe(false);
    expect(readiness.items.find((item) => item.key === "handover")?.passed).toBe(false);
    await expect(closing.close(f.organization.id, f.user.id, f.work.id, {}, false)).rejects.toThrow();
  });
});
