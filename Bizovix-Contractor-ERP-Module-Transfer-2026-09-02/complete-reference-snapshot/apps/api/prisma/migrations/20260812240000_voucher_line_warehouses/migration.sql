ALTER TABLE "VoucherInventoryItem" ADD COLUMN "warehouseId" TEXT;

-- Existing document lines inherit the document warehouse, preserving the
-- location already assigned by the multi-warehouse migration.
UPDATE "VoucherInventoryItem" vi
SET "warehouseId" = v."warehouseId"
FROM "VoucherEntry" v
WHERE v."id" = vi."voucherId";

CREATE INDEX "VoucherInventoryItem_warehouseId_idx" ON "VoucherInventoryItem"("warehouseId");

ALTER TABLE "VoucherInventoryItem"
ADD CONSTRAINT "VoucherInventoryItem_warehouseId_fkey"
FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
