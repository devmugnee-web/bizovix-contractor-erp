-- AlterTable
ALTER TABLE "InventoryCategory" ADD COLUMN "parentId" TEXT;

-- DropIndex
DROP INDEX "InventoryCategory_workspaceId_name_key";

-- CreateIndex
CREATE INDEX "InventoryCategory_parentId_idx" ON "InventoryCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCategory_workspaceId_parentId_name_key" ON "InventoryCategory"("workspaceId", "parentId", "name");

-- AddForeignKey
ALTER TABLE "InventoryCategory" ADD CONSTRAINT "InventoryCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "InventoryCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
