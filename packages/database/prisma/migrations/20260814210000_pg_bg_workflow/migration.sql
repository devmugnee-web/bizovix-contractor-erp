CREATE TYPE "PgBgWorkflowStatus" AS ENUM ('DRAFT', 'NOA_ACCEPTED', 'NOA_REJECTED', 'FINALIZED');

CREATE TABLE "organization_contacts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "organizationMasterId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "designation" TEXT NOT NULL,
  "mobile" TEXT NOT NULL,
  "email" TEXT,
  "address" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pg_bg_workflows" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "documentPurchaseId" TEXT NOT NULL,
  "organizationMasterId" TEXT NOT NULL,
  "contactId" TEXT,
  "tenderSecurityAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "noaDate" TIMESTAMP(3),
  "noaAmount" DECIMAL(18,2),
  "workCategory" TEXT,
  "acceptNoa" BOOLEAN,
  "pgBgRequired" BOOLEAN,
  "status" "PgBgWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
  "currentStep" INTEGER NOT NULL DEFAULT 1,
  "acceptedAt" TIMESTAMP(3),
  "acceptedById" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pg_bg_workflows_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "performance_guarantees" ADD COLUMN "pgBgWorkflowId" TEXT;

CREATE UNIQUE INDEX "organization_contacts_organizationId_organizationMasterId_mobile_key" ON "organization_contacts"("organizationId", "organizationMasterId", "mobile");
CREATE INDEX "organization_contacts_organizationId_organizationMasterId_idx" ON "organization_contacts"("organizationId", "organizationMasterId");
CREATE UNIQUE INDEX "pg_bg_workflows_documentPurchaseId_key" ON "pg_bg_workflows"("documentPurchaseId");
CREATE INDEX "pg_bg_workflows_organizationId_status_idx" ON "pg_bg_workflows"("organizationId", "status");
CREATE UNIQUE INDEX "performance_guarantees_pgBgWorkflowId_key" ON "performance_guarantees"("pgBgWorkflowId");

ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES "organization_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pg_bg_workflows" ADD CONSTRAINT "pg_bg_workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pg_bg_workflows" ADD CONSTRAINT "pg_bg_workflows_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES "document_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pg_bg_workflows" ADD CONSTRAINT "pg_bg_workflows_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES "organization_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pg_bg_workflows" ADD CONSTRAINT "pg_bg_workflows_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "organization_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performance_guarantees" ADD CONSTRAINT "performance_guarantees_pgBgWorkflowId_fkey" FOREIGN KEY ("pgBgWorkflowId") REFERENCES "pg_bg_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
  ('perm-pg-bg-read', 'pg_bg.read', 'pg_bg', 'View PG/BG workflows'),
  ('perm-pg-bg-create', 'pg_bg.create', 'pg_bg', 'Create PG/BG workflows'),
  ('perm-pg-bg-update', 'pg_bg.update', 'pg_bg', 'Update PG/BG workflows'),
  ('perm-pg-bg-accept-noa', 'pg_bg.accept_noa', 'pg_bg', 'Accept or reject NOA'),
  ('perm-pg-bg-save-draft', 'pg_bg.save_draft', 'pg_bg', 'Save PG/BG workflow drafts')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp-' || role.id || '-' || permission.id, role.id, permission.id
FROM "roles" role
JOIN "permissions" permission ON permission."key" LIKE 'pg_bg.%'
WHERE role."isSystem" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
