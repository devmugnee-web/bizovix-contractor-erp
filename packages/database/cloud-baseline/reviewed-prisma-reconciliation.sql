-- SAFETY: this reconciliation is executable only in disposable history-audit databases.
DO $$ BEGIN
  IF current_database() !~ '^bizovix_test_history_[0-9]+_[a-f0-9]{6}$' THEN
    RAISE EXCEPTION 'Prisma reconciliation requires an isolated history-audit database';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "completion_certificates" DROP CONSTRAINT "completion_certificates_contractId_fkey";

-- DropForeignKey
ALTER TABLE "completion_certificates" DROP CONSTRAINT "completion_certificates_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "completion_certificates" DROP CONSTRAINT "completion_certificates_workId_fkey";

-- DropForeignKey
ALTER TABLE "defect_liability_periods" DROP CONSTRAINT "defect_liability_periods_completionCertificateId_fkey";

-- DropForeignKey
ALTER TABLE "defect_liability_periods" DROP CONSTRAINT "defect_liability_periods_contractId_fkey";

-- DropForeignKey
ALTER TABLE "defect_liability_periods" DROP CONSTRAINT "defect_liability_periods_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "defect_liability_periods" DROP CONSTRAINT "defect_liability_periods_workId_fkey";

-- DropForeignKey
ALTER TABLE "dlp_defects" DROP CONSTRAINT "dlp_defects_dlpId_fkey";

-- DropForeignKey
ALTER TABLE "dlp_defects" DROP CONSTRAINT "dlp_defects_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "dlp_defects" DROP CONSTRAINT "dlp_defects_workId_fkey";

-- DropForeignKey
ALTER TABLE "dlp_extensions" DROP CONSTRAINT "dlp_extensions_dlpId_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_completionCertificateId_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_defectId_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_dlpId_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_projectHandoverId_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_retentionReleaseId_fkey";

-- DropForeignKey
ALTER TABLE "organization_contacts" DROP CONSTRAINT "organization_contacts_organizationMasterId_fkey";

-- DropForeignKey
ALTER TABLE "project_closure_events" DROP CONSTRAINT "project_closure_events_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "project_closure_events" DROP CONSTRAINT "project_closure_events_workId_fkey";

-- DropForeignKey
ALTER TABLE "project_handovers" DROP CONSTRAINT "project_handovers_completionCertificateId_fkey";

-- DropForeignKey
ALTER TABLE "project_handovers" DROP CONSTRAINT "project_handovers_contractId_fkey";

-- DropForeignKey
ALTER TABLE "project_handovers" DROP CONSTRAINT "project_handovers_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "project_handovers" DROP CONSTRAINT "project_handovers_workId_fkey";

-- DropForeignKey
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_receiptHeadAccountId_fkey";

-- DropForeignKey
ALTER TABLE "retention_releases" DROP CONSTRAINT "retention_releases_contractId_fkey";

-- DropForeignKey
ALTER TABLE "retention_releases" DROP CONSTRAINT "retention_releases_journalEntryId_fkey";

-- DropForeignKey
ALTER TABLE "retention_releases" DROP CONSTRAINT "retention_releases_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "retention_releases" DROP CONSTRAINT "retention_releases_workId_fkey";

-- DropForeignKey
ALTER TABLE "tenders" DROP CONSTRAINT "tenders_organizationMasterId_fkey";

-- DropIndex
DROP INDEX "cms_works_organizationId_closedAt_idx";

-- DropIndex
DROP INDEX "dlp_defects_organizationId_priority_status_idx";

-- AlterTable
ALTER TABLE "document_purchase_requests" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameForeignKey
ALTER TABLE "tender_vat_tax_entries" RENAME CONSTRAINT "tender_vat_tax_entries_tender_fkey" TO "tender_vat_tax_entries_organizationId_tenderId_fkey";

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES "organization_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES "organization_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_certificates" ADD CONSTRAINT "completion_certificates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_certificates" ADD CONSTRAINT "completion_certificates_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_certificates" ADD CONSTRAINT "completion_certificates_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_liability_periods" ADD CONSTRAINT "defect_liability_periods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_liability_periods" ADD CONSTRAINT "defect_liability_periods_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_liability_periods" ADD CONSTRAINT "defect_liability_periods_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_liability_periods" ADD CONSTRAINT "defect_liability_periods_completionCertificateId_fkey" FOREIGN KEY ("completionCertificateId") REFERENCES "completion_certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dlp_extensions" ADD CONSTRAINT "dlp_extensions_dlpId_fkey" FOREIGN KEY ("dlpId") REFERENCES "defect_liability_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dlp_defects" ADD CONSTRAINT "dlp_defects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dlp_defects" ADD CONSTRAINT "dlp_defects_dlpId_fkey" FOREIGN KEY ("dlpId") REFERENCES "defect_liability_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dlp_defects" ADD CONSTRAINT "dlp_defects_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_releases" ADD CONSTRAINT "retention_releases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_releases" ADD CONSTRAINT "retention_releases_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_releases" ADD CONSTRAINT "retention_releases_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_releases" ADD CONSTRAINT "retention_releases_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_handovers" ADD CONSTRAINT "project_handovers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_handovers" ADD CONSTRAINT "project_handovers_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_handovers" ADD CONSTRAINT "project_handovers_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_handovers" ADD CONSTRAINT "project_handovers_completionCertificateId_fkey" FOREIGN KEY ("completionCertificateId") REFERENCES "completion_certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_closure_events" ADD CONSTRAINT "project_closure_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_closure_events" ADD CONSTRAINT "project_closure_events_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_receiptHeadAccountId_fkey" FOREIGN KEY ("receiptHeadAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_completionCertificateId_fkey" FOREIGN KEY ("completionCertificateId") REFERENCES "completion_certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_dlpId_fkey" FOREIGN KEY ("dlpId") REFERENCES "defect_liability_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES "dlp_defects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_retentionReleaseId_fkey" FOREIGN KEY ("retentionReleaseId") REFERENCES "retention_releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_projectHandoverId_fkey" FOREIGN KEY ("projectHandoverId") REFERENCES "project_handovers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "challan_submission_status_history_organizationId_challanSubmiss" RENAME TO "challan_submission_status_history_organizationId_challanSub_idx";

-- RenameIndex
ALTER INDEX "project_contracts_organizationId_securityDepositReleaseDueDate_" RENAME TO "project_contracts_organizationId_securityDepositReleaseDueD_idx";

-- RenameIndex
ALTER INDEX "sales_quotation_follow_ups_organizationId_quotationId_followedU" RENAME TO "sales_quotation_follow_ups_organizationId_quotationId_follo_idx";

-- RenameIndex
ALTER INDEX "sales_quotation_overheads_organizationId_quotationId_sortOrder_" RENAME TO "sales_quotation_overheads_organizationId_quotationId_sortOr_idx";

-- RenameIndex
ALTER INDEX "sales_quotation_status_history_organizationId_quotationId_chang" RENAME TO "sales_quotation_status_history_organizationId_quotationId_c_idx";

-- RenameIndex
ALTER INDEX "support_ticket_attachments_organizationId_ticketId_messageId_id" RENAME TO "support_ticket_attachments_organizationId_ticketId_messageI_idx";
