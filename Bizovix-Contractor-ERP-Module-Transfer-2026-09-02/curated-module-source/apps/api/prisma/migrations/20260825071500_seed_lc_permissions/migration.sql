WITH permission_seed("key", "resource", "action") AS (
  VALUES
    ('lc.view', 'lc', 'view'),
    ('lc.create', 'lc', 'create'),
    ('lc.edit', 'lc', 'update'),
    ('lc.cost.enter', 'cost-entry', 'create'),
    ('lc.cost.edit', 'cost-entry', 'update'),
    ('lc.cost.allocate', 'allocation', 'manage'),
    ('lc.finalize', 'landed-cost', 'finalize'),
    ('lc.finalize.reopen', 'landed-cost', 'reopen'),
    ('lc.reports.view', 'report', 'view'),
    ('lc.configure', 'cost-head', 'configure')
)
INSERT INTO "Permission" ("id", "key", "moduleKey", "resource", "action", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."key", 'lc', p."resource", p."action", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM permission_seed p
ON CONFLICT ("key") DO NOTHING;

-- Every existing tenant's Owner/Super Admin already holds every other
-- permission (see onboarding.service.ts); grant them these new LC ones too so
-- the Import & LC screens don't 403 for workspaces onboarded before this
-- module existed. Admin/Purchase Officer/Accounts Manager/Accounts Officer
-- get the same set going forward from onboarding.service.ts, but past role
-- rows for tenants onboarded earlier need the same backfill.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "allowed")
SELECT gen_random_uuid()::text, r."id", p."id", true
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" IN ('OWNER', 'SUPER_ADMIN', 'ADMIN', 'PURCHASE_OFFICER', 'ACCOUNTS_MANAGER', 'ACCOUNTS_OFFICER')
  AND p."key" IN (
    'lc.view', 'lc.create', 'lc.edit', 'lc.cost.enter', 'lc.cost.edit',
    'lc.cost.allocate', 'lc.finalize', 'lc.finalize.reopen', 'lc.reports.view', 'lc.configure'
  )
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "allowed" = true;
