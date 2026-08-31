-- A costing budget is established before detailed tender costing begins.
ALTER TABLE "tender_costings"
  ADD COLUMN "costingBudget" DECIMAL(18,2);

-- Preserve already-started historical costing workflows. New READY records
-- intentionally remain NULL until a user explicitly saves the budget.
UPDATE "tender_costings"
SET "costingBudget" = "estimatedValue"
WHERE "status" <> 'READY'
  AND "estimatedValue" > 0;

ALTER TABLE "tender_costings"
  ADD CONSTRAINT "tender_costings_budget_check"
  CHECK ("costingBudget" IS NULL OR "costingBudget" > 0);
