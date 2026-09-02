WITH permission_seed("key", "resource", "action") AS (
  VALUES
    ('hr.leave.view', 'leave', 'view'),
    ('hr.leave.manage', 'leave', 'manage'),
    ('hr.leave.approve', 'leave', 'approve')
)
INSERT INTO "Permission" ("id", "key", "moduleKey", "resource", "action", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."key", 'hr', p."resource", p."action", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM permission_seed p
ON CONFLICT ("key") DO NOTHING;

-- Same backfill reasoning as 20260822113930_seed_hr_permissions: existing
-- tenants were onboarded before these permissions existed, so the normal
-- onboarding-time grant never ran for them.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "allowed")
SELECT gen_random_uuid()::text, r."id", p."id", true
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" IN ('OWNER', 'SUPER_ADMIN', 'ADMIN', 'HR_MANAGER')
  AND p."key" IN ('hr.leave.view', 'hr.leave.manage', 'hr.leave.approve')
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "allowed" = true;
