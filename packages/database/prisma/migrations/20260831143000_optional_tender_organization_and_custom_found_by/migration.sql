-- Organization is no longer collected on the direct Tender form, while
-- Search By / Found By can now store either a tenant user or a custom name.
ALTER TABLE "tenders"
  ALTER COLUMN "organizationMasterId" DROP NOT NULL,
  ADD COLUMN "foundByName" TEXT;
