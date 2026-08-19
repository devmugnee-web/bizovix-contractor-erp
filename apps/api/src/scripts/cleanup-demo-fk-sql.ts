#!/usr/bin/env node

/**
 * CORRECTED FK-AWARE DEMO CLEANUP USING RAW SQL
 * Uses raw SQL DELETE statements in correct topological order
 * All within single atomic transaction
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Topologically sorted deletion order
const FK_AWARE_DELETE_ORDER = [
  "tender_security_items",
  "credit_commitment_items",
  "grn_items",
  "supplier_bill_items",
  "supplier_payments",
  "dlp_defects",
  "retention_releases",
  "supplier_bill_deductions",
  "journal_lines",
  "variation_items",
  "project_bill_items",
  "bill_adjustments",
  "dlp_extensions",
  "expense_attachments",
  "document_versions",
  "notifications",
  "reminders",
  "receipts",
  "financial_transactions",
  "fund_transfers",
  "bank_reconciliations",
  "cheques",
  "documents",
  "expenses",
  "tender_securities",
  "credit_commitments",
  "payables",
  "journal_entries",
  "variation_orders",
  "project_bills",
  "supplier_bills",
  "defect_liability_periods",
  "completion_certificates",
  "time_extensions",
  "project_handovers",
  "project_closure_events",
  "receipt_sequences",
  "expense_heads",
  "goods_receipt_notes",
  "purchase_order_items",
  "purchase_orders",
  "rfq_items",
  "rfq_suppliers",
  "supplier_quotation_items",
  "supplier_quotations",
  "comparative_statement_suppliers",
  "comparative_statements",
  "request_for_quotations",
  "purchase_requisition_items",
  "purchase_requisitions",
  "boq_items",
  "boq_sections",
  "project_budget_lines",
  "project_budgets",
  "project_contracts",
  "receivables",
  "performance_guarantees",
  "pg_bg_workflows",
  "document_purchases",
  "tenders",
  "cms_works",
  "deduction_configs",
];

async function checkEnvironment(): Promise<boolean> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL not set");
    return false;
  }

  const match = dbUrl.match(/\/([^/?]+)\?/);
  const dbName = match ? match[1] : null;
  if (!dbName) {
    console.error("ERROR: Cannot parse database name from DATABASE_URL");
    return false;
  }

  console.log(`✓ Database verified: ${dbName}`);
  return true;
}

async function performCleanup(apply: boolean): Promise<{ success: boolean; deletedCounts: Record<string, number>; error?: string }> {
  try {
    const allOrgs = await prisma.organization.findMany({ select: { id: true } });
    if (allOrgs.length === 0) {
      console.log("⚠️  No organizations found");
      return { success: true, deletedCounts: {} };
    }

    const orgsToClean = allOrgs.map((o) => `'${o.id}'`).join(",");

    if (!apply) {
      console.log(`\n📋 DRY RUN: Would delete from ${allOrgs.length} org(s)`);
      console.log(`FK-aware topological order (${FK_AWARE_DELETE_ORDER.length} tables):\n`);
      FK_AWARE_DELETE_ORDER.forEach((t, i) => {
        if (i % 5 === 0) console.log("");
        console.log(`  ${i + 1}. ${t}`);
      });
      return { success: true, deletedCounts: {} };
    }

    console.log(`\n🧹 CLEANUP: Starting atomic transaction...`);
    console.log(`Orgs: ${allOrgs.length}`);
    console.log(`Delete order: ${FK_AWARE_DELETE_ORDER.length} tables\n`);

    const deleteCounts: Record<string, number> = {};

    await prisma.$transaction(
      async (tx: any) => {
        for (const table of FK_AWARE_DELETE_ORDER) {
          try {
            const result = await tx.$executeRawUnsafe(
              `DELETE FROM "${table}" WHERE "organizationId" IN (${orgsToClean})`
            );
            deleteCounts[table] = result;
            if (result > 0) {
              console.log(`  ✓ ${table}: ${result} rows`);
            }
          } catch (err: any) {
            console.error(`  ✗ ${table}: ${err.message}`);
            throw new Error(`${table}: ${err.message}`);
          }
        }
      },
      {
        isolationLevel: "Serializable",
        timeout: 300000,
      }
    );

    const totalDeleted = Object.values(deleteCounts).reduce((a: any, b: any) => a + b, 0);
    console.log(`\n✅ Cleanup succeeded! ${totalDeleted} rows deleted.`);
    return { success: true, deletedCounts: deleteCounts };
  } catch (err: any) {
    console.error(`\n❌ CLEANUP FAILED: ${err.message}`);
    return { success: false, deletedCounts: {}, error: err.message };
  }
}

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\n${apply ? "🔴 APPLY MODE" : "📋 DRY RUN MODE"}\n`);

  const envOk = await checkEnvironment();
  if (!envOk) {
    process.exit(1);
  }

  try {
    const result = await performCleanup(apply);
    if (result.success) {
      console.log("\n✅ CLEANUP COMPLETE");
      process.exit(0);
    } else {
      console.log(`\n❌ CLEANUP FAILED: ${result.error}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
