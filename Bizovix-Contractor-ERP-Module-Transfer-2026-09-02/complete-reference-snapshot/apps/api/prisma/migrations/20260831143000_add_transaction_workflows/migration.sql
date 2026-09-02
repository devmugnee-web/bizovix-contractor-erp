-- Company workflow policy controls only how new root transactions start.
-- BOTH preserves all existing order-based capabilities and existing direct
-- sales, while making direct purchases available without rewriting history.
CREATE TYPE "TransactionWorkflowPolicy" AS ENUM ('DIRECT', 'ORDER_BASED', 'BOTH');
CREATE TYPE "VoucherWorkflowOrigin" AS ENUM ('DIRECT', 'ORDER_FLOW');

ALTER TABLE "Company"
  ADD COLUMN "purchaseWorkflow" "TransactionWorkflowPolicy" NOT NULL DEFAULT 'BOTH',
  ADD COLUMN "salesWorkflow" "TransactionWorkflowPolicy" NOT NULL DEFAULT 'BOTH';

ALTER TABLE "VoucherEntry"
  ADD COLUMN "workflowOrigin" "VoucherWorkflowOrigin" NOT NULL DEFAULT 'DIRECT';

-- The API accepts both a generic SALES/PURCHASE voucher plus documentKind and
-- dedicated enum voucher types. Canonicalize the latter so every posting and
-- lineage path sees the same document stage.
UPDATE "VoucherEntry"
SET "documentKind" = CASE "voucherType"
  WHEN 'PURCHASE_ORDER' THEN 'purchase-order'
  WHEN 'RECEIPT_NOTE' THEN 'receipt-note'
  WHEN 'QUOTATION' THEN 'quotation'
  WHEN 'PROFORMA_INVOICE' THEN 'proforma'
  WHEN 'SALES_ORDER' THEN 'sale-order'
  WHEN 'DELIVERY_NOTE' THEN 'delivery-note'
  ELSE "documentKind"
END
WHERE "documentKind" IS NULL
  AND "voucherType" IN ('PURCHASE_ORDER', 'RECEIPT_NOTE', 'QUOTATION', 'PROFORMA_INVOICE', 'SALES_ORDER', 'DELIVERY_NOTE');

-- Classify every historical order/fulfilment document and every financial
-- document linked to fulfilment as ORDER_FLOW. Standalone legacy bills and
-- invoices remain DIRECT. A legacy Sales Invoice linked straight to a Sales
-- Order also remains DIRECT because it, rather than a Delivery Note, moved the
-- stock; the service preserves that immutable classification on later edits.
-- No accounting, inventory, or Account row is touched.
UPDATE "VoucherEntry" AS voucher
SET "workflowOrigin" = 'ORDER_FLOW'
WHERE voucher."voucherType" IN ('PURCHASE_ORDER', 'RECEIPT_NOTE', 'SALES_ORDER', 'DELIVERY_NOTE')
   OR voucher."documentKind" IN ('purchase-order', 'receipt-note', 'sale-order', 'delivery-note')
   OR EXISTS (
     SELECT 1
     FROM "VoucherEntry" AS source
     WHERE source."id" = voucher."sourceVoucherId"
       AND source."workspaceId" = voucher."workspaceId"
       AND source."documentKind" IN ('receipt-note', 'delivery-note')
   );

-- Reversals intentionally do not retain sourceVoucherId (to avoid fulfilment
-- double-counting), and alterations can form revision chains. Inherit origin
-- through those immutable lineage links instead.
WITH RECURSIVE "orderFlowLineage"("id") AS (
  SELECT "id"
  FROM "VoucherEntry"
  WHERE "workflowOrigin" = 'ORDER_FLOW'

  UNION

  SELECT child."id"
  FROM "VoucherEntry" AS child
  JOIN "orderFlowLineage" AS parent
    ON child."reversalOfId" = parent."id"
    OR child."previousRevisionId" = parent."id"
)
UPDATE "VoucherEntry"
SET "workflowOrigin" = 'ORDER_FLOW'
WHERE "id" IN (SELECT "id" FROM "orderFlowLineage");

-- Enforce the per-voucher snapshot at the database boundary as well as in the
-- service. Status, lines, and other editable fields remain unaffected.
CREATE FUNCTION "preventVoucherWorkflowOriginChange"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."workflowOrigin" IS DISTINCT FROM OLD."workflowOrigin" THEN
    RAISE EXCEPTION 'Voucher workflow origin is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "VoucherEntry_workflowOrigin_immutable"
BEFORE UPDATE OF "workflowOrigin" ON "VoucherEntry"
FOR EACH ROW
EXECUTE FUNCTION "preventVoucherWorkflowOriginChange"();

-- Workflow validators and lineage screens always scope child lookups by
-- workspace and source. This index also keeps those checks predictable as a
-- company's voucher history grows.
CREATE INDEX "VoucherEntry_workspaceId_sourceVoucherId_idx"
ON "VoucherEntry"("workspaceId", "sourceVoucherId");
