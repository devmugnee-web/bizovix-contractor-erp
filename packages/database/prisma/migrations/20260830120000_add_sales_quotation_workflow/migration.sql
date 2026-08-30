CREATE TYPE "SalesQuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');

CREATE TABLE "sales_quotations" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "quotationNo" TEXT NOT NULL,
  "customerId" TEXT NOT NULL, "workName" TEXT NOT NULL, "quotationDate" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL, "currency" TEXT NOT NULL DEFAULT 'BDT',
  "status" "SalesQuotationStatus" NOT NULL DEFAULT 'DRAFT', "salesPersonId" TEXT,
  "remarks" TEXT, "version" INTEGER NOT NULL DEFAULT 1,
  "totalCost" DECIMAL(18,2) NOT NULL DEFAULT 0, "itemTaxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "totalSelling" DECIMAL(18,2) NOT NULL DEFAULT 0, "overheadTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "subtotalBeforeVat" DECIMAL(18,2) NOT NULL DEFAULT 0, "vatApplicable" BOOLEAN NOT NULL DEFAULT false,
  "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0, "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "grandTotal" DECIMAL(18,2) NOT NULL DEFAULT 0, "sentAt" TIMESTAMP(3), "sentById" TEXT,
  "decisionDate" TIMESTAMP(3), "decisionById" TEXT, "acceptedAmount" DECIMAL(18,2),
  "customerPoWoNo" TEXT, "rejectionReason" TEXT, "lastFollowUpAt" TIMESTAMP(3),
  "nextFollowUpAt" TIMESTAMP(3), "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_quotations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_quotation_items" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "quotationId" TEXT NOT NULL,
  "description" TEXT NOT NULL, "quantity" DECIMAL(18,3) NOT NULL, "unit" TEXT NOT NULL,
  "unitCost" DECIMAL(18,2) NOT NULL, "totalCost" DECIMAL(18,2) NOT NULL,
  "taxPct" DECIMAL(5,2) NOT NULL, "taxAmount" DECIMAL(18,2) NOT NULL,
  "unitPrice" DECIMAL(18,2) NOT NULL, "totalPrice" DECIMAL(18,2) NOT NULL,
  "profit" DECIMAL(18,2) NOT NULL, "marginPct" DECIMAL(7,4) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "sales_quotation_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_quotation_overheads" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "quotationId" TEXT NOT NULL,
  "description" TEXT NOT NULL, "amount" DECIMAL(18,2) NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_quotation_overheads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_quotation_follow_ups" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "quotationId" TEXT NOT NULL,
  "followedUpAt" TIMESTAMP(3) NOT NULL, "nextFollowUpAt" TIMESTAMP(3), "notes" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_quotation_follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_quotation_status_history" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "quotationId" TEXT NOT NULL,
  "fromStatus" "SalesQuotationStatus", "toStatus" "SalesQuotationStatus" NOT NULL,
  "changedById" TEXT NOT NULL, "reason" TEXT, "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_quotation_status_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_quotations_organizationId_quotationNo_key" ON "sales_quotations"("organizationId", "quotationNo");
CREATE INDEX "sales_quotations_organizationId_status_quotationDate_idx" ON "sales_quotations"("organizationId", "status", "quotationDate");
CREATE INDEX "sales_quotations_organizationId_customerId_idx" ON "sales_quotations"("organizationId", "customerId");
CREATE INDEX "sales_quotations_organizationId_salesPersonId_idx" ON "sales_quotations"("organizationId", "salesPersonId");
CREATE INDEX "sales_quotations_organizationId_workName_idx" ON "sales_quotations"("organizationId", "workName");
CREATE INDEX "sales_quotation_items_organizationId_quotationId_sortOrder_idx" ON "sales_quotation_items"("organizationId", "quotationId", "sortOrder");
CREATE INDEX "sales_quotation_overheads_organizationId_quotationId_sortOrder_idx" ON "sales_quotation_overheads"("organizationId", "quotationId", "sortOrder");
CREATE INDEX "sales_quotation_follow_ups_organizationId_quotationId_followedUpAt_idx" ON "sales_quotation_follow_ups"("organizationId", "quotationId", "followedUpAt");
CREATE INDEX "sales_quotation_follow_ups_organizationId_nextFollowUpAt_idx" ON "sales_quotation_follow_ups"("organizationId", "nextFollowUpAt");
CREATE INDEX "sales_quotation_status_history_organizationId_quotationId_changedAt_idx" ON "sales_quotation_status_history"("organizationId", "quotationId", "changedAt");

ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "organization_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_salesPersonId_fkey" FOREIGN KEY ("salesPersonId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_decisionById_fkey" FOREIGN KEY ("decisionById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_items" ADD CONSTRAINT "sales_quotation_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_items" ADD CONSTRAINT "sales_quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "sales_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_overheads" ADD CONSTRAINT "sales_quotation_overheads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_overheads" ADD CONSTRAINT "sales_quotation_overheads_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "sales_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_follow_ups" ADD CONSTRAINT "sales_quotation_follow_ups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_follow_ups" ADD CONSTRAINT "sales_quotation_follow_ups_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "sales_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_follow_ups" ADD CONSTRAINT "sales_quotation_follow_ups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_status_history" ADD CONSTRAINT "sales_quotation_status_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_status_history" ADD CONSTRAINT "sales_quotation_status_history_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "sales_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_quotation_status_history" ADD CONSTRAINT "sales_quotation_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_quotations"
  ADD CONSTRAINT "sales_quotations_date_range_check" CHECK ("validUntil" >= "quotationDate"),
  ADD CONSTRAINT "sales_quotations_totals_nonnegative_check" CHECK (
    "totalCost" >= 0 AND "itemTaxTotal" >= 0 AND "totalSelling" >= 0 AND
    "overheadTotal" >= 0 AND "subtotalBeforeVat" >= 0 AND "vatAmount" >= 0 AND "grandTotal" >= 0
  ),
  ADD CONSTRAINT "sales_quotations_vat_rate_check" CHECK ("vatRate" >= 0 AND "vatRate" <= 100),
  ADD CONSTRAINT "sales_quotations_result_fields_check" CHECK (
    ("status" = 'ACCEPTED' AND "acceptedAmount" > 0 AND "acceptedAmount" <= "grandTotal" AND COALESCE(btrim("customerPoWoNo"), '') <> '' AND "rejectionReason" IS NULL)
    OR ("status" = 'REJECTED' AND "acceptedAmount" IS NULL AND "customerPoWoNo" IS NULL AND COALESCE(btrim("rejectionReason"), '') <> '')
    OR ("status" IN ('DRAFT', 'SENT') AND "acceptedAmount" IS NULL AND "customerPoWoNo" IS NULL AND "rejectionReason" IS NULL)
  );

ALTER TABLE "sales_quotation_items"
  ADD CONSTRAINT "sales_quotation_items_values_check" CHECK (
    "quantity" > 0 AND "unitCost" >= 0 AND "unitPrice" >= 0 AND "taxPct" >= 0 AND "taxPct" <= 100
  );

ALTER TABLE "sales_quotation_overheads"
  ADD CONSTRAINT "sales_quotation_overheads_amount_check" CHECK ("amount" >= 0);

INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
  ('perm-sales-quotation-read', 'sales_quotation.read', 'sales_quotation', 'View sales quotations'),
  ('perm-sales-quotation-create', 'sales_quotation.create', 'sales_quotation', 'Create sales quotations'),
  ('perm-sales-quotation-update', 'sales_quotation.update', 'sales_quotation', 'Update sales quotations and costing'),
  ('perm-sales-quotation-send', 'sales_quotation.send', 'sales_quotation', 'Send sales quotations'),
  ('perm-sales-quotation-result', 'sales_quotation.result', 'sales_quotation', 'Record sales quotation results'),
  ('perm-sales-quotation-follow-up', 'sales_quotation.follow_up', 'sales_quotation', 'Record sales quotation follow-ups'),
  ('perm-sales-quotation-export', 'sales_quotation.export', 'sales_quotation', 'Export sales quotations')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp-' || md5(r."id" || p."id"), r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."isSystem" = true AND p."key" LIKE 'sales_quotation.%'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
