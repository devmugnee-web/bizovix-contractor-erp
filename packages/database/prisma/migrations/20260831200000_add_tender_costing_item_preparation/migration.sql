-- Persist the costing date and preparer on each individual costing item.
ALTER TABLE "tender_costing_items"
  ADD COLUMN "costingDate" TIMESTAMP(3),
  ADD COLUMN "preparedByUserId" TEXT,
  ADD COLUMN "preparedByName" TEXT;

UPDATE "tender_costing_items" AS item
SET
  "costingDate" = costing."costingDate",
  "preparedByUserId" = costing."preparedByUserId",
  "preparedByName" = costing."preparedByName"
FROM "tender_costings" AS costing
WHERE item."organizationId" = costing."organizationId"
  AND item."costingId" = costing."id";

ALTER TABLE "tender_costing_items"
  ALTER COLUMN "costingDate" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "costingDate" SET NOT NULL;
