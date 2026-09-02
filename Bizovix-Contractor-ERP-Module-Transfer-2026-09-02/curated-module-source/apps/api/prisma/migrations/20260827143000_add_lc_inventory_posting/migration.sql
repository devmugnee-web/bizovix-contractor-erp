CREATE TABLE "LcInventoryPosting" (
  "id" TEXT NOT NULL,
  "lcId" TEXT NOT NULL,
  "lcItemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "stockMovementId" TEXT,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unitCost" DECIMAL(24,6) NOT NULL,
  "totalCost" DECIMAL(24,6) NOT NULL,
  "postedByUserId" TEXT NOT NULL,
  "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LcInventoryPosting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LcInventoryPosting_lcItemId_key" ON "LcInventoryPosting"("lcItemId");
CREATE UNIQUE INDEX "LcInventoryPosting_stockMovementId_key" ON "LcInventoryPosting"("stockMovementId");
CREATE INDEX "LcInventoryPosting_lcId_postedAt_idx" ON "LcInventoryPosting"("lcId", "postedAt");
CREATE INDEX "LcInventoryPosting_warehouseId_postedAt_idx" ON "LcInventoryPosting"("warehouseId", "postedAt");

ALTER TABLE "LcInventoryPosting" ADD CONSTRAINT "LcInventoryPosting_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "LcMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LcInventoryPosting" ADD CONSTRAINT "LcInventoryPosting_lcItemId_fkey" FOREIGN KEY ("lcItemId") REFERENCES "LcItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LcInventoryPosting" ADD CONSTRAINT "LcInventoryPosting_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LcInventoryPosting" ADD CONSTRAINT "LcInventoryPosting_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LcInventoryPosting" ADD CONSTRAINT "LcInventoryPosting_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
