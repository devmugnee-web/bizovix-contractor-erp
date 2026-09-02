-- DropIndex
DROP INDEX "InventoryItem_workspaceId_kind_status_idx";

-- AlterTable
ALTER TABLE "InventoryAdjustment" ADD COLUMN     "reason" TEXT;
