UPDATE "receipts" AS receipt
SET "receiptHeadAccountId" = (
  SELECT line."accountId"
  FROM "journal_entries" AS journal
  JOIN "journal_lines" AS line ON line."journalEntryId" = journal."id"
  JOIN "ledger_accounts" AS account ON account."id" = line."accountId"
  WHERE journal."organizationId" = receipt."organizationId"
    AND journal."sourceModule" = 'RECEIPT'
    AND journal."sourceId" = receipt."id"
    AND journal."status" IN ('POSTED', 'REVERSED')
    AND account."accountType" = 'INCOME'
    AND line."credit" > 0
  ORDER BY line."createdAt" ASC
  LIMIT 1
)
WHERE receipt."receiptCategory" = 'GENERAL'
  AND receipt."receiptHeadAccountId" IS NULL;
