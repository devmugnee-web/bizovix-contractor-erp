CREATE TABLE "ledger_accounts" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"code" TEXT NOT NULL,"name" TEXT NOT NULL,
  "parentId" TEXT,"accountType" TEXT NOT NULL,"normalBalance" TEXT NOT NULL,"description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,"isSystem" BOOLEAN NOT NULL DEFAULT false,"systemKey" TEXT,
  "linkedBankAccountId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ledger_accounts_organizationId_code_key" ON "ledger_accounts"("organizationId","code");
CREATE UNIQUE INDEX "ledger_accounts_organizationId_systemKey_key" ON "ledger_accounts"("organizationId","systemKey");
CREATE UNIQUE INDEX "ledger_accounts_organizationId_linkedBankAccountId_key" ON "ledger_accounts"("organizationId","linkedBankAccountId");
CREATE INDEX "ledger_accounts_organizationId_accountType_isActive_idx" ON "ledger_accounts"("organizationId","accountType","isActive");

CREATE TABLE "journal_entries" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"journalNo" TEXT NOT NULL,"journalDate" TIMESTAMP(3) NOT NULL,
  "referenceNo" TEXT,"description" TEXT NOT NULL,"sourceModule" TEXT NOT NULL,"sourceType" TEXT NOT NULL,"sourceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',"reversalOfId" TEXT,"createdById" TEXT,"postedById" TEXT,"postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "journal_entries_organizationId_journalNo_key" ON "journal_entries"("organizationId","journalNo");
CREATE UNIQUE INDEX "journal_entries_source_key" ON "journal_entries"("organizationId","sourceModule","sourceType","sourceId");
CREATE INDEX "journal_entries_organizationId_journalDate_status_idx" ON "journal_entries"("organizationId","journalDate","status");
CREATE INDEX "journal_entries_organizationId_sourceModule_sourceId_idx" ON "journal_entries"("organizationId","sourceModule","sourceId");

CREATE TABLE "journal_lines" (
  "id" TEXT NOT NULL,"journalEntryId" TEXT NOT NULL,"accountId" TEXT NOT NULL,"projectId" TEXT,"partyName" TEXT,"partyType" TEXT,
  "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,"credit" DECIMAL(18,2) NOT NULL DEFAULT 0,"description" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "journal_lines_accountId_journalEntryId_idx" ON "journal_lines"("accountId","journalEntryId");
CREATE INDEX "journal_lines_projectId_journalEntryId_idx" ON "journal_lines"("projectId","journalEntryId");
CREATE INDEX "journal_lines_partyName_journalEntryId_idx" ON "journal_lines"("partyName","journalEntryId");

CREATE TABLE "payables" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"partyName" TEXT NOT NULL,"partyType" TEXT NOT NULL DEFAULT 'VENDOR',
  "projectId" TEXT,"billNo" TEXT NOT NULL,"billDate" TIMESTAMP(3) NOT NULL,"amount" DECIMAL(18,2) NOT NULL,
  "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,"dueDate" TIMESTAMP(3),"description" TEXT,"status" TEXT NOT NULL DEFAULT 'UNPAID',
  "createdById" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payables_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payables_organizationId_billNo_key" ON "payables"("organizationId","billNo");
CREATE INDEX "payables_organizationId_status_dueDate_idx" ON "payables"("organizationId","status","dueDate");
CREATE INDEX "payables_organizationId_partyName_idx" ON "payables"("organizationId","partyName");

ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_linkedBankAccountId_fkey" FOREIGN KEY ("linkedBankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "cms_works"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "cms_works"("id") ON DELETE SET NULL ON UPDATE CASCADE;

WITH keys(key) AS (VALUES
 ('accounts.read'),('chart_of_accounts.read'),('chart_of_accounts.create'),('chart_of_accounts.update'),
 ('journal.read'),('journal.create'),('journal.post'),('journal.reverse'),('ledger.read'),
 ('receivable.read'),('receivable.manage'),('payable.read'),('payable.manage'),
 ('project_accounts.read'),('party_ledger.read'),('opening_balance.read'),('opening_balance.manage')
)
INSERT INTO "permissions" ("id","key","group","description")
SELECT 'perm-' || md5(key), key, split_part(key,'.',1), 'Accounts module permission' FROM keys
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id","roleId","permissionId")
SELECT 'rp-' || md5(r."id" || p."id"), r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."isSystem" = true AND p."key" IN (
 'accounts.read','chart_of_accounts.read','chart_of_accounts.create','chart_of_accounts.update',
 'journal.read','journal.create','journal.post','journal.reverse','ledger.read',
 'receivable.read','receivable.manage','payable.read','payable.manage',
 'project_accounts.read','party_ledger.read','opening_balance.read','opening_balance.manage'
)
ON CONFLICT ("roleId","permissionId") DO NOTHING;
