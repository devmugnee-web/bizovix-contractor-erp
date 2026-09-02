CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT');
CREATE TYPE "WarehouseTransferStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

CREATE TABLE "Warehouse" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "address" TEXT,
  "description" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockMovement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "transactionType" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "transactionLineId" TEXT NOT NULL,
  "referenceNo" TEXT,
  "movementType" "StockMovementType" NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unit" TEXT NOT NULL,
  "unitConversion" DECIMAL(18,4),
  "transactionDate" TIMESTAMP(3) NOT NULL,
  "postedByUserId" TEXT,
  "reversalOfId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WarehouseTransfer" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "transferNo" TEXT NOT NULL,
  "transferDate" TIMESTAMP(3) NOT NULL,
  "fromWarehouseId" TEXT NOT NULL,
  "toWarehouseId" TEXT NOT NULL,
  "notes" TEXT,
  "status" "WarehouseTransferStatus" NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" TEXT NOT NULL,
  "postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WarehouseTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WarehouseTransferLine" (
  "id" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unit" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WarehouseTransferLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VoucherEntry" ADD COLUMN "warehouseId" TEXT;

CREATE UNIQUE INDEX "Warehouse_workspaceId_code_key" ON "Warehouse"("workspaceId", "code");
CREATE UNIQUE INDEX "Warehouse_workspaceId_name_key" ON "Warehouse"("workspaceId", "name");
CREATE UNIQUE INDEX "Warehouse_one_default_per_workspace" ON "Warehouse"("workspaceId") WHERE "isDefault" = true AND "deletedAt" IS NULL;
CREATE INDEX "Warehouse_workspaceId_isActive_idx" ON "Warehouse"("workspaceId", "isActive");
CREATE INDEX "Warehouse_workspaceId_isDefault_idx" ON "Warehouse"("workspaceId", "isDefault");
CREATE UNIQUE INDEX "StockMovement_workspaceId_idempotencyKey_key" ON "StockMovement"("workspaceId", "idempotencyKey");
CREATE INDEX "StockMovement_workspace_warehouse_item_date_idx" ON "StockMovement"("workspaceId", "warehouseId", "inventoryItemId", "transactionDate");
CREATE INDEX "StockMovement_transactionType_transactionId_idx" ON "StockMovement"("transactionType", "transactionId");
CREATE INDEX "StockMovement_inventoryItemId_transactionDate_idx" ON "StockMovement"("inventoryItemId", "transactionDate");
CREATE UNIQUE INDEX "WarehouseTransfer_workspaceId_transferNo_key" ON "WarehouseTransfer"("workspaceId", "transferNo");
CREATE INDEX "WarehouseTransfer_workspaceId_transferDate_idx" ON "WarehouseTransfer"("workspaceId", "transferDate");
CREATE UNIQUE INDEX "WarehouseTransferLine_transferId_inventoryItemId_key" ON "WarehouseTransferLine"("transferId", "inventoryItemId");
CREATE INDEX "WarehouseTransferLine_inventoryItemId_idx" ON "WarehouseTransferLine"("inventoryItemId");
CREATE INDEX "VoucherEntry_warehouseId_idx" ON "VoucherEntry"("warehouseId");

ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WarehouseTransfer" ADD CONSTRAINT "WarehouseTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseTransfer" ADD CONSTRAINT "WarehouseTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseTransfer" ADD CONSTRAINT "WarehouseTransfer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseTransfer" ADD CONSTRAINT "WarehouseTransfer_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WarehouseTransfer" ADD CONSTRAINT "WarehouseTransfer_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WarehouseTransfer" ADD CONSTRAINT "WarehouseTransfer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WarehouseTransferLine" ADD CONSTRAINT "WarehouseTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "WarehouseTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseTransferLine" ADD CONSTRAINT "WarehouseTransferLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every existing workspace gets exactly one active default warehouse.
INSERT INTO "Warehouse" ("id", "tenantId", "companyId", "workspaceId", "name", "code", "isDefault", "isActive")
SELECT gen_random_uuid()::text, w."tenantId", w."companyId", w."id", 'Main Warehouse', 'WH-MAIN', true, true
FROM "Workspace" w
WHERE NOT EXISTS (SELECT 1 FROM "Warehouse" wh WHERE wh."workspaceId" = w."id");

-- Historical documents retain their physical location without replaying stock.
UPDATE "VoucherEntry" v
SET "warehouseId" = w."id"
FROM "Warehouse" w
WHERE w."workspaceId" = v."workspaceId" AND w."isDefault" = true;

-- Preserve the exact pre-migration aggregate balance as one auditable opening
-- movement per product. New transactions use immutable per-document movements.
WITH voucher_effect AS (
  SELECT vi."inventoryItemId", SUM(
    CASE
      WHEN v."voucherType"::text IN ('PURCHASE', 'RECEIPT_NOTE') THEN vi."quantity"
      WHEN v."voucherType"::text = 'CREDIT_NOTE' THEN vi."quantity"
      WHEN v."voucherType"::text IN ('SALES', 'DELIVERY_NOTE', 'DEBIT_NOTE') THEN -vi."quantity"
      ELSE 0
    END
  ) AS qty
  FROM "VoucherInventoryItem" vi
  JOIN "VoucherEntry" v ON v."id" = vi."voucherId"
  JOIN "InventoryItem" i ON i."id" = vi."inventoryItemId"
  WHERE v."status" = 'POSTED' AND i."kind" = 'PRODUCT'
    AND COALESCE(v."documentKind", '') NOT IN ('purchase-order', 'sale-order', 'quotation', 'proforma')
    AND NOT (v."voucherType"::text = 'PURCHASE' AND EXISTS (
      SELECT 1 FROM "VoucherEntry" src WHERE src."id" = v."sourceVoucherId" AND src."documentKind" = 'receipt-note'
    ))
    AND NOT (v."voucherType"::text = 'SALES' AND EXISTS (
      SELECT 1 FROM "VoucherEntry" src WHERE src."id" = v."sourceVoucherId" AND src."documentKind" = 'delivery-note'
    ))
  GROUP BY vi."inventoryItemId"
), adjustment_effect AS (
  SELECT "inventoryItemId", SUM("quantity") AS qty FROM "InventoryAdjustment" GROUP BY "inventoryItemId"
), balances AS (
  SELECT i.*, (i."openingQty" + COALESCE(v.qty, 0) + COALESCE(a.qty, 0)) AS balance
  FROM "InventoryItem" i
  LEFT JOIN voucher_effect v ON v."inventoryItemId" = i."id"
  LEFT JOIN adjustment_effect a ON a."inventoryItemId" = i."id"
  WHERE i."kind" = 'PRODUCT'
)
INSERT INTO "StockMovement" (
  "id", "tenantId", "companyId", "workspaceId", "warehouseId", "inventoryItemId",
  "transactionType", "transactionId", "transactionLineId", "referenceNo", "movementType",
  "quantity", "unit", "transactionDate", "idempotencyKey"
)
SELECT gen_random_uuid()::text, b."tenantId", b."companyId", b."workspaceId", w."id", b."id",
  'MIGRATION_OPENING', b."id", b."id", 'Warehouse migration opening balance',
  CASE WHEN b.balance >= 0 THEN 'IN'::"StockMovementType" ELSE 'OUT'::"StockMovementType" END,
  ABS(b.balance), b."unit", CURRENT_TIMESTAMP, 'migration-opening:' || b."id"
FROM balances b
JOIN "Warehouse" w ON w."workspaceId" = b."workspaceId" AND w."isDefault" = true
WHERE b.balance <> 0;
