WITH permission_seed("key", "resource", "action") AS (
  VALUES
    ('manufacturing.view', 'manufacturing', 'view'),
    ('manufacturing.configure', 'settings', 'configure'),
    ('manufacturing.master.manage', 'master', 'manage'),
    ('manufacturing.plan.manage', 'production-plan', 'manage'),
    ('manufacturing.order.create', 'production-order', 'create'),
    ('manufacturing.order.approve', 'production-order', 'approve'),
    ('manufacturing.material.reserve', 'material-reservation', 'create'),
    ('manufacturing.material.issue', 'material-issue', 'post'),
    ('manufacturing.production.execute', 'production-execution', 'post'),
    ('manufacturing.quality.manage', 'quality-master', 'manage'),
    ('manufacturing.quality.inspect', 'quality-inspection', 'post'),
    ('manufacturing.quality.release', 'quality-release', 'approve'),
    ('manufacturing.packaging.execute', 'packaging', 'post'),
    ('manufacturing.cost.post', 'production-cost', 'post'),
    ('manufacturing.close', 'production-order', 'close'),
    ('manufacturing.reports.view', 'manufacturing-report', 'view'),
    ('manufacturing.audit.review', 'workflow-review', 'review')
)
INSERT INTO "Permission" ("id", "key", "moduleKey", "resource", "action", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."key", 'manufacturing', p."resource", p."action", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM permission_seed p
ON CONFLICT ("key") DO NOTHING;

-- Backfill least-privilege access for existing workspaces. Owners and admins
-- receive the full module; operational roles receive only their own actions.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "allowed")
SELECT gen_random_uuid()::text, r."id", p."id", true
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."moduleKey" = 'manufacturing'
  AND (
    r."code" IN ('OWNER', 'SUPER_ADMIN', 'ADMIN')
    OR (
      r."code" IN ('INVENTORY_MANAGER', 'STORE_KEEPER')
      AND p."key" IN (
        'manufacturing.view', 'manufacturing.material.reserve',
        'manufacturing.material.issue', 'manufacturing.production.execute',
        'manufacturing.packaging.execute', 'manufacturing.reports.view'
      )
    )
    OR (
      r."code" = 'ACCOUNTS_MANAGER'
      AND p."key" IN (
        'manufacturing.view', 'manufacturing.cost.post',
        'manufacturing.close', 'manufacturing.reports.view',
        'manufacturing.audit.review'
      )
    )
    OR (
      r."code" = 'ACCOUNTS_OFFICER'
      AND p."key" IN (
        'manufacturing.view', 'manufacturing.cost.post',
        'manufacturing.reports.view'
      )
    )
    OR (
      r."code" IN ('QUALITY_MANAGER', 'QA_MANAGER', 'QC_MANAGER', 'QUALITY_OFFICER', 'QA_OFFICER', 'QC_OFFICER')
      AND p."key" IN (
        'manufacturing.view', 'manufacturing.quality.manage',
        'manufacturing.quality.inspect', 'manufacturing.quality.release',
        'manufacturing.audit.review', 'manufacturing.reports.view'
      )
    )
  )
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "allowed" = true;
