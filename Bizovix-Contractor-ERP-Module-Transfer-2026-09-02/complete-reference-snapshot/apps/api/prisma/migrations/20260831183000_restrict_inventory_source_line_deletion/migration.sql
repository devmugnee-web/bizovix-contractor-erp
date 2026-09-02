-- Inventory-line lineage is the authoritative bridge across PO/GRN/Bill and
-- SO/DN/Invoice/Return documents. Silently nulling that identity when a source
-- row is deleted makes quantity allocation, return costing, and MWA audit trails
-- ambiguous. Refuse the migration if pre-existing dangling values are found,
-- then protect every live source link with RESTRICT.
DO $$
DECLARE
  dangling_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO dangling_count
  FROM "VoucherInventoryItem" child
  LEFT JOIN "VoucherInventoryItem" source
    ON source."id" = child."sourceInventoryLineId"
  WHERE child."sourceInventoryLineId" IS NOT NULL
    AND source."id" IS NULL;

  IF dangling_count > 0 THEN
    RAISE EXCEPTION
      'Cannot protect VoucherInventoryItem source lineage: % dangling sourceInventoryLineId value(s) exist',
      dangling_count;
  END IF;
END $$;

ALTER TABLE "VoucherInventoryItem"
  DROP CONSTRAINT "VoucherInventoryItem_sourceInventoryLineId_fkey";

ALTER TABLE "VoucherInventoryItem"
  ADD CONSTRAINT "VoucherInventoryItem_sourceInventoryLineId_fkey"
  FOREIGN KEY ("sourceInventoryLineId")
  REFERENCES "VoucherInventoryItem"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
