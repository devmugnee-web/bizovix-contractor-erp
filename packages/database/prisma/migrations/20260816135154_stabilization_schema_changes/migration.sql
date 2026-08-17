-- AlterTable
ALTER TABLE "document_purchases" ADD COLUMN     "linkedTenderId" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "account" TEXT,
ADD COLUMN     "amount" DECIMAL(18,2),
ADD COLUMN     "archiveReason" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT,
ADD COLUMN     "archivedByName" TEXT,
ADD COLUMN     "certificateNumber" TEXT,
ADD COLUMN     "currentVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "documentType" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "fileType" TEXT,
ADD COLUMN     "issueDate" TIMESTAMP(3),
ADD COLUMN     "issuingAuthority" TEXT,
ADD COLUMN     "organizationMasterId" TEXT,
ADD COLUMN     "referenceNumber" TEXT,
ADD COLUMN     "relatedEntityId" TEXT,
ADD COLUMN     "relatedEntityName" TEXT,
ADD COLUMN     "relatedModule" TEXT,
ADD COLUMN     "reminderDays" INTEGER,
ADD COLUMN     "responsiblePerson" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tenderId" TEXT,
ADD COLUMN     "uploadedById" TEXT,
ADD COLUMN     "uploadedByName" TEXT,
ADD COLUMN     "workId" TEXT;

-- AlterTable
ALTER TABLE "ledger_accounts" ADD COLUMN     "isControlAccount" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "tenders" ADD COLUMN     "assignedToName" TEXT,
ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "checklistStatus" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "documentPurchaseDeadline" TIMESTAMP(3),
ADD COLUMN     "estimatedTenderSecurityAmount" DECIMAL(18,2),
ADD COLUMN     "lowestBidAmount" DECIMAL(18,2),
ADD COLUMN     "lowestBidder" TEXT,
ADD COLUMN     "openingDate" TIMESTAMP(3),
ADD COLUMN     "openingResult" TEXT,
ADD COLUMN     "preBidDate" TIMESTAMP(3),
ADD COLUMN     "procurementMethod" TEXT,
ADD COLUMN     "publishedDate" TIMESTAMP(3),
ADD COLUMN     "quotedAmount" DECIMAL(18,2),
ADD COLUMN     "resultRemarks" TEXT,
ADD COLUMN     "submissionDate" TIMESTAMP(3),
ADD COLUMN     "submissionDeadline" TIMESTAMP(3),
ADD COLUMN     "submissionMethod" TEXT,
ADD COLUMN     "submissionReference" TEXT,
ADD COLUMN     "submissionRemarks" TEXT,
ADD COLUMN     "submittedById" TEXT,
ADD COLUMN     "submittedByName" TEXT,
ADD COLUMN     "tenderMethod" TEXT,
ADD COLUMN     "tenderSecurityRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tenderType" TEXT,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_versions_documentId_idx" ON "document_versions"("documentId");

-- CreateIndex
CREATE INDEX "document_purchases_organizationId_linkedTenderId_idx" ON "document_purchases"("organizationId", "linkedTenderId");

-- CreateIndex
CREATE INDEX "documents_organizationId_category_idx" ON "documents"("organizationId", "category");

-- CreateIndex
CREATE INDEX "documents_organizationId_status_idx" ON "documents"("organizationId", "status");

-- CreateIndex
CREATE INDEX "documents_organizationId_expiryDate_idx" ON "documents"("organizationId", "expiryDate");

-- CreateIndex
CREATE INDEX "expenses_organizationId_status_idx" ON "expenses"("organizationId", "status");

-- CreateIndex
CREATE INDEX "performance_guarantees_organizationId_status_expiryDate_idx" ON "performance_guarantees"("organizationId", "status", "expiryDate");

-- CreateIndex
CREATE INDEX "receipts_organizationId_status_idx" ON "receipts"("organizationId", "status");

-- CreateIndex
CREATE INDEX "tender_securities_organizationId_status_expiryDate_idx" ON "tender_securities"("organizationId", "status", "expiryDate");

-- CreateIndex
CREATE INDEX "tenders_organizationId_status_idx" ON "tenders"("organizationId", "status");

-- CreateIndex
CREATE INDEX "tenders_organizationId_submissionDeadline_idx" ON "tenders"("organizationId", "submissionDeadline");

-- AddForeignKey
ALTER TABLE "document_purchases" ADD CONSTRAINT "document_purchases_linkedTenderId_fkey" FOREIGN KEY ("linkedTenderId") REFERENCES "tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES "organization_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "bank_reconciliations_org_account_date_idx" RENAME TO "bank_reconciliations_organizationId_accountId_statementTo_idx";

-- RenameIndex
ALTER INDEX "financial_transactions_organizationId_accountId_transactionDate" RENAME TO "financial_transactions_organizationId_accountId_transaction_idx";

-- RenameIndex
ALTER INDEX "financial_transactions_source_post_key" RENAME TO "financial_transactions_organizationId_sourceModule_sourceTy_key";

-- RenameIndex
ALTER INDEX "journal_entries_source_key" RENAME TO "journal_entries_organizationId_sourceModule_sourceType_sour_key";

-- RenameIndex
ALTER INDEX "organization_contacts_organizationId_organizationMasterId_mobil" RENAME TO "organization_contacts_organizationId_organizationMasterId_m_key";

