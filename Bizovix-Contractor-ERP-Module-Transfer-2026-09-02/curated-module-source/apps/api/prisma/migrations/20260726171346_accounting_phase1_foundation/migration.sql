-- CreateEnum
CREATE TYPE "FiscalYearStatus" AS ENUM ('OPEN', 'LOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccountingFramework" AS ENUM ('BFRS_IFRS', 'US_GAAP');

-- CreateEnum
CREATE TYPE "CostingMethod" AS ENUM ('MOVING_WEIGHTED_AVERAGE', 'PERIODIC_WEIGHTED_AVERAGE', 'FIFO', 'LIFO');

-- CreateEnum
CREATE TYPE "NegativeStockPolicy" AS ENUM ('BLOCKED', 'ALLOW_ZERO', 'ALLOW_NEGATIVE');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VoucherEntryStatus" ADD VALUE 'REJECTED';
ALTER TYPE "VoucherEntryStatus" ADD VALUE 'REVERSED';
ALTER TYPE "VoucherEntryStatus" ADD VALUE 'SUPERSEDED_BY_ALTERATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VoucherEntryType" ADD VALUE 'QUOTATION';
ALTER TYPE "VoucherEntryType" ADD VALUE 'PROFORMA_INVOICE';
ALTER TYPE "VoucherEntryType" ADD VALUE 'SALES_ORDER';
ALTER TYPE "VoucherEntryType" ADD VALUE 'DELIVERY_NOTE';
ALTER TYPE "VoucherEntryType" ADD VALUE 'PURCHASE_ORDER';
ALTER TYPE "VoucherEntryType" ADD VALUE 'RECEIPT_NOTE';

-- AlterTable
ALTER TABLE "InventoryItem" ALTER COLUMN "openingQty" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "openingRate" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "reorderLevel" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "Party" ALTER COLUMN "creditLimit" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "VoucherEntry" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "fiscalYearId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "postedAt" TIMESTAMP(3),
ADD COLUMN     "postingVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "previousRevisionId" TEXT,
ADD COLUMN     "reversalOfId" TEXT,
ADD COLUMN     "revisionGroupId" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT,
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "debit" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "credit" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "VoucherEntryLine" ADD COLUMN     "accountId" TEXT,
ALTER COLUMN "debit" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "credit" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "VoucherInventoryItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(18,4);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountGroupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nature" "AccountNature" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isControlAccount" BOOLEAN NOT NULL DEFAULT false,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "framework" "AccountingFramework" NOT NULL DEFAULT 'BFRS_IFRS',
    "costingMethod" "CostingMethod" NOT NULL DEFAULT 'MOVING_WEIGHTED_AVERAGE',
    "negativeStockPolicy" "NegativeStockPolicy" NOT NULL DEFAULT 'BLOCKED',
    "autoApprovalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "loyaltyLiabilityEnabled" BOOLEAN NOT NULL DEFAULT false,
    "loyaltyPointValue" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_companyId_isControlAccount_idx" ON "Account"("companyId", "isControlAccount");

-- CreateIndex
CREATE INDEX "Account_companyId_status_idx" ON "Account"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Account_companyId_code_key" ON "Account"("companyId", "code");

-- CreateIndex
CREATE INDEX "FiscalYear_companyId_status_idx" ON "FiscalYear"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_companyId_name_key" ON "FiscalYear"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_workspaceId_key" ON "Branch"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_companyId_code_key" ON "Branch"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingSettings_companyId_key" ON "AccountingSettings"("companyId");

-- CreateIndex
CREATE INDEX "VoucherEntry_sourceType_sourceId_idx" ON "VoucherEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "VoucherEntry_fiscalYearId_idx" ON "VoucherEntry"("fiscalYearId");

-- CreateIndex
CREATE INDEX "VoucherEntry_branchId_idx" ON "VoucherEntry"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherEntry_workspaceId_idempotencyKey_key" ON "VoucherEntry"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "VoucherEntryLine_accountId_idx" ON "VoucherEntryLine"("accountId");

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "VoucherEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_previousRevisionId_fkey" FOREIGN KEY ("previousRevisionId") REFERENCES "VoucherEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntryLine" ADD CONSTRAINT "VoucherEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_accountGroupId_fkey" FOREIGN KEY ("accountGroupId") REFERENCES "AccountGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

