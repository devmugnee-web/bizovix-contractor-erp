import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { RemindersService } from "../src/modules/reminders/reminders.service";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { ProjectClosingService } from "../src/modules/project-closing/project-closing.service";
import { ProjectBillsService } from "../src/modules/project-bills/project-bills.service";
import { ReceiptsService } from "../src/modules/receipts/receipts.service";
import { createOrganizationFixture, resetTestDatabase } from "./fixtures";

describe("Closeout Reminder to Notification PostgreSQL integration", () => {
  let app: INestApplication; let prisma: PrismaService; let reminders: RemindersService; let notifications: NotificationsService;
  let closing: ProjectClosingService; let bills: ProjectBillsService; let receipts: ReceiptsService;
  const today = () => new Date().toISOString().slice(0, 10);
  const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); await app.init();
    prisma = app.get(PrismaService); reminders = app.get(RemindersService); notifications = app.get(NotificationsService);
    closing = app.get(ProjectClosingService); bills = app.get(ProjectBillsService); receipts = app.get(ReceiptsService);
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => { await resetTestDatabase(prisma); await app.close(); });

  async function notificationFor(org: string, sourceModule: string, sourceId: string) {
    await reminders.syncOrganization(org);
    return prisma.notification.findFirstOrThrow({ where: { organizationId: org, sourceModule, sourceId } });
  }
  async function pendingCertificate(suffix: string) {
    const f = await createOrganizationFixture(prisma, suffix);
    const row = await closing.saveCertificate(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, applicationDate: today(), actualCompletionDate: today() });
    return { f, row };
  }
  async function pendingHandover(suffix: string) {
    const f = await createOrganizationFixture(prisma, suffix);
    const row = await closing.createHandover(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, handoverDate: today(), handedOverBy: "Contractor", receivedBy: "Client", authority: "PD" });
    return { f, row };
  }
  async function readyProject(suffix: string) {
    const f = await createOrganizationFixture(prisma, suffix);
    await prisma.projectContract.update({ where: { id: f.contract.id }, data: { retentionPct: null, dlpDays: null } });
    const certificate = await closing.saveCertificate(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, applicationDate: today(), actualCompletionDate: today(), certifiedCompletionDate: today(), certificateDate: today(), issuingAuthority: "PD" });
    await closing.certificateStatus(f.organization.id, f.user.id, certificate.id, { status: "SUBMITTED" }); await closing.certificateStatus(f.organization.id, f.user.id, certificate.id, { status: "APPROVED" });
    const draft = await bills.saveDraft(f.organization.id, f.user.id, null, { contractId: f.contract.id, billType: "FINAL", billDate: today(), items: [{ boqItemId: f.boq.id, currentQty: 100 }] });
    await bills.submit(f.organization.id, f.user.id, draft.id); const bill = await bills.certify(f.organization.id, f.user.id, draft.id);
    const receivable = await prisma.receivable.findUniqueOrThrow({ where: { projectBillId: bill.id } });
    await receipts.create(f.organization.id, f.user.id, { receiptDate: today(), receiptCategory: "PROJECT", receiptType: "BILL_COLLECTION", workId: f.work.id, receivableId: receivable.id, receivedFrom: "Client", amount: receivable.amount.toNumber(), receivedInAccountId: f.bank.id, paymentMethod: "BANK", status: "RECEIVED" });
    const handover = await closing.createHandover(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, handoverDate: today(), handedOverBy: "Contractor", receivedBy: "Client", authority: "PD" }); await closing.completeHandover(f.organization.id, f.user.id, handover.id);
    return f;
  }

  it("Completion Certificate pending notification", async () => { const { f, row } = await pendingCertificate("N-CC"); const n = await notificationFor(f.organization.id, "COMPLETION_CERTIFICATE", row.id); expect(n).toMatchObject({ organizationId: f.organization.id, userId: f.user.id, sourceId: row.id, isRead: false }); });
  it("DLP expiry approaching notification", async () => { const f = await createOrganizationFixture(prisma, "N-DLP"); const cert = await closing.saveCertificate(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, applicationDate: today(), actualCompletionDate: today(), certifiedCompletionDate: today(), certificateDate: today(), issuingAuthority: "PD" }); await closing.certificateStatus(f.organization.id, f.user.id, cert.id, { status: "SUBMITTED" }); await closing.certificateStatus(f.organization.id, f.user.id, cert.id, { status: "APPROVED" }); const dlp = await closing.createDlp(f.organization.id, f.user.id, f.work.id, { completionCertificateId: cert.id, durationDays: 1 }); await prisma.defectLiabilityPeriod.update({ where: { id: dlp.id }, data: { endDate: new Date(today()) } }); expect((await notificationFor(f.organization.id, "DLP", dlp.id)).userId).toBe(f.user.id); });
  it("Defect overdue notification", async () => { const f = await createOrganizationFixture(prisma, "N-DEF"); const cert = await prisma.completionCertificate.create({ data: { organizationId: f.organization.id, workId: f.work.id, contractId: f.contract.id, certificateNo: "N-DEF-CC", applicationDate: new Date(), actualCompletionDate: new Date(), status: "APPROVED" } }); const dlp = await prisma.defectLiabilityPeriod.create({ data: { organizationId: f.organization.id, workId: f.work.id, contractId: f.contract.id, completionCertificateId: cert.id, startDate: new Date(), endDate: new Date(), durationDays: 1, status: "ACTIVE" } }); const defect = await closing.createDefect(f.organization.id, f.user.id, f.work.id, { dlpId: dlp.id, description: "Overdue defect", reportedDate: yesterday(), targetRectificationDate: yesterday() }); expect((await notificationFor(f.organization.id, "DLP_DEFECT", defect.id)).type).toBe("OVERDUE"); });
  it("Retention release due notification", async () => { const f = await createOrganizationFixture(prisma, "N-RET"); const bill = await prisma.projectBill.create({ data: { organizationId: f.organization.id, cmsWorkId: f.work.id, contractId: f.contract.id, billNo: "RET-DUE", billDate: new Date(), grossWorkValue: 100, grossBillAmount: 100, retentionAmount: 10, retentionReleaseDueDate: new Date(today()), status: "CERTIFIED" } }); expect((await notificationFor(f.organization.id, "PROJECT_BILL", bill.id)).sourceId).toBe(bill.id); });
  it("PG/BG release pending due notification", async () => { const f = await createOrganizationFixture(prisma, "N-PG"); const purchase = await prisma.documentPurchase.create({ data: { organizationId: f.organization.id, purchaseType: "MANUAL", organizationMasterId: f.master.id, paymentFromAccountId: f.bank.id, tenderWorkName: "PG due", purchaseDate: new Date(), documentPrice: 1 } }); const workflow = await prisma.pgBgWorkflow.create({ data: { organizationId: f.organization.id, documentPurchaseId: purchase.id, organizationMasterId: f.master.id } }); const pg = await prisma.performanceGuarantee.create({ data: { organizationId: f.organization.id, organizationMasterId: f.master.id, pgBgWorkflowId: workflow.id, bankAccountId: f.bank.id, type: "PG", amount: 10, issueDate: new Date(), expiryDate: new Date(today()), status: "ACTIVE" } }); expect((await notificationFor(f.organization.id, "PG_BG", pg.id)).sourceId).toBe(pg.id); });
  it("Handover pending notification", async () => { const { f, row } = await pendingHandover("N-HO"); expect((await notificationFor(f.organization.id, "PROJECT_HANDOVER", row.id)).sourceId).toBe(row.id); });
  it("READY_TO_CLOSE notification", async () => { const f = await readyProject("N-READY"); const n = await notificationFor(f.organization.id, "PROJECT_CLOSEOUT", f.work.id); expect(n).toMatchObject({ organizationId: f.organization.id, userId: f.user.id, sourceType: "READY_TO_CLOSE", isRead: false }); });
  it("READY_TO_CLOSE notification is deduplicated", async () => { const f = await readyProject("N-DEDUP"); await reminders.syncOrganization(f.organization.id); await reminders.syncOrganization(f.organization.id); expect(await prisma.notification.count({ where: { organizationId: f.organization.id, sourceModule: "PROJECT_CLOSEOUT", sourceId: f.work.id } })).toBe(1); });
  it("READY_TO_CLOSE notification resolves when project regresses to NOT_READY", async () => { const f = await readyProject("N-STALE"); const n = await notificationFor(f.organization.id, "PROJECT_CLOSEOUT", f.work.id); await prisma.receivable.create({ data: { organizationId: f.organization.id, projectId: f.work.id, partyName: "Client", billNo: "REGRESS", billDate: new Date(), amount: 1 } }); await reminders.syncOrganization(f.organization.id); expect((await prisma.reminder.findUniqueOrThrow({ where: { id: n.reminderId! } })).isResolved).toBe(true); expect((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).isRead).toBe(true); });
  it("Closeout notification is tenant scoped", async () => { const a = await readyProject("N-TENA"); const b = await createOrganizationFixture(prisma, "N-TENB"); await reminders.syncOrganization(a.organization.id); expect(await prisma.notification.count({ where: { organizationId: b.organization.id, sourceModule: "PROJECT_CLOSEOUT" } })).toBe(0); });
  it("User cannot see another tenant closeout notification", async () => { const a = await readyProject("N-ISOA"); const b = await createOrganizationFixture(prisma, "N-ISOB"); await reminders.syncOrganization(a.organization.id); expect((await notifications.list(a.organization.id, b.user.id, {})).items).toHaveLength(0); });
  it("Mark as read decreases unread count", async () => { const { f, row } = await pendingCertificate("N-READ"); const n = await notificationFor(f.organization.id, "COMPLETION_CERTIFICATE", row.id); const before = await notifications.unreadCount(f.organization.id, f.user.id); await notifications.markRead(f.organization.id, f.user.id, n.id); expect(await notifications.unreadCount(f.organization.id, f.user.id)).toBe(before - 1); });
  it("Mark all as read clears unread notifications", async () => { const { f } = await pendingCertificate("N-ALL"); await closing.createHandover(f.organization.id, f.user.id, f.work.id, { contractId: f.contract.id, handoverDate: today(), handedOverBy: "A", receivedBy: "B", authority: "PD" }); await reminders.syncOrganization(f.organization.id); expect(await notifications.unreadCount(f.organization.id, f.user.id)).toBeGreaterThan(1); await notifications.markAllRead(f.organization.id, f.user.id); expect(await notifications.unreadCount(f.organization.id, f.user.id)).toBe(0); });
  it("Closeout deep link and source point to the correct project", async () => { const f = await readyProject("N-LINK"); const n = await notificationFor(f.organization.id, "PROJECT_CLOSEOUT", f.work.id); const r = await prisma.reminder.findUniqueOrThrow({ where: { id: n.reminderId! } }); expect(r.description).toBe(`/cms/ongoing-works/${f.work.id}?tab=Completion%20%26%20Closeout`); expect(n.sourceId).toBe(f.work.id); });
});
