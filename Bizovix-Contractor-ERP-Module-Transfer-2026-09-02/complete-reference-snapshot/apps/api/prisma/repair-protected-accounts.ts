/**
 * Repairs companies whose Chart of Accounts is missing the protected system
 * ledgers, or whose reserved codes were taken by user-created accounts.
 *
 * A company created before a protected seed existed never got that row. The
 * positional code counter then handed the reserved code to the next manual
 * ledger under the same category (e.g. a user ledger under 1232000 became
 * 1232001 - the code reserved for "Inventory Delivered Pending Invoice").
 * Every inventory read runs the protected-ledger guard, finds that row with
 * isSystem=false, and fails with 400 "Required protected inventory ledger
 * 1232001 is missing or inactive" - which takes down the stock ledger and the
 * whole Reports workspace with it.
 *
 * This script moves each squatting user account to the next free code (its id
 * never changes, so postings, vouchers, and balances follow it untouched) and
 * then seeds the protected rows in the freed slots.
 *
 * Read-only by default. Pass --apply to write.
 *
 *   npx tsx prisma/repair-protected-accounts.ts            # report only
 *   npx tsx prisma/repair-protected-accounts.ts --apply    # repair
 */
import { pickCategoryCode, pickLedgerCode } from "../src/accounts/account-code.util.js";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { accountCategorySeeds, systemAccountSeeds } from "../src/platform/bootstrap/defaults.js";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

type AccountRow = { id: string; code: string; name: string; level: string; parentId: string | null; isSystem: boolean; status: string };

const reservedCodes = new Set([
  ...accountCategorySeeds.map((seed) => seed.code),
  ...systemAccountSeeds.map((seed) => seed.code),
]);

/** Depth of `account` in the tree - 1 for a Main Category, 2 for a Category under it, etc. */
function depthOf(account: AccountRow, byId: Map<string, AccountRow>) {
  let depth = 1;
  let current = account;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return depth;
}

function nextFreeCode(account: AccountRow, byId: Map<string, AccountRow>, takenCodes: Set<string>) {
  const parent = account.parentId ? byId.get(account.parentId) ?? null : null;
  const allCodes = [...takenCodes];

  if (account.level === "LEDGER") {
    const parentDepth = parent ? depthOf(parent, byId) : null;
    const picked = pickLedgerCode(parent?.code ?? null, parentDepth, allCodes);
    if (picked && !takenCodes.has(picked)) return picked;
  } else if (parent) {
    const picked = pickCategoryCode(depthOf(account, byId), parent.code, allCodes);
    if (picked && !takenCodes.has(picked)) return picked;
  }

  // Fallback for codes outside the positional scheme: keep the original code
  // recognisable rather than inventing an unrelated number.
  let suffix = 2;
  while (takenCodes.has(`${account.code}-${suffix}`)) suffix += 1;
  return `${account.code}-${suffix}`;
}

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, tenantId: true, name: true } });
  console.log(`${apply ? "Repairing" : "Checking"} protected Chart of Accounts for ${companies.length} companies...\n`);

  for (const company of companies) {
    const accounts = (await prisma.account.findMany({
      where: { companyId: company.id },
      select: { id: true, code: true, name: true, level: true, parentId: true, isSystem: true, status: true },
    })) as AccountRow[];

    const byId = new Map(accounts.map((account) => [account.id, account]));
    const takenCodes = new Set([...accounts.map((account) => account.code), ...reservedCodes]);

    const squatters = accounts.filter((account) => reservedCodes.has(account.code) && !account.isSystem);
    const missing = [...reservedCodes].filter((code) => !accounts.some((account) => account.code === code));

    console.log(`- ${company.name} (${company.id})`);
    if (!squatters.length && !missing.length) {
      console.log("  protected chart is intact\n");
      continue;
    }

    for (const squatter of squatters) {
      const freeCode = nextFreeCode(squatter, byId, takenCodes);
      takenCodes.add(freeCode);
      console.log(`  move user account "${squatter.name}" ${squatter.code} -> ${freeCode}`);
      if (apply) {
        await prisma.account.update({ where: { id: squatter.id }, data: { code: freeCode } });
      }
    }

    const toSeed = [...missing, ...squatters.map((squatter) => squatter.code)];
    console.log(`  protected codes to seed: ${toSeed.length ? toSeed.join(", ") : "-"}`);

    // Deliberately not seedAccountHierarchy(): that seeder re-validates every
    // protected row and aborts the whole company on any unrelated pre-existing
    // drift. This repair only has to fill the specific holes it just reported.
    if (apply && toSeed.length) {
      const wanted = new Set(toSeed);
      let created = 0;

      // accountCategorySeeds is authored parent-before-child, so one pass resolves.
      const categoryIdByCode = new Map(
        accounts.filter((account) => account.level !== "LEDGER").map((account) => [account.code, account.id]),
      );
      for (const category of accountCategorySeeds) {
        if (!wanted.has(category.code) || categoryIdByCode.has(category.code)) continue;
        const parentId = category.parentCode ? categoryIdByCode.get(category.parentCode) ?? null : null;
        if (category.parentCode && !parentId) {
          console.log(`  ! skipped category ${category.code}: parent ${category.parentCode} is missing`);
          continue;
        }
        const record = await prisma.account.create({
          data: {
            tenantId: company.tenantId,
            companyId: company.id,
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
        categoryIdByCode.set(record.code, record.id);
        created += 1;
      }

      for (const ledger of systemAccountSeeds) {
        if (!wanted.has(ledger.code)) continue;
        const parentId = categoryIdByCode.get(ledger.parentCategoryCode) ?? null;
        const group = await prisma.accountGroup.findUnique({
          where: { companyId_code: { companyId: company.id, code: ledger.groupCode } },
        });
        if (!parentId || !group) {
          console.log(`  ! skipped ledger ${ledger.code}: parent ${ledger.parentCategoryCode} or group ${ledger.groupCode} is missing`);
          continue;
        }
        await prisma.account.create({
          data: {
            tenantId: company.tenantId,
            companyId: company.id,
            accountGroupId: group.id,
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
      console.log(`  seeded ${created} protected accounts`);
    }
    console.log("");
  }

  if (!apply) {
    console.log("Dry run only - nothing was written. Re-run with --apply to repair.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
