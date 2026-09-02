-- First-class Party -> COA sub-ledger identity. Existing JSON tags are used
-- only to backfill the relation; future posting code reads this FK directly.
ALTER TABLE "Party"
  ADD COLUMN "ledgerAccountId" TEXT,
  ADD COLUMN "openingBalanceDate" DATE;

UPDATE "Party"
SET "openingBalanceDate" = ("createdAt" AT TIME ZONE 'UTC')::date
WHERE "openingBalance" <> 0
  AND "openingBalanceDate" IS NULL;

-- An earlier fixed-category migration intentionally removed most protected
-- operational ledgers. Recreate every ledger used by server-owned posting
-- rules, idempotently, beneath the immutable category code for each company.
WITH seed(
  "code", "name", "nature", "groupCode", "parentCode", "sortOrder", "isControlAccount"
) AS (
  VALUES
    ('1221001', 'Cash in Hand',              'ASSET',            'CASH',             '1221000', 10, FALSE),
    ('1221002', 'Petty Cash',                'ASSET',            'CASH',             '1221000', 20, FALSE),
    ('1210001', 'Inventory Control',         'ASSET',            'INVENTORY',        '1210000', 10, TRUE),
    ('1232001', 'Inventory Delivered Pending Invoice', 'ASSET',  'CURRENT_ASSET',    '1232000', 10, TRUE),
    ('2212001', 'Purchase Bill Pending',     'LIABILITY',        'AP',               '2212000', 10, TRUE),
    ('2250001', 'Provident Fund Payable',    'LIABILITY',        'LIABILITY',        '2250000', 10, FALSE),
    ('3100001', 'Opening Balance Equity',    'EQUITY',           'CAPITAL',          '3100000', 10, TRUE),
    ('4110001', 'Sales Account',             'INCOME',           'SALES_REVENUE',    '4110000', 10, FALSE),
    ('4120001', 'Sales Return',              'INCOME',           'SALES_REVENUE',    '4120000', 10, FALSE),
    ('4200001', 'Inventory Adjustment Gain', 'INCOME',           'INCOME',           '4200000', 10, FALSE),
    ('5110001', 'Cost of Goods Sold',        'DIRECT_EXPENSE',   'PURCHASE_COST',    '5110000', 10, TRUE),
    ('5210006', 'Provident Fund Expense',    'INDIRECT_EXPENSE', 'INDIRECT_EXPENSE', '5210000', 60, FALSE),
    ('5210007', 'Round Off',                 'INDIRECT_EXPENSE', 'INDIRECT_EXPENSE', '5210000', 70, FALSE),
    ('5210008', 'Inventory Adjustment Loss', 'INDIRECT_EXPENSE', 'INDIRECT_EXPENSE', '5210000', 80, FALSE)
)
INSERT INTO "Account" (
  "id", "tenantId", "companyId", "accountGroupId", "parentId", "level",
  "sortOrder", "code", "name", "nature", "isSystem", "isControlAccount",
  "requiresItemDetails", "openingBalance", "printOnInvoices", "status",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  parent."tenantId",
  parent."companyId",
  account_group."id",
  parent."id",
  'LEDGER'::"AccountLevel",
  seed."sortOrder",
  seed."code",
  seed."name",
  seed."nature"::"AccountNature",
  TRUE,
  seed."isControlAccount",
  FALSE,
  0,
  FALSE,
  'ACTIVE'::"AccountStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM seed
JOIN "Account" AS parent
  ON parent."code" = seed."parentCode"
 AND parent."level" = 'CATEGORY'
 AND parent."isSystem" = TRUE
LEFT JOIN "AccountGroup" AS account_group
  ON account_group."companyId" = parent."companyId"
 AND account_group."code" = seed."groupCode"
ON CONFLICT ("companyId", "code") DO NOTHING;

-- Never silently take over a custom/code-conflicting row or continue with an
-- incomplete protected posting backbone.
DO $$
DECLARE
  invalid_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM "Company" AS company
  CROSS JOIN (VALUES
    ('1221001', 'Cash in Hand',              'ASSET',            'CASH',             '1221000'),
    ('1221002', 'Petty Cash',                'ASSET',            'CASH',             '1221000'),
    ('1210001', 'Inventory Control',         'ASSET',            'INVENTORY',        '1210000'),
    ('1232001', 'Inventory Delivered Pending Invoice', 'ASSET',  'CURRENT_ASSET',    '1232000'),
    ('2212001', 'Purchase Bill Pending',     'LIABILITY',        'AP',               '2212000'),
    ('2250001', 'Provident Fund Payable',    'LIABILITY',        'LIABILITY',        '2250000'),
    ('3100001', 'Opening Balance Equity',    'EQUITY',           'CAPITAL',          '3100000'),
    ('4110001', 'Sales Account',             'INCOME',           'SALES_REVENUE',    '4110000'),
    ('4120001', 'Sales Return',              'INCOME',           'SALES_REVENUE',    '4120000'),
    ('4200001', 'Inventory Adjustment Gain', 'INCOME',           'INCOME',           '4200000'),
    ('5110001', 'Cost of Goods Sold',        'DIRECT_EXPENSE',   'PURCHASE_COST',    '5110000'),
    ('5210006', 'Provident Fund Expense',    'INDIRECT_EXPENSE', 'INDIRECT_EXPENSE', '5210000'),
    ('5210007', 'Round Off',                 'INDIRECT_EXPENSE', 'INDIRECT_EXPENSE', '5210000'),
    ('5210008', 'Inventory Adjustment Loss', 'INDIRECT_EXPENSE', 'INDIRECT_EXPENSE', '5210000')
  ) AS required("code", "name", "nature", "groupCode", "parentCode")
  LEFT JOIN "Account" AS account
    ON account."companyId" = company."id"
   AND account."code" = required."code"
  LEFT JOIN "Account" AS parent ON parent."id" = account."parentId"
  LEFT JOIN "AccountGroup" AS account_group ON account_group."id" = account."accountGroupId"
  WHERE account."id" IS NULL
     OR account."name" IS DISTINCT FROM required."name"
     OR account."level" IS DISTINCT FROM 'LEDGER'::"AccountLevel"
     OR account."isSystem" IS NOT TRUE
     OR account."nature"::text IS DISTINCT FROM required."nature"
     OR account_group."code" IS DISTINCT FROM required."groupCode"
     OR account."status" IS DISTINCT FROM 'ACTIVE'::"AccountStatus"
     OR parent."code" IS DISTINCT FROM required."parentCode"
     OR parent."isSystem" IS NOT TRUE;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Protected COA posting backbone has % missing or conflicting ledger(s); review them without overwriting protected accounts', invalid_count;
  END IF;
END $$;

-- Prefer the durable partyMaster tag when linking existing party ledgers.
WITH tagged_candidates AS (
  SELECT
    party."id" AS "partyId",
    MIN(account."id") AS "accountId"
  FROM "Party" AS party
  JOIN "Account" AS account
    ON account."companyId" = party."companyId"
   AND account."level" = 'LEDGER'
   AND account."isSystem" = FALSE
   AND account."bankDetails" #>> '{partyMaster,partyId}' = party."id"
  GROUP BY party."id"
  HAVING COUNT(*) = 1
)
UPDATE "Party" AS party
SET "ledgerAccountId" = candidate."accountId"
FROM tagged_candidates AS candidate
WHERE party."id" = candidate."partyId"
  AND party."ledgerAccountId" IS NULL;

-- Legacy managed ledgers may predate the JSON tag. Link only a single exact
-- name under the correct immutable AR/AP parent category.
WITH legacy_party_candidate_pairs AS (
  SELECT
    party."id" AS "partyId",
    account."id" AS "accountId"
  FROM "Party" AS party
  JOIN "Account" AS parent
    ON parent."companyId" = party."companyId"
   AND parent."code" = CASE WHEN party."type" = 'CUSTOMER' THEN '1231000' ELSE '2211000' END
   AND parent."level" = 'CATEGORY'
   AND parent."isSystem" = TRUE
  JOIN "Account" AS account
    ON account."companyId" = party."companyId"
   AND account."parentId" = parent."id"
   AND account."level" = 'LEDGER'
   AND account."isSystem" = FALSE
   AND LOWER(TRIM(account."name")) = LOWER(TRIM(party."name"))
  WHERE party."ledgerAccountId" IS NULL
), legacy_party_candidates AS (
  SELECT
    candidate."partyId",
    MIN(candidate."accountId") AS "accountId"
  FROM legacy_party_candidate_pairs AS candidate
  GROUP BY candidate."partyId"
  HAVING COUNT(*) = 1
), one_to_one_legacy_party_candidates AS (
  SELECT candidate.*
  FROM legacy_party_candidates AS candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM legacy_party_candidates AS other
    WHERE other."accountId" = candidate."accountId"
      AND other."partyId" <> candidate."partyId"
  )
)
UPDATE "Party" AS party
SET "ledgerAccountId" = candidate."accountId"
FROM one_to_one_legacy_party_candidates AS candidate
WHERE party."id" = candidate."partyId"
  AND party."ledgerAccountId" IS NULL;

-- Some old Party rows never received a managed sub-ledger. Create one now so
-- the ID relation is total for every existing customer/supplier. Numbering is
-- allocated after the current company-wide maximum for the relevant prefix.
WITH unlinked_party AS (
  SELECT
    party.*,
    parent."id" AS "parentAccountId",
    account_group."id" AS "accountGroupId",
    CASE WHEN party."type" = 'CUSTOMER' THEN '1231' ELSE '2211' END AS "codePrefix",
    ROW_NUMBER() OVER (
      PARTITION BY party."companyId", party."type"
      ORDER BY party."createdAt", party."id"
    ) AS "partyOrdinal"
  FROM "Party" AS party
  JOIN "Account" AS parent
    ON parent."companyId" = party."companyId"
   AND parent."code" = CASE WHEN party."type" = 'CUSTOMER' THEN '1231000' ELSE '2211000' END
   AND parent."level" = 'CATEGORY'
   AND parent."isSystem" = TRUE
  LEFT JOIN "AccountGroup" AS account_group
    ON account_group."companyId" = party."companyId"
   AND account_group."code" = CASE WHEN party."type" = 'CUSTOMER' THEN 'AR' ELSE 'AP' END
  WHERE party."ledgerAccountId" IS NULL
    -- Multiple existing partyMaster tags are an integrity conflict and must be
    -- reviewed; do not hide that conflict by silently creating a third row.
    AND NOT EXISTS (
      SELECT 1
      FROM "Account" AS tagged
      WHERE tagged."companyId" = party."companyId"
        AND tagged."level" = 'LEDGER'
        AND tagged."bankDetails" #>> '{partyMaster,partyId}' = party."id"
    )
), numbered_party AS (
  SELECT
    unlinked_party.*,
    COALESCE((
      SELECT MAX(RIGHT(account."code", 3)::integer)
      FROM "Account" AS account
      WHERE account."companyId" = unlinked_party."companyId"
        AND account."level" = 'LEDGER'
        AND account."code" ~ ('^' || unlinked_party."codePrefix" || '[0-9]{3}$')
    ), 0) + unlinked_party."partyOrdinal" AS "nextCounter"
  FROM unlinked_party
)
INSERT INTO "Account" (
  "id", "tenantId", "companyId", "accountGroupId", "parentId", "level",
  "code", "name", "nature", "isSystem", "isControlAccount",
  "requiresItemDetails", "openingBalance", "bankDetails", "printOnInvoices",
  "status", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  party."tenantId",
  party."companyId",
  party."accountGroupId",
  party."parentAccountId",
  'LEDGER'::"AccountLevel",
  party."codePrefix" || LPAD(party."nextCounter"::text, 3, '0'),
  party."name",
  CASE WHEN party."type" = 'CUSTOMER' THEN 'ASSET' ELSE 'LIABILITY' END::"AccountNature",
  FALSE,
  FALSE,
  FALSE,
  0,
  jsonb_build_object(
    'partyMaster',
    jsonb_build_object(
      'partyId', party."id",
      'partyType', party."type"::text,
      'workspaceId', party."workspaceId"
    )
  ),
  FALSE,
  'ACTIVE'::"AccountStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM numbered_party AS party
WHERE party."nextCounter" <= 999;

WITH created_candidates AS (
  SELECT
    party."id" AS "partyId",
    MIN(account."id") AS "accountId"
  FROM "Party" AS party
  JOIN "Account" AS account
    ON account."companyId" = party."companyId"
   AND account."level" = 'LEDGER'
   AND account."bankDetails" #>> '{partyMaster,partyId}' = party."id"
  WHERE party."ledgerAccountId" IS NULL
  GROUP BY party."id"
  HAVING COUNT(*) = 1
)
UPDATE "Party" AS party
SET "ledgerAccountId" = candidate."accountId"
FROM created_candidates AS candidate
WHERE party."id" = candidate."partyId"
  AND party."ledgerAccountId" IS NULL;

-- A ledger linked through the managed Party relation follows the Party's
-- identity and role. This normalizes only custom ledgers (never protected COA
-- rows) before future vouchers begin relying exclusively on the FK.
UPDATE "Account" AS account
SET
  "parentId" = parent."id",
  "accountGroupId" = account_group."id",
  "name" = party."name",
  "nature" = CASE WHEN party."type" = 'CUSTOMER' THEN 'ASSET' ELSE 'LIABILITY' END::"AccountNature",
  "requiresItemDetails" = FALSE,
  "bankDetails" = (
    CASE
      WHEN jsonb_typeof(account."bankDetails") = 'object' THEN account."bankDetails"
      ELSE '{}'::jsonb
    END
    || jsonb_build_object(
      'partyMaster',
      jsonb_build_object(
        'partyId', party."id",
        'partyType', party."type"::text,
        'workspaceId', party."workspaceId"
      )
    )
  ),
  "status" = 'ACTIVE'::"AccountStatus",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Party" AS party
JOIN "Account" AS parent
  ON parent."companyId" = party."companyId"
 AND parent."code" = CASE WHEN party."type" = 'CUSTOMER' THEN '1231000' ELSE '2211000' END
 AND parent."level" = 'CATEGORY'
 AND parent."isSystem" = TRUE
LEFT JOIN "AccountGroup" AS account_group
  ON account_group."companyId" = party."companyId"
 AND account_group."code" = CASE WHEN party."type" = 'CUSTOMER' THEN 'AR' ELSE 'AP' END
WHERE account."id" = party."ledgerAccountId"
  AND account."companyId" = party."companyId"
  AND account."level" = 'LEDGER'
  AND account."isSystem" = FALSE;

DO $$
DECLARE
  invalid_party_ledger_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO invalid_party_ledger_count
  FROM "Party" AS party
  LEFT JOIN "Account" AS account ON account."id" = party."ledgerAccountId"
  LEFT JOIN "Account" AS parent ON parent."id" = account."parentId"
  LEFT JOIN "AccountGroup" AS account_group ON account_group."id" = account."accountGroupId"
  WHERE account."id" IS NULL
     OR account."companyId" IS DISTINCT FROM party."companyId"
     OR account."level" IS DISTINCT FROM 'LEDGER'::"AccountLevel"
     OR account."isSystem" IS DISTINCT FROM FALSE
     OR account."status" IS DISTINCT FROM 'ACTIVE'::"AccountStatus"
     OR account."name" IS DISTINCT FROM party."name"
     OR account."nature" IS DISTINCT FROM CASE WHEN party."type" = 'CUSTOMER' THEN 'ASSET' ELSE 'LIABILITY' END::"AccountNature"
     OR parent."code" IS DISTINCT FROM CASE WHEN party."type" = 'CUSTOMER' THEN '1231000' ELSE '2211000' END
     OR account_group."code" IS DISTINCT FROM CASE WHEN party."type" = 'CUSTOMER' THEN 'AR' ELSE 'AP' END
     OR account."bankDetails" #>> '{partyMaster,partyId}' IS DISTINCT FROM party."id";

  IF invalid_party_ledger_count > 0 THEN
    RAISE EXCEPTION '% Party ledger link(s) violate company, role, group, or managed-tag invariants', invalid_party_ledger_count;
  END IF;
END $$;

DO $$
DECLARE
  unresolved_party_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO unresolved_party_count
  FROM "Party"
  WHERE "ledgerAccountId" IS NULL;

  IF unresolved_party_count > 0 THEN
    RAISE EXCEPTION '% Party row(s) could not be linked to one immutable COA ledger; resolve duplicate tags, missing parents, or exhausted ledger codes', unresolved_party_count;
  END IF;
END $$;

CREATE UNIQUE INDEX "Party_ledgerAccountId_key" ON "Party"("ledgerAccountId");
ALTER TABLE "Party"
  ADD CONSTRAINT "Party_ledgerAccountId_fkey"
  FOREIGN KEY ("ledgerAccountId") REFERENCES "Account"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Party opening balances used to be report-only metadata. Materialize each
-- one as a balanced, POSTED, account-ID-backed journal so Trial Balance,
-- Balance Sheet and every sub-ledger all consume the same immutable source.
DO $$
DECLARE
  missing_actor_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO missing_actor_count
  FROM "Party" AS party
  WHERE party."openingBalance" <> 0
    AND party."createdByUserId" IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "TenantMember" AS member
      WHERE member."tenantId" = party."tenantId"
        AND (member."companyId" = party."companyId" OR member."companyId" IS NULL)
    );

  IF missing_actor_count > 0 THEN
    RAISE EXCEPTION '% Party opening balance(s) have no valid posting user', missing_actor_count;
  END IF;
END $$;

WITH opening_party AS (
  SELECT
    party.*,
    party_account."code" AS "partyAccountCode",
    company."currencyCode",
    COALESCE(
      party."createdByUserId",
      (
        SELECT member."userId"
        FROM "TenantMember" AS member
        WHERE member."tenantId" = party."tenantId"
          AND (member."companyId" = party."companyId" OR member."companyId" IS NULL)
        ORDER BY
          CASE WHEN member."companyId" = party."companyId" THEN 0 ELSE 1 END,
          CASE WHEN member."membershipRole" = 'OWNER' THEN 0 ELSE 1 END,
          member."joinedAt",
          member."id"
        LIMIT 1
      )
    ) AS "postingUserId"
  FROM "Party" AS party
  JOIN "Account" AS party_account ON party_account."id" = party."ledgerAccountId"
  JOIN "Company" AS company ON company."id" = party."companyId"
  WHERE party."openingBalance" <> 0
)
INSERT INTO "VoucherEntry" (
  "id", "tenantId", "companyId", "workspaceId", "createdByUserId",
  "voucherType", "documentKind", "workflowOrigin", "voucherNumber",
  "voucherDate", "partyName", "partyId", "reference", "narration",
  "status", "totalAmount", "debit", "credit", "currency", "sourceType",
  "sourceId", "postingVersion", "approvedByUserId", "approvedAt",
  "postedAt", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  party."tenantId",
  party."companyId",
  party."workspaceId",
  party."postingUserId",
  'JOURNAL'::"VoucherEntryType",
  'opening-balance',
  'DIRECT'::"VoucherWorkflowOrigin",
  'OB-PARTY-' || party."partyAccountCode",
  party."openingBalanceDate"::timestamp,
  party."name",
  party."id",
  'Opening balance for ' || party."name",
  'Opening balance against Opening Balance Equity',
  'POSTED'::"VoucherEntryStatus",
  ABS(party."openingBalance"),
  ABS(party."openingBalance"),
  ABS(party."openingBalance"),
  party."currencyCode",
  'PARTY_OPENING_BALANCE',
  party."id",
  1,
  party."postingUserId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM opening_party AS party
WHERE NOT EXISTS (
  SELECT 1
  FROM "VoucherEntry" AS existing
  WHERE existing."companyId" = party."companyId"
    AND existing."sourceType" = 'PARTY_OPENING_BALANCE'
    AND existing."sourceId" = party."id"
    AND existing."reversalOfId" IS NULL
);

INSERT INTO "VoucherEntryLine" (
  "id", "voucherId", "accountId", "ledger", "description", "debit",
  "credit", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  voucher."id",
  party_account."id",
  party_account."name",
  'Opening balance for ' || party."name",
  CASE
    WHEN (party."type" = 'CUSTOMER' AND party."openingBalance" > 0)
      OR (party."type" = 'SUPPLIER' AND party."openingBalance" < 0)
    THEN ABS(party."openingBalance") ELSE 0
  END,
  CASE
    WHEN (party."type" = 'CUSTOMER' AND party."openingBalance" > 0)
      OR (party."type" = 'SUPPLIER' AND party."openingBalance" < 0)
    THEN 0 ELSE ABS(party."openingBalance")
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "VoucherEntry" AS voucher
JOIN "Party" AS party
  ON party."id" = voucher."sourceId"
 AND voucher."sourceType" = 'PARTY_OPENING_BALANCE'
 AND voucher."reversalOfId" IS NULL
JOIN "Account" AS party_account ON party_account."id" = party."ledgerAccountId"
WHERE NOT EXISTS (
  SELECT 1 FROM "VoucherEntryLine" AS line WHERE line."voucherId" = voucher."id"
)
UNION ALL
SELECT
  gen_random_uuid()::text,
  voucher."id",
  equity_account."id",
  equity_account."name",
  'Opening balance offset for ' || party."name",
  CASE
    WHEN (party."type" = 'CUSTOMER' AND party."openingBalance" > 0)
      OR (party."type" = 'SUPPLIER' AND party."openingBalance" < 0)
    THEN 0 ELSE ABS(party."openingBalance")
  END,
  CASE
    WHEN (party."type" = 'CUSTOMER' AND party."openingBalance" > 0)
      OR (party."type" = 'SUPPLIER' AND party."openingBalance" < 0)
    THEN ABS(party."openingBalance") ELSE 0
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "VoucherEntry" AS voucher
JOIN "Party" AS party
  ON party."id" = voucher."sourceId"
 AND voucher."sourceType" = 'PARTY_OPENING_BALANCE'
 AND voucher."reversalOfId" IS NULL
JOIN "Account" AS equity_account
  ON equity_account."companyId" = voucher."companyId"
 AND equity_account."code" = '3100001'
 AND equity_account."level" = 'LEDGER'
 AND equity_account."isSystem" = TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM "VoucherEntryLine" AS line WHERE line."voucherId" = voucher."id"
);

-- Backfill application-owned fixed ledgers by immutable company-scoped code.
-- Keep the target-table alias out of JOIN scope for PostgreSQL compatibility.
UPDATE "VoucherEntryLine" AS line
SET "accountId" = account."id",
    "ledger" = account."name"
FROM "VoucherEntry" AS voucher, "Account" AS account
WHERE line."voucherId" = voucher."id"
  AND line."accountId" IS NULL
  AND account."companyId" = voucher."companyId"
  AND account."level" = 'LEDGER'
  AND account."isSystem" = TRUE
  AND account."code" = CASE LOWER(TRIM(line."ledger"))
    WHEN 'cash in hand' THEN '1221001'
    WHEN 'petty cash' THEN '1221002'
    WHEN 'inventory control' THEN '1210001'
    WHEN 'inventory delivered pending invoice' THEN '1232001'
    WHEN 'purchase bill pending' THEN '2212001'
    WHEN 'provident fund payable' THEN '2250001'
    WHEN 'opening balance equity' THEN '3100001'
    WHEN 'sales account' THEN '4110001'
    WHEN 'sales return' THEN '4120001'
    WHEN 'inventory adjustment gain' THEN '4200001'
    WHEN 'cost of goods sold' THEN '5110001'
    WHEN 'provident fund expense' THEN '5210006'
    WHEN 'round off' THEN '5210007'
    WHEN 'inventory adjustment loss' THEN '5210008'
  END
  AND LOWER(TRIM(line."ledger")) IN (
    'cash in hand',
    'petty cash',
    'inventory control',
    'inventory delivered pending invoice',
    'purchase bill pending',
    'provident fund payable',
    'opening balance equity',
    'sales account',
    'sales return',
    'inventory adjustment gain',
    'cost of goods sold',
    'provident fund expense',
    'round off',
    'inventory adjustment loss'
  );

-- Party-owned rows bind directly through Voucher.partyId ->
-- Party.ledgerAccountId. Display names are refreshed only as snapshots.
UPDATE "VoucherEntryLine" AS line
SET "accountId" = account."id",
    "ledger" = account."name"
FROM "VoucherEntry" AS voucher
JOIN "Party" AS party
  ON party."id" = voucher."partyId"
 AND party."workspaceId" = voucher."workspaceId"
JOIN "Account" AS account
  ON account."id" = party."ledgerAccountId"
 AND account."companyId" = voucher."companyId"
 AND account."level" = 'LEDGER'
WHERE line."voucherId" = voucher."id"
  AND line."accountId" IS NULL
  AND LOWER(TRIM(line."ledger")) = LOWER(TRIM(voucher."partyName"));

-- Compatibility for old vouchers that have no partyId: use the correct AR/AP
-- group and exact name only when there is one candidate.
WITH party_candidates AS (
  SELECT
    line."id" AS "lineId",
    MIN(account."id") AS "accountId",
    MIN(account."name") AS "accountName"
  FROM "VoucherEntryLine" AS line
  JOIN "VoucherEntry" AS voucher ON voucher."id" = line."voucherId"
  JOIN "Account" AS account
    ON account."companyId" = voucher."companyId"
   AND account."level" = 'LEDGER'
   AND LOWER(TRIM(account."name")) = LOWER(TRIM(voucher."partyName"))
  JOIN "AccountGroup" AS account_group ON account_group."id" = account."accountGroupId"
  WHERE line."accountId" IS NULL
    AND voucher."partyId" IS NULL
    AND LOWER(TRIM(line."ledger")) = LOWER(TRIM(voucher."partyName"))
    AND account_group."code" = CASE
      WHEN voucher."voucherType" IN ('PURCHASE', 'PURCHASE_ORDER', 'RECEIPT_NOTE', 'PAYMENT', 'DEBIT_NOTE') THEN 'AP'
      WHEN voucher."voucherType" IN ('SALES', 'SALES_ORDER', 'DELIVERY_NOTE', 'RECEIPT', 'CREDIT_NOTE', 'QUOTATION', 'PROFORMA_INVOICE') THEN 'AR'
    END
  GROUP BY line."id"
  HAVING COUNT(*) = 1
)
UPDATE "VoucherEntryLine" AS line
SET "accountId" = candidate."accountId",
    "ledger" = candidate."accountName"
FROM party_candidates AS candidate
WHERE line."id" = candidate."lineId";

-- Resolve any remaining historical name-only line only when the display name
-- identifies one company ledger. Inactive accounts stay eligible for history.
WITH unique_name_candidates AS (
  SELECT
    line."id" AS "lineId",
    MIN(account."id") AS "accountId",
    MIN(account."name") AS "accountName"
  FROM "VoucherEntryLine" AS line
  JOIN "VoucherEntry" AS voucher ON voucher."id" = line."voucherId"
  JOIN "Account" AS account
    ON account."companyId" = voucher."companyId"
   AND account."level" = 'LEDGER'
   AND LOWER(TRIM(account."name")) = LOWER(TRIM(line."ledger"))
  WHERE line."accountId" IS NULL
  GROUP BY line."id"
  HAVING COUNT(*) = 1
)
UPDATE "VoucherEntryLine" AS line
SET "accountId" = candidate."accountId",
    "ledger" = candidate."accountName"
FROM unique_name_candidates AS candidate
WHERE line."id" = candidate."lineId";

-- An account that owns history cannot be deleted and collapse that history to
-- a free-text name. Nullable remains temporarily for explicitly legacy rows,
-- while the NOT VALID check enforces IDs on every future non-zero line.
ALTER TABLE "VoucherEntryLine"
  DROP CONSTRAINT IF EXISTS "VoucherEntryLine_accountId_fkey";
ALTER TABLE "VoucherEntryLine"
  ADD CONSTRAINT "VoucherEntryLine_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoucherEntryLine"
  ADD CONSTRAINT "VoucherEntryLine_nonzero_requires_account_id"
  CHECK (
    "accountId" IS NOT NULL
    OR (COALESCE("debit", 0) = 0 AND COALESCE("credit", 0) = 0)
  ) NOT VALID;

DO $$
DECLARE
  unresolved_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO unresolved_count
  FROM "VoucherEntryLine"
  WHERE "accountId" IS NULL
    AND (COALESCE("debit", 0) <> 0 OR COALESCE("credit", 0) <> 0);
  RAISE NOTICE '% legacy non-zero VoucherEntryLine row(s) remain unresolved and readable only through the explicit legacy fallback', unresolved_count;
END $$;
