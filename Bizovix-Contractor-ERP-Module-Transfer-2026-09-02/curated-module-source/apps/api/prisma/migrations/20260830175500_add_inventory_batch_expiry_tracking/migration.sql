ALTER TABLE "InventoryItem"
ADD COLUMN "trackBatchExpiry" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "VoucherInventoryItem"
ADD COLUMN "batchNumber" TEXT,
ADD COLUMN "manufacturedAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "InventoryAdjustment"
ADD COLUMN "batchNumber" TEXT,
ADD COLUMN "manufacturedAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "StockMovement"
ADD COLUMN "batchNumber" TEXT,
ADD COLUMN "manufacturedAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "VoucherInventoryItem_batchNumber_idx"
ON "VoucherInventoryItem"("batchNumber");

CREATE INDEX "StockMovement_workspaceId_inventoryItemId_expiresAt_idx"
ON "StockMovement"("workspaceId", "inventoryItemId", "expiresAt");
