ALTER TABLE "tender_costing_items"
  ADD COLUMN "foreignShippingMethod" TEXT NOT NULL DEFAULT 'LC_SEA',
  ADD COLUMN "foreignShippingProvider" TEXT,
  ADD COLUMN "foreignDoorToDoorCharge" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "foreignImportDutyIncluded" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "foreignTransitDays" INTEGER,
  ADD COLUMN "foreignShippingReference" TEXT;

ALTER TABLE "tender_costing_items"
  ADD CONSTRAINT "tender_costing_items_foreignShippingMethod_check"
  CHECK (
    "foreignShippingMethod" IN (
      'DOOR_TO_DOOR_SEA',
      'DOOR_TO_DOOR_AIR',
      'LC_SEA',
      'LC_AIR'
    )
  );

ALTER TABLE "tender_costing_items"
  ADD CONSTRAINT "tender_costing_items_foreignTransitDays_check"
  CHECK ("foreignTransitDays" IS NULL OR "foreignTransitDays" > 0);

ALTER TABLE "tender_costing_items"
  ADD CONSTRAINT "tender_costing_items_foreignDoorToDoorCharge_check"
  CHECK ("foreignDoorToDoorCharge" >= 0);
