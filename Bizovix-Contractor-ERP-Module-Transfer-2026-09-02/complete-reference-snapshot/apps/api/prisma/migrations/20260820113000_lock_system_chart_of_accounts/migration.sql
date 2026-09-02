-- The fixed Chart of Accounts is application infrastructure, not disposable
-- company master data. API guards provide friendly errors; this trigger is the
-- final boundary for direct Prisma/SQL scripts and bulk cleanup jobs.
CREATE OR REPLACE FUNCTION "protectSystemChartOfAccounts"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."isSystem" = TRUE THEN
    RAISE EXCEPTION 'Protected Chart of Accounts node "%" (%) cannot be deleted', OLD."name", OLD."code"
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."isSystem" = TRUE AND (
    NEW."isSystem" IS DISTINCT FROM OLD."isSystem" OR
    NEW."code" IS DISTINCT FROM OLD."code" OR
    NEW."name" IS DISTINCT FROM OLD."name" OR
    NEW."level" IS DISTINCT FROM OLD."level" OR
    NEW."parentId" IS DISTINCT FROM OLD."parentId" OR
    NEW."nature" IS DISTINCT FROM OLD."nature" OR
    NEW."accountGroupId" IS DISTINCT FROM OLD."accountGroupId" OR
    NEW."isControlAccount" IS DISTINCT FROM OLD."isControlAccount" OR
    NEW."status" IS DISTINCT FROM OLD."status"
  ) THEN
    RAISE EXCEPTION 'Protected Chart of Accounts node "%" (%) cannot be structurally modified', OLD."name", OLD."code"
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "lockSystemChartOfAccounts" ON "Account";
CREATE TRIGGER "lockSystemChartOfAccounts"
BEFORE UPDATE OR DELETE ON "Account"
FOR EACH ROW
EXECUTE FUNCTION "protectSystemChartOfAccounts"();

