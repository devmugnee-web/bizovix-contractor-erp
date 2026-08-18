import { BadRequestException, INestApplication, NotFoundException, ValidationPipe } from "@nestjs/common";
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

describe("Procurement Core (PR/RFQ/Quotation/CS/PO/GRN) PostgreSQL integration", () => {
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

  /** DRAFT -> SUBMITTED -> APPROVED, ready to feed an RFQ. */
  async function approvedPr(f: Awaited<ReturnType<typeof createOrganizationFixture>>, itemId: string, qty = 10, rate = 100) {
    const pr = await purchaseRequisitions.create(f.organization.id, f.user.id, { requestDate: "2026-03-01", items: [{ itemId, requestedQty: qty, estimatedRate: rate }] });
    await purchaseRequisitions.submit(f.organization.id, f.user.id, pr.id);
    return purchaseRequisitions.approve(f.organization.id, f.user.id, pr.id);
  }

  /** DRAFT -> ISSUED RFQ against an Approved PR, with the given suppliers invited. */
  async function issuedRfq(f: Awaited<ReturnType<typeof createOrganizationFixture>>, prId: string, supplierIds: string[]) {
    const rfq = await rfqs.create(f.organization.id, f.user.id, { purchaseRequisitionId: prId, issueDate: "2026-03-05", submissionDeadline: "2026-03-15", supplierIds });
    return rfqs.issue(f.organization.id, f.user.id, rfq.id);
  }

  /** Records a RECEIVED quotation for one supplier against every item on the given RFQ. */
  async function recordQuotation(
    f: Awaited<ReturnType<typeof createOrganizationFixture>>,
    rfqRecord: Awaited<ReturnType<typeof issuedRfq>>,
    supplierId: string,
    unitRate: number,
    opts: { discountPct?: number; taxPct?: number; quotationRef?: string } = {},
  ) {
    return supplierQuotations.create(f.organization.id, f.user.id, {
      rfqId: rfqRecord.id,
      supplierId,
      quotationRef: opts.quotationRef ?? `Q-${supplierId.slice(0, 6)}`,
      quotationDate: "2026-03-08",
      items: rfqRecord.items.map((item: { id: string; requestedQty: string }) => ({
        rfqItemId: item.id,
        offeredQty: Number(item.requestedQty),
        unitRate,
        discountPct: opts.discountPct ?? 0,
        taxPct: opts.taxPct ?? 0,
      })),
    });
  }

  /** Builds a full PR -> RFQ -> Quotation -> Approved CS chain for one supplier, ending with an
   * explicitly selected + approved Comparative Statement — everything a PO needs to be raised. */
  async function approvedCsChain(f: Awaited<ReturnType<typeof createOrganizationFixture>>, itemId: string, unitRate = 100, qty = 10) {
    const pr = await approvedPr(f, itemId, qty, unitRate);
    const supplier = await parties.create(f.organization.id, f.user.id, { name: "Chain Supplier", roles: ["SUPPLIER"] });
    const rfq = await issuedRfq(f, pr.id, [supplier.id]);
    const quotation = await recordQuotation(f, rfq, supplier.id, unitRate);
    const cs = await comparativeStatements.create(f.organization.id, f.user.id, { rfqId: rfq.id });
    const selected = await comparativeStatements.selectSupplier(f.organization.id, f.user.id, cs.id, { supplierId: supplier.id });
    const approved = await comparativeStatements.approve(f.organization.id, f.user.id, selected.id);
    return { pr, supplier, rfq, quotation, cs: approved };
  }

  // A. PR create/update
  it("creates and updates a purchase requisition, snapshotting item detail and computing estimated amounts", async () => {
    const f = await createOrganizationFixture(prisma, "PROCA");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Copper Cable" });

    const created = await purchaseRequisitions.create(f.organization.id, f.user.id, { requestDate: "2026-03-01", items: [{ itemId: item.id, requestedQty: 10, estimatedRate: 100 }] });
    expect(created.prNo).toMatch(/^PR-/);
    expect(created.status).toBe("DRAFT");
    expect(created.items[0]!.estimatedAmount).toBe("1000.00");

    const updated = await purchaseRequisitions.update(f.organization.id, f.user.id, created.id, { requestDate: "2026-03-02", items: [{ itemId: item.id, requestedQty: 20, estimatedRate: 100 }] });
    expect(updated.items[0]!.requestedQty).toBe("20.000");
    expect(await prisma.auditLog.count({ where: { organizationId: f.organization.id, entityId: created.id, action: "PR_CREATED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { organizationId: f.organization.id, entityId: created.id, action: "PR_UPDATED" } })).toBe(1);
  });

  // B. PR rejects an item belonging to a different tenant
  it("rejects a purchase requisition item that belongs to a different tenant", async () => {
    const a = await createOrganizationFixture(prisma, "PROCB1");
    const b = await createOrganizationFixture(prisma, "PROCB2");
    const itemB = await items.create(b.organization.id, b.user.id, { itemName: "Org B Item" });

    await expect(
      purchaseRequisitions.create(a.organization.id, a.user.id, { requestDate: "2026-03-01", items: [{ itemId: itemB.id, requestedQty: 1 }] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // C. PR rejects a CLOSED/ARCHIVED project
  it("rejects creating a purchase requisition against a Completed or Archived project", async () => {
    const f = await createOrganizationFixture(prisma, "PROCC");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item C" });
    const archivedWork = await prisma.cmsWork.create({
      data: { organizationId: f.organization.id, organizationMasterId: f.master.id, workName: "Archived Project", workCategory: "Civil Works", contractValue: 1_000_000, status: "ARCHIVED", startDate: new Date("2025-01-01"), expectedCompletionDate: new Date("2025-06-01"), createdById: f.user.id },
    });

    await expect(
      purchaseRequisitions.create(f.organization.id, f.user.id, { requestDate: "2026-03-01", cmsWorkId: archivedWork.id, items: [{ itemId: item.id, requestedQty: 1 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // D. RFQ requires an Approved PR
  it("requires the source Purchase Requisition to be Approved before an RFQ can be raised", async () => {
    const f = await createOrganizationFixture(prisma, "PROCD");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item D" });
    const draftPr = await purchaseRequisitions.create(f.organization.id, f.user.id, { requestDate: "2026-03-01", items: [{ itemId: item.id, requestedQty: 5 }] });

    await expect(
      rfqs.create(f.organization.id, f.user.id, { purchaseRequisitionId: draftPr.id, issueDate: "2026-03-05", submissionDeadline: "2026-03-15", supplierIds: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // E. RFQ validates invited-supplier tenant and eligibility
  it("rejects inviting a cross-tenant or ineligible supplier to an RFQ", async () => {
    const a = await createOrganizationFixture(prisma, "PROCE1");
    const b = await createOrganizationFixture(prisma, "PROCE2");
    const item = await items.create(a.organization.id, a.user.id, { itemName: "Item E" });
    const pr = await approvedPr(a, item.id);

    const supplierB = await parties.create(b.organization.id, b.user.id, { name: "Org B Supplier", roles: ["SUPPLIER"] });
    await expect(
      rfqs.create(a.organization.id, a.user.id, { purchaseRequisitionId: pr.id, issueDate: "2026-03-05", submissionDeadline: "2026-03-15", supplierIds: [supplierB.id] }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const inactiveSupplier = await parties.create(a.organization.id, a.user.id, { name: "Inactive Supplier", roles: ["SUPPLIER"] });
    await parties.changeStatus(a.organization.id, a.user.id, inactiveSupplier.id, { status: "INACTIVE" });
    await expect(
      rfqs.create(a.organization.id, a.user.id, { purchaseRequisitionId: pr.id, issueDate: "2026-03-05", submissionDeadline: "2026-03-15", supplierIds: [inactiveSupplier.id] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // F. Archived supplier cannot be newly invited
  it("blocks a newly-archived supplier from being invited to a new RFQ", async () => {
    const f = await createOrganizationFixture(prisma, "PROCF");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item F" });
    const pr = await approvedPr(f, item.id);
    const supplier = await parties.create(f.organization.id, f.user.id, { name: "Soon Archived Supplier", roles: ["SUPPLIER"] });
    await parties.changeStatus(f.organization.id, f.user.id, supplier.id, { status: "ARCHIVED" });

    await expect(
      rfqs.create(f.organization.id, f.user.id, { purchaseRequisitionId: pr.id, issueDate: "2026-03-05", submissionDeadline: "2026-03-15", supplierIds: [supplier.id] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // G. Quotation totals are backend-authoritative
  it("computes supplier quotation line and total amounts on the backend from qty/rate/discount/tax", async () => {
    const f = await createOrganizationFixture(prisma, "PROCG");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item G" });
    const pr = await approvedPr(f, item.id, 10);
    const supplier = await parties.create(f.organization.id, f.user.id, { name: "Quote Supplier", roles: ["SUPPLIER"] });
    const rfq = await issuedRfq(f, pr.id, [supplier.id]);

    // gross = 10*100 = 1000; less 10% discount = 900; plus 5% tax = 945.
    const quotation = await recordQuotation(f, rfq, supplier.id, 100, { discountPct: 10, taxPct: 5 });
    expect(quotation.items[0]!.lineAmount).toBe("945.00");
    expect(quotation.totalAmount).toBe("945.00");
  });

  // H. Comparative Statement compares quotations correctly, applying commercial adjustments before ranking
  it("ranks suppliers by evaluated total (quoted total + commercial adjustment), not raw quoted total", async () => {
    const f = await createOrganizationFixture(prisma, "PROCH");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item H" });
    const pr = await approvedPr(f, item.id, 10);
    const cheaperSupplier = await parties.create(f.organization.id, f.user.id, { name: "Cheaper Quoted Supplier", roles: ["SUPPLIER"] });
    const pricierSupplier = await parties.create(f.organization.id, f.user.id, { name: "Pricier Quoted Supplier", roles: ["SUPPLIER"] });
    const rfq = await issuedRfq(f, pr.id, [cheaperSupplier.id, pricierSupplier.id]);
    await recordQuotation(f, rfq, cheaperSupplier.id, 80); // quoted total 800
    await recordQuotation(f, rfq, pricierSupplier.id, 100); // quoted total 1000

    const cs = await comparativeStatements.create(f.organization.id, f.user.id, {
      rfqId: rfq.id,
      suppliers: [
        { supplierId: cheaperSupplier.id, commercialAdjustment: 300 }, // evaluated -> 1100
        { supplierId: pricierSupplier.id },
      ],
    });
    const cheaper = cs.suppliers.find((s) => s.supplierId === cheaperSupplier.id)!;
    const pricier = cs.suppliers.find((s) => s.supplierId === pricierSupplier.id)!;
    expect(cheaper.evaluatedTotal).toBe("1100.00");
    expect(pricier.evaluatedTotal).toBe("1000.00");
    expect(pricier.rank).toBe(1);
    expect(cheaper.rank).toBe(2);

    // Selecting the now-not-lowest cheaper-quoted supplier still requires an explicit decision note.
    await expect(comparativeStatements.selectSupplier(f.organization.id, f.user.id, cs.id, { supplierId: cheaperSupplier.id })).rejects.toBeInstanceOf(BadRequestException);
    const selected = await comparativeStatements.selectSupplier(f.organization.id, f.user.id, cs.id, { supplierId: pricierSupplier.id });
    expect(selected.suppliers.find((s) => s.supplierId === pricierSupplier.id)!.isSelected).toBe(true);
  });

  // I. Selected supplier must belong to the CS's own evaluation
  it("rejects selecting a supplier that is not part of the Comparative Statement's evaluation", async () => {
    const f = await createOrganizationFixture(prisma, "PROCI");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item I" });
    const pr = await approvedPr(f, item.id, 10);
    const supplier = await parties.create(f.organization.id, f.user.id, { name: "Evaluated Supplier", roles: ["SUPPLIER"] });
    const outsider = await parties.create(f.organization.id, f.user.id, { name: "Outsider Supplier", roles: ["SUPPLIER"] });
    const rfq = await issuedRfq(f, pr.id, [supplier.id]);
    await recordQuotation(f, rfq, supplier.id, 100);
    const cs = await comparativeStatements.create(f.organization.id, f.user.id, { rfqId: rfq.id });

    await expect(comparativeStatements.selectSupplier(f.organization.id, f.user.id, cs.id, { supplierId: outsider.id })).rejects.toBeInstanceOf(NotFoundException);
  });

  // J. PO requires an approved supplier selection (Approved CS + matching selected supplier)
  it("requires an Approved Comparative Statement with a matching selected supplier before a PO can be raised", async () => {
    const f = await createOrganizationFixture(prisma, "PROCJ");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item J" });
    const pr = await approvedPr(f, item.id, 10);
    const supplier = await parties.create(f.organization.id, f.user.id, { name: "PO Supplier", roles: ["SUPPLIER"] });
    const otherSupplier = await parties.create(f.organization.id, f.user.id, { name: "Other Supplier", roles: ["SUPPLIER"] });
    const rfq = await issuedRfq(f, pr.id, [supplier.id]);
    await recordQuotation(f, rfq, supplier.id, 100);
    const cs = await comparativeStatements.create(f.organization.id, f.user.id, { rfqId: rfq.id });

    const poItems = [{ itemId: item.id, orderedQty: 10, unitRate: 100 }];

    // No comparativeStatementId at all — the previous session's bug allowed this to bypass the whole chain.
    await expect(
      purchaseOrders.create(f.organization.id, f.user.id, { poDate: "2026-03-20", supplierId: supplier.id, items: poItems }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // CS exists but is only EVALUATED, not APPROVED yet.
    await expect(
      purchaseOrders.create(f.organization.id, f.user.id, { poDate: "2026-03-20", supplierId: supplier.id, comparativeStatementId: cs.id, items: poItems }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const selected = await comparativeStatements.selectSupplier(f.organization.id, f.user.id, cs.id, { supplierId: supplier.id });
    const approvedCs = await comparativeStatements.approve(f.organization.id, f.user.id, selected.id);

    // Approved CS, but the supplierId on the PO doesn't match the CS's selected supplier.
    await expect(
      purchaseOrders.create(f.organization.id, f.user.id, { poDate: "2026-03-20", supplierId: otherSupplier.id, comparativeStatementId: approvedCs.id, items: poItems }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Matching supplier + Approved CS succeeds.
    const po = await purchaseOrders.create(f.organization.id, f.user.id, { poDate: "2026-03-20", supplierId: supplier.id, comparativeStatementId: approvedCs.id, items: poItems });
    expect(po.status).toBe("DRAFT");
    expect(po.comparativeStatementId).toBe(approvedCs.id);
  });

  // K. PO totals are backend-authoritative
  it("computes PO subtotal/discount/tax/grand total on the backend from ordered qty/rate/discount", async () => {
    const f = await createOrganizationFixture(prisma, "PROCK");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item K" });
    const chain = await approvedCsChain(f, item.id, 100, 10);

    const po = await purchaseOrders.create(f.organization.id, f.user.id, {
      poDate: "2026-03-20",
      supplierId: chain.supplier.id,
      comparativeStatementId: chain.cs.id,
      otherCharges: 20,
      items: [{ itemId: item.id, orderedQty: 10, unitRate: 100, discountAmount: 50 }],
    });

    expect(po.subtotal).toBe("1000.00");
    expect(po.discountAmount).toBe("50.00");
    expect(po.taxAmount).toBe("0.00");
    expect(po.otherCharges).toBe("20.00");
    expect(po.grandTotal).toBe("970.00");
    expect(po.items[0]!.netRate).toBe("95.00");
  });

  // L. An issued PO cannot be silently commercially edited
  it("blocks editing an Approved/Issued purchase order's commercial terms", async () => {
    const f = await createOrganizationFixture(prisma, "PROCL");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item L" });
    const chain = await approvedCsChain(f, item.id, 100, 10);
    const po = await purchaseOrders.create(f.organization.id, f.user.id, { poDate: "2026-03-20", supplierId: chain.supplier.id, comparativeStatementId: chain.cs.id, items: [{ itemId: item.id, orderedQty: 10, unitRate: 100 }] });
    const approved = await purchaseOrders.approve(f.organization.id, f.user.id, po.id);
    await purchaseOrders.issue(f.organization.id, f.user.id, approved.id);

    await expect(
      purchaseOrders.update(f.organization.id, f.user.id, po.id, { poDate: "2026-03-21", supplierId: chain.supplier.id, items: [{ itemId: item.id, orderedQty: 10, unitRate: 999 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((await purchaseOrders.findOne(f.organization.id, po.id)).items[0]!.unitRate).toBe("100.00");
  });

  // M. Partial GRN works
  it("records a partial goods receipt and moves the PO to Partially Received", async () => {
    const f = await createOrganizationFixture(prisma, "PROCM");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item M" });
    const chain = await approvedCsChain(f, item.id, 100, 50);
    let po = await purchaseOrders.create(f.organization.id, f.user.id, { poDate: "2026-03-20", supplierId: chain.supplier.id, comparativeStatementId: chain.cs.id, items: [{ itemId: item.id, orderedQty: 50, unitRate: 100 }] });
    po = await purchaseOrders.approve(f.organization.id, f.user.id, po.id);
    po = await purchaseOrders.issue(f.organization.id, f.user.id, po.id);

    const received = await grn.create(f.organization.id, f.user.id, {
      purchaseOrderId: po.id,
      receiptDate: "2026-03-25",
      items: [{ purchaseOrderItemId: po.items[0]!.id, currentReceivedQty: 30, acceptedQty: 30 }],
    });
    expect(received.items[0]!.cumulativeReceivedQty).toBe("30.000");
    expect(received.items[0]!.remainingQty).toBe("20.000");
    expect((await purchaseOrders.findOne(f.organization.id, po.id)).status).toBe("PARTIALLY_RECEIVED");
  });

  // N. Cumulative GRN quantity cannot exceed the PO's ordered quantity
  it("rejects a GRN that would push cumulative received quantity past the ordered quantity", async () => {
    const f = await createOrganizationFixture(prisma, "PROCN");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item N" });
    const chain = await approvedCsChain(f, item.id, 100, 50);
    let po = await purchaseOrders.create(f.organization.id, f.user.id, { poDate: "2026-03-20", supplierId: chain.supplier.id, comparativeStatementId: chain.cs.id, items: [{ itemId: item.id, orderedQty: 50, unitRate: 100 }] });
    po = await purchaseOrders.approve(f.organization.id, f.user.id, po.id);
    po = await purchaseOrders.issue(f.organization.id, f.user.id, po.id);
    await grn.create(f.organization.id, f.user.id, { purchaseOrderId: po.id, receiptDate: "2026-03-25", items: [{ purchaseOrderItemId: po.items[0]!.id, currentReceivedQty: 30, acceptedQty: 30 }] });

    await expect(
      grn.create(f.organization.id, f.user.id, { purchaseOrderId: po.id, receiptDate: "2026-03-26", items: [{ purchaseOrderItemId: po.items[0]!.id, currentReceivedQty: 30, acceptedQty: 30 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((await purchaseOrders.findOne(f.organization.id, po.id)).items[0]!.receivedQty).toBe("30.000");
  });

  // O. Multiple GRNs move the PO to fully Received
  it("moves the PO to Received once cumulative GRNs cover the full ordered quantity", async () => {
    const f = await createOrganizationFixture(prisma, "PROCO");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item O" });
    const chain = await approvedCsChain(f, item.id, 100, 50);
    let po = await purchaseOrders.create(f.organization.id, f.user.id, { poDate: "2026-03-20", supplierId: chain.supplier.id, comparativeStatementId: chain.cs.id, items: [{ itemId: item.id, orderedQty: 50, unitRate: 100 }] });
    po = await purchaseOrders.approve(f.organization.id, f.user.id, po.id);
    po = await purchaseOrders.issue(f.organization.id, f.user.id, po.id);
    await grn.create(f.organization.id, f.user.id, { purchaseOrderId: po.id, receiptDate: "2026-03-25", items: [{ purchaseOrderItemId: po.items[0]!.id, currentReceivedQty: 30, acceptedQty: 30 }] });
    await grn.create(f.organization.id, f.user.id, { purchaseOrderId: po.id, receiptDate: "2026-03-27", items: [{ purchaseOrderItemId: po.items[0]!.id, currentReceivedQty: 20, acceptedQty: 20 }] });

    const final = await purchaseOrders.findOne(f.organization.id, po.id);
    expect(final.status).toBe("RECEIVED");
    expect(final.items[0]!.receivedQty).toBe("50.000");
    expect(final.items[0]!.remainingQty).toBe("0.000");
    expect(await prisma.goodsReceiptNote.count({ where: { purchaseOrderId: po.id } })).toBe(2);
  });

  // P. Cross-tenant PO/GRN access rejected over HTTP without leaking IDs
  it("blocks cross-tenant purchase order and GRN access over HTTP without leaking IDs", async () => {
    const a = await createOrganizationFixture(prisma, "PROCP1");
    const b = await createOrganizationFixture(prisma, "PROCP2");
    const itemB = await items.create(b.organization.id, b.user.id, { itemName: "Item P (Org B)" });
    const chainB = await approvedCsChain(b, itemB.id, 100, 10);
    const poB = await purchaseOrders.create(b.organization.id, b.user.id, { poDate: "2026-03-20", supplierId: chainB.supplier.id, comparativeStatementId: chainB.cs.id, items: [{ itemId: itemB.id, orderedQty: 10, unitRate: 100 }] });
    const issuedPoB = await purchaseOrders.issue(b.organization.id, b.user.id, (await purchaseOrders.approve(b.organization.id, b.user.id, poB.id)).id);
    const grnB = await grn.create(b.organization.id, b.user.id, { purchaseOrderId: issuedPoB.id, receiptDate: "2026-03-25", items: [{ purchaseOrderItemId: issuedPoB.items[0]!.id, currentReceivedQty: 5, acceptedQty: 5 }] });

    const access = await token(a.user.email, a.password);
    const poResponse = await request(app.getHttpServer()).get(`/api/v1/purchase-orders/${poB.id}`).set(auth(access)).expect(404);
    expect(JSON.stringify(poResponse.body)).not.toContain(b.organization.id);
    await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${poB.id}`)
      .set(auth(access))
      .send({ poDate: "2026-04-01", supplierId: chainB.supplier.id, items: [{ itemId: itemB.id, orderedQty: 1, unitRate: 1 }] })
      .expect(404);

    const grnResponse = await request(app.getHttpServer()).get(`/api/v1/grns/${grnB.id}`).set(auth(access)).expect(404);
    expect(JSON.stringify(grnResponse.body)).not.toContain(b.organization.id);
  });

  // Q. A read-only viewer cannot mutate any procurement record
  it("blocks a read-only viewer from mutating PR/RFQ/Quotation/CS/PO/GRN over HTTP", async () => {
    const viewer = await createOrganizationFixture(prisma, "PROCQ", ["procurement.read", "vendor.read", "item.read", "masters.read"]);
    const access = await token(viewer.user.email, viewer.password);

    await request(app.getHttpServer()).post("/api/v1/purchase-requisitions").set(auth(access)).send({ requestDate: "2026-03-01", items: [] }).expect(403);
    await request(app.getHttpServer()).post("/api/v1/rfqs").set(auth(access)).send({ issueDate: "2026-03-01", submissionDeadline: "2026-03-10", supplierIds: [] }).expect(403);
    await request(app.getHttpServer()).post("/api/v1/supplier-quotations").set(auth(access)).send({ rfqId: "x", supplierId: "x", quotationRef: "x", quotationDate: "2026-03-01", items: [] }).expect(403);
    await request(app.getHttpServer()).post("/api/v1/comparative-statements").set(auth(access)).send({ rfqId: "x" }).expect(403);
    await request(app.getHttpServer()).post("/api/v1/purchase-orders").set(auth(access)).send({ poDate: "2026-03-01", supplierId: "x", items: [] }).expect(403);
    await request(app.getHttpServer()).post("/api/v1/grns").set(auth(access)).send({ purchaseOrderId: "x", receiptDate: "2026-03-01", items: [] }).expect(403);

    expect(await prisma.purchaseRequisition.count({ where: { organizationId: viewer.organization.id } })).toBe(0);
  });

  // R. Archived supplier's historical procurement records remain readable
  it("keeps an archived supplier's historical procurement records fully readable", async () => {
    const f = await createOrganizationFixture(prisma, "PROCR");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item R" });
    const chain = await approvedCsChain(f, item.id, 100, 10);
    const po = await purchaseOrders.create(f.organization.id, f.user.id, { poDate: "2026-03-20", supplierId: chain.supplier.id, comparativeStatementId: chain.cs.id, items: [{ itemId: item.id, orderedQty: 10, unitRate: 100 }] });

    await parties.changeStatus(f.organization.id, f.user.id, chain.supplier.id, { status: "ARCHIVED" });

    const rfqAfterArchive = await rfqs.findOne(f.organization.id, chain.rfq.id);
    expect(rfqAfterArchive.suppliers[0]!.supplierId).toBe(chain.supplier.id);
    const quotationAfterArchive = await supplierQuotations.findOne(f.organization.id, chain.quotation.id);
    expect(quotationAfterArchive.supplierId).toBe(chain.supplier.id);
    const poAfterArchive = await purchaseOrders.findOne(f.organization.id, po.id);
    expect(poAfterArchive.supplier.id).toBe(chain.supplier.id);
  });

  // S. Procurement Core creates zero JournalEntry rows
  it("creates zero JournalEntry rows anywhere in the PR->RFQ->CS->PO->GRN chain", async () => {
    const f = await createOrganizationFixture(prisma, "PROCS");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item S" });
    const chain = await approvedCsChain(f, item.id, 100, 10);
    let po = await purchaseOrders.create(f.organization.id, f.user.id, { poDate: "2026-03-20", supplierId: chain.supplier.id, comparativeStatementId: chain.cs.id, items: [{ itemId: item.id, orderedQty: 10, unitRate: 100 }] });
    po = await purchaseOrders.approve(f.organization.id, f.user.id, po.id);
    po = await purchaseOrders.issue(f.organization.id, f.user.id, po.id);
    await grn.create(f.organization.id, f.user.id, { purchaseOrderId: po.id, receiptDate: "2026-03-25", items: [{ purchaseOrderItemId: po.items[0]!.id, currentReceivedQty: 10, acceptedQty: 10 }] });

    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id } })).toBe(0);
  });

  // T. Procurement Core creates zero Payable rows
  it("creates zero Payable rows anywhere in the PR->RFQ->CS->PO->GRN chain", async () => {
    const f = await createOrganizationFixture(prisma, "PROCT");
    const item = await items.create(f.organization.id, f.user.id, { itemName: "Item T" });
    const chain = await approvedCsChain(f, item.id, 100, 10);
    let po = await purchaseOrders.create(f.organization.id, f.user.id, { poDate: "2026-03-20", supplierId: chain.supplier.id, comparativeStatementId: chain.cs.id, items: [{ itemId: item.id, orderedQty: 10, unitRate: 100 }] });
    po = await purchaseOrders.approve(f.organization.id, f.user.id, po.id);
    po = await purchaseOrders.issue(f.organization.id, f.user.id, po.id);
    await grn.create(f.organization.id, f.user.id, { purchaseOrderId: po.id, receiptDate: "2026-03-25", items: [{ purchaseOrderItemId: po.items[0]!.id, currentReceivedQty: 10, acceptedQty: 10 }] });

    expect(await prisma.payable.count({ where: { organizationId: f.organization.id } })).toBe(0);
  });
});
