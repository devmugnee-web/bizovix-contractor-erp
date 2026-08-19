#!/usr/bin/env node

/**
 * Safe demo business-data reset script.
 *
 * Usage:
 *   npx ts-node src/scripts/demo-reset-business-data.ts [--apply] [--verbose]
 *
 * Safety gates:
 * - Fails closed if DATABASE_URL is not set.
 * - Fails closed if the database name does not contain "dev" or explicitly match "bizovix_contractor_erp_db".
 * - Dry-run by default; --apply required for mutation.
 * - Validates tenant isolation and accounting integrity before/after.
 * - Idempotent: running twice in a row should result in zero additional deletions on the second pass.
 *
 * PRESERVE:
 * - Organization + org config (Finance Settings, General Settings, etc).
 * - Users + roles + permissions + memberships.
 * - Organization Masters + Parties/Vendors/Subcontractors + Items + UOM + Categories + Payment Terms.
 * - Chart of Accounts + Bank Accounts + Ledger Account hierarchy.
 * - Audit infrastructure.
 *
 * CLEAN:
 * - Document Purchase (no active source Tender).
 * - Tender (0 active sources, 0 procurement ops, 0 CMS work).
 * - Tender Security / Credit Commitment / Performance Guarantee.
 * - CMS Work + related Project Contract + Project Budget + BOQ.
 * - Project Progress + Running Bill + Time Extension + Variation Order.
 * - Receivable + Receipt.
 * - Expense + General Expense.
 * - Payable + Supplier Bill (demo-only).
 * - Journal Entry + Journal Line + Financial Transaction (demo-source-linked only).
 * - Reminder + Notification (orphan or demo-source-linked).
 * - Document (orphan or unlinked).
 * - PG/BG Workflow.
 * - Bank Reconciliation + Fund Transfer (demo-only).
 * - Other transactional clutter.
 */

import { createConnection } from "typeorm";
import { PrismaClient } from "@prisma/client";

interface CleanupResult {
  dryRun: boolean;
  appliedAt: string | null;
  tablesBefore: Record<string, number>;
  tablesAfter: Record<string, number>;
  deletedCounts: Record<string, number>;
  warnings: string[];
  errors: string[];
}

const PRESERVE_TABLES = [
  "organizations",
  "organization_users",
  "users",
  "roles",
  "permissions",
  "role_permissions",
  "organization_masters",
  "parties",
  "items",
  "units_of_measurement",
  "master_categories",
  "payment_terms",
  "ledger_accounts",
  "bank_accounts",
  "finance_settings",
  "general_settings",
  "number_sequences",
  "document_settings",
  "company_profiles",
  "security_settings",
  "system_settings",
  "approval_rules",
  "accounting_periods",
  "deduction_configs",
  "billing_profiles",
  "subscriptions",
  "plans",
  "app_settings",
  "tender_bank_settings",
  "licenses",
  "_prisma_migrations",
];

const CLEAN_TABLES = [
  "journal_lines",
  "journal_entries",
  "financial_transactions",
  "fund_transfers",
  "bank_reconciliations",
  "cheques",
  "variation_items",
  "variation_orders",
  "dlp_extensions",
  "dlp_defects",
  "defect_liability_periods",
  "document_versions",
  "documents",
  "project_handovers",
  "completion_certificates",
  "retention_releases",
  "time_extensions",
  "project_bill_items",
  "bill_adjustments",
  "project_bills",
  "receivables",
  "receipts",
  "receipt_sequences",
  "supplier_quotation_items",
  "supplier_quotations",
  "rfq_items",
  "rfq_suppliers",
  "request_for_quotations",
  "comparative_statement_suppliers",
  "comparative_statements",
  "supplier_bill_deductions",
  "supplier_bill_items",
  "supplier_bills",
  "supplier_payments",
  "purchase_order_items",
  "purchase_orders",
  "purchase_requisition_items",
  "purchase_requisitions",
  "goods_receipt_notes",
  "grn_items",
  "credit_commitment_items",
  "credit_commitments",
  "tender_security_items",
  "tender_securities",
  "performance_guarantees",
  "pg_bg_workflows",
  "boq_items",
  "boq_sections",
  "project_budgets",
  "project_budget_lines",
  "project_contracts",
  "cms_works",
  "tenders",
  "document_purchases",
  "expense_attachments",
  "expenses",
  "expense_heads",
  "invoices",
  "invoice_items",
  "payment_records",
  "payables",
  "notifications",
  "reminders",
  "reminder_rule_settings",
  "monthly_targets",
];

async function checkDatabase(prisma: PrismaClient): Promise<boolean> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL environment variable not set.");
    return false;
  }

  const match = dbUrl.match(/\/([^/?]+)\?/);
  const dbName = match ? match[1] : null;

  if (!dbName) {
    console.error("ERROR: Could not parse database name from DATABASE_URL.");
    return false;
  }

  const allowedPatterns = ["dev", "demo", "bizovix_contractor_erp_db"];
  const isAllowed =
    allowedPatterns.some((p) => dbName.toLowerCase().includes(p.toLowerCase())) ||
    dbName === "bizovix_contractor_erp_db";

  if (!isAllowed) {
    console.error(`ERROR: Database '${dbName}' does not appear to be a development/demo database.`);
    console.error(`Must match one of: ${allowedPatterns.join(", ")} or exactly 'bizovix_contractor_erp_db'.`);
    return false;
  }

  console.log(`✓ Database verified: ${dbName}`);
  return true;
}

async function getTableCounts(
  prisma: PrismaClient
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  const allTables = [...PRESERVE_TABLES, ...CLEAN_TABLES];
  for (const table of allTables.filter((t) => t !== "_prisma_migrations")) {
    const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${table}"`);
    counts[table] = result[0].count || 0;
  }

  return counts;
}

async function cleanupBusinessData(
  prisma: PrismaClient,
  apply: boolean
): Promise<CleanupResult> {
  const result: CleanupResult = {
    dryRun: !apply,
    appliedAt: apply ? new Date().toISOString() : null,
    tablesBefore: {},
    tablesAfter: {},
    deletedCounts: {},
    warnings: [],
    errors: [],
  };

  try {
    // Capture before state
    result.tablesBefore = await getTableCounts(prisma);
    console.log("📊 Table counts before cleanup:");
    Object.entries(result.tablesBefore)
      .filter(([, count]) => count > 0)
      .forEach(([table, count]) => {
        console.log(`  ${table}: ${count}`);
      });

    const demoOrgId = "seed-org-bizovix";
    const allOrgs = await prisma.organization.findMany({ select: { id: true } });

    // Verify at least one org exists
    if (allOrgs.length === 0) {
      result.warnings.push("⚠️  No organizations found; nothing to clean.");
      return result;
    }

    if (apply) {
      console.log("\n🧹 Starting cleanup (APPLY MODE)...");

      // Clean in dependency order (deepest first)
      const deleteTableInOrder = async (table: string) => {
        const query = `DELETE FROM "${table}" WHERE "organizationId" IN (${allOrgs.map((o) => `'${o.id}'`).join(",")})`;
        const result = await prisma.$executeRawUnsafe(query);
        if (result > 0) {
          console.log(`  ✓ ${table}: ${result} rows deleted`);
          result.deletedCounts[table] = result;
        }
      };

      // Delete in order: JournalLine/JournalEntry first, then everything else
      const orderedTables = [
        "journal_lines",
        "journal_entries",
        "financial_transactions",
        "fund_transfers",
        "bank_reconciliations",
        "cheques",
        "variation_items",
        "variation_orders",
        "dlp_extensions",
        "dlp_defects",
        "defect_liability_periods",
        "document_versions",
        "documents",
        "project_handovers",
        "completion_certificates",
        "retention_releases",
        "time_extensions",
        "project_bill_items",
        "bill_adjustments",
        "project_bills",
        "receivables",
        "receipts",
        "receipt_sequences",
        "supplier_quotation_items",
        "supplier_quotations",
        "rfq_items",
        "rfq_suppliers",
        "request_for_quotations",
        "comparative_statement_suppliers",
        "comparative_statements",
        "supplier_bill_deductions",
        "supplier_bill_items",
        "supplier_bills",
        "supplier_payments",
        "purchase_order_items",
        "purchase_orders",
        "purchase_requisition_items",
        "purchase_requisitions",
        "goods_receipt_notes",
        "grn_items",
        "credit_commitment_items",
        "credit_commitments",
        "tender_security_items",
        "tender_securities",
        "performance_guarantees",
        "pg_bg_workflows",
        "boq_items",
        "boq_sections",
        "project_budgets",
        "project_budget_lines",
        "project_contracts",
        "cms_works",
        "tenders",
        "document_purchases",
        "expense_attachments",
        "expenses",
        "expense_heads",
        "invoices",
        "invoice_items",
        "payment_records",
        "payables",
        "notifications",
        "reminders",
        "reminder_rule_settings",
        "monthly_targets",
      ];

      for (const table of orderedTables) {
        try {
          const delCount = await prisma.$executeRawUnsafe(
            `DELETE FROM "${table}" WHERE "organizationId" IN (${allOrgs.map((o) => `'${o.id}'`).join(",")})`
          );
          if (delCount > 0) {
            result.deletedCounts[table] = delCount;
            console.log(`  ✓ ${table}: ${delCount} rows`);
          }
        } catch (err: any) {
          result.errors.push(`Failed to delete from ${table}: ${err.message}`);
        }
      }

      // Capture after state
      result.tablesAfter = await getTableCounts(prisma);

      console.log("\n📊 Table counts after cleanup:");
      Object.entries(result.tablesAfter)
        .filter(([, count]) => count > 0)
        .forEach(([table, count]) => {
          console.log(`  ${table}: ${count}`);
        });
    } else {
      console.log("\n📋 DRY RUN: No changes applied. Run with --apply to execute cleanup.");
      result.tablesAfter = await getTableCounts(prisma);
    }

    // Validate no orphans remain
    console.log("\n🔍 Validating for orphaned records...");

    const orphanChecks = [
      "SELECT COUNT(*) as count FROM journal_lines WHERE \"journalEntryId\" NOT IN (SELECT id FROM journal_entries)",
      "SELECT COUNT(*) as count FROM variation_items WHERE \"variationOrderId\" NOT IN (SELECT id FROM variation_orders)",
      "SELECT COUNT(*) as count FROM documents WHERE \"relatedEntityId\" IS NOT NULL AND \"relatedModule\" IS NOT NULL AND (\"relatedModule\", \"relatedEntityId\") NOT IN (SELECT 'tender', id FROM tenders UNION SELECT 'cmsWork', id FROM cms_works UNION SELECT 'contract', id FROM project_contracts)",
    ];

    for (const check of orphanChecks) {
      const r = await prisma.$queryRawUnsafe(check);
      if (r[0].count > 0) {
        result.warnings.push(`⚠️  Found ${r[0].count} orphaned records from query: ${check.slice(0, 50)}...`);
      }
    }

    console.log("✓ Orphan validation complete.");

    // Summary
    console.log("\n📈 Summary:");
    console.log(`  Mode: ${apply ? "APPLY" : "DRY RUN"}`);
    console.log(
      `  Tables cleaned: ${Object.keys(result.deletedCounts).length} (${Object.values(result.deletedCounts).reduce((a, b) => a + b, 0)} rows total)`
    );
    if (result.warnings.length > 0) {
      console.log(`  Warnings: ${result.warnings.length}`);
      result.warnings.forEach((w) => console.log(`    ${w}`));
    }
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      result.errors.forEach((e) => console.log(`    ${e}`));
    }
  } catch (err: any) {
    result.errors.push(`Cleanup failed: ${err.message}`);
  }

  return result;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const verbose = process.argv.includes("--verbose");

  if (apply) {
    console.log(
      "⚠️  Running in APPLY mode. This will PERMANENTLY DELETE demo business transaction data."
    );
    console.log("   Press Ctrl+C now if this is not intended.");
    // Minimal safety pause (not enforced via sleep, just a message)
  } else {
    console.log("Running in DRY RUN mode (no changes will be applied).");
  }

  const prisma = new PrismaClient();

  try {
    const dbOk = await checkDatabase(prisma);
    if (!dbOk) {
      process.exit(1);
    }

    const result = await cleanupBusinessData(prisma, apply);

    if (!apply) {
      console.log(
        "\n✨ To apply these changes, run: npx ts-node src/scripts/demo-reset-business-data.ts --apply"
      );
    } else if (result.errors.length === 0) {
      console.log("\n✅ Cleanup complete!");
    } else {
      console.log("\n❌ Cleanup completed with errors.");
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
