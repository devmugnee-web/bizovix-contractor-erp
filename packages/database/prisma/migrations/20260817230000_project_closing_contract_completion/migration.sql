ALTER TYPE "InstrumentStatus" ADD VALUE IF NOT EXISTS 'RELEASE_REQUESTED';
ALTER TYPE "InstrumentStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "InstrumentStatus" ADD VALUE IF NOT EXISTS 'ENCASHED';
ALTER TYPE "InstrumentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "CmsWorkStatus" ADD VALUE IF NOT EXISTS 'COMPLETION_PENDING';
ALTER TYPE "CmsWorkStatus" ADD VALUE IF NOT EXISTS 'DLP';
ALTER TYPE "CmsWorkStatus" ADD VALUE IF NOT EXISTS 'CLOSEOUT_PENDING';

CREATE TYPE "CompletionCertificateStatus" AS ENUM ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED');
CREATE TYPE "DlpStatus" AS ENUM ('NOT_STARTED','ACTIVE','EXPIRED','COMPLETED','EXTENDED');
CREATE TYPE "DefectStatus" AS ENUM ('OPEN','IN_PROGRESS','RECTIFIED','VERIFIED','CLOSED');
CREATE TYPE "RetentionReleaseStatus" AS ENUM ('DRAFT','SUBMITTED','APPROVED','RELEASED','CANCELLED');
CREATE TYPE "HandoverStatus" AS ENUM ('DRAFT','SUBMITTED','COMPLETED','CANCELLED');
CREATE TYPE "HandoverType" AS ENUM ('PROVISIONAL','FINAL');

ALTER TABLE "performance_guarantees" ADD COLUMN "releaseRequestDate" TIMESTAMP(3), ADD COLUMN "releaseDate" TIMESTAMP(3), ADD COLUMN "releaseReference" TEXT, ADD COLUMN "bankConfirmation" TEXT, ADD COLUMN "releaseRemarks" TEXT;

CREATE TABLE "completion_certificates" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "workId" TEXT NOT NULL, "contractId" TEXT NOT NULL,
  "certificateNo" TEXT NOT NULL, "completionType" TEXT NOT NULL DEFAULT 'FINAL', "applicationDate" TIMESTAMP(3) NOT NULL,
  "actualCompletionDate" TIMESTAMP(3) NOT NULL, "certifiedCompletionDate" TIMESTAMP(3), "issuingAuthority" TEXT,
  "certificateDate" TIMESTAMP(3), "remarks" TEXT, "status" "CompletionCertificateStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT, "approvedById" TEXT, "approvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "completion_certificates_organizationId_certificateNo_key" ON "completion_certificates"("organizationId","certificateNo");
CREATE INDEX "completion_certificates_organizationId_workId_status_idx" ON "completion_certificates"("organizationId","workId","status");

CREATE TABLE "defect_liability_periods" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "workId" TEXT NOT NULL, "contractId" TEXT NOT NULL,
  "completionCertificateId" TEXT NOT NULL, "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3) NOT NULL,
  "durationDays" INTEGER NOT NULL, "status" "DlpStatus" NOT NULL DEFAULT 'NOT_STARTED', "remarks" TEXT,
  "createdById" TEXT, "completedById" TEXT, "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "defect_liability_periods_completionCertificateId_key" ON "defect_liability_periods"("completionCertificateId");
CREATE INDEX "defect_liability_periods_organizationId_status_endDate_idx" ON "defect_liability_periods"("organizationId","status","endDate");
CREATE INDEX "defect_liability_periods_organizationId_workId_idx" ON "defect_liability_periods"("organizationId","workId");

CREATE TABLE "dlp_extensions" (
  "id" TEXT PRIMARY KEY, "dlpId" TEXT NOT NULL, "previousEndDate" TIMESTAMP(3) NOT NULL, "revisedEndDate" TIMESTAMP(3) NOT NULL,
  "extensionDays" INTEGER NOT NULL, "reason" TEXT NOT NULL, "approvedById" TEXT NOT NULL, "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "dlp_extensions_dlpId_idx" ON "dlp_extensions"("dlpId");

CREATE TABLE "dlp_defects" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "dlpId" TEXT NOT NULL, "workId" TEXT NOT NULL, "defectNo" TEXT NOT NULL,
  "description" TEXT NOT NULL, "reportedDate" TIMESTAMP(3) NOT NULL, "reportedBy" TEXT, "responsiblePerson" TEXT,
  "targetRectificationDate" TIMESTAMP(3), "rectifiedDate" TIMESTAMP(3), "status" "DefectStatus" NOT NULL DEFAULT 'OPEN',
  "mandatory" BOOLEAN NOT NULL DEFAULT true, "remarks" TEXT, "createdById" TEXT, "verifiedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "dlp_defects_organizationId_defectNo_key" ON "dlp_defects"("organizationId","defectNo");
CREATE INDEX "dlp_defects_organizationId_workId_status_idx" ON "dlp_defects"("organizationId","workId","status");

CREATE TABLE "retention_releases" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "workId" TEXT NOT NULL, "contractId" TEXT NOT NULL, "releaseNo" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL, "releaseDueDate" TIMESTAMP(3), "releaseDate" TIMESTAMP(3), "reference" TEXT, "remarks" TEXT,
  "status" "RetentionReleaseStatus" NOT NULL DEFAULT 'DRAFT', "createdById" TEXT, "approvedById" TEXT, "releasedById" TEXT,
  "journalEntryId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "retention_releases_journalEntryId_key" ON "retention_releases"("journalEntryId");
CREATE UNIQUE INDEX "retention_releases_organizationId_releaseNo_key" ON "retention_releases"("organizationId","releaseNo");
CREATE INDEX "retention_releases_organizationId_workId_status_idx" ON "retention_releases"("organizationId","workId","status");

CREATE TABLE "project_handovers" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "workId" TEXT NOT NULL, "contractId" TEXT NOT NULL, "completionCertificateId" TEXT,
  "handoverNo" TEXT NOT NULL, "handoverType" "HandoverType" NOT NULL DEFAULT 'FINAL', "handoverDate" TIMESTAMP(3) NOT NULL,
  "handedOverBy" TEXT NOT NULL, "receivedBy" TEXT NOT NULL, "authority" TEXT NOT NULL, "remarks" TEXT,
  "status" "HandoverStatus" NOT NULL DEFAULT 'DRAFT', "createdById" TEXT, "completedById" TEXT, "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "project_handovers_organizationId_handoverNo_key" ON "project_handovers"("organizationId","handoverNo");
CREATE INDEX "project_handovers_organizationId_workId_status_idx" ON "project_handovers"("organizationId","workId","status");

CREATE TABLE "project_closure_events" (
  "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "workId" TEXT NOT NULL, "action" TEXT NOT NULL, "reason" TEXT,
  "overrideReason" TEXT, "previousStatus" "CmsWorkStatus" NOT NULL, "newStatus" "CmsWorkStatus" NOT NULL,
  "performedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "project_closure_events_organizationId_workId_createdAt_idx" ON "project_closure_events"("organizationId","workId","createdAt");

ALTER TABLE "documents" ADD COLUMN "completionCertificateId" TEXT, ADD COLUMN "dlpId" TEXT, ADD COLUMN "defectId" TEXT, ADD COLUMN "retentionReleaseId" TEXT, ADD COLUMN "projectHandoverId" TEXT;

ALTER TABLE "completion_certificates" ADD CONSTRAINT "completion_certificates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "completion_certificates_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id"), ADD CONSTRAINT "completion_certificates_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id");
ALTER TABLE "defect_liability_periods" ADD CONSTRAINT "defect_liability_periods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "defect_liability_periods_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id"), ADD CONSTRAINT "defect_liability_periods_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id"),
  ADD CONSTRAINT "defect_liability_periods_completionCertificateId_fkey" FOREIGN KEY ("completionCertificateId") REFERENCES "completion_certificates"("id");
ALTER TABLE "dlp_extensions" ADD CONSTRAINT "dlp_extensions_dlpId_fkey" FOREIGN KEY ("dlpId") REFERENCES "defect_liability_periods"("id") ON DELETE CASCADE;
ALTER TABLE "dlp_defects" ADD CONSTRAINT "dlp_defects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "dlp_defects_dlpId_fkey" FOREIGN KEY ("dlpId") REFERENCES "defect_liability_periods"("id"), ADD CONSTRAINT "dlp_defects_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id");
ALTER TABLE "retention_releases" ADD CONSTRAINT "retention_releases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "retention_releases_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id"), ADD CONSTRAINT "retention_releases_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id"),
  ADD CONSTRAINT "retention_releases_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id");
ALTER TABLE "project_handovers" ADD CONSTRAINT "project_handovers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "project_handovers_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id"), ADD CONSTRAINT "project_handovers_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id"),
  ADD CONSTRAINT "project_handovers_completionCertificateId_fkey" FOREIGN KEY ("completionCertificateId") REFERENCES "completion_certificates"("id");
ALTER TABLE "project_closure_events" ADD CONSTRAINT "project_closure_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "project_closure_events_workId_fkey" FOREIGN KEY ("workId") REFERENCES "cms_works"("id");
ALTER TABLE "documents" ADD CONSTRAINT "documents_completionCertificateId_fkey" FOREIGN KEY ("completionCertificateId") REFERENCES "completion_certificates"("id"),
  ADD CONSTRAINT "documents_dlpId_fkey" FOREIGN KEY ("dlpId") REFERENCES "defect_liability_periods"("id"), ADD CONSTRAINT "documents_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES "dlp_defects"("id"),
  ADD CONSTRAINT "documents_retentionReleaseId_fkey" FOREIGN KEY ("retentionReleaseId") REFERENCES "retention_releases"("id"), ADD CONSTRAINT "documents_projectHandoverId_fkey" FOREIGN KEY ("projectHandoverId") REFERENCES "project_handovers"("id");

CREATE UNIQUE INDEX "project_bills_one_active_final_per_project" ON "project_bills"("organizationId","cmsWorkId") WHERE "billType" = 'FINAL' AND "status" NOT IN ('CANCELLED','REJECTED');
