ALTER TABLE "VoucherEntry"
  ADD COLUMN "roundOffAmount" DECIMAL(18,4);

-- Existing companies were seeded before the Round Off ledger existed, so give
-- every one of them the same account new companies get from systemAccountSeeds.
INSERT INTO "Account" (
  "id", "tenantId", "companyId", "accountGroupId", "parentId", "level",
  "code", "name", "nature", "isSystem", "isControlAccount", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  parent."tenantId",
  parent."companyId",
  grp."id",
  parent."id",
  'LEDGER',
  '5210007',
  'Round Off',
  'INDIRECT_EXPENSE',
  true,
  false,
  now(),
  now()
FROM "Account" parent
LEFT JOIN "AccountGroup" grp
  ON grp."companyId" = parent."companyId" AND grp."code" = 'INDIRECT_EXPENSE'
WHERE parent."code" = '5210000'
  AND parent."level" = 'CATEGORY'
  AND NOT EXISTS (
    SELECT 1 FROM "Account" existing
    WHERE existing."companyId" = parent."companyId" AND existing."code" = '5210007'
  );
