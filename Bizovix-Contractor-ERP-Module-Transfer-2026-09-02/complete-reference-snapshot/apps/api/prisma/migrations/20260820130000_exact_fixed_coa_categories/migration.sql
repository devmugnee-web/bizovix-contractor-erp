-- The customer-specified fixed COA is a category skeleton. Only Cash in Hand
-- and Petty Cash are fixed ledgers; operational ledgers are created later
-- beneath the appropriate protected category.
DROP TRIGGER IF EXISTS "lockSystemChartOfAccounts" ON "Account";

UPDATE "Account" SET "name" = 'Accounts Receivables Control (Customers)', "updatedAt" = NOW()
WHERE "code" = '1231000' AND "isSystem" = TRUE;
UPDATE "Account" SET "name" = 'Others Receivables', "updatedAt" = NOW()
WHERE "code" = '1232000' AND "isSystem" = TRUE;

UPDATE "Account" SET "code" = '2110000', "level" = 'CATEGORY', "accountGroupId" = NULL, "isControlAccount" = FALSE, "sortOrder" = 10, "updatedAt" = NOW()
WHERE "code" = '2100001' AND "name" = 'Bank Loan' AND "isSystem" = TRUE;

UPDATE "Account" SET "code" = '2211000', "name" = 'Accounts Payable Controls (Supplier)', "level" = 'CATEGORY', "accountGroupId" = NULL, "isControlAccount" = FALSE, "sortOrder" = 10, "updatedAt" = NOW()
WHERE "code" = '2210001' AND "isSystem" = TRUE;
UPDATE "Account" SET "code" = '2212000', "level" = 'CATEGORY', "accountGroupId" = NULL, "isControlAccount" = FALSE, "sortOrder" = 20, "updatedAt" = NOW()
WHERE "code" = '2210002' AND "name" = 'Others Payable' AND "isSystem" = TRUE;

UPDATE "Account" SET "code" = '2241000', "level" = 'CATEGORY', "accountGroupId" = NULL, "isControlAccount" = FALSE, "sortOrder" = 10, "updatedAt" = NOW()
WHERE "code" = '2240001' AND "name" = 'Short Term Loan' AND "isSystem" = TRUE;
UPDATE "Account" SET "code" = '2242000', "level" = 'CATEGORY', "accountGroupId" = NULL, "isControlAccount" = FALSE, "sortOrder" = 20, "updatedAt" = NOW()
WHERE "code" = '2240002' AND "name" = 'Time Loan' AND "isSystem" = TRUE;
UPDATE "Account" SET "code" = '2243000', "level" = 'CATEGORY', "accountGroupId" = NULL, "isControlAccount" = FALSE, "sortOrder" = 30, "updatedAt" = NOW()
WHERE "code" = '2240003' AND "name" = 'Personal Loan' AND "isSystem" = TRUE;

UPDATE "Account" SET "code" = '4120000', "level" = 'CATEGORY', "accountGroupId" = NULL, "isControlAccount" = FALSE, "sortOrder" = 20, "updatedAt" = NOW()
WHERE "code" = '4110003' AND "name" = 'Sales Return' AND "isSystem" = TRUE;

DELETE FROM "Account"
WHERE "isSystem" = TRUE AND "level" = 'LEDGER' AND "name" NOT IN ('Cash in Hand', 'Petty Cash');

CREATE TRIGGER "lockSystemChartOfAccounts" BEFORE UPDATE OR DELETE ON "Account"
FOR EACH ROW EXECUTE FUNCTION "protectSystemChartOfAccounts"();
