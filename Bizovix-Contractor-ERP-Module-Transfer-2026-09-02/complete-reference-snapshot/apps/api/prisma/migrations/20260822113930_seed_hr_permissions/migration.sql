WITH permission_seed("key", "resource", "action") AS (
  VALUES
    ('hr.employee.view', 'employee', 'view'),
    ('hr.employee.create', 'employee', 'create'),
    ('hr.employee.update', 'employee', 'update'),
    ('hr.employee.delete', 'employee', 'delete'),
    ('hr.payroll.manage', 'payroll', 'manage'),
    ('hr.payroll.approve', 'payroll', 'approve')
)
INSERT INTO "Permission" ("id", "key", "moduleKey", "resource", "action", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."key", 'hr', p."resource", p."action", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM permission_seed p
ON CONFLICT ("key") DO NOTHING;

-- Every existing tenant's Owner/Super Admin already holds every other
-- permission (see onboarding.service.ts); grant them these new HR ones too so
-- the Employees/Payroll screens don't 403 for workspaces onboarded before
-- this module existed. HR Manager gets the same set going forward from
-- onboarding.service.ts, but past HR Manager role rows need the same backfill.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "allowed")
SELECT gen_random_uuid()::text, r."id", p."id", true
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" IN ('OWNER', 'SUPER_ADMIN', 'ADMIN', 'HR_MANAGER')
  AND p."key" IN ('hr.employee.view', 'hr.employee.create', 'hr.employee.update', 'hr.employee.delete', 'hr.payroll.manage', 'hr.payroll.approve')
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "allowed" = true;
