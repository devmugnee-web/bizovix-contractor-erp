-- A Purchase Bill converted from a Receipt Note finalises cost, but must not
-- create a second stock quantity. Keep that price adjustment as a separate,
-- reversible valuation record tied to the physical receipt movement.
ALTER TABLE "StockMovement"
    ADD COLUMN "voidedAt" TIMESTAMP(3),
    ADD COLUMN "voidReason" TEXT;

CREATE INDEX "StockMovement_workspaceId_voidedAt_idx"
    ON "StockMovement"("workspaceId", "voidedAt");

CREATE TABLE "InventoryCostRevaluation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "sourceMovementId" TEXT NOT NULL,
    "sourceInventoryLineId" TEXT NOT NULL,
    "billingVoucherId" TEXT NOT NULL,
    "billingInventoryLineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "sourceUnitCost" DECIMAL(24,6) NOT NULL,
    "revisedUnitCost" DECIMAL(24,6) NOT NULL,
    "varianceAmount" DECIMAL(24,6) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reversedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCostRevaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryCostRevaluation_workspaceId_idempotencyKey_key"
    ON "InventoryCostRevaluation"("workspaceId", "idempotencyKey");
CREATE UNIQUE INDEX "InventoryCostRevaluation_billingVoucherId_billingInventoryLineId_sourceMovementId_key"
    ON "InventoryCostRevaluation"("billingVoucherId", "billingInventoryLineId", "sourceMovementId");
CREATE INDEX "InventoryCostRevaluation_workspaceId_inventoryItemId_isActive_idx"
    ON "InventoryCostRevaluation"("workspaceId", "inventoryItemId", "isActive");
CREATE INDEX "InventoryCostRevaluation_sourceMovementId_isActive_idx"
    ON "InventoryCostRevaluation"("sourceMovementId", "isActive");
CREATE INDEX "InventoryCostRevaluation_billingVoucherId_isActive_idx"
    ON "InventoryCostRevaluation"("billingVoucherId", "isActive");

ALTER TABLE "InventoryCostRevaluation"
    ADD CONSTRAINT "InventoryCostRevaluation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCostRevaluation"
    ADD CONSTRAINT "InventoryCostRevaluation_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCostRevaluation"
    ADD CONSTRAINT "InventoryCostRevaluation_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCostRevaluation"
    ADD CONSTRAINT "InventoryCostRevaluation_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCostRevaluation"
    ADD CONSTRAINT "InventoryCostRevaluation_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCostRevaluation"
    ADD CONSTRAINT "InventoryCostRevaluation_sourceMovementId_fkey"
    FOREIGN KEY ("sourceMovementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCostRevaluation"
    ADD CONSTRAINT "InventoryCostRevaluation_sourceInventoryLineId_fkey"
    FOREIGN KEY ("sourceInventoryLineId") REFERENCES "VoucherInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCostRevaluation"
    ADD CONSTRAINT "InventoryCostRevaluation_billingVoucherId_fkey"
    FOREIGN KEY ("billingVoucherId") REFERENCES "VoucherEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCostRevaluation"
    ADD CONSTRAINT "InventoryCostRevaluation_billingInventoryLineId_fkey"
    FOREIGN KEY ("billingInventoryLineId") REFERENCES "VoucherInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Legacy returns created before exact source-line enforcement can carry a null
-- source and a fallback warehouse. Repair only when one posted supplier bill,
-- and then one line within it, is uniquely identifiable from the full return.
WITH "ReturnBillCandidates" AS (
    SELECT purchase_return."id" AS "returnId", bill."id" AS "billId"
    FROM "VoucherEntry" purchase_return
    JOIN "VoucherEntry" bill
      ON bill."workspaceId" = purchase_return."workspaceId"
     AND bill."partyName" = purchase_return."partyName"
     AND bill."voucherType" = 'PURCHASE'
     AND bill."documentKind" = 'bill'
     AND bill."status" = 'POSTED'
     AND bill."voucherDate" <= purchase_return."voucherDate"
    WHERE purchase_return."voucherType" = 'DEBIT_NOTE'
      AND purchase_return."status" = 'POSTED'
      AND purchase_return."sourceVoucherId" IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM "VoucherInventoryItem" returned_line
          WHERE returned_line."voucherId" = purchase_return."id"
            AND NOT EXISTS (
                SELECT 1
                FROM "VoucherInventoryItem" bill_line
                WHERE bill_line."voucherId" = bill."id"
                  AND bill_line."inventoryItemId" IS NOT DISTINCT FROM returned_line."inventoryItemId"
                  AND bill_line."unitPrice" = returned_line."unitPrice"
                  AND bill_line."quantity" >= returned_line."quantity"
            )
      )
),
"UniqueReturnBills" AS (
    SELECT "returnId", MIN("billId") AS "billId"
    FROM "ReturnBillCandidates"
    GROUP BY "returnId"
    HAVING COUNT(*) = 1
)
UPDATE "VoucherEntry" purchase_return
SET "sourceVoucherId" = unique_bill."billId",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "UniqueReturnBills" unique_bill
WHERE purchase_return."id" = unique_bill."returnId";

WITH "ReturnLineCandidates" AS (
    SELECT
        returned_line."id" AS "returnedLineId",
        bill_line."id" AS "billLineId",
        bill_line."warehouseId"
    FROM "VoucherEntry" purchase_return
    JOIN "VoucherInventoryItem" returned_line ON returned_line."voucherId" = purchase_return."id"
    JOIN "VoucherInventoryItem" bill_line ON bill_line."voucherId" = purchase_return."sourceVoucherId"
    WHERE purchase_return."voucherType" = 'DEBIT_NOTE'
      AND purchase_return."status" = 'POSTED'
      AND bill_line."inventoryItemId" IS NOT DISTINCT FROM returned_line."inventoryItemId"
      AND bill_line."unitPrice" = returned_line."unitPrice"
      AND bill_line."quantity" >= returned_line."quantity"
),
"UniqueReturnLines" AS (
    SELECT
        "returnedLineId",
        MIN("billLineId") AS "billLineId",
        MIN("warehouseId") AS "warehouseId"
    FROM "ReturnLineCandidates"
    GROUP BY "returnedLineId"
    HAVING COUNT(*) = 1
)
UPDATE "VoucherInventoryItem" returned_line
SET "sourceInventoryLineId" = unique_line."billLineId",
    "warehouseId" = unique_line."warehouseId",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "UniqueReturnLines" unique_line
WHERE returned_line."id" = unique_line."returnedLineId";

-- A bill may aggregate one item across several Receipt Notes. Build a complete
-- allocation set from every exact GRN number stored in billReference. A bill
-- line's sourceInventoryLineId remains a convenient primary UI link, while the
-- revaluation rows below are the authoritative one-to-many cost allocation.
CREATE TEMP TABLE "_CompleteBillReceiptAllocations" ON COMMIT DROP AS
WITH "ReferencedReceiptNotes" AS (
    SELECT DISTINCT bill."id" AS "billId", receipt."id" AS "receiptId"
    FROM "VoucherEntry" bill
    JOIN "VoucherEntryLine" bill_gl ON bill_gl."voucherId" = bill."id"
    JOIN "VoucherEntry" receipt
      ON receipt."workspaceId" = bill."workspaceId"
     AND receipt."documentKind" = 'receipt-note'
     AND receipt."status" = 'POSTED'
     AND receipt."voucherNumber" = ANY (
        regexp_split_to_array(COALESCE(bill_gl."billReference", ''), '\\s*\\+\\s*')
     )
    WHERE bill."voucherType" = 'PURCHASE'
      AND bill."documentKind" = 'bill'
      AND bill."status" = 'POSTED'

    UNION

    SELECT bill."id", receipt."id"
    FROM "VoucherEntry" bill
    JOIN "VoucherEntry" receipt
      ON receipt."id" = bill."sourceVoucherId"
     AND receipt."workspaceId" = bill."workspaceId"
     AND receipt."documentKind" = 'receipt-note'
     AND receipt."status" = 'POSTED'
    WHERE bill."voucherType" = 'PURCHASE'
      AND bill."documentKind" = 'bill'
      AND bill."status" = 'POSTED'
),
"BillGross" AS (
    SELECT line."voucherId", SUM(line."quantity" * line."unitPrice") AS "grossValue"
    FROM "VoucherInventoryItem" line
    GROUP BY line."voucherId"
),
"Candidates" AS (
    SELECT DISTINCT
        bill_line."id" AS "billingInventoryLineId",
        bill_line."voucherId" AS "billingVoucherId",
        receipt_line."id" AS "sourceInventoryLineId",
        receipt_line."quantity" AS "allocatedQuantity",
        bill_line."quantity" AS "billedQuantity",
        bill_line."unitPrice" AS "billedUnitPrice",
        bill."tenantId",
        bill."companyId",
        bill."workspaceId",
        bill."voucherDate" AS "effectiveDate",
        bill."discountAmount",
        gross."grossValue",
        movement."id" AS "sourceMovementId",
        movement."warehouseId",
        movement."inventoryItemId",
        COALESCE(movement."inputUnitCost", movement."unitCost", 0) AS "sourceUnitCost"
    FROM "VoucherInventoryItem" bill_line
    JOIN "VoucherEntry" bill ON bill."id" = bill_line."voucherId"
    JOIN "ReferencedReceiptNotes" referenced ON referenced."billId" = bill."id"
    JOIN "VoucherInventoryItem" receipt_line ON receipt_line."voucherId" = referenced."receiptId"
    JOIN "BillGross" gross ON gross."voucherId" = bill."id"
    JOIN "StockMovement" movement
      ON movement."workspaceId" = bill."workspaceId"
     AND movement."transactionLineId" = receipt_line."id"
     AND movement."movementType" = 'IN'
     AND movement."reversalOfId" IS NULL
     AND movement."voidedAt" IS NULL
    WHERE bill."voucherType" = 'PURCHASE'
      AND bill."documentKind" = 'bill'
      AND bill."status" = 'POSTED'
      AND receipt_line."inventoryItemId" IS NOT DISTINCT FROM bill_line."inventoryItemId"
      AND receipt_line."warehouseId" IS NOT DISTINCT FROM bill_line."warehouseId"
      AND receipt_line."unitPrice" = bill_line."unitPrice"
),
"CompleteLines" AS (
    SELECT "billingInventoryLineId"
    FROM "Candidates"
    GROUP BY "billingInventoryLineId"
    HAVING SUM("allocatedQuantity") = MAX("billedQuantity")
)
SELECT candidate.*
FROM "Candidates" candidate
JOIN "CompleteLines" complete ON complete."billingInventoryLineId" = candidate."billingInventoryLineId";

WITH "UniqueBillSources" AS (
    SELECT
        "billingInventoryLineId",
        MIN("sourceInventoryLineId") AS "sourceInventoryLineId"
    FROM "_CompleteBillReceiptAllocations"
    GROUP BY "billingInventoryLineId"
    HAVING COUNT(*) = 1
)
UPDATE "VoucherInventoryItem" bill_line
SET "sourceInventoryLineId" = unique_source."sourceInventoryLineId",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "UniqueBillSources" unique_source
WHERE bill_line."id" = unique_source."billingInventoryLineId"
  AND bill_line."sourceInventoryLineId" IS DISTINCT FROM unique_source."sourceInventoryLineId";

INSERT INTO "InventoryCostRevaluation" (
    "id", "tenantId", "companyId", "workspaceId", "warehouseId", "inventoryItemId",
    "sourceMovementId", "sourceInventoryLineId", "billingVoucherId", "billingInventoryLineId",
    "quantity", "sourceUnitCost", "revisedUnitCost", "varianceAmount", "effectiveDate",
    "isActive", "idempotencyKey", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    allocation."tenantId",
    allocation."companyId",
    allocation."workspaceId",
    allocation."warehouseId",
    allocation."inventoryItemId",
    allocation."sourceMovementId",
    allocation."sourceInventoryLineId",
    allocation."billingVoucherId",
    allocation."billingInventoryLineId",
    allocation."allocatedQuantity",
    allocation."sourceUnitCost",
    ROUND(
        allocation."billedUnitPrice" *
        CASE
            WHEN allocation."grossValue" > 0
                THEN GREATEST(0, allocation."grossValue" - COALESCE(allocation."discountAmount", 0)) / allocation."grossValue"
            ELSE 1
        END,
        6
    ),
    ROUND(
        allocation."allocatedQuantity" * (
            allocation."billedUnitPrice" *
            CASE
                WHEN allocation."grossValue" > 0
                    THEN GREATEST(0, allocation."grossValue" - COALESCE(allocation."discountAmount", 0)) / allocation."grossValue"
                ELSE 1
            END - allocation."sourceUnitCost"
        ),
        6
    ),
    allocation."effectiveDate",
    true,
    'purchase-bill-revaluation:' || allocation."billingVoucherId" || ':' || allocation."billingInventoryLineId" || ':' || allocation."sourceMovementId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "_CompleteBillReceiptAllocations" allocation
ON CONFLICT DO NOTHING;

-- Force the next read/post/bootstrap replay to apply the new bill costs to all
-- later issues and returns in chronological order.
UPDATE "StockMovement" movement
SET "costingVersion" = 0
WHERE EXISTS (
    SELECT 1
    FROM "InventoryCostRevaluation" revaluation
    WHERE revaluation."sourceMovementId" = movement."id"
      AND revaluation."isActive" = true
);

-- Hard-deleted historical vouchers left physical movement facts without their
-- source document. Preserve those rows for audit, but exclude them from stock.
UPDATE "StockMovement" movement
SET "voidedAt" = CURRENT_TIMESTAMP,
    "voidReason" = 'Source voucher no longer exists; excluded by inventory integrity migration'
WHERE movement."voidedAt" IS NULL
  AND (
      movement."idempotencyKey" LIKE 'voucher:%'
      OR movement."idempotencyKey" LIKE 'reversal:%'
  )
  AND NOT EXISTS (
      SELECT 1
      FROM "VoucherEntry" voucher
      WHERE voucher."id" = movement."transactionId"
  );

-- The old warehouse migration snapshot combined opening quantity, posted
-- vouchers and adjustments in one MIGRATION_OPENING movement. It is redundant
-- only when every canonical physical voucher line and adjustment for that item
-- has exactly one active movement. Materialise the genuine item opening first,
-- then void (never delete) the aggregate snapshot for those proven-complete
-- items. Any ambiguous/incomplete item is retained for manual reconciliation.
CREATE TEMP TABLE "_EligibleMigrationOpening" ON COMMIT DROP AS
WITH "CandidateItems" AS (
    SELECT DISTINCT movement."workspaceId", movement."inventoryItemId"
    FROM "StockMovement" movement
    WHERE movement."transactionType" = 'MIGRATION_OPENING'
      AND movement."voidedAt" IS NULL
),
"CanonicalVoucherLines" AS (
    SELECT
        voucher."workspaceId",
        line."inventoryItemId",
        voucher."id" AS "voucherId",
        line."id" AS "lineId"
    FROM "VoucherInventoryItem" line
    JOIN "VoucherEntry" voucher ON voucher."id" = line."voucherId"
    JOIN "InventoryItem" item ON item."id" = line."inventoryItemId"
    WHERE voucher."status" = 'POSTED'
      AND item."kind" = 'PRODUCT'
      AND line."quantity" > 0
      AND COALESCE(voucher."documentKind", '') NOT IN ('purchase-order', 'sale-order', 'quotation', 'proforma')
      AND (
          voucher."voucherType" IN ('CREDIT_NOTE', 'DEBIT_NOTE', 'RECEIPT_NOTE', 'DELIVERY_NOTE')
          OR (
              voucher."voucherType" = 'PURCHASE'
              AND NOT EXISTS (
                  SELECT 1
                  FROM "VoucherEntry" source
                  WHERE source."id" = voucher."sourceVoucherId"
                    AND source."documentKind" = 'receipt-note'
              )
          )
          OR (
              voucher."voucherType" = 'SALES'
              AND NOT EXISTS (
                  SELECT 1
                  FROM "VoucherEntry" source
                  WHERE source."id" = voucher."sourceVoucherId"
                    AND source."documentKind" = 'delivery-note'
              )
          )
      )
),
"Eligible" AS (
    SELECT candidate."workspaceId", candidate."inventoryItemId"
    FROM "CandidateItems" candidate
    WHERE NOT EXISTS (
        SELECT 1
        FROM "CanonicalVoucherLines" line
        WHERE line."workspaceId" = candidate."workspaceId"
          AND line."inventoryItemId" = candidate."inventoryItemId"
          AND (
              SELECT COUNT(*)
              FROM "StockMovement" movement
              WHERE movement."workspaceId" = line."workspaceId"
                AND movement."inventoryItemId" = line."inventoryItemId"
                AND movement."transactionId" = line."voucherId"
                AND movement."transactionLineId" = line."lineId"
                AND movement."reversalOfId" IS NULL
                AND movement."voidedAt" IS NULL
          ) <> 1
    )
      AND NOT EXISTS (
        SELECT 1
        FROM "InventoryAdjustment" adjustment
        WHERE adjustment."workspaceId" = candidate."workspaceId"
          AND adjustment."inventoryItemId" = candidate."inventoryItemId"
          AND (
              SELECT COUNT(*)
              FROM "StockMovement" movement
              WHERE movement."workspaceId" = adjustment."workspaceId"
                AND movement."inventoryItemId" = adjustment."inventoryItemId"
                AND movement."transactionType" = 'STOCK_ADJUSTMENT'
                AND movement."transactionId" = adjustment."id"
                AND movement."reversalOfId" IS NULL
                AND movement."voidedAt" IS NULL
          ) <> 1
    )
)
SELECT * FROM "Eligible";

INSERT INTO "StockMovement" (
    "id", "tenantId", "companyId", "workspaceId", "warehouseId", "inventoryItemId",
    "transactionType", "transactionId", "transactionLineId", "referenceNo", "movementType",
    "quantity", "unit", "inputUnitCost", "costingVersion", "transactionDate", "idempotencyKey"
)
SELECT
    gen_random_uuid()::text,
    item."tenantId",
    item."companyId",
    item."workspaceId",
    warehouse."id",
    item."id",
    'OPENING_STOCK',
    item."id",
    item."id",
    item."itemCode",
    'IN'::"StockMovementType",
    item."openingQty",
    item."unit",
    item."openingRate",
    0,
    item."createdAt",
    'migration-distinct-opening:' || item."id"
FROM "_EligibleMigrationOpening" eligible
JOIN "InventoryItem" item
  ON item."workspaceId" = eligible."workspaceId"
 AND item."id" = eligible."inventoryItemId"
JOIN "Warehouse" warehouse
  ON warehouse."workspaceId" = item."workspaceId"
 AND warehouse."isDefault" = true
 AND warehouse."deletedAt" IS NULL
WHERE item."openingQty" > 0
  AND NOT EXISTS (
      SELECT 1
      FROM "StockMovement" opening
      WHERE opening."workspaceId" = item."workspaceId"
        AND opening."inventoryItemId" = item."id"
        AND opening."transactionType" = 'OPENING_STOCK'
        AND opening."reversalOfId" IS NULL
        AND opening."voidedAt" IS NULL
  )
ON CONFLICT DO NOTHING;

UPDATE "StockMovement" movement
SET "voidedAt" = CURRENT_TIMESTAMP,
    "voidReason" = 'Legacy aggregate opening replaced by complete canonical movements and distinct item opening'
FROM "_EligibleMigrationOpening" eligible
WHERE movement."workspaceId" = eligible."workspaceId"
  AND movement."inventoryItemId" = eligible."inventoryItemId"
  AND movement."transactionType" = 'MIGRATION_OPENING'
  AND movement."voidedAt" IS NULL;

UPDATE "StockMovement"
SET "costingVersion" = 0
WHERE "voidedAt" IS NULL;
