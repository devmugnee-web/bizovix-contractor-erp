#!/usr/bin/env node

/**
 * Targeted backfill of budgetCategory for existing ExpenseHeads.
 *
 * This script maps existing expense head names to canonical budget categories
 * based on confident name matching. It preserves unmapped heads for manual review.
 *
 * Usage:
 *   npx ts-node scripts/backfill-budget-categories.ts [--apply]
 *
 * - Dry run by default; --apply required for mutations
 * - Reports on all heads and their mappings
 * - Identifies unmapped/ambiguous heads for manual review
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CANONICAL_CATEGORIES = [
  "Material",
  "Labour",
  "Transport",
  "Subcontract",
  "Equipment",
  "Accommodation",
  "Site Expense",
  "Bank / Financial Charges",
  "Overhead",
  "Contingency",
  "Other",
] as const;

const MAPPINGS: Record<string, string> = {
  Material: "Material",
  "Material Purchase": "Material",
  Labour: "Labour",
  Transport: "Transport",
  Subcontract: "Subcontract",
  Equipment: "Equipment",
  Accommodation: "Accommodation",
  "Site Expense": "Site Expense",
  "Bank / Financial Charges": "Bank / Financial Charges",
  Overhead: "Overhead",
  Contingency: "Contingency",
  Other: "Other",
};

async function backfillBudgetCategories(apply: boolean) {
  console.log("\n=== Budget Category Backfill ===\n");

  const allHeads = await prisma.expenseHead.findMany({
    orderBy: { name: "asc" },
  });

  console.log(`Found ${allHeads.length} expense heads\n`);

  const mapped: typeof allHeads = [];
  const unmapped: typeof allHeads = [];
  const alreadySet: typeof allHeads = [];

  for (const head of allHeads) {
    if (head.budgetCategory) {
      alreadySet.push(head);
    } else if (MAPPINGS[head.name]) {
      mapped.push(head);
    } else {
      unmapped.push(head);
    }
  }

  console.log(`Already mapped: ${alreadySet.length}`);
  if (alreadySet.length > 0) {
    for (const head of alreadySet) {
      console.log(`  ✓ ${head.name} → ${head.budgetCategory}`);
    }
  }

  console.log(`\nTo be mapped: ${mapped.length}`);
  if (mapped.length > 0) {
    for (const head of mapped) {
      const category = MAPPINGS[head.name]!;
      console.log(`  → ${head.name} → ${category}`);
    }
  }

  console.log(`\nUnmapped/ambiguous: ${unmapped.length}`);
  if (unmapped.length > 0) {
    for (const head of unmapped) {
      console.log(`  ⚠️  ${head.name} (NO MAPPING)`);
    }
  }

  if (apply && mapped.length > 0) {
    console.log(`\n🔄 Applying mappings...\n`);
    let count = 0;
    for (const head of mapped) {
      const category = MAPPINGS[head.name]!;
      await prisma.expenseHead.update({
        where: { id: head.id },
        data: { budgetCategory: category },
      });
      console.log(`  ✓ Updated: ${head.name} → ${category}`);
      count++;
    }
    console.log(`\n✅ Mapped ${count} expense heads`);
  } else if (!apply && mapped.length > 0) {
    console.log(`\n📋 DRY RUN: To apply, run: npx ts-node scripts/backfill-budget-categories.ts --apply`);
  } else if (mapped.length === 0) {
    console.log(`\n✓ All heads already mapped or unmapped heads require manual review`);
  }

  if (unmapped.length > 0) {
    console.log(`\n⚠️  Action Required: Review ${unmapped.length} unmapped heads`);
    console.log(`Update MAPPINGS in this script or configure manually in the UI`);
  }

  await prisma.$disconnect();
}

const apply = process.argv.includes("--apply");
backfillBudgetCategories(apply).catch((err) => {
  console.error(err);
  process.exit(1);
});
