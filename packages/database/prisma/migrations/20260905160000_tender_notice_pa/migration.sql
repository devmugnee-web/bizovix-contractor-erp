ALTER TABLE "tenders"
  ADD COLUMN "preBidEndDate" TIMESTAMP(3),
  ADD COLUMN "documentFee" DECIMAL(18,2),
  ADD COLUMN "paName" TEXT,
  ADD COLUMN "paDesignation" TEXT,
  ADD COLUMN "paPhone" TEXT,
  ADD COLUMN "paAddress" TEXT,
  ADD COLUMN "noticeOrganization" TEXT;

ALTER TABLE "pg_bg_workflows" ADD COLUMN "contactSnapshot" JSONB;
