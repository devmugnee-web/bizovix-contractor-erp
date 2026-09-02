-- Serial-level finished-product QC and packaging/release execution.
-- Schema only: this migration intentionally inserts no demo, seed or transactional data.

CREATE TYPE "ManufacturingSerialRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "ManufacturingPackagingOrderStatus" AS ENUM ('DRAFT', 'LINE_CLEARED', 'IN_PROGRESS', 'EXECUTED', 'RECONCILED', 'RELEASE_READY', 'CLOSED', 'CANCELLED');
CREATE TYPE "ManufacturingPackagingEventType" AS ENUM ('LINE_CLEARANCE', 'EXECUTION', 'RECONCILIATION', 'LABEL_CONTROL', 'AGGREGATION', 'RELEASE_READINESS');
CREATE TYPE "ManufacturingLabelStatus" AS ENUM ('ISSUED', 'USED', 'RETURNED', 'VOIDED', 'DESTROYED');
CREATE TYPE "ManufacturingPackageLevel" AS ENUM ('UNIT', 'CARTON', 'SHIPPER', 'PALLET');

ALTER TABLE "ManufacturingQualityInspection" ADD COLUMN "serialId" TEXT;
ALTER TABLE "ManufacturingSerial" ADD COLUMN "serialRuleId" TEXT;

CREATE TABLE "ManufacturingSerialRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "orderId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "suffix" TEXT,
    "startNumber" INTEGER NOT NULL,
    "endNumber" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "status" "ManufacturingSerialRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "uniquenessScope" TEXT NOT NULL DEFAULT 'WORKSPACE',
    "createdByUserId" TEXT NOT NULL,
    "activatedByUserId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingSerialRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingPackagingOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLotId" TEXT,
    "packagingConfigurationId" TEXT NOT NULL,
    "packagingOrderNumber" TEXT NOT NULL,
    "status" "ManufacturingPackagingOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "plannedQuantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "lineClearanceReference" TEXT,
    "lineClearanceNote" TEXT,
    "lineClearedByUserId" TEXT,
    "lineClearedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "releaseReadyAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingPackagingOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingPackagingReconciliation" (
    "id" TEXT NOT NULL,
    "packagingOrderId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "issuedQuantity" DECIMAL(18,4) NOT NULL,
    "usedQuantity" DECIMAL(18,4) NOT NULL,
    "returnedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rejectedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "destroyedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "issueTransactionIds" JSONB NOT NULL,
    "returnTransactionIds" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingPackagingReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingPackagingEvent" (
    "id" TEXT NOT NULL,
    "packagingOrderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" "ManufacturingPackagingEventType" NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "evidenceReference" TEXT,
    "note" TEXT,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "signatureHash" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManufacturingPackagingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingPackagingLabel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "packagingOrderId" TEXT NOT NULL,
    "serialId" TEXT,
    "labelCode" TEXT NOT NULL,
    "status" "ManufacturingLabelStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "dispositionReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingPackagingLabel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingPackageUnit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "packagingOrderId" TEXT NOT NULL,
    "level" "ManufacturingPackageLevel" NOT NULL,
    "code" TEXT NOT NULL,
    "parentId" TEXT,
    "serialId" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingPackageUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManufacturingSerialRule_workspaceId_code_key" ON "ManufacturingSerialRule"("workspaceId", "code");
CREATE INDEX "ManufacturingSerialRule_workspaceId_inventoryItemId_status_idx" ON "ManufacturingSerialRule"("workspaceId", "inventoryItemId", "status");
CREATE INDEX "ManufacturingSerialRule_orderId_idx" ON "ManufacturingSerialRule"("orderId");
CREATE UNIQUE INDEX "ManufacturingPackagingOrder_workspaceId_packagingOrderNumber_key" ON "ManufacturingPackagingOrder"("workspaceId", "packagingOrderNumber");
CREATE INDEX "ManufacturingPackagingOrder_workspaceId_status_createdAt_idx" ON "ManufacturingPackagingOrder"("workspaceId", "status", "createdAt");
CREATE INDEX "ManufacturingPackagingOrder_orderId_orderLotId_idx" ON "ManufacturingPackagingOrder"("orderId", "orderLotId");
CREATE INDEX "ManufacturingPackagingOrder_packagingConfigurationId_idx" ON "ManufacturingPackagingOrder"("packagingConfigurationId");
CREATE UNIQUE INDEX "ManufacturingPackagingReconciliation_packagingOrderId_inventoryItemId_key" ON "ManufacturingPackagingReconciliation"("packagingOrderId", "inventoryItemId");
CREATE INDEX "ManufacturingPackagingReconciliation_inventoryItemId_idx" ON "ManufacturingPackagingReconciliation"("inventoryItemId");
CREATE UNIQUE INDEX "ManufacturingPackagingEvent_packagingOrderId_sequence_key" ON "ManufacturingPackagingEvent"("packagingOrderId", "sequence");
CREATE UNIQUE INDEX "ManufacturingPackagingEvent_packagingOrderId_idempotencyKey_key" ON "ManufacturingPackagingEvent"("packagingOrderId", "idempotencyKey");
CREATE INDEX "ManufacturingPackagingEvent_packagingOrderId_eventType_transactionDate_idx" ON "ManufacturingPackagingEvent"("packagingOrderId", "eventType", "transactionDate");
CREATE UNIQUE INDEX "ManufacturingPackagingLabel_workspaceId_labelCode_key" ON "ManufacturingPackagingLabel"("workspaceId", "labelCode");
CREATE INDEX "ManufacturingPackagingLabel_packagingOrderId_serialId_idx" ON "ManufacturingPackagingLabel"("packagingOrderId", "serialId");
CREATE INDEX "ManufacturingPackagingLabel_packagingOrderId_status_idx" ON "ManufacturingPackagingLabel"("packagingOrderId", "status");
CREATE INDEX "ManufacturingPackagingLabel_serialId_idx" ON "ManufacturingPackagingLabel"("serialId");
CREATE UNIQUE INDEX "ManufacturingPackageUnit_workspaceId_code_key" ON "ManufacturingPackageUnit"("workspaceId", "code");
CREATE UNIQUE INDEX "ManufacturingPackageUnit_packagingOrderId_serialId_key" ON "ManufacturingPackageUnit"("packagingOrderId", "serialId");
CREATE INDEX "ManufacturingPackageUnit_packagingOrderId_level_idx" ON "ManufacturingPackageUnit"("packagingOrderId", "level");
CREATE INDEX "ManufacturingPackageUnit_parentId_idx" ON "ManufacturingPackageUnit"("parentId");
CREATE INDEX "ManufacturingPackageUnit_serialId_idx" ON "ManufacturingPackageUnit"("serialId");
CREATE INDEX "ManufacturingQualityInspection_serialId_idx" ON "ManufacturingQualityInspection"("serialId");
CREATE INDEX "ManufacturingSerial_serialRuleId_idx" ON "ManufacturingSerial"("serialRuleId");

ALTER TABLE "ManufacturingSerialRule" ADD CONSTRAINT "ManufacturingSerialRule_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturingSerialRule" ADD CONSTRAINT "ManufacturingSerialRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingSerialRule" ADD CONSTRAINT "ManufacturingSerialRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingSerialRule" ADD CONSTRAINT "ManufacturingSerialRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingSerialRule" ADD CONSTRAINT "ManufacturingSerialRule_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingSerialRule" ADD CONSTRAINT "ManufacturingSerialRule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingSerialRule" ADD CONSTRAINT "ManufacturingSerialRule_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingOrder" ADD CONSTRAINT "ManufacturingPackagingOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingOrder" ADD CONSTRAINT "ManufacturingPackagingOrder_orderLotId_fkey" FOREIGN KEY ("orderLotId") REFERENCES "ManufacturingOrderLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingOrder" ADD CONSTRAINT "ManufacturingPackagingOrder_packagingConfigurationId_fkey" FOREIGN KEY ("packagingConfigurationId") REFERENCES "ManufacturingControlRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingOrder" ADD CONSTRAINT "ManufacturingPackagingOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingOrder" ADD CONSTRAINT "ManufacturingPackagingOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingOrder" ADD CONSTRAINT "ManufacturingPackagingOrder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingOrder" ADD CONSTRAINT "ManufacturingPackagingOrder_lineClearedByUserId_fkey" FOREIGN KEY ("lineClearedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingOrder" ADD CONSTRAINT "ManufacturingPackagingOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingReconciliation" ADD CONSTRAINT "ManufacturingPackagingReconciliation_packagingOrderId_fkey" FOREIGN KEY ("packagingOrderId") REFERENCES "ManufacturingPackagingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingReconciliation" ADD CONSTRAINT "ManufacturingPackagingReconciliation_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingEvent" ADD CONSTRAINT "ManufacturingPackagingEvent_packagingOrderId_fkey" FOREIGN KEY ("packagingOrderId") REFERENCES "ManufacturingPackagingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingEvent" ADD CONSTRAINT "ManufacturingPackagingEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingLabel" ADD CONSTRAINT "ManufacturingPackagingLabel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingLabel" ADD CONSTRAINT "ManufacturingPackagingLabel_packagingOrderId_fkey" FOREIGN KEY ("packagingOrderId") REFERENCES "ManufacturingPackagingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingLabel" ADD CONSTRAINT "ManufacturingPackagingLabel_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "ManufacturingSerial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingLabel" ADD CONSTRAINT "ManufacturingPackagingLabel_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackagingLabel" ADD CONSTRAINT "ManufacturingPackagingLabel_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackageUnit" ADD CONSTRAINT "ManufacturingPackageUnit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackageUnit" ADD CONSTRAINT "ManufacturingPackageUnit_packagingOrderId_fkey" FOREIGN KEY ("packagingOrderId") REFERENCES "ManufacturingPackagingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackageUnit" ADD CONSTRAINT "ManufacturingPackageUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ManufacturingPackageUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackageUnit" ADD CONSTRAINT "ManufacturingPackageUnit_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "ManufacturingSerial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPackageUnit" ADD CONSTRAINT "ManufacturingPackageUnit_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingQualityInspection" ADD CONSTRAINT "ManufacturingQualityInspection_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "ManufacturingSerial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturingSerial" ADD CONSTRAINT "ManufacturingSerial_serialRuleId_fkey" FOREIGN KEY ("serialRuleId") REFERENCES "ManufacturingSerialRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
