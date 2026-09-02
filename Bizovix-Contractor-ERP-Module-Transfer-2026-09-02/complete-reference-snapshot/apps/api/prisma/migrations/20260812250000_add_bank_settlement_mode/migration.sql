-- AlterEnum
ALTER TYPE "SettlementMode" ADD VALUE 'BANK';

-- AlterTable
ALTER TABLE "VoucherEntry" ADD COLUMN     "settlementAccountId" TEXT;

-- AlterTable
ALTER TABLE "Warehouse" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WarehouseTransfer" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "VoucherEntry_settlementAccountId_idx" ON "VoucherEntry"("settlementAccountId");

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_settlementAccountId_fkey" FOREIGN KEY ("settlementAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "StockMovement_workspace_warehouse_item_date_idx" RENAME TO "StockMovement_workspaceId_warehouseId_inventoryItemId_trans_idx";
