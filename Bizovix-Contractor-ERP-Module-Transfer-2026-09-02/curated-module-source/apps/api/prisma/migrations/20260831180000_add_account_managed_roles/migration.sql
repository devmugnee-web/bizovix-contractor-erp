-- Module-owned accounts remain ordinary custom accounts, but receive a stable
-- company-scoped role. Account.name remains editable presentation data.
ALTER TABLE "Account" ADD COLUMN "managedRole" TEXT;

DO $$
BEGIN
  -- Only exact, custom, structurally recognizable legacy ledgers are eligible.
  -- Multiple candidates are genuinely ambiguous and must be resolved by an
  -- operator. Protected matches are intentionally ignored and never mutated.
  IF EXISTS (
    WITH candidates AS (
      SELECT a."companyId", 'LC_GOODS_IN_TRANSIT' AS role
      FROM "Account" a JOIN "Account" p ON p.id = a."parentId" AND p."companyId" = a."companyId"
      WHERE a."isSystem" = FALSE AND a.level = 'LEDGER' AND a.name = 'Goods in Transit (LC Expenses)' AND p.code = '1250000'
      UNION ALL
      SELECT a."companyId", 'LC_IMPORT_COST_PAYABLE'
      FROM "Account" a JOIN "Account" p ON p.id = a."parentId" AND p."companyId" = a."companyId"
      WHERE a."isSystem" = FALSE AND a.level = 'LEDGER' AND a.name = 'Import Cost Payable (LC)' AND p.code = '2212000'
      UNION ALL
      SELECT a."companyId", 'FIXED_ASSET_ACCUMULATED_DEPRECIATION'
      FROM "Account" a JOIN "Account" p ON p.id = a."parentId" AND p."companyId" = a."companyId"
      WHERE a."isSystem" = FALSE AND a.level = 'LEDGER' AND a.name = 'Accumulated Depreciation' AND p.code = '1100000'
      UNION ALL
      SELECT a."companyId", 'FIXED_ASSET_DEPRECIATION_EXPENSE'
      FROM "Account" a
      JOIN "Account" p ON p.id = a."parentId" AND p."companyId" = a."companyId"
      LEFT JOIN "Account" gp ON gp.id = p."parentId" AND gp."companyId" = a."companyId"
      WHERE a."isSystem" = FALSE AND a.level = 'LEDGER' AND a.name = 'Depreciation Expense'
        AND (p.code = '5200000' OR (p."isSystem" = FALSE AND p.name = 'Indirect Expenses' AND gp.code = '5000000'))
    )
    SELECT 1 FROM candidates GROUP BY "companyId", role HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Ambiguous module-owned Account backfill: more than one exact custom ledger matches a managed role in one company.';
  END IF;
END $$;

UPDATE "Account" a
SET "managedRole" = 'LC_GOODS_IN_TRANSIT'
FROM "Account" p
WHERE p.id = a."parentId" AND p."companyId" = a."companyId"
  AND a."isSystem" = FALSE AND a.level = 'LEDGER'
  AND a.name = 'Goods in Transit (LC Expenses)' AND p.code = '1250000';

UPDATE "Account" a
SET "managedRole" = 'LC_IMPORT_COST_PAYABLE'
FROM "Account" p
WHERE p.id = a."parentId" AND p."companyId" = a."companyId"
  AND a."isSystem" = FALSE AND a.level = 'LEDGER'
  AND a.name = 'Import Cost Payable (LC)' AND p.code = '2212000';

UPDATE "Account" a
SET "managedRole" = 'FIXED_ASSET_ACCUMULATED_DEPRECIATION'
FROM "Account" p
WHERE p.id = a."parentId" AND p."companyId" = a."companyId"
  AND a."isSystem" = FALSE AND a.level = 'LEDGER'
  AND a.name = 'Accumulated Depreciation' AND p.code = '1100000';

UPDATE "Account" a
SET "managedRole" = 'FIXED_ASSET_DEPRECIATION_EXPENSE'
FROM "Account" p
LEFT JOIN "Account" gp ON gp.id = p."parentId" AND gp."companyId" = p."companyId"
WHERE p.id = a."parentId" AND p."companyId" = a."companyId"
  AND a."isSystem" = FALSE AND a.level = 'LEDGER'
  AND a.name = 'Depreciation Expense'
  AND (p.code = '5200000' OR (p."isSystem" = FALSE AND p.name = 'Indirect Expenses' AND gp.code = '5000000'));

-- AssetCategory.*LedgerId columns are already stable ID authority and may
-- intentionally point several categories to one shared common ledger. They are
-- therefore not rewritten or assigned per-category roles by this migration.
-- New missing mappings receive a role atomically when the module provisions
-- them, while existing mappings continue to use their captured Account ids.

CREATE UNIQUE INDEX "Account_companyId_managedRole_key"
ON "Account"("companyId", "managedRole");
