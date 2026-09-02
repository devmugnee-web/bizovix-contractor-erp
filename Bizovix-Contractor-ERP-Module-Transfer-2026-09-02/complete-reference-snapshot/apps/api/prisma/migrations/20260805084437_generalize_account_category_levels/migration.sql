-- Collapse SUB_CATEGORY / CHILD_CATEGORY / SUB_CHILD_CATEGORY into a single
-- generic CATEGORY level, so a Category can nest under a Main Category or
-- another Category to unlimited depth instead of a fixed 4-level hierarchy.
-- MAIN_CATEGORY and LEDGER are unaffected.
--
-- Postgres has no ALTER TYPE ... DROP VALUE, so the enum is recreated:
-- rename the old type out of the way, create the new one with the final
-- value set, migrate the column (collapsing the three removed values into
-- CATEGORY) via a USING cast, then drop the old type.

ALTER TYPE "AccountLevel" RENAME TO "AccountLevel_old";

CREATE TYPE "AccountLevel" AS ENUM ('MAIN_CATEGORY', 'CATEGORY', 'LEDGER');

ALTER TABLE "Account" ALTER COLUMN "level" DROP DEFAULT;

ALTER TABLE "Account"
  ALTER COLUMN "level" TYPE "AccountLevel"
  USING (
    CASE "level"::text
      WHEN 'SUB_CATEGORY' THEN 'CATEGORY'
      WHEN 'CHILD_CATEGORY' THEN 'CATEGORY'
      WHEN 'SUB_CHILD_CATEGORY' THEN 'CATEGORY'
      ELSE "level"::text
    END
  )::"AccountLevel";

ALTER TABLE "Account" ALTER COLUMN "level" SET DEFAULT 'LEDGER'::"AccountLevel";

DROP TYPE "AccountLevel_old";
