INSERT INTO "Permission" ("id", "key", "moduleKey", "resource", "action", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'lc.delete', 'lc', 'lc', 'delete', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Same backfill recipe as 20260825071500_seed_lc_permissions: grant the new
-- lc.delete permission to every role that already holds the other lc.*
-- permissions, so the Delete button doesn't 403 for tenants onboarded before
-- this permission existed.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "allowed")
SELECT gen_random_uuid()::text, r."id", p."id", true
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" IN ('OWNER', 'SUPER_ADMIN', 'ADMIN', 'PURCHASE_OFFICER', 'ACCOUNTS_MANAGER', 'ACCOUNTS_OFFICER')
  AND p."key" = 'lc.delete'
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "allowed" = true;
