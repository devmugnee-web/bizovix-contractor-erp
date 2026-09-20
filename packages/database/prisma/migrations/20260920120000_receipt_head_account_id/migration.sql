ALTER TABLE "receipts" ADD COLUMN "receiptHeadAccountId" TEXT;

UPDATE "receipts" AS receipt
SET "receiptHeadAccountId" = (
  SELECT line."accountId"
  FROM "journal_entries" AS journal
  JOIN "journal_lines" AS line ON line."journalEntryId" = journal."id"
  JOIN "ledger_accounts" AS account ON account."id" = line."accountId"
  WHERE journal."organizationId" = receipt."organizationId"
    AND journal."sourceModule" = 'RECEIPT'
    AND journal."sourceId" = receipt."id"
    AND journal."status" = 'POSTED'
    AND account."accountType" = 'INCOME'
    AND line."credit" > 0
  ORDER BY line."createdAt" ASC
  LIMIT 1
)
WHERE receipt."receiptCategory" = 'GENERAL';

CREATE INDEX "receipts_organizationId_receiptHeadAccountId_idx"
ON "receipts"("organizationId", "receiptHeadAccountId");

ALTER TABLE "receipts"
ADD CONSTRAINT "receipts_receiptHeadAccountId_fkey"
FOREIGN KEY ("receiptHeadAccountId") REFERENCES "ledger_accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
