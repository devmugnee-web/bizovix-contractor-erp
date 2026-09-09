ALTER TABLE "receipts"
ADD COLUMN "grossAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
ADD COLUMN "vatDeductedAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
ADD COLUMN "taxDeductedAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
ADD COLUMN "securityDepositDeductedAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
ADD COLUMN "otherDeductionAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
ADD COLUMN "chequeNo" TEXT,
ADD COLUMN "chequeDate" TIMESTAMP(3),
ADD COLUMN "chequeBankName" TEXT;

UPDATE "receipts"
SET "grossAmount" = "amount"
WHERE "grossAmount" = 0;
