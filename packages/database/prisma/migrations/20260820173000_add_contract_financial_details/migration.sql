ALTER TABLE "project_contracts"
ADD COLUMN "vatPct" DECIMAL(5,2),
ADD COLUMN "taxPct" DECIMAL(5,2),
ADD COLUMN "securityDepositMethod" TEXT,
ADD COLUMN "securityDepositStatus" TEXT,
ADD COLUMN "securityDepositReleasedAmount" DECIMAL(18,2),
ADD COLUMN "securityDepositReleasedDate" TIMESTAMP(3);
