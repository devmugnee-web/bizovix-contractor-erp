-- CreateEnum
CREATE TYPE "BillType" AS ENUM ('ADVANCE', 'RUNNING', 'INTERIM', 'FINAL');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CERTIFIED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeductionCalcType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "AdjustmentDirection" AS ENUM ('ADDITION', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "VariationType" AS ENUM ('ADDITION', 'OMISSION', 'RATE_CHANGE', 'QUANTITY_CHANGE', 'NEW_ITEM', 'OTHER');

-- CreateEnum
CREATE TYPE "VariationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TimeExtensionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
-- Added nullable first, backfilled from the existing authoritative columns, then locked to
-- NOT NULL — a plain NOT NULL ADD COLUMN would fail against BOQ rows already seeded.
ALTER TABLE "boq_items" ADD COLUMN     "originalAmount" DECIMAL(18,2),
ADD COLUMN     "originalQty" DECIMAL(18,3),
ADD COLUMN     "originalRate" DECIMAL(18,2);

UPDATE "boq_items" SET "originalQty" = "contractQty", "originalRate" = "unitRate", "originalAmount" = "contractAmount" WHERE "originalQty" IS NULL;

ALTER TABLE "boq_items" ALTER COLUMN "originalAmount" SET NOT NULL,
ALTER COLUMN "originalQty" SET NOT NULL,
ALTER COLUMN "originalRate" SET NOT NULL;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "projectBillId" TEXT,
ADD COLUMN     "timeExtensionId" TEXT,
ADD COLUMN     "variationOrderId" TEXT;

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "receivableId" TEXT;

-- CreateTable
CREATE TABLE "project_bills" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cmsWorkId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "billNo" TEXT NOT NULL,
    "billType" "BillType" NOT NULL DEFAULT 'RUNNING',
    "billDate" TIMESTAMP(3) NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "submissionDate" TIMESTAMP(3),
    "certificationDate" TIMESTAMP(3),
    "clientCertificateRef" TEXT,
    "measurementBookRef" TEXT,
    "remarks" TEXT,
    "grossWorkValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "approvedAdditions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grossBillAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "retentionPct" DECIMAL(5,2),
    "retentionAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "retentionReleasedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "retentionReleaseDueDate" TIMESTAMP(3),
    "vatRate" DECIMAL(8,4),
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "aitRate" DECIMAL(8,4),
    "aitAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherDeductionAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netCertifiedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "receivedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "BillStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "submittedById" TEXT,
    "certifiedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_bill_items" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "approvedRate" DECIMAL(18,2) NOT NULL,
    "contractQty" DECIMAL(18,3) NOT NULL,
    "previousQty" DECIMAL(18,3) NOT NULL,
    "currentQty" DECIMAL(18,3) NOT NULL,
    "cumulativeQty" DECIMAL(18,3) NOT NULL,
    "previousValue" DECIMAL(18,2) NOT NULL,
    "currentValue" DECIMAL(18,2) NOT NULL,
    "cumulativeValue" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "project_bill_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_adjustments" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "direction" "AdjustmentDirection" NOT NULL,
    "description" TEXT,
    "calculationType" "DeductionCalcType" NOT NULL DEFAULT 'FIXED_AMOUNT',
    "rate" DECIMAL(8,4),
    "baseAmount" DECIMAL(18,2),
    "amount" DECIMAL(18,2) NOT NULL,
    "ledgerAccountId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivables" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT,
    "projectBillId" TEXT,
    "partyName" TEXT NOT NULL,
    "billNo" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "receivedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OUTSTANDING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variation_orders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cmsWorkId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "variationNo" TEXT NOT NULL,
    "variationType" "VariationType" NOT NULL DEFAULT 'ADDITION',
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "requestDate" TIMESTAMP(3) NOT NULL,
    "approvalDate" TIMESTAMP(3),
    "requestedAmount" DECIMAL(18,2) NOT NULL,
    "approvedAmount" DECIMAL(18,2),
    "status" "VariationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variation_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variation_items" (
    "id" TEXT NOT NULL,
    "variationOrderId" TEXT NOT NULL,
    "boqItemId" TEXT,
    "itemCode" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "originalQty" DECIMAL(18,3),
    "originalRate" DECIMAL(18,2),
    "revisedQty" DECIMAL(18,3),
    "revisedRate" DECIMAL(18,2),
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "variation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_extensions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cmsWorkId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "eotNo" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL,
    "requestedDays" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "approvalDate" TIMESTAMP(3),
    "approvedDays" INTEGER,
    "originalCompletionDate" TIMESTAMP(3) NOT NULL,
    "previousCompletionDate" TIMESTAMP(3) NOT NULL,
    "revisedCompletionDate" TIMESTAMP(3),
    "status" "TimeExtensionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deduction_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "rate" DECIMAL(8,4) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deduction_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_bills_organizationId_cmsWorkId_status_idx" ON "project_bills"("organizationId", "cmsWorkId", "status");

-- CreateIndex
CREATE INDEX "project_bills_organizationId_status_idx" ON "project_bills"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_bills_organizationId_billNo_key" ON "project_bills"("organizationId", "billNo");

-- CreateIndex
CREATE INDEX "project_bill_items_boqItemId_idx" ON "project_bill_items"("boqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "project_bill_items_billId_boqItemId_key" ON "project_bill_items"("billId", "boqItemId");

-- CreateIndex
CREATE INDEX "bill_adjustments_billId_idx" ON "bill_adjustments"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_projectBillId_key" ON "receivables"("projectBillId");

-- CreateIndex
CREATE INDEX "receivables_organizationId_status_dueDate_idx" ON "receivables"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "receivables_organizationId_projectId_idx" ON "receivables"("organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_organizationId_billNo_key" ON "receivables"("organizationId", "billNo");

-- CreateIndex
CREATE INDEX "variation_orders_organizationId_cmsWorkId_status_idx" ON "variation_orders"("organizationId", "cmsWorkId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "variation_orders_organizationId_variationNo_key" ON "variation_orders"("organizationId", "variationNo");

-- CreateIndex
CREATE INDEX "time_extensions_organizationId_cmsWorkId_status_idx" ON "time_extensions"("organizationId", "cmsWorkId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "time_extensions_organizationId_eotNo_key" ON "time_extensions"("organizationId", "eotNo");

-- CreateIndex
CREATE INDEX "deduction_configs_organizationId_type_isActive_idx" ON "deduction_configs"("organizationId", "type", "isActive");

-- AddForeignKey
ALTER TABLE "project_bills" ADD CONSTRAINT "project_bills_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_bills" ADD CONSTRAINT "project_bills_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_bills" ADD CONSTRAINT "project_bills_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_bill_items" ADD CONSTRAINT "project_bill_items_billId_fkey" FOREIGN KEY ("billId") REFERENCES "project_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_bill_items" ADD CONSTRAINT "project_bill_items_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "boq_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_adjustments" ADD CONSTRAINT "bill_adjustments_billId_fkey" FOREIGN KEY ("billId") REFERENCES "project_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_adjustments" ADD CONSTRAINT "bill_adjustments_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_projectBillId_fkey" FOREIGN KEY ("projectBillId") REFERENCES "project_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variation_orders" ADD CONSTRAINT "variation_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variation_orders" ADD CONSTRAINT "variation_orders_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variation_orders" ADD CONSTRAINT "variation_orders_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variation_items" ADD CONSTRAINT "variation_items_variationOrderId_fkey" FOREIGN KEY ("variationOrderId") REFERENCES "variation_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variation_items" ADD CONSTRAINT "variation_items_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "boq_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_extensions" ADD CONSTRAINT "time_extensions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_extensions" ADD CONSTRAINT "time_extensions_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_extensions" ADD CONSTRAINT "time_extensions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deduction_configs" ADD CONSTRAINT "deduction_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_projectBillId_fkey" FOREIGN KEY ("projectBillId") REFERENCES "project_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_variationOrderId_fkey" FOREIGN KEY ("variationOrderId") REFERENCES "variation_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_timeExtensionId_fkey" FOREIGN KEY ("timeExtensionId") REFERENCES "time_extensions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

