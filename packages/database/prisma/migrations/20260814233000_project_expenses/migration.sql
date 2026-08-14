ALTER TABLE "expenses"
  ADD COLUMN "workId" TEXT,
  ADD COLUMN "expenseHeadId" TEXT,
  ADD COLUMN "expenseById" TEXT,
  ADD COLUMN "paidFromAccountId" TEXT;

CREATE TABLE "expense_heads" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "expense_heads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_heads_organizationId_name_key" ON "expense_heads"("organizationId", "name");
CREATE INDEX "expenses_organizationId_workId_expenseDate_idx" ON "expenses"("organizationId", "workId", "expenseDate");
CREATE INDEX "expenses_organizationId_expenseHeadId_idx" ON "expenses"("organizationId", "expenseHeadId");

ALTER TABLE "expense_heads" ADD CONSTRAINT "expense_heads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_expenseHeadId_fkey" FOREIGN KEY ("expenseHeadId") REFERENCES "expense_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_expenseById_fkey" FOREIGN KEY ("expenseById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paidFromAccountId_fkey" FOREIGN KEY ("paidFromAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "expense_heads" ("id", "organizationId", "name", "createdAt", "updatedAt") VALUES
  ('seed-expense-head-material', 'seed-org-bizovix', 'Material Purchase', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-expense-head-transport', 'seed-org-bizovix', 'Transport', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-expense-head-labour', 'seed-org-bizovix', 'Installation Labour', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-expense-head-accommodation', 'seed-org-bizovix', 'Accommodation', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-expense-head-food', 'seed-org-bizovix', 'Food & Refreshment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("organizationId", "name") DO NOTHING;

INSERT INTO "users" ("id", "email", "passwordHash", "name", "isActive", "createdAt", "updatedAt") VALUES
  ('seed-user-shajib', 'shajib.demo@bizovix.com', '$2b$10$disabledProjectExpenseDemoAccount00000000000000000000', 'Shajib (CEO)', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-user-galib', 'galib.demo@bizovix.com', '$2b$10$disabledProjectExpenseDemoAccount00000000000000000000', 'Galib (Coordinator)', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-user-rokon', 'rokon.demo@bizovix.com', '$2b$10$disabledProjectExpenseDemoAccount00000000000000000000', 'Engineer Rokon', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "organization_users" ("id", "organizationId", "userId", "roleId", "isDefault", "createdAt")
SELECT 'seed-org-user-' || person.id, 'seed-org-bizovix', person.id, role.id, true, CURRENT_TIMESTAMP
FROM "users" person
JOIN "roles" role ON role."organizationId" = 'seed-org-bizovix' AND role."name" = 'Admin'
WHERE person.id IN ('seed-user-shajib', 'seed-user-galib', 'seed-user-rokon')
ON CONFLICT ("organizationId", "userId") DO NOTHING;

INSERT INTO "bank_accounts" ("id", "organizationId", "accountName", "accountType", "bankName", "accountNumber", "currentBalance", "createdAt", "updatedAt") VALUES
  ('seed-bank-islami-01', 'seed-org-bizovix', 'Islami Bank - 01', 'BANK'::"AccountType", 'Islami Bank Bangladesh PLC', '120100022345', 250000000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed-bank-dutch-02', 'seed-org-bizovix', 'Dutch Bangla - 02', 'BANK'::"AccountType", 'Dutch-Bangla Bank PLC', '1012000045781', 180000000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "expenses" (
  "id", "organizationId", "workId", "expenseHeadId", "expenseById", "paidFromAccountId",
  "category", "description", "amount", "expenseDate", "status", "createdById", "createdAt", "updatedAt"
)
SELECT seed.id, 'seed-org-bizovix', 'seed-cms-work-01', head.id, person.id, account.id,
  head.name, seed.description, seed.amount, seed.expense_date, 'APPROVED'::"ExpenseStatus", admin.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('seed-project-expense-01', 'Material Purchase', 'Shajib (CEO)', 'Islami Bank - 01', 85000::numeric, '2024-05-12'::timestamp, 'LED Module purchase for main screen'),
  ('seed-project-expense-02', 'Transport', 'Galib (Coordinator)', 'Cash', 25000::numeric, '2024-05-10'::timestamp, 'Transport for Delivery'),
  ('seed-project-expense-03', 'Installation Labour', 'Engineer Rokon', 'Dutch Bangla - 02', 45000::numeric, '2024-05-08'::timestamp, 'Labour cost for installation'),
  ('seed-project-expense-04', 'Accommodation', 'Galib (Coordinator)', 'Cash', 15500::numeric, '2024-05-07'::timestamp, 'Team accommodation'),
  ('seed-project-expense-05', 'Food & Refreshment', 'Shajib (CEO)', 'Cash', 8750::numeric, '2024-05-06'::timestamp, 'Food for installation team'),
  ('seed-project-expense-06', 'Material Purchase', 'Engineer Rokon', 'Islami Bank - 01', 62500::numeric, '2024-05-05'::timestamp, 'Display controller and spare modules'),
  ('seed-project-expense-07', 'Transport', 'Galib (Coordinator)', 'Cash', 12000::numeric, '2024-05-04'::timestamp, 'Local equipment transport'),
  ('seed-project-expense-08', 'Installation Labour', 'Engineer Rokon', 'Dutch Bangla - 02', 30000::numeric, '2024-05-03'::timestamp, 'Electrical installation support'),
  ('seed-project-expense-09', 'Food & Refreshment', 'Shajib (CEO)', 'Cash', 6500::numeric, '2024-05-02'::timestamp, 'Site team refreshments'),
  ('seed-project-expense-10', 'Material Purchase', 'Shajib (CEO)', 'Islami Bank - 01', 48000::numeric, '2024-05-01'::timestamp, 'Cabling and mounting accessories'),
  ('seed-project-expense-11', 'Accommodation', 'Galib (Coordinator)', 'Cash', 18000::numeric, '2024-04-30'::timestamp, 'Installation team lodging'),
  ('seed-project-expense-12', 'Transport', 'Galib (Coordinator)', 'Cash', 9500::numeric, '2024-04-29'::timestamp, 'Site inspection transport'),
  ('seed-project-expense-13', 'Installation Labour', 'Engineer Rokon', 'Dutch Bangla - 02', 27500::numeric, '2024-04-28'::timestamp, 'Structure fitting labour'),
  ('seed-project-expense-14', 'Material Purchase', 'Shajib (CEO)', 'Islami Bank - 01', 72500::numeric, '2024-04-27'::timestamp, 'Power supply units'),
  ('seed-project-expense-15', 'Food & Refreshment', 'Galib (Coordinator)', 'Cash', 7200::numeric, '2024-04-26'::timestamp, 'Crew meals'),
  ('seed-project-expense-16', 'Transport', 'Engineer Rokon', 'Cash', 11000::numeric, '2024-04-25'::timestamp, 'Technical team transport'),
  ('seed-project-expense-17', 'Accommodation', 'Galib (Coordinator)', 'Cash', 16000::numeric, '2024-04-24'::timestamp, 'Engineer accommodation'),
  ('seed-project-expense-18', 'Material Purchase', 'Shajib (CEO)', 'Islami Bank - 01', 39500::numeric, '2024-04-23'::timestamp, 'Protective panels and connectors')
) AS seed(id, head_name, person_name, account_name, amount, expense_date, description)
JOIN "expense_heads" head ON head."organizationId" = 'seed-org-bizovix' AND head."name" = seed.head_name
JOIN "users" person ON person."name" = seed.person_name
JOIN "bank_accounts" account ON account."organizationId" = 'seed-org-bizovix' AND account."accountName" = seed.account_name
JOIN "users" admin ON admin."email" = 'admin@bizovix.com'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
  ('perm-project-expense-read', 'project_expense.read', 'project_expense', 'View project expenses'),
  ('perm-project-expense-create', 'project_expense.create', 'project_expense', 'Create project expenses'),
  ('perm-project-expense-update', 'project_expense.update', 'project_expense', 'Update project expenses'),
  ('perm-project-expense-delete', 'project_expense.delete', 'project_expense', 'Delete project expenses'),
  ('perm-project-expense-export', 'project_expense.export', 'project_expense', 'Export project expenses')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp-' || role.id || '-' || permission.id, role.id, permission.id
FROM "roles" role
JOIN "permissions" permission ON permission."key" LIKE 'project_expense.%'
WHERE role."isSystem" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
