CREATE TYPE "SecurityType" AS ENUM ('PAY_ORDER', 'BANK_GUARANTEE');
CREATE TYPE "FundingType" AS ENUM ('LOAN', 'CASH');
CREATE TYPE "TenderSecurityDocumentStatus" AS ENUM ('PENDING', 'CREATED', 'NOT_REQUIRED');

ALTER TABLE "document_purchases"
  ADD COLUMN "tenderSecurityStatus" "TenderSecurityDocumentStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "tender_securities"
  ADD COLUMN "chargeFromAccountId" TEXT,
  ADD COLUMN "securityType" "SecurityType" NOT NULL DEFAULT 'PAY_ORDER',
  ADD COLUMN "fundingType" "FundingType" NOT NULL DEFAULT 'LOAN',
  ADD COLUMN "marginAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "bankFinanceAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "interestRate" DECIMAL(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "validityMonths" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "remarks" TEXT;

ALTER TABLE "tender_securities"
  ALTER COLUMN "amount" SET DEFAULT 0;

ALTER TABLE "tender_securities"
  ADD CONSTRAINT "tender_securities_chargeFromAccountId_fkey"
  FOREIGN KEY ("chargeFromAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "tender_security_items" (
  "id" TEXT NOT NULL,
  "tenderSecurityId" TEXT NOT NULL,
  "documentPurchaseId" TEXT NOT NULL,
  "securityAmount" DECIMAL(18, 2) NOT NULL,
  "marginPercentage" DECIMAL(8, 2) NOT NULL,
  "marginAmount" DECIMAL(18, 2) NOT NULL,
  "bankFinanceAmount" DECIMAL(18, 2) NOT NULL,
  "referenceNo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tender_security_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tender_security_items_documentPurchaseId_key"
  ON "tender_security_items"("documentPurchaseId");

ALTER TABLE "tender_security_items"
  ADD CONSTRAINT "tender_security_items_tenderSecurityId_fkey"
  FOREIGN KEY ("tenderSecurityId") REFERENCES "tender_securities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tender_security_items"
  ADD CONSTRAINT "tender_security_items_documentPurchaseId_fkey"
  FOREIGN KEY ("documentPurchaseId") REFERENCES "document_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
