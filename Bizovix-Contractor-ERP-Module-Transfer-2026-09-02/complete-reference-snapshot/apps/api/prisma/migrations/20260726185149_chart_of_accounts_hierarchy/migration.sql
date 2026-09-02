-- CreateEnum
CREATE TYPE "AccountLevel" AS ENUM ('MAIN_CATEGORY', 'SUB_CATEGORY', 'CHILD_CATEGORY', 'SUB_CHILD_CATEGORY', 'LEDGER');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "level" "AccountLevel" NOT NULL DEFAULT 'LEDGER',
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "accountGroupId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Account_companyId_parentId_idx" ON "Account"("companyId", "parentId");

-- CreateIndex
CREATE INDEX "Account_companyId_level_idx" ON "Account"("companyId", "level");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

