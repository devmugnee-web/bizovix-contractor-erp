-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "createdByUserId" TEXT;

-- AlterTable
ALTER TABLE "Party" ADD COLUMN     "createdByUserId" TEXT;

-- AlterTable
ALTER TABLE "PayrollSettings" ALTER COLUMN "salaryComponents" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "InventoryItem_createdByUserId_idx" ON "InventoryItem"("createdByUserId");

-- CreateIndex
CREATE INDEX "Party_createdByUserId_idx" ON "Party"("createdByUserId");

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
