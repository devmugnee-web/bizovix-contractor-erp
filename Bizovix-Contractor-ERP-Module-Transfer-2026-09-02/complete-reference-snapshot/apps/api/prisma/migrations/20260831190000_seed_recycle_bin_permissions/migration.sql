-- RecycleBinController already guards every endpoint with
-- @RequirePermission(...) + PermissionGuard, but all four actions (list,
-- restore, permanent-delete, empty) were pinned to the broad "workspace.manage"
-- key — so anyone allowed to edit workspace settings could also permanently
-- destroy recycled records. Give the bin its own dedicated keys instead.
WITH permission_seed("key", "resource", "action", "moduleKey") AS (
  VALUES
    ('recycle_bin.view', 'recycle_bin', 'view', 'accounting'),
    ('recycle_bin.delete', 'recycle_bin', 'delete', 'accounting')
)
INSERT INTO "Permission" ("id", "key", "moduleKey", "resource", "action", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."key", p."moduleKey", p."resource", p."action", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM permission_seed p
ON CONFLICT ("key") DO NOTHING;

-- Same backfill rule as the other transaction-permission migrations: only the
-- unrestricted owner-tier roles get it automatically. Everyone else needs it
-- granted explicitly through the role/share-user matrix.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "allowed")
SELECT gen_random_uuid()::text, r."id", p."id", true
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" IN ('OWNER', 'SUPER_ADMIN', 'ADMIN')
  AND p."key" IN ('recycle_bin.view', 'recycle_bin.delete')
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "allowed" = true;
