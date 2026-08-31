-- Tender intake -> costing approval workflow.
--
-- The business Tender ID remains nullable in Prisma only for legacy rows. Existing
-- null/blank rows are explicitly marked as exempt; every new row defaults to
-- non-exempt and is required by the check constraint to carry a normalized ID.

CREATE TYPE "TenderProcurementMethod" AS ENUM (
  'OTM', 'RFQ', 'LTM', 'TSTM', 'QCBS', 'LCS', 'SFB', 'DC',
  'SBCQ', 'SSS', 'IC', 'CSE', 'DPM', 'OSTETM', 'RFQU', 'RFQL'
);

CREATE TYPE "TenderCostingApprovalStatus" AS ENUM (
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'
);

CREATE TYPE "TenderCostingStatus" AS ENUM (
  'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
);

ALTER TABLE "tenders"
  RENAME COLUMN "procurementMethod" TO "legacyProcurementMethod";

ALTER TABLE "tenders"
  ADD COLUMN "procurementMethod" "TenderProcurementMethod" NOT NULL DEFAULT 'OTM',
  ADD COLUMN "tenderIdNormalized" TEXT,
  ADD COLUMN "legacyTenderIdExempt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "costingApprovalStatus" "TenderCostingApprovalStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "payOrderRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "payOrderAmount" DECIMAL(18,2),
  ADD COLUMN "foundByUserId" TEXT,
  ADD COLUMN "findingDate" TIMESTAMP(3),
  ADD COLUMN "remarks" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "costingSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "costingSubmittedById" TEXT,
  ADD COLUMN "costingApprovedAt" TIMESTAMP(3),
  ADD COLUMN "costingApprovedById" TEXT,
  ADD COLUMN "costingRejectedAt" TIMESTAMP(3),
  ADD COLUMN "costingRejectedById" TEXT,
  ADD COLUMN "costingRejectionReason" TEXT;


UPDATE "tenders"
SET "procurementMethod" = UPPER(BTRIM("legacyProcurementMethod"))::"TenderProcurementMethod"
WHERE UPPER(BTRIM("legacyProcurementMethod")) IN (
  'OTM', 'RFQ', 'LTM', 'TSTM', 'QCBS', 'LCS', 'SFB', 'DC',
  'SBCQ', 'SSS', 'IC', 'CSE', 'DPM', 'OSTETM', 'RFQU', 'RFQL'
);

UPDATE "tenders"
SET "legacyTenderIdExempt" = true
WHERE NULLIF(BTRIM("egpTenderId"), '') IS NULL;

UPDATE "tenders"
SET "tenderIdNormalized" = UPPER(
  REGEXP_REPLACE(BTRIM("egpTenderId"), '[[:space:]]+', ' ', 'g')
)
WHERE NULLIF(BTRIM("egpTenderId"), '') IS NOT NULL;

-- Do not silently rewrite or delete historical duplicates. Abort with an
-- actionable error so the tenant can reconcile those records first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "tenders"
    WHERE "tenderIdNormalized" IS NOT NULL
    GROUP BY "organizationId", "tenderIdNormalized"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enable normalized Tender ID uniqueness: legacy duplicate Tender IDs exist within an organization';
  END IF;
END $$;

CREATE UNIQUE INDEX "tenders_organizationId_tenderIdNormalized_key"
  ON "tenders"("organizationId", "tenderIdNormalized");

CREATE INDEX "tenders_organizationId_costingApprovalStatus_updatedAt_idx"
  ON "tenders"("organizationId", "costingApprovalStatus", "updatedAt");

ALTER TABLE "tenders"
  ADD CONSTRAINT "tenders_business_id_required_check" CHECK (
    (
      "legacyTenderIdExempt" = true
      AND NULLIF(BTRIM("egpTenderId"), '') IS NULL
      AND "tenderIdNormalized" IS NULL
    )
    OR (
      NULLIF(BTRIM("egpTenderId"), '') IS NOT NULL
      AND "tenderIdNormalized" = UPPER(
        REGEXP_REPLACE(BTRIM("egpTenderId"), '[[:space:]]+', ' ', 'g')
      )
    )
  ),
  ADD CONSTRAINT "tenders_pay_order_check" CHECK (
    ("payOrderRequired" = true AND "payOrderAmount" > 0)
    OR ("payOrderRequired" = false AND "payOrderAmount" IS NULL)
  ),
  ADD CONSTRAINT "tenders_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "tenders_costing_approval_state_check" CHECK (
    (
      "costingApprovalStatus" = 'DRAFT'
      AND "costingSubmittedAt" IS NULL
      AND "costingApprovedAt" IS NULL
      AND "costingRejectedAt" IS NULL
      AND "costingRejectionReason" IS NULL
    )
    OR (
      "costingApprovalStatus" = 'PENDING_APPROVAL'
      AND "costingSubmittedAt" IS NOT NULL
      AND "costingApprovedAt" IS NULL
      AND "costingRejectedAt" IS NULL
      AND "costingRejectionReason" IS NULL
    )
    OR (
      "costingApprovalStatus" = 'APPROVED'
      AND "costingSubmittedAt" IS NOT NULL
      AND "costingApprovedAt" IS NOT NULL
      AND "costingRejectedAt" IS NULL
      AND "costingRejectionReason" IS NULL
    )
    OR (
      "costingApprovalStatus" = 'REJECTED'
      AND "costingSubmittedAt" IS NOT NULL
      AND "costingApprovedAt" IS NULL
      AND "costingRejectedAt" IS NOT NULL
      AND NULLIF(BTRIM("costingRejectionReason"), '') IS NOT NULL
    )
  );

ALTER TABLE "tenders"
  ADD CONSTRAINT "tenders_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "tenders_foundByUserId_fkey"
    FOREIGN KEY ("foundByUserId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tenders_costingSubmittedById_fkey"
    FOREIGN KEY ("costingSubmittedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tenders_costingApprovedById_fkey"
    FOREIGN KEY ("costingApprovedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tenders_costingRejectedById_fkey"
    FOREIGN KEY ("costingRejectedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "tender_costings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tenderId" TEXT NOT NULL,
  "status" "TenderCostingStatus" NOT NULL DEFAULT 'READY',
  "costingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "costingVersion" INTEGER NOT NULL DEFAULT 1,
  "remarks" TEXT,
  "preparedByUserId" TEXT,
  "preparedByName" TEXT,
  "estimatedValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "estimatedCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "ourCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "marginPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "freightCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "installationCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "otherCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "contingencyPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "contingencyAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "validityDays" INTEGER,
  "paymentTermId" TEXT,
  "deliveryTime" TEXT,
  "warranty" TEXT,
  "assignedToUserId" TEXT,
  "assignedToName" TEXT,
  "approvedForCostingAt" TIMESTAMP(3) NOT NULL,
  "approvedForCostingById" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tender_costings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tender_costing_items" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "costingId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "secondaryDescription" TEXT,
  "unit" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unitCost" DECIMAL(18,2) NOT NULL,
  "marginPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "totalCost" DECIMAL(18,2) NOT NULL,
  "ourCost" DECIMAL(18,2) NOT NULL,
  "remarks" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tender_costing_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_terms_organizationId_id_key"
  ON "payment_terms"("organizationId", "id");

CREATE UNIQUE INDEX "tender_costings_organizationId_id_key"
  ON "tender_costings"("organizationId", "id");

CREATE UNIQUE INDEX "tender_costings_organizationId_tenderId_key"
  ON "tender_costings"("organizationId", "tenderId");

CREATE INDEX "tender_costings_organizationId_status_updatedAt_idx"
  ON "tender_costings"("organizationId", "status", "updatedAt");

CREATE INDEX "tender_costings_organizationId_assignedToUserId_idx"
  ON "tender_costings"("organizationId", "assignedToUserId");

CREATE INDEX "tender_costing_items_organizationId_costingId_sortOrder_idx"
  ON "tender_costing_items"("organizationId", "costingId", "sortOrder");

ALTER TABLE "tender_costings"
  ADD CONSTRAINT "tender_costings_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "tender_costings_organizationId_tenderId_fkey"
    FOREIGN KEY ("organizationId", "tenderId")
    REFERENCES "tenders"("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tender_costings_organizationId_paymentTermId_fkey"
    FOREIGN KEY ("organizationId", "paymentTermId")
    REFERENCES "payment_terms"("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tender_costings_preparedByUserId_fkey"
    FOREIGN KEY ("preparedByUserId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tender_costings_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tender_costings_approvedForCostingById_fkey"
    FOREIGN KEY ("approvedForCostingById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tender_costing_items"
  ADD CONSTRAINT "tender_costing_items_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "tender_costing_items_organizationId_costingId_fkey"
    FOREIGN KEY ("organizationId", "costingId")
    REFERENCES "tender_costings"("organizationId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tender_costings"
  ADD CONSTRAINT "tender_costings_values_check" CHECK (
    "exchangeRate" > 0
    AND "costingVersion" > 0
    AND "version" > 0
    AND "estimatedValue" >= 0
    AND "estimatedCost" >= 0
    AND "ourCost" >= 0
    AND "marginPercent" >= 0 AND "marginPercent" <= 100
    AND "freightCost" >= 0
    AND "installationCost" >= 0
    AND "otherCost" >= 0
    AND "contingencyPercent" >= 0 AND "contingencyPercent" <= 100
    AND "contingencyAmount" >= 0
    AND ("validityDays" IS NULL OR "validityDays" > 0)
  );

ALTER TABLE "tender_costing_items"
  ADD CONSTRAINT "tender_costing_items_values_check" CHECK (
    NULLIF(BTRIM("description"), '') IS NOT NULL
    AND NULLIF(BTRIM("unit"), '') IS NOT NULL
    AND "quantity" > 0
    AND "unitCost" >= 0
    AND "marginPercent" >= 0 AND "marginPercent" <= 100
    AND "totalCost" >= 0
    AND "ourCost" >= 0
    AND "ourCost" <= "totalCost"
    AND "sortOrder" >= 0
  );

INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
  ('perm-tender-costing-read', 'tender.costing.read', 'tender', 'View tender costing records'),
  ('perm-tender-costing-update', 'tender.costing.update', 'tender', 'Update tender costing records'),
  ('perm-tender-costing-approve', 'tender.costing.approve', 'tender', 'Approve or reject tenders for costing')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp-' || md5(r."id" || p."id"), r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."isSystem" = true AND p."key" LIKE 'tender.costing.%'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
