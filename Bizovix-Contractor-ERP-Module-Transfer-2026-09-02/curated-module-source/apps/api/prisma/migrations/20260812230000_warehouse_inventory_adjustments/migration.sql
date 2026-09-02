ALTER TABLE "InventoryAdjustment" ADD COLUMN "warehouseId" TEXT;

UPDATE "InventoryAdjustment" a
SET "warehouseId" = w."id"
FROM "Warehouse" w
WHERE w."workspaceId" = a."workspaceId" AND w."isDefault" = true;

ALTER TABLE "InventoryAdjustment" ALTER COLUMN "warehouseId" SET NOT NULL;
CREATE INDEX "InventoryAdjustment_warehouseId_idx" ON "InventoryAdjustment"("warehouseId");
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
