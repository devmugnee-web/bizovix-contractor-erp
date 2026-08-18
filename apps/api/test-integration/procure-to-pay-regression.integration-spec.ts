import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
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

/** One continuous, service-driven walk of the entire procure-to-pay chain, asserting that the
 * financial tail (bill -> payable -> payments) reconciles against AP control, the bank and the
 * trial balance, and that nothing double-posts along the way. */
describe("Procure-to-Pay full regression (Vendor -> PR -> RFQ -> CS -> PO -> GRN -> Bill -> Payable -> Payments)", () => {
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

  it("carries lineage end to end, settles the payable to zero, and leaves AP, bank and the trial balance reconciled", async () => {
    const f = await createOrganizationFixture(prisma, "P2P");
    const otherOrg = await createOrganizationFixture(prisma, "P2PISO");
    const openingBank = (await prisma.bankAccount.findUniqueOrThrow({ where: { id: f.bank.id } })).currentBalance;

    await prisma.deductionConfig.createMany({
      data: [
        { organizationId: f.organization.id, type: "VAT", name: "VAT 5%", rate: 5, effectiveFrom: new Date("2026-01-01") },
        { organizationId: f.organization.id, type: "AIT", name: "AIT 3%", rate: 3, effectiveFrom: new Date("2026-01-01") },
      ],
    });

    // --- Vendor + Item -------------------------------------------------------------------
    const supplier = await parties.create(f.organization.id, f.user.id, { name: "P2P Supplier Ltd", roles: ["SUPPLIER"] });
    const item = await items.create(f.organization.id, f.user.id, { itemName: "P2P Chain Material" });

    // --- PR -> submit -> approve ----------------------------------------------------------
    const pr = await purchaseRequisitions.create(f.organization.id, f.user.id, {
      requestDate: "2026-04-01",
      cmsWorkId: f.work.id,
      items: [{ itemId: item.id, requestedQty: 100, estimatedRate: 100, boqItemId: f.boq.id }],
    });
    await purchaseRequisitions.submit(f.organization.id, f.user.id, pr.id);
    const approvedPr = await purchaseRequisitions.approve(f.organization.id, f.user.id, pr.id);
    expect(approvedPr.status).toBe("APPROVED");

    // --- RFQ -> issue -> quotation ---------------------------------------------------------
    const rfq = await rfqs.create(f.organization.id, f.user.id, {
      purchaseRequisitionId: approvedPr.id,
      issueDate: "2026-04-05",
      submissionDeadline: "2026-04-15",
      supplierIds: [supplier.id],
    });
    const issuedRfq = await rfqs.issue(f.organization.id, f.user.id, rfq.id);
    const quotation = await supplierQuotations.create(f.organization.id, f.user.id, {
      rfqId: issuedRfq.id,
      supplierId: supplier.id,
      quotationRef: "P2P-Q1",
      quotationDate: "2026-04-08",
      items: [{ rfqItemId: issuedRfq.items[0]!.id, offeredQty: 100, unitRate: 100 }],
    });

    // --- CS -> explicit selection -> approve ------------------------------------------------
    const cs = await comparativeStatements.create(f.organization.id, f.user.id, { rfqId: issuedRfq.id });
    await comparativeStatements.selectSupplier(f.organization.id, f.user.id, cs.id, { supplierId: supplier.id });
    const approvedCs = await comparativeStatements.approve(f.organization.id, f.user.id, cs.id);
    expect(approvedCs.status).toBe("APPROVED");

    // --- PO -> approve -> issue -------------------------------------------------------------
    const draftPo = await purchaseOrders.create(f.organization.id, f.user.id, {
      poDate: "2026-05-01",
      supplierId: supplier.id,
      comparativeStatementId: approvedCs.id,
      items: [{ itemId: item.id, orderedQty: 100, unitRate: 100, sourceQuotationItemId: quotation.items[0]!.id }],
    });
    await purchaseOrders.approve(f.organization.id, f.user.id, draftPo.id);
    const issuedPo = await purchaseOrders.issue(f.organization.id, f.user.id, draftPo.id);
    const poItemId = issuedPo.items[0]!.id;

    // Procurement so far is a purely operational chain — nothing financial yet.
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id } })).toBe(0);
    expect(await prisma.payable.count({ where: { organizationId: f.organization.id } })).toBe(0);

    // --- GRN receives the full ordered quantity ---------------------------------------------
    await grn.create(f.organization.id, f.user.id, {
      purchaseOrderId: issuedPo.id,
      receiptDate: "2026-05-05",
      items: [{ purchaseOrderItemId: poItemId, currentReceivedQty: 100, acceptedQty: 100 }],
    });
    expect((await purchaseOrders.findOne(f.organization.id, issuedPo.id)).status).toBe("RECEIVED");

    // --- Supplier Bill -> submit -> approve --------------------------------------------------
    const bill = await supplierBills.create(f.organization.id, f.user.id, {
      supplierInvoiceNo: "P2P-INV-001",
      supplierInvoiceDate: "2026-05-10",
      supplierId: supplier.id,
      purchaseOrderId: issuedPo.id,
      dueDate: "2026-06-10",
      items: [{ purchaseOrderItemId: poItemId, currentBilledQty: 100, invoiceRate: 100 }],
    });
    expect(bill.matchStatus).toBe("MATCHED");
    expect(bill.subtotal).toBe("10000.00");
    expect(bill.vatAmount).toBe("500.00");
    expect(bill.aitAmount).toBe("300.00");
    expect(bill.netPayable).toBe("10200.00"); // 10000 + 500 VAT − 300 AIT

    await supplierBills.submit(f.organization.id, f.user.id, bill.id);
    const approvedBill = await supplierBills.approve(f.organization.id, f.user.id, bill.id);
    expect(approvedBill.status).toBe("APPROVED");

    // --- Lineage assertions -------------------------------------------------------------------
    expect(approvedBill.purchaseOrderId).toBe(issuedPo.id);
    expect(approvedBill.supplierId).toBe(supplier.id);
    expect(approvedBill.cmsWorkId).toBe(f.work.id);
    expect(issuedPo.purchaseRequisitionId).toBe(approvedPr.id);
    expect(issuedPo.rfqId).toBe(issuedRfq.id);
    expect(issuedPo.comparativeStatementId).toBe(approvedCs.id);
    expect(approvedBill.items[0]!.purchaseOrderItemId).toBe(poItemId);

    const payable = await prisma.payable.findFirstOrThrow({ where: { organizationId: f.organization.id } });
    expect(payable.partyId).toBe(supplier.id);
    expect(payable.projectId).toBe(f.work.id);
    expect(payable.amount.toFixed(2)).toBe("10200.00");
    expect(approvedBill.payableId).toBe(payable.id);

    // --- Partial payment -----------------------------------------------------------------------
    const partial = await supplierPayments.create(f.organization.id, f.user.id, {
      supplierBillId: bill.id,
      bankAccountId: f.bank.id,
      amount: 4200,
      paymentDate: "2026-05-20",
    });
    expect(partial.payable.outstanding).toBe("6000.00");
    expect((await supplierBills.findOne(f.organization.id, bill.id)).status).toBe("PARTIALLY_PAID");

    // --- Final payment -------------------------------------------------------------------------
    const final = await supplierPayments.create(f.organization.id, f.user.id, {
      supplierBillId: bill.id,
      bankAccountId: f.bank.id,
      amount: 6000,
      paymentDate: "2026-06-01",
    });
    expect(final.payable.outstanding).toBe("0.00");

    const settledBill = await supplierBills.findOne(f.organization.id, bill.id);
    expect(settledBill.status).toBe("PAID");
    const settledPayable = await prisma.payable.findUniqueOrThrow({ where: { id: payable.id } });
    expect(settledPayable.paidAmount.toFixed(2)).toBe("10200.00");
    expect(settledPayable.amount.sub(settledPayable.paidAmount).toFixed(2)).toBe("0.00");
    expect(settledPayable.status).toBe("PAID");

    // --- Bank reconciles: opening − total paid --------------------------------------------------
    const bankAfter = await prisma.bankAccount.findUniqueOrThrow({ where: { id: f.bank.id } });
    expect(bankAfter.currentBalance.toFixed(2)).toBe(openingBank.sub(10200).toFixed(2));

    // --- AP control == Payable subledger, trial balance balanced ---------------------------------
    const reconciliation = await supplierLedger.reconciliation(f.organization.id);
    expect(reconciliation.controlBalance).toBe("0.00");
    expect(reconciliation.subledgerBalance).toBe("0.00");
    expect(reconciliation.reconciled).toBe(true);

    const integrity = await accounting.integrity(f.organization.id);
    expect(integrity.ap.status).toBe("BALANCED");
    expect(integrity.unbalancedJournalCount).toBe(0);
    expect(integrity.banks.every((bank) => bank.status === "BALANCED")).toBe(true);

    // --- Supplier ledger correctness --------------------------------------------------------------
    const ledger = await supplierLedger.ledger(f.organization.id, { supplierId: supplier.id });
    expect(ledger.items).toHaveLength(3); // bill credit + two payment debits
    expect(ledger.summary.totalCredit).toBe("10200.00");
    expect(ledger.summary.totalDebit).toBe("10200.00");
    expect(ledger.summary.closingBalance).toBe("0.00");
    expect(ledger.summary.reconciled).toBe(true);

    // --- No duplicate postings ---------------------------------------------------------------------
    expect(await prisma.payable.count({ where: { organizationId: f.organization.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id, sourceModule: "SUPPLIER_BILL", sourceId: bill.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { organizationId: f.organization.id, sourceModule: "SUPPLIER_PAYMENT" } })).toBe(2);
    expect(await prisma.supplierPayment.count({ where: { organizationId: f.organization.id, status: "ACTIVE" } })).toBe(2);

    // --- AP aging shows nothing outstanding once settled --------------------------------------------
    const aging = await supplierLedger.aging(f.organization.id, {});
    expect(aging.summary.total).toBe("0.00");
    expect(aging.items).toHaveLength(0);

    // --- Tenant isolation preserved throughout --------------------------------------------------------
    expect(await prisma.payable.count({ where: { organizationId: otherOrg.organization.id } })).toBe(0);
    expect(await prisma.journalEntry.count({ where: { organizationId: otherOrg.organization.id } })).toBe(0);
    expect(await prisma.supplierBill.count({ where: { organizationId: otherOrg.organization.id } })).toBe(0);

    // --- Audit history exists for every meaningful transition -------------------------------------------
    const actions = (await prisma.auditLog.findMany({ where: { organizationId: f.organization.id }, select: { action: true } })).map((row) => row.action);
    for (const expected of [
      "PR_APPROVED",
      "RFQ_ISSUED",
      "QUOTATION_RECORDED",
      "CS_APPROVED",
      "PO_APPROVED",
      "PO_ISSUED",
      "GRN_CREATED",
      "SUPPLIER_BILL_CREATED",
      "SUPPLIER_BILL_SUBMITTED",
      "SUPPLIER_BILL_APPROVED",
      "SUPPLIER_PAYMENT_CREATED",
    ]) {
      expect(actions).toContain(expected);
    }
  });
});
