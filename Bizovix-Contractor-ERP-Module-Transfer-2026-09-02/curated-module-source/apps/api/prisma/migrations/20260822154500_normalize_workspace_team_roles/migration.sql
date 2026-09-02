-- Rename the legacy Sync & Share labels without replacing role assignments.
UPDATE "Role"
SET "name" = CASE
  WHEN "name" = 'Admin' THEN 'Manager'
  WHEN "name" = 'Biller' THEN 'Staff'
  WHEN "name" = 'Viewer' THEN 'Auditor'
  ELSE "name"
END
WHERE "code" LIKE 'sync\_share\_%' ESCAPE '\'
  AND "name" IN ('Admin', 'Biller', 'Viewer');

-- Team managers operate the business; company/user administration remains
-- reserved for the immutable tenant Owner membership.
UPDATE "RolePermission" AS role_permission
SET "allowed" = false
FROM "Role" AS role, "Permission" AS permission
WHERE role_permission."roleId" = role."id"
  AND role_permission."permissionId" = permission."id"
  AND role."code" LIKE 'sync\_share\_%' ESCAPE '\'
  AND permission."key" = 'workspace.manage';

-- Staff and auditors must never inherit posting/deletion authority from the
-- old UI's `limited edit` interpretation. Their existing row-level matrix is
-- retained; only these high-risk API permissions are revoked.
UPDATE "RolePermission" AS role_permission
SET "allowed" = false
FROM "Role" AS role, "Permission" AS permission
WHERE role_permission."roleId" = role."id"
  AND role_permission."permissionId" = permission."id"
  AND role."code" LIKE 'sync\_share\_%' ESCAPE '\'
  AND role."name" IN ('Staff', 'Auditor')
  AND permission."key" IN ('accounting.voucher.post', 'accounting.voucher.delete');
