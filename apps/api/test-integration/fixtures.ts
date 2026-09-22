import bcrypt from "bcryptjs";
import type { INestApplication } from "@nestjs/common";
import { PERMISSIONS } from "@bizovix/types";
import { AccountingService } from "../src/modules/accounting/accounting.service";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { ProjectExpensesService } from "../src/modules/project-expenses/project-expenses.service";

export async function assertIsolatedTestDatabase(prisma: PrismaService) {
  const [row] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  if (!row?.name.toLowerCase().includes("test")) throw new Error(`Refusing cleanup outside a test database: ${row?.name}`);
  const expected = process.env.BIZOVIX_ISOLATED_DATABASE_NAME;
  if (expected && (!/^bizovix_test_bootstrap_\d+_[a-f0-9]{6}$/.test(expected) || row.name !== expected)) throw new Error("Refusing fixture cleanup outside the exact newly created isolated database");
}

export async function resetTestDatabase(prisma: PrismaService) {
  await assertIsolatedTestDatabase(prisma);
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE table_list text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
        INTO table_list
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
      IF table_list IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `);
}

/** Prepare posting fixtures through the same chart and expense-head validation as the application. */
export async function mapExpenseHeadToPostingLedger(
  app: INestApplication,
  organizationId: string,
  userId: string,
  expenseHeadId: string,
  systemKey: "PROJECT_EXPENSE" | "GENERAL_EXPENSE" = "PROJECT_EXPENSE",
) {
  const prisma = app.get(PrismaService);
  await app.get(AccountingService).ensureChart(organizationId);
  const head = await prisma.expenseHead.findFirstOrThrow({ where: { id: expenseHeadId, organizationId } });
  const ledger = await prisma.ledgerAccount.findFirstOrThrow({
    where: { organizationId, systemKey, accountType: "EXPENSE", isActive: true, isControlAccount: false },
  });
  return app.get(ProjectExpensesService).updateHead(organizationId, userId, head.id, {
    name: head.name,
    nature: head.nature,
    budgetCategory: head.budgetCategory ?? undefined,
    isActive: head.isActive,
    ledgerAccountId: ledger.id,
  });
}

export async function createOrganizationFixture(
  prisma: PrismaService,
  suffix: string,
  permissionKeys: readonly string[] = PERMISSIONS,
) {
  const organization = await prisma.organization.create({ data: { name: `Test Organization ${suffix}`, shortName: `T${suffix}` } });
  const role = await prisma.role.create({ data: { organizationId: organization.id, name: `Role ${suffix}`, isSystem: true } });
  const permissions = await Promise.all(permissionKeys.map((key) => prisma.permission.upsert({ where: { key }, update: {}, create: { key, group: key.split(".")[0] ?? "test" } })));
  if (permissions.length) await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
  const password = `Test-${suffix}-Password!`;
  const user = await prisma.user.create({ data: { email: `test-${suffix.toLowerCase()}@bizovix.invalid`, name: `Test User ${suffix}`, passwordHash: await bcrypt.hash(password, 4) } });
  await prisma.organizationUser.create({ data: { organizationId: organization.id, userId: user.id, roleId: role.id, isDefault: true } });
  const master = await prisma.organizationMaster.create({ data: { organizationId: organization.id, shortName: `CLIENT-${suffix}`, fullName: `Client ${suffix}` } });
  const tenderBusinessId = `TEST-${suffix}`.trim().replace(/\s+/g, " ").toUpperCase();
  const tender = await prisma.tender.create({ data: { organizationId: organization.id, organizationMasterId: master.id, egpTenderId: tenderBusinessId, tenderIdNormalized: tenderBusinessId, workName: `Tender ${suffix}`, category: "Civil Works", contractValue: 10_000_000, status: "AWARDED", createdById: user.id } });
  const work = await prisma.cmsWork.create({ data: { organizationId: organization.id, tenderId: tender.id, organizationMasterId: master.id, workName: `Project ${suffix}`, workCategory: "Civil Works", contractValue: 10_000_000, status: "ONGOING", startDate: new Date("2026-01-01"), expectedCompletionDate: new Date("2026-12-31"), createdById: user.id } });
  const contract = await prisma.projectContract.create({ data: { organizationId: organization.id, tenderId: tender.id, cmsWorkId: work.id, organizationMasterId: master.id, contractNo: `CON-${suffix}`, issueDate: new Date("2026-01-01"), contractDate: new Date("2026-01-01"), originalContractValue: 10_000_000, currentContractValue: 10_000_000, commencementDate: new Date("2026-01-01"), originalCompletionDate: new Date("2026-12-31"), currentCompletionDate: new Date("2026-12-31"), retentionPct: 10, dlpDays: 365, status: "ACTIVE", createdById: user.id } });
  const bank = await prisma.bankAccount.create({ data: { organizationId: organization.id, accountName: `Main Bank ${suffix}`, accountType: "BANK", bankName: "Test Bank", accountNumber: `ACC-${suffix}`, openingBalance: 0, currentBalance: 0, currency: "BDT" } });
  const secondBank = await prisma.bankAccount.create({ data: { organizationId: organization.id, accountName: `Second Bank ${suffix}`, accountType: "BANK", bankName: "Test Bank", accountNumber: `ACC2-${suffix}`, openingBalance: 0, currentBalance: 0, currency: "BDT" } });
  const expenseHead = await prisma.expenseHead.create({ data: { organizationId: organization.id, name: `Materials ${suffix}` } });
  const boq = await prisma.boqItem.create({ data: { organizationId: organization.id, cmsWorkId: work.id, itemCode: `BOQ-${suffix}`, description: "Test BOQ", unit: "Nos", contractQty: 100, unitRate: 100_000, contractAmount: 10_000_000, originalQty: 100, originalRate: 100_000, originalAmount: 10_000_000, createdById: user.id } });
  return { organization, role, user, password, master, tender, work, contract, bank, secondBank, expenseHead, boq };
}

export async function createIdentityFixture(
  prisma: PrismaService,
  suffix: string,
  permissionKeys: readonly string[] = PERMISSIONS,
) {
  const organization = await prisma.organization.create({ data: { name: `Lifecycle Organization ${suffix}`, shortName: `L${suffix}` } });
  const role = await prisma.role.create({ data: { organizationId: organization.id, name: `Lifecycle Role ${suffix}`, isSystem: true } });
  const permissions = await Promise.all(permissionKeys.map((key) => prisma.permission.upsert({ where: { key }, update: {}, create: { key, group: key.split(".")[0] ?? "test" } })));
  if (permissions.length) await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
  const password = `Lifecycle-${suffix}-Password!`;
  const user = await prisma.user.create({ data: { email: `lifecycle-${suffix.toLowerCase()}@bizovix.invalid`, name: `Lifecycle User ${suffix}`, passwordHash: await bcrypt.hash(password, 4) } });
  await prisma.organizationUser.create({ data: { organizationId: organization.id, userId: user.id, roleId: role.id, isDefault: true } });
  const master = await prisma.organizationMaster.create({ data: { organizationId: organization.id, shortName: `LC-${suffix}`, fullName: `Lifecycle Client ${suffix}` } });
  const bank = await prisma.bankAccount.create({ data: { organizationId: organization.id, accountName: `Lifecycle Bank ${suffix}`, accountType: "BANK", bankName: "Test Bank", accountNumber: `LC-ACC-${suffix}`, openingBalance: 0, currentBalance: 0, currency: "BDT" } });
  return { organization, role, user, password, master, bank };
}
