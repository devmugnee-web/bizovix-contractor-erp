DROP TRIGGER IF EXISTS "lockSystemChartOfAccounts" ON "Account";

INSERT INTO "Account" ("id", "tenantId", "companyId", "parentId", "level", "sortOrder", "code", "name", "nature", "isSystem", "isControlAccount", "requiresItemDetails", "openingBalance", "printOnInvoices", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, parent."tenantId", parent."companyId", parent."id", 'CATEGORY', 10, '1231000', 'Accounts Receivable', 'ASSET', TRUE, FALSE, TRUE, 0, FALSE, 'ACTIVE', NOW(), NOW()
FROM "Account" parent WHERE parent."code" = '1230000' AND parent."name" = 'Receivables'
ON CONFLICT ("companyId", "code") DO NOTHING;

UPDATE "Account"
SET "code" = '1232000', "name" = 'Others Receivable', "level" = 'CATEGORY', "accountGroupId" = NULL, "isControlAccount" = FALSE, "sortOrder" = 20, "updatedAt" = NOW()
WHERE "code" = '1230002' AND "isSystem" = TRUE;

UPDATE "Account" control
SET "code" = '1231001', "parentId" = category."id", "updatedAt" = NOW()
FROM "Account" category
WHERE control."code" = '1230001' AND control."name" = 'Accounts Receivable Control'
  AND category."code" = '1231000' AND category."companyId" = control."companyId";

CREATE TRIGGER "lockSystemChartOfAccounts" BEFORE UPDATE OR DELETE ON "Account"
FOR EACH ROW EXECUTE FUNCTION "protectSystemChartOfAccounts"();
