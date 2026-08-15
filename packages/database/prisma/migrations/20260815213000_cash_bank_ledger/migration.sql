ALTER TABLE "bank_accounts"
  ADD COLUMN "branch" TEXT,
  ADD COLUMN "routingNumber" TEXT,
  ADD COLUMN "bankAccountType" TEXT,
  ADD COLUMN "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "openingBalanceDate" TIMESTAMP(3),
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'BDT',
  ADD COLUMN "remarks" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "financial_transactions" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "transactionNo" TEXT NOT NULL,
  "accountId" TEXT NOT NULL, "direction" TEXT NOT NULL, "amount" DECIMAL(18,2) NOT NULL,
  "balanceAfter" DECIMAL(18,2) NOT NULL, "sourceModule" TEXT NOT NULL, "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL, "referenceNo" TEXT, "description" TEXT NOT NULL,
  "transactionDate" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'POSTED',
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "financial_transactions_organizationId_transactionNo_key" ON "financial_transactions"("organizationId", "transactionNo");
CREATE UNIQUE INDEX "financial_transactions_source_post_key" ON "financial_transactions"("organizationId", "sourceModule", "sourceType", "sourceId", "accountId", "direction");
CREATE INDEX "financial_transactions_organizationId_transactionDate_idx" ON "financial_transactions"("organizationId", "transactionDate");
CREATE INDEX "financial_transactions_organizationId_accountId_transactionDate_idx" ON "financial_transactions"("organizationId", "accountId", "transactionDate");

CREATE TABLE "fund_transfers" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "transferNo" TEXT NOT NULL,
  "fromAccountId" TEXT NOT NULL, "toAccountId" TEXT NOT NULL, "amount" DECIMAL(18,2) NOT NULL,
  "bankCharge" DECIMAL(18,2) NOT NULL DEFAULT 0, "referenceNo" TEXT, "description" TEXT,
  "transferDate" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fund_transfers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fund_transfers_organizationId_transferNo_key" ON "fund_transfers"("organizationId", "transferNo");
CREATE INDEX "fund_transfers_organizationId_transferDate_idx" ON "fund_transfers"("organizationId", "transferDate");

CREATE TABLE "bank_reconciliations" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "accountId" TEXT NOT NULL,
  "statementFrom" TIMESTAMP(3) NOT NULL, "statementTo" TIMESTAMP(3) NOT NULL,
  "erpBalance" DECIMAL(18,2) NOT NULL, "statementBalance" DECIMAL(18,2) NOT NULL,
  "difference" DECIMAL(18,2) NOT NULL, "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "reconciledById" TEXT, "reconciledAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bank_reconciliations_org_account_date_idx" ON "bank_reconciliations"("organizationId", "accountId", "statementTo");

CREATE TABLE "cheques" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "chequeNo" TEXT NOT NULL, "type" TEXT NOT NULL,
  "accountId" TEXT, "bankName" TEXT NOT NULL, "branch" TEXT, "party" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL, "chequeDate" TIMESTAMP(3) NOT NULL, "actionDate" TIMESTAMP(3),
  "referenceNo" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "remarks" TEXT, "postedAt" TIMESTAMP(3),
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cheques_organizationId_chequeNo_type_key" ON "cheques"("organizationId", "chequeNo", "type");
CREATE INDEX "cheques_organizationId_status_chequeDate_idx" ON "cheques"("organizationId", "status", "chequeDate");

ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_transfers" ADD CONSTRAINT "fund_transfers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fund_transfers" ADD CONSTRAINT "fund_transfers_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_transfers" ADD CONSTRAINT "fund_transfers_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
