#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Deletion queries with proper JOINs for tables without organizationId
const DELETE_QUERIES = [
  // Phase 1: RESTRICT children
  `DELETE FROM tender_security_items tsi WHERE tsi.id IN (SELECT tsi.id FROM tender_security_items tsi JOIN tender_securities ts ON tsi."tenderSecurityId" = ts.id WHERE ts."organizationId" IN ({orgs}))`,
  `DELETE FROM credit_commitment_items cci WHERE cci.id IN (SELECT cci.id FROM credit_commitment_items cci JOIN credit_commitments cc ON cci."creditCommitmentId" = cc.id WHERE cc."organizationId" IN ({orgs}))`,
  `DELETE FROM grn_items gi WHERE gi.id IN (SELECT gi.id FROM grn_items gi JOIN goods_receipt_notes grn ON gi."grnId" = grn.id WHERE grn."organizationId" IN ({orgs}))`,
  `DELETE FROM supplier_bill_items sbi WHERE sbi."organizationId" IN ({orgs})`,
  `DELETE FROM supplier_payments sp WHERE sp."organizationId" IN ({orgs})`,
  `DELETE FROM dlp_defects WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM retention_releases WHERE "organizationId" IN ({orgs})`,

  // Phase 2: CASCADE children
  `DELETE FROM supplier_bill_deductions WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM journal_lines jl WHERE jl.id IN (SELECT jl.id FROM journal_lines jl JOIN journal_entries je ON jl."journalEntryId" = je.id WHERE je."organizationId" IN ({orgs}))`,
  `DELETE FROM variation_items vi WHERE vi.id IN (SELECT vi.id FROM variation_items vi JOIN variation_orders vo ON vi."variationOrderId" = vo.id WHERE vo."organizationId" IN ({orgs}))`,
  `DELETE FROM project_bill_items pbi WHERE pbi.id IN (SELECT pbi.id FROM project_bill_items pbi JOIN project_bills pb ON pbi."billId" = pb.id WHERE pb."organizationId" IN ({orgs}))`,
  `DELETE FROM bill_adjustments ba WHERE ba.id IN (SELECT ba.id FROM bill_adjustments ba JOIN project_bills pb ON ba."billId" = pb.id WHERE pb."organizationId" IN ({orgs}))`,
  `DELETE FROM dlp_extensions WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM expense_attachments WHERE "organizationId" IN ({orgs})`,
  `DELETE FROM document_versions dv WHERE dv.id IN (SELECT dv.id FROM document_versions dv JOIN documents d ON dv."documentId" = d.id WHERE d."organizationId" IN ({orgs}))`,
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

async function main() {
  const apply = process.argv.includes("--apply");

  try {
    const allOrgs = await prisma.organization.findMany({ select: { id: true } });
    if (allOrgs.length === 0) {
      console.log("No organizations found");
      process.exit(0);
    }

    const orgsStr = allOrgs.map((o) => `'${o.id}'`).join(",");

    if (!apply) {
      console.log(`DRY RUN: ${DELETE_QUERIES.length} queries`);
      process.exit(0);
    }

    let totalDeleted = 0;
    await prisma.$transaction(
      async (tx: any) => {
        for (let i = 0; i < DELETE_QUERIES.length; i++) {
          try {
            const sql = DELETE_QUERIES[i].replace(/{orgs}/g, orgsStr);
            const result = await tx.$executeRawUnsafe(sql);
            totalDeleted += result;
          } catch (err: any) {
            console.error(`Query ${i + 1} failed: ${err.message.substring(0, 200)}`);
            throw err;
          }
        }
      },
      { isolationLevel: "Serializable", timeout: 300000 }
    );

    console.log(`Cleanup complete: ${totalDeleted} rows deleted`);
    process.exit(0);
  } catch (err: any) {
    console.error(`Cleanup failed: ${err.message.split("\n")[0]}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
