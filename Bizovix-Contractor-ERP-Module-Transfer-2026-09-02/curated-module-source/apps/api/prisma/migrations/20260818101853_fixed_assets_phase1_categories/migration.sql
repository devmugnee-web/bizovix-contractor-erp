-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "AssetOperationalStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'ACTIVE', 'UNDER_MAINTENANCE', 'DAMAGED', 'LOST', 'RETIRED');

-- CreateEnum
CREATE TYPE "AssetAcquisitionType" AS ENUM ('DIRECT_PURCHASE', 'PURCHASE_ORDER', 'OPENING_ASSET', 'DONATION', 'TRANSFER_IN', 'INTERNALLY_CONSTRUCTED', 'OTHER');

-- AlterTable
-- assetCode/capitalizedCost are added nullable first because existing rows
-- (e.g. the live "TEST ASSET" data) have no value to backfill from other
-- columns automatically — they're computed below, then locked to NOT NULL.
ALTER TABLE "FixedAsset" ADD COLUMN     "acquisitionType" "AssetAcquisitionType" NOT NULL DEFAULT 'DIRECT_PURCHASE',
ADD COLUMN     "assetCode" TEXT,
ADD COLUMN     "assignedToName" TEXT,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "capitalizedCost" DECIMAL(18,4),
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "condition" "AssetCondition" NOT NULL DEFAULT 'GOOD',
ADD COLUMN     "department" TEXT,
ADD COLUMN     "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "importDuty" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "installationCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "operationalStatus" "AssetOperationalStatus" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "otherCapitalizedCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "registrationCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "serialNumber" TEXT,
ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "transportationCost" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- Backfill existing rows: capitalizedCost mirrors purchaseCost (all the new
-- cost-component columns default to 0 for pre-existing assets), assetCode
-- gets a stable placeholder derived from the row id.
UPDATE "FixedAsset" SET
  "capitalizedCost" = "purchaseCost",
  "assetCode" = 'AST-LEGACY-' || substr("id", 1, 8)
WHERE "capitalizedCost" IS NULL OR "assetCode" IS NULL;

ALTER TABLE "FixedAsset" ALTER COLUMN "assetCode" SET NOT NULL,
ALTER COLUMN "capitalizedCost" SET NOT NULL;

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "defaultUsefulLifeMonths" INTEGER,
    "defaultSalvageValue" DECIMAL(18,4),
    "defaultDepreciationMethod" "FixedAssetDepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "assetLedgerId" TEXT,
    "accumulatedDepreciationLedgerId" TEXT,
    "depreciationExpenseLedgerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetCategory_companyId_idx" ON "AssetCategory"("companyId");

-- CreateIndex
CREATE INDEX "AssetCategory_parentId_idx" ON "AssetCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_companyId_code_key" ON "AssetCategory"("companyId", "code");

-- CreateIndex
CREATE INDEX "FixedAsset_categoryId_idx" ON "FixedAsset"("categoryId");

-- CreateIndex
CREATE INDEX "FixedAsset_supplierId_idx" ON "FixedAsset"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_companyId_assetCode_key" ON "FixedAsset"("companyId", "assetCode");

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_assetLedgerId_fkey" FOREIGN KEY ("assetLedgerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_accumulatedDepreciationLedgerId_fkey" FOREIGN KEY ("accumulatedDepreciationLedgerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_depreciationExpenseLedgerId_fkey" FOREIGN KEY ("depreciationExpenseLedgerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
