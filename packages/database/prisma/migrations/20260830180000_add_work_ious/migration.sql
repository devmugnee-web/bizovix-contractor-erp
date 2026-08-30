CREATE TYPE "WorkIouStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CANCELLED');

CREATE TYPE "WorkIouSettlementStatus" AS ENUM ('PENDING', 'PARTIALLY_SETTLED', 'SETTLED');

CREATE TYPE "WorkIouExpenseFor" AS ENUM ('TENDER', 'PROJECT');

CREATE TYPE "WorkIouPaymentMethod" AS ENUM (
  'CASH',
  'BANK_TRANSFER',
  'CARD',
  'MOBILE_BANKING',
  'CHEQUE',
  'OTHER'
);

CREATE TABLE "work_ious" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "iouNo" TEXT NOT NULL,
  "iouDate" TIMESTAMP(3) NOT NULL,
  "paidOn" TIMESTAMP(3) NOT NULL,
  "paidById" TEXT NOT NULL,
  "paidToName" TEXT NOT NULL,
  "paymentMethod" "WorkIouPaymentMethod" NOT NULL,
  "referenceNo" TEXT,
  "expenseFor" "WorkIouExpenseFor" NOT NULL,
  "tenderId" TEXT,
  "workId" TEXT,
  "purpose" TEXT NOT NULL,
  "remarks" TEXT,
  "otherCharges" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "settledAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "settlementStatus" "WorkIouSettlementStatus" NOT NULL DEFAULT 'PENDING',
  "expectedSettlementDate" TIMESTAMP(3),
  "settlementRemarks" TEXT,
  "status" "WorkIouStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "submittedAt" TIMESTAMP(3),
  "submittedById" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancelledById" TEXT,
  "cancellationReason" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "work_ious_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_ious_context_check" CHECK (
    ("expenseFor" = 'TENDER' AND "tenderId" IS NOT NULL AND "workId" IS NULL)
    OR
    ("expenseFor" = 'PROJECT' AND "workId" IS NOT NULL AND "tenderId" IS NULL)
  ),
  CONSTRAINT "work_ious_money_nonnegative_check" CHECK (
    "otherCharges" >= 0
    AND "subtotal" >= 0
    AND "discount" >= 0
    AND "totalAmount" >= 0
    AND "settledAmount" >= 0
  ),
  CONSTRAINT "work_ious_total_check" CHECK (
    "discount" <= "subtotal" + "otherCharges"
    AND "totalAmount" = "subtotal" + "otherCharges" - "discount"
    AND "settledAmount" <= "totalAmount"
  ),
  CONSTRAINT "work_ious_settlement_status_check" CHECK (
    ("settlementStatus" = 'PENDING' AND "settledAmount" = 0)
    OR ("settlementStatus" = 'PARTIALLY_SETTLED' AND "settledAmount" > 0 AND "settledAmount" < "totalAmount")
    OR ("settlementStatus" = 'SETTLED' AND "totalAmount" > 0 AND "settledAmount" = "totalAmount")
  ),
  CONSTRAINT "work_ious_version_check" CHECK ("version" > 0)
);

CREATE TABLE "work_iou_items" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workIouId" TEXT NOT NULL,
  "expenseDate" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "expenseHeadId" TEXT NOT NULL,
  "categoryName" TEXT NOT NULL,
  "paidToName" TEXT NOT NULL,
  "referenceNo" TEXT,
  "amount" DECIMAL(18,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "work_iou_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_iou_items_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "work_iou_items_sort_order_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "work_iou_attachments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workIouId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_iou_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_iou_attachments_file_size_check" CHECK ("fileSize" > 0)
);

CREATE UNIQUE INDEX "work_ious_organizationId_iouNo_key"
  ON "work_ious"("organizationId", "iouNo");
CREATE INDEX "work_ious_organizationId_status_iouDate_idx"
  ON "work_ious"("organizationId", "status", "iouDate");
CREATE INDEX "work_ious_organizationId_expenseFor_tenderId_idx"
  ON "work_ious"("organizationId", "expenseFor", "tenderId");
CREATE INDEX "work_ious_organizationId_expenseFor_workId_idx"
  ON "work_ious"("organizationId", "expenseFor", "workId");
CREATE INDEX "work_ious_organizationId_paidById_idx"
  ON "work_ious"("organizationId", "paidById");
CREATE INDEX "work_ious_org_settlement_expected_idx"
  ON "work_ious"("organizationId", "settlementStatus", "expectedSettlementDate");
CREATE INDEX "work_iou_items_organizationId_workIouId_sortOrder_idx"
  ON "work_iou_items"("organizationId", "workIouId", "sortOrder");
CREATE INDEX "work_iou_items_organizationId_expenseHeadId_idx"
  ON "work_iou_items"("organizationId", "expenseHeadId");
CREATE INDEX "work_iou_attachments_organizationId_workIouId_idx"
  ON "work_iou_attachments"("organizationId", "workIouId");

ALTER TABLE "work_ious"
  ADD CONSTRAINT "work_ious_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_ious_paidById_fkey"
    FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_ious_tenderId_fkey"
    FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_ious_workId_fkey"
    FOREIGN KEY ("workId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_ious_submittedById_fkey"
    FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "work_ious_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "work_ious_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_iou_items"
  ADD CONSTRAINT "work_iou_items_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_iou_items_workIouId_fkey"
    FOREIGN KEY ("workIouId") REFERENCES "work_ious"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_iou_items_expenseHeadId_fkey"
    FOREIGN KEY ("expenseHeadId") REFERENCES "expense_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_iou_attachments"
  ADD CONSTRAINT "work_iou_attachments_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_iou_attachments_workIouId_fkey"
    FOREIGN KEY ("workIouId") REFERENCES "work_ious"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_iou_attachments_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
  ('perm-work-iou-read', 'work_iou.read', 'work_iou', 'View work IOUs'),
  ('perm-work-iou-create', 'work_iou.create', 'work_iou', 'Create work IOUs'),
  ('perm-work-iou-update', 'work_iou.update', 'work_iou', 'Update draft work IOUs'),
  ('perm-work-iou-submit', 'work_iou.submit', 'work_iou', 'Submit work IOUs'),
  ('perm-work-iou-cancel', 'work_iou.cancel', 'work_iou', 'Cancel work IOUs'),
  ('perm-work-iou-attachment', 'work_iou.attachment', 'work_iou', 'Manage work IOU attachments')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp-' || md5(r."id" || p."id"), r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."isSystem" = true AND p."key" LIKE 'work_iou.%'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
