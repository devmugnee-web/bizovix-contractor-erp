-- Supplier Bill / Accounts Payable: Purchase Order + GRN -> Supplier Bill -> 3-way match ->
-- Approval -> Payable -> Supplier Payment.
-- Purely additive: new enums, new tables, and nullable/defaulted new columns on the existing
-- Document, FinanceSetting and PurchaseOrderItem tables. Does not touch the Tender->Closeout
-- backbone, the Masters foundation, or the Procurement Core tables built in a prior migration.

-- CreateEnum
CREATE TYPE "SupplierBillStatus" AS ENUM ('DRAFT', 'APPROVAL_PENDING', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillMatchStatus" AS ENUM ('MATCHED', 'QUANTITY_VARIANCE', 'RATE_VARIANCE', 'AMOUNT_VARIANCE', 'MISSING_RECEIPT', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SupplierPaymentStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable: additive nullable columns, no backfill needed
ALTER TABLE "documents" ADD COLUMN     "supplierBillId" TEXT,
ADD COLUMN     "supplierPaymentId" TEXT;

-- AlterTable: additive nullable column (tenant-configurable 3-way-match rate tolerance)
ALTER TABLE "finance_settings" ADD COLUMN     "billRateTolerancePct" DECIMAL(5,2);

-- AlterTable: additive defaulted column — cumulative billed quantity per PO line, mirrors receivedQty
ALTER TABLE "purchase_order_items" ADD COLUMN     "billedQty" DECIMAL(18,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "supplier_bills" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "billNo" TEXT NOT NULL,
    "supplierInvoiceNo" TEXT NOT NULL,
    "supplierInvoiceDate" TIMESTAMP(3) NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "cmsWorkId" TEXT,
    "paymentTermId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "dueDate" TIMESTAMP(3),
    "remarks" TEXT,
    "status" "SupplierBillStatus" NOT NULL DEFAULT 'DRAFT',
    "matchStatus" "BillMatchStatus" NOT NULL DEFAULT 'MATCHED',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxableBase" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(8,4),
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "aitRate" DECIMAL(8,4),
    "aitAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherDeductionAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "payableId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bill_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierBillId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemCodeSnapshot" TEXT NOT NULL,
    "itemNameSnapshot" TEXT NOT NULL,
    "descriptionSnapshot" TEXT,
    "unitSnapshot" TEXT NOT NULL,
    "orderedQty" DECIMAL(18,3) NOT NULL,
    "acceptedQty" DECIMAL(18,3) NOT NULL,
    "previouslyBilledQty" DECIMAL(18,3) NOT NULL,
    "currentBilledQty" DECIMAL(18,3) NOT NULL,
    "remainingBillableQty" DECIMAL(18,3) NOT NULL,
    "poRate" DECIMAL(18,2) NOT NULL,
    "invoiceRate" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineAmount" DECIMAL(18,2) NOT NULL,
    "matchStatus" "BillMatchStatus" NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "supplier_bill_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bill_deductions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierBillId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "code" TEXT,
    "rate" DECIMAL(8,4) NOT NULL,
    "base" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "supplier_bill_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT,
    "referenceNo" TEXT,
    "remarks" TEXT,
    "status" "SupplierPaymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancellationReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bills_payableId_key" ON "supplier_bills"("payableId");

-- CreateIndex
CREATE INDEX "supplier_bills_organizationId_status_idx" ON "supplier_bills"("organizationId", "status");

-- CreateIndex
CREATE INDEX "supplier_bills_organizationId_purchaseOrderId_idx" ON "supplier_bills"("organizationId", "purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bills_organizationId_billNo_key" ON "supplier_bills"("organizationId", "billNo");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bills_organizationId_supplierId_supplierInvoiceNo_key" ON "supplier_bills"("organizationId", "supplierId", "supplierInvoiceNo");

-- CreateIndex
CREATE INDEX "supplier_bill_items_organizationId_supplierBillId_idx" ON "supplier_bill_items"("organizationId", "supplierBillId");

-- CreateIndex
CREATE INDEX "supplier_bill_items_organizationId_purchaseOrderItemId_idx" ON "supplier_bill_items"("organizationId", "purchaseOrderItemId");

-- CreateIndex
CREATE INDEX "supplier_bill_deductions_organizationId_supplierBillId_idx" ON "supplier_bill_deductions"("organizationId", "supplierBillId");

-- CreateIndex
CREATE INDEX "supplier_payments_organizationId_payableId_idx" ON "supplier_payments"("organizationId", "payableId");

-- CreateIndex
CREATE INDEX "supplier_payments_organizationId_supplierId_idx" ON "supplier_payments"("organizationId", "supplierId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_supplierBillId_fkey" FOREIGN KEY ("supplierBillId") REFERENCES "supplier_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "supplier_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_supplierBillId_fkey" FOREIGN KEY ("supplierBillId") REFERENCES "supplier_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_deductions" ADD CONSTRAINT "supplier_bill_deductions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_deductions" ADD CONSTRAINT "supplier_bill_deductions_supplierBillId_fkey" FOREIGN KEY ("supplierBillId") REFERENCES "supplier_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
