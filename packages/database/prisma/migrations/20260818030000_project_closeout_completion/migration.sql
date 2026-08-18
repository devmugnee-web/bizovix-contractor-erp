ALTER TABLE "performance_guarantees"
  ADD COLUMN "releaseRequestedById" TEXT,
  ADD COLUMN "releasedById" TEXT;

ALTER TABLE "cms_works"
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "closedById" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;

ALTER TABLE "defect_liability_periods"
  ADD COLUMN "originalStartDate" TIMESTAMP(3),
  ADD COLUMN "originalEndDate" TIMESTAMP(3);

UPDATE "defect_liability_periods"
SET "originalStartDate" = "startDate", "originalEndDate" = "endDate"
WHERE "originalStartDate" IS NULL OR "originalEndDate" IS NULL;

ALTER TABLE "dlp_defects"
  ADD COLUMN "verifiedDate" TIMESTAMP(3),
  ADD COLUMN "closedDate" TIMESTAMP(3),
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'MEDIUM';

CREATE INDEX "cms_works_organizationId_closedAt_idx" ON "cms_works"("organizationId", "closedAt");
CREATE INDEX "dlp_defects_organizationId_priority_status_idx" ON "dlp_defects"("organizationId", "priority", "status");

INSERT INTO "permissions" ("id", "key", "group", "description")
SELECT 'perm-' || replace(permission_key, '.', '-'), permission_key, split_part(permission_key, '.', 1), permission_key
FROM unnest(ARRAY[
  'completion_certificate.update', 'completion_certificate.submit',
  'defect.create', 'defect.update', 'defect.verify',
  'retention_release.read', 'retention_release.create', 'retention_release.approve',
  'handover.create', 'handover.complete', 'project_close.archive'
]) AS permission_key
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp-' || role.id || '-' || permission.id, role.id, permission.id
FROM "roles" role
JOIN "permissions" permission ON permission."key" IN (
  'completion_certificate.update', 'completion_certificate.submit',
  'defect.create', 'defect.update', 'defect.verify',
  'retention_release.read', 'retention_release.create', 'retention_release.approve',
  'handover.create', 'handover.complete', 'project_close.archive'
)
WHERE role."isSystem" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
