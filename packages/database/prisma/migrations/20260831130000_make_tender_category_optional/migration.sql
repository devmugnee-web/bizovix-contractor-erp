-- Work Category is no longer collected when creating a tender. Existing values
-- remain unchanged; new tenders can be created without inventing a category.
ALTER TABLE "tenders"
  ALTER COLUMN "category" DROP NOT NULL;
