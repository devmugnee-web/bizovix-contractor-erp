ALTER TABLE "VoucherInventoryItem"
  ADD COLUMN "manufacturingInventoryLotId" TEXT,
  ADD COLUMN "manufacturingSerialIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "VoucherInventoryItem_manufacturingInventoryLotId_idx"
  ON "VoucherInventoryItem"("manufacturingInventoryLotId");

ALTER TABLE "VoucherInventoryItem"
  ADD CONSTRAINT "VoucherInventoryItem_manufacturingInventoryLotId_fkey"
  FOREIGN KEY ("manufacturingInventoryLotId") REFERENCES "ManufacturingInventoryLot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
