-- Advance/deposit heads are containers for user ledgers. Goods in Transit is
-- already the fixed category, so remove its redundant same-named child ledger.
DROP TRIGGER IF EXISTS "lockSystemChartOfAccounts" ON "Account";

UPDATE "Account"
SET "code" = '1241000', "level" = 'CATEGORY', "accountGroupId" = NULL,
    "isControlAccount" = FALSE, "sortOrder" = 10, "updatedAt" = NOW()
WHERE "code" = '1240001' AND "name" = 'Advance & IOU' AND "isSystem" = TRUE;

UPDATE "Account"
SET "code" = '1242000', "level" = 'CATEGORY', "accountGroupId" = NULL,
    "isControlAccount" = FALSE, "sortOrder" = 20, "updatedAt" = NOW()
WHERE "code" = '1240002' AND "name" = 'Deposit & Others' AND "isSystem" = TRUE;

DELETE FROM "Account"
WHERE "code" = '1250001' AND "name" = 'Goods in Transit' AND "isSystem" = TRUE;

CREATE TRIGGER "lockSystemChartOfAccounts" BEFORE UPDATE OR DELETE ON "Account"
FOR EACH ROW EXECUTE FUNCTION "protectSystemChartOfAccounts"();
