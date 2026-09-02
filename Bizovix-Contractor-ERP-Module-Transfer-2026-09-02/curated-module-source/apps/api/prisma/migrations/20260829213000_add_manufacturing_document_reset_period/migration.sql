-- Extend controlled manufacturing numbering without changing existing issued numbers.
ALTER TYPE "ManufacturingDocumentKind" ADD VALUE IF NOT EXISTS 'BOM';

CREATE TYPE "ManufacturingDocumentResetPeriod" AS ENUM ('NEVER', 'ANNUAL', 'MONTHLY');

ALTER TABLE "ManufacturingDocumentSequence"
  ADD COLUMN "resetPeriod" "ManufacturingDocumentResetPeriod" NOT NULL DEFAULT 'ANNUAL',
  ADD COLUMN "lastIssuedPeriod" TEXT;

UPDATE "ManufacturingDocumentSequence"
SET "resetPeriod" = CASE WHEN "resetAnnually" THEN 'ANNUAL'::"ManufacturingDocumentResetPeriod"
                         ELSE 'NEVER'::"ManufacturingDocumentResetPeriod" END,
    "lastIssuedPeriod" = CASE WHEN "lastIssuedYear" IS NULL THEN NULL ELSE "lastIssuedYear"::TEXT END;

ALTER TABLE "ManufacturingDocumentNumber" ADD COLUMN "issuedPeriod" TEXT;
UPDATE "ManufacturingDocumentNumber" SET "issuedPeriod" = "issuedYear"::TEXT;
ALTER TABLE "ManufacturingDocumentNumber" ALTER COLUMN "issuedPeriod" SET NOT NULL;
