-- Two-stage tender item costing: intake first, then Local/Foreign landed costing.
ALTER TABLE "tender_costing_items"
  ADD COLUMN "sourcingType" TEXT NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN "costingStatus" TEXT NOT NULL DEFAULT 'NOT_COSTED',
  ADD COLUMN "selectedSource" TEXT,
  ADD COLUMN "localSupplierName" TEXT,
  ADD COLUMN "localUnitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "localDiscountPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "localVatPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "localTaxPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "localTransportCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "localOtherCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "localTotalCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "foreignSupplierName" TEXT,
  ADD COLUMN "foreignCountry" TEXT,
  ADD COLUMN "foreignCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "foreignUnitPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN "foreignExchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN "exchangeRateDate" TIMESTAMP(3),
  ADD COLUMN "foreignFreightCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "foreignInsuranceCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "customsDutyPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "regulatoryDutyPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "supplementaryDutyPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "foreignVatPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "foreignTaxPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "cnfCharge" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "portHandlingCharge" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "bankLcCharge" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "foreignLocalTransportCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "foreignOtherCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "foreignProductValueBdt" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "foreignLandedCost" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- Existing rows remain usable as Local legacy costings.
UPDATE "tender_costing_items"
SET
  "costingStatus" = CASE WHEN "unitCost" > 0 THEN 'COSTED' ELSE 'NOT_COSTED' END,
  "selectedSource" = CASE WHEN "unitCost" > 0 THEN 'LOCAL' ELSE NULL END,
  "localUnitPrice" = "unitCost",
  "localTotalCost" = "totalCost";

ALTER TABLE "tender_costing_items"
  ADD CONSTRAINT "tender_costing_items_sourcing_check" CHECK (
    "sourcingType" IN ('LOCAL', 'FOREIGN', 'LOCAL_AND_FOREIGN')
    AND "costingStatus" IN ('NOT_COSTED', 'DRAFT', 'COSTED')
    AND ("selectedSource" IS NULL OR "selectedSource" IN ('LOCAL', 'FOREIGN'))
    AND ("sourcingType" <> 'LOCAL' OR "selectedSource" IS NULL OR "selectedSource" = 'LOCAL')
    AND ("sourcingType" <> 'FOREIGN' OR "selectedSource" IS NULL OR "selectedSource" = 'FOREIGN')
  ),
  ADD CONSTRAINT "tender_costing_items_source_values_check" CHECK (
    "localUnitPrice" >= 0
    AND "localDiscountPercent" BETWEEN 0 AND 100
    AND "localVatPercent" BETWEEN 0 AND 100
    AND "localTaxPercent" BETWEEN 0 AND 100
    AND "localTransportCost" >= 0
    AND "localOtherCost" >= 0
    AND "localTotalCost" >= 0
    AND "foreignUnitPrice" >= 0
    AND "foreignExchangeRate" > 0
    AND "foreignFreightCost" >= 0
    AND "foreignInsuranceCost" >= 0
    AND "customsDutyPercent" BETWEEN 0 AND 100
    AND "regulatoryDutyPercent" BETWEEN 0 AND 100
    AND "supplementaryDutyPercent" BETWEEN 0 AND 100
    AND "foreignVatPercent" BETWEEN 0 AND 100
    AND "foreignTaxPercent" BETWEEN 0 AND 100
    AND "cnfCharge" >= 0
    AND "portHandlingCharge" >= 0
    AND "bankLcCharge" >= 0
    AND "foreignLocalTransportCost" >= 0
    AND "foreignOtherCost" >= 0
    AND "foreignProductValueBdt" >= 0
    AND "foreignLandedCost" >= 0
  );
