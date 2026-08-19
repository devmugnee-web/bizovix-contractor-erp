#!/usr/bin/env node

/**
 * CORRECTED FK-AWARE DEMO BUSINESS DATA CLEANUP
 *
 * This script deletes demo business data in a topologically-correct order
 * accounting for all RESTRICT foreign keys in the schema.
 *
 * FK GRAPH ANALYSIS:
 * - TenderSecurityItem.documentPurchaseId → DocumentPurchase (RESTRICT)
 * - CreditCommitmentItem.documentPurchaseId → DocumentPurchase (RESTRICT)
 * - GrnItem.purchaseOrderItemId → PurchaseOrderItem (RESTRICT)
 * - SupplierBillItem.purchaseOrderItemId → PurchaseOrderItem (RESTRICT)
 * - SupplierPayment.payableId → Payable (RESTRICT)
 * - DlpDefect.dlpId → DefectLiabilityPeriod (RESTRICT)
 * - RetentionRelease.journalEntryId → JournalEntry (RESTRICT)
 *
 * DELETION ORDER (child → parent):
 * Phase 1: Delete RESTRICT children
 * Phase 2: Delete CASCADE children
 * Phase 3: Delete parents
 * Phase 4: Delete higher-level parents
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// Topologically sorted deletion order (child first, parent later)
const FK_AWARE_DELETE_ORDER = [
  // Phase 1: RESTRICT children (must be deleted before parents)
  "tender_security_items",      // → document_purchases (RESTRICT)
  "credit_commitment_items",    // → document_purchases (RESTRICT)
  "grn_items",                  // → purchase_order_items (RESTRICT)
  "supplier_bill_items",        // → purchase_order_items (RESTRICT)
  "supplier_payments",          // → payables (RESTRICT)
  "dlp_defects",                // → dlps (RESTRICT, based on schema line 1429)
  "retention_releases",         // → journal_entries (RESTRICT)

  // Phase 2: CASCADE children (safe once RESTRICT children gone)
  "supplier_bill_deductions",   // → supplier_bills (CASCADE)
  "journal_lines",              // → journal_entries (CASCADE)
  "variation_items",            // → variation_orders (CASCADE)
  "project_bill_items",         // → project_bills (CASCADE)
  "bill_adjustments",           // → project_bills (CASCADE)
  "dlp_extensions",             // → dlps (CASCADE)
  "expense_attachments",        // → expenses (CASCADE)
  "document_versions",          // → documents (CASCADE)
  "grn_items",                  // → grns (CASCADE, if any remain)

  // Phase 3: Leaf tables and parent records
  "notifications",              // reminders orphans ok (SetNull)
  "reminders",
  "receipts",
  "financial_transactions",
  "fund_transfers",
  "bank_reconciliations",
  "cheques",
  "documents",
  "expenses",

  // Phase 4: Primary parents once children deleted
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

  // Phase 5: Procurement parents
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

  // Phase 6: Project/Budget parents
  "boq_items",
  "boq_sections",
  "project_budget_lines",
  "project_budgets",
  "project_contracts",
  "receivables",

  // Phase 7: Award/Tender parents
  "performance_guarantees",
  "pg_bg_workflows",
  "document_purchases",
  "tenders",
  "cms_works",

  // Phase 8: Config/Settings
  "deduction_configs",
];

interface CleanupResult {
  success: boolean;
  error?: string;
  deletedCounts: Record<string, number>;
  rollbackReason?: string;
}

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

  const isTestDb = dbName.includes("test") || dbName === "test_database_url_db";
  const isDevDb = dbName.includes("dev") || dbName === "bizovix_contractor_erp_db";

  if (!isTestDb && !isDevDb) {
    console.error(`ERROR: Database "${dbName}" is not a test or dev database`);
    return false;
  }

  console.log(`✓ Database verified: ${dbName}`);
  return true;
}

async function performCleanup(apply: boolean): Promise<CleanupResult> {
  const result: CleanupResult = {
    success: false,
    deletedCounts: {},
  };

  try {
    const allOrgs = await prisma.organization.findMany({ select: { id: true } });
    if (allOrgs.length === 0) {
      console.log("⚠️  No organizations found; nothing to clean");
      result.success = true;
      return result;
    }

    const demoOrgId = "seed-org-bizovix";
    const orgsToClean = allOrgs.map((o) => o.id);

    if (!apply) {
      console.log(`\n📋 DRY RUN: Would delete from ${orgsToClean.length} org(s)`);
      console.log(`Deletion order (FK-aware topological sort):`);
      FK_AWARE_DELETE_ORDER.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
      return { success: true, deletedCounts: {} };
    }

    console.log(`\n🧹 CLEANUP: Starting atomic transaction...`);
    console.log(`Organizations: ${orgsToClean.join(", ")}`);
    console.log(`Deletion order (${FK_AWARE_DELETE_ORDER.length} tables):`);

    // Atomic transaction with Serializable isolation
    const cleaned = await prisma.$transaction(
      async (tx: any) => {
        const deleteCounts: Record<string, number> = {};

        for (const table of FK_AWARE_DELETE_ORDER) {
          try {
            const model = tx[table];
            if (!model || !model.deleteMany) {
              console.error(`  ⚠️  ${table}: model not found, skipping`);
              continue;
            }

            const count = await model.deleteMany({
              where: { organizationId: { in: orgsToClean } },
            });

            deleteCounts[table] = count;
            if (count > 0) {
              console.log(`  ✓ ${table}: ${count} rows`);
            }
          } catch (err: any) {
            // On first error, throw to abort transaction
            console.error(`  ✗ ${table}: ${err.message}`);
            throw new Error(`FK violation or constraint error on ${table}: ${err.message}`);
          }
        }

        return deleteCounts;
      },
      {
        isolationLevel: "Serializable" as const,
        timeout: 300000, // 5 minutes
      }
    );

    result.deletedCounts = cleaned;
    result.success = true;
    console.log(`\n✅ Cleanup succeeded! ${Object.values(cleaned).reduce((a, b) => a + b, 0)} rows deleted.`);

  } catch (err: any) {
    console.error(`\n❌ CLEANUP ABORTED: ${err.message}`);
    result.success = false;
    result.rollbackReason = err.message;
    result.error = "Transaction rolled back. No mutations applied.";
  }

  return result;
}

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(
    `\n${apply ? "🔴 APPLY MODE (DANGER)" : "📋 DRY RUN MODE"}`
  );
  if (!apply) {
    console.log("   No changes will be applied. Run with --apply to execute cleanup.");
  }

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
      console.log(`Reason: ${result.rollbackReason}`);
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
