UPDATE "VoucherEntryLine" AS line
SET "costCenter" = CASE
  WHEN LOWER(account."name") LIKE '%cash%' THEN 'Cash-in-Hand'
  WHEN account."bankDetails" IS NOT NULL THEN 'Bank Accounts'
  WHEN account."nature" = 'ASSET' THEN 'Assets'
  WHEN account."nature" = 'LIABILITY' THEN 'Liabilities'
  WHEN account."nature" = 'EQUITY' THEN 'Equity'
  WHEN account."nature" = 'INCOME' THEN 'Revenue'
  ELSE 'Direct Expenses'
END
FROM "Account" AS account, "VoucherEntry" AS voucher
WHERE line."accountId" = account."id"
  AND line."voucherId" = voucher."id"
  AND voucher."sourceType" = 'ACCOUNT_OPENING_BALANCE';
