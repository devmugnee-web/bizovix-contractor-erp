-- Add budgetCategory field to ExpenseHead for mapping to canonical budget categories
ALTER TABLE "expense_heads" ADD COLUMN "budgetCategory" TEXT;

-- Index for efficient aggregation queries
CREATE INDEX "expense_heads_organizationId_budgetCategory_idx" ON "expense_heads"("organizationId", "budgetCategory");
