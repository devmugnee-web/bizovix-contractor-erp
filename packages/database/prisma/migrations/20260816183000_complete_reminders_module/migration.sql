ALTER TABLE "reminders"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'UPCOMING',
  ADD COLUMN "dueTime" TEXT,
  ADD COLUMN "assignedToUserId" TEXT,
  ADD COLUMN "assignedToName" TEXT,
  ADD COLUMN "sourceModule" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "relatedEntityName" TEXT,
  ADD COLUMN "referenceNo" TEXT,
  ADD COLUMN "organizationMasterId" TEXT,
  ADD COLUMN "organizationName" TEXT,
  ADD COLUMN "notificationBefore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "repeatType" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "repeatConfig" JSONB,
  ADD COLUMN "remarks" TEXT,
  ADD COLUMN "snoozedUntil" TIMESTAMP(3),
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "createdByName" TEXT,
  ADD COLUMN "completedById" TEXT,
  ADD COLUMN "completedByName" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

UPDATE "reminders" SET
  "description" = "subtitle",
  "status" = CASE WHEN "isResolved" THEN 'COMPLETED' WHEN "dueDate" < CURRENT_DATE THEN 'OVERDUE' WHEN "dueDate" < CURRENT_DATE + INTERVAL '1 day' THEN 'DUE_TODAY' ELSE 'UPCOMING' END,
  "sourceModule" = COALESCE(UPPER("relatedEntityType"), 'MANUAL'),
  "sourceType" = "relatedEntityType",
  "sourceId" = "relatedEntityId";

CREATE UNIQUE INDEX "reminders_organizationId_sourceModule_sourceId_type_dueDate_key" ON "reminders"("organizationId", "sourceModule", "sourceId", "type", "dueDate");
CREATE INDEX "reminders_organizationId_status_dueDate_idx" ON "reminders"("organizationId", "status", "dueDate");
CREATE INDEX "reminders_organizationId_assignedToUserId_dueDate_idx" ON "reminders"("organizationId", "assignedToUserId", "dueDate");

INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
 ('perm-reminders-read','reminders.read','reminders','View reminders'),
 ('perm-reminders-create','reminders.create','reminders','Create reminders'),
 ('perm-reminders-update','reminders.update','reminders','Update and snooze reminders'),
 ('perm-reminders-complete','reminders.complete','reminders','Complete reminders'),
 ('perm-reminders-cancel','reminders.cancel','reminders','Cancel reminders')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp-' || md5(r."id" || p."id"), r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."isSystem" = true AND p."key" LIKE 'reminders.%'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
