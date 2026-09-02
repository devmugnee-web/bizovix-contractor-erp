ALTER TABLE "AccountingSettings"
ALTER COLUMN "negativeStockPolicy" SET DEFAULT 'ALLOW_NEGATIVE';

-- This deployment intentionally opts existing companies into the agreed
-- Delivery Challan policy. The valuation engine freezes the last valid moving
-- average while quantity is negative and resumes when stock becomes positive.
UPDATE "AccountingSettings"
SET "negativeStockPolicy" = 'ALLOW_NEGATIVE'
WHERE "negativeStockPolicy" IN ('BLOCKED', 'ALLOW_ZERO');
