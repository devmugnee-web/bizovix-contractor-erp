-- Procurement Core: Purchase Requisition -> RFQ -> Supplier Quotation -> Comparative Statement
-- -> Purchase Order -> Goods Receipt Note
-- Purely additive: new enums, new tables, and nullable new columns on the existing Document
-- table. Does not touch the Tender->Closeout backbone or the Masters foundation.

-- CreateEnum
CREATE TYPE "PrPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PrStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('DRAFT', 'ISSUED', 'CLOSED', 'CANCELLED', 'AWARDED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('RECEIVED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TechnicalComplianceStatus" AS ENUM ('COMPLIANT', 'PARTIALLY_COMPLIANT', 'NON_COMPLIANT');

-- CreateEnum
CREATE TYPE "ComparativeStatementStatus" AS ENUM ('DRAFT', 'EVALUATED', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GrnInspectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PARTIAL', 'REJECTED');

-- AlterTable: additive nullable columns, no backfill needed
ALTER TABLE "documents" ADD COLUMN     "comparativeStatementId" TEXT,
ADD COLUMN     "goodsReceiptNoteId" TEXT,
ADD COLUMN     "purchaseOrderId" TEXT,
ADD COLUMN     "purchaseRequisitionId" TEXT,
ADD COLUMN     "rfqId" TEXT,
ADD COLUMN     "supplierQuotationId" TEXT;

-- CreateTable
CREATE TABLE "purchase_requisitions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "prNo" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL,
    "requiredByDate" TIMESTAMP(3),
    "cmsWorkId" TEXT,
    "department" TEXT,
    "requestedById" TEXT,
    "priority" "PrPriority" NOT NULL DEFAULT 'MEDIUM',
    "purpose" TEXT,
    "remarks" TEXT,
    "status" "PrStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requisition_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseRequisitionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "descriptionSnapshot" TEXT NOT NULL,
    "uomId" TEXT,
    "requestedQty" DECIMAL(18,3) NOT NULL,
    "estimatedRate" DECIMAL(18,2),
    "estimatedAmount" DECIMAL(18,2),
    "requiredDate" TIMESTAMP(3),
    "boqItemId" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requisition_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_for_quotations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqNo" TEXT NOT NULL,
    "purchaseRequisitionId" TEXT,
    "cmsWorkId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "submissionDeadline" TIMESTAMP(3) NOT NULL,
    "deliveryLocation" TEXT,
    "termsConditions" TEXT,
    "paymentTerms" TEXT,
    "remarks" TEXT,
    "status" "RfqStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "request_for_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_suppliers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfq_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "purchaseRequisitionItemId" TEXT,
    "itemCodeSnapshot" TEXT NOT NULL,
    "itemNameSnapshot" TEXT NOT NULL,
    "descriptionSnapshot" TEXT,
    "unitSnapshot" TEXT NOT NULL,
    "requestedQty" DECIMAL(18,3) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_quotations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "quotationRef" TEXT NOT NULL,
    "quotationDate" TIMESTAMP(3) NOT NULL,
    "validityDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "deliveryDays" INTEGER,
    "paymentTerms" TEXT,
    "warranty" TEXT,
    "remarks" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'RECEIVED',
    "revisionNo" INTEGER NOT NULL DEFAULT 1,
    "previousRevisionId" TEXT,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_quotation_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "rfqItemId" TEXT NOT NULL,
    "offeredQty" DECIMAL(18,3) NOT NULL,
    "unitRate" DECIMAL(18,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineAmount" DECIMAL(18,2) NOT NULL,
    "deliveryDays" INTEGER,
    "brandModel" TEXT,
    "specification" TEXT,
    "remarks" TEXT,

    CONSTRAINT "supplier_quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparative_statements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "cmsWorkId" TEXT,
    "csNo" TEXT NOT NULL,
    "status" "ComparativeStatementStatus" NOT NULL DEFAULT 'DRAFT',
    "decisionNotes" TEXT,
    "preparedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comparative_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparative_statement_suppliers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "comparativeStatementId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "quotedTotal" DECIMAL(18,2) NOT NULL,
    "commercialAdjustment" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "evaluatedTotal" DECIMAL(18,2) NOT NULL,
    "deliveryDays" INTEGER,
    "paymentTerms" TEXT,
    "technicalStatus" "TechnicalComplianceStatus" NOT NULL DEFAULT 'COMPLIANT',
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,

    CONSTRAINT "comparative_statement_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "poNo" TEXT NOT NULL,
    "poDate" TIMESTAMP(3) NOT NULL,
    "supplierId" TEXT NOT NULL,
    "cmsWorkId" TEXT,
    "purchaseRequisitionId" TEXT,
    "rfqId" TEXT,
    "comparativeStatementId" TEXT,
    "deliveryAddress" TEXT,
    "paymentTerms" TEXT,
    "deliveryTerms" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherCharges" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(18,2) NOT NULL,
    "remarks" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemCodeSnapshot" TEXT NOT NULL,
    "itemNameSnapshot" TEXT NOT NULL,
    "descriptionSnapshot" TEXT,
    "unitSnapshot" TEXT NOT NULL,
    "orderedQty" DECIMAL(18,3) NOT NULL,
    "unitRate" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netRate" DECIMAL(18,2) NOT NULL,
    "lineAmount" DECIMAL(18,2) NOT NULL,
    "receivedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "deliveryDate" TIMESTAMP(3),
    "cmsWorkId" TEXT,
    "boqItemId" TEXT,
    "sourceQuotationItemId" TEXT,
    "remarks" TEXT,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_notes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "grnNo" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "cmsWorkId" TEXT,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "deliveryChallanNo" TEXT,
    "deliveryChallanDate" TIMESTAMP(3),
    "receivedById" TEXT,
    "inspectionStatus" "GrnInspectionStatus" NOT NULL DEFAULT 'PENDING',
    "warehouseLocation" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipt_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "descriptionSnapshot" TEXT NOT NULL,
    "unitSnapshot" TEXT NOT NULL,
    "orderedQty" DECIMAL(18,3) NOT NULL,
    "previouslyReceivedQty" DECIMAL(18,3) NOT NULL,
    "currentReceivedQty" DECIMAL(18,3) NOT NULL,
    "cumulativeReceivedQty" DECIMAL(18,3) NOT NULL,
    "remainingQty" DECIMAL(18,3) NOT NULL,
    "acceptedQty" DECIMAL(18,3) NOT NULL,
    "rejectedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "damagedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "inspectionRemarks" TEXT,

    CONSTRAINT "grn_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_requisitions_organizationId_status_idx" ON "purchase_requisitions"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requisitions_organizationId_prNo_key" ON "purchase_requisitions"("organizationId", "prNo");

-- CreateIndex
CREATE INDEX "purchase_requisition_items_organizationId_purchaseRequisiti_idx" ON "purchase_requisition_items"("organizationId", "purchaseRequisitionId");

-- CreateIndex
CREATE INDEX "request_for_quotations_organizationId_status_idx" ON "request_for_quotations"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "request_for_quotations_organizationId_rfqNo_key" ON "request_for_quotations"("organizationId", "rfqNo");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_suppliers_rfqId_supplierId_key" ON "rfq_suppliers"("rfqId", "supplierId");

-- CreateIndex
CREATE INDEX "rfq_items_organizationId_rfqId_idx" ON "rfq_items"("organizationId", "rfqId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_quotations_previousRevisionId_key" ON "supplier_quotations"("previousRevisionId");

-- CreateIndex
CREATE INDEX "supplier_quotations_organizationId_rfqId_status_idx" ON "supplier_quotations"("organizationId", "rfqId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_quotations_rfqId_supplierId_quotationRef_revisionN_key" ON "supplier_quotations"("rfqId", "supplierId", "quotationRef", "revisionNo");

-- CreateIndex
CREATE INDEX "supplier_quotation_items_organizationId_quotationId_idx" ON "supplier_quotation_items"("organizationId", "quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "comparative_statements_rfqId_key" ON "comparative_statements"("rfqId");

-- CreateIndex
CREATE UNIQUE INDEX "comparative_statements_organizationId_csNo_key" ON "comparative_statements"("organizationId", "csNo");

-- CreateIndex
CREATE UNIQUE INDEX "comparative_statement_suppliers_comparativeStatementId_supp_key" ON "comparative_statement_suppliers"("comparativeStatementId", "supplierId");

-- CreateIndex
CREATE INDEX "purchase_orders_organizationId_status_idx" ON "purchase_orders"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_organizationId_poNo_key" ON "purchase_orders"("organizationId", "poNo");

-- CreateIndex
CREATE INDEX "purchase_order_items_organizationId_purchaseOrderId_idx" ON "purchase_order_items"("organizationId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "goods_receipt_notes_organizationId_purchaseOrderId_idx" ON "goods_receipt_notes"("organizationId", "purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_notes_organizationId_grnNo_key" ON "goods_receipt_notes"("organizationId", "grnNo");

-- CreateIndex
CREATE INDEX "grn_items_organizationId_grnId_idx" ON "grn_items"("organizationId", "grnId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "request_for_quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_supplierQuotationId_fkey" FOREIGN KEY ("supplierQuotationId") REFERENCES "supplier_quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_comparativeStatementId_fkey" FOREIGN KEY ("comparativeStatementId") REFERENCES "comparative_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_goodsReceiptNoteId_fkey" FOREIGN KEY ("goodsReceiptNoteId") REFERENCES "goods_receipt_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisition_items" ADD CONSTRAINT "purchase_requisition_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisition_items" ADD CONSTRAINT "purchase_requisition_items_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisition_items" ADD CONSTRAINT "purchase_requisition_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisition_items" ADD CONSTRAINT "purchase_requisition_items_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "units_of_measurement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisition_items" ADD CONSTRAINT "purchase_requisition_items_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "boq_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_for_quotations" ADD CONSTRAINT "request_for_quotations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_for_quotations" ADD CONSTRAINT "request_for_quotations_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_for_quotations" ADD CONSTRAINT "request_for_quotations_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_suppliers" ADD CONSTRAINT "rfq_suppliers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_suppliers" ADD CONSTRAINT "rfq_suppliers_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "request_for_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_suppliers" ADD CONSTRAINT "rfq_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "request_for_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_purchaseRequisitionItemId_fkey" FOREIGN KEY ("purchaseRequisitionItemId") REFERENCES "purchase_requisition_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "supplier_quotations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "supplier_quotations_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "request_for_quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "supplier_quotations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "supplier_quotations_previousRevisionId_fkey" FOREIGN KEY ("previousRevisionId") REFERENCES "supplier_quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotation_items" ADD CONSTRAINT "supplier_quotation_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotation_items" ADD CONSTRAINT "supplier_quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "supplier_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotation_items" ADD CONSTRAINT "supplier_quotation_items_rfqItemId_fkey" FOREIGN KEY ("rfqItemId") REFERENCES "rfq_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparative_statements" ADD CONSTRAINT "comparative_statements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparative_statements" ADD CONSTRAINT "comparative_statements_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "request_for_quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparative_statements" ADD CONSTRAINT "comparative_statements_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparative_statement_suppliers" ADD CONSTRAINT "comparative_statement_suppliers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparative_statement_suppliers" ADD CONSTRAINT "comparative_statement_suppliers_comparativeStatementId_fkey" FOREIGN KEY ("comparativeStatementId") REFERENCES "comparative_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparative_statement_suppliers" ADD CONSTRAINT "comparative_statement_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparative_statement_suppliers" ADD CONSTRAINT "comparative_statement_suppliers_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "supplier_quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "request_for_quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_comparativeStatementId_fkey" FOREIGN KEY ("comparativeStatementId") REFERENCES "comparative_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "boq_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "goods_receipt_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
