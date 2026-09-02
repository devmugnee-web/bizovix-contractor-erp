WITH permission_seed("key", "resource", "action") AS (
  VALUES
    ('warehouse.view', 'warehouse', 'view'),
    ('warehouse.create', 'warehouse', 'create'),
    ('warehouse.update', 'warehouse', 'update'),
    ('warehouse.deactivate', 'warehouse', 'deactivate'),
    ('warehouse.transfer', 'warehouse-transfer', 'create'),
    ('warehouse.stock.view', 'warehouse-stock', 'view')
)
INSERT INTO "Permission" ("id", "key", "moduleKey", "resource", "action", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."key", 'inventory', p."resource", p."action", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM permission_seed p
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "allowed")
SELECT gen_random_uuid()::text, r."id", p."id", true
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" IN ('OWNER', 'SUPER_ADMIN', 'ADMIN')
  AND p."key" IN ('warehouse.view', 'warehouse.create', 'warehouse.update', 'warehouse.deactivate', 'warehouse.transfer', 'warehouse.stock.view')
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "allowed" = true;
