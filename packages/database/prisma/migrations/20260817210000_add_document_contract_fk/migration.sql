-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "contractId" TEXT;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

