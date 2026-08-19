#!/usr/bin/env node

/**
 * CORRECTED FK-AWARE CLEANUP WITH JOIN-BASED DELETION
 * Uses JOINs to find records that belong to the target orgs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Deletion queries (child first, parent later)
const DELETE_QUERIES = [
  // Phase 1: RESTRICT children - join to find org-linked records
  `DELETE FROM tender_security_items tsi WHERE tsi.id IN (
    SELECT tsi.id FROM tender_security_items tsi
    JOIN tender_securities ts ON tsi."tenderSecurityId" = ts.id
    WHERE ts."organizationId" IN ({orgs})
  )`,

  `DELETE FROM credit_commitment_items cci WHERE cci.id IN (
    SELECT cci.id FROM credit_commitment_items cci
    JOIN credit_commitments cc ON cci."creditCommitmentId" = cc.id
    WHERE cc."organizationId" IN ({orgs})
  )`,

  `DELETE FROM grn_items gi WHERE gi.id IN (
    SELECT gi.id FROM grn_items gi
    JOIN goods_receipt_notes grn ON gi."grnId" = grn.id
    WHERE grn."organizationId" IN ({orgs})
  )`,

  `DELETE FROM supplier_bill_items sbi WHERE sbi.id IN (
    SELECT sbi.id FROM supplier_bill_items sbi
    JOIN supplier_bills sb ON sbi."supplierBillId" = sb.id
    WHERE sb."organizationId" IN ({orgs})
  )`,

  `DELETE FROM supplier_payments sp WHERE sp."organizationId" IN ({orgs})`,
  `DELETE FROM dlp_defects WHERE "organizationId" IN ({orgs})`,

  `DELETE FROM retention_releases WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM supplier_bill_deductions WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM journal_lines jl WHERE jl.id IN (
    SELECT jl.id FROM journal_lines jl
    JOIN journal_entries je ON jl."journalEntryId" = je.id
    WHERE je."organizationId" IN ({orgs})
  )`,

  `DELETE FROM variation_items vi WHERE vi.id IN (
    SELECT vi.id FROM variation_items vi
    JOIN variation_orders vo ON vi."variationOrderId" = vo.id
    WHERE vo."organizationId" IN ({orgs})
  )`,

  `DELETE FROM project_bill_items WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM bill_adjustments WHERE "organizationId" IN ({orgs})`,

  `DELETE FROM dlp_extensions WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM expense_attachments WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM document_versions dv WHERE dv.id IN (
    SELECT dv.id FROM document_versions dv
    JOIN documents d ON dv."documentId" = d.id
    WHERE d."organizationId" IN ({orgs})
  )`,

  `DELETE FROM notifications WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM reminders WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM receipts WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM financial_transactions WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM fund_transfers WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM bank_reconciliations WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM cheques WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM documents WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM expenses WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM tender_securities WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM credit_commitments WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM payables WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM journal_entries WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM variation_orders WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM project_bills WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM supplier_bills WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM defect_liability_periods WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM completion_certificates WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM time_extensions WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM project_handovers WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM project_closure_events WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM receipt_sequences WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM expense_heads WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM goods_receipt_notes WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM purchase_order_items WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM purchase_orders WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM rfq_items WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM rfq_suppliers WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM supplier_quotation_items WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM supplier_quotations WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM comparative_statement_suppliers WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM comparative_statements WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM request_for_quotations WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM purchase_requisition_items WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM purchase_requisitions WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM boq_items WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM boq_sections WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM project_budget_lines WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM project_budgets WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM project_contracts WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM receivables WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM performance_guarantees WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM pg_bg_workflows WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM document_purchases WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM tenders WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM cms_works WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM deduction_configs WHERE "organizationId" IN ({orgs})`,
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

  console.log(`✓ Database: ${dbName}\n`);
  return true;
}

async function performCleanup(apply: boolean): Promise<{ success: boolean; deletedCounts: number; error?: string }> {
  try {
    const allOrgs = await prisma.organization.findMany({ select: { id: true } });
    if (allOrgs.length === 0) {
      console.log("⚠️  No organizations found");
      return { success: true, deletedCounts: 0 };
    }

    const orgsStr = allOrgs.map((o) => `'${o.id}'`).join(",");

    if (!apply) {
      console.log(`DRY RUN: Would delete from ${allOrgs.length} org(s)\n`);
      console.log(`Queries queued: ${DELETE_QUERIES.length}`);
      return { success: true, deletedCounts: 0 };
    }

    console.log(`CLEANUP: Deleting ${allOrgs.length} org(s) using ${DELETE_QUERIES.length} queries\n`);

    let totalDeleted = 0;

    await prisma.$transaction(async (tx: any) => {
      for (let i = 0; i < DELETE_QUERIES.length; i++) {
        try {
          const sql = DELETE_QUERIES[i].replace(/{orgs}/g, orgsStr);
          const result = await tx.$executeRawUnsafe(sql);
          if (result > 0) {
            console.log(`  ✓ ${result} rows`);
            totalDeleted += result;
          }
        } catch (err: any) {
          const msg = err.message || err.toString();
          console.error(`  ✗ Query ${i + 1} ERROR: ${msg.substring(0, 120)}`);
          throw new Error(`Query ${i + 1}: ${msg}`);
        }
      }
    }, { isolationLevel: "Serializable", timeout: 300000 });

    console.log(`\n✅ SUCCESS: ${totalDeleted} rows deleted`);
    return { success: true, deletedCounts: totalDeleted };
  } catch (err: any) {
    console.error(`\n❌ FAILED: ${err.message.split("\n")[0]}`);
    return { success: false, deletedCounts: 0, error: err.message };
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\n${apply ? "🔴 APPLY" : "📋 DRY RUN"}\n`);

  if (!await checkEnvironment()) process.exit(1);

  try {
    const result = await performCleanup(apply);
    process.exit(result.success ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
