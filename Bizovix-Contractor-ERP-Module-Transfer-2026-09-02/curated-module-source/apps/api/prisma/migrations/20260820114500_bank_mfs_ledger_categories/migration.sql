-- Bank and MFS are containers. Actual institution/wallet accounts are custom
-- ledgers created underneath their respective fixed categories.
DROP TRIGGER IF EXISTS "lockSystemChartOfAccounts" ON "Account";

UPDATE "Account"
SET "code" = '1222100', "level" = 'CATEGORY', "sortOrder" = 10, "updatedAt" = NOW()
WHERE "code" = '1222001' AND "name" = 'Bank Accounts' AND "isSystem" = TRUE;

UPDATE "Account"
SET "code" = '1222200', "level" = 'CATEGORY', "sortOrder" = 20, "updatedAt" = NOW()
WHERE "code" = '1222002' AND "name" = 'Mobile Financial Service Accounts' AND "isSystem" = TRUE;

UPDATE "Account" clearing
SET "code" = '1222101', "parentId" = bank."id", "updatedAt" = NOW()
FROM "Account" bank
WHERE clearing."code" = '1222003'
  AND clearing."name" = 'Bank Clearing'
  AND clearing."isSystem" = TRUE
  AND bank."code" = '1222100'
  AND bank."companyId" = clearing."companyId";

CREATE TRIGGER "lockSystemChartOfAccounts"
BEFORE UPDATE OR DELETE ON "Account"
FOR EACH ROW
EXECUTE FUNCTION "protectSystemChartOfAccounts"();
