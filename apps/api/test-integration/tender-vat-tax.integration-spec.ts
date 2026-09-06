import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import request from "supertest";
import ExcelJS from "exceljs";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { TendersService } from "../src/modules/tenders/tenders.service";
import { TenderVatTaxService } from "../src/modules/vat-tax-certificates/tender-vat-tax.service";
import { DocumentStorageService } from "../src/modules/documents/document-storage.service";
import { createIdentityFixture, assertIsolatedTestDatabase } from "./fixtures";

describe("Tender VAT Tax real services and database", () => {
  let app: INestApplication, prisma: PrismaService, service: TenderVatTaxService;
  let a: Awaited<ReturnType<typeof createIdentityFixture>>, b: typeof a, viewer: typeof a;
  let tender: { id: string }, other: { id: string }, access: string, viewerToken: string;
  const base = "/api/v1/tender-vat-tax";
  const input = (changes = {}) => ({ requestId: randomUUID(), taxType: "VAT", entryKind: "SELF_DEPOSIT", amount: "100.10", entryDate: "2026-06-30", referenceNo: `CH-${randomUUID()}`, ...changes });
  const auth = () => ({ Authorization: `Bearer ${access}` });
  const save = async (changes = {}) => (await request(app.getHttpServer()).post(`${base}/tenders/${tender.id}/entries`).set(auth()).send(input(changes)).expect(201)).body.data;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix("api/v1"); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    prisma = app.get(PrismaService); service = app.get(TenderVatTaxService); await assertIsolatedTestDatabase(prisma);
    const suffix = randomUUID().slice(0, 8);
    a = await createIdentityFixture(prisma, `TAXA${suffix}`); b = await createIdentityFixture(prisma, `TAXB${suffix}`); viewer = await createIdentityFixture(prisma, `TAXV${suffix}`, ["vat_tax_certificate.read"]);
    const tenders = app.get(TendersService);
    tender = await tenders.create(a.organization.id, a.user.id, { egpTenderId: "0001", workName: "Test VAT & Tax Tender" });
    other = await tenders.create(b.organization.id, b.user.id, { egpTenderId: "OTHER", workName: "Other organization" });
    await tenders.create(a.organization.id, a.user.id, { egpTenderId: "0002", workName: "No tax entries yet" });
    const login = async (who: typeof a) => (await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: who.user.email, password: who.password }).expect(201)).body.data.accessToken;
    access = await login(a); viewerToken = await login(viewer);
  });
  afterAll(async () => {
    if (prisma && a) {
      const docs = await prisma.document.findMany({ where: { organizationId: a.organization.id, relatedModule: "TENDER_VAT_TAX" }, select: { storageKey: true } });
      for (const doc of docs) if (doc.storageKey) await app.get(DocumentStorageService).delete(doc.storageKey);
    }
    await app?.close();
  });
  it("lists all own tenders, including uncosted/zero-entry tenders, without other tenant data", async () => {
    const result = (await request(app.getHttpServer()).get(`${base}/tenders?limit=1`).set(auth()).expect(200)).body.data;
    expect(result.meta.total).toBe(2); expect(result.rows).toHaveLength(1); expect(result.totals.total).toBe("0.00");
    expect(JSON.stringify(result)).not.toContain(other.id);
  });
  it("persists actual entries and separates dates at the financial/calendar-year boundaries", async () => {
    await save({ referenceNo: "JUNE-VAT", amount: "0.10" });
    await save({ referenceNo: "JULY-VAT", amount: "0.20", entryDate: "2026-07-01", entryKind: "BILL_DEDUCTION" });
    await save({ referenceNo: "JULY-TAX", taxType: "TAX", amount: "25.25", entryDate: "2026-07-01" });
    const fy = await service.list(a.organization.id, { dateFrom: "2026-07-01", dateTo: "2027-06-30" });
    expect(fy.totals).toMatchObject({ vat: "0.20", tax: "25.25", total: "25.45", depositedVat: "0.00", deductedVat: "0.20", entryCount: 2 });
    const previous = await service.list(a.organization.id, { dateFrom: "2025-07-01", dateTo: "2026-06-30" }); expect(previous.totals.vat).toBe("0.10");
    const all = await service.list(a.organization.id, { dateFrom: "2026-01-01", dateTo: "2026-12-31", limit: 1 }); expect(all.totals.total).toBe("25.55");
    expect((await service.list(a.organization.id, { taxType: "VAT", entryKind: "SELF_DEPOSIT" })).totals.total).toBe("0.10");
    expect((await service.list(a.organization.id, { search: "not matching" })).totals.total).toBe("0.00");
    expect(await prisma.journalEntry.count()).toBe(0);
    expect(await prisma.financialTransaction.count()).toBe(0);
  });
  it("blocks double-click/retry, concurrent duplicate references and attempts to relabel the same deduction as another payment", async () => {
    const body = input({ referenceNo: "RETRY" });
    const [one, two] = await Promise.all([request(app.getHttpServer()).post(`${base}/tenders/${tender.id}/entries`).set(auth()).send(body), request(app.getHttpServer()).post(`${base}/tenders/${tender.id}/entries`).set(auth()).send(body)]);
    expect(one.status).toBe(201); expect(two.status).toBe(201); expect(one.body.data.id).toBe(two.body.data.id);
    await request(app.getHttpServer()).post(`${base}/tenders/${tender.id}/entries`).set(auth()).send({ ...body, amount: "101" }).expect(409);
    await request(app.getHttpServer()).post(`${base}/tenders/${tender.id}/entries`).set(auth()).send(input({ referenceNo: " retry ", entryKind: "BILL_DEDUCTION" })).expect(409);
    const duplicates = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post(`${base}/tenders/${tender.id}/entries`).set(auth()).send(input({ referenceNo: "CONCURRENT" }))));
    expect(await prisma.tenderVatTaxEntry.count({ where: { organizationId: a.organization.id, referenceKey: "CONCURRENT" } })).toBe(1);
    expect(duplicates.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it("edits with version checks, voids without erasing history and updates totals", async () => {
    const saved = await save({ referenceNo: "EDIT-VOID", amount: "10.00" });
    const changes = { taxType: "TAX", entryKind: "SELF_DEPOSIT", entryDate: "2026-06-30", amount: "12.34", referenceNo: saved.referenceNo, version: saved.version };
    const edited = (await request(app.getHttpServer()).patch(`${base}/entries/${saved.id}`).set(auth()).send(changes).expect(200)).body.data;
    await request(app.getHttpServer()).patch(`${base}/entries/${saved.id}`).set(auth()).send(changes).expect(409);
    const before = await service.list(a.organization.id, {});
    await request(app.getHttpServer()).post(`${base}/entries/${saved.id}/void`).set(auth()).send({ version: edited.version, reason: "Wrong reference" }).expect(201);
    const after = await service.list(a.organization.id, {}); expect(Number(before.totals.total) - Number(after.totals.total)).toBeCloseTo(12.34, 2);
    const row = await prisma.tenderVatTaxEntry.findUniqueOrThrow({ where: { id: saved.id } }); expect(row.voidedAt).not.toBeNull(); expect(row.voidReason).toBe("Wrong reference");
    expect(await prisma.auditLog.count({ where: { entityId: saved.id } })).toBe(3);
    await request(app.getHttpServer()).patch(`${base}/entries/${saved.id}`).set(auth()).send({ ...changes, version: row.version }).expect(409);
  });
  it("validates input, missing records, permissions and cross-tenant writes/exports/files", async () => {
    await request(app.getHttpServer()).get(`${base}/tenders`).expect(401);
    await request(app.getHttpServer()).get(`${base}/tenders/${other.id}`).set(auth()).expect(404);
    await request(app.getHttpServer()).get(`${base}/tenders/${other.id}/export/pdf`).set(auth()).expect(404);
    await request(app.getHttpServer()).post(`${base}/tenders/${other.id}/entries`).set(auth()).send(input()).expect(404);
    for (const patch of [{ amount: "0" }, { amount: "-1" }, { amount: "NaN" }, { amount: "1.234" }, { entryDate: "2026-02-30" }, { entryDate: "2099-01-01" }, { referenceNo: " " }]) await request(app.getHttpServer()).post(`${base}/tenders/${tender.id}/entries`).set(auth()).send(input(patch)).expect(400);
    await request(app.getHttpServer()).get(`${base}/tenders?dateFrom=2026-07-01&dateTo=2026-06-30`).set(auth()).expect(400);
    await request(app.getHttpServer()).post(`${base}/tenders/${tender.id}/entries`).set({ Authorization: `Bearer ${viewerToken}` }).send(input()).expect(403);
    await request(app.getHttpServer()).get(`${base}/export/xlsx`).set({ Authorization: `Bearer ${viewerToken}` }).expect(403);
    await request(app.getHttpServer()).post(`${base}/entries/missing/documents`).set(auth()).attach("file", Buffer.from("%PDF-1.4\n"), "proof.pdf").expect(404);
  });
  it("adds proof without adding the certificate amount again, and exports every filtered row", async () => {
    const saved = await save({ referenceNo: "PROOF", amount: "1.25" });
    const before = await service.list(a.organization.id, {});
    await request(app.getHttpServer()).post(`${base}/entries/${saved.id}/documents`).set(auth()).attach("file", Buffer.from("invalid"), "proof.pdf").expect(400);
    const doc = (await request(app.getHttpServer()).post(`${base}/entries/${saved.id}/documents`).set(auth()).attach("file", Buffer.from("%PDF-1.4\n%%EOF"), "proof.pdf").expect(201)).body.data;
    const detail = await service.detail(a.organization.id, tender.id, {}); expect(detail.rows.find((e) => e.id === saved.id)?.documents[0]?.id).toBe(doc.id);
    expect((await service.list(a.organization.id, {})).totals).toEqual(before.totals);
    const exported = await service.exportData(a.organization.id, { dateFrom: "2026-07-01", dateTo: "2026-07-31", page: 2, limit: 1 }); expect(exported.entries).toHaveLength(2); expect(exported.totals.total).toBe("25.45");
    const response = await request(app.getHttpServer()).get(`${base}/export/xlsx?dateFrom=2026-07-01&dateTo=2026-07-31`).set(auth()).buffer(true).parse((res, callback) => { const chunks: Buffer[] = []; res.on("data", (chunk) => chunks.push(Buffer.from(chunk))); res.on("end", () => callback(null, Buffer.concat(chunks))); }).expect(200);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(response.body); expect(workbook.getWorksheet("Entries")!.rowCount).toBe(4);
    await request(app.getHttpServer()).get(`${base}/export/pdf`).set(auth()).expect("Content-Type", /application\/pdf/).expect(200);
  });
  (process.env.BIZOVIX_PW_MODULE && process.env.BIZOVIX_PW_CHROME ? it : it.skip)("exercises the real page, persistence, proofs and PDF/Excel against this isolated database", async () => {
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, "../scripts/check-tax-register-ui.mjs"), origin, tender.id], { env: { ...process.env, BIZOVIX_TAX_TEST_ACCESS: access }, stdio: "inherit", windowsHide: true });
      child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`VAT Tax browser check failed: ${code}`)));
    });
  }, 240000);
});
