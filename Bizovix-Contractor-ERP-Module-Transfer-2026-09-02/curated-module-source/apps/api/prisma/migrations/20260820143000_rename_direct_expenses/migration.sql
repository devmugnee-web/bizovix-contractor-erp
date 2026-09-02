-- Correct the protected fixed COA label. Its accounting nature and hierarchy
-- were already DIRECT_EXPENSE under Operating Expenses; only the label was
-- mistakenly seeded as "Direct Income".
DROP TRIGGER IF EXISTS "lockSystemChartOfAccounts" ON "Account";

UPDATE "Account"
SET "name" = 'Direct Expenses', "updatedAt" = NOW()
WHERE "code" = '5120000'
  AND "name" = 'Direct Income'
  AND "level" = 'CATEGORY'
  AND "nature" = 'DIRECT_EXPENSE'
  AND "isSystem" = TRUE;

CREATE TRIGGER "lockSystemChartOfAccounts"
BEFORE UPDATE OR DELETE ON "Account"
FOR EACH ROW
EXECUTE FUNCTION "protectSystemChartOfAccounts"();
