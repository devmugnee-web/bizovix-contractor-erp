ALTER TABLE "tender_costings"
  ADD COLUMN "lcContainerFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "lcContainerAllocationMethod" TEXT NOT NULL DEFAULT 'EQUAL';

ALTER TABLE "tender_costings"
  ADD CONSTRAINT "tender_costings_lcContainerAllocationMethod_check"
  CHECK ("lcContainerAllocationMethod" IN ('EQUAL', 'WEIGHT', 'VALUE'));
