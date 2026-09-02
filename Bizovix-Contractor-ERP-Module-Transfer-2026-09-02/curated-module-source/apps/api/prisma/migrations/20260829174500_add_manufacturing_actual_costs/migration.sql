-- Additive actual manufacturing-cost foundation. No seed/business data and no
-- Chart of Accounts row is created or modified by this migration.

CREATE TYPE "ManufacturingCostDriverBasis" AS ENUM (
    'FLAT',
    'OUTPUT_QUANTITY',
    'LABOUR_HOURS',
    'MACHINE_HOURS',
    'MATERIAL_COST_PERCENT',
    'PRIME_COST_PERCENT'
);

CREATE TYPE "ManufacturingStandardCostStatus" AS ENUM ('DRAFT', 'APPROVED', 'RETIRED');

CREATE TABLE "ManufacturingCostDriver" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "costType" "ManufacturingCostType" NOT NULL,
    "basis" "ManufacturingCostDriverBasis" NOT NULL,
    "unit" TEXT,
    "rate" DECIMAL(24,8) NOT NULL,
    "clearingAccountId" TEXT NOT NULL,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingCostDriver_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingStandardCostVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ManufacturingStandardCostStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "totalUnitCost" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingStandardCostVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingStandardCostLine" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "costType" "ManufacturingCostType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "rate" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "amount" DECIMAL(24,6) NOT NULL,
    "costDriverId" TEXT,
    "clearingAccountId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingStandardCostLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingActualCostPosting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "costDriverId" TEXT NOT NULL,
    "costType" "ManufacturingCostType" NOT NULL,
    "driverBasis" "ManufacturingCostDriverBasis" NOT NULL,
    "description" TEXT NOT NULL,
    "basisQuantity" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "rate" DECIMAL(24,8) NOT NULL,
    "amount" DECIMAL(24,6) NOT NULL,
    "wipAccountId" TEXT NOT NULL,
    "clearingAccountId" TEXT NOT NULL,
    "voucherEntryId" TEXT NOT NULL,
    "finalizedSnapshotId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "referenceNo" TEXT,
    "note" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManufacturingActualCostPosting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingCostAllocation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "costSnapshotId" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "inventoryLotId" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "previousUnitCost" DECIMAL(24,8) NOT NULL,
    "revisedUnitCost" DECIMAL(24,8) NOT NULL,
    "allocatedAmount" DECIMAL(24,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManufacturingCostAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManufacturingCostDriver_workspaceId_code_key" ON "ManufacturingCostDriver"("workspaceId", "code");
CREATE INDEX "ManufacturingCostDriver_workspaceId_costType_isActive_idx" ON "ManufacturingCostDriver"("workspaceId", "costType", "isActive");
CREATE INDEX "ManufacturingCostDriver_clearingAccountId_idx" ON "ManufacturingCostDriver"("clearingAccountId");
CREATE UNIQUE INDEX "ManufacturingStandardCostVersion_workspace_item_version_key" ON "ManufacturingStandardCostVersion"("workspaceId", "inventoryItemId", "versionNumber");
CREATE INDEX "ManufacturingStandardCostVersion_workspace_item_status_effective_idx" ON "ManufacturingStandardCostVersion"("workspaceId", "inventoryItemId", "status", "effectiveFrom");
CREATE UNIQUE INDEX "ManufacturingStandardCostLine_versionId_sequence_key" ON "ManufacturingStandardCostLine"("versionId", "sequence");
CREATE INDEX "ManufacturingStandardCostLine_versionId_costType_idx" ON "ManufacturingStandardCostLine"("versionId", "costType");
CREATE INDEX "ManufacturingStandardCostLine_costDriverId_idx" ON "ManufacturingStandardCostLine"("costDriverId");
CREATE INDEX "ManufacturingStandardCostLine_clearingAccountId_idx" ON "ManufacturingStandardCostLine"("clearingAccountId");
CREATE UNIQUE INDEX "ManufacturingActualCostPosting_voucherEntryId_key" ON "ManufacturingActualCostPosting"("voucherEntryId");
CREATE UNIQUE INDEX "ManufacturingActualCostPosting_workspace_idempotency_key" ON "ManufacturingActualCostPosting"("workspaceId", "idempotencyKey");
CREATE INDEX "ManufacturingActualCostPosting_workspace_order_date_idx" ON "ManufacturingActualCostPosting"("workspaceId", "orderId", "transactionDate");
CREATE INDEX "ManufacturingActualCostPosting_order_snapshot_idx" ON "ManufacturingActualCostPosting"("orderId", "finalizedSnapshotId");
CREATE INDEX "ManufacturingActualCostPosting_costDriverId_idx" ON "ManufacturingActualCostPosting"("costDriverId");
CREATE INDEX "ManufacturingActualCostPosting_wipAccountId_idx" ON "ManufacturingActualCostPosting"("wipAccountId");
CREATE INDEX "ManufacturingActualCostPosting_clearingAccountId_idx" ON "ManufacturingActualCostPosting"("clearingAccountId");
CREATE UNIQUE INDEX "ManufacturingCostAllocation_snapshot_movement_key" ON "ManufacturingCostAllocation"("costSnapshotId", "stockMovementId");
CREATE INDEX "ManufacturingCostAllocation_workspace_movement_idx" ON "ManufacturingCostAllocation"("workspaceId", "stockMovementId");
CREATE INDEX "ManufacturingCostAllocation_inventoryLotId_idx" ON "ManufacturingCostAllocation"("inventoryLotId");

ALTER TABLE "ManufacturingCostDriver" ADD CONSTRAINT "ManufacturingCostDriver_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCostDriver" ADD CONSTRAINT "ManufacturingCostDriver_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCostDriver" ADD CONSTRAINT "ManufacturingCostDriver_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCostDriver" ADD CONSTRAINT "ManufacturingCostDriver_clearingAccountId_fkey" FOREIGN KEY ("clearingAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCostDriver" ADD CONSTRAINT "ManufacturingCostDriver_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingStandardCostVersion" ADD CONSTRAINT "ManufacturingStandardCostVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingStandardCostVersion" ADD CONSTRAINT "ManufacturingStandardCostVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingStandardCostVersion" ADD CONSTRAINT "ManufacturingStandardCostVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingStandardCostVersion" ADD CONSTRAINT "ManufacturingStandardCostVersion_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingStandardCostVersion" ADD CONSTRAINT "ManufacturingStandardCostVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingStandardCostVersion" ADD CONSTRAINT "ManufacturingStandardCostVersion_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ManufacturingStandardCostLine" ADD CONSTRAINT "ManufacturingStandardCostLine_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ManufacturingStandardCostVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingStandardCostLine" ADD CONSTRAINT "ManufacturingStandardCostLine_costDriverId_fkey" FOREIGN KEY ("costDriverId") REFERENCES "ManufacturingCostDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingStandardCostLine" ADD CONSTRAINT "ManufacturingStandardCostLine_clearingAccountId_fkey" FOREIGN KEY ("clearingAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingActualCostPosting" ADD CONSTRAINT "ManufacturingActualCostPosting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingActualCostPosting" ADD CONSTRAINT "ManufacturingActualCostPosting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingActualCostPosting" ADD CONSTRAINT "ManufacturingActualCostPosting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingActualCostPosting" ADD CONSTRAINT "ManufacturingActualCostPosting_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingActualCostPosting" ADD CONSTRAINT "ManufacturingActualCostPosting_costDriverId_fkey" FOREIGN KEY ("costDriverId") REFERENCES "ManufacturingCostDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingActualCostPosting" ADD CONSTRAINT "ManufacturingActualCostPosting_wipAccountId_fkey" FOREIGN KEY ("wipAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingActualCostPosting" ADD CONSTRAINT "ManufacturingActualCostPosting_clearingAccountId_fkey" FOREIGN KEY ("clearingAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingActualCostPosting" ADD CONSTRAINT "ManufacturingActualCostPosting_voucherEntryId_fkey" FOREIGN KEY ("voucherEntryId") REFERENCES "VoucherEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingActualCostPosting" ADD CONSTRAINT "ManufacturingActualCostPosting_finalizedSnapshotId_fkey" FOREIGN KEY ("finalizedSnapshotId") REFERENCES "ManufacturingCostSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturingActualCostPosting" ADD CONSTRAINT "ManufacturingActualCostPosting_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingCostAllocation" ADD CONSTRAINT "ManufacturingCostAllocation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCostAllocation" ADD CONSTRAINT "ManufacturingCostAllocation_costSnapshotId_fkey" FOREIGN KEY ("costSnapshotId") REFERENCES "ManufacturingCostSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCostAllocation" ADD CONSTRAINT "ManufacturingCostAllocation_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCostAllocation" ADD CONSTRAINT "ManufacturingCostAllocation_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "ManufacturingInventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
