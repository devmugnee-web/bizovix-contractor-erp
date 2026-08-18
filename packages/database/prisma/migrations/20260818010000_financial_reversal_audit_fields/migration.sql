ALTER TYPE "ExpenseStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "ExpenseStatus" ADD VALUE IF NOT EXISTS 'AMENDED';

ALTER TABLE "expenses"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "replacesExpenseId" TEXT;

ALTER TABLE "receipts"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "replacesReceiptId" TEXT;

CREATE UNIQUE INDEX "expenses_replacesExpenseId_key" ON "expenses"("replacesExpenseId");
CREATE INDEX "expenses_organizationId_replacesExpenseId_idx" ON "expenses"("organizationId", "replacesExpenseId");
CREATE UNIQUE INDEX "receipts_replacesReceiptId_key" ON "receipts"("replacesReceiptId");
CREATE INDEX "receipts_organizationId_replacesReceiptId_idx" ON "receipts"("organizationId", "replacesReceiptId");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_replacesExpenseId_fkey" FOREIGN KEY ("replacesExpenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_replacesReceiptId_fkey" FOREIGN KEY ("replacesReceiptId") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

WITH permission_keys(key_name) AS (VALUES
  ('retention.read'), ('retention.release'),
  ('completion_certificate.read'), ('completion_certificate.create'), ('completion_certificate.approve'),
  ('dlp.read'), ('dlp.manage'), ('defect.read'), ('defect.manage'),
  ('handover.read'), ('handover.manage'),
  ('project_close.read'), ('project_close.close'), ('project_close.override'), ('project_close.reopen')
)
INSERT INTO "permissions" ("id", "key", "group")
SELECT 'perm_' || md5(key_name), key_name, split_part(key_name, '.', 1)
FROM permission_keys
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp_' || md5(r."id" || p."id"), r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."isSystem" = true
  AND p."key" IN ('retention.read','retention.release','completion_certificate.read','completion_certificate.create','completion_certificate.approve','dlp.read','dlp.manage','defect.read','defect.manage','handover.read','handover.manage','project_close.read','project_close.close','project_close.override','project_close.reopen')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

UPDATE "ledger_accounts"
SET "isControlAccount" = true
WHERE "systemKey" IN ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE','RETENTION_RECEIVABLE','TAX_DEDUCTED_VAT','TAX_DEDUCTED_AIT','OTHER_DEDUCTION_RECEIVABLE','OPENING_BALANCE_EQUITY','CASH','BANK');
