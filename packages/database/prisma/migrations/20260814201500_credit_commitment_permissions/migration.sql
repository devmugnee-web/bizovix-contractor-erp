INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
  ('perm-credit-commitment-create', 'credit_commitment.create', 'credit_commitment', 'Create credit commitment charges'),
  ('perm-credit-commitment-read', 'credit_commitment.read', 'credit_commitment', 'View credit commitment charges'),
  ('perm-credit-commitment-update', 'credit_commitment.update', 'credit_commitment', 'Update credit commitment charges'),
  ('perm-credit-commitment-delete', 'credit_commitment.delete', 'credit_commitment', 'Delete credit commitment charges')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT
  'rp-' || role.id || '-' || permission.id,
  role.id,
  permission.id
FROM "roles" role
JOIN "permissions" permission ON permission."key" LIKE 'credit_commitment.%'
WHERE role."isSystem" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
