import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../modules/prisma/prisma.service";
import { SupplierBillsService } from "../modules/supplier-bills/supplier-bills.service";
import { SupplierPaymentsService } from "../modules/supplier-payments/supplier-payments.service";

/**
 * Extends the Prisma demo seed's procurement chain with its financial tail:
 *
 *   seeded PO (fully received via 2 GRNs) -> Supplier Bill -> 3-way match MATCHED
 *     -> Approve (one Payable + one balanced Journal) -> Partial Payment -> remaining outstanding
 *
 * This lives in the API rather than `prisma/seed.ts` on purpose. Approving a bill and paying it
 * are accounting events, and the repository has exactly one accounting engine — AccountingService
 * plus CashBankService. Hand-writing JournalEntry/FinancialTransaction rows in the Prisma seed
 * would be a second, divergent implementation of that engine, so the script boots a Nest context
 * and drives the same services the API uses.
 *
 * Idempotent: every step is keyed off the demo supplier invoice number, so re-running makes no
 * further changes — no duplicate Bill, Payable, Journal or Payment.
 */
const DEMO_INVOICE_NO = "BLED-INV-2026-0007";
const DEMO_PO_ID = "seed-po-01";
const PARTIAL_PAYMENT_AMOUNT = 300_000;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"], abortOnError: false });
  try {
    const prisma = app.get(PrismaService);
    const supplierBills = app.get(SupplierBillsService);
    const supplierPayments = app.get(SupplierPaymentsService);

    const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id: DEMO_PO_ID }, include: { items: true } });
    if (!purchaseOrder) {
      process.stdout.write("Demo purchase order not found — run `pnpm db:seed` first.\n");
      return;
    }
    const organizationId = purchaseOrder.organizationId;
    const adminUser = await prisma.user.findFirst({ where: { email: "admin@bizovix.com" } });
    if (!adminUser) throw new Error("Demo admin user not found — run `pnpm db:seed` first.");

    const summary: Record<string, string> = {};

    // --- Supplier Bill (idempotent on organization + supplier + invoice number) --------------
    let bill = await prisma.supplierBill.findFirst({
      where: { organizationId, supplierId: purchaseOrder.supplierId, supplierInvoiceNo: DEMO_INVOICE_NO },
    });
    if (bill) {
      summary.bill = `reused ${bill.billNo}`;
    } else {
      const created = await supplierBills.create(organizationId, adminUser.id, {
        supplierInvoiceNo: DEMO_INVOICE_NO,
        supplierInvoiceDate: new Date().toISOString().slice(0, 10),
        supplierId: purchaseOrder.supplierId,
        purchaseOrderId: purchaseOrder.id,
        dueDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
        remarks: "Demo supplier invoice for the fully received LED display purchase order.",
        // Bill exactly what the two demo GRNs accepted, so the 3-way match lands on MATCHED.
        items: purchaseOrder.items.map((item) => ({
          purchaseOrderItemId: item.id,
          currentBilledQty: item.receivedQty.toNumber(),
          invoiceRate: item.unitRate.toNumber(),
        })),
      });
      bill = await prisma.supplierBill.findUniqueOrThrow({ where: { id: created.id } });
      summary.bill = `created ${created.billNo} (match ${created.matchStatus}, net ${created.netPayable})`;
    }

    // --- Submit + Approve ---------------------------------------------------------------------
    if (bill.status === "DRAFT") {
      await supplierBills.submit(organizationId, adminUser.id, bill.id);
      bill = await prisma.supplierBill.findUniqueOrThrow({ where: { id: bill.id } });
    }
    if (bill.status === "APPROVAL_PENDING") {
      const approved = await supplierBills.approve(organizationId, adminUser.id, bill.id);
      bill = await prisma.supplierBill.findUniqueOrThrow({ where: { id: bill.id } });
      summary.approval = `approved -> payable ${approved.payableId}`;
    } else {
      summary.approval = `already ${bill.status}`;
    }

    // --- Partial payment ------------------------------------------------------------------------
    const existingPayments = await prisma.supplierPayment.count({ where: { organizationId, payableId: bill.payableId ?? "", status: "ACTIVE" } });
    if (existingPayments > 0) {
      summary.payment = `already recorded (${existingPayments})`;
    } else if (bill.payableId) {
      const bankAccount = await prisma.bankAccount.findFirst({ where: { organizationId, accountType: "BANK", isActive: true }, orderBy: { createdAt: "asc" } });
      if (!bankAccount) throw new Error("No active bank account found for the demo organization");
      const payment = await supplierPayments.create(organizationId, adminUser.id, {
        supplierBillId: bill.id,
        bankAccountId: bankAccount.id,
        amount: PARTIAL_PAYMENT_AMOUNT,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: "BANK_TRANSFER",
        remarks: "Demo part payment against the LED display supplier invoice.",
      });
      summary.payment = `recorded ${payment.referenceNo} of ${payment.amount}, outstanding ${payment.payable.outstanding}`;
    }

    const finalBill = await prisma.supplierBill.findUniqueOrThrow({ where: { id: bill.id }, include: { payable: true } });
    summary.status = finalBill.status;
    summary.outstanding = finalBill.payable ? finalBill.payable.amount.sub(finalBill.payable.paidAmount).toFixed(2) : "—";

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
