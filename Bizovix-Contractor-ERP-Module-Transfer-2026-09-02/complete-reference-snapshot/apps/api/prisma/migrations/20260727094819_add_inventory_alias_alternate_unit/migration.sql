-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "alias" TEXT,
ADD COLUMN     "alternateUnit" TEXT,
ADD COLUMN     "alternateUnitConversion" DECIMAL(18,4);
