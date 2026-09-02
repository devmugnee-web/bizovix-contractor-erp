-- LC Payment is an additional LC-related payment in this workflow, separate
-- from the purchase value already recorded on the LC. Include both the cost
-- head default and existing entries in product-wise landed-cost allocation.
UPDATE "LcCostHead"
SET "includeInLandedCost" = TRUE, "updatedAt" = NOW()
WHERE "code" = 'LC_PAYMENT';

UPDATE "LcCostEntry" AS entry
SET "includeInLandedCost" = TRUE, "updatedAt" = NOW()
FROM "LcCostHead" AS head
WHERE entry."costHeadId" = head."id"
  AND head."code" = 'LC_PAYMENT';
