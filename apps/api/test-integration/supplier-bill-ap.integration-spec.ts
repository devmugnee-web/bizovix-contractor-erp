import { BadRequestException, ConflictException, INestApplication, NotFoundException, ValidationPipe } from "@nestjs/common";
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
import { SupplierBillsService } from "../src/modules/supplier-bills/supplier-bills.service";
import { SupplierPaymentsService } from "../src/modules/supplier-payments/supplier-payments.service";
import { SupplierLedgerService } from "../src/modules/supplier-ledger/supplier-ledger.service";
import { AccountingService } from "../src/modules/accounting/accounting.service";
import { createOrganizationFixture, resetTestDatabase } from "./fixtures";

describe("Supplier Bill / AP PostgreSQL integration", () => {
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
  let supplierBills: SupplierBillsService;
  let supplierPayments: SupplierPaymentsService;
  let supplierLedger: SupplierLedgerService;
  let accounting: AccountingService;

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
    supplierBills = app.get(SupplierBillsService);
    supplierPayments = app.get(SupplierPaymentsService);
    supplierLedger = app.get(SupplierLedgerService);
    accounting = app.get(AccountingService);
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => {
    await resetTestDatabase(prisma);
    await app.close();
  });

  async function token(email: string, password: string) {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password }).expect(201);
    return response.body.data.accessToken as string;
  }
  const auth = (value: string) => ({ Authorization: `Bearer ${value}` });

  /** Issued PO with a GRN already accepted, i.e. the state a supplier invoice normally arrives in. */
  async function receivedPo(
    fixture: Awaited<ReturnType<typeof createOrganizationFixture>>,
    options: { orderedQty?: number; acceptedQty?: number; unitRate?: number; withProject?: boolean } = {},
  ) {
    const orderedQty = options.orderedQty ?? 100;
    const acceptedQty = options.acceptedQty ?? orderedQty;
    const unitRate = options.unitRate ?? 50;
    const supplier = await parties.create(fixture.organization.id, fixture.user.id, { name: `Supplier ${Math.random().toString(36).slice(2, 8)}`, roles: ["SUPPLIER"] });
    const item = await items.create(fixture.organization.id, fixture.user.id, { itemName: `Item ${Math.random().toString(36).slice(2, 8)}` });

    // A PO can only be raised from an approved Comparative Statement with an explicitly selected
    // supplier, so the helper walks the real PR -> RFQ -> Quotation -> CS chain first.
    const pr = await purchaseRequisitions.create(fixture.organization.id, fixture.user.id, {
      requestDate: "2026-04-01",
      cmsWorkId: options.withProject === false ? undefined : fixture.work.id,
      items: [{ itemId: item.id, requestedQty: orderedQty, estimatedRate: unitRate }],
    });
    await purchaseRequisitions.submit(fixture.organization.id, fixture.user.id, pr.id);
    const approvedPr = await purchaseRequisitions.approve(fixture.organization.id, fixture.user.id, pr.id);

    const rfq = await rfqs.create(fixture.organization.id, fixture.user.id, {
      purchaseRequisitionId: approvedPr.id,
      issueDate: "2026-04-05",
      submissionDeadline: "2026-04-15",
      supplierIds: [supplier.id],
    });
    const issuedRfq = await rfqs.issue(fixture.organization.id, fixture.user.id, rfq.id);
    const quotation = await supplierQuotations.create(fixture.organization.id, fixture.user.id, {
      rfqId: issuedRfq.id,
      supplierId: supplier.id,
      quotationRef: `Q-${Math.random().toString(36).slice(2, 8)}`,
      quotationDate: "2026-04-08",
      items: [{ rfqItemId: issuedRfq.items[0]!.id, offeredQty: orderedQty, unitRate }],
    });
    const cs = await comparativeStatements.create(fixture.organization.id, fixture.user.id, { rfqId: issuedRfq.id });
    await comparativeStatements.selectSupplier(fixture.organization.id, fixture.user.id, cs.id, { supplierId: supplier.id });
    const approvedCs = await comparativeStatements.approve(fixture.organization.id, fixture.user.id, cs.id);

    const draft = await purchaseOrders.create(fixture.organization.id, fixture.user.id, {
      poDate: "2026-05-01",
      supplierId: supplier.id,
      comparativeStatementId: approvedCs.id,
      items: [{ itemId: item.id, orderedQty, unitRate, sourceQuotationItemId: quotation.items[0]!.id }],
    });
    const approved = await purchaseOrders.approve(fixture.organization.id, fixture.user.id, draft.id);
    const issued = await purchaseOrders.issue(fixture.organization.id, fixture.user.id, approved.id);
    const poItemId = issued.items[0]!.id;

    if (acceptedQty > 0) {
      await grn.create(fixture.organization.id, fixture.user.id, {
        purchaseOrderId: issued.id,
        receiptDate: "2026-05-05",
        items: [{ purchaseOrderItemId: poItemId, currentReceivedQty: acceptedQty, acceptedQty }],
      });
    }
    return { supplier, item, po: issued, poItemId, unitRate, orderedQty, acceptedQty };
  }

  // A. Supplier Bill rejects a supplier belonging to another tenant
  it("rejects a Supplier Bill whose supplier belongs to another organization", async () => {
    const a = await createOrganizationFixture(prisma, "APA1");
    const b = await createOrganizationFixture(prisma, "APA2");
    const chain = await receivedPo(a);
    const foreignSupplier = await parties.create(b.organization.id, b.user.id, { name: "Org B Supplier", roles: ["SUPPLIER"] });

    await expect(
      supplierBills.create(a.organization.id, a.user.id, {
        supplierInvoiceNo: "INV-A",
        supplierInvoiceDate: "2026-05-10",
        supplierId: foreignSupplier.id,
        purchaseOrderId: chain.po.id,
        items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 10, invoiceRate: 50 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // B. Supplier Bill rejects a purchase order belonging to another tenant
  it("rejects a Supplier Bill whose purchase order belongs to another organization", async () => {
    const a = await createOrganizationFixture(prisma, "APB1");
    const b = await createOrganizationFixture(prisma, "APB2");
    const mine = await receivedPo(a);
    const theirs = await receivedPo(b);

    await expect(
      supplierBills.create(a.organization.id, a.user.id, {
        supplierInvoiceNo: "INV-B",
        supplierInvoiceDate: "2026-05-10",
        supplierId: mine.supplier.id,
        purchaseOrderId: theirs.po.id,
        items: [{ purchaseOrderItemId: theirs.poItemId, currentBilledQty: 10, invoiceRate: 50 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // C. A same-tenant PO that belongs to a different supplier is still rejected
  it("rejects a same-tenant purchase order that belongs to a different supplier", async () => {
    const f = await createOrganizationFixture(prisma, "APC");
    const chain = await receivedPo(f);
    const otherSupplier = await parties.create(f.organization.id, f.user.id, { name: "Unrelated Supplier", roles: ["SUPPLIER"] });

    await expect(
      supplierBills.create(f.organization.id, f.user.id, {
        supplierInvoiceNo: "INV-C",
        supplierInvoiceDate: "2026-05-10",
        supplierId: otherSupplier.id,
        purchaseOrderId: chain.po.id,
        items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 10, invoiceRate: 50 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // D. Billed quantity may never exceed the accepted GRN quantity
  it("blocks a bill whose quantity exceeds the accepted GRN quantity", async () => {
    const f = await createOrganizationFixture(prisma, "APD");
    const chain = await receivedPo(f, { orderedQty: 100, acceptedQty: 40 });

    const bill = await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "INV-D",
      supplierInvoiceDate: "2026-05-10",
      supplierId: chain.supplier.id,
      purchaseOrderId: chain.po.id,
      items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 60, invoiceRate: 50 }],
    });
    expect(bill.matchStatus).toBe("BLOCKED");
    expect(bill.items[0]!.matchStatus).toBe("BLOCKED");
    await expect(supplierBills.submit(f.organization.id, f.user.id, bill.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  // E. A second bill only gets the quantity the first approved bill left behind
  it("respects previously billed quantity when a second bill is raised against the same PO line", async () => {
    const f = await createOrganizationFixture(prisma, "APE");
    const chain = await receivedPo(f, { orderedQty: 100, acceptedQty: 100 });

    const first = await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "INV-E1",
      supplierInvoiceDate: "2026-05-10",
      supplierId: chain.supplier.id,
      purchaseOrderId: chain.po.id,
      items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 70, invoiceRate: 50 }],
    });
    await supplierBills.submit(f.organization.id, f.user.id, first.id);
    await supplierBills.approve(f.organization.id, f.user.id, first.id);

    const poItem = await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: chain.poItemId } });
    expect(poItem.billedQty.toFixed(3)).toBe("70.000");

    const second = await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "INV-E2",
      supplierInvoiceDate: "2026-05-12",
      supplierId: chain.supplier.id,
      purchaseOrderId: chain.po.id,
      items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 40, invoiceRate: 50 }],
    });
    expect(second.matchStatus).toBe("BLOCKED"); // only 30 remained billable

    const withinCeiling = await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "INV-E3",
      supplierInvoiceDate: "2026-05-13",
      supplierId: chain.supplier.id,
      purchaseOrderId: chain.po.id,
      items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 30, invoiceRate: 50 }],
    });
    expect(withinCeiling.matchStatus).toBe("MATCHED");
    expect(withinCeiling.items[0]!.previouslyBilledQty).toBe("70.000");
    expect(withinCeiling.items[0]!.remainingBillableQty).toBe("0.000");
  });

  // F. The same supplier invoice number can never be entered twice for one supplier
  it("blocks a duplicate supplier invoice number for the same supplier but allows it for another", async () => {
    const f = await createOrganizationFixture(prisma, "APF");
    const chain = await receivedPo(f);
    const otherChain = await receivedPo(f);

    await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "DUP-001",
      supplierInvoiceDate: "2026-05-10",
      supplierId: chain.supplier.id,
      purchaseOrderId: chain.po.id,
      items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 10, invoiceRate: 50 }],
    });

    await expect(
      supplierBills.create(f.organization.id, f.user.id, {
        supplierInvoiceNo: "DUP-001",
        supplierInvoiceDate: "2026-05-11",
        supplierId: chain.supplier.id,
        purchaseOrderId: chain.po.id,
        items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 5, invoiceRate: 50 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // A different supplier may legitimately use the same invoice number.
    const otherSupplierBill = await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "DUP-001",
      supplierInvoiceDate: "2026-05-11",
      supplierId: otherChain.supplier.id,
      purchaseOrderId: otherChain.po.id,
      items: [{ purchaseOrderItemId: otherChain.poItemId, currentBilledQty: 5, invoiceRate: 50 }],
    });
    expect(otherSupplierBill.supplierInvoiceNo).toBe("DUP-001");
  });

  // G. Bill totals are computed by the backend, not taken from the caller
  it("computes bill subtotal, VAT, AIT and net payable on the backend", async () => {
    const f = await createOrganizationFixture(prisma, "APG");
    const chain = await receivedPo(f, { orderedQty: 100, acceptedQty: 100, unitRate: 50 });
    await prisma.deductionConfig.createMany({
      data: [
        { organizationId: f.organization.id, type: "VAT", name: "VAT 5%", rate: 5, effectiveFrom: new Date("2026-01-01") },
        { organizationId: f.organization.id, type: "AIT", name: "AIT 3%", rate: 3, effectiveFrom: new Date("2026-01-01") },
      ],
    });

    const bill = await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "INV-G",
      supplierInvoiceDate: "2026-05-10",
      supplierId: chain.supplier.id,
      purchaseOrderId: chain.po.id,
      items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 100, invoiceRate: 50, discountAmount: 500 }],
      otherDeductions: [{ type: "RETENTION", amount: 200 }],
    });

    expect(bill.subtotal).toBe("5000.00"); // 100 * 50
    expect(bill.discountAmount).toBe("500.00");
    expect(bill.taxableBase).toBe("4500.00");
    expect(bill.vatAmount).toBe("225.00"); // 4500 * 5%
    expect(bill.aitAmount).toBe("135.00"); // 4500 * 3%
    expect(bill.otherDeductionAmount).toBe("200.00");
    // 4500 + 225 VAT − 135 AIT − 200 other
    expect(bill.netPayable).toBe("4390.00");
  });

  // H. Deduction rate/base/amount are snapshotted so approved bills stay reproducible
  it("preserves deduction snapshots after the organization's configured rate changes", async () => {
    const f = await createOrganizationFixture(prisma, "APH");
    const chain = await receivedPo(f, { orderedQty: 10, acceptedQty: 10, unitRate: 100 });
    const vat = await prisma.deductionConfig.create({
      data: { organizationId: f.organization.id, type: "VAT", name: "VAT 5%", rate: 5, effectiveFrom: new Date("2026-01-01") },
    });

    const bill = await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "INV-H",
      supplierInvoiceDate: "2026-05-10",
      supplierId: chain.supplier.id,
      purchaseOrderId: chain.po.id,
      items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 10, invoiceRate: 100 }],
    });
    await supplierBills.submit(f.organization.id, f.user.id, bill.id);
    const approved = await supplierBills.approve(f.organization.id, f.user.id, bill.id);
    expect(approved.vatAmount).toBe("50.00");

    // Change the live configuration — the approved bill must not move.
    await prisma.deductionConfig.update({ where: { id: vat.id }, data: { rate: 15 } });

    const reloaded = await supplierBills.findOne(f.organization.id, bill.id);
    expect(reloaded.vatAmount).toBe("50.00");
    expect(reloaded.vatRate).toBe("5.0000");
    const snapshot = reloaded.deductions.find((deduction) => deduction.type === "VAT")!;
    expect(snapshot.rate).toBe("5.0000");
    expect(snapshot.base).toBe("1000.00");
    expect(snapshot.amount).toBe("50.00");
  });

  // I. A blocked bill can never reach approval
  it("refuses to approve a bill whose match status is blocking", async () => {
    const f = await createOrganizationFixture(prisma, "API");
    const chain = await receivedPo(f, { orderedQty: 100, acceptedQty: 0 });

    const bill = await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "INV-I",
      supplierInvoiceDate: "2026-05-10",
      supplierId: chain.supplier.id,
      purchaseOrderId: chain.po.id,
      items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 10, invoiceRate: 50 }],
    });
    expect(bill.matchStatus).toBe("MISSING_RECEIPT");
    await expect(supplierBills.submit(f.organization.id, f.user.id, bill.id)).rejects.toBeInstanceOf(BadRequestException);
    await expect(supplierBills.approve(f.organization.id, f.user.id, bill.id)).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.payable.count({ where: { organizationId: f.organization.id } })).toBe(0);
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id, sourceModule: "SUPPLIER_BILL" } })).toBe(0);
  });

  // J + K. Approval posts exactly one Payable and exactly one balanced journal
  it("creates exactly one Payable and one balanced JournalEntry when a bill is approved", async () => {
    const f = await createOrganizationFixture(prisma, "APJK");
    const chain = await receivedPo(f, { orderedQty: 20, acceptedQty: 20, unitRate: 100 });

    const bill = await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "INV-JK",
      supplierInvoiceDate: "2026-05-10",
      supplierId: chain.supplier.id,
      purchaseOrderId: chain.po.id,
      items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 20, invoiceRate: 100 }],
    });
    await supplierBills.submit(f.organization.id, f.user.id, bill.id);
    const approved = await supplierBills.approve(f.organization.id, f.user.id, bill.id);

    expect(approved.status).toBe("APPROVED");
    const payables = await prisma.payable.findMany({ where: { organizationId: f.organization.id } });
    expect(payables).toHaveLength(1);
    expect(payables[0]!.amount.toFixed(2)).toBe("2000.00");
    expect(payables[0]!.partyId).toBe(chain.supplier.id);
    expect(approved.payableId).toBe(payables[0]!.id);

    const journals = await prisma.journalEntry.findMany({
      where: { organizationId: f.organization.id, sourceModule: "SUPPLIER_BILL", sourceId: bill.id },
      include: { lines: true },
    });
    expect(journals).toHaveLength(1);
    const debit = journals[0]!.lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const credit = journals[0]!.lines.reduce((sum, line) => sum + Number(line.credit), 0);
    expect(debit).toBeCloseTo(credit, 2);
    expect(debit).toBeCloseTo(2000, 2);
  });

  // L. Approving twice must not post twice
  it("is idempotent when approve is called again on an already approved bill", async () => {
    const f = await createOrganizationFixture(prisma, "APL");
    const chain = await receivedPo(f, { orderedQty: 10, acceptedQty: 10, unitRate: 100 });

    const bill = await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "INV-L",
      supplierInvoiceDate: "2026-05-10",
      supplierId: chain.supplier.id,
      purchaseOrderId: chain.po.id,
      items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 10, invoiceRate: 100 }],
    });
    await supplierBills.submit(f.organization.id, f.user.id, bill.id);
    await supplierBills.approve(f.organization.id, f.user.id, bill.id);

    // Second call is rejected by the status guard rather than double-posting.
    await expect(supplierBills.approve(f.organization.id, f.user.id, bill.id)).rejects.toBeInstanceOf(BadRequestException);

    expect(await prisma.payable.count({ where: { organizationId: f.organization.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id, sourceModule: "SUPPLIER_BILL", sourceId: bill.id } })).toBe(1);
    const poItem = await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: chain.poItemId } });
    expect(poItem.billedQty.toFixed(3)).toBe("10.000"); // not incremented twice
  });

  /** Approved bill + its payable, ready to be paid. */
  async function approvedBill(fixture: Awaited<ReturnType<typeof createOrganizationFixture>>, netAmount = 1000) {
    const chain = await receivedPo(fixture, { orderedQty: 10, acceptedQty: 10, unitRate: netAmount / 10 });
    const bill = await supplierBills.create(fixture.organization.id, fixture.user.id, {
      supplierInvoiceNo: `INV-${Math.random().toString(36).slice(2, 8)}`,
      supplierInvoiceDate: "2026-05-10",
      supplierId: chain.supplier.id,
      purchaseOrderId: chain.po.id,
      items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 10, invoiceRate: netAmount / 10 }],
    });
    await supplierBills.submit(fixture.organization.id, fixture.user.id, bill.id);
    const approved = await supplierBills.approve(fixture.organization.id, fixture.user.id, bill.id);
    return { ...chain, bill: approved };
  }

  // M. Partial payment moves the bill to PARTIALLY_PAID and leaves the rest outstanding
  it("records a partial supplier payment and leaves the remainder outstanding", async () => {
    const f = await createOrganizationFixture(prisma, "APM");
    const { bill } = await approvedBill(f, 1000);

    const payment = await supplierPayments.create(f.organization.id, f.user.id, {
      supplierBillId: bill.id,
      bankAccountId: f.bank.id,
      amount: 400,
      paymentDate: "2026-05-20",
    });
    expect(payment.amount).toBe("400.00");
    expect(payment.payable.outstanding).toBe("600.00");

    const reloaded = await supplierBills.findOne(f.organization.id, bill.id);
    expect(reloaded.status).toBe("PARTIALLY_PAID");
    const payable = await prisma.payable.findFirstOrThrow({ where: { organizationId: f.organization.id } });
    expect(payable.paidAmount.toFixed(2)).toBe("400.00");
    expect(payable.status).toBe("PARTIALLY_PAID");
  });

  // N. Over-payment is refused
  it("blocks a supplier payment larger than the outstanding payable", async () => {
    const f = await createOrganizationFixture(prisma, "APN");
    const { bill } = await approvedBill(f, 1000);

    await expect(
      supplierPayments.create(f.organization.id, f.user.id, { supplierBillId: bill.id, bankAccountId: f.bank.id, amount: 1500, paymentDate: "2026-05-20" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await supplierPayments.create(f.organization.id, f.user.id, { supplierBillId: bill.id, bankAccountId: f.bank.id, amount: 1000, paymentDate: "2026-05-20" });
    await expect(
      supplierPayments.create(f.organization.id, f.user.id, { supplierBillId: bill.id, bankAccountId: f.bank.id, amount: 0.01, paymentDate: "2026-05-21" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // O. Two concurrent payments must not both consume the same outstanding balance
  it("prevents two concurrent payments from over-allocating the same payable", async () => {
    const f = await createOrganizationFixture(prisma, "APO");
    const { bill } = await approvedBill(f, 1000);

    const results = await Promise.allSettled([
      supplierPayments.create(f.organization.id, f.user.id, { supplierBillId: bill.id, bankAccountId: f.bank.id, amount: 700, paymentDate: "2026-05-20" }),
      supplierPayments.create(f.organization.id, f.user.id, { supplierBillId: bill.id, bankAccountId: f.bank.id, amount: 700, paymentDate: "2026-05-20" }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const payable = await prisma.payable.findFirstOrThrow({ where: { organizationId: f.organization.id } });
    expect(Number(payable.paidAmount)).toBeLessThanOrEqual(Number(payable.amount));
    expect(payable.paidAmount.toFixed(2)).toBe("700.00");
    expect(await prisma.supplierPayment.count({ where: { organizationId: f.organization.id, status: "ACTIVE" } })).toBe(1);
  });

  // P. The payment posts AP debit / bank credit and moves the operational bank balance
  it("posts a balanced Accounts Payable debit and bank credit for a supplier payment", async () => {
    const f = await createOrganizationFixture(prisma, "APP");
    const { bill } = await approvedBill(f, 1000);
    const openingBalance = (await prisma.bankAccount.findUniqueOrThrow({ where: { id: f.bank.id } })).currentBalance;

    const payment = await supplierPayments.create(f.organization.id, f.user.id, {
      supplierBillId: bill.id,
      bankAccountId: f.bank.id,
      amount: 400,
      paymentDate: "2026-05-20",
    });

    const journal = await prisma.journalEntry.findFirstOrThrow({
      where: { organizationId: f.organization.id, sourceModule: "SUPPLIER_PAYMENT", sourceId: payment.id },
      include: { lines: { include: { account: true } } },
    });
    const apLine = journal.lines.find((line) => line.account.systemKey === "ACCOUNTS_PAYABLE")!;
    const bankLine = journal.lines.find((line) => line.account.linkedBankAccountId === f.bank.id)!;
    expect(apLine.debit.toFixed(2)).toBe("400.00");
    expect(bankLine.credit.toFixed(2)).toBe("400.00");

    const bankAfter = await prisma.bankAccount.findUniqueOrThrow({ where: { id: f.bank.id } });
    expect(bankAfter.currentBalance.toFixed(2)).toBe(openingBalance.sub(400).toFixed(2));
    expect(await prisma.financialTransaction.count({ where: { organizationId: f.organization.id, sourceModule: "SUPPLIER_PAYMENT" } })).toBe(1);
  });

  // Q. Cancelling a payment reverses the GL, the bank movement and the payable
  it("reverses payable, bank balance and GL when a supplier payment is cancelled", async () => {
    const f = await createOrganizationFixture(prisma, "APQ");
    const { bill } = await approvedBill(f, 1000);
    const openingBalance = (await prisma.bankAccount.findUniqueOrThrow({ where: { id: f.bank.id } })).currentBalance;

    const payment = await supplierPayments.create(f.organization.id, f.user.id, {
      supplierBillId: bill.id,
      bankAccountId: f.bank.id,
      amount: 400,
      paymentDate: "2026-05-20",
    });
    const cancelled = await supplierPayments.cancel(f.organization.id, f.user.id, payment.id, { reason: "Wrong bank account" });
    expect(cancelled.status).toBe("CANCELLED");

    const payable = await prisma.payable.findFirstOrThrow({ where: { organizationId: f.organization.id } });
    expect(payable.paidAmount.toFixed(2)).toBe("0.00");
    expect(payable.status).toBe("UNPAID");

    const billAfter = await supplierBills.findOne(f.organization.id, bill.id);
    expect(billAfter.status).toBe("APPROVED");

    const bankAfter = await prisma.bankAccount.findUniqueOrThrow({ where: { id: f.bank.id } });
    expect(bankAfter.currentBalance.toFixed(2)).toBe(openingBalance.toFixed(2));

    const original = await prisma.journalEntry.findFirstOrThrow({ where: { organizationId: f.organization.id, sourceModule: "SUPPLIER_PAYMENT", sourceId: payment.id } });
    expect(original.status).toBe("REVERSED");
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id, reversalOfId: original.id } })).toBe(1);

    // Cancelling again is a no-op rather than a second reversal.
    await supplierPayments.cancel(f.organization.id, f.user.id, payment.id, { reason: "Repeat" });
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id, reversalOfId: original.id } })).toBe(1);
  });

  // R. The supplier ledger reconciles to the payable subledger
  it("produces a supplier ledger that reconciles to the supplier's outstanding payable", async () => {
    const f = await createOrganizationFixture(prisma, "APR");
    const { bill, supplier } = await approvedBill(f, 1000);
    await supplierPayments.create(f.organization.id, f.user.id, { supplierBillId: bill.id, bankAccountId: f.bank.id, amount: 400, paymentDate: "2026-05-20" });

    const ledger = await supplierLedger.ledger(f.organization.id, { supplierId: supplier.id });
    expect(ledger.items).toHaveLength(2);
    expect(ledger.items[0]!.type).toBe("Supplier Bill");
    expect(ledger.items[0]!.credit).toBe("1000.00");
    expect(ledger.items[1]!.type).toBe("Supplier Payment");
    expect(ledger.items[1]!.debit).toBe("400.00");
    expect(ledger.summary.closingBalance).toBe("600.00");
    expect(ledger.summary.payableOutstanding).toBe("600.00");
    expect(ledger.summary.reconciled).toBe(true);
    expect(ledger.items[0]!.supplierBill?.id).toBe(bill.id);
  });

  // S. AP control account equals the Payable subledger
  it("keeps the Accounts Payable control account equal to the Payable subledger", async () => {
    const f = await createOrganizationFixture(prisma, "APS");
    const { bill } = await approvedBill(f, 1000);
    await supplierPayments.create(f.organization.id, f.user.id, { supplierBillId: bill.id, bankAccountId: f.bank.id, amount: 250, paymentDate: "2026-05-20" });

    const reconciliation = await supplierLedger.reconciliation(f.organization.id);
    expect(reconciliation.controlBalance).toBe("750.00");
    expect(reconciliation.subledgerBalance).toBe("750.00");
    expect(reconciliation.reconciled).toBe(true);

    const integrity = await accounting.integrity(f.organization.id);
    expect(integrity.ap.status).toBe("BALANCED");
    expect(integrity.unbalancedJournalCount).toBe(0);
    expect(integrity.banks.every((bank) => bank.status === "BALANCED")).toBe(true);
  });

  // T. Cross-tenant bill access over HTTP is rejected without leaking ids
  it("rejects cross-tenant Supplier Bill access over HTTP", async () => {
    const a = await createOrganizationFixture(prisma, "APT1");
    const b = await createOrganizationFixture(prisma, "APT2");
    const { bill } = await approvedBill(b, 500);
    const access = await token(a.user.email, a.password);

    const response = await request(app.getHttpServer()).get(`/api/v1/supplier-bills/${bill.id}`).set(auth(access)).expect(404);
    expect(JSON.stringify(response.body)).not.toContain(b.organization.id);
    await request(app.getHttpServer()).post(`/api/v1/supplier-bills/${bill.id}/approve`).set(auth(access)).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/supplier-bills/${bill.id}/cancel`).set(auth(access)).expect(404);
  });

  // U. Cross-tenant payment access is rejected
  it("rejects cross-tenant Supplier Payment access over HTTP", async () => {
    const a = await createOrganizationFixture(prisma, "APU1");
    const b = await createOrganizationFixture(prisma, "APU2");
    const { bill } = await approvedBill(b, 500);
    const payment = await supplierPayments.create(b.organization.id, b.user.id, { supplierBillId: bill.id, bankAccountId: b.bank.id, amount: 100, paymentDate: "2026-05-20" });
    const access = await token(a.user.email, a.password);

    await request(app.getHttpServer()).get(`/api/v1/supplier-payments/${payment.id}`).set(auth(access)).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/supplier-payments/${payment.id}/cancel`).set(auth(access)).send({ reason: "hijack" }).expect(404);

    // Org A also cannot pay Org B's bill even with a valid-looking payload.
    await request(app.getHttpServer())
      .post("/api/v1/supplier-payments")
      .set(auth(access))
      .send({ supplierBillId: bill.id, bankAccountId: a.bank.id, amount: 50, paymentDate: "2026-05-21" })
      .expect(404);
    expect((await prisma.payable.findFirstOrThrow({ where: { organizationId: b.organization.id } })).paidAmount.toFixed(2)).toBe("100.00");
  });

  // V. A read-only user cannot approve a bill or record a payment
  it("denies bill approval and payment to a user without the approve/pay permissions", async () => {
    const owner = await createOrganizationFixture(prisma, "APV1");
    const { bill } = await approvedBill(owner, 500);

    // A viewer in the SAME organization, holding only read permissions.
    const viewerRole = await prisma.role.create({ data: { organizationId: owner.organization.id, name: "Viewer APV", isSystem: false } });
    const readPermissions = await prisma.permission.findMany({ where: { key: { in: ["supplier_bill.read", "supplier_payment.read"] } } });
    await prisma.rolePermission.createMany({ data: readPermissions.map((permission) => ({ roleId: viewerRole.id, permissionId: permission.id })) });
    const bcrypt = await import("bcryptjs");
    const viewer = await prisma.user.create({
      data: { email: "viewer-apv@bizovix.invalid", name: "Viewer APV", passwordHash: await bcrypt.default.hash("Viewer-APV-Password!", 4) },
    });
    await prisma.organizationUser.create({ data: { organizationId: owner.organization.id, userId: viewer.id, roleId: viewerRole.id, isDefault: true } });

    const access = await token(viewer.email, "Viewer-APV-Password!");
    await request(app.getHttpServer()).get(`/api/v1/supplier-bills/${bill.id}`).set(auth(access)).expect(200);
    await request(app.getHttpServer()).post(`/api/v1/supplier-bills/${bill.id}/approve`).set(auth(access)).expect(403);
    await request(app.getHttpServer())
      .post("/api/v1/supplier-payments")
      .set(auth(access))
      .send({ supplierBillId: bill.id, bankAccountId: owner.bank.id, amount: 100, paymentDate: "2026-05-21" })
      .expect(403);
    expect(await prisma.supplierPayment.count({ where: { organizationId: owner.organization.id } })).toBe(0);
  });

  // W. Procurement itself still posts nothing until a bill is approved
  it("keeps procurement free of accounting until a supplier bill is approved", async () => {
    const f = await createOrganizationFixture(prisma, "APW");
    const chain = await receivedPo(f, { orderedQty: 10, acceptedQty: 10, unitRate: 100 });

    // PO + GRN exist, but no bill yet.
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id } })).toBe(0);
    expect(await prisma.payable.count({ where: { organizationId: f.organization.id } })).toBe(0);

    const bill = await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "INV-W",
      supplierInvoiceDate: "2026-05-10",
      supplierId: chain.supplier.id,
      purchaseOrderId: chain.po.id,
      items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 10, invoiceRate: 100 }],
    });
    await supplierBills.submit(f.organization.id, f.user.id, bill.id);
    // Draft and pending-approval bills are still purely a matching exercise.
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id } })).toBe(0);
    expect(await prisma.payable.count({ where: { organizationId: f.organization.id } })).toBe(0);

    await supplierBills.approve(f.organization.id, f.user.id, bill.id);
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id, sourceModule: "SUPPLIER_BILL" } })).toBe(1);
    expect(await prisma.payable.count({ where: { organizationId: f.organization.id } })).toBe(1);
  });

  // X. A completed/archived project blocks new bills but keeps history readable
  it("blocks new supplier bills against a completed project while keeping existing ones readable", async () => {
    const f = await createOrganizationFixture(prisma, "APX");
    const chain = await receivedPo(f, { orderedQty: 20, acceptedQty: 20, unitRate: 100 });

    const existing = await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "INV-X1",
      supplierInvoiceDate: "2026-05-10",
      supplierId: chain.supplier.id,
      purchaseOrderId: chain.po.id,
      items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 10, invoiceRate: 100 }],
    });

    await prisma.cmsWork.update({ where: { id: f.work.id }, data: { status: "COMPLETED" } });

    await expect(
      supplierBills.create(f.organization.id, f.user.id, {
        supplierInvoiceNo: "INV-X2",
        supplierInvoiceDate: "2026-05-12",
        supplierId: chain.supplier.id,
        purchaseOrderId: chain.po.id,
        items: [{ purchaseOrderItemId: chain.poItemId, currentBilledQty: 5, invoiceRate: 100 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(supplierBills.submit(f.organization.id, f.user.id, existing.id)).rejects.toBeInstanceOf(BadRequestException);

    // Historical procurement stays readable.
    const readback = await supplierBills.findOne(f.organization.id, existing.id);
    expect(readback.billNo).toBe(existing.billNo);
  });
});
