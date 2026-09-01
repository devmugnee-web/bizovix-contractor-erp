ALTER TABLE "tender_costing_items"
  ADD COLUMN "foreignTransportCharge" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "customsDeclarationCharge" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "shippingWeightKg" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "shippingVolumeCbm" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN "shippingRateBasis" TEXT NOT NULL DEFAULT 'PER_CBM',
  ADD COLUMN "shippingRate" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN "domesticTransportCost" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "tender_costing_items"
  ADD CONSTRAINT "tender_costing_items_shippingRateBasis_check"
  CHECK ("shippingRateBasis" IN ('PER_CBM', 'PER_KG', 'FLAT')),
  ADD CONSTRAINT "tender_costing_items_foreignTransportCharge_check"
  CHECK ("foreignTransportCharge" >= 0),
  ADD CONSTRAINT "tender_costing_items_customsDeclarationCharge_check"
  CHECK ("customsDeclarationCharge" >= 0),
  ADD CONSTRAINT "tender_costing_items_shippingWeightKg_check"
  CHECK ("shippingWeightKg" >= 0),
  ADD CONSTRAINT "tender_costing_items_shippingVolumeCbm_check"
  CHECK ("shippingVolumeCbm" >= 0),
  ADD CONSTRAINT "tender_costing_items_shippingRate_check"
  CHECK ("shippingRate" >= 0),
  ADD CONSTRAINT "tender_costing_items_domesticTransportCost_check"
  CHECK ("domesticTransportCost" >= 0);
