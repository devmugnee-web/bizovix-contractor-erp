-- Replace Work IOU's cross-entity single-column foreign keys with tenant-aware
-- composite foreign keys. The organization foreign keys remain in place.
ALTER TABLE "work_ious"
  DROP CONSTRAINT "work_ious_tenderId_fkey",
  DROP CONSTRAINT "work_ious_workId_fkey";

ALTER TABLE "work_iou_items"
  DROP CONSTRAINT "work_iou_items_workIouId_fkey",
  DROP CONSTRAINT "work_iou_items_expenseHeadId_fkey";

ALTER TABLE "work_iou_attachments"
  DROP CONSTRAINT "work_iou_attachments_workIouId_fkey";

CREATE UNIQUE INDEX "tenders_organizationId_id_key"
  ON "tenders"("organizationId", "id");

CREATE UNIQUE INDEX "cms_works_organizationId_id_key"
  ON "cms_works"("organizationId", "id");

CREATE UNIQUE INDEX "expense_heads_organizationId_id_key"
  ON "expense_heads"("organizationId", "id");

CREATE UNIQUE INDEX "work_ious_organizationId_id_key"
  ON "work_ious"("organizationId", "id");

ALTER TABLE "work_ious"
  ADD CONSTRAINT "work_ious_organizationId_tenderId_fkey"
    FOREIGN KEY ("organizationId", "tenderId")
    REFERENCES "tenders"("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_ious_organizationId_workId_fkey"
    FOREIGN KEY ("organizationId", "workId")
    REFERENCES "cms_works"("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_iou_items"
  ADD CONSTRAINT "work_iou_items_organizationId_workIouId_fkey"
    FOREIGN KEY ("organizationId", "workIouId")
    REFERENCES "work_ious"("organizationId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_iou_items_organizationId_expenseHeadId_fkey"
    FOREIGN KEY ("organizationId", "expenseHeadId")
    REFERENCES "expense_heads"("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_iou_attachments"
  ADD CONSTRAINT "work_iou_attachments_organizationId_workIouId_fkey"
    FOREIGN KEY ("organizationId", "workIouId")
    REFERENCES "work_ious"("organizationId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
