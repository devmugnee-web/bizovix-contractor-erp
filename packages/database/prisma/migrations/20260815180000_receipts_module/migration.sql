ALTER TYPE "ReceiptStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "receipts"
ADD COLUMN "workId" TEXT,
ADD COLUMN "receiptNo" TEXT,
ADD COLUMN "receiptCategory" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN "receiptType" TEXT NOT NULL DEFAULT 'GENERAL_RECEIPT',
ADD COLUMN "receivedFrom" TEXT NOT NULL DEFAULT 'Unknown',
ADD COLUMN "receivedInAccountId" TEXT,
ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
ADD COLUMN "description" TEXT;

CREATE TABLE "receipt_sequences" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "receipts_organizationId_receiptNo_key" ON "receipts"("organizationId", "receiptNo");
CREATE INDEX "receipts_organizationId_receiptDate_idx" ON "receipts"("organizationId", "receiptDate");
CREATE INDEX "receipts_organizationId_workId_idx" ON "receipts"("organizationId", "workId");
CREATE UNIQUE INDEX "receipt_sequences_organizationId_year_key" ON "receipt_sequences"("organizationId", "year");

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_receivedInAccountId_fkey" FOREIGN KEY ("receivedInAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
