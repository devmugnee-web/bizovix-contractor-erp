ALTER TABLE "StockMovement"
  ADD COLUMN "inputUnitCost" DECIMAL(24,6),
  ADD COLUMN "unitCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN "movementValue" DECIMAL(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN "balanceQuantity" DECIMAL(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN "balanceValue" DECIMAL(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN "averageCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
  ADD COLUMN "costingVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "StockMovement_workspaceId_costingVersion_idx" ON "StockMovement"("workspaceId", "costingVersion");

ALTER TABLE "VoucherInventoryItem" ADD COLUMN "sourceInventoryLineId" TEXT;
CREATE INDEX "VoucherInventoryItem_sourceInventoryLineId_idx" ON "VoucherInventoryItem"("sourceInventoryLineId");
ALTER TABLE "VoucherInventoryItem" ADD CONSTRAINT "VoucherInventoryItem_sourceInventoryLineId_fkey"
  FOREIGN KEY ("sourceInventoryLineId") REFERENCES "VoucherInventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Link historical derived-document lines (GRN -> Bill, Delivery -> Invoice,
-- Invoice/Bill -> Return) by stable item/warehouse occurrence.  New writes
-- persist this link directly; this backfill gives legacy returns the same exact
-- source-cost trail wherever the old document relationship is unambiguous.
WITH child_lines AS (
  SELECT
    child."id",
    voucher."sourceVoucherId",
    COALESCE(child."inventoryItemId", 'name:' || lower(trim(child."itemName"))) AS item_key,
    COALESCE(child."warehouseId", '') AS warehouse_key,
    row_number() OVER (
      PARTITION BY child."voucherId", COALESCE(child."inventoryItemId", 'name:' || lower(trim(child."itemName"))), COALESCE(child."warehouseId", '')
      ORDER BY child."createdAt", child."id"
    ) AS occurrence
  FROM "VoucherInventoryItem" child
  JOIN "VoucherEntry" voucher ON voucher."id" = child."voucherId"
  WHERE voucher."sourceVoucherId" IS NOT NULL
), source_lines AS (
  SELECT
    source."id",
    source."voucherId",
    COALESCE(source."inventoryItemId", 'name:' || lower(trim(source."itemName"))) AS item_key,
    COALESCE(source."warehouseId", '') AS warehouse_key,
    row_number() OVER (
      PARTITION BY source."voucherId", COALESCE(source."inventoryItemId", 'name:' || lower(trim(source."itemName"))), COALESCE(source."warehouseId", '')
      ORDER BY source."createdAt", source."id"
    ) AS occurrence
  FROM "VoucherInventoryItem" source
)
UPDATE "VoucherInventoryItem" target
SET "sourceInventoryLineId" = source."id"
FROM child_lines child
JOIN source_lines source
  ON source."voucherId" = child."sourceVoucherId"
 AND source.item_key = child.item_key
 AND source.warehouse_key = child.warehouse_key
 AND source.occurrence = child.occurrence
WHERE target."id" = child."id"
  AND target."sourceInventoryLineId" IS NULL;

-- Preserve the immutable acquisition rate on historical source movements.
-- The service performs the chronological moving-average replay after deploy;
-- costingVersion=0 deliberately marks every legacy row for that rebuild.
WITH voucher_gross AS (
  SELECT "voucherId", SUM("quantity" * "unitPrice") AS gross
  FROM "VoucherInventoryItem"
  GROUP BY "voucherId"
)
UPDATE "StockMovement" movement
SET "inputUnitCost" = source."unitPrice" * CASE
  WHEN gross.gross > 0
    THEN GREATEST(0, gross.gross - COALESCE(voucher."discountAmount", 0)) / gross.gross
  ELSE 1
END
FROM "VoucherInventoryItem" source
JOIN "VoucherEntry" voucher ON voucher."id" = source."voucherId"
JOIN voucher_gross gross ON gross."voucherId" = source."voucherId"
WHERE source."id" = movement."transactionLineId"
  AND movement."movementType" = 'IN'
  AND movement."transactionType" IN ('PURCHASE', 'BILL', 'RECEIPT_NOTE');

UPDATE "StockMovement" movement
SET "inputUnitCost" = adjustment."unitPrice"
FROM "InventoryAdjustment" adjustment
WHERE adjustment."id" = movement."transactionId"
  AND movement."movementType" = 'IN'
  AND movement."transactionType" = 'STOCK_ADJUSTMENT';

UPDATE "StockMovement" movement
SET "inputUnitCost" = item."openingRate"
FROM "InventoryItem" item
WHERE item."id" = movement."inventoryItemId"
  AND movement."movementType" = 'IN'
  AND movement."transactionType" IN ('OPENING_STOCK', 'OPENING_STOCK_ADJUSTMENT', 'MIGRATION_OPENING');
