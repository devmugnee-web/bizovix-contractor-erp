-- CreateEnum
CREATE TYPE "LcStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COSTING_PENDING', 'ALLOCATION_PENDING', 'READY_TO_FINALIZE', 'FINALIZED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LcCostCategory" AS ENUM ('LC_BANKING', 'ORIGIN', 'FREIGHT', 'INSURANCE', 'CUSTOMS', 'TAX', 'CNF', 'PORT', 'DESTINATION_TRANSPORT', 'LOCAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LcAllocationBasis" AS ENUM ('PURCHASE_VALUE', 'USD_VALUE', 'QUANTITY', 'WEIGHT', 'CBM', 'EQUAL');

-- CreateEnum
CREATE TYPE "LcAllocationMode" AS ENUM ('AUTO', 'MANUAL_AMOUNT', 'MANUAL_PERCENTAGE', 'HYBRID', 'DIRECT_PRODUCT');

-- CreateEnum
CREATE TYPE "LcLandedCostStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateTable
CREATE TABLE "LcMaster" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "lcNumber" TEXT NOT NULL,
    "lcDate" DATE NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL,
    "supplierCountry" TEXT,
    "purchaseOrderRef" TEXT,
    "piReference" TEXT,
    "bankName" TEXT,
    "bankBranch" TEXT,
    "lcType" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRate" DECIMAL(18,6) NOT NULL,
    "incoterm" TEXT,
    "originCountry" TEXT,
    "originPort" TEXT,
    "destinationPort" TEXT,
    "destinationWarehouseId" TEXT,
    "lastShipmentDate" DATE,
    "expiryDate" DATE,
    "remarks" TEXT,
    "status" "LcStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LcMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LcStatusHistory" (
    "id" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "fromStatus" "LcStatus",
    "toStatus" "LcStatus" NOT NULL,
    "reason" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LcStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LcItem" (
    "id" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "productName" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "quantity" DECIMAL(18,4) NOT NULL,
    "usdUnitPrice" DECIMAL(18,4) NOT NULL,
    "exchangeRate" DECIMAL(18,6) NOT NULL,
    "calculatedBdtUnitPrice" DECIMAL(18,4) NOT NULL,
    "acceptedBdtUnitPrice" DECIMAL(18,4),
    "totalPurchaseCostBdt" DECIMAL(18,4) NOT NULL,
    "weight" DECIMAL(18,4),
    "cbm" DECIMAL(18,4),
    "hsCode" TEXT,
    "receivedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "landedCostAmount" DECIMAL(18,4),
    "landedCostPerUnit" DECIMAL(18,4),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LcItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LcShipment" (
    "id" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "shipmentNumber" TEXT,
    "blAwbNumber" TEXT,
    "etd" DATE,
    "eta" DATE,
    "containerNumber" TEXT,
    "forwarderName" TEXT,
    "shippingLine" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LcShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LcCostHead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "LcCostCategory" NOT NULL,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'BDT',
    "defaultAllocationMethod" "LcAllocationBasis" NOT NULL DEFAULT 'PURCHASE_VALUE',
    "fallbackAllocationMethod" "LcAllocationBasis",
    "includeInLandedCost" BOOLEAN NOT NULL DEFAULT true,
    "manualOverrideAllowed" BOOLEAN NOT NULL DEFAULT true,
    "glAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LcCostHead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LcCostEntry" (
    "id" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "costHeadId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "vendorName" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" DATE,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "foreignAmount" DECIMAL(18,4),
    "exchangeRate" DECIMAL(18,6),
    "bdtAmount" DECIMAL(18,4) NOT NULL,
    "allocationMode" "LcAllocationMode" NOT NULL DEFAULT 'AUTO',
    "allocationBasis" "LcAllocationBasis",
    "includeInLandedCost" BOOLEAN NOT NULL DEFAULT true,
    "attachmentUrl" TEXT,
    "attachmentName" TEXT,
    "remarks" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LcCostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LcCostAllocation" (
    "id" TEXT NOT NULL,
    "costEntryId" TEXT NOT NULL,
    "lcItemId" TEXT NOT NULL,
    "basisValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "basisPercentage" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "autoSuggestedAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "manualAmount" DECIMAL(18,4),
    "finalAmount" DECIMAL(18,4) NOT NULL,
    "isDirect" BOOLEAN NOT NULL DEFAULT false,
    "isOverridden" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "originalMode" "LcAllocationMode",
    "originalBasis" "LcAllocationBasis",
    "originalAutoAmount" DECIMAL(18,4),
    "changedByUserId" TEXT,
    "changedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LcCostAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LcGrn" (
    "id" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "receivedDate" DATE NOT NULL,
    "warehouseId" TEXT,
    "remarks" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LcGrn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LcGrnItem" (
    "id" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "lcItemId" TEXT NOT NULL,
    "expectedQuantity" DECIMAL(18,4) NOT NULL,
    "receivedQuantity" DECIMAL(18,4) NOT NULL,
    "shortQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "excessQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "damagedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rejectedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LcGrnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LcLandedCost" (
    "id" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "purchaseCostTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "importCostTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "landedCostTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "allocationDifference" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "LcLandedCostStatus" NOT NULL DEFAULT 'DRAFT',
    "finalizedByUserId" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "glVoucherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LcLandedCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LcLandedCostItem" (
    "id" TEXT NOT NULL,
    "landedCostId" TEXT NOT NULL,
    "lcItemId" TEXT NOT NULL,
    "purchaseCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lcBankingCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "originCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "freightCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "insuranceCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "customsCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cnfCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "portCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "destinationTransportCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "localCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "otherCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalLandedCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "receivedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitLandedCost" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "LcLandedCostItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LcMaster_workspaceId_status_idx" ON "LcMaster"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "LcMaster_supplierId_idx" ON "LcMaster"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "LcMaster_workspaceId_lcNumber_key" ON "LcMaster"("workspaceId", "lcNumber");

-- CreateIndex
CREATE INDEX "LcStatusHistory_lcId_idx" ON "LcStatusHistory"("lcId");

-- CreateIndex
CREATE INDEX "LcItem_lcId_idx" ON "LcItem"("lcId");

-- CreateIndex
CREATE INDEX "LcItem_inventoryItemId_idx" ON "LcItem"("inventoryItemId");

-- CreateIndex
CREATE INDEX "LcShipment_lcId_idx" ON "LcShipment"("lcId");

-- CreateIndex
CREATE INDEX "LcCostHead_workspaceId_category_isActive_idx" ON "LcCostHead"("workspaceId", "category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LcCostHead_workspaceId_code_key" ON "LcCostHead"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "LcCostEntry_lcId_idx" ON "LcCostEntry"("lcId");

-- CreateIndex
CREATE INDEX "LcCostEntry_costHeadId_idx" ON "LcCostEntry"("costHeadId");

-- CreateIndex
CREATE INDEX "LcCostAllocation_lcItemId_idx" ON "LcCostAllocation"("lcItemId");

-- CreateIndex
CREATE UNIQUE INDEX "LcCostAllocation_costEntryId_lcItemId_key" ON "LcCostAllocation"("costEntryId", "lcItemId");

-- CreateIndex
CREATE INDEX "LcGrn_lcId_idx" ON "LcGrn"("lcId");

-- CreateIndex
CREATE UNIQUE INDEX "LcGrn_lcId_grnNumber_key" ON "LcGrn"("lcId", "grnNumber");

-- CreateIndex
CREATE INDEX "LcGrnItem_lcItemId_idx" ON "LcGrnItem"("lcItemId");

-- CreateIndex
CREATE UNIQUE INDEX "LcGrnItem_grnId_lcItemId_key" ON "LcGrnItem"("grnId", "lcItemId");

-- CreateIndex
CREATE UNIQUE INDEX "LcLandedCost_lcId_key" ON "LcLandedCost"("lcId");

-- CreateIndex
CREATE INDEX "LcLandedCost_lcId_idx" ON "LcLandedCost"("lcId");

-- CreateIndex
CREATE UNIQUE INDEX "LcLandedCostItem_lcItemId_key" ON "LcLandedCostItem"("lcItemId");

-- CreateIndex
CREATE INDEX "LcLandedCostItem_landedCostId_idx" ON "LcLandedCostItem"("landedCostId");

-- AddForeignKey
ALTER TABLE "LcMaster" ADD CONSTRAINT "LcMaster_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcMaster" ADD CONSTRAINT "LcMaster_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcMaster" ADD CONSTRAINT "LcMaster_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcMaster" ADD CONSTRAINT "LcMaster_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcMaster" ADD CONSTRAINT "LcMaster_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcMaster" ADD CONSTRAINT "LcMaster_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcStatusHistory" ADD CONSTRAINT "LcStatusHistory_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "LcMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcStatusHistory" ADD CONSTRAINT "LcStatusHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcItem" ADD CONSTRAINT "LcItem_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "LcMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcItem" ADD CONSTRAINT "LcItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcShipment" ADD CONSTRAINT "LcShipment_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "LcMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcCostHead" ADD CONSTRAINT "LcCostHead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcCostHead" ADD CONSTRAINT "LcCostHead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcCostHead" ADD CONSTRAINT "LcCostHead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcCostHead" ADD CONSTRAINT "LcCostHead_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcCostEntry" ADD CONSTRAINT "LcCostEntry_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "LcMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcCostEntry" ADD CONSTRAINT "LcCostEntry_costHeadId_fkey" FOREIGN KEY ("costHeadId") REFERENCES "LcCostHead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcCostEntry" ADD CONSTRAINT "LcCostEntry_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "LcShipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcCostEntry" ADD CONSTRAINT "LcCostEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcCostAllocation" ADD CONSTRAINT "LcCostAllocation_costEntryId_fkey" FOREIGN KEY ("costEntryId") REFERENCES "LcCostEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcCostAllocation" ADD CONSTRAINT "LcCostAllocation_lcItemId_fkey" FOREIGN KEY ("lcItemId") REFERENCES "LcItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcCostAllocation" ADD CONSTRAINT "LcCostAllocation_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcGrn" ADD CONSTRAINT "LcGrn_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "LcMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcGrn" ADD CONSTRAINT "LcGrn_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcGrn" ADD CONSTRAINT "LcGrn_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcGrnItem" ADD CONSTRAINT "LcGrnItem_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "LcGrn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcGrnItem" ADD CONSTRAINT "LcGrnItem_lcItemId_fkey" FOREIGN KEY ("lcItemId") REFERENCES "LcItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcLandedCost" ADD CONSTRAINT "LcLandedCost_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "LcMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcLandedCostItem" ADD CONSTRAINT "LcLandedCostItem_landedCostId_fkey" FOREIGN KEY ("landedCostId") REFERENCES "LcLandedCost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcLandedCostItem" ADD CONSTRAINT "LcLandedCostItem_lcItemId_fkey" FOREIGN KEY ("lcItemId") REFERENCES "LcItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
