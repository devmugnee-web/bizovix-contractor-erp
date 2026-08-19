-- Sir-aligned simplification phase: Document Purchase captures a few more fields directly
-- (Category, Estimated Tender Amount already existed, Submission Date, Opening Date, Remarks)
-- so it can auto-create the internal Tender record without requiring a second, duplicate entry.
ALTER TABLE "document_purchases"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "submissionDate" TIMESTAMP(3),
  ADD COLUMN "openingDate" TIMESTAMP(3),
  ADD COLUMN "remarks" TEXT;
