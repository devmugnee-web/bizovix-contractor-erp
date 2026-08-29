CREATE TYPE "ChallanSubmissionStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PAYMENT_RELEASED',
  'REJECTED',
  'CANCELLED'
);

CREATE TABLE "challan_submissions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "cmsWorkId" TEXT NOT NULL,
  "contractId" TEXT,
  "challanNo" TEXT NOT NULL,
  "challanDate" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "challanType" TEXT NOT NULL,
  "challanMonth" TIMESTAMP(3) NOT NULL,
  "periodFrom" TIMESTAMP(3) NOT NULL,
  "periodTo" TIMESTAMP(3) NOT NULL,
  "receivedBy" TEXT NOT NULL,
  "receivedAt" TEXT NOT NULL,
  "submittedTo" TEXT NOT NULL,
  "paymentFrom" TEXT NOT NULL,
  "remarks" TEXT,
  "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "approvedAmount" DECIMAL(18,2),
  "status" "ChallanSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT,
  "submittedAt" TIMESTAMP(3),
  "submittedById" TEXT,
  "reviewStartedAt" TIMESTAMP(3),
  "reviewStartedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "paymentReleasedAt" TIMESTAMP(3),
  "paymentReleasedById" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectedById" TEXT,
  "rejectionReason" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancelledById" TEXT,
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "challan_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "challan_submission_items" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "challanSubmissionId" TEXT NOT NULL,
  "itemCode" TEXT,
  "description" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "rate" DECIMAL(18,2) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "challan_submission_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "challan_submission_status_history" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "challanSubmissionId" TEXT NOT NULL,
  "fromStatus" "ChallanSubmissionStatus",
  "toStatus" "ChallanSubmissionStatus" NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "actedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "challan_submission_status_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "documents" ADD COLUMN "challanSubmissionId" TEXT;

CREATE UNIQUE INDEX "challan_submissions_organizationId_challanNo_key"
  ON "challan_submissions"("organizationId", "challanNo");
CREATE INDEX "challan_submissions_organizationId_cmsWorkId_status_idx"
  ON "challan_submissions"("organizationId", "cmsWorkId", "status");
CREATE INDEX "challan_submissions_organizationId_status_challanDate_idx"
  ON "challan_submissions"("organizationId", "status", "challanDate");
CREATE INDEX "challan_submission_items_organizationId_challanSubmissionId_idx"
  ON "challan_submission_items"("organizationId", "challanSubmissionId");
CREATE INDEX "challan_submission_status_history_organizationId_challanSubmissionId_createdAt_idx"
  ON "challan_submission_status_history"("organizationId", "challanSubmissionId", "createdAt");
CREATE INDEX "documents_challanSubmissionId_idx" ON "documents"("challanSubmissionId");

ALTER TABLE "challan_submissions"
  ADD CONSTRAINT "challan_submissions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "challan_submissions_cmsWorkId_fkey"
  FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "challan_submissions_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "challan_submission_items"
  ADD CONSTRAINT "challan_submission_items_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "challan_submission_items_challanSubmissionId_fkey"
  FOREIGN KEY ("challanSubmissionId") REFERENCES "challan_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "challan_submission_status_history"
  ADD CONSTRAINT "challan_submission_status_history_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "challan_submission_status_history_challanSubmissionId_fkey"
  FOREIGN KEY ("challanSubmissionId") REFERENCES "challan_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_challanSubmissionId_fkey"
  FOREIGN KEY ("challanSubmissionId") REFERENCES "challan_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
  ('perm-challan-read', 'challan_submission.read', 'challan_submission', 'View challan submissions'),
  ('perm-challan-create', 'challan_submission.create', 'challan_submission', 'Create challan submission drafts'),
  ('perm-challan-update', 'challan_submission.update', 'challan_submission', 'Update challan submission drafts'),
  ('perm-challan-submit', 'challan_submission.submit', 'challan_submission', 'Submit challans for review'),
  ('perm-challan-review', 'challan_submission.review', 'challan_submission', 'Start challan review'),
  ('perm-challan-approve', 'challan_submission.approve', 'challan_submission', 'Approve challan submissions'),
  ('perm-challan-reject', 'challan_submission.reject', 'challan_submission', 'Reject challan submissions'),
  ('perm-challan-release', 'challan_submission.release_payment', 'challan_submission', 'Release challan payment'),
  ('perm-challan-cancel', 'challan_submission.cancel', 'challan_submission', 'Cancel challan submissions')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp-' || md5(r."id" || p."id"), r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."isSystem" = true AND p."key" LIKE 'challan_submission.%'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
