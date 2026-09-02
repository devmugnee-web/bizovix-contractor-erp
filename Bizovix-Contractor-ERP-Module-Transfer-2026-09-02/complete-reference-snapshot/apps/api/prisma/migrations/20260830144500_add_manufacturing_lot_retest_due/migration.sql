ALTER TABLE "ManufacturingInventoryLot"
ADD COLUMN "retestDueAt" TIMESTAMP(3);

CREATE INDEX "ManufacturingInventoryLot_retestDueAt_idx"
ON "ManufacturingInventoryLot"("retestDueAt");
