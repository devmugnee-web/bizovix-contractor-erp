/**
 * One-off renumbering of every existing company's Chart of Accounts codes to
 * the positional 7-digit scheme (see src/accounts/account-code.util.ts) —
 * Main Category's digit fixed by nature (Asset=1, Liability=2, Equity=3,
 * Income=4, Expense=5), each Category depth below it by sibling order,
 * Ledger = parent category's digits + a counter. Brand-new companies already
 * get this scheme from platform/bootstrap/defaults.ts; this brings existing
 * companies (still on the old "CAT-ASSET" / 4-digit nature-block codes) in
 * line.
 *
 * Categories nest to unlimited depth, so this walks the tree breadth-first
 * (Main Category, then each Category depth in turn, parents always renumbered
 * before their children) rather than assuming a fixed number of levels.
 * Depths beyond the positional scheme's 4-digit reach fall out of
 * `pickCategoryCode`/`pickLedgerCode` as `null` and are reported as skipped —
 * matching the live service's fallback-to-manual-code behavior for that case.
 *
 * Two-phase per company to respect the @@unique([companyId, code]) constraint
 * while codes are being rewritten in place: first every account is renamed to
 * a collision-proof temporary code, then final codes are assigned top-down
 * (parents before children) so a Ledger's or Category's final code can always
 * be derived from its parent's already-final code.
 *
 * Run with DRY_RUN=1 to log the planned renumbering without writing anything:
 *   pnpm --filter @mugnee/api exec cross-env DRY_RUN=1 tsx prisma/backfill-renumber-account-codes.ts
 * Then for real:
 *   pnpm --filter @mugnee/api exec tsx prisma/backfill-renumber-account-codes.ts
 */
import { AccountLevel, PrismaClient } from "../src/generated/prisma/index.js";
import { pickCategoryCode, pickLedgerCode, pickMainCategoryCode } from "../src/accounts/account-code.util.js";

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === "1";

async function loadCompanyAccounts(companyId: string) {
  return prisma.account.findMany({
    where: { companyId },
    select: { id: true, code: true, level: true, parentId: true, nature: true, sortOrder: true, createdAt: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { name: "asc" }],
  });
}

type AccountRow = Awaited<ReturnType<typeof loadCompanyAccounts>>[number];

async function setCode(id: string, code: string) {
  if (DRY_RUN) {
    return;
  }
  await prisma.account.update({ where: { id }, data: { code } });
}

async function renumberCompany(company: { id: string; name: string }) {
  const accounts = await loadCompanyAccounts(company.id);
  if (!accounts.length) {
    return { renumbered: 0, skipped: [] as string[] };
  }

  const byId = new Map(accounts.map((account) => [account.id, account]));
  const skipped: string[] = [];
  let renumbered = 0;

  // Phase 1 — free the (companyId, code) namespace with collision-proof
  // temporary codes before any final code is assigned.
  for (const account of accounts) {
    await setCode(account.id, `MIG-${account.id}`);
  }

  const finalCodeById = new Map<string, string>();
  const depthById = new Map<string, number>();

  // Phase 2a — Main Categories (no parent), nature-fixed digit, depth 1.
  const mainCategories = accounts.filter((account) => account.level === AccountLevel.MAIN_CATEGORY);
  const mainCodes: string[] = [];
  for (const account of mainCategories) {
    const code = pickMainCategoryCode(account.nature, mainCodes);
    if (!code) {
      skipped.push(`${account.name} (${account.id}) — Main Category digit range (1-9) exhausted`);
      continue;
    }
    mainCodes.push(code);
    finalCodeById.set(account.id, code);
    depthById.set(account.id, 1);
    await setCode(account.id, code);
    renumbered += 1;
  }

  // Phase 2b — Categories, breadth-first by actual tree depth (unlimited),
  // each depth's parents always renumbered in a prior iteration.
  let frontier = [...finalCodeById.keys()];
  while (frontier.length) {
    const frontierSet = new Set(frontier);
    const byParent = new Map<string, AccountRow[]>();
    for (const account of accounts) {
      if (account.level !== AccountLevel.CATEGORY || !account.parentId || !frontierSet.has(account.parentId)) {
        continue;
      }
      const list = byParent.get(account.parentId) ?? [];
      list.push(account);
      byParent.set(account.parentId, list);
    }

    const nextFrontier: string[] = [];
    for (const [parentId, siblings] of byParent) {
      const parentCode = finalCodeById.get(parentId)!;
      const depth = depthById.get(parentId)! + 1;

      const siblingCodes: string[] = [];
      for (const account of siblings) {
        const code = pickCategoryCode(depth, parentCode, siblingCodes);
        if (!code) {
          skipped.push(
            `${account.name} (${account.id}) — sibling digit range (1-9) exhausted under parent ${parentId}, or depth ${depth} is beyond the positional scheme's reach (needs a manual code)`,
          );
          continue;
        }
        siblingCodes.push(code);
        finalCodeById.set(account.id, code);
        depthById.set(account.id, depth);
        await setCode(account.id, code);
        renumbered += 1;
        nextFrontier.push(account.id);
      }
    }
    frontier = nextFrontier;
  }

  // Phase 2c — Ledgers last; parent may be any non-Ledger level, or null.
  const ledgersByParent = new Map<string, AccountRow[]>();
  for (const account of accounts) {
    if (account.level !== AccountLevel.LEDGER) {
      continue;
    }
    const key = account.parentId ?? "__root__";
    const list = ledgersByParent.get(key) ?? [];
    list.push(account);
    ledgersByParent.set(key, list);
  }

  for (const [key, siblings] of ledgersByParent) {
    const isRoot = key === "__root__";
    const parent = isRoot ? null : byId.get(key);
    const parentCode = isRoot ? null : (finalCodeById.get(key) ?? null);
    const parentDepth = isRoot ? null : (depthById.get(key) ?? null);
    if (!isRoot && !parentCode) {
      for (const account of siblings) {
        skipped.push(`${account.name} (${account.id}) — parent ${parent?.name ?? key} was not itself renumbered`);
      }
      continue;
    }

    const siblingCodes: string[] = [];
    for (const account of siblings) {
      const code = pickLedgerCode(parentCode, parentDepth, siblingCodes);
      if (!code) {
        skipped.push(`${account.name} (${account.id}) — ledger counter range exhausted under parent ${key}`);
        continue;
      }
      siblingCodes.push(code);
      await setCode(account.id, code);
      renumbered += 1;
    }
  }

  return { renumbered, skipped };
}

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Renumbering Chart of Accounts codes for ${companies.length} existing companies...`);

  let totalRenumbered = 0;
  let totalSkipped = 0;
  for (const company of companies) {
    const { renumbered, skipped } = await renumberCompany(company);
    totalRenumbered += renumbered;
    totalSkipped += skipped.length;
    console.log(`- ${company.name} (${company.id}): ${renumbered} accounts renumbered${skipped.length ? `, ${skipped.length} SKIPPED` : ""}`);
    for (const reason of skipped) {
      console.warn(`  ! ${reason}`);
    }
  }

  console.log(
    `${DRY_RUN ? "[DRY RUN] " : ""}Done. ${totalRenumbered} accounts renumbered${totalSkipped ? `, ${totalSkipped} skipped (see warnings above — these keep their MIG-* temporary code and need a manual look)` : ""}.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
