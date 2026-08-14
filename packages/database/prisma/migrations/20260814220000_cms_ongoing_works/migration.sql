CREATE TYPE "CmsWorkStatus" AS ENUM ('ONGOING', 'COMPLETED', 'ARCHIVED', 'CANCELLED');

CREATE TABLE "cms_works" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tenderId" TEXT,
  "documentPurchaseId" TEXT,
  "pgBgWorkflowId" TEXT,
  "organizationMasterId" TEXT NOT NULL,
  "workName" TEXT NOT NULL,
  "workCategory" TEXT NOT NULL,
  "contractValue" DECIMAL(18,2) NOT NULL,
  "status" "CmsWorkStatus" NOT NULL DEFAULT 'ONGOING',
  "startDate" TIMESTAMP(3),
  "expectedCompletionDate" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cms_works_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cms_works_documentPurchaseId_key" ON "cms_works"("documentPurchaseId");
CREATE UNIQUE INDEX "cms_works_pgBgWorkflowId_key" ON "cms_works"("pgBgWorkflowId");
CREATE INDEX "cms_works_organizationId_status_idx" ON "cms_works"("organizationId", "status");
CREATE INDEX "cms_works_organizationId_organizationMasterId_idx" ON "cms_works"("organizationId", "organizationMasterId");

ALTER TABLE "cms_works" ADD CONSTRAINT "cms_works_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cms_works" ADD CONSTRAINT "cms_works_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cms_works" ADD CONSTRAINT "cms_works_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES "document_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cms_works" ADD CONSTRAINT "cms_works_pgBgWorkflowId_fkey" FOREIGN KEY ("pgBgWorkflowId") REFERENCES "pg_bg_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cms_works" ADD CONSTRAINT "cms_works_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES "organization_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "organization_masters" ("id", "organizationId", "shortName", "fullName", "createdAt", "updatedAt")
SELECT seed.id, org.id, seed.short_name, seed.full_name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" org
CROSS JOIN (VALUES
  ('seed-master-mymensingh-ps', 'Mymensingh PS', 'Mymensingh Police Super Office'),
  ('seed-master-marine-academy', 'Marine Academy', 'Bangladesh Marine Academy'),
  ('seed-master-bup', 'BUP', 'Bangladesh University of Professionals'),
  ('seed-master-bfri', 'BFRI', 'Bangladesh Fisheries Research Institute'),
  ('seed-master-dewanganj-tsc', 'Dewanganj TSC', 'Dewanganj Technical School and College')
) AS seed(id, short_name, full_name)
WHERE org.id = 'seed-org-bizovix'
ON CONFLICT ("organizationId", "shortName") DO NOTHING;

INSERT INTO "cms_works" (
  "id", "organizationId", "organizationMasterId", "workName", "workCategory", "contractValue",
  "status", "startDate", "expectedCompletionDate", "createdAt", "updatedAt"
)
SELECT seed.id, org.id, master.id, seed.work_name, seed.category, seed.value,
  'ONGOING'::"CmsWorkStatus", '2024-05-16'::timestamp, '2025-05-15'::timestamp, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" org
CROSS JOIN (VALUES
  ('seed-cms-work-01', 'DPHE', 'Supply of LED Display at Patuakhali', 'LED Display', 12500000::numeric),
  ('seed-cms-work-02', 'LGED', 'Electrical Work at Barisal Office', 'Electrical', 8750000::numeric),
  ('seed-cms-work-03', 'BTV', 'ICT Equipment Supply at BTV', 'ICT', 6200000::numeric),
  ('seed-cms-work-04', 'SREDA', 'Solar System at Rajshahi', 'Solar System', 9800000::numeric),
  ('seed-cms-work-05', 'BKSP', 'Supply of PA System at BKSP', 'PA System', 4500000::numeric),
  ('seed-cms-work-06', 'Mymensingh PS', 'LED Display for Mymensingh PS', 'LED Display', 7650000::numeric),
  ('seed-cms-work-07', 'BTV', 'Digital Studio Setup at BTV', 'ICT', 11200000::numeric),
  ('seed-cms-work-08', 'Marine Academy', 'Lighting Work at Marine Academy', 'Electrical', 5300000::numeric),
  ('seed-cms-work-09', 'BUP', 'Infrastructure Work at BUP', 'Civil Work', 9750000::numeric),
  ('seed-cms-work-10', 'BFRI', 'Equipment Supply at BFRI', 'Equipment Supply', 6900000::numeric),
  ('seed-cms-work-11', 'Dewanganj TSC', 'LED Display at Dewanganj TSC', 'LED Display', 5450000::numeric),
  ('seed-cms-work-12', 'DPHE', 'IT & Networking at DPHE HQ', 'ICT', 9000000::numeric)
) AS seed(id, master_name, work_name, category, value)
JOIN "organization_masters" master ON master."organizationId" = org.id AND master."shortName" = seed.master_name
WHERE org.id = 'seed-org-bizovix'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
  ('perm-cms-work-read', 'cms.work.read', 'cms.work', 'View CMS works'),
  ('perm-cms-work-create', 'cms.work.create', 'cms.work', 'Create CMS works'),
  ('perm-cms-work-update', 'cms.work.update', 'cms.work', 'Update CMS works'),
  ('perm-cms-work-archive', 'cms.work.archive', 'cms.work', 'Archive CMS works')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp-' || role.id || '-' || permission.id, role.id, permission.id
FROM "roles" role
JOIN "permissions" permission ON permission."key" LIKE 'cms.work.%'
WHERE role."isSystem" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
