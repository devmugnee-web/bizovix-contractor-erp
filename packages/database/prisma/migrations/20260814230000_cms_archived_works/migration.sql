ALTER TABLE "cms_works" ADD COLUMN "completionDate" TIMESTAMP(3);

CREATE INDEX "cms_works_organizationId_status_completionDate_idx"
ON "cms_works"("organizationId", "status", "completionDate");

INSERT INTO "cms_works" (
  "id", "organizationId", "organizationMasterId", "workName", "workCategory", "contractValue",
  "status", "startDate", "expectedCompletionDate", "completionDate", "createdAt", "updatedAt"
)
SELECT seed.id, org.id, master.id, seed.work_name, seed.category, seed.value,
  'ARCHIVED'::"CmsWorkStatus", seed.completed_at - INTERVAL '9 months', seed.completed_at,
  seed.completed_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" org
CROSS JOIN (VALUES
  ('seed-cms-archived-01', 'DPHE', 'Supply of LED Display at Patuakhali', 'LED Display', 12500000::numeric, '2024-06-12'::timestamp),
  ('seed-cms-archived-02', 'LGED', 'Electrical Work at Barisal Office', 'Electrical', 8750000::numeric, '2024-05-28'::timestamp),
  ('seed-cms-archived-03', 'BTV', 'ICT Equipment Supply at BTV', 'ICT', 6200000::numeric, '2024-04-15'::timestamp),
  ('seed-cms-archived-04', 'SREDA', 'Solar System at Rajshahi', 'Solar System', 9800000::numeric, '2024-03-30'::timestamp),
  ('seed-cms-archived-05', 'BKSP', 'Supply of PA System at BKSP', 'PA System', 4500000::numeric, '2024-03-18'::timestamp),
  ('seed-cms-archived-06', 'Mymensingh PS', 'LED Display for Mymensingh PS', 'LED Display', 7650000::numeric, '2024-02-05'::timestamp),
  ('seed-cms-archived-07', 'BTV', 'Digital Studio Setup at BTV', 'ICT', 11200000::numeric, '2024-01-20'::timestamp),
  ('seed-cms-archived-08', 'Marine Academy', 'Lighting Work at Marine Academy', 'Electrical', 5300000::numeric, '2024-01-10'::timestamp),
  ('seed-cms-archived-09', 'BUP', 'Infrastructure Work at BUP', 'Civil Work', 9750000::numeric, '2023-12-28'::timestamp),
  ('seed-cms-archived-10', 'BFRI', 'Equipment Supply at BFRI', 'Equipment Supply', 6900000::numeric, '2023-12-15'::timestamp),
  ('seed-cms-archived-11', 'Dewanganj TSC', 'LED Display at Dewanganj TSC', 'LED Display', 5450000::numeric, '2023-11-30'::timestamp),
  ('seed-cms-archived-12', 'DPHE', 'IT & Networking at DPHE HQ', 'ICT', 9000000::numeric, '2023-11-20'::timestamp),
  ('seed-cms-archived-13', 'LGED', 'District Road Improvement Package', 'Civil Work', 80000000::numeric, '2023-10-31'::timestamp),
  ('seed-cms-archived-14', 'DPHE', 'Municipal Water Supply Package', 'Equipment Supply', 85000000::numeric, '2023-10-12'::timestamp),
  ('seed-cms-archived-15', 'BTV', 'Broadcast Automation Upgrade', 'ICT', 90000000::numeric, '2023-09-25'::timestamp),
  ('seed-cms-archived-16', 'SREDA', 'Regional Solar Mini Grid', 'Solar System', 95000000::numeric, '2023-09-10'::timestamp),
  ('seed-cms-archived-17', 'BKSP', 'Sports Complex PA Modernization', 'PA System', 88000000::numeric, '2023-08-22'::timestamp),
  ('seed-cms-archived-18', 'Mymensingh PS', 'Command Center Electrical Works', 'Electrical', 92000000::numeric, '2023-08-05'::timestamp),
  ('seed-cms-archived-19', 'Marine Academy', 'Marine Simulator Infrastructure', 'Equipment Supply', 100000000::numeric, '2023-07-19'::timestamp),
  ('seed-cms-archived-20', 'BUP', 'Campus Network Expansion', 'ICT', 86000000::numeric, '2023-06-30'::timestamp),
  ('seed-cms-archived-21', 'BFRI', 'Research Laboratory Modernization', 'Equipment Supply', 91000000::numeric, '2023-06-14'::timestamp),
  ('seed-cms-archived-22', 'Dewanganj TSC', 'Technical Lab Development', 'Civil Work', 89000000::numeric, '2023-05-26'::timestamp),
  ('seed-cms-archived-23', 'DPHE', 'Coastal Water Treatment System', 'Equipment Supply', 94000000::numeric, '2023-05-08'::timestamp),
  ('seed-cms-archived-24', 'LGED', 'Urban Street Lighting Package', 'Electrical', 87000000::numeric, '2023-04-20'::timestamp),
  ('seed-cms-archived-25', 'BTV', 'Digital Transmission Expansion', 'ICT', 96000000::numeric, '2023-04-02'::timestamp),
  ('seed-cms-archived-26', 'SREDA', 'Government Rooftop Solar Package', 'Solar System', 98000000::numeric, '2023-03-16'::timestamp),
  ('seed-cms-archived-27', 'BKSP', 'National Sports Facility Upgrade', 'Civil Work', 99000000::numeric, '2023-02-28'::timestamp),
  ('seed-cms-archived-28', 'BUP', 'Academic Complex Technology Package', 'ICT', 100800000::numeric, '2023-02-10'::timestamp)
) AS seed(id, master_name, work_name, category, value, completed_at)
JOIN "organization_masters" master
  ON master."organizationId" = org.id AND master."shortName" = seed.master_name
WHERE org.id = 'seed-org-bizovix'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
  ('perm-cms-work-export', 'cms.work.export', 'cms.work', 'Export CMS works'),
  ('perm-cms-work-restore', 'cms.work.restore', 'cms.work', 'Restore archived CMS works')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp-' || role.id || '-' || permission.id, role.id, permission.id
FROM "roles" role
JOIN "permissions" permission ON permission."key" IN ('cms.work.export', 'cms.work.restore')
WHERE role."isSystem" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
