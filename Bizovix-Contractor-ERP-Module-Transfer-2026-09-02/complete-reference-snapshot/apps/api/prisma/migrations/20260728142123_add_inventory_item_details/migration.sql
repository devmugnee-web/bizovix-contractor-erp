-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "categoryId" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "languageAlias" TEXT,
ADD COLUMN "partNumber" TEXT,
ADD COLUMN "notes" TEXT;

-- CreateIndex
CREATE INDEX "InventoryItem_categoryId_idx" ON "InventoryItem"("categoryId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
