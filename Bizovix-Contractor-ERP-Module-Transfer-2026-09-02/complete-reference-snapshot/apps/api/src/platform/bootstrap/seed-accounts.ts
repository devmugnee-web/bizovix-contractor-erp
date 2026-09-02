import { accountCategorySeeds, accountGroupSeeds, systemAccountSeeds } from "./defaults.js";

// Deliberately loosely typed: this file is called with a plain PrismaClient (from
// prisma/seed.ts and one-off backfill scripts), a NestJS PrismaService, and a
// Prisma.TransactionClient (inside onboarding's $transaction callback) — three
// structurally-different-but-compatible-at-runtime types that TypeScript's
// contravariant method-parameter checking won't unify under one interface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AccountSeedingClient = any;

function formatSeedValue(value: unknown) {
  return value === null ? "null" : JSON.stringify(value);
}

function assertExactSeedRecord(
  label: string,
  code: string,
  record: Record<string, unknown>,
  expected: Record<string, unknown>,
) {
  const mismatches = Object.entries(expected)
    .filter(([field, value]) => record[field] !== value)
    .map(([field, value]) => `${field}=${formatSeedValue(record[field])} (expected ${formatSeedValue(value)})`);
  if (mismatches.length) {
    throw new Error(`${label} code ${code} conflicts with the protected seed: ${mismatches.join(", ")}`);
  }
}

/** Upserts the Section 6 AccountGroup seeds and returns a code -> id map. */
export async function seedAccountGroups(client: AccountSeedingClient, tenantId: string, companyId: string) {
  const accountGroupIdByCode = new Map<string, string>();

  for (const accountGroup of accountGroupSeeds) {
    const record = await client.accountGroup.upsert({
      where: { companyId_code: { companyId, code: accountGroup.code } },
      update: {},
      create: {
        tenantId,
        companyId,
        code: accountGroup.code,
        name: accountGroup.name,
        nature: accountGroup.nature,
      },
    });
    assertExactSeedRecord("Account Group", accountGroup.code, record, {
      companyId,
      code: accountGroup.code,
      name: accountGroup.name,
      nature: accountGroup.nature,
    });
    accountGroupIdByCode.set(record.code, record.id);
  }

  return accountGroupIdByCode;
}

/**
 * Upserts the Chart of Accounts category tree (Main/Sub/Child/Sub-child) and the
 * Section 6 system ledgers underneath it, for one company. Idempotent — safe to
 * call repeatedly (used by onboarding, the seed script, and one-time backfills).
 * Returns how many new accounts were created (existing ones are left untouched).
 */
export async function seedAccountHierarchy(
  client: AccountSeedingClient,
  tenantId: string,
  companyId: string,
  accountGroupIdByCode: Map<string, string>,
) {
  let created = 0;
  const categoryIdByCode = new Map<string, string>();

  // accountCategorySeeds is authored parent-before-child, so a single pass resolves.
  for (const category of accountCategorySeeds) {
    const parentId = category.parentCode ? (categoryIdByCode.get(category.parentCode) ?? null) : null;
    if (category.parentCode && !parentId) {
      throw new Error(`Protected Chart of Accounts parent code ${category.parentCode} is unavailable for ${category.code}`);
    }
    const existing = await client.account.findUnique({
      where: { companyId_code: { companyId, code: category.code } },
    });
    if (existing) {
      assertExactSeedRecord("Protected Chart of Accounts", category.code, existing, {
        companyId,
        isSystem: true,
        level: category.level,
        name: category.name,
        nature: category.nature,
        status: "ACTIVE",
        parentId,
        accountGroupId: null,
      });
    }

    const record = existing ?? await client.account.create({
      data: {
        tenantId,
        companyId,
        code: category.code,
        name: category.name,
        level: category.level,
        parentId,
        nature: category.nature,
        isSystem: true,
        accountGroupId: null,
        status: "ACTIVE",
        sortOrder: category.sortOrder,
      },
    });
    if (!existing) created += 1;
    categoryIdByCode.set(category.code, record.id);
  }

  for (const ledger of systemAccountSeeds) {
    const parentId = categoryIdByCode.get(ledger.parentCategoryCode) ?? null;
    const accountGroupId = accountGroupIdByCode.get(ledger.groupCode) ?? null;
    if (!parentId) {
      throw new Error(`Protected Chart of Accounts parent code ${ledger.parentCategoryCode} is unavailable for ${ledger.code}`);
    }
    if (!accountGroupId) {
      throw new Error(`Protected Account Group code ${ledger.groupCode} is unavailable for ${ledger.code}`);
    }
    const existing = await client.account.findUnique({
      where: { companyId_code: { companyId, code: ledger.code } },
    });
    if (existing) {
      assertExactSeedRecord("Protected Chart of Accounts", ledger.code, existing, {
        companyId,
        isSystem: true,
        level: "LEDGER",
        name: ledger.name,
        nature: ledger.nature,
        status: "ACTIVE",
        parentId,
        accountGroupId,
        isControlAccount: ledger.isControlAccount,
      });
    }

    if (!existing) {
      await client.account.create({
        data: {
          tenantId,
          companyId,
          accountGroupId,
          parentId,
          level: "LEDGER",
          code: ledger.code,
          name: ledger.name,
          nature: ledger.nature,
          isSystem: true,
          isControlAccount: ledger.isControlAccount,
          status: "ACTIVE",
        },
      });
      created += 1;
    }
  }

  return created;
}
