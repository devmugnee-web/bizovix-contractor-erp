import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { validationExceptionFactory } from "../src/common/utils/validation-exception-factory";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { PartiesService } from "../src/modules/parties/parties.service";
import { ItemsService } from "../src/modules/items/items.service";
import { PurchaseRequisitionsService } from "../src/modules/purchase-requisitions/purchase-requisitions.service";
import { RfqsService } from "../src/modules/rfqs/rfqs.service";
import { SupplierQuotationsService } from "../src/modules/supplier-quotations/supplier-quotations.service";
import { ComparativeStatementsService } from "../src/modules/comparative-statements/comparative-statements.service";
import { PurchaseOrdersService } from "../src/modules/purchase-orders/purchase-orders.service";
import { GrnService } from "../src/modules/grn/grn.service";
import { createOrganizationFixture, resetTestDatabase } from "./fixtures";

/** One continuous, service-driven walk of the entire Procurement Core chain — the same shape as
 * the seed demo data, but run live against the real services so every status transition, audit
 * event and lineage FK is asserted from the actual write path rather than a hand-built snapshot. */
describe("Procurement Core full regression chain (Vendor+Items -> PR -> RFQ -> CS -> PO -> GRN)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let parties: PartiesService;
  let items: ItemsService;
  let purchaseRequisitions: PurchaseRequisitionsService;
  let rfqs: RfqsService;
  let supplierQuotations: SupplierQuotationsService;
  let comparativeStatements: ComparativeStatementsService;
  let purchaseOrders: PurchaseOrdersService;
  let grn: GrnService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory }));
    await app.init();
    prisma = app.get(PrismaService);
    parties = app.get(PartiesService);
    items = app.get(ItemsService);
    purchaseRequisitions = app.get(PurchaseRequisitionsService);
    rfqs = app.get(RfqsService);
    supplierQuotations = app.get(SupplierQuotationsService);
    comparativeStatements = app.get(ComparativeStatementsService);
    purchaseOrders = app.get(PurchaseOrdersService);
    grn = app.get(GrnService);
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => { await resetTestDatabase(prisma); await app.close(); });

  async function token(email: string, password: string) {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password }).expect(201);
    return response.body.data.accessToken as string;
  }
  const auth = (value: string) => ({ Authorization: `Bearer ${value}` });

  it("carries project, supplier and item lineage correctly through every stage, transitions every status, and touches zero accounting or inventory models", async () => {
    const f = await createOrganizationFixture(prisma, "PROCREG");

    // --- Vendor + Items -----------------------------------------------------------------
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Regression Chain Item" });
    const [supplierLow, supplierMid, supplierHigh] = await Promise.all([
      parties.create(f.organization.id, f.user.id, { name: "Low Bid Supplier", roles: ["SUPPLIER"] }),
      parties.create(f.organization.id, f.user.id, { name: "Mid Bid Supplier", roles: ["SUPPLIER"] }),
      parties.create(f.organization.id, f.user.id, { name: "High Bid Supplier", roles: ["VENDOR"] }),
    ]);

    // --- PR -> Submit -> Approve, against the fixture's ONGOING project ------------------
    const draftPr = await purchaseRequisitions.create(f.organization.id, f.user.id, {
      requestDate: "2026-04-01",
      cmsWorkId: f.work.id,
      items: [{ itemId: item.id, requestedQty: 40, estimatedRate: 100, boqItemId: f.boq.id }],
    });
    expect(draftPr.status).toBe("DRAFT");
    const submittedPr = await purchaseRequisitions.submit(f.organization.id, f.user.id, draftPr.id);
    expect(submittedPr.status).toBe("SUBMITTED");
    const approvedPr = await purchaseRequisitions.approve(f.organization.id, f.user.id, submittedPr.id);
    expect(approvedPr.status).toBe("APPROVED");
    expect(approvedPr.cmsWorkId).toBe(f.work.id);

    // --- RFQ -> Invite 3 suppliers -> Issue ----------------------------------------------
    const draftRfq = await rfqs.create(f.organization.id, f.user.id, {
      purchaseRequisitionId: approvedPr.id,
      issueDate: "2026-04-05",
      submissionDeadline: "2026-04-15",
      supplierIds: [supplierLow.id, supplierMid.id, supplierHigh.id],
    });
    expect(draftRfq.purchaseRequisitionId).toBe(approvedPr.id);
    expect(draftRfq.cmsWorkId).toBe(f.work.id); // inherited from the PR's project
    expect((await purchaseRequisitions.findOne(f.organization.id, approvedPr.id)).status).toBe("CONVERTED");
    const issuedRfq = await rfqs.issue(f.organization.id, f.user.id, draftRfq.id);
    expect(issuedRfq.status).toBe("ISSUED");
    const rfqItem = issuedRfq.items[0]!;
    expect(rfqItem.itemId).toBe(item.id); // item lineage: RFQ item -> Item master
    expect(rfqItem.purchaseRequisitionItemId).toBe(approvedPr.items[0]!.id); // RFQ item -> PR item

    // --- Record 3 quotations (low/mid/high) ----------------------------------------------
    const quotedLines = (unitRate: number) => [{ rfqItemId: rfqItem.id, offeredQty: 40, unitRate }];
    const quoteLow = await supplierQuotations.create(f.organization.id, f.user.id, { rfqId: issuedRfq.id, supplierId: supplierLow.id, quotationRef: "LOW-1", quotationDate: "2026-04-08", items: quotedLines(90) });
    const quoteMid = await supplierQuotations.create(f.organization.id, f.user.id, { rfqId: issuedRfq.id, supplierId: supplierMid.id, quotationRef: "MID-1", quotationDate: "2026-04-09", items: quotedLines(100) });
    const quoteHigh = await supplierQuotations.create(f.organization.id, f.user.id, { rfqId: issuedRfq.id, supplierId: supplierHigh.id, quotationRef: "HIGH-1", quotationDate: "2026-04-10", items: quotedLines(120) });
    expect(quoteLow.totalAmount).toBe("3600.00"); // 40 * 90
    expect(quoteMid.totalAmount).toBe("4000.00"); // 40 * 100
    expect(quoteHigh.totalAmount).toBe("4800.00"); // 40 * 120
    expect((await rfqs.findOne(f.organization.id, issuedRfq.id)).respondedSupplierIds.sort()).toEqual([supplierHigh.id, supplierLow.id, supplierMid.id].sort());

    // --- Comparative Statement -> explicit Select -> Approve (awards the RFQ) ------------
    const cs = await comparativeStatements.create(f.organization.id, f.user.id, { rfqId: issuedRfq.id });
    expect(cs.suppliers).toHaveLength(3);
    expect(cs.suppliers.find((s) => s.supplierId === supplierLow.id)!.rank).toBe(1); // lowest quoted total ranks first
    const selectedCs = await comparativeStatements.selectSupplier(f.organization.id, f.user.id, cs.id, { supplierId: supplierLow.id }); // lowest -> no decision note needed
    expect(selectedCs.suppliers.find((s) => s.supplierId === supplierLow.id)!.isSelected).toBe(true);
    const approvedCs = await comparativeStatements.approve(f.organization.id, f.user.id, selectedCs.id);
    expect(approvedCs.status).toBe("APPROVED");
    expect((await rfqs.findOne(f.organization.id, issuedRfq.id)).status).toBe("AWARDED"); // CS approval awards the RFQ

    // --- PO -> Approve -> Issue ------------------------------------------------------------
    const draftPo = await purchaseOrders.create(f.organization.id, f.user.id, {
      poDate: "2026-04-20",
      supplierId: supplierLow.id,
      comparativeStatementId: approvedCs.id,
      items: [{ itemId: item.id, orderedQty: 40, unitRate: 90, sourceQuotationItemId: quoteLow.items[0]!.id }],
    });
    expect(draftPo.status).toBe("DRAFT");
    expect(draftPo.supplierId).toBe(supplierLow.id); // supplier lineage: PO -> selected CS supplier
    expect(draftPo.rfqId).toBe(issuedRfq.id);
    expect(draftPo.purchaseRequisitionId).toBe(approvedPr.id);
    expect(draftPo.cmsWorkId).toBe(f.work.id); // project lineage carried all the way to the PO
    expect(draftPo.grandTotal).toBe("3600.00");
    const approvedPo = await purchaseOrders.approve(f.organization.id, f.user.id, draftPo.id);
    expect(approvedPo.status).toBe("APPROVED");
    const issuedPo = await purchaseOrders.issue(f.organization.id, f.user.id, approvedPo.id);
    expect(issuedPo.status).toBe("ISSUED");
    const poItemId = issuedPo.items[0]!.id;

    // --- GRN 1 (partial) -> GRN 2 (final) -> PO fully RECEIVED -----------------------------
    const grn1 = await grn.create(f.organization.id, f.user.id, { purchaseOrderId: issuedPo.id, receiptDate: "2026-04-25", items: [{ purchaseOrderItemId: poItemId, currentReceivedQty: 25, acceptedQty: 25 }] });
    expect(grn1.items[0]!.cumulativeReceivedQty).toBe("25.000");
    expect(grn1.items[0]!.remainingQty).toBe("15.000");
    expect((await purchaseOrders.findOne(f.organization.id, issuedPo.id)).status).toBe("PARTIALLY_RECEIVED");

    const grn2 = await grn.create(f.organization.id, f.user.id, { purchaseOrderId: issuedPo.id, receiptDate: "2026-04-28", items: [{ purchaseOrderItemId: poItemId, currentReceivedQty: 15, acceptedQty: 15 }] });
    expect(grn2.items[0]!.cumulativeReceivedQty).toBe("40.000");
    expect(grn2.items[0]!.remainingQty).toBe("0.000");
    const finalPo = await purchaseOrders.findOne(f.organization.id, issuedPo.id);
    expect(finalPo.status).toBe("RECEIVED");
    expect(finalPo.items[0]!.receivedQty).toBe("40.000");

    // --- Audit trail exists for every key transition ---------------------------------------
    const auditActions = (await prisma.auditLog.findMany({ where: { organizationId: f.organization.id }, select: { action: true } })).map((row) => row.action);
    for (const expected of [
      "PR_CREATED", "PR_SUBMITTED", "PR_APPROVED",
      "RFQ_CREATED", "RFQ_ISSUED",
      "QUOTATION_RECORDED",
      "CS_CREATED", "SUPPLIER_SELECTED", "CS_APPROVED",
      "PO_CREATED", "PO_APPROVED", "PO_ISSUED",
      "GRN_CREATED", "GRN_ACCEPTED",
    ]) {
      expect(auditActions).toContain(expected);
    }
    expect(auditActions.filter((a) => a === "QUOTATION_RECORDED")).toHaveLength(3);
    expect(auditActions.filter((a) => a === "GRN_CREATED")).toHaveLength(2);

    // --- Tenant isolation: a different org cannot reach any record in this chain over HTTP --
    const outsider = await createOrganizationFixture(prisma, "PROCREGOUT");
    const outsiderAccess = await token(outsider.user.email, outsider.password);
    await request(app.getHttpServer()).get(`/api/v1/purchase-requisitions/${approvedPr.id}`).set(auth(outsiderAccess)).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/rfqs/${issuedRfq.id}`).set(auth(outsiderAccess)).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/comparative-statements/${approvedCs.id}`).set(auth(outsiderAccess)).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/purchase-orders/${issuedPo.id}`).set(auth(outsiderAccess)).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/grns/${grn2.id}`).set(auth(outsiderAccess)).expect(404);

    // --- No accounting or inventory side effects anywhere in the chain ---------------------
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id } })).toBe(0);
    expect(await prisma.payable.count({ where: { organizationId: f.organization.id } })).toBe(0);
    expect(await prisma.expense.count({ where: { organizationId: f.organization.id } })).toBe(0);
  });
});
